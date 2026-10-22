import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSuitabilityAssessment,validateSuitabilityReview} from '../src/core/suitability.js';

const weights={qualification:35.29,business:35.29,fulfillment:29.42};
const manual=(scores={qualification:90,business:80,fulfillment:70})=>({dimensions:Object.fromEntries(Object.entries(scores).map(([id,score])=>[id,{score,note:'已依据企业原件及本项目计划进行内部评估'}]))});
const base=()=>({companySnapshot:{id:'tianyuan',records:[]},coverage:{complete:true},categories:[],analysis:{scoring:{status:'不适用',method:'最低价法',items:[]}},companyAnalysis:{companyId:'tianyuan',qualification:{status:'met',groups:[{id:'business-license',required:true,status:'met',references:[]}],hardGate:{status:'met'}},scoreRows:[],matches:[]}});

test('V16 suitability removes quotation and defaults to normalized three-dimension weights',()=>{
 const result=buildSuitabilityAssessment(base());
 assert.equal(result.version,'suitability-v16.1');assert.deepEqual(result.weights,weights);assert.deepEqual(result.dimensions.map(x=>x.id),['qualification','business','fulfillment']);
 assert.equal(JSON.stringify(result).includes('竞争报价'),false);assert.equal(JSON.stringify(result).includes('成本、报价测算'),false);
});

test('V16 three reasoned reference scores yield a point and recommendation without enterprise quotation inputs',()=>{
 const report=base();report.suitabilityReview=manual();const before=structuredClone(report),result=buildSuitabilityAssessment(report);
 assert.equal(result.referenceScore,80.59);assert.equal(result.recommendation.status,'recommend');assert.equal(result.recommendation.label,'可投');assert.deepEqual(result.totalRange,{min:35.29,max:100});assert.deepEqual(report,before);
 assert.ok(result.recommendation.reasons.some(x=>x.includes('三维')));assert.ok(result.recommendation.conditions.every(x=>!x.includes('报价事实')));
});

test('V16 normal validation accepts three weights and optional zero quotation compatibility only',()=>{
 assert.deepEqual(validateSuitabilityReview({weights}).weights,weights);
 assert.deepEqual(validateSuitabilityReview({weights:{...weights,quotation:0}}).weights,weights);
 assert.throws(()=>validateSuitabilityReview({weights:{qualification:30,business:30,fulfillment:25,quotation:15}}),/报价|quotation|三维/);
 assert.throws(()=>validateSuitabilityReview({dimensions:{quotation:{score:100,note:'旧报价参考分不应成为新适投维度'}}}),/未知|quotation|维度/);
});

test('V16 explicit legacy migration preserves remaining ratios, drops quotation score, and does not mutate metadata',()=>{
 const report=base();report.suitabilityReview={weights:{qualification:30,business:30,fulfillment:25,quotation:15},...manual({qualification:90,business:80,fulfillment:70,quotation:0})};
 const before=structuredClone(report),validated=validateSuitabilityReview(report.suitabilityReview,{migrateLegacy:true});
 assert.deepEqual(validated.weights,weights);assert.equal(Object.hasOwn(validated.dimensions,'quotation'),false);
 const result=buildSuitabilityAssessment(report);assert.equal(result.referenceScore,80.59);assert.equal(result.reviewMigration.migrated,true);assert.deepEqual(result.reviewMigration.previousWeights,report.suitabilityReview.weights);assert.ok(result.reviewMigration.note.includes('报价'));assert.deepEqual(report,before);
 report.suitabilityReview.dimensions.quotation.score=100;assert.equal(buildSuitabilityAssessment(report).referenceScore,80.59);
});

test('V16 legacy custom ratios normalize with exact total and unnormalizable input remains invalid',()=>{
 const report=base();report.suitabilityReview={weights:{qualification:40,business:20,fulfillment:20,quotation:20},...manual()};
 const result=buildSuitabilityAssessment(report);assert.deepEqual(result.weights,{qualification:50,business:25,fulfillment:25});assert.equal(result.referenceScore,82.5);
 assert.throws(()=>validateSuitabilityReview({weights:{qualification:0,business:0,fulfillment:0,quotation:100}},{migrateLegacy:true}),/三维|权重|归一/);
});

test('V16 legacy quotation-only manual references are ignored with an explicit migration notice',()=>{
 const report=base();report.suitabilityReview=manual({quotation:100});const result=buildSuitabilityAssessment(report);
 assert.equal(result.referenceScore,null);assert.equal(result.referenceRange,null);assert.equal(result.reviewMigration.migrated,true);assert.ok(result.recommendation.conditions.some(x=>/历史.*报价|报价.*移除/.test(x)));
});

test('V16 unknown qualification remains pending and a confirmed hard failure blocks high three-way scores',()=>{
 const report=base();report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100});report.companyAnalysis.qualification.status='pending';report.companyAnalysis.qualification.hardGate.status='pending';
 assert.equal(buildSuitabilityAssessment(report).recommendation.status,'pending');
 report.companyAnalysis.qualification.status='unmet';report.companyAnalysis.qualification.hardGate.status='unmet';assert.equal(buildSuitabilityAssessment(report).recommendation.status,'blocked');
});

test('V16 procurement quotation and pricing fields remain intact and independent',()=>{
 const report=base();report.analysis.scoring={method:'综合评分法',items:[{id:'price',group:'价格',maxScore:10}]};report.pricingAnalysis={compilation:[{value:'固定总价'}],evaluation:[{value:'价格得分10分'}]};report.suitabilityReview=manual();
 const before=structuredClone(report);const result=buildSuitabilityAssessment(report);assert.equal(result.dimensions.length,3);assert.deepEqual(report,before);assert.equal(report.analysis.scoring.items[0].maxScore,10);assert.equal(report.pricingAnalysis.evaluation[0].value,'价格得分10分');
});

test('V16 legacy rounding never creates a negative third weight or changes the 100 total',()=>{
 const input={weights:{qualification:39.996,business:40.004,fulfillment:0,quotation:20}};
 const migrated=validateSuitabilityReview(input,{migrateLegacy:true});
 assert.ok(Object.values(migrated.weights).every(x=>x>=0&&x<=100));assert.equal(Object.values(migrated.weights).reduce((a,b)=>a+b,0),100);
});
