import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {buildQualificationReview} from '../src/core/qualification.js';
import {predictionSummaryHTML} from '../public/score-summary.js';

const gate=(matchStatus='met')=>({id:'gate',categoryId:'rejection',title:'提交要求',quote:'必须按时提交响应文件。',hard:true,reviewed:true,matchStatus});
const report=(companySnapshot,categories=[])=>({companySnapshot,categories});
const topStatus=analysis=>load(predictionSummaryHTML(analysis))('.prediction-metrics>div').first().find('strong').text();

test('V9 no selected company and no recognized hard requirements remains pending without inventing gates',()=>{
 const result=buildQualificationReview(report(null));
 assert.equal(result.status,'pending');assert.equal(result.hardGate.status,'pending');
 assert.equal(result.groups.length,5);assert.ok(result.groups.every(group=>group.status==='pending'&&!group.required));
 assert.deepEqual(result.hardGate.findingIds,[]);assert.deepEqual(result.hardGate.failedFindingIds,[]);
});

test('V9 a selected company cannot satisfy an empty set of recognized hard requirements',()=>{
 const result=buildQualificationReview(report({id:'company',name:'演示企业',records:[]}));
 assert.equal(result.status,'pending');assert.equal(result.hardGate.status,'pending');
 assert.ok(result.groups.every(group=>!group.required));
});

test('V9 absent or blank company identity cannot aggregate reviewed non-company hard clauses as met',()=>{
 for(const companySnapshot of [null,{}, {id:''}, {id:'  '}]){
  const result=buildQualificationReview(report(companySnapshot,[{items:[gate()]}]));
  assert.equal(result.status,'pending');assert.equal(result.hardGate.status,'pending');
 }
});

test('V9 an explicitly reviewed hard failure remains unmet without a selected company',()=>{
 const result=buildQualificationReview(report(null,[{items:[gate('unmet')]}]));
 assert.equal(result.status,'unmet');assert.equal(result.hardGate.status,'unmet');
 assert.deepEqual(result.hardGate.failedFindingIds,['gate']);
});

test('V9 one evidenced applicable license gate can be met while unrequired groups remain pending',()=>{
 const license={id:'license',type:'entity',verified:true,documentIds:['license-doc'],fields:{registeredName:'演示企业',evidence:[{kind:'license',documentId:'license-doc',verified:true}]}};
 const result=buildQualificationReview(report({id:'company',name:'演示企业',records:[license]},[{items:[{...gate(),categoryId:'entity',title:'营业执照',quote:'供应商须提供营业执照。'}]}]));
 assert.equal(result.status,'met');assert.equal(result.hardGate.status,'met');
 assert.equal(result.groups.find(group=>group.id==='business-license').status,'met');
 assert.ok(result.groups.filter(group=>group.id!=='business-license').every(group=>!group.required&&group.status==='pending'));
});

test('V9 historical met summary without company identity displays pending without mutating saved analysis',()=>{
 for(const companyId of [null,undefined,'','  ']){
  const analysis={companyId,qualification:{status:'met',groups:[]}},before=structuredClone(analysis);
  assert.equal(topStatus(analysis),'待核验');assert.deepEqual(analysis,before);
 }
});

test('V9 summary preserves selected-company met and explicit unmet without a company',()=>{
 assert.equal(topStatus({companyId:'company',qualification:{status:'met'}}),'已确认满足');
 assert.equal(topStatus({companyId:null,qualification:{status:'unmet'}}),'已确认不满足');
 assert.equal(topStatus({companyId:'company',qualification:{status:'pending'}}),'待核验');
});
