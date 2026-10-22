import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const bytes=Buffer.from('synthetic policy source, not an official document');
const source={id:'synthetic',url:'https://gks.mof.gov.cn/example.pdf',localFile:'official/example.pdf',sha256:createHash('sha256').update(bytes).digest('hex')};
async function fixture(run){const directory=await mkdtemp(join(tmpdir(),'biaoxi-policy-cache-'));try{await run(directory);}finally{await rm(directory,{recursive:true,force:true});}}
const load=()=>import('../scripts/cache-policy-sources.mjs');

test('explicit policy source caching verifies original bytes before saving',async()=>fixture(async directory=>{
 const {cachePolicySources}=await load();let calls=0;
 const result=await cachePolicySources({sources:[source],cacheDir:directory,fetchImpl:async(url,options)=>{calls++;assert.equal(url,source.url);assert.equal(options.redirect,'manual');return new Response(bytes);}});
 assert.equal(calls,1);assert.equal(result.length,1);assert.equal(result[0].sha256,source.sha256);
 assert.deepEqual(await readFile(join(directory,'example.pdf')),bytes);
}));

test('a verified existing cache is reused without fetching or replacing it',async()=>fixture(async directory=>{
 const {cachePolicySources}=await load();await writeFile(join(directory,'example.pdf'),bytes);
 let calls=0;const result=await cachePolicySources({sources:[source],cacheDir:directory,fetchImpl:async()=>{calls++;return new Response('unexpected update');}});
 assert.equal(calls,0);assert.equal(result[0].cacheStatus,'existing');
 assert.deepEqual(await readFile(join(directory,'example.pdf')),bytes);
}));

test('a different existing cache is preserved even when the remote matches the pinned hash',async()=>fixture(async directory=>{
 const {cachePolicySources}=await load();const different=Buffer.from('existing local source awaiting review');await writeFile(join(directory,'example.pdf'),different);
 await assert.rejects(cachePolicySources({sources:[source],cacheDir:directory,fetchImpl:async()=>new Response(bytes)}),/CACHE_CONFLICT/);
 assert.deepEqual(await readFile(join(directory,'example.pdf')),different);
}));

test('changed remote bytes do not create a cache file',async()=>fixture(async directory=>{
 const {cachePolicySources}=await load();
 await assert.rejects(cachePolicySources({sources:[source],cacheDir:directory,fetchImpl:async()=>new Response('unexpected update')}),/HASH_MISMATCH/);
 await assert.rejects(access(join(directory,'example.pdf')));
}));

test('policy source caching rejects redirects and oversized responses',async()=>fixture(async directory=>{
 const {cachePolicySources}=await load();
 await assert.rejects(cachePolicySources({sources:[source],cacheDir:directory,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://example.test'}})}),/HTTP_302/);
 await assert.rejects(cachePolicySources({sources:[source],cacheDir:directory,maxBytes:4,fetchImpl:async()=>new Response(bytes)}),/SIZE_LIMIT/);
 await assert.rejects(access(join(directory,'example.pdf')));
}));

test('policy source caching cannot fetch arbitrary hosts or escape its cache directory',async()=>fixture(async directory=>{
 const {cachePolicySources}=await load();let calls=0;const fetchImpl=async()=>{calls++;return new Response(bytes);};
 await assert.rejects(cachePolicySources({sources:[{...source,url:'https://example.test/source'}],cacheDir:directory,fetchImpl}),/SOURCE_URL/);
 await assert.rejects(cachePolicySources({sources:[{...source,localFile:'official/../../outside.pdf'}],cacheDir:directory,fetchImpl}),/SOURCE_PATH/);
 assert.equal(calls,0);
}));

test('public policy source manifest retains provenance while raw originals are excluded',async()=>{
 const policy=JSON.parse(await readFile(new URL('../assets/policies/cn-gpp-2019-2025.1.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(await readFile(new URL('../third_party/policy-source-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.originalsBundled,false);assert.equal(manifest.sources.length,6);
 for(const source of policy.sources){
  const record=manifest.sources.find(row=>row.id===source.id);
  assert.equal(record.url,source.url);assert.equal(record.sha256,source.sha256);assert.equal(record.distribution,'not-bundled');
  await assert.rejects(access(new URL('../assets/policies/'+source.localFile,import.meta.url)));
 }
 await assert.rejects(access(new URL('../assets/policies/qa/contact-sheet.jpg',import.meta.url)));
});
