import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../src/server/service.js';

const body='招标文件\n供应商必须提供有效营业执照。\n未按时缴纳投标保证金的，投标无效。\n必须提交无重大违法记录承诺函。';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'biaoxi-empty-extraction-v7-'));
 const service=await createService({dataDir:root});
 t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
 const {token}=await(await fetch(service.url+'/api/bootstrap')).json();
 async function request(path,{method='GET',data}={}){
  const res=await fetch(service.url+path,{method,headers:{'X-Biaoxi-Token':token,...(data instanceof FormData?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:data instanceof FormData?data:JSON.stringify(data)})});
  assert.ok(res.ok,await res.clone().text());return res.json();
 }
 async function upload(name,text,role='tender'){
  const form=new FormData();form.append('files',new Blob([text]),name);form.append('role',role);
  return(await request('/api/documents',{method:'POST',data:form})).documents[0];
 }
 async function run(data){
  const {jobId}=await request('/api/analyses',{method:'POST',data});
  for(let i=0;i<400;i++){
   const job=await request('/api/jobs/'+jobId);
   if(['completed','failed','cancelled'].includes(job.status))return job;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('real analysis job did not finish');
 }
 return {service,request,upload,run};
}

test('a newly uploaded blank main file fails without a ready document or empty report',async t=>{
 const {request,upload,run}=await fixture(t),doc=await upload('空白主文.txt','  \n\t');
 const job=await run({documentIds:[doc.id],mode:'offline'});
 assert.equal(job.status,'failed');assert.deepEqual(job.reportIds,[]);
 assert.match(job.error,/空白主文/);assert.match(job.error,/正文|文字/);
 const saved=await request('/api/documents/'+doc.id);
 assert.equal(saved.status,'error');assert.match(saved.error,/正文|文字/);
 assert.equal(saved.extraction.complete,false);
 assert.equal((await request('/api/reports')).reports.length,0);
});

test('a broken DOCX main file retains its reading cause and cannot be reported as completed',async t=>{
 const {request,upload,run}=await fixture(t),doc=await upload('无法读取.docx','not a Word archive');
 const job=await run({documentIds:[doc.id],mode:'offline'});
 assert.equal(job.status,'failed');assert.equal(job.reportIds.length,0);
 const saved=await request('/api/documents/'+doc.id);
 assert.equal(saved.status,'error');assert.match(saved.error,/正文|文字/);
 assert.ok(saved.extraction.warnings.some(w=>w.code==='READ_FAILED'));
 assert.equal((await request('/api/reports')).reports.length,0);
});

test('a cached historical empty extraction is retried from the original instead of staying empty',async t=>{
 const {service,request,upload,run}=await fixture(t),doc=await upload('可恢复.txt',body);
 const stored=await service.store.getDocument(doc.id);
 await service.store.saveDocument({...stored,status:'error',error:'旧版无法读取',extraction:{id:doc.id,fileName:doc.fileName,format:'txt',complete:false,blocks:[],warnings:[{code:'READ_FAILED',message:'旧版读取失败'}]}});
 const job=await run({documentIds:[doc.id],mode:'offline'});
 assert.equal(job.status,'completed');assert.equal(job.reportIds.length,1);
 const saved=await request('/api/documents/'+doc.id);
 assert.equal(saved.status,'ready');assert.equal(saved.error,undefined);
 assert.ok(saved.extraction.blocks.some(block=>block.text.includes('有效营业执照')));
 const report=await request('/api/reports/'+job.reportIds[0]);
 assert.ok(report.categories.some(category=>category.items.length));
 assert.ok(!report.warnings.some(w=>w.message==='旧版读取失败'));
});

test('cached whitespace blocks cannot bypass the empty main-file check',async t=>{
 const {service,request,upload,run}=await fixture(t),doc=await upload('缓存空白.txt',' \n\t');
 const stored=await service.store.getDocument(doc.id);
 await service.store.saveDocument({...stored,status:'ready',extraction:{id:doc.id,fileName:doc.fileName,format:'txt',complete:true,blocks:[{id:'old-empty',text:' \n\t'}],warnings:[]}});
 const job=await run({documentIds:[doc.id],mode:'offline'});
 assert.equal(job.status,'failed');assert.equal(job.reportIds.length,0);
 assert.equal((await request('/api/documents/'+doc.id)).status,'error');
});

test('a partial extraction with real main text keeps its report and original coverage gap',async t=>{
 const {service,request,upload,run}=await fixture(t),doc=await upload('部分读取.txt',body);
 const stored=await service.store.getDocument(doc.id);
 await service.store.saveDocument({...stored,status:'ready',extraction:{id:doc.id,fileName:doc.fileName,format:'txt',complete:false,blocks:[{id:doc.id+':b1',documentId:doc.id,fileName:doc.fileName,page:null,section:'正文',text:body}],warnings:[{code:'SOURCE_PARTIAL',message:'原件附表无法完整读取'}]}});
 const job=await run({documentIds:[doc.id],mode:'offline'});
 assert.equal(job.status,'completed');assert.equal(job.reportIds.length,1);
 const report=await request('/api/reports/'+job.reportIds[0]);
 assert.equal(report.categories.length,14);assert.equal(Object.keys(report.outputs).length,4);
 assert.ok(report.categories.some(category=>category.items.length));
 assert.ok(report.warnings.some(w=>w.code==='SOURCE_PARTIAL'));
 assert.equal(report.coverage.complete,false);
});

test('a later empty main file fails the job while keeping the earlier valid saved report',async t=>{
 const {request,upload,run}=await fixture(t),first=await upload('有效主文.txt',body),second=await upload('后续空白.txt','  ');
 const job=await run({documentIds:[first.id,second.id],mode:'offline'});
 assert.equal(job.status,'failed');assert.equal(job.reportIds.length,1);
 const report=await request('/api/reports/'+job.reportIds[0]);
 assert.equal(report.documentId,first.id);assert.ok(report.categories.some(category=>category.items.length));
 assert.equal((await request('/api/reports')).reports.length,1);
 assert.equal((await request('/api/documents/'+second.id)).status,'error');
});

for(const role of ['attachment','evidence'])test(`an empty ${role} is an explicit document gap and does not discard readable main analysis`,async t=>{
 const {request,upload,run}=await fixture(t),main=await upload('有效采购文件.txt',body),supplement=await upload(role==='attachment'?'未读取附件.txt':'未读取证照.txt',' \n\t',role);
 const job=await run({documentIds:[main.id],...(role==='attachment'?{attachmentIds:[supplement.id]}:{evidenceIds:[supplement.id]}),mode:'offline'});
 assert.equal(job.status,'completed');assert.equal(job.reportIds.length,1);
 const saved=await request('/api/documents/'+supplement.id);
 assert.equal(saved.status,'error');assert.match(saved.error,/正文|文字/);
 const report=await request('/api/reports/'+job.reportIds[0]);
 assert.equal(report.documentId,main.id);assert.equal(report.categories.length,14);assert.equal(Object.keys(report.outputs).length,4);
 assert.ok(report.categories.some(category=>category.items.length));
 assert.equal(report.coverage.complete,false);
 assert.ok(report.warnings.some(w=>w.documentId===supplement.id&&/未读取附件|未读取证照|正文|文字/.test(w.message)));
});

test('partially readable evidence retains its source warning and never claims complete coverage',async t=>{
 const {service,request,upload,run}=await fixture(t),main=await upload('资格主文.txt',body),proof=await upload('部分证照.txt','有效资质证书。','evidence');
 const stored=await service.store.getDocument(proof.id);
 await service.store.saveDocument({...stored,status:'ready',extraction:{id:proof.id,fileName:proof.fileName,format:'doc',complete:false,blocks:[{id:proof.id+':b1',documentId:proof.id,fileName:proof.fileName,page:null,section:'正文',text:'有效资质证书。'}],warnings:[{code:'DOC_EMBEDDED_UNPARSED',message:'资质附表未展开读取'}]}});
 const job=await run({documentIds:[main.id],evidenceIds:[proof.id],mode:'offline'});
 assert.equal(job.status,'completed');assert.equal(job.reportIds.length,1);
 const report=await request('/api/reports/'+job.reportIds[0]);
 assert.equal(report.coverage.complete,false);
 assert.ok(report.warnings.some(w=>w.documentId===proof.id&&w.code==='DOC_EMBEDDED_UNPARSED'&&w.message.includes('资质附表')));
 assert.ok(!report.warnings.some(w=>w.code==='EVIDENCE_READ_FAILED'));
 const warningKeys=report.warnings.map(w=>[w.documentId,w.code,w.message].join('|'));
 assert.equal(new Set(warningKeys).size,warningKeys.length,'repeated report summarizing must not duplicate evidence warnings');
});
