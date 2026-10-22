import {readFile,mkdir,writeFile,link,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const defaults=JSON.parse(await readFile(new URL('../assets/policies/cn-gpp-2019-2025.1.json',import.meta.url),'utf8')).sources;

// Explicit, opt-in developer download. Application startup never imports this script.
export async function cachePolicySources({sources=defaults,cacheDir=join(root,'policy-source-cache'),fetchImpl=fetch,maxBytes=10*1024*1024}={}){
 const results=[];
 for(const source of sources){
  const url=new URL(source.url);
  if(url.protocol!=='https:'||url.hostname!=='gks.mof.gov.cn'||url.username||url.password||url.port)throw new Error('SOURCE_URL: '+source.id);
  if(!/^official\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(source.localFile)||!(/^[a-f0-9]{64}$/i).test(source.sha256))throw new Error('SOURCE_PATH: '+source.id);
  const name=source.localFile.slice('official/'.length),destination=join(cacheDir,name);
  async function existingCache(){
   let existing;try{existing=await readFile(destination);}catch(error){if(error.code==='ENOENT')return null;throw error;}
   if(createHash('sha256').update(existing).digest('hex')!==source.sha256)throw new Error('CACHE_CONFLICT: '+source.id+'; existing local bytes preserved for manual review');
   return {id:source.id,file:name,bytes:existing.length,sha256:source.sha256,cacheStatus:'existing'};
  }
  const existing=await existingCache();if(existing){results.push(existing);continue;}
  const response=await fetchImpl(source.url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok){await response.body?.cancel();throw new Error('HTTP_'+response.status+': '+source.id);}
  if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw new Error('SIZE_LIMIT: '+source.id);}
  if(!response.body)throw new Error('EMPTY_SOURCE: '+source.id);
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();throw new Error('SIZE_LIMIT: '+source.id);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks,length),sha256=createHash('sha256').update(bytes).digest('hex');
  if(!length||sha256!==source.sha256)throw new Error('HASH_MISMATCH: '+source.id+'; current official bytes require manual review, not automatic snapshot replacement');
  await mkdir(cacheDir,{recursive:true});
  const temporary=destination+'.'+randomUUID()+'.tmp';let cacheStatus='downloaded';
  try{
   await writeFile(temporary,bytes,{flag:'wx'});
   try{await link(temporary,destination);}catch(error){if(error.code!=='EEXIST')throw error;if(!await existingCache())throw new Error('CACHE_CONFLICT: '+source.id);cacheStatus='existing';}
  }finally{await rm(temporary,{force:true});}
  results.push({id:source.id,file:name,bytes:length,sha256,cacheStatus});
 }
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 cachePolicySources().then(results=>console.log(JSON.stringify({cacheDirectory:'policy-source-cache',sources:results},null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
