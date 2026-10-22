import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument,summarizeReport} from '../src/core/analyzer.js';
import {buildCompanyAnalysis} from '../src/core/company-analysis.js';

const quote='拟派项目经理须持建筑工程二级注册建造师证书，在本单位注册，否则资格审查不通过。';
function setup(){
 const extraction={id:'isolation-source',fileName:'工程采购.txt',complete:true,warnings:[],blocks:[{id:'manager',page:1,text:quote},{id:'promise',page:2,text:'供应商须提交真实性承诺函。'}]};
 const candidate={categoryId:'personnel',title:'AI新增社保必交条件',quote,interpretation:'项目负责人必须提交本单位社保证明，否则资格不通过。',fields:{证明材料:['本单位社保证明']},references:[{documentId:extraction.id,blockId:'manager',quote}],source:'ai'};
 const baseline=analyzeDocument(extraction),report=analyzeDocument(extraction,{additionalFindings:[candidate]});
 const ai=report.categories.flatMap(c=>c.items).find(i=>i.source==='ai');assert.ok(ai);return {baseline,report,ai};
}
test('unreviewed AI materials remain raw candidates without adding a qualification gate or priority risk',()=>{
 const {baseline,report,ai}=setup();
 assert.equal(ai.reviewed,false);assert.match(ai.fields['补充解读（待核验）'],/社保证明/);
 assert.ok(!report.outputs.risks.some(i=>i.id===ai.id));
 const group=report.companyAnalysis.qualification.groups.find(g=>g.id==='personnel');
 assert.ok(!group.requirements.some(i=>i.findingId===ai.id));
 assert.deepEqual(report.outputs.risks.map(i=>i.id),baseline.outputs.risks.map(i=>i.id));
 assert.equal(report.categories.length,14);assert.equal(Object.keys(report.outputs).length,4);
});
test('primary report projection excludes unreviewed AI hard conditions while retaining its raw review path',()=>{
 const {report,ai}=setup();
 const category=report.presentation.categories.find(c=>c.id==='personnel');
 assert.ok(!category.items.some(i=>i.sourceFindingIds?.includes(ai.id)));
 assert.ok(category.supplementaryItems.some(i=>i.id===ai.id));
 assert.ok(report.categories.flatMap(c=>c.items).some(i=>i.id===ai.id));
 assert.ok(!report.presentation.outputs.risks.some(i=>i.sourceFindingIds?.includes(ai.id)));
});
test('direct company matching cannot reinstate an unreviewed AI requirement',()=>{
 const {report,ai}=setup(),review=buildCompanyAnalysis(report);
 assert.ok(!review.qualification.groups.flatMap(g=>g.requirements).some(i=>i.findingId===ai.id));
});
test('a legacy analysis score row cannot reinstate an unreviewed candidate after category filtering',()=>{
 const {report,ai}=setup();
 report.analysis.scoring.items.push({id:ai.id,title:'AI擅增证照加分',group:'商务',maxScore:99,standard:'社保证明加99分',materials:['本单位社保证明'],references:ai.references,scope:{documentId:report.documentId}});
 const review=buildCompanyAnalysis(report);
 assert.ok(!review.scoreRows.some(row=>row.scoreId===ai.id));
});
test('explicitly human-reviewed AI candidate can enter the primary report without erasing the source fact',()=>{
 const {report,ai}=setup();ai.reviewed=true;ai.matchStatus='pending';ai.notes=['已对照补充澄清核实，仍待企业提交证据'];
 const updated=summarizeReport(report);
 assert.ok(updated.companyAnalysis.qualification.groups.flatMap(g=>g.requirements).some(i=>i.findingId===ai.id));
 assert.ok(updated.presentation.categories.find(c=>c.id==='personnel').items.some(i=>i.sourceFindingIds.includes(ai.id)));
 assert.ok(updated.categories.flatMap(c=>c.items).some(i=>i.source==='offline'));
});
