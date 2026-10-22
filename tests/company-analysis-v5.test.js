import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeDocument} from '../src/core/analyzer.js';
import {buildCompanyAnalysis} from '../src/core/company-analysis.js';

const scope={documentId:'v5-tender',package:'1',phase:'response'};
const source={documentId:'v5-tender',blockId:'v5-block',page:1,quote:'测试原文'};
const standard='屋面维修项目业绩：2023年1月1日起，以合同签订日期为准，每个合同得1分，最高3分，须提供合同扫描件以及验收报告。客观';
const score=(id,group,maxScore,title,rule='主观')=>({id,group,maxScore,title,standard:rule,references:[source],materials:[],scope});
const record=(id,verified=true)=>({id,type:'performance',name:'演示合同'+id,verified,documentIds:['contract-'+id,'acceptance-'+id],fields:{subjectName:'演示企业',projectType:'屋面维修',contractNumber:id,contractDate:'2024-01-01',evidence:[{kind:'contract',documentId:'contract-'+id,verified:true},{kind:'acceptanceReport',documentId:'acceptance-'+id,verified:true}]}});
const report=(items,records=[])=>({createdAt:'2026-10-16T00:00:00Z',companySnapshot:{id:'v5-company',name:'演示企业',records},categories:[],analysis:{scoring:{items,status:'计分项与分组总分校验通过',packages:[{scope,items}]}}});

// Losing the business-group bill assumption used to leave this synthetic scenario at 92 plus eight unknown points.
test('V5 synthetic roof forecast counts technical bill and price exactly once with an unresolved three-point performance range',async()=>{
 const extraction=JSON.parse(await readFile(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8'));
 const result=analyzeDocument(extraction),analysis=result.companyAnalysis;
 assert.equal(analysis.scoreRows.length,13);assert.equal(analysis.forecast.assumedScore,97);
 assert.deepEqual(analysis.forecast.totalRange,{min:97,max:100});
 const bill=analysis.scoreRows.find(row=>row.title==='组价合理性');assert.equal(bill.assumedScore,5);assert.equal(bill.expectedScore,null);assert.equal(bill.calculationKind,'assumed-full');
 assert.equal(analysis.forecast.business.maxScore,8);assert.equal(analysis.forecast.business.pendingMaxScore,3);
 assert.ok(analysis.scoreRows.find(row=>row.title==='同类业绩').missing.some(value=>value.includes('类型口径')));
 assert.equal(analysis.forecast.scenario.total,null);assert.equal(analysis.qualification.groups.find(group=>group.id==='performance').status,'scoring-only');
 assert.equal(result.categories.length,14);assert.deepEqual(Object.keys(result.outputs).sort(),['commitments','conclusion','risks','scoreItems']);
});

// An incomplete extra contract must not erase points already supported by two other complete contracts.
test('V5 partial objective evidence keeps confirmed points separate from the unresolved candidate',()=>{
 const r=report([score('performance','商务',3,'屋面维修项目业绩',standard)],[record('one'),record('two'),record('three',false)]),analysis=buildCompanyAnalysis(r),row=analysis.scoreRows[0];
 assert.equal(row.expectedScore,null);assert.equal(row.confirmedScore,2);assert.equal(row.conditionalScore,null);assert.deepEqual(row.range,{min:2,max:3});
 assert.deepEqual(analysis.forecast.totalRange,{min:2,max:3});assert.equal(analysis.forecast.business.gap,1);
});

// A point reference is not an evidence-confirmed subjective score or a defensible narrow range.
test('V5 subjective estimates retain reasons and broad bounds without becoming confirmed evidence',()=>{
 const r=report([score('subjective','商务',4,'服务承诺质量')]);r.scoreAssessments=[{scoreId:'subjective',estimatedScore:3,reason:'人工依据现有承诺材料给出条件性参考'}];
 const row=buildCompanyAnalysis(r).scoreRows[0];assert.equal(row.confirmedScore,0);assert.equal(row.conditionalScore,3);assert.equal(row.expectedScore,null);assert.deepEqual(row.range,{min:0,max:4});assert.ok(row.reasons.some(reason=>reason.includes('人工依据')));
});

// Bill keywords must not waive separately scored history or certificate evidence.
test('V5 bill compilation performance and mixed certificate items cannot receive assumed full points',()=>{
 const cases=[
  ['工程量清单编制业绩','清单编制项目业绩，每个合同得2分，最高8分，须提供合同扫描件。客观'],
  ['组价合理性及同类项目经验','组价合理性和同类业绩综合评价，最高8分，须提供合同及验收报告。主观'],
  ['清单编制资质','具有清单编制资质证书得8分，须提供有效证书。客观']
 ];
 for(const [title,rule]of cases){const analysis=buildCompanyAnalysis(report([score('bill-proof','商务',8,title,rule)])),row=analysis.scoreRows[0];
  assert.equal(row.assumedScore,null,title);assert.notEqual(row.calculationKind,'assumed-full',title);assert.equal(row.expectedScore,null,title);assert.deepEqual(row.range,{min:0,max:8},title);assert.equal(row.gap,8,title);assert.ok(row.missing.length,title);assert.equal(analysis.forecast.scenario.total,null,title);
 }
});

// Five empty qualification groups must remain unknown rather than failed or satisfied.
test('V5 five qualification groups preserve missing evidence as pending',()=>{
 const r=report([]);r.categories=[{id:'qualification',items:[{id:'q',categoryId:'qualification',title:'特定资格',quote:'须有建筑工程施工总承包三级资质及有效安全生产许可证。',hard:true,reviewed:false,matchStatus:'pending',references:[source],fields:{}}]}];
 const analysis=buildCompanyAnalysis(r);assert.equal(analysis.qualification.groups.length,5);assert.equal(analysis.qualification.status,'pending');
 for(const id of ['business-license','construction-qualification','safety-license','personnel'])assert.equal(analysis.qualification.groups.find(group=>group.id===id).status,'pending');
 assert.equal(analysis.qualification.groups.some(group=>group.status==='unmet'),false);
});

// An unlocated requirement is a display warning, not permission to add another eligibility gate.
test('V5 only an applicable business-license gate needs evidence after coverage is reviewed',()=>{
 const license={id:'license',type:'entity',verified:true,documentIds:['license-doc'],fields:{registeredName:'演示企业',creditCode:'DEMO-ONLY',evidence:[{kind:'license',documentId:'license-doc',verified:true}]}};
 const r=report([],[license]);r.coverageReview={reviewed:true,note:'逐页核对采购原文，本项目只明示营业执照门槛'};
 r.categories=[{id:'entity',items:[{id:'license-gate',categoryId:'entity',title:'营业执照',quote:'供应商须提供营业执照。',hard:true,reviewed:true,matchStatus:'met',references:[source],fields:{}}]}];
 const result=buildCompanyAnalysis(r).qualification;assert.equal(result.status,'met');assert.equal(result.hardGate.status,'met');
 const unlocated=result.groups.find(group=>group.id==='safety-license');assert.equal(unlocated.required,false);assert.equal(unlocated.status,'pending');
});

// Reviewed clause text and one unrelated confirmed document cannot fill missing evidence for a different qualification.
test('V5 reviewed construction clause stays pending when enterprise has only a confirmed business license',()=>{
 const r=report([],[{id:'license',type:'entity',verified:true,documentIds:['license-doc'],fields:{registeredName:'演示企业',evidence:[{kind:'license',documentId:'license-doc',verified:true}]}}]);
 r.categories=[{id:'qualification',items:[{id:'q',categoryId:'qualification',title:'企业资质',quote:'供应商须具有建筑工程施工总承包三级资质。',hard:true,reviewed:true,matchStatus:'met',references:[source],fields:{}}]}];
 assert.equal(buildCompanyAnalysis(r).qualification.groups.find(group=>group.id==='construction-qualification').status,'pending');
});

// A reviewed personnel clause cannot make the absent separately required B original appear.
test('V5 a reviewed manager clause with only registration evidence cannot confirm the B certificate',()=>{
 const manager={id:'manager',type:'personnel',verified:true,documentIds:['registration'],fields:{role:'项目经理',specialty:'建筑工程',grade:'二级',employer:'演示企业',registeredHere:true,noConcurrentProject:true,validUntil:'2028-01-01',bCertificateNumber:'B-number',evidence:[{kind:'registration',documentId:'registration',verified:true}]}};
 const r=report([],[manager]);r.categories=[{id:'personnel',items:[{id:'manager-gate',categoryId:'personnel',title:'项目经理资格',quote:'拟派项目经理须提供建筑工程专业二级及以上建造师注册证和有效B证，本单位注册且不兼职。',hard:true,reviewed:true,matchStatus:'met',references:[source],fields:{}}]}];
 assert.equal(buildCompanyAnalysis(r).qualification.groups.find(group=>group.id==='personnel').status,'pending');
});

// A reviewed clause must not conceal known specialty and grade counter-evidence shown by the record matcher.
test('V5 qualification and matches reject the same confirmed personnel specialty and grade mismatch',()=>{
 const manager={id:'mismatch-manager',type:'personnel',verified:true,documentIds:['manager-registration'],fields:{role:'项目经理',employer:'演示企业',specialty:'市政公用工程',grade:'二级',validUntil:'2028-01-01',evidence:[{kind:'registration',documentId:'manager-registration',verified:true}]}};
 const r=report([],[manager]);r.categories=[{id:'personnel',items:[{id:'manager-gate',categoryId:'personnel',title:'拟派项目经理资格',quote:'拟派项目经理须提供（建筑工程专业）一级及以上建造师注册证。',hard:true,reviewed:true,matchStatus:'met',references:[source],fields:{}}]}];
 const result=buildCompanyAnalysis(r);assert.equal(result.qualification.status,'pending');assert.equal(result.qualification.groups.find(group=>group.id==='personnel').status,'pending');
 assert.ok(result.matches[0].records[0].missing.includes('专业不符合原文要求'));assert.ok(result.matches[0].records[0].missing.includes('等级不符合原文最低要求'));
});

// A future certificate is not effective on the frozen analysis date.
test('V5 a future-effective safety license cannot satisfy the current gate',()=>{
 const license={id:'future-license',type:'qualification',name:'安全生产许可证',verified:true,documentIds:['future-license-doc'],fields:{category:'安全生产许可证',subjectName:'演示企业',validFrom:'2027-01-01',validUntil:'2029-01-01',evidence:[{kind:'license',documentId:'future-license-doc',verified:true}]}};
 const r=report([],[license]);r.categories=[{id:'qualification',items:[{id:'safety-gate',categoryId:'qualification',title:'安全生产许可',quote:'供应商须提供有效安全生产许可证。',hard:true,reviewed:true,matchStatus:'met',references:[source],fields:{}}]}];
 const result=buildCompanyAnalysis(r);assert.equal(result.qualification.groups.find(group=>group.id==='safety-license').status,'pending');assert.ok(result.matches[0].records[0].missing.some(value=>value.includes('尚未生效')));
});

// Confirming a document without its owner must not turn another company's record into eligibility evidence.
test('V5 each qualification group requires an explicit enterprise owner',()=>{
 const cases=[
  ['business-license','entity','营业执照','供应商须提供营业执照。','license',{registeredName:''}],
  ['construction-qualification','qualification','企业资质','供应商须具备建筑工程施工总承包三级资质。','certificate',{category:'建筑工程施工总承包'}],
  ['safety-license','qualification','安全生产许可证','供应商须提供有效安全生产许可证。','license',{category:'安全生产许可证'}],
  ['personnel','personnel','拟派项目经理','拟派项目经理须提供建造师注册证。','registration',{role:'项目经理',specialty:'建筑工程',grade:'二级'}],
  ['performance','performance','资格业绩','供应商须具备屋面维修项目业绩并提供合同扫描件。','contract',{projectType:'屋面维修'}]
 ];
 for(const [group,type,title,quote,kind,fields]of cases){const rec={id:'ownerless',type,name:title,verified:true,documentIds:['ownerless-doc'],fields:{...fields,validUntil:'2029-01-01',evidence:[{kind,documentId:'ownerless-doc',verified:true}]}};
  const r=report([],[rec]);r.categories=[{id:type,items:[{id:'owner-gate',categoryId:type,title,quote,hard:true,reviewed:true,matchStatus:'met',references:[source],fields:{}}]}];
  assert.equal(buildCompanyAnalysis(r).qualification.groups.find(item=>item.id===group).status,'pending',group);
 }
});

// The internal ratio may be shown separately but cannot overwrite the qualification gate.
test('V5 optional internal threshold stays an independent hint while verified hard failure still blocks',()=>{
 const r=report([score('business','商务',8,'综合商务')]);r.scoreAssessments=[{scoreId:'business',estimatedScore:7,reason:'根据已提供材料估计商务仍有得分缺口'}];
 let analysis=buildCompanyAnalysis(r);assert.equal(analysis.screening.internalScreening.status,'below-threshold');assert.notEqual(analysis.screening.status,'below-threshold');
 r.categories=[{id:'qualification',items:[{id:'q',categoryId:'qualification',title:'企业资质',quote:'必须具备资质',hard:true,reviewed:true,matchStatus:'unmet',references:[source],fields:{}}]}];
 analysis=buildCompanyAnalysis(r);assert.equal(analysis.screening.status,'blocked');assert.equal(analysis.qualification.status,'unmet');
});

// Scope ambiguity invalidates a combined range even when each local maximum is a valid number.
test('V5 multiple procurement packages never produce a combined prediction range',()=>{
 const r=report([score('technical','技术',80,'技术方案'),score('business','商务',20,'商务履约')]);r.analysis.scoring.packages.push({scope:{...scope,package:'2'},items:[]});
 assert.equal(buildCompanyAnalysis(r).forecast.totalRange,null);
});

// A null total range is insufficient if another exported subtotal still combines mutually exclusive scopes.
test('V5 ambiguous package source or grouping scope clears every aggregate but retains item assumptions',()=>{
 const base=()=>report([score('tech-one','技术',90,'技术方案'),score('price-one','价格',10,'价格得分'),score('bill-one','商务',5,'组价合理性')]);
 const multiple=base();const second=multiple.analysis.scoring.items.map(item=>({...item,id:item.id+'-two',scope:{...scope,package:'2'}}));multiple.analysis.scoring.items.push(...second);multiple.analysis.scoring.packages.push({scope:{...scope,package:'2'},items:second});
 const sources=base();sources.analysis.scoring.items[1].scope={...scope,documentId:'another-tender'};
 const incomplete=base();incomplete.analysis.scoring.status='评分分组总分缺口，待核验';
 const unscoped=base();unscoped.analysis.scoring.packages=[];for(const item of unscoped.analysis.scoring.items){delete item.scope;item.references=[];}
 for(const r of [multiple,sources,incomplete,unscoped]){const analysis=buildCompanyAnalysis(r),forecast=analysis.forecast;
  assert.equal(forecast.assumedScore,null);assert.equal(forecast.evidenceSupportedScore,null);assert.equal(forecast.referenceScore,null);assert.equal(forecast.pendingMaxScore,null);assert.equal(forecast.totalRange,null);assert.equal(forecast.scenario.total,null);assert.equal(forecast.scenario.technicalMax,null);
  for(const field of ['maxScore','assumedScore','confirmedScore','conditionalScore','pendingMaxScore','gap','range'])assert.equal(forecast.business[field],null,field);
  assert.equal(analysis.scoreRows[0].assumedScore,90);assert.equal(analysis.scoreRows[1].assumedScore,10);assert.equal(analysis.scoreRows[2].assumedScore,5);
 }
});

// An absent scoring table must not be rendered as a confirmed zero-point forecast.
test('V5 an empty scoring table has no zero-point prediction',()=>{
 const analysis=buildCompanyAnalysis(report([]));assert.equal(analysis.forecast.totalRange,null);assert.equal(analysis.forecast.scenario.total,null);
});
