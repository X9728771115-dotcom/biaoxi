import {readFile,writeFile,mkdir,rename,unlink,stat} from 'node:fs/promises';
import {join,basename,extname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {extractLegacyDoc} from '../core/legacy-doc.js';

const VERSION=1,MAX_SOURCE_BYTES=100*1024*1024,MAX_FILE_BYTES=50*1024*1024,MAX_TOTAL_BYTES=200*1024*1024,MAX_ENTRIES=200;
const SIGNATURE=Buffer.from('d0cf11e0a1b11ae1','hex');
const READABLE=new Set(['pdf','doc','docx','xlsx','xls','txt','md','markdown','csv','png','jpg','jpeg','webp','bmp','tiff','tif']);
const ARCHIVES=new Set(['rar','zip']);
const guards=new Map();
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const abort=signal=>{if(signal?.aborted)throw new DOMException('附件读取已取消','AbortError');};
const empty=()=>({documents:[],inventory:[],warnings:[],version:VERSION});
const safeName=value=>basename(String(value||'未命名附件').replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,255)||'未命名附件';
const generatedPath=(store,id)=>join(store.folders.uploads,`embedded-${id}`);
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
const archiveReader=async(...args)=>(await import('../core/archive-reader.js')).readArchiveEntries(...args);

async function atomicWrite(path,bytes,signal){
 const temporary=path+'.'+randomUUID()+'.tmp';
 try{abort(signal);await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});abort(signal);await rename(temporary,path);}
 finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}

async function readManifest(path,parent,sourceSHA){
 try{
  const record=JSON.parse(await readFile(path,'utf8'));
  if(record.version!==VERSION||record.parentDocumentId!==parent.id||record.parentSHA256!==sourceSHA||!Array.isArray(record.inventory)||!Array.isArray(record.documentIds))return null;
  const entries=record.inventory;
  if(entries.length>MAX_ENTRIES||record.documentIds.length>MAX_ENTRIES||entries.some(entry=>entry.documentId&&!validId(entry.documentId)))return null;
  return record;
 }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
}

async function cachedDocuments(record,store,parent,signal){
 if(!record?.cacheable)return null;
 const leaves=record.inventory.filter(item=>item.status==='ready'&&READABLE.has(item.format)&&item.documentId).map(item=>item.documentId);
 if(JSON.stringify(record.documentIds)!==JSON.stringify(leaves))return null;
 const documents=new Map();
 for(const item of record.inventory){
  abort(signal);if(!item.documentId)continue;
  try{
   const doc=await store.getDocument(item.documentId),expectedPath=generatedPath(store,doc.id);
   if(doc.role!=='attachment'||doc.companyId||doc.rootDocumentId!==parent.id||doc.parentDocumentId!==item.parentDocumentId||doc.sha256!==item.sha256||doc.byteSize!==item.bytes||doc.fileName!==safeName(item.name)||doc.derivedFrom?.sourceKey!==item.sourceKey||resolve(doc.path)!==resolve(expectedPath))return null;
   const information=await stat(expectedPath);if(!information.isFile()||information.size!==item.bytes||information.size>MAX_FILE_BYTES)return null;
   const bytes=await readFile(expectedPath);abort(signal);if(sha(bytes)!==item.sha256)return null;
   documents.set(doc.id,doc);
  }catch(error){if(error.name==='AbortError')throw error;if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
 }
 if(record.documentIds.some(id=>!documents.has(id)))return null;
 return record.documentIds.map(id=>documents.get(id));
}

/** Save independent originals first. Extraction and report assembly stay with the service. */
export async function ensureEmbeddedAttachments(parent,{store,signal,onProgress,readArchiveEntriesImpl=archiveReader}={}){
 abort(signal);
 if(parent?.role!=='tender'||extname(parent?.fileName||'').toLowerCase()!=='.doc')return empty();
 if(!store?.root||!store?.folders?.uploads||!store?.folders?.documents||!validId(parent?.id))throw new Error('内嵌附件缺少有效的原件或存储位置');
 const information=await stat(parent.path);abort(signal);
 if(information.size>MAX_SOURCE_BYTES)return{...empty(),warnings:[{code:'DOC_EMBEDDED_LIMIT',documentId:parent.id,message:'DOC原件超出附件读取大小限制，内嵌附件仍未读取。'}]};
 const source=await readFile(parent.path);abort(signal);
 if(source.length<8||!source.subarray(0,8).equals(SIGNATURE))return empty();
 const sourceSHA=sha(source),directory=join(store.root,'embedded'),key=sha(Buffer.from(JSON.stringify([resolve(store.root),parent.id,sourceSHA,VERSION]))),manifestPath=join(directory,key+'.json');
 const prior=guards.get(key)||Promise.resolve();
 const pending=prior.catch(()=>{}).then(async()=>{
  abort(signal);
  const previous=await readManifest(manifestPath,parent,sourceSHA),cached=await cachedDocuments(previous,store,parent,signal);
  if(cached)return{documents:cached,inventory:previous.inventory,warnings:previous.warnings||[],version:VERSION};
  const inventory=[],documents=[],warnings=[],created=[];let cacheable=true,totalBytes=0,entryCount=0,manifestCommitted=false;
  const previousItems=new Map((previous?.inventory||[]).filter(item=>item.sourceKey).map(item=>[item.sourceKey,item]));
  const warn=(code,message,item,extra={})=>warnings.push({code,message,documentId:item?.documentId||parent.id,parentDocumentId:item?.parentDocumentId||parent.id,...(item?.sourceStream?{sourceStream:item.sourceStream}:{}),...extra});
  const persist=async(item,payload)=>{
   abort(signal);const digest=sha(payload),old=previousItems.get(item.sourceKey);let id=old?.sha256===digest&&validId(old.documentId)?old.documentId:randomUUID();
   const fileName=safeName(item.name);
   let existing;try{existing=await store.getDocument(id);}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
   const compatible=existing?.derivedFrom?.sourceKey===item.sourceKey&&existing.sha256===digest&&existing.rootDocumentId===parent.id&&existing.parentDocumentId===item.parentDocumentId&&existing.role==='attachment'&&!existing.companyId;
   if(existing&&!compatible){id=randomUUID();existing=undefined;}
   const path=generatedPath(store,id);
   const doc={...(compatible?existing:{}),id,fileName,name:fileName,path,role:'attachment',byteSize:payload.length,sha256:digest,parentDocumentId:item.parentDocumentId,rootDocumentId:parent.id,sourceStream:item.sourceStream,...(item.archiveEntry?{archiveEntry:item.archiveEntry}:{}),sourcePath:item.path,derivedFrom:{version:VERSION,rootDocumentId:parent.id,parentDocumentId:item.parentDocumentId,parentSHA256:sourceSHA,sourceKey:item.sourceKey,sourceStream:item.sourceStream,...(item.archiveEntry?{archiveEntry:item.archiveEntry}:{})},createdAt:compatible?existing.createdAt:new Date().toISOString(),status:compatible?existing.status:'queued'};
   const createdItem=!existing?{id,path,sha256:digest,sourceKey:item.sourceKey,parentDocumentId:item.parentDocumentId,published:false}:null;
   if(createdItem)created.push(createdItem);
   await atomicWrite(path,payload,signal);abort(signal);await store.saveDocument(doc);if(createdItem)createdItem.published=true;abort(signal);
   Object.assign(item,{documentId:id,sha256:digest,bytes:payload.length});return doc;
  };
  const consume=async(entry,parentDocumentId,sourceStream,chain,depth=0,fromArchive=false)=>{
   abort(signal);const name=String(entry.name||'未命名附件'),format=String(entry.format||extname(name).slice(1)||'unknown').toLowerCase(),path=[parent.fileName,...chain,name].join(' / ');
   const item={name,fileName:safeName(name),format,bytes:Number.isSafeInteger(entry.bytes)&&entry.bytes>=0?entry.bytes:0,parentDocumentId,rootDocumentId:parent.id,sourceStream,path,status:entry.status||'ready',sourceKey:sha(Buffer.from(JSON.stringify([parent.id,sourceSHA,sourceStream,...chain,name]))),...(fromArchive?{archiveEntry:name,containerDocumentId:parentDocumentId}:{})};
   inventory.push(item);
   if(++entryCount>MAX_ENTRIES){item.status='blocked';item.reason='附件数量超出安全限制';cacheable=false;warn('DOC_EMBEDDED_LIMIT',`${path}：${item.reason}，仍未读取。`,item);return item;}
   if(entry.status==='directory'){item.status='directory';return item;}
   if(entry.status==='unsupported'||entry.status==='blocked'){
    item.reason=entry.reason||'该附件尚未读取';if(entry.status==='blocked')cacheable=false;
    warn(entry.status==='blocked'?'DOC_EMBEDDED_BLOCKED':'DOC_EMBEDDED_UNSUPPORTED',`${path}：${item.reason}。`,item);return item;
   }
   const payload=entry.payload;
   if(!Buffer.isBuffer(payload)||payload.length!==item.bytes||payload.length>MAX_FILE_BYTES||totalBytes+payload.length>MAX_TOTAL_BYTES){
    item.status='blocked';item.reason=!Buffer.isBuffer(payload)?'未取得实际附件原字节':payload.length!==item.bytes?'附件长度与封装清单不一致':'附件超出读取大小限制';cacheable=false;warn('DOC_EMBEDDED_UNREAD',`${path}：${item.reason}，仍未读取。`,item);return item;
   }
   totalBytes+=payload.length;
   // Every native payload is preserved, including an unsupported original. Archive
   // readers deliberately omit payloads for DWG and other unsupported members.
   onProgress?.({message:`保存内嵌附件 ${name}`});abort(signal);
   const doc=await persist(item,payload);
   if(ARCHIVES.has(format)){
    const children=[];
    if(depth>=2){item.status='blocked';item.complete=false;item.reason='内嵌归档层级超出限制';cacheable=false;warn('DOC_EMBEDDED_LIMIT',`${path}：${item.reason}，仍未展开。`,item);return item;}
    let archive;
    try{onProgress?.({message:`展开内嵌归档 ${name}`});abort(signal);archive=await readArchiveEntriesImpl(payload,{fileName:name,signal});abort(signal);}
    catch(error){abort(signal);if(error.name==='AbortError')throw error;archive={entries:[],warnings:[{code:'ARCHIVE_READ_FAILED',message:`${name}归档读取失败：${error.message}，内容仍未读取。`}],complete:false,reader:null};}
    for(const warning of archive.warnings||[])warn(warning.code||'ARCHIVE_READ_FAILED',warning.message||`${name}归档读取未完成。`,item,{containerDocumentId:doc.id});
    item.reader=archive.reader||null;
    if(!Array.isArray(archive.entries)||archive.entries.length>MAX_ENTRIES-entryCount){item.status='blocked';item.complete=false;item.reason='归档清单无效或文件数超出限制';cacheable=false;warn('DOC_EMBEDDED_LIMIT',`${path}：${item.reason}。`,item);return item;}
    for(const child of archive.entries)children.push(await consume(child,doc.id,sourceStream,[...chain,name],depth+1,true));
    item.complete=archive.complete===true&&children.every(child=>child.status==='ready'||child.status==='directory');
    item.status=item.complete?'ready':children.length?'partial':'blocked';
    if(!item.complete){item.reason='归档含未读取内容';if(!children.length||children.some(child=>child.status==='blocked'))cacheable=false;if(!(archive.warnings||[]).length&&!children.some(child=>child.status!=='ready'&&child.status!=='directory'))warn('DOC_EMBEDDED_UNREAD',`${path}仍有未读取内容。`,item);}
   }else if(READABLE.has(format)){item.status='ready';documents.push(doc);}
   else{item.status='unsupported';item.reason=`${format.toUpperCase()}格式尚未解析`;warn('DOC_EMBEDDED_UNSUPPORTED',`${path}：${item.reason}，原文件已保存。`,item);}
   return item;
  };
  try{
   onProgress?.({message:`检查 ${parent.fileName} 的内嵌附件`});abort(signal);
   let legacy;
   try{legacy=await extractLegacyDoc(source,{signal,includeAttachmentPayloads:true});abort(signal);}
   catch(error){abort(signal);if(error.name==='AbortError')throw error;return{...empty(),warnings:[{code:'DOC_EMBEDDED_READ_FAILED',documentId:parent.id,message:`内嵌附件未能读取：${error.message}`} ]};}
   for(const entry of legacy.attachments||[]){
    if(entryCount>=MAX_ENTRIES){cacheable=false;const remainder={name:'其余内嵌附件',fileName:'其余内嵌附件',parentDocumentId:parent.id,rootDocumentId:parent.id,status:'blocked',reason:'附件数量超出安全限制，剩余附件未读取'};inventory.push(remainder);warn('DOC_EMBEDDED_LIMIT',remainder.reason,remainder);break;}
    await consume(entry,parent.id,entry.sourceStream,[]);
   }
   if(!inventory.length)return empty();
   abort(signal);await mkdir(directory,{recursive:true});abort(signal);
   const record={version:VERSION,parentDocumentId:parent.id,parentSHA256:sourceSHA,createdAt:new Date().toISOString(),inventory,documentIds:documents.map(doc=>doc.id),warnings,cacheable};
   await atomicWrite(manifestPath,JSON.stringify(record,null,2),signal);manifestCommitted=true;abort(signal);
   return{documents,inventory,warnings,version:VERSION};
  }catch(error){
   // Recheck published originals: another operation may have claimed or changed
   // a newly created child while archive reading was in progress.
   for(const item of created)try{
    let current;try{current=await store.getDocument(item.id);}catch(readError){if(readError.code!=='ENOENT')throw readError;}
    if(!current){if(!item.published&&sha(await readFile(item.path))===item.sha256)await unlink(item.path);continue;}
    if(current.companyId||current.role!=='attachment'||current.rootDocumentId!==parent.id||current.parentDocumentId!==item.parentDocumentId||current.sha256!==item.sha256||resolve(current.path)!==resolve(item.path)||current.derivedFrom?.sourceKey!==item.sourceKey||current.derivedFrom?.parentSHA256!==sourceSHA)continue;
    if(sha(await readFile(item.path))!==item.sha256)continue;
    if(JSON.stringify(await store.getDocument(item.id))!==JSON.stringify(current))continue;
    await unlink(item.path);await unlink(join(store.folders.documents,item.id+'.json'));
   }catch{/* Preserve changed or unreadable records instead of guessing ownership. */}
   if(manifestCommitted)await unlink(manifestPath).catch(()=>{});
   throw error;
  }
 });
 guards.set(key,pending);try{return await pending;}finally{if(guards.get(key)===pending)guards.delete(key);}
}
