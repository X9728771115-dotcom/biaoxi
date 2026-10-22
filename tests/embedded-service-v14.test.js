import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../src/server/service.js';
import {createLegacyDocFixture,createLegacyNativeObject} from './fixtures/legacy-doc-fixture.js';

test('analysis reads actual embedded originals with independent source IDs and keeps each main document isolated',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bx-embedded-service-')),service=await createService({dataDir:root,port:0});
 try{
  const {token}=await (await fetch(service.url+'/api/bootstrap')).json();
  const api=async(path,options={})=>{const r=await fetch(service.url+path,{...options,headers:{'x-biaoxi-token':token,...options.headers}});const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;};
  const ids=[];
  for(const [name,body]of [['甲','付款方式：验收合格后30日支付合同价90%，余10%作为质量保证金。'],['乙','项目经理必须具有有效的安全生产考核合格证书。']]){
   const bytes=createLegacyDocFixture({body:`采购项目：${name}维修工程\r`,objects:[createLegacyNativeObject(name+'技术要求.txt',Buffer.from(body))]});
   const form=new FormData();form.append('role','tender');form.append('files',new Blob([bytes]),name+'.doc');
   const uploaded=await api('/api/documents',{method:'POST',body:form});ids.push(uploaded.documents[0].id);
  }
  const job=await api('/api/analyses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentIds:ids,mode:'offline'})});
  let state;for(let i=0;i<100;i++){state=await api('/api/jobs/'+job.jobId);if(['completed','failed'].includes(state.status))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(state.status,'completed',state.error);assert.equal(state.reportIds.length,2);
  const reports=await Promise.all(state.reportIds.map(id=>api('/api/reports/'+id)));
  assert.ok(reports.every(report=>report.attachmentIds.length===1));assert.notEqual(reports[0].attachmentIds[0],reports[1].attachmentIds[0]);
  for(const report of reports){
   const child=await api('/api/documents/'+report.attachmentIds[0]);assert.equal(child.parentDocumentId,report.documentId);assert.equal(child.role,'attachment');
   assert.equal(report.categories.length,14);assert.equal(Object.keys(report.outputs).length,4);
   assert.ok(report.categories.flatMap(category=>category.items).flatMap(item=>item.references||[]).some(ref=>ref.documentId===child.id));
   assert.ok(report.embeddedAttachments.some(entry=>entry.documentId===child.id));
   assert.ok(!report.warnings.some(warning=>warning.code==='DOC_EMBEDDED_UNPARSED'&&/均未展开/.test(warning.message)));
  }
  const foreign=await fetch(service.url+'/api/analyses',{method:'POST',headers:{'x-biaoxi-token':token,'content-type':'application/json'},body:JSON.stringify({documentIds:[ids[1]],attachmentIds:[reports[0].attachmentIds[0]],mode:'offline'})});
  assert.equal(foreign.status,400);assert.match((await foreign.json()).error,/其他主文件|归属|不属于/);
  const multi=await api('/api/analyses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentIds:ids,attachmentIds:[reports[0].attachmentIds[0]],mode:'offline'})});
  for(let i=0;i<100;i++){state=await api('/api/jobs/'+multi.jobId);if(['completed','failed'].includes(state.status))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(state.status,'completed',state.error);
  const second=await api('/api/reports/'+state.reportIds[1]);assert.deepEqual(second.attachmentIds,reports[1].attachmentIds);assert.deepEqual(second.selectedAttachmentIds,[]);
  const dwgBytes=createLegacyDocFixture({objects:[createLegacyNativeObject('图纸.dwg',Buffer.from('AC1027-drawing'))]});
  const dwgForm=new FormData();dwgForm.append('role','tender');dwgForm.append('files',new Blob([dwgBytes]),'图纸项目.doc');
  const dwgDoc=(await api('/api/documents',{method:'POST',body:dwgForm})).documents[0];
  const dwgJob=await api('/api/analyses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentIds:[dwgDoc.id],mode:'offline'})});
  for(let i=0;i<100;i++){state=await api('/api/jobs/'+dwgJob.jobId);if(['completed','failed'].includes(state.status))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(state.status,'completed',state.error);const unread=await api('/api/reports/'+state.reportIds[0]);
  assert.equal(unread.attachmentIds.length,0);assert.ok(unread.embeddedAttachments.some(entry=>entry.status==='unsupported'));
  assert.ok(!unread.warnings.some(warning=>/已展开可读内嵌附件并单独分析/.test(warning.message)));
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
