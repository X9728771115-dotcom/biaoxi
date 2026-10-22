import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../src/server/service.js';

const tenderText=[
 '# 资格要求','供应商须提供有效营业执照；未提供的响应无效。',
 '# 评分办法','类似项目业绩每个1分，最高3分，须提供合同扫描件。',
 '# 付款安排','竣工验收合格后30日内支付合同价款。',
 '# 必须承诺','供应商必须提交无重大违法记录承诺函。'
].join('\n');
const longTender=tenderText+'\n\n'+Array.from({length:3},(_,i)=>
 `# 第${i+1}部分补充说明\n资料段落${i+1}应逐项复核。`+'普通说明。'.repeat(1700)
).join('\n\n');
const reply=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]}));
const inputOf=init=>JSON.parse(JSON.parse(init.body).messages[1].content);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

async function waitForGate(gate,signal){
 if(signal.aborted)throw new DOMException('cancelled','AbortError');
 let abort;
 const cancelled=new Promise((_,reject)=>{
  abort=()=>reject(new DOMException('cancelled','AbortError'));
  signal.addEventListener('abort',abort,{once:true});
 });
 try{await Promise.race([gate.promise,cancelled]);}
 finally{signal.removeEventListener('abort',abort);}
}

async function fixture(t,fetchImpl){
 const dataDir=await mkdtemp(join(tmpdir(),'biaoxi-server-ai-v2-'));
 const service=await createService({dataDir,port:0,fetchImpl});
 t.after(async()=>{await service.close();await rm(dataDir,{recursive:true,force:true});});
 const bootstrap=await(await fetch(service.url+'/api/bootstrap')).json();
 const headers={'X-Biaoxi-Token':bootstrap.token};
 const request=(path,method='GET',body)=>fetch(service.url+path,{
  method,headers:body instanceof FormData?headers:{...headers,'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})
 });
 const json=async(path,method,body)=>{
  const response=await request(path,method,body),value=await response.json();
  assert.ok(response.ok,`${path}: ${response.status} ${JSON.stringify(value)}`);return value;
 };
 const upload=async(role,name,text)=>{
  const form=new FormData();form.append('role',role);form.append('files',new Blob([text]),name);
  return (await json('/api/documents','POST',form)).documents[0];
 };
 const waitJob=async id=>{
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
   const job=await json('/api/jobs/'+id);
   if(['completed','failed','cancelled'].includes(job.status))return job;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('analysis job did not settle within the test deadline');
 };
 await json('/api/settings','PUT',{enabled:true,provider:'custom',baseUrl:'https://mock-provider.test/v1',model:'fixture-model',apiKey:'not-a-real-key'});
 return {dataDir,service,bootstrap,request,json,upload,waitJob};
}

function assertWorkbenchPreserved(report,bootstrap){
 assert.deepEqual(report.categories.map(category=>category.id),bootstrap.categories.map(category=>category.id));
 assert.equal(report.categories.length,14);
 assert.deepEqual(Object.keys(report.outputs).sort(),bootstrap.outputs.map(output=>output.id).sort());
 assert.ok(report.outputs.risks.length,'offline hard requirement remains in the four outputs');
 assert.ok(report.outputs.scoreItems.length,'scoring requirements remain in the four outputs');
 assert.ok(report.outputs.commitments.length,'mandatory commitment remains in the four outputs');
 assert.equal(report.outputs.conclusion.label,'待核验','model output cannot verify company facts');
}

function candidateFrom(input,title){
 const block=input.blocks.find(block=>block.role==='tender');
 const quote=block.text.match(/[^\n。！？]+[。！？]/)?.[0]||block.text.slice(0,30);
 return {categoryId:'consistency',documentId:block.documentId,blockId:block.blockId,quote,title,
  interpretation:'原文关联范围仍需人工复核',fields:{复核动作:'对照原件检查本段适用范围'},reviewed:true,matchStatus:'met'};
}

test('online synthesis is persisted on the original report ID with the full workbench and real selected-source references', {timeout:10000},async t=>{
 const reached=deferred(),gate=deferred();const seen=[];let selected;
 const h=await fixture(t,async(_,init)=>{
  const input=inputOf(init);seen.push(input);
  if(input.phase==='extraction'){
   selected=input.blocks;
   const block=input.blocks.find(block=>block.role==='tender'&&block.text.includes('竣工验收合格后30日内支付合同价款。'));
   return reply({findings:[{categoryId:'payment',documentId:block.documentId,blockId:block.blockId,
    quote:'竣工验收合格后30日内支付合同价款。',title:'模型付款补充候选',
    interpretation:'付款节点须与验收材料共同核验',fields:{复核动作:'确认验收材料形成时间'},reviewed:true,matchStatus:'met'}]});
  }
  reached.resolve();await waitForGate(gate,init.signal);
  const payment=selected.find(block=>block.role==='tender'&&block.text.includes('竣工验收合格后30日内支付合同价款。'));
  const attachment=selected.find(block=>block.role==='attachment');
  return reply({items:[{title:'验收与付款材料的衔接',interpretation:'验收材料形成后进入付款期限，应核验交接安排。',
   impact:'验收材料影响回款准备',actions:['确认验收证明的交接责任'],reviewed:true,matchStatus:'met',references:[
    {documentId:payment.documentId,blockId:payment.blockId,quote:'竣工验收合格后30日内支付合同价款。',page:999,fileName:'伪文件名'},
    {documentId:attachment.documentId,blockId:attachment.blockId,quote:attachment.text,page:998}
   ]}]});
 });
 const tender=await h.upload('tender','主文件.txt',tenderText);
 const attachment=await h.upload('attachment','技术说明.txt','验收时应提交施工材料检测记录。');
 const evidence=await h.upload('evidence','本次证照.txt','本次企业证照扫描件内容。');
 const {jobId}=await h.json('/api/analyses','POST',{documentIds:[tender.id],attachmentIds:[attachment.id],evidenceIds:[evidence.id],mode:'online'});
 await reached.promise;
 const running=await h.json('/api/jobs/'+jobId);
 assert.equal(running.status,'running');assert.equal(running.reportIds.length,1);
 const reportId=running.reportIds[0];
 const draft=await h.json('/api/reports/'+reportId);
 assertWorkbenchPreserved(draft,h.bootstrap);
 assert.equal((await h.request('/api/reports/'+reportId,'DELETE')).status,409);
 gate.resolve();const job=await h.waitJob(jobId);
 assert.equal(job.status,'completed',job.error);assert.deepEqual(job.reportIds,[reportId]);
 const report=await h.json('/api/reports/'+reportId);
 assert.equal(report.id,reportId);assert.equal(report.documentId,tender.id);assert.equal(report.mode,'online');
 assertWorkbenchPreserved(report,h.bootstrap);
 assert.equal(report.synthesis.status,'completed');assert.equal(report.synthesis.items.length,1);
 const item=report.synthesis.items[0];
 assert.equal(item.impact,'验收材料影响回款准备');assert.deepEqual(item.actions,['确认验收证明的交接责任']);
 assert.deepEqual(item.references.map(ref=>ref.documentId),[tender.id,attachment.id]);
 assert.deepEqual(item.references.map(ref=>ref.fileName),['主文件.txt','技术说明.txt']);
 assert.ok(item.references.every(ref=>ref.page!==999&&ref.page!==998));
 assert.equal(item.reviewed,undefined);assert.equal(item.matchStatus,undefined);
 const candidate=report.categories.flatMap(category=>category.items).find(item=>item.title==='模型付款补充候选');
 assert.ok(candidate);assert.equal(candidate.source,'ai');assert.equal(candidate.matchStatus,'pending');assert.equal(candidate.reviewed,false);
 assert.ok(candidate.fields['AI候选·复核动作（待核验）']);
 assert.deepEqual(report.attachmentIds,[attachment.id]);assert.deepEqual(report.evidenceIds,[evidence.id]);
 assert.ok(seen.some(input=>input.phase==='synthesis'));
 assert.ok(seen.filter(input=>input.phase==='extraction').some(input=>input.blocks.some(block=>block.documentId===evidence.id&&block.role==='evidence')));
 const disk=JSON.parse(await readFile(join(h.dataDir,'reports',reportId+'.json'),'utf8'));
 assert.deepEqual(disk.synthesis,report.synthesis);assert.equal(disk.id,reportId);
 const list=await h.json('/api/reports');assert.deepEqual(list.reports.map(report=>report.id),[reportId]);
 assert.notEqual(list.reports[0].analysisStatus,'归纳中');
 const reviewed=await h.json('/api/reports/'+reportId+'/review','POST',{findingId:candidate.id,status:'pending',note:'引用来源已核对但企业事实仍待人工复核'});
 assert.equal(reviewed.id,reportId);assert.deepEqual(reviewed.synthesis,report.synthesis);
 assertWorkbenchPreserved(reviewed,h.bootstrap);
});

for(const failure of ['chunk','synthesis'])test(`online ${failure} failure preserves source-checked candidates and a visible partial state on one saved report`, {timeout:10000},async t=>{
 let extractionCalls=0;const keptTitles=[];
 const h=await fixture(t,async(_,init)=>{
  const input=inputOf(init);
  if(input.phase==='extraction'){
   extractionCalls++;
   if(failure==='chunk'&&extractionCalls===2)return new Response('',{status:503});
   const title='模型保留候选'+extractionCalls;keptTitles.push(title);
   const valid=candidateFrom(input,title);
   return reply({findings:[valid,{...valid,title:'伪造候选不得保留',quote:'原文并不存在的要求。'}]});
  }
  return failure==='synthesis'?new Response('',{status:429}):reply({items:[]});
 });
 const tender=await h.upload('tender','多段主文件.txt',longTender);
 const {jobId}=await h.json('/api/analyses','POST',{documentIds:[tender.id],mode:'online'});
 const job=await h.waitJob(jobId);assert.equal(job.status,'completed',job.error);assert.equal(job.reportIds.length,1);
 assert.ok(extractionCalls>=3,'fixture exercises more than a single extraction request');
 const report=await h.json('/api/reports/'+job.reportIds[0]);
 assertWorkbenchPreserved(report,h.bootstrap);assert.equal(report.onlineFailed,true);
 const items=report.categories.flatMap(category=>category.items);
 for(const title of keptTitles){const item=items.find(item=>item.title===title);assert.ok(item,title);assert.equal(item.matchStatus,'pending');assert.equal(item.reviewed,false);}
 assert.ok(!items.some(item=>item.title==='伪造候选不得保留'));
 assert.ok(report.warnings.some(warning=>warning.code===(failure==='chunk'?'AI_CHUNK_FAILED':'AI_SYNTHESIS_FAILED')));
 assert.notEqual(report.synthesis.status,'completed');
 assert.equal(report.analysisStatus,'partial','human review status must not overwrite the incomplete online-analysis state');
 const disk=JSON.parse(await readFile(join(h.dataDir,'reports',report.id+'.json'),'utf8'));
 assert.equal(disk.id,job.reportIds[0]);assert.equal(disk.onlineFailed,true);assert.equal(disk.analysisStatus,'partial');
 assert.equal((await h.json('/api/reports')).reports.length,1);
});

test('cancelling during a later AI chunk saves verified partial results on the same report and releases its edit/export/delete locks', {timeout:10000},async t=>{
 const reached=deferred(),gate=deferred();let calls=0;
 const h=await fixture(t,async(_,init)=>{
  const input=inputOf(init);calls++;
  if(calls===2){reached.resolve();await waitForGate(gate,init.signal);}
  return reply({findings:[candidateFrom(input,'取消前已校验候选')]});
 });
 const tender=await h.upload('tender','取消主文件.txt',longTender);
 const {jobId}=await h.json('/api/analyses','POST',{documentIds:[tender.id],mode:'online'});
 await reached.promise;const running=await h.json('/api/jobs/'+jobId);const reportId=running.reportIds[0];
 assert.equal(running.status,'running');assert.ok(reportId);
 const draft=await h.json('/api/reports/'+reportId);assertWorkbenchPreserved(draft,h.bootstrap);
 const review={findingId:draft.categories.flatMap(category=>category.items)[0].id,status:'pending',note:'等待本次文件人工复核'};
 assert.equal((await h.request('/api/reports/'+reportId+'/review','POST',review)).status,409);
 assert.equal((await h.request('/api/reports/'+reportId+'/export?format=docx')).status,409);
 assert.equal((await h.request('/api/reports/'+reportId,'DELETE')).status,409);
 await h.json('/api/jobs/'+jobId+'/cancel','POST',{});
 const job=await h.waitJob(jobId);assert.equal(job.status,'cancelled');assert.deepEqual(job.reportIds,[reportId]);assert.equal(calls,2);
 const report=await h.json('/api/reports/'+reportId);assert.equal(report.id,reportId);assertWorkbenchPreserved(report,h.bootstrap);
 const candidate=report.categories.flatMap(category=>category.items).find(item=>item.title==='取消前已校验候选');
 assert.ok(candidate,'error.partialResult must be validated and saved instead of discarded');
 assert.equal(candidate.source,'ai');assert.equal(candidate.reviewed,false);assert.equal(candidate.matchStatus,'pending');
 assert.ok(candidate.references.every(ref=>ref.documentId===tender.id));
 assert.equal(report.synthesis.status,'cancelled');assert.equal(report.onlineFailed,true);
 assert.ok(report.warnings.some(warning=>warning.code==='AI_CANCELLED'));
 assert.equal(report.analysisStatus,'partial');
 const saved=JSON.parse(await readFile(join(h.dataDir,'reports',reportId+'.json'),'utf8'));
 assert.ok(saved.categories.flatMap(category=>category.items).some(item=>item.id===candidate.id));
 const reviewed=await h.json('/api/reports/'+reportId+'/review','POST',{findingId:candidate.id,status:'pending',note:'取消后保留原文并继续人工复核'});
 assert.equal(reviewed.id,reportId);assert.ok(reviewed.categories.flatMap(category=>category.items).some(item=>item.id===candidate.id));
 assert.equal(reviewed.analysisStatus,'partial','later manual review does not complete the cancelled whole-document analysis');
 assert.equal(reviewed.onlineFailed,true);assert.equal(reviewed.synthesis.status,'cancelled');
 const coverageReviewed=await h.json('/api/reports/'+reportId+'/coverage-review','POST',{reviewed:true,note:'已对照原件核对读取提示但联网综合仍未完成'});
 assert.equal(coverageReviewed.analysisStatus,'partial','a reading-coverage review does not complete cancelled AI synthesis');
 assert.equal(coverageReviewed.synthesis.status,'cancelled');
 const exported=await h.request('/api/reports/'+reportId+'/export?format=docx');
 assert.equal(exported.status,200);assert.ok((await exported.arrayBuffer()).byteLength>1000);
 const history=await h.json('/api/reports');assert.notEqual(history.reports[0].analysisStatus,'归纳中');
 assert.equal((await h.request('/api/reports/'+reportId,'DELETE')).status,200);
 assert.equal((await h.request('/api/reports/'+reportId)).status,404);
});
