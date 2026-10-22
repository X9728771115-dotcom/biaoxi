import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeDocument} from '../src/core/analyzer.js';
import {buildCompanyAnalysis} from '../src/core/company-analysis.js';

const scope={documentId:'source',package:'1',phase:'response'},reference={documentId:'source',blockId:'b1',page:1,quote:'评分原文'};
const body='供应商提供2023年1月1日至今的桥梁修缮项目合同案例，每提供1个合同得1分，最多得3分。注：响应文件中须提供合同扫描件以及验收报告扫描件，否则不得分；时间以合同签订时间为准。';
function record(extra={}){return {id:'contract',type:'performance',name:'测试合同',verified:true,documentIds:['contract-doc','acceptance-doc'],fields:{subjectName:'测试企业',projectType:'桥梁修缮',contractNumber:'TEST-ONLY',contractDate:'2024-01-01',amount:600000,evidence:[{kind:'contract',documentId:'contract-doc',verified:true,stamped:true,valid:true},{kind:'acceptanceReport',documentId:'acceptance-doc',verified:true}]},...extra};}
function report(text=body,materials=['合同扫描件','验收报告扫描件'],records=[record()]){const item={id:'performance',title:'同类业绩',group:'商务',maxScore:3,standard:`| 同类业绩 | ${text} | 3.0000 | 客观 | ${materials.join('及')}`,readableStandard:text,materials,references:[reference],scope};return {createdAt:'2026-10-17T00:00:00Z',companySnapshot:{id:'company',name:'测试企业',records},categories:[],analysis:{scoring:{items:[item],status:'计分项与分组总分校验通过',packages:[{scope,items:[item]}]}}};}
const result=r=>buildCompanyAnalysis(r),row=r=>result(r).scoreRows[0];

test('synthetic roof noise is removed while named submission indexes, undefined similarity and score boundaries stay pending',()=>{
 const extraction=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8')),r=analyzeDocument(extraction),before=structuredClone(r),perf=r.companyAnalysis.scoreRows.find(row=>row.title==='同类业绩');
 assert.ok(!perf.missing.some(value=>/证明材料条件未完整识别：(?:2023|案例一览表|证明材料)|未覆盖的业绩条件：.*(?:供应商注|30000|同类业绩供应商)/.test(value)));
 assert.ok(perf.missing.some(value=>/案例一览表.*提交.*待核验/.test(value)));assert.ok(perf.missing.some(value=>/证明材料.*具体.*待核验/.test(value)));
 assert.ok(perf.missing.some(value=>value.includes('同类项目类型口径未明确')));assert.equal(perf.expectedScore,null);assert.equal(perf.confirmedScore,0);assert.deepEqual(perf.range,{min:0,max:3});assert.deepEqual(r.companyAnalysis.forecast.totalRange,{min:97,max:100});assert.deepEqual(r,before);
});

test('structured readable standard separates the performance description from proof syntax without losing raw source',()=>{
 const r=report(),before=structuredClone(r),actual=row(r);assert.equal(actual.expectedScore,1);assert.equal(actual.confirmedScore,1);assert.deepEqual(actual.range,{min:1,max:1});assert.deepEqual(r,before);
 const missingAcceptance=structuredClone(r);missingAcceptance.companySnapshot.records[0].fields.evidence.pop();const pending=row(missingAcceptance);assert.equal(pending.expectedScore,null);assert.equal(pending.confirmedScore,0);assert.ok(pending.records[0].missing.includes('缺已确认材料组：合同 且 验收报告'));
});

test('case-list and generic proof submission obligations remain explicit pending requirements rather than parser garbage',()=>{
 const r=report(body,['案例一览表','证明材料','合同扫描件','验收报告扫描件']),actual=row(r);assert.equal(actual.expectedScore,null);assert.equal(actual.confirmedScore,0);
 assert.ok(actual.missing.some(value=>/案例一览表.*提交.*待核验/.test(value)));assert.ok(actual.missing.some(value=>/证明材料.*具体.*待核验/.test(value)));assert.ok(!actual.missing.some(value=>/未完整识别：案例一览表|未完整识别：证明材料|30000/.test(value)));
 assert.deepEqual(actual.materials,r.analysis.scoring.items[0].materials);
 const combined=row(report(body,['案例一览表及证明材料','合同扫描件','验收报告扫描件']));assert.equal(combined.expectedScore,null);assert.ok(combined.missing.some(value=>/案例一览表.*提交.*待核验/.test(value)));assert.ok(combined.missing.some(value=>/证明材料.*具体.*待核验/.test(value)));assert.ok(!combined.missing.some(value=>/未完整识别：案例一览表/.test(value)));
});

test('unknown added obligations and shortened readable text cannot make a fully evidenced case complete',()=>{
 for(const r of [report(body+'另须提供项目结算审核书。'),report(body,['合同扫描件','验收报告扫描件','项目结算审核书'])]){const actual=row(r);assert.equal(actual.expectedScore,null);assert.equal(actual.confirmedScore,0);assert.ok(actual.missing.some(value=>/项目结算审核书/.test(value)));}
 const outside=report();outside.analysis.scoring.items[0].standard+=' | 必须另提供项目结算审核书';const actual=row(outside);assert.equal(actual.expectedScore,null);assert.equal(actual.confirmedScore,0);assert.ok(actual.missing.some(value=>/项目结算审核书/.test(value)));
 const shortened=report(body+'每个合同建筑面积不少于1000平方米。');shortened.analysis.scoring.items[0].readableStandard=body;assert.equal(row(shortened).expectedScore,null);assert.equal(row(shortened).confirmedScore,0);
});

test('table metadata removal preserves OR/AND proof grouping and independent proof clauses',()=>{
 const alternate=body.replace('合同扫描件以及验收报告扫描件','（合同扫描件以及验收报告扫描件）或业主证明'),owner=record();owner.documentIds=['owner-doc'];owner.fields.evidence=[{kind:'ownerProof',documentId:'owner-doc',verified:true}];
 const r=report(alternate,['合同扫描件','验收报告扫描件','业主证明'],[owner]);assert.equal(row(r).expectedScore,1);
 const onlyContract=record();onlyContract.fields.evidence.pop();assert.equal(row(report(alternate,['合同扫描件','验收报告扫描件','业主证明'],[onlyContract])).expectedScore,null);
 const independent=body.replace('合同扫描件以及验收报告扫描件','合同扫描件或验收报告扫描件，且须提供业主证明');assert.equal(row(report(independent,['合同扫描件','验收报告扫描件','业主证明'])).expectedScore,null);
});

test('stamp and validity requirements remain individually required after structured parsing',()=>{
 const strict=body.replace('合同扫描件以及','加盖公章的有效合同扫描件以及');for(const key of ['stamped','valid']){const rec=record();rec.fields.evidence[0][key]=false;const actual=row(report(strict,['合同扫描件','验收报告扫描件'],[rec]));assert.equal(actual.expectedScore,null);assert.equal(actual.confirmedScore,0);}
 assert.equal(row(report(strict)).expectedScore,1);
});

test('amount and contract-date predicates still exclude confirmed records outside the original limits',()=>{
 const constrained=body.replace('每提供1个合同得1分','合同金额不少于50万元，每提供1个合同得1分');assert.equal(row(report(constrained)).expectedScore,1);
 const small=record();small.fields.amount=499999;const early=record();early.fields.contractDate='2022-12-31';const future=record();future.fields.contractDate='2027-01-01';
 for(const rec of [small,early,future]){const actual=row(report(constrained,['合同扫描件','验收报告扫描件'],[rec]));assert.equal(actual.expectedScore,0);assert.equal(actual.confirmedScore,0);assert.equal(actual.records[0].status,'excluded');}
});
