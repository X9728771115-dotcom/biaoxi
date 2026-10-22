import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSuitabilityAssessment,validateSuitabilityReview} from '../src/core/suitability.js';

const ref={documentId:'tender',blockId:'business',page:2,quote:'本项目采购条件'};
const group=(id,status='met',required=true)=>({id,label:id,status,required,requirements:[],references:[ref],missing:status==='pending'?['原件待核验']:[],reasons:[]});
const base=()=>({companySnapshot:{id:'company',name:'示例企业',records:[]},coverage:{complete:true,missingCategories:[],unrecognizedBlocks:[],missingAttachments:[]},categories:[],analysis:{scoring:{status:'计分项与分组总分校验通过',items:[],packages:[]}},companyAnalysis:{companyId:'company',qualification:{status:'met',groups:[group('business-license')],hardGate:{status:'met',failedFindingIds:[],pendingFindingIds:[]}},scoreRows:[],matches:[]}});
const manual=(scores={qualification:90,business:80,fulfillment:70})=>({dimensions:Object.fromEntries(Object.entries(scores).map(([id,score])=>[id,{score,note:'根据本企业现有材料作内部参考评估'}]))});
const dimension=(assessment,id)=>assessment.dimensions.find(item=>item.id===id);

// Treating absent enterprise evidence as actual zero or full points breaks this boundary.
test('V15 old and unbound reports keep all three dimensions and unknown ranges without a fabricated score',()=>{
 for(const report of [{},{analysis:{scoring:{method:'经评审最低价法',status:'不适用',items:[]}}}]){
  const result=buildSuitabilityAssessment(report);
  assert.equal(result.dimensions.length,3);assert.deepEqual(result.weights,{qualification:35.29,business:35.29,fulfillment:29.42});
  assert.deepEqual(result.totalRange,{min:0,max:100});assert.equal(result.referenceScore,null);assert.equal(result.recommendation.status,'pending');
  for(const item of result.dimensions){assert.notEqual(item.status,'not-applicable');assert.equal(item.score,null);assert.deepEqual(item.range,{min:0,max:100});}
 }
});

// Non-applicable and merely unlocated groups cannot dilute applicable verified qualification evidence.
test('V15 qualification averages only applicable groups and preserves pending groups as an interval',()=>{
 const report=base();report.companyAnalysis.qualification={status:'pending',hardGate:{status:'pending'},groups:[group('business-license'),group('construction-qualification'),group('personnel','pending'),group('safety-license','pending',false),group('performance','scoring-only',false)]};
 const result=buildSuitabilityAssessment(report),item=dimension(result,'qualification');
 assert.deepEqual(item.range,{min:66.67,max:100});assert.equal(item.score,null);assert.equal(result.hardGate.status,'pending');assert.equal(result.recommendation.status,'pending');
 assert.ok(item.gaps.some(value=>value.includes('原件待核验')));
});

// A high manual reference can never buy past a confirmed failed gate.
test('V15 confirmed qualification failures block even with three full-score manual references',()=>{
 const report=base();report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100,quotation:100});report.companyAnalysis.qualification.status='unmet';report.companyAnalysis.qualification.groups.push(group('personnel','unmet'));
 const result=buildSuitabilityAssessment(report);assert.equal(result.referenceScore,100);assert.equal(result.hardGate.status,'unmet');assert.equal(result.recommendation.status,'blocked');assert.equal(result.recommendation.label,'不建议投');
});

test('V15 a failedFindingId independently blocks an otherwise met qualification object',()=>{
 const report=base();report.companyAnalysis.qualification.hardGate.failedFindingIds=['failed-original'];report.suitabilityReview=manual();
 const result=buildSuitabilityAssessment(report);assert.equal(result.hardGate.status,'unmet');assert.ok(result.hardGate.failedFindingIds.includes('failed-original'));assert.equal(result.recommendation.status,'blocked');
});

// Borrowing the purchase forecast's technical, quotation or bill assumptions would inflate suitability.
test('V15 business uses only confirmed commercial evidence and defensible unresolved upper bounds',()=>{
 const report=base();report.companyAnalysis.scoreRows=[
  {scoreId:'evidence',group:'商务',maxScore:4,confirmedScore:2,referenceScore:4,range:{min:2,max:3},calculationKind:'objective',missing:['一份原件待确认'],references:[ref]},
  {scoreId:'extra',group:'附加',maxScore:1,confirmedScore:1,range:{min:1,max:1},calculationKind:'objective',references:[ref]},
  {scoreId:'bill',group:'商务',maxScore:5,confirmedScore:0,assumedScore:5,range:{min:5,max:5},calculationKind:'assumed-full'},
  {scoreId:'technical',group:'技术',maxScore:80,confirmedScore:80,assumedScore:80,range:{min:80,max:80},calculationKind:'assumed-full'},
  {scoreId:'price',group:'价格',maxScore:10,confirmedScore:10,assumedScore:10,range:{min:10,max:10},calculationKind:'assumed-full'}
 ];report.companyAnalysis.forecast={assumedScore:97,totalRange:{min:97,max:100}};
 const item=dimension(buildSuitabilityAssessment(report),'business');assert.deepEqual(item.range,{min:30,max:90});assert.equal(item.score,null);assert.ok(item.gaps.some(value=>/假设/.test(value)));assert.ok(item.references.length);
});

test('V15 a fully evidence-supported commercial zero can be known while missing company data cannot',()=>{
 const report=base();report.companyAnalysis.scoreRows=[{scoreId:'zero',group:'商务',maxScore:10,confirmedScore:0,expectedScore:0,range:{min:0,max:0},calculationKind:'objective'}];
 assert.equal(dimension(buildSuitabilityAssessment(report),'business').score,0);
 delete report.companySnapshot;const result=buildSuitabilityAssessment(report);assert.equal(dimension(result,'business').score,null);assert.deepEqual(dimension(result,'business').range,{min:0,max:100});
});

// A minimum-price tender still needs an internal commercial suitability assessment.
test('V15 lowest-price projects use actual non-scoring matches or retain unknown business suitability',()=>{
 const report=base();report.analysis={scoring:{method:'经评审最低价法',status:'不适用',items:[]}};report.companyAnalysis.forecast={status:'not-applicable'};
 report.categories=[{id:'performance',items:[{id:'experience',categoryId:'performance',hard:false,reviewed:true,matchStatus:'met',fields:{用途:'非评分商务证明'},references:[ref]}]}];
 report.companyAnalysis.matches=[{findingId:'experience',type:'performance',status:'supported',records:[{id:'contract',verified:true,status:'supported',evidenceIds:['original']}],references:[ref],missing:[]}];
 const known=dimension(buildSuitabilityAssessment(report),'business');assert.equal(known.score,100);assert.notEqual(known.status,'not-applicable');
 report.companyAnalysis.matches[0].status='candidate';const unknown=dimension(buildSuitabilityAssessment(report),'business');assert.equal(unknown.score,null);assert.deepEqual(unknown.range,{min:0,max:100});
});

// Procurement duties describe obligations; they are not facts about company liquidity or costs.
test('V15 tender payment duties and procurement quote assumptions do not confirm fulfillment readiness',()=>{
 const report=base();report.categories=[{id:'payment',items:[{id:'payment',reviewed:true,matchStatus:'met',quote:'企业须垫资并按期完成供货'}]}];report.companyAnalysis.forecast={scenario:{priceMax:100,total:100}};
 const result=buildSuitabilityAssessment(report);
 for(const id of ['fulfillment']){assert.equal(dimension(result,id).score,null);assert.deepEqual(dimension(result,id).range,{min:0,max:100});assert.ok(dimension(result,id).gaps.length);}
});

test('V15 explicit manual references preserve factual ranges, notes, and immutable report facts',()=>{
 const report=base();report.suitabilityReview=manual();const before=structuredClone(report),result=buildSuitabilityAssessment(report);
 assert.equal(result.referenceScore,80.59);assert.deepEqual(dimension(result,'fulfillment').range,{min:0,max:100});assert.equal(dimension(result,'fulfillment').score,70);assert.equal(dimension(result,'fulfillment').manualReference,true);
 assert.deepEqual(result.totalRange,{min:35.29,max:100});assert.deepEqual(result.referenceRange,{min:80.59,max:80.59});assert.deepEqual(report,before);
});

// A partial reference must not silently impute zero to the remaining dimensions.
test('V15 partial reference scores produce only a labeled reference interval and no total point',()=>{
 const report=base();report.suitabilityReview=manual({business:80});const result=buildSuitabilityAssessment(report);
 assert.equal(result.referenceScore,null);assert.deepEqual(result.referenceRange,{min:63.52,max:92.94});assert.equal(result.recommendation.status,'pending');assert.equal(dimension(result,'fulfillment').manualReference,false);
});

// Internal thresholds become usable only after factual eligibility and original coverage are settled.
test('V15 complete internal reference scores yield threshold suggestions only with met gates and confirmed coverage',()=>{
 for(const [score,status,label] of [[80,'recommend','可投'],[60,'cautious','谨慎可投'],[59,'not-recommended','不建议投']]){
  const report=base();report.suitabilityReview=manual({qualification:score,business:score,fulfillment:score,quotation:score});const result=buildSuitabilityAssessment(report);
  assert.equal(result.recommendation.status,status);assert.equal(result.recommendation.label,label);assert.equal(result.recommendation.basis,'manual-reference');assert.ok(result.recommendation.conditions.some(value=>/内部参考/.test(value)));
  assert.equal(result.hardGate.status,'met');assert.deepEqual(dimension(result,'fulfillment').range,{min:0,max:100});
 }
});

test('V15 reference scores cannot settle an unbound company, pending qualification, or unreviewed coverage',()=>{
 const noCompany=base();delete noCompany.companySnapshot;
 const pending=base();pending.companyAnalysis.qualification.status='pending';pending.companyAnalysis.qualification.hardGate.status='pending';
 const uncovered=base();uncovered.coverage.complete=false;
 for(const report of [noCompany,pending,uncovered]){report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100,quotation:100});const result=buildSuitabilityAssessment(report);assert.equal(result.recommendation.status,'pending');}
 assert.equal(buildSuitabilityAssessment(noCompany).referenceScore,null);
 uncovered.coverageReview={reviewed:true,note:'已对照完整采购原件人工核对覆盖'};assert.equal(buildSuitabilityAssessment(uncovered).recommendation.status,'recommend');
});

test('V15 changing weights adjusts total bounds and reference points without changing enterprise evidence',()=>{
 const report=base();report.suitabilityReview={...manual(),weights:{qualification:40,business:30,fulfillment:30},thresholds:{recommend:85,cautious:65}};
 const result=buildSuitabilityAssessment(report);assert.equal(result.referenceScore,81);assert.deepEqual(result.totalRange,{min:40,max:100});assert.equal(result.recommendation.status,'cautious');assert.equal(dimension(result,'qualification').weight,40);assert.deepEqual(result.thresholds,{recommend:85,cautious:65});
});

test('V15 invalid weights reject sums, missing keys, non-finite values, and out-of-range values',()=>{
 for(const weights of [{qualification:30,business:30,fulfillment:25,quotation:14},{qualification:30},{qualification:NaN,business:30,fulfillment:25,quotation:15},{qualification:Infinity,business:30,fulfillment:25,quotation:15},{qualification:-1,business:31,fulfillment:30,quotation:40},{qualification:101,business:0,fulfillment:0,quotation:-1}])assert.throws(()=>validateSuitabilityReview({weights}),/权重|100|有限/);
});

test('V15 manual scores require finite bounded numbers and meaningful bounded notes',()=>{
 for(const entry of [{score:NaN,note:'根据现有材料进行内部参考'},{score:Infinity,note:'根据现有材料进行内部参考'},{score:101,note:'根据现有材料进行内部参考'},{score:-1,note:'根据现有材料进行内部参考'},{score:'80',note:'根据现有材料进行内部参考'},{score:80,note:'不足理由'},{score:80,note:'字'.repeat(2001)}])assert.throws(()=>validateSuitabilityReview({dimensions:{business:entry}}),/参考|理由|分数|有限/);
 assert.equal(validateSuitabilityReview({dimensions:{business:{score:0,note:'根据已确认缺口作零分内部参考'}}}).dimensions.business.score,0);
});

test('V15 threshold ordering and bounds are enforced',()=>{
 for(const thresholds of [{recommend:60,cautious:60},{recommend:60,cautious:70},{recommend:101,cautious:60},{recommend:80,cautious:-1},{recommend:NaN,cautious:60}])assert.throws(()=>validateSuitabilityReview({thresholds}),/阈值|有限/);
});

// A review payload is never an alternate route for changing evidence or qualification state.
test('V15 rejects evidence-state and prototype injection while retaining notes as inert plain text',()=>{
 for(const input of [{reviewed:true},{companySnapshot:{}},{hardGate:{status:'met'}},{dimensions:{business:{score:80,note:'根据现有材料进行内部参考',reviewed:true}}},{dimensions:{qualification:{score:80,note:'根据现有材料进行内部参考',matchStatus:'met'}}},JSON.parse('{"__proto__":{"polluted":true}}'),{weights:JSON.parse('{"qualification":30,"business":30,"fulfillment":25,"quotation":15,"__proto__":{}}')}])assert.throws(()=>validateSuitabilityReview(input),/字段|对象|仅|未知/);
 const note='<script>alert("仅为文本")</script>内部参考理由';const result=validateSuitabilityReview({dimensions:{business:{score:80,note}}});assert.equal(result.dimensions.business.note,note);assert.equal({}.polluted,undefined);
});

test('V15 corrupt historical suitability reviews fall back safely instead of breaking the report',()=>{
 const report=base();report.suitabilityReview={weights:{qualification:100,business:100,fulfillment:100,quotation:100}};const result=buildSuitabilityAssessment(report);
 assert.deepEqual(result.weights,{qualification:35.29,business:35.29,fulfillment:29.42});assert.equal(result.referenceScore,null);assert.ok(result.recommendation.conditions.some(value=>/无效|非法|校验/.test(value)));
});

// An unselected lot cannot become applicable merely because all other groups and manual points are complete.
test('V15 unresolved lot scope stays pending despite confirmed coverage and three full-score references',()=>{
 for(const categoryId of ['qualification','personnel'])for(const matchStatus of ['pending','unmet']){
  const report=base();report.coverageReview={reviewed:true,note:'已核对完整采购原文覆盖范围'};report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100,quotation:100});
  report.categories=[{id:categoryId,items:[{id:'lot',categoryId,source:'offline',scope:{lot:'1'},scopePending:true,scopedHard:true,hard:false,reviewed:matchStatus==='unmet',matchStatus,quote:'标段1具备消防资质',references:[ref]}]}];
  const result=buildSuitabilityAssessment(report);assert.equal(result.recommendation.status,'pending');assert.equal(result.hardGate.status,'pending');assert.ok(result.hardGate.pendingFindingIds.includes('lot'));assert.deepEqual(dimension(result,'qualification').range,{min:0,max:100});assert.ok(result.recommendation.conditions.some(value=>/标段|范围/.test(value)));
 }
});

// The former average of mutually exclusive lots produced a misleading confirmed score of 50.
test('V15 unresolved procurement packages cannot be averaged into a confirmed commercial suitability score',()=>{
 const report=base();report.analysis.scoring={status:'已按2个采购包分别整理，待核验',packages:[{package:'1'},{package:'2'}],items:[]};
 report.companyAnalysis.scoreRows=[{scoreId:'one',group:'商务',maxScore:10,confirmedScore:10,range:{min:10,max:10},calculationKind:'objective',scope:{documentId:'d',package:'1'}},{scoreId:'two',group:'商务',maxScore:10,confirmedScore:0,range:{min:0,max:0},calculationKind:'objective',scope:{documentId:'d',package:'2'}}];report.companyAnalysis.forecast={totalRange:null};
 let result=buildSuitabilityAssessment(report),item=dimension(result,'business');assert.equal(item.score,null);assert.equal(item.status,'pending');assert.deepEqual(item.range,{min:0,max:100});assert.ok(item.gaps.some(value=>/采购包|评分.*范围/.test(value)));
 report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100,quotation:100});result=buildSuitabilityAssessment(report);assert.equal(result.recommendation.status,'pending');
});

test('V15 conflicting row scopes remain unknown even if a stale scoring summary claims complete',()=>{
 const report=base();report.companyAnalysis.scoreRows=[{scoreId:'one',group:'商务',maxScore:10,confirmedScore:10,range:{min:10,max:10},calculationKind:'objective',scope:{documentId:'d',package:'1'}},{scoreId:'two',group:'商务',maxScore:10,confirmedScore:0,range:{min:0,max:0},calculationKind:'objective',scope:{documentId:'d',package:'2'}}];
 assert.deepEqual(dimension(buildSuitabilityAssessment(report),'business').range,{min:0,max:100});
 report.companyAnalysis.scoreRows[1].scope.package='1';const resolved=dimension(buildSuitabilityAssessment(report),'business');assert.equal(resolved.score,50);assert.equal(resolved.status,'confirmed');
});

// A derived failure belongs to its frozen enterprise context, not to the next company selected.
test('V15 unbound reports and mismatched company identities never inherit an old enterprise failure',()=>{
 for(const selected of [undefined,{id:'new-company',name:'新企业'}]){
  const report=base();report.companySnapshot=selected;report.companyAnalysis.companyId='old-company';report.companyAnalysis.qualification={status:'unmet',groups:[group('business-license','unmet')],hardGate:{status:'unmet',failedFindingIds:['old-company-gate'],pendingFindingIds:[]}};report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100,quotation:100});
  const before=structuredClone(report),result=buildSuitabilityAssessment(report);assert.equal(result.hardGate.status,'pending');assert.equal(result.recommendation.status,'pending');assert.deepEqual(result.hardGate.failedFindingIds,[]);assert.equal(result.referenceScore,null);assert.deepEqual(report,before);
 }
});

// An unreviewed AI proposal cannot add an authoritative scope restriction to verified local facts.
test('V15 unreviewed AI scope candidates do not block an otherwise supported internal recommendation',()=>{
 const report=base();report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100,quotation:100});report.coverageReview={reviewed:true,note:'已核对完整采购原文覆盖范围'};
 report.categories=[{id:'qualification',items:[{id:'ai-lot',categoryId:'qualification',source:'ai',scope:{lot:'1'},scopePending:true,hard:false,reviewed:false,matchStatus:'pending',references:[ref]}]}];
 let result=buildSuitabilityAssessment(report);assert.equal(result.recommendation.status,'recommend');assert.equal(result.hardGate.status,'met');assert.deepEqual(dimension(result,'qualification').range,{min:100,max:100});
 report.categories[0].items[0].reviewed=true;result=buildSuitabilityAssessment(report);assert.equal(result.recommendation.status,'pending');assert.equal(result.hardGate.status,'pending');
});

test('V15 expressly exempt or manually inapplicable scoped clauses do not remain unresolved blockers',()=>{
 for(const exemption of [{applicability:'not-required',reviewed:false,matchStatus:'pending'},{reviewed:true,matchStatus:'not-applicable'}]){
  const report=base();report.suitabilityReview=manual({qualification:100,business:100,fulfillment:100,quotation:100});report.categories=[{id:'qualification',items:[{id:'exempt-lot',source:'offline',scope:{lot:'1'},scopePending:true,hard:false,references:[ref],...exemption}]}];
  const result=buildSuitabilityAssessment(report);assert.equal(result.recommendation.status,'recommend');assert.equal(result.hardGate.status,'met');assert.deepEqual(result.hardGate.pendingFindingIds,[]);
 }
});
