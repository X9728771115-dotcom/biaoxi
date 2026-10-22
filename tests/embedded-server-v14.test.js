import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {createStore} from '../src/server/store.js';
import {createLegacyDocFixture as fixture,createLegacyNativeObject as nativeObject} from './fixtures/legacy-doc-fixture.js';

let module;
try{module=await import('../src/server/embedded.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const ensure=(...args)=>{assert.equal(typeof module?.ensureEmbeddedAttachments,'function','派生附件存储能力应可调用');return module.ensureEmbeddedAttachments(...args);};
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const pdfA=Buffer.from('%PDF-1.7\nindependent package A\n'),pdfB=Buffer.from('%PDF-1.7\nindependent package B\n');
async function setup(t,objects=[nativeObject('包件2.pdf',pdfA),nativeObject('包件3.pdf',pdfB)]){
 const root=await mkdtemp(join(tmpdir(),'biaoxi-embedded-server-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=await createStore(root),bytes=fixture({objects}),parent={id:randomUUID(),fileName:'采购原件.doc',role:'tender',path:join(store.folders.uploads,randomUUID()),status:'ready',extraction:{id:'old-cached-main',blocks:[{id:'old',text:'已经缓存的正文'}],complete:false}};
 await writeFile(parent.path,bytes);await store.saveDocument(parent);
 return{root,store,parent,bytes};
}
const flatten=items=>items.flatMap(item=>[item,...flatten(item.children||[])]);

test('OLE attachments persist exact original bytes with independent document identities and never alter parent metadata',async t=>{
 const{store,parent,bytes}=await setup(t),before=await readFile(join(store.folders.documents,parent.id+'.json'),'utf8');
 const result=await ensure(parent,{store});
 assert.equal(result.version,1);assert.equal(result.documents.length,2);
 assert.equal(new Set(result.documents.map(doc=>doc.id)).size,2);
 for(const[doc,expected]of result.documents.map((doc,index)=>[doc,[pdfA,pdfB][index]])){
  assert.notEqual(doc.id,parent.id);assert.equal(doc.role,'attachment');assert.equal(doc.parentDocumentId,parent.id);assert.equal(doc.rootDocumentId,parent.id);
  assert.equal(doc.sha256,sha(expected));assert.deepEqual(await readFile(doc.path),expected);assert.equal((await store.getDocument(doc.id)).sha256,sha(expected));
  assert.ok(flatten(result.inventory).some(item=>item.documentId===doc.id&&item.parentDocumentId===parent.id&&item.sourceStream&&item.status==='ready'));
 }
 assert.equal(await readFile(join(store.folders.documents,parent.id+'.json'),'utf8'),before);assert.deepEqual(await readFile(parent.path),bytes);
 assert.equal(JSON.stringify(result.inventory).includes('PRIVATE'),false);assert.equal(JSON.stringify(result.inventory).includes('"payload"'),false);
});

test('RAR original is stored while only readable technical DOC and direct PDFs become analysis leaves',async t=>{
 const rar=Buffer.from('Rar!\x1a\x07\x00technical-container'),technical=fixture({body:'防水材料厚度不得低于4毫米。\r'});
 const{store,parent}=await setup(t,[nativeObject('技术标准.rar',rar),nativeObject('包件2.pdf',pdfA),nativeObject('包件3.pdf',pdfB)]);
 const result=await ensure(parent,{store,readArchiveEntriesImpl:async()=>({entries:[{name:'技术/技术标准.doc',format:'doc',bytes:technical.length,payload:technical,status:'ready'},{name:'图纸/屋面.dwg',format:'dwg',bytes:120,status:'unsupported',reason:'DWG图纸未解析'}],warnings:[],complete:false,reader:'test-reader'})});
 assert.deepEqual(result.documents.map(doc=>doc.fileName),['技术标准.doc','包件2.pdf','包件3.pdf']);
 const container=result.inventory.find(item=>item.name==='技术标准.rar');assert.ok(container.documentId);assert.deepEqual(await readFile((await store.getDocument(container.documentId)).path),rar);
 const technicalDoc=result.documents[0];assert.equal(technicalDoc.parentDocumentId,container.documentId);assert.equal(technicalDoc.rootDocumentId,parent.id);assert.equal(technicalDoc.archiveEntry,'技术/技术标准.doc');assert.deepEqual(await readFile(technicalDoc.path),technical);
 const dwg=flatten(result.inventory).find(item=>item.name==='图纸/屋面.dwg');assert.equal(dwg.status,'unsupported');assert.equal(dwg.parentDocumentId,container.documentId);assert.equal(dwg.documentId,undefined);
 assert.ok(result.warnings.some(warning=>/DWG|dwg/.test(warning.message)));assert.equal((await store.listDocuments()).length,5);
});

test('parallel repeated discovery reuses child IDs and one committed manifest',async t=>{
 const{store,parent,root}=await setup(t);const results=await Promise.all(Array.from({length:4},()=>ensure(parent,{store})));
 const ids=results[0].documents.map(doc=>doc.id);for(const result of results)assert.deepEqual(result.documents.map(doc=>doc.id),ids);
 assert.equal((await store.listDocuments()).length,3);assert.equal((await readdir(join(root,'embedded'))).filter(name=>name.endsWith('.json')).length,1);
});

test('cached bytes are hash checked and repaired without changing source identity',async t=>{
 const{store,parent}=await setup(t),first=await ensure(parent,{store});
 assert.equal(first.documents.length,2);
 await writeFile(first.documents[0].path,Buffer.from('wrong original bytes'));
 const second=await ensure(parent,{store});assert.deepEqual(second.documents.map(doc=>doc.id),first.documents.map(doc=>doc.id));assert.deepEqual(await readFile(second.documents[0].path),pdfA);
 await unlink(join(store.folders.documents,first.documents[1].id+'.json'));
 const third=await ensure(parent,{store});assert.equal(third.documents[1].id,first.documents[1].id);assert.deepEqual(await readFile((await store.getDocument(third.documents[1].id)).path),pdfB);
});

test('identical bytes under another parent never inherit the first parent relationship',async t=>{
 const{store,parent,bytes}=await setup(t),first=await ensure(parent,{store});
 const other={...parent,id:randomUUID(),path:join(store.folders.uploads,randomUUID())};await writeFile(other.path,bytes);await store.saveDocument(other);
 const second=await ensure(other,{store});assert.equal(first.documents.length,2);assert.equal(second.documents.length,2);assert.ok(second.documents.every(doc=>doc.parentDocumentId===other.id&&doc.rootDocumentId===other.id));assert.equal(second.documents.some(doc=>first.documents.some(original=>original.id===doc.id)),false);
});

test('changed parent bytes produce a new source manifest instead of silently reusing old attachments',async t=>{
 const{store,parent}=await setup(t),first=await ensure(parent,{store});
 const changed=Buffer.from('%PDF-1.7\nnew attachment version\n');await writeFile(parent.path,fixture({objects:[nativeObject('包件2.pdf',changed)]}));
 const next=await ensure(parent,{store});assert.equal(next.documents.length,1);assert.notEqual(next.documents[0].id,first.documents[0].id);assert.deepEqual(await readFile(next.documents[0].path),changed);
});

test('missing archive reader retains the saved container and an explicit unread gap',async t=>{
 const rar=Buffer.from('Rar!\x1a\x07\x00missing-reader');const{store,parent}=await setup(t,[nativeObject('技术标准.rar',rar)]);
 const result=await ensure(parent,{store,readArchiveEntriesImpl:async()=>({entries:[],warnings:[{code:'ARCHIVE_READER_UNAVAILABLE',message:'归档读取工具不可用，技术标准仍未读取。'}],complete:false,reader:null})});
 assert.deepEqual(result.documents,[]);assert.equal(result.inventory[0].status,'blocked');assert.ok(result.inventory[0].documentId);assert.equal(result.inventory[0].complete,false);assert.ok(result.warnings.some(warning=>warning.code==='ARCHIVE_READER_UNAVAILABLE'));
 assert.deepEqual(await readFile((await store.getDocument(result.inventory[0].documentId)).path),rar);
});

test('corrupt native object is inventoried as unread without inventing a child original',async t=>{
 const{store,parent}=await setup(t,[nativeObject('坏附件.pdf',pdfA,{badSize:true})]);const result=await ensure(parent,{store});
 assert.equal(result.documents.length,0);assert.equal(result.inventory.length,1);assert.equal(result.inventory[0].status,'blocked');assert.equal(result.inventory[0].documentId,undefined);assert.ok(result.warnings.length);
 assert.equal((await store.listDocuments()).length,1);
});

test('cancellation never commits a reusable successful manifest',async t=>{
 const rar=Buffer.from('Rar!\x1a\x07\x00cancelled');const{store,parent,root}=await setup(t,[nativeObject('技术标准.rar',rar)]),controller=new AbortController();
 await assert.rejects(ensure(parent,{store,signal:controller.signal,readArchiveEntriesImpl:async()=>{controller.abort();throw new DOMException('已取消','AbortError');}}),error=>error.name==='AbortError');
 const files=await readdir(join(root,'embedded')).catch(error=>{if(error.code==='ENOENT')return[];throw error;});assert.equal(files.some(name=>name.endsWith('.json')),false);
 const resumed=await ensure(parent,{store,readArchiveEntriesImpl:async()=>({entries:[{name:'技术.txt',format:'txt',bytes:6,payload:Buffer.from('clause'),status:'ready'}],warnings:[],complete:true,reader:'test-reader'})});assert.equal(resumed.documents.length,1);assert.deepEqual(await readFile(resumed.documents[0].path),Buffer.from('clause'));
});

test('nonlegacy sources need no derived file writes or speculative DOC parsing',async t=>{
 const{store,parent,root}=await setup(t);await writeFile(parent.path,pdfA);const result=await ensure({...parent,fileName:'主文件.pdf'},{store});
 assert.deepEqual(result.documents,[]);assert.deepEqual(result.inventory,[]);assert.deepEqual(result.warnings,[]);assert.equal((await store.listDocuments()).length,1);
 const files=await readdir(join(root,'embedded')).catch(error=>{if(error.code==='ENOENT')return[];throw error;});assert.equal(files.length,0);
});

test('inventory is flat and keeps each archive member linked to its saved container',async t=>{
 const rar=Buffer.from('Rar!\x1a\x07\x00flat-inventory');const{store,parent}=await setup(t,[nativeObject('技术标准.rar',rar)]);
 const result=await ensure(parent,{store,readArchiveEntriesImpl:async()=>({entries:[{name:'技术/技术.txt',format:'txt',bytes:6,payload:Buffer.from('clause'),status:'ready'},{name:'图纸.dwg',format:'dwg',bytes:40,status:'unsupported',reason:'未读取DWG'}],warnings:[],complete:false,reader:'test-reader'})});
 assert.equal(result.inventory.length,3);assert.ok(result.inventory.every(item=>!item.children));
 const[container,leaf,unread]=result.inventory;assert.equal(container.fileName,'技术标准.rar');assert.equal(leaf.fileName,'技术.txt');assert.equal(leaf.parentDocumentId,container.documentId);assert.equal(unread.containerDocumentId,container.documentId);
});

test('company evidence never starts automatic embedded discovery',async t=>{
 const{store,parent,root}=await setup(t),before=await store.listDocuments();
 const result=await ensure({...parent,role:'evidence'},{store});assert.deepEqual(result,{documents:[],inventory:[],warnings:[],version:1});assert.equal((await store.listDocuments()).length,before.length);
 assert.deepEqual(await readdir(join(root,'embedded')).catch(error=>{if(error.code==='ENOENT')return[];throw error;}),[]);
});

test('a cached document that acquired a company owner is preserved and never rebound by repair',async t=>{
 const{store,parent}=await setup(t),first=await ensure(parent,{store});assert.equal(first.documents.length,2);
 const owned={...first.documents[0],companyId:randomUUID()};await store.saveDocument(owned);const before=await readFile(join(store.folders.documents,owned.id+'.json'),'utf8');
 const repaired=await ensure(parent,{store});assert.notEqual(repaired.documents[0].id,owned.id);assert.equal(repaired.documents[0].companyId,undefined);
 assert.equal(await readFile(join(store.folders.documents,owned.id+'.json'),'utf8'),before);assert.deepEqual(await readFile(owned.path),pdfA);
});

test('root object limit stops discovery with one explicit remainder instead of an unbounded inventory',async t=>{
 const objects=Array.from({length:205},(_,index)=>nativeObject(`附件${index}.pdf`,pdfA));const{store,parent}=await setup(t,objects);
 const result=await ensure(parent,{store});assert.ok(result.inventory.length<=201);assert.ok(result.documents.length<=200);assert.ok(result.warnings.some(warning=>warning.code==='DOC_EMBEDDED_LIMIT'));
});

test('a corrupted manifest cannot substitute a container for a readable leaf',async t=>{
 const rar=Buffer.from('Rar!\x1a\x07\x00manifest-leaf-check');const{store,parent,root}=await setup(t,[nativeObject('技术标准.rar',rar)]);
 const readArchiveEntriesImpl=async()=>({entries:[{name:'技术.txt',format:'txt',bytes:6,payload:Buffer.from('clause'),status:'ready'}],warnings:[],complete:true,reader:'test-reader'});
 const first=await ensure(parent,{store,readArchiveEntriesImpl}),directory=join(root,'embedded'),file=join(directory,(await readdir(directory))[0]),record=JSON.parse(await readFile(file,'utf8'));
 record.documentIds=[first.inventory[0].documentId];await writeFile(file,JSON.stringify(record));
 const restored=await ensure(parent,{store,readArchiveEntriesImpl});assert.deepEqual(restored.documents.map(doc=>doc.fileName),['技术.txt']);assert.equal(restored.documents[0].id,first.documents[0].id);
});

test('cancellation preserves a newly created child acquired by a company during archive reading',async t=>{
 const rar=Buffer.from('Rar!\x1a\x07\x00ownership-during-cancel'),{store,parent,root}=await setup(t,[nativeObject('技术标准.rar',rar)]),controller=new AbortController(),companyId=randomUUID();let acquired;
 await assert.rejects(ensure(parent,{store,signal:controller.signal,readArchiveEntriesImpl:async()=>{
  acquired=(await store.listDocuments()).find(doc=>doc.parentDocumentId===parent.id);assert.ok(acquired);
  acquired=await store.saveDocument({...acquired,companyId});controller.abort();throw new DOMException('已取消','AbortError');
 }}),error=>error.name==='AbortError');
 const retained=await store.getDocument(acquired.id).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 assert.ok(retained,'取消回滚必须保留已取得企业归属的原件');assert.equal(retained.companyId,companyId);assert.equal(retained.sha256,sha(rar));assert.deepEqual(await readFile(retained.path),rar);
 const manifests=await readdir(join(root,'embedded')).catch(error=>{if(error.code==='ENOENT')return[];throw error;});assert.equal(manifests.some(name=>name.endsWith('.json')),false);
});
