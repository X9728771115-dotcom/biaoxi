import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createService} from '../src/server/service.js';
const weights={qualification:35.29,business:35.29,fulfillment:29.42};
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'biaoxi-suitability-')),svc=await createService({dataDir:root});t.after(async()=>{await svc.close();await rm(root,{recursive:true,force:true});});const {token}=await(await fetch(svc.url+'/api/bootstrap')).json();const req=(path,method='GET',body)=>fetch(svc.url+path,{method,headers:{'x-biaoxi-token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{svc,req};}
function original(){return{id:'report-v15',documentId:'t1',fileName:'演示旧报告.txt',createdAt:'2026-10-22T00:00:00Z',categories:[],outputs:{risks:[],scoreItems:[],commitments:[],conclusion:{label:'待核验',reasons:['原采购结论'],conditions:[]}},analysis:{scoring:{status:'not-applicable',items:[]}},companyAnalysis:{companyId:null,qualification:{status:'pending',groups:[],hardGate:{status:'pending',failedFindingIds:[]}},scoreRows:[],forecast:{status:'not-applicable'}}};}
test('读取旧报告补适投展示但不改写历史报告和原采购结论',async t=>{
 const f=await fixture(t),r=original();await f.svc.store.saveReport(r);const res=await f.req('/api/reports/'+r.id);assert.equal(res.status,200);const v=await res.json();assert.equal(v.suitabilityAssessment.weights.qualification,35.29);assert.notEqual(v.suitabilityAssessment.recommendation.status,'recommend');assert.deepEqual(await f.svc.store.getReport(r.id),r);assert.deepEqual(v.outputs,r.outputs);
});
test('保存适投权重与内部参考后重读仍在，不确认企业或原采购条件',async t=>{
 const f=await fixture(t),r=original();r.companySnapshot={id:'c1',name:'演示企业',records:[]};r.companyAnalysis.companyId='c1';await f.svc.store.saveReport(r);const before=structuredClone(r);const input={weights,dimensions:Object.fromEntries(Object.keys(weights).map(id=>[id,{score:95,note:'根据本项目资料作内部参考估计'}]))};const res=await f.req('/api/reports/'+r.id+'/suitability','PUT',input);assert.equal(res.status,200);const v=await res.json();assert.equal(v.suitabilityAssessment.referenceScore,95);assert.equal(v.suitabilityAssessment.recommendation.status,'pending');assert.deepEqual(v.outputs,before.outputs);assert.deepEqual(v.categories,before.categories);assert.deepEqual(v.companySnapshot,before.companySnapshot);assert.equal((await(await f.req('/api/reports/'+r.id)).json()).suitabilityReview.dimensions.business.score,95);
});
test('非法权重、越界值、短理由和伪造确认状态不能写入报告',async t=>{
 const f=await fixture(t),r=original();await f.svc.store.saveReport(r);
 for(const input of [{weights:{...weights,quotation:20}},{weights,dimensions:{business:{score:101,note:'充分明确的内部人工参考'}}},{weights,dimensions:{business:{score:50,note:'短'}}},{weights,hardGate:{status:'met'}},{weights,dimensions:{qualification:{score:100,note:'内部参考不等于资格确认',verified:true}}}]){const res=await f.req('/api/reports/'+r.id+'/suitability','PUT',input);assert.equal(res.status,400,await res.text());assert.deepEqual(await f.svc.store.getReport(r.id),r);}
});
