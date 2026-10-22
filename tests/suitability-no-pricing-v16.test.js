import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSuitabilityAssessment} from '../src/core/suitability.js';

const scope=(pkg='1')=>({documentId:'roof-original',package:pkg,lot:null,mixedPackages:false,phase:'response'});
const ref=(id,quote)=>({documentId:'roof-original',blockId:id,page:36,quote});
const priceRule='经评审专家评审的综合单价报价合理，得5分；发生超出常规不均衡报价，每处扣0.5分。';
const performanceRule='提供2023年1月1日至今的同类项目合同及验收报告，每提供1个得1分，最多3分。';
const item=(id,title,standard,maxScore=3,group='商务',pkg='1')=>({id,title,standard,readableStandard:standard,maxScore,group,scope:scope(pkg),materials:[],references:[ref(id,standard)]});
const row=(source,confirmedScore=1,extra={})=>({scoreId:source.id,title:source.title,group:source.group,maxScore:source.maxScore,confirmedScore,assumedScore:null,calculationKind:'objective',range:{min:confirmedScore,max:source.maxScore},materials:source.materials,references:source.references,scope:source.scope,...extra});
const base=(items,rows=items.map(x=>row(x)))=>({companySnapshot:{id:'tianyuan',records:[]},coverage:{complete:true},categories:[],analysis:{scoring:{status:'已确认',items,total:100}},companyAnalysis:{companyId:'tianyuan',qualification:{status:'met',groups:[{id:'business-license',required:true,status:'met'}],hardGate:{status:'met'}},scoreRows:rows,matches:[]}});
const business=report=>buildSuitabilityAssessment(report).dimensions.find(x=>x.id==='business');
const manual=report=>{report.suitabilityReview={dimensions:{qualification:{score:87.5,note:'企业证照原件已核，人员动态占用证明尚待补齐'},business:{score:33.33,note:'仅按一项已核同类业绩计算非报价商务准备度'},fulfillment:{score:30,note:'历史经营资料已核，拟派人员局部可用，现时资金和施工组织待补齐'}}};return report;};
const price=()=>{const x=item('bill','组价合理性',priceRule,5);x.materials=['投标(响应)报价明细表、已标价工程量清单、开标(报价)一览表'];return x;};
const pendingGate=report=>{report.companyAnalysis.qualification.status='pending';report.companyAnalysis.qualification.hardGate.status='pending';return report;};

// Catches the original business denominator bug: a verified 1/3 performance
// must stay 33.33%, independently of the original 5-point bill scenario.
test('V16 excludes roof bill scoring from suitability without changing the 13-item 100-point procurement table',()=>{
 const bill=price(),performance=item('performance','同类业绩',performanceRule);
 const technical=[7,5,12,12,10,10,10,5,6,5].map((max,i)=>item(`technical-${i}`,`施工组织${i}`,'施工组织评审',max,'技术'));
 const quotation=item('quotation','投标价格得分','价格得分采用评审价格公式',10,'价格');
 const items=[...technical,bill,performance,quotation],report=base(items,items.map(x=>row(x,x===performance?1:0,x===bill?{assumedScore:5,calculationKind:'assumed-full',range:{min:5,max:5}}:{})));
 const before=structuredClone(report),result=business(report);
 assert.deepEqual(result.range,{min:33.33,max:100});
 assert.deepEqual(result.references,[ref('performance',performanceRule)]);
 assert.equal(result.basis.some(x=>x.includes('1/3')),true);
 assert.equal(JSON.stringify(result).includes(priceRule),false);
 assert.deepEqual(report,before);
 assert.equal(report.analysis.scoring.items.length,13);
 assert.equal(report.analysis.scoring.items.reduce((sum,x)=>sum+x.maxScore,0),100);
 assert.equal(report.companyAnalysis.scoreRows.filter(x=>x.group==='商务').reduce((sum,x)=>sum+x.maxScore,0),8);
});

test('V16 identifies a renamed bill row through its linked original scoring rule',()=>{
 const bill=price(),performance=item('performance','同类业绩',performanceRule);
 const report=base([bill,performance],[row(bill,0,{title:'商务条目十一',assumedScore:5,calculationKind:'assumed-full',materials:[],references:[]}),row(performance)]);
 assert.deepEqual(business(report).range,{min:33.33,max:100});
});

test('V16 identifies bill-only scoreRows from their retained original reference when scoring metadata is absent',()=>{
 const bill=price(),performance=item('performance','同类业绩',performanceRule);
 const report=base([performance],[row(bill,0,{title:'商务条目十一',assumedScore:5,calculationKind:'assumed-full'}),row(performance)]);
 assert.deepEqual(business(report).range,{min:33.33,max:100});
 assert.deepEqual(business(report).references,[ref('performance',performanceRule)]);
});

test('V16 does not discard ordinary business personnel evidence because its title mentions quotation preparation',()=>{
 const personnel=item('staff','报价编制人员资格','拟派造价师具有有效资格证书，提供本单位注册证明。',4);
 const performance=item('performance','同类业绩',performanceRule,6);
 const report=base([personnel,performance],[row(personnel,4,{range:{min:4,max:4}}),row(performance,3,{range:{min:3,max:3}})]);
 assert.equal(business(report).score,70);
 assert.equal(business(report).references.length,2);
});

test('V16 a combined commercial-price group name does not discard an independently scored certificate',()=>{
 const certificate=item('certificate','企业认证','具有有效认证证书得2分',2,'商务报价与资信');
 const report=base([certificate],[row(certificate,2,{group:'商务',range:{min:2,max:2}})]);
 assert.equal(business(report).score,100);
 assert.deepEqual(business(report).references,[ref('certificate','具有有效认证证书得2分')]);
});

test('V16 all-pricing business rows provide no suitability score or pricing evidence',()=>{
 const bill=price(),report=base([bill],[row(bill,5,{range:{min:5,max:5}})]);
 const result=business(report);
 assert.equal(result.score,null);
 assert.deepEqual(result.range,{min:0,max:100});
 assert.deepEqual(result.references,[]);
 assert.equal(result.basis.some(x=>/非报价/.test(x)),true);
});

test('V16 price-deduction add-ons cannot become non-pricing business readiness',()=>{
 const deduction=item('deduction','小微企业支持','对小微企业报价给予5%的扣除。',5,'附加');
 const certificate=item('certificate','企业认证','具有有效认证证书得2分',2);
 const report=base([deduction,certificate],[row(deduction,0),row(certificate,2,{range:{min:2,max:2}})]);
 assert.equal(business(report).score,100);
 assert.deepEqual(business(report).references,[ref('certificate','具有有效认证证书得2分')]);
});

test('V16 a mixed pricing and company-evidence scoring rule stays pending until its non-price points are separable',()=>{
 const mixed=item('mixed','综合商务','综合单价报价合理得3分；提供有效造价师资格证书得2分。',5);
 const performance=item('performance','同类业绩',performanceRule);
 const report=base([mixed,performance],[row(mixed,5,{range:{min:5,max:5}}),row(performance)]);
 const result=business(report);
 assert.equal(result.score,null);
 assert.deepEqual(result.range,{min:0,max:100});
 assert.equal(result.gaps.some(x=>/拆分/.test(x)),true);
 assert.deepEqual(result.references,[ref('performance',performanceRule)]);
});

test('V16 a pricing row from another scope does not enter non-pricing business scope or evidence',()=>{
 const bill=price();bill.scope=scope('2');
 const performance=item('performance','同类业绩',performanceRule);
 const report=base([bill,performance],[row(bill,5,{scopePending:true}),row(performance)]);
 assert.deepEqual(business(report).range,{min:33.33,max:100});
 assert.deepEqual(business(report).references,[ref('performance',performanceRule)]);
});

test('V16 unresolved or mixed non-pricing business scopes remain pending without averaging packages',()=>{
 const performance=item('performance','同类业绩',performanceRule),other=item('other','企业认证','具有有效认证证书得2分',2,'商务','2');
 const report=base([performance,other]);
 assert.deepEqual(business(report).range,{min:0,max:100});
 const single=base([performance],[row(performance,1,{scopePending:true})]);
 assert.deepEqual(business(single).range,{min:0,max:100});
});

test('V16 internal action says complete evidence before bidding when a reference point exists but qualification is pending',()=>{
 const report=pendingGate(manual(base([],[]))),before=structuredClone(report),result=buildSuitabilityAssessment(report);
 assert.equal(result.referenceScore,51.47);
 assert.ok(result.internalAction);
 assert.equal(result.internalAction.label,'先补齐再投');
 assert.equal(result.internalAction.status,'conditional');
 assert.equal(result.recommendation.status,'pending');
 assert.equal(result.hardGate.status,'pending');
 assert.deepEqual(report,before);
});

test('V16 internal action cannot override a confirmed hard failure with high manual reference scores',()=>{
 const report=manual(base([],[]));report.companyAnalysis.qualification.status='unmet';report.companyAnalysis.qualification.hardGate.status='unmet';
 const result=buildSuitabilityAssessment(report);
 assert.ok(result.internalAction);
 assert.equal(result.internalAction.label,'不建议投');
 assert.equal(result.internalAction.status,'blocked');
 assert.equal(result.recommendation.status,'blocked');
});

test('V16 internal action confirms the intended scope before giving a specific bid action',()=>{
 const performance=item('performance','同类业绩',performanceRule),other=item('other','企业认证','具有有效认证证书得2分',2,'商务','2');
 const result=buildSuitabilityAssessment(pendingGate(manual(base([performance,other]))));
 assert.ok(result.internalAction);
 assert.equal(result.internalAction.label,'先确认所投范围');
 assert.equal(result.internalAction.status,'scope-pending');
 assert.equal(result.recommendation.status,'pending');
});

test('V16 an invalid company binding or incomplete reference does not receive a conditional bid action',()=>{
 const unbound=manual(base([],[]));unbound.companyAnalysis.companyId='another-company';
 assert.ok(buildSuitabilityAssessment(unbound).internalAction);
 assert.equal(buildSuitabilityAssessment(unbound).internalAction.status,'pending');
 assert.equal(buildSuitabilityAssessment(pendingGate(base([],[]))).internalAction.status,'pending');
});
