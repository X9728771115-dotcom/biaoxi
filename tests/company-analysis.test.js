import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument,summarizeReport} from '../src/core/analyzer.js';

const source={documentId:'tender-1',blockId:'b1',page:1,quote:'原评分标准'};
const scope={documentId:'tender-1',package:'1',phase:'response'};
const performanceStandard='屋面维修项目业绩：2023年1月1日起，以合同签订日期为准，合同金额不少于50万元，每个合同得1分，最高3分，须提供合同扫描件以及验收报告。客观';
const score=(id,group,maxScore,standard=performanceStandard,title='屋面维修项目业绩')=>({id,title,group,maxScore,standard,materials:[],references:[{...source,quote:standard}],scope});
const record=(overrides={})=>({id:'perf-1',type:'performance',name:'演示测试资料-真实合同名称',verified:true,documentIds:['contract-1','acceptance-1'],sources:[],fields:{subjectName:'演示测试企业',projectType:'屋面维修',contractNumber:'HT-001',contractDate:'2023-01-01',amount:500000,evidence:[{kind:'contract',documentId:'contract-1',verified:true},{kind:'acceptanceReport',documentId:'acceptance-1',verified:true}]},...overrides});
const company=records=>({id:'company-1',name:'演示测试企业',records});
function report(items=[score('score-1','商务',3)],records=[record()]){
 return {id:'report-1',documentId:'tender-1',fileName:'演示测试资料.txt',categories:[],companySnapshot:company(records),analysis:{scoring:{items,groups:[],status:'计分项与分组总分校验通过',packages:[{scope,items,status:'计分项与分组总分校验通过'}]}}};
}
const analyze=(r)=>summarizeReport(r).companyAnalysis;
const row=r=>analyze(r)?.scoreRows?.[0];

// Break caught: using a candidate record or one unconfirmed proof as a definite objective point.
test('unverified performance record does not earn evidence-supported points',()=>{
 const r=report(undefined,[record({verified:false})]);assert.equal(row(r)?.expectedScore,null);assert.equal(row(r)?.status,'pending');
});
test('each required proof must be separately confirmed',()=>{
 const rec=record();rec.fields.evidence[1].verified=false;
 assert.equal(row(report(undefined,[rec]))?.expectedScore,null);
});
test('contract and acceptance report are both required before objective support',()=>{
 const rec=record();rec.fields.evidence.splice(1);
 assert.equal(row(report(undefined,[rec]))?.expectedScore,null);
});
test('explicit alternative proofs preserve OR rather than forcing both',()=>{
 const rec=record();rec.fields.evidence.splice(1);
 const r=report([score('score-1','商务',3,performanceStandard.replace('以及','或'))],[rec]);
 assert.equal(row(r)?.expectedScore,1);assert.equal(row(r)?.status,'rule-supported');
});
test('performance type date amount and contract duplicates constrain points',()=>{
 const dated=record({id:'old'});dated.fields={...dated.fields,contractNumber:'OLD',contractDate:'2022-12-31'};
 const low=record({id:'low'});low.fields={...low.fields,contractNumber:'LOW',amount:499999};
 const other=record({id:'other'});other.fields={...other.fields,contractNumber:'OTHER',projectType:'办公家具'};
 const duplicate=record({id:'duplicate',name:'同一合同重复上传'});
 const r=report(undefined,[record(),duplicate,dated,low,other]);
 assert.equal(row(r)?.expectedScore,1);assert.equal(row(r)?.records?.length,5);
 assert.ok(row(r).records.find(rec=>rec.id==='duplicate').missing.includes('同一合同重复，不重复计分'));
});
test('unnumbered duplicate contract fingerprints do not count twice',()=>{
 const rec=record();rec.fields.contractNumber='';rec.fields.clientName='演示业主';
 const duplicate=structuredClone(rec);duplicate.id='copy';
 assert.equal(row(report(undefined,[rec,duplicate]))?.expectedScore,1);
});
test('generic same-type requirements remain pending instead of guessing from record names',()=>{
 const r=report([score('score-1','商务',3,performanceStandard.replace('屋面维修项目业绩','同类项目业绩'))]);
 assert.equal(row(r)?.expectedScore,null);
});
test('personnel and product matches show real configured records with missing proof',()=>{
 const r=report([],[]);r.companySnapshot.records=[{id:'p1',type:'personnel',name:'演示人员张某',fields:{role:'项目经理',specialty:'建筑工程'},verified:false,documentIds:[],sources:[]},{id:'prd1',type:'product',name:'演示防水材料',fields:{brand:'演示牌',model:'X1'},verified:false,documentIds:[],sources:[]}];
 r.categories=[{id:'personnel',items:[{id:'f1',categoryId:'personnel',title:'拟派经理',quote:'须提供建筑工程二级建造师和B证，本单位注册且不兼职。',references:[source],fields:{},matchStatus:'pending'}]},{id:'eco',items:[{id:'f2',categoryId:'eco',title:'材料性能',quote:'拟投产品须满足环保性能，提供检测报告。',references:[source],fields:{},matchStatus:'pending'}]}];
 const matches=analyze(r)?.matches;assert.equal(matches?.[0]?.records?.[0]?.name,'演示人员张某');assert.ok(matches[0].records[0].missing.length);assert.equal(matches[1].records[0].fields.model,'X1');assert.equal(matches[1].status,'candidate');
});
test('not-applicable product policy never creates compulsory proof or extra score',()=>{
 const r=report([],[]);r.categories=[{id:'eco',items:[{id:'eco1',categoryId:'eco',title:'强采',quote:'本包强采、优采、环境标志不涉及。',applicability:'not-required',fields:{},references:[source]}]}];
 assert.equal(analyze(r)?.matches?.[0]?.status,'not-applicable');assert.equal(analyze(r)?.forecast?.scenario?.total,null);
});
test('bill scoring uses a full-score assumption while preserving an earlier reasoned reference',()=>{
 const r=report([score('subject','商务',5,'由专家判断组价合理性，主观，满分5分。','组价合理性')]);
 assert.equal(row(r)?.expectedScore,null);assert.equal(row(r)?.referenceScore,null);
 r.scoreAssessments=[{scoreId:'subject',estimatedScore:4.6,reason:'逐项核对报价组成并以合理性作内部参考',evidenceIds:[]}];
 assert.equal(row(r)?.expectedScore,null);assert.equal(row(r)?.referenceScore,4.6);assert.equal(row(r)?.status,'assumed-full');assert.equal(row(r)?.assumedScore,5);
});
test('technical and price maxima are only scenario assumptions and personnel is counted once',()=>{
 const items=[score('technical','技术',72,'由专家主观判断施工方案','方案'),score('personnel','技术',10,'人员配备主观满分10分','项目部人员配备'),score('price','价格',10,'最低报价公式得10分','报价'),score('business','商务',8,'主观商务满分8分','商务')];
 const r=report(items);r.scoreAssessments=[{scoreId:'business',estimatedScore:8,reason:'演示内部参考估分并假设所有商务要素齐备'}];
 const ca=analyze(r);assert.equal(ca?.forecast?.scenario?.technicalMax,82);assert.equal(ca?.forecast?.scenario?.priceMax,10);assert.equal(ca?.forecast?.scenario?.total,100);assert.equal(ca?.forecast?.evidenceSupportedScore,0);
});
test('95 percent uses business plus independent additional scores',()=>{
 const r=report([score('biz','商务',8,'主观商务','商务'),score('extra','附加',2,'主观附加','独立附加')]);
 r.scoreAssessments=[{scoreId:'biz',estimatedScore:7.5,reason:'演示测试内部参考估计依据足够'},{scoreId:'extra',estimatedScore:2,reason:'演示测试附加分仍仅内部参考'}];
 const screening=analyze(r)?.screening;assert.equal(screening?.denominator,10);assert.equal(screening?.numerator,9.5);assert.equal(screening?.ratio,0.95);assert.equal(screening?.internalScreening.status,'pass');assert.equal(screening?.internalScreening.enforced,false);
});
test('without independent additional points denominator is business and price discount is not five points',()=>{
 const r=report([score('biz','商务',8,'主观商务','商务'),score('price','价格',10,'小微企业报价给予5%的扣除，以扣除后的价格评审。','报价')]);r.scoreAssessments=[{scoreId:'biz',estimatedScore:7.5,reason:'内部参考估计，报价合理性尚有缺口'}];
 assert.equal(analyze(r)?.screening?.denominator,8);assert.equal(analyze(r)?.screening?.internalScreening.status,'below-threshold');assert.equal(analyze(r)?.forecast?.scenario?.total,17.5);
});
test('unknown scores prevent screening and zero denominator is not applicable',()=>{
 assert.equal(analyze(report([score('biz','商务',8,'主观商务')]))?.screening?.status,'pending');
 assert.equal(analyze(report([score('tech','技术',82,'主观技术')]))?.screening?.status,'not-applicable');
});
test('different packages or source versions never produce one forecast total',()=>{
 const r=report([score('s1','商务',3)]);r.analysis.scoring.packages.push({scope:{...scope,package:'2'},items:[score('s2','商务',3)]});
 assert.equal(analyze(r)?.screening?.status,'pending');assert.equal(analyze(r)?.forecast?.scenario?.total,null);
});
test('confirmed hard failure remains first even with maximum reference score and AI same-name candidate',()=>{
 const r=report([score('biz','商务',8,'主观商务')]);r.scoreAssessments=[{scoreId:'biz',estimatedScore:8,reason:'所有商务项以满分作内部参考估计'}];r.categories=[{id:'qualification',items:[{id:'gate',categoryId:'qualification',title:'资格证',quote:'必须具备资格证',hard:true,reviewed:true,matchStatus:'unmet',references:[source],fields:{}}]}];r.companySnapshot.records.push({id:'same',type:'qualification',name:'资格证',verified:true,documentIds:[],sources:[],fields:{}});
 const result=summarizeReport(r);assert.equal(result.outputs.conclusion.label,'不建议投');assert.equal(result.companyAnalysis?.screening?.status,'blocked');assert.equal(result.categories[0].items[0].matchStatus,'unmet');
});
test('analysis snapshots company data and summarize never reads later company edits',()=>{
 const c=company([record()]);const doc={id:'tender-1',fileName:'测试.txt',complete:true,blocks:[{id:'b1',page:1,section:'评分办法',text:performanceStandard}]};
 const r=analyzeDocument(doc,{companySnapshot:c});c.name='随后编辑企业';c.records[0].name='随后编辑业绩';
 assert.equal(r.companySnapshot?.name,'演示测试企业');assert.equal(summarizeReport(r).companyAnalysis?.companyName,'演示测试企业');assert.equal(r.companySnapshot?.records?.[0]?.name,'演示测试资料-真实合同名称');
});
test('without a company all categories and outputs remain available while company matches stay empty',()=>{
 const r=analyzeDocument({id:'tender-1',fileName:'测试.txt',blocks:[{id:'b1',text:'供应商须提供营业执照。',page:1,section:'资格'}]});
 assert.equal(r.categories.length,14);assert.ok(r.outputs.conclusion);assert.deepEqual(r.companyAnalysis?.matches,[]);assert.equal(r.companyAnalysis?.companyId,null);
});
// Break caught: attributing confirmed evidence to the wrong contract party.
test('verified foreign contract subject cannot earn objective enterprise points',()=>{
 const rec=record();rec.fields.subjectName='另一家真实企业';assert.equal(row(report(undefined,[rec]))?.expectedScore,null);assert.ok(row(report(undefined,[rec]))?.records[0]?.missing.some(v=>v.includes('主体')));
});
test('performance must honor explicit contract-date end and grouping count',()=>{
 const standard=performanceStandard.replace('2023年1月1日起','2023年1月1日至2025年12月31日').replace('每个合同得1分','每2个合同得1分');
 const future=record({id:'future'});future.fields={...future.fields,contractNumber:'future',contractDate:'2026-01-01'};
 const second=record({id:'second'});second.fields={...second.fields,contractNumber:'second',contractDate:'2025-12-31'};
 assert.equal(row(report([score('score-1','商务',3,standard)],[record(),future,second]))?.expectedScore,1);
});
test('stamp and validity conditions require explicit proof confirmation in addition to verified',()=>{
 const standard=performanceStandard.replace('合同扫描件','加盖公章的有效合同扫描件');assert.equal(row(report([score('score-1','商务',3,standard)]))?.expectedScore,null);
 const rec=record();rec.fields.evidence[0]={...rec.fields.evidence[0],stamped:true,valid:true};
 assert.equal(row(report([score('score-1','商务',3,standard)],[rec]))?.expectedScore,1);
});
test('manager missing list checks specialty grade validity and exact certificate type',()=>{
 const r=report([],[]);r.createdAt='2026-10-13T00:00:00Z';r.companySnapshot.records=[{id:'mgr',type:'personnel',name:'演示人员',verified:true,documentIds:['doc'],sources:[],fields:{role:'项目经理',specialty:'机电工程',grade:'三级',subjectName:'另一企业',validUntil:'2025-01-01',evidence:[{kind:'certificate',documentId:'doc',verified:true}]}}];r.categories=[{id:'personnel',items:[{id:'manager',categoryId:'personnel',title:'拟派经理',quote:'须具备二级及以上注册建造师证书（建筑工程专业），有效B证，本单位注册且不兼职。',references:[source],fields:{}}]}];
 const missing=analyze(r)?.matches?.[0]?.records?.[0]?.missing||[];assert.ok(missing.some(s=>s.includes('专业不符')));assert.ok(missing.some(s=>s.includes('等级不符')));assert.ok(missing.some(s=>s.includes('有效期')));assert.ok(missing.some(s=>s.includes('主体')));
});
test('an internal business gap does not alone reject participation or change reviewed qualification',()=>{
 const r=report([score('biz','商务',8,'主观商务','商务')]);r.coverage={complete:true,missingCategories:[],unrecognizedBlocks:[]};r.categories=[{id:'qualification',items:[{id:'gate',categoryId:'qualification',title:'已核企业资质',quote:'须具备建筑工程施工总承包三级资质',references:[source],fields:{},hard:true,reviewed:true,matchStatus:'met'}]}];
 let result=summarizeReport(r);assert.notEqual(result.outputs.conclusion.label,'不建议投');assert.equal(result.companyAnalysis.qualification.status,'pending');
 r.scoreAssessments=[{scoreId:'biz',estimatedScore:7,reason:'内部估计发现报价组成存在评分缺口'}];result=summarizeReport(r);assert.notEqual(result.outputs.conclusion.label,'不建议投');assert.equal(result.companyAnalysis.screening.internalScreening.status,'below-threshold');assert.equal(result.categories[0].items[0].matchStatus,'met');
});

test('below-95 is an independent hint while hard qualification remains pending',()=>{
 const r=report([score('biz','商务',8,'主观商务','商务')]);r.scoreAssessments=[{scoreId:'biz',estimatedScore:7,reason:'有资料依据内部参考确认商务得分缺口'}];r.categories=[{id:'qualification',items:[{id:'gate',categoryId:'qualification',title:'资格',quote:'须有资格',references:[source],fields:{},hard:true,reviewed:false,matchStatus:'pending'}]}];
 const result=summarizeReport(r);assert.equal(result.outputs.conclusion.label,'待核验');assert.equal(result.companyAnalysis.screening.internalScreening.status,'below-threshold');assert.equal(result.companyAnalysis.screening.hardGate.status,'pending');assert.equal(result.categories[0].items[0].matchStatus,'pending');assert.equal(result.analysisStatus,'待核验');
});

// F1 catches promotion of one local OR into all proof requirements.
test('F1 mixed OR proof group keeps independent owner proof mandatory',()=>{
 const standard=performanceStandard.replace('合同扫描件以及验收报告','合同扫描件或验收报告，且须提供业主证明');const rec=record();rec.fields.evidence.splice(1);
 const r=report([score('f1','商务',3,standard)],[rec]);assert.equal(row(r).expectedScore,null);assert.equal(row(r).status,'pending');
 rec.documentIds.push('owner-1');rec.fields.evidence.push({kind:'ownerProof',documentId:'owner-1',verified:true});assert.equal(row(r).expectedScore,1);
});
test('F1 grouped contract AND acceptance may alternatively use owner proof but contract alone is insufficient',()=>{
 const standard=performanceStandard.replace('合同扫描件以及验收报告','（合同扫描件以及验收报告）或业主证明');const rec=record();rec.fields.evidence.splice(1);
 const r=report([score('f1b','商务',3,standard)],[rec]);assert.equal(row(r).expectedScore,null);
 rec.fields.evidence=[{kind:'ownerProof',documentId:'owner-1',verified:true}];rec.documentIds.push('owner-1');assert.equal(row(r).expectedScore,1);
});
// F2 catches declaring complete evidence after ignoring a material/constraint outside the supported grammar.
test('F2 unknown mandatory winning notice prevents objective support',()=>{
 const standard=performanceStandard.replace('验收报告','验收报告、中标通知书');assert.equal(row(report([score('f2a','商务',3,standard)])).expectedScore,null);
});
test('F2 unsupported building-area threshold remains pending',()=>{
 const standard=performanceStandard.replace('客观','单个业绩项目建筑面积不少于1000平方米。客观');assert.equal(row(report([score('f2b','商务',3,standard)])).expectedScore,null);
});
test('F2 independent materials column constrains standard subset',()=>{
 const item=score('f2c','商务',3,performanceStandard.replace('以及验收报告',''));item.materials=['合同扫描件','验收报告'];const rec=record();rec.fields.evidence.splice(1);
 const r=report([item],[rec]);assert.equal(row(r).expectedScore,null);rec.fields.evidence.push({kind:'acceptanceReport',documentId:'acceptance-1',verified:true});assert.equal(row(r).expectedScore,1);
});
// F3 catches separate identity namespaces allowing one original contract to be counted twice.
test('F3 contract number and no-number records sharing original and content count once',()=>{
 const rec=record();rec.fields.clientName='演示业主';const duplicate=structuredClone(rec);duplicate.id='no-number';duplicate.fields.contractNumber='';
 assert.equal(row(report(undefined,[rec,duplicate])).expectedScore,1);
});
test('F3 same-day same-value real contracts with distinct numbers and originals remain separate',()=>{
 const first=record();first.fields.clientName='演示业主';const second=structuredClone(first);second.id='different';second.fields.contractNumber='HT-002';second.documentIds=['contract-2','acceptance-2'];second.fields.evidence=[{kind:'contract',documentId:'contract-2',verified:true},{kind:'acceptanceReport',documentId:'acceptance-2',verified:true}];
 assert.equal(row(report(undefined,[first,second])).expectedScore,2);
});
test('F3 identical content without a common original or complete distinct numbers stays pending',()=>{
 const first=record();first.fields.clientName='演示业主';const second=structuredClone(first);second.id='uncertain';second.fields.contractNumber='';second.documentIds=['contract-2','acceptance-2'];second.fields.evidence=[{kind:'contract',documentId:'contract-2',verified:true},{kind:'acceptanceReport',documentId:'acceptance-2',verified:true}];
 assert.equal(row(report(undefined,[first,second])).expectedScore,null);
});
// F5 catches rounding into eligibility before the exact threshold comparison.
test('F5 raw reference scores below 95 percent never pass after display rounding',()=>{
 for(const value of [7.5999,7.59999]){const r=report([score('biz','商务',8,'主观商务','商务')]);r.scoreAssessments=[{scoreId:'biz',estimatedScore:value,reason:'演示资料内部参考估计含四位以上小数'}];const screening=analyze(r).screening;assert.equal(screening.internalScreening.status,'below-threshold');assert.equal(screening.numerator,value);assert.equal(screening.ratio,value/8);}
 const r=report([score('biz','商务',8,'主观商务','商务')]);r.scoreAssessments=[{scoreId:'biz',estimatedScore:7.6,reason:'演示资料内部参考恰好达到阈值'}];assert.equal(analyze(r).screening.internalScreening.status,'pass');
});
// F6 catches clause-review success being promoted into enterprise eligibility without enterprise facts.
test('F6 no company or empty company facts stay pending despite reviewed clauses and complete coverage',()=>{
 const r=report([],[]);r.coverage={complete:true,missingCategories:[],unrecognizedBlocks:[]};r.categories=[{id:'qualification',items:[{id:'gate',categoryId:'qualification',title:'资格',quote:'须具备资格',hard:true,reviewed:true,matchStatus:'met',references:[source],fields:{}}]}];
 delete r.companySnapshot;assert.equal(summarizeReport(r).outputs.conclusion.label,'待核验');assert.deepEqual(summarizeReport(r).companyAnalysis.matches,[]);
 r.companySnapshot=company([]);assert.equal(summarizeReport(r).outputs.conclusion.label,'待核验');
 r.categories[0].items[0].matchStatus='unmet';assert.equal(summarizeReport(r).outputs.conclusion.label,'不建议投');
});
test('F3 one PDF may contain two distinct confirmed numbered contracts with identical content fingerprint',()=>{
 const first=record();first.fields.clientName='演示业主';const second=structuredClone(first);second.id='another-contract-in-same-pdf';second.fields.contractNumber='HT-002';
 assert.equal(row(report(undefined,[first,second])).expectedScore,2);
});
test('F3 confirmed registered-name alias does not split one enterprise contract identity',()=>{
 const first=record();first.fields.clientName='演示业主';const second=structuredClone(first);second.id='registered-name-copy';second.fields.subjectName='演示企业登记全称';
 const r=report(undefined,[first,second,{id:'legal-name',type:'entity',name:'演示登记执照',verified:true,documentIds:['legal-name-original'],sources:[],fields:{registeredName:'演示企业登记全称',evidence:[{kind:'license',documentId:'legal-name-original',verified:true}]}}]);
 assert.equal(row(r).expectedScore,1);
});

// N1 exercises the real parser's material-name index, which does not encode a second AND rule.
test('N1 real parsed material index preserves owner-proof OR while explicit independent requirement still applies',()=>{
 const standard=performanceStandard.replace('合同扫描件以及验收报告','（合同扫描件以及验收报告）或业主证明');const rec=record();rec.documentIds=['owner-1'];rec.fields.evidence=[{kind:'ownerProof',documentId:'owner-1',verified:true}];
 const r=analyzeDocument({id:'real-or-tender',fileName:'演示材料分组原件.txt',complete:true,blocks:[{id:'real-or-block',kind:'paragraph',page:1,section:'评分标准',text:standard}]},{companySnapshot:company([rec])});
 assert.deepEqual(r.analysis.scoring.items[0].materials,['合同扫描件','验收报告','业主证明']);assert.equal(r.companyAnalysis.scoreRows[0].expectedScore,1);
 r.analysis.scoring.items[0].materials.push('须提供合同扫描件');assert.equal(summarizeReport(r).companyAnalysis.scoreRows[0].expectedScore,null);
 r.companySnapshot.records[0].documentIds.push('contract-1');r.companySnapshot.records[0].fields.evidence.push({kind:'contract',documentId:'contract-1',verified:true});assert.equal(summarizeReport(r).companyAnalysis.scoreRows[0].expectedScore,1);
});
// N2 catches unsupported conditions disappearing inside a broad point-pattern match.
test('N2 embedded area condition in per-contract scoring remains uncovered and pending',()=>{
 const standard=performanceStandard.replace('每个合同得1分','每个合同面积≥1000㎡得1分'),r=report([score('embedded-area','商务',3,standard)]);
 const current=row(r);assert.equal(current.expectedScore,null);assert.equal(current.status,'pending');assert.ok(current.missing.some(value=>value.includes('面积')));
 assert.equal(row(report()).expectedScore,1);
});
// N3 separates enterprise eligibility facts from a reasoned internal refusal based on a selected candidate company.
test('N3 selected unconfirmed enterprise with reasoned 7 of 8 reference keeps qualification pending',()=>{
 const rec=record({verified:false}),r=report([score('biz','商务',8,'主观商务','商务')],[rec]);r.categories=[{id:'qualification',items:[{id:'gate',categoryId:'qualification',title:'资格',quote:'须具备资格',hard:true,reviewed:false,matchStatus:'pending',references:[source],fields:{}}]}];r.scoreAssessments=[{scoreId:'biz',estimatedScore:7,reason:'人工核对候选材料后作内部参考，商务存在明确缺口',evidenceIds:['contract-1']}];
 const current=summarizeReport(r);assert.equal(current.companyAnalysis.screening.internalScreening.status,'below-threshold');assert.equal(current.outputs.conclusion.label,'待核验');assert.equal(current.companyAnalysis.screening.hardGate.status,'pending');assert.equal(current.categories[0].items[0].matchStatus,'pending');assert.equal(current.companySnapshot.records[0].verified,false);assert.equal(current.analysisStatus,'待核验');
});

// Browser evidence: general supplier capability wording is not a contract-proof submission demand.
test('BrowserProof1 roof supplier capability clause never creates a personnel contract-proof gap',async()=>{
 const {readFile}=await import('node:fs/promises'),extraction=JSON.parse(await readFile(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8'));
 const person={id:'browser-person',type:'personnel',name:'演示拟派人员',verified:false,documentIds:[],sources:[],fields:{role:'项目经理',specialty:'建筑工程',grade:'二级'}};
 const r=analyzeDocument(extraction,{companySnapshot:company([person])}),finding=r.categories.flatMap(c=>c.items).find(item=>item.categoryId==='personnel'&&/履行合同所必需/.test(item.quote.normalize('NFKC'))),matched=r.companyAnalysis.matches.find(item=>item.findingId===finding.id);
 assert.equal(matched.records[0].missing.some(value=>/缺已确认材料.*(?:contract|合同)/.test(value)),false);assert.equal(matched.status,'candidate');assert.equal(finding.matchStatus,'pending');
});
// Browser evidence: enterprise safety permission and individual manager certificates are different owners.
test('BrowserProof2 roof enterprise license is never a personal missing proof and explicit personal submissions stay in Chinese',async()=>{
 const {readFile}=await import('node:fs/promises'),extraction=JSON.parse(await readFile(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8'));
 const person={id:'browser-person',type:'personnel',name:'演示拟派人员',verified:false,documentIds:[],sources:[],fields:{role:'项目经理',specialty:'建筑工程',grade:'二级'}};
 const roof=analyzeDocument(extraction,{companySnapshot:company([person])}),manager=roof.categories.flatMap(c=>c.items).find(item=>item.categoryId==='personnel'&&/项目经理资质/.test(item.quote.normalize('NFKC'))),matched=roof.companyAnalysis.matches.find(item=>item.findingId===manager.id);
 assert.equal(matched.records[0].missing.some(value=>/缺已确认材料.*(?:license|许可证)/.test(value)),false);assert.equal(matched.status,'candidate');
 const text='企业须提供有效安全生产许可证；拟派项目经理须提交注册证、B证、劳动合同及社保证明。';const explicit=analyzeDocument({id:'proof-owners',fileName:'演示主体材料.txt',blocks:[{id:'proof-owners-b1',page:1,section:'资格要求',text}]},{companySnapshot:company([person])});const personal=explicit.companyAnalysis.matches.find(item=>item.type==='personnel');
 for(const expected of ['注册证','B证','劳动合同','社保证明'])assert.ok(personal.records[0].missing.some(value=>value==='缺已确认材料：'+expected));assert.equal(personal.records[0].missing.some(value=>/缺已确认材料.*许可证/.test(value)),false);
 const uncertain=report([], [person]);uncertain.categories=[{id:'personnel',items:[{id:'unclear-owner',categoryId:'personnel',title:'材料要求',quote:'须提供许可证。',fields:{'证明材料':['许可证'],'适用主体':'按条款涉及主体核验'},references:[source]}]}];assert.ok(analyze(uncertain).matches[0].records[0].missing.some(value=>value.includes('材料归属待核')));assert.equal(analyze(uncertain).matches[0].records[0].missing.some(value=>value==='缺已确认材料：许可证'),false);
 const perf=record();perf.fields.evidence=[];const scoreMissing=row(report(undefined,[perf])).missing.join('；');assert.ok(scoreMissing.includes('合同')&&scoreMissing.includes('验收报告'));assert.equal(/contract|acceptanceReport|ownerProof|certificate|registration|bCertificate|socialInsurance|environmentalReport/.test([...personal.records[0].missing,scoreMissing].join('；')),false);
});

// M1: the submitted object is a capability declaration, not the contract named inside it.
test('MaterialAdjacentM1 capability declaration creates no enterprise contract-original gap but actual contract submission remains required',()=>{
 const enterprise={id:'enterprise-qualification',type:'qualification',name:'演示企业资格资料',verified:false,documentIds:[],sources:[],fields:{}};
 const text='供应商须提供具有履行合同所必需的设备和专业技术能力的承诺函。',r=report([], [enterprise]);r.categories=[{id:'qualification',items:[{id:'capability-declaration',categoryId:'qualification',title:'履约能力承诺',quote:text,subject:'供应商',fields:{'适用主体':'供应商'},references:[{...source,quote:text}],matchStatus:'pending'}]}];
 const result=summarizeReport(r),matched=result.companyAnalysis.matches[0];assert.equal(matched.records[0].missing.includes('缺已确认材料：合同'),false);assert.equal(matched.status,'candidate');assert.equal(result.categories[0].items[0].matchStatus,'pending');
 r.categories[0].items[0].quote='供应商须提供合同原件。';assert.ok(analyze(r).matches[0].records[0].missing.includes('缺已确认材料：合同'));
});
// M2: a comma-separated submission list carries the same directive as a list separated by 、.
test('MaterialAdjacentM2 comma-separated manager proof list retains all four original-proof gaps even when B number exists',()=>{
 const person={id:'manager-list',type:'personnel',name:'演示经理',verified:false,documentIds:[],sources:[],fields:{role:'项目经理',bCertificateNumber:'演示B证编号'}};
 for(const text of ['拟派项目经理须提交注册证，B证，劳动合同，社保证明。','拟派项目经理须提交注册证、B证、劳动合同、社保证明。']){
  const r=report([], [person]);r.categories=[{id:'personnel',items:[{id:'manager-proof-list',categoryId:'personnel',title:'经理材料清单',quote:text,subject:'拟派项目经理',fields:{'适用主体':'拟派项目经理'},references:[{...source,quote:text}],matchStatus:'pending'}]}];
  const matched=analyze(r).matches[0];assert.deepEqual(matched.records[0].missing.filter(value=>value.startsWith('缺已确认材料：')).sort(),['缺已确认材料：B证','缺已确认材料：劳动合同','缺已确认材料：注册证','缺已确认材料：社保证明']);assert.equal(matched.status,'candidate');
 }
});
