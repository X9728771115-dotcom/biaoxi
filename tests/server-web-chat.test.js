import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat,unlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {createService} from '../src/server/service.js';
import {CATEGORIES} from '../src/core/contracts.js';
import {analyzeDocument} from '../src/core/analyzer.js';
const packageVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;

async function fixture(t){
 const dataDir=await mkdtemp(join(tmpdir(),'biaoxi-web-chat-')),service=await createService({dataDir,port:0});
 t.after(async()=>{await service.close();await rm(dataDir,{recursive:true,force:true});});
 const boot=await(await fetch(service.url+'/api/bootstrap')).json(),headers={'X-Biaoxi-Token':boot.token};
 const request=(path,method='GET',body)=>fetch(service.url+path,{method,headers:body instanceof FormData?headers:{...headers,'Content-Type':'application/json'},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
 const json=async(path,method,body)=>{const response=await request(path,method,body),value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
 const upload=async(role,name,text)=>{const form=new FormData();form.append('role',role);form.append('files',new Blob([text]),name);return (await json('/api/documents','POST',form)).documents[0];};
 const tender=await upload('tender','主招标.txt','供应商须提供营业执照，否则响应无效。\n\n验收合格后30日内付款。');
 const attachment=await upload('attachment','本次附件.txt','验收时须提供材料检测记录。'),evidence=await upload('evidence','本次证照.txt','企业证照仅对照，不是招标要求。');
 const {jobId}=await json('/api/analyses','POST',{documentIds:[tender.id],attachmentIds:[attachment.id],evidenceIds:[evidence.id]});
 let job;for(let count=0;count<300;count++){job=await json('/api/jobs/'+jobId);if(job.status==='completed')break;if(job.status==='failed')assert.fail(job.error);await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.status,'completed');const report=await json('/api/reports/'+job.reportIds[0]);
 return {dataDir,service,request,json,upload,tender,attachment,evidence,report};
}
function bridge(h){assert.equal(typeof h.service.desktopWebChat?.prepare,'function','service must provide an internal desktop web-chat bridge');return h.service.desktopWebChat;}
function reply(request){return JSON.stringify({requestId:request.requestId,categories:CATEGORIES.map(c=>({id:c.id,status:'identified',summary:'仍须人工复核',findings:[]})),outputs:{risks:[],scoreItems:[],commitments:[],conclusion:{label:'可投',reasons:['模型已确认']}},synthesis:[]});}

test('prepare locks report mutation/export and never exposes its internal paths or request as HTTP',async t=>{
 const h=await fixture(t),b=bridge(h),prepared=await b.prepare(h.report.id,'doubao');
 assert.deepEqual(prepared.files.map(f=>f.documentId),[h.tender.id,h.attachment.id,h.evidence.id]);
 assert.ok(prepared.files.every(f=>f.path.startsWith(h.dataDir)));
 await assert.rejects(b.prepare(h.report.id,'deepseek'),/正在|进行|锁定/);
 const finding=h.report.categories.flatMap(c=>c.items)[0];
 for(const [path,method,body] of [
  ['/api/reports/'+h.report.id,'DELETE'],['/api/reports/'+h.report.id+'/export?format=docx','GET'],
  ['/api/reports/'+h.report.id+'/review','POST',{findingId:finding.id,status:'met',note:'人工记录'}],
  ['/api/reports/'+h.report.id+'/coverage-review','POST',{reviewed:true,note:'已对照原件核对全部内容'}]
 ])assert.equal((await h.request(path,method,body)).status,409);
 assert.equal((await h.json('/api/reports')).reports[0].analysisStatus,'归纳中');
 const publicDoc=await h.json('/api/documents/'+h.tender.id);assert.equal(publicDoc.path,undefined);
 assert.equal((await h.request('/api/web-chat/prepare','POST',{reportId:h.report.id,provider:'doubao'})).status,404);
 assert.equal(await b.cancel(prepared.requestId),true);assert.equal(await b.cancel(prepared.requestId),false);
 assert.notEqual((await h.json('/api/reports')).reports[0].analysisStatus,'归纳中');
 await assert.rejects(b.complete(prepared.requestId,reply(prepared)),/不存在|失效|取消/);
 const next=await b.prepare(h.report.id,'deepseek');assert.notEqual(next.requestId,prepared.requestId);await b.cancel(next.requestId);
});

test('complete is one-shot, persists raw reply on original report ID and preserves saved human review',async t=>{
 const h=await fixture(t),b=bridge(h),finding=h.report.categories.flatMap(c=>c.items)[0];
 await h.json('/api/reports/'+h.report.id+'/review','POST',{findingId:finding.id,status:'met',note:'人工已核对营业执照原件'});
 await h.json('/api/reports/'+h.report.id+'/coverage-review','POST',{reviewed:true,note:'已对照原件完成读取覆盖复核'});
 const prepared=await b.prepare(h.report.id,'deepseek'),raw=reply(prepared),result=await b.complete(prepared.requestId,raw);
 assert.equal(result.id,h.report.id);assert.equal(result.mode,'web-chat');assert.equal(result.webChat.rawText,raw);assert.equal(result.webChat.status,'partial');assert.ok(result.webChat.warnings.some(w=>w.code==='WEB_CHAT_CONTENT_REVIEW'));
 const saved=await h.json('/api/reports/'+h.report.id);assert.equal(saved.categories.length,14);assert.equal(Object.keys(saved.outputs).length,4);
 assert.equal(saved.categories.flatMap(c=>c.items).find(i=>i.id===finding.id).matchStatus,'met');assert.equal(saved.coverageReview.reviewed,true);
 assert.notEqual(saved.outputs.conclusion.label,'可投','model claim cannot fill other pending enterprise facts');
 assert.equal((await h.json('/api/reports')).reports.length,1);
 assert.deepEqual(JSON.parse(await readFile(join(h.dataDir,'reports',h.report.id+'.json'),'utf8')).webChat,saved.webChat);
 await assert.rejects(b.complete(prepared.requestId,raw),/不存在|失效|已/);assert.equal(await b.cancel(prepared.requestId),false);
 assert.equal((await h.request('/api/reports/'+h.report.id+'/review','POST',{findingId:finding.id,status:'pending',note:'继续复核'})).status,200);
});

test('incomplete local reading permits original upload while oversized and malformed replies retain their boundaries',async t=>{
 const h=await fixture(t),b=bridge(h);
 const doc=await h.service.store.getDocument(h.attachment.id);doc.extraction.complete=false;await h.service.store.saveDocument(doc);
 const incomplete=await b.prepare(h.report.id,'doubao');assert.equal(incomplete.localCoverage.complete,false);await b.cancel(incomplete.requestId);
 doc.extraction.complete=true;await h.service.store.saveDocument(doc);
 await assert.rejects(b.prepare(h.report.id,'arbitrary-platform'),/平台/);
 let prepared=await b.prepare(h.report.id,'doubao');await assert.rejects(b.complete(prepared.requestId,'界'.repeat(400000)),/1MB/);
 prepared=await b.prepare(h.report.id,'doubao');const result=await b.complete(prepared.requestId,'回答未按约定JSON格式返回');
 assert.equal(result.webChat.status,'partial');assert.equal(result.webChat.rawText,'回答未按约定JSON格式返回');assert.equal(result.webChat.coverage.missingCategories.length,14);
 const current=await h.json('/api/reports/'+h.report.id);assert.equal(current.id,h.report.id);assert.equal(current.categories.length,14);assert.equal(Object.keys(current.outputs).length,4);
 assert.equal((await h.request('/api/reports/'+h.report.id,'DELETE')).status,200);
});

test('an empty original on disk cannot become a prepared request and releases its report lock',async t=>{
 const h=await fixture(t),b=bridge(h),doc=await h.service.store.getDocument(h.tender.id),original=await readFile(doc.path);
 await writeFile(doc.path,'');await assert.rejects(b.prepare(h.report.id,'deepseek'),/为空|原文件|不可读取/);
 await writeFile(doc.path,original);const prepared=await b.prepare(h.report.id,'deepseek');await b.cancel(prepared.requestId);
});

test('oversized full-text prompt is rejected in prepare before upload copies and releases its report lock',async t=>{
 const h=await fixture(t),b=bridge(h),doc=await h.service.store.getDocument(h.tender.id),originalBlocks=structuredClone(doc.extraction.blocks);
 doc.extraction.blocks.push({id:'oversized-source',page:2,text:'原'.repeat(150000)});await h.service.store.saveDocument(doc);
 await assert.rejects(b.prepare(h.report.id,'doubao'),error=>error.code==='WEB_CHAT_PROMPT_TOO_LONG'&&/150000/.test(error.message));
 assert.deepEqual(await readdir(join(h.dataDir,'web-chat')).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error)),[],'no upload copies may be prepared for an oversized prompt');
 assert.notEqual((await h.json('/api/reports')).reports[0].analysisStatus,'归纳中');
 doc.extraction.blocks=originalBlocks;await h.service.store.saveDocument(doc);
 const retry=await b.prepare(h.report.id,'doubao');assert.ok(retry.prompt.includes('供应商须提供营业执照，否则响应无效。'));await b.cancel(retry.requestId);
});

test('prepare includes only the matched company snapshot originals and rejects a foreign owner without retaining the lock',async t=>{
 const h=await fixture(t),b=bridge(h),store=h.service.store,companyId='web-chat-selected-company';
 const main=await store.getDocument(h.tender.id);
 main.extraction.blocks.push({id:'web-company-qualification',page:1,text:'供应商须具备建筑工程施工总承包三级及以上资质，否则响应无效。'});
 await writeFile(main.path,main.extraction.blocks.map(block=>block.text).join('\n'));await store.saveDocument(main);
 const qualification=await h.upload('evidence','本企业资质.txt','建筑业企业资质证书：建筑工程施工总承包二级。');
 for(const id of [h.evidence.id,qualification.id]){const doc=await store.getDocument(id),text=id===h.evidence.id?'营业执照：网页分析测试企业。':'建筑业企业资质证书：建筑工程施工总承包二级。';doc.companyId=companyId;doc.extraction={id:doc.id,fileName:doc.fileName,complete:true,blocks:[{id:doc.id+'-block',page:1,text}]};await writeFile(doc.path,text);await store.saveDocument(doc);}
 const records=[{id:'web-license-record',type:'entity',name:'本企业营业执照',verified:false,fields:{evidence:[{kind:'license',documentId:h.evidence.id,verified:false}]},documentIds:[h.evidence.id],sources:[]},{id:'web-qualification-record',type:'qualification',name:'本企业资质',verified:false,fields:{category:'建筑工程施工总承包二级'},documentIds:[qualification.id],sources:[]},{id:'unrelated-contract',type:'performance',name:'无关合同',verified:false,fields:{},documentIds:['unavailable-unrelated-original'],sources:[]}];
 records.push(
  {id:'unrelated-iso',type:'qualification',name:'ISO9001认证证书',fields:{category:'ISO9001质量管理体系认证'},documentIds:['unavailable-iso-original'],sources:[]},
  {id:'unrelated-safety',type:'qualification',name:'安全生产许可证',fields:{category:'安全生产许可证'},documentIds:['unavailable-safety-original'],sources:[]},
  {id:'wrong-specialty',type:'qualification',name:'市政施工资质',fields:{category:'市政公用工程施工总承包二级'},documentIds:['unavailable-city-original'],sources:[]}
 );
 const saveReport=async owner=>{const report=analyzeDocument(main.extraction,{companySnapshot:{id:owner,name:'网页分析测试企业',records}});Object.assign(report,{id:h.report.id,evidenceIds:[],attachmentIds:[]});await store.saveReport(report);};
 await saveReport(companyId);
 const prepared=await b.prepare(h.report.id,'doubao');assert.deepEqual(prepared.files.map(file=>file.documentId),[h.tender.id,h.evidence.id,qualification.id]);assert.deepEqual(prepared.files.map(file=>file.role),['tender','evidence','evidence']);
 await b.cancel(prepared.requestId);
 await saveReport('another-company');await assert.rejects(b.prepare(h.report.id,'doubao'),/企业|归属/);
 await saveReport(companyId);const retry=await b.prepare(h.report.id,'doubao');await b.cancel(retry.requestId);
});

test('concurrent prepare cannot create two requests for one report and close invalidates pending capture',async t=>{
 const h=await fixture(t),b=bridge(h),results=await Promise.allSettled([b.prepare(h.report.id,'doubao'),b.prepare(h.report.id,'deepseek')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const prepared=results.find(r=>r.status==='fulfilled').value;await h.service.close();
 await assert.rejects(b.complete(prepared.requestId,reply(prepared)),/关闭|失效|不存在/);
 await assert.rejects(b.prepare(h.report.id,'doubao'),/关闭/);
});

test('request upload copies preserve original names/content and are removed on cancel or complete without touching originals',async t=>{
 const h=await fixture(t),b=bridge(h),original=await h.service.store.getDocument(h.tender.id),originalText=await readFile(original.path,'utf8');
 const first=await b.prepare(h.report.id,'doubao');
 assert.equal(basename(first.files[0].path),h.tender.fileName);assert.notEqual(first.files[0].path,original.path);
 assert.equal(await readFile(first.files[0].path,'utf8'),originalText);assert.ok(first.files[0].path.includes(join('web-chat',first.requestId)));
 await b.cancel(first.requestId);for(const file of first.files)await assert.rejects(readFile(file.path),{code:'ENOENT'});
 const second=await b.prepare(h.report.id,'deepseek');await b.complete(second.requestId,reply(second));
 for(const file of second.files)await assert.rejects(readFile(file.path),{code:'ENOENT'});
 assert.equal(await readFile(original.path,'utf8'),originalText);
 const third=await b.prepare(h.report.id,'doubao');await assert.rejects(b.complete(third.requestId,'x'.repeat(1024*1024+1)),/1MB/);
 for(const file of third.files)await assert.rejects(readFile(file.path),{code:'ENOENT'});
});

test('prepare copy failure cleans its partially created files and releases its lock',async t=>{
 const h=await fixture(t),b=bridge(h),attachment=await h.service.store.getDocument(h.attachment.id),body=await readFile(attachment.path);
 await unlink(attachment.path);await assert.rejects(b.prepare(h.report.id,'doubao'),/文件|读取/);
 const entries=await readdir(join(h.dataDir,'web-chat')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});assert.deepEqual(entries,[]);
 await writeFile(attachment.path,body);const prepared=await b.prepare(h.report.id,'deepseek');
 assert.equal(basename(prepared.files[1].path),attachment.fileName);await b.cancel(prepared.requestId);
});

test('temporary upload copies have private permissions on systems supporting POSIX modes',async t=>{
 if(process.platform==='win32'){t.skip('Windows access control is not represented by POSIX mode bits');return;}
 const h=await fixture(t),prepared=await bridge(h).prepare(h.report.id,'doubao');
 for(const file of prepared.files)assert.equal((await stat(file.path)).mode&0o077,0);
 await h.service.desktopWebChat.cancel(prepared.requestId);
});

test('service close waits for an in-flight prepare to stop and clean its copies',async t=>{
 const h=await fixture(t),b=bridge(h),get=h.service.store.getDocument;let reached,release;
 const started=new Promise(resolve=>reached=resolve),gate=new Promise(resolve=>release=resolve);
 h.service.store.getDocument=async id=>{reached();await gate;return get(id);};
 const preparing=b.prepare(h.report.id,'deepseek');const rejected=assert.rejects(preparing,/关闭/);
 await started;let stopped=false;const closing=h.service.close().then(()=>{stopped=true;});
 await new Promise(resolve=>setTimeout(resolve,20));const premature=stopped;release();await rejected;await closing;
 assert.equal(premature,false,'close must wait for file preparation cleanup before Electron can exit');
 assert.deepEqual(await readdir(join(h.dataDir,'web-chat')),[]);
});

test('named copies use collision-free upload aliases while retaining original filenames and document identities',async t=>{
 const h=await fixture(t),names=['清单.txt','清单.txt','2-清单.txt'],ids=[h.tender.id,h.attachment.id,h.evidence.id];
 for(let index=0;index<ids.length;index++){const doc=await h.service.store.getDocument(ids[index]);doc.fileName=names[index];doc.extraction.fileName=names[index];await h.service.store.saveDocument(doc);}
 const prepared=await bridge(h).prepare(h.report.id,'doubao');
 assert.equal(new Set(prepared.files.map(file=>file.fileName.toLowerCase())).size,3);
 assert.deepEqual(prepared.files.map(file=>file.originalFileName),names);assert.deepEqual(prepared.files.map(file=>file.documentId),ids);
 for(const file of prepared.files){assert.equal(basename(file.path),file.fileName);const original=await h.service.store.getDocument(file.documentId);assert.deepEqual(await readFile(file.path),await readFile(original.path));}
 await h.service.desktopWebChat.cancel(prepared.requestId);
});

test('bootstrap version matches the current package manifest',async t=>{
 const h=await fixture(t);assert.equal((await h.json('/api/bootstrap')).version,packageVersion);
});
