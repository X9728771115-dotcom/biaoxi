import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/core/analyzer.js';
import {buildReportSections} from '../src/server/export.js';
const weights={qualification:35.29,business:35.29,fulfillment:29.42};
const sample=()=>{
 const r=analyzeDocument({id:'t-v15',fileName:'演示最低价项目.txt',blocks:[{id:'b1',text:'本次评审采用经评审的最低投标价法。',section:'评审办法'},{id:'b2',text:'竞标人必须具有有效的安全生产许可证。',section:'竞标人资格要求'}],complete:true});
 r.suitabilityAssessment={weights,dimensions:Object.entries(weights).map(([id,weight])=>({id,label:{qualification:'资格',business:'商务',fulfillment:'履约',quotation:'报价'}[id],weight,range:{min:0,max:100},score:null,basis:['需要核验本企业条件'],gaps:['资料待核验']})),totalRange:{min:0,max:100},referenceScore:null,hardGate:{status:'pending'},recommendation:{status:'pending',label:'暂评待核',reasons:['企业资格未确认'],conditions:[]},thresholds:{recommend:80,cautious:60}};
 r.pricingAnalysis={compilation:[{value:'按清单汇总含税总价',references:[]}],rounds:[{value:'二次报价即最终报价',references:[]}],evaluation:[{value:'经评审最低价',references:[]}],ties:[],contract:[{value:'固定总价或固定单价，模板尚未选择',references:[]}],limits:[],warnings:[]};return r;
};
test('导出第一页先给项目适投三维区间，最低价采购不计分仍不丢适投评估',()=>{
 const r=sample(),sections=buildReportSections(r),at=sections.findIndex(s=>s.title==='项目适投评分');assert.ok(at>=0&&at<sections.findIndex(s=>s.title==='项目概况'));const text=JSON.stringify(sections[at]);for(const word of ['35.29%','29.42%','暂评待核','资格','商务','履约','0—100'])assert.ok(text.includes(word),word);assert.equal(sections.find(s=>s.title==='必须加分项').blocks.some(b=>String(b.text).includes('不适用')),true);assert.ok(sections.some(s=>s.title==='14类详细分析'));assert.ok(sections.some(s=>s.title==='投标可行性结论'));
});
test('导出分开说明报价编制、轮次、评审与合同模板，不改原始报告',()=>{
 const r=sample(),before=structuredClone(r),s=buildReportSections(r).find(s=>s.title==='报价与评审分析');assert.ok(s);const text=JSON.stringify(s);for(const word of ['报价编制','报价轮次','价格评审','合同计价','模板尚未选择'])assert.ok(text.includes(word),word);assert.deepEqual(r,before);
});
test('最低价方法不自动补二次报价，甲供排除导出保留原句',()=>{
 const r=sample();r.pricingAnalysis.rounds=[];
 const quote='电热水器均由建设单位自理，本工程仅预留给水安装条件。';
 r.procurementPolicy.exclusions=[{name:'电热水器',reason:'甲方自理',sources:[{documentId:r.documentId,blockId:'excluded',section:'施工内容',page:null,quote}]}];
 const sections=buildReportSections(r),all=JSON.stringify(sections);
 assert.doesNotMatch(all,/二次报价/);assert.ok(all.includes(quote));
});
test('三维人工测算导出保留逐项依据和条件式行动，报价不成为适投维度',()=>{
 const r=sample();r.companySnapshot={id:'c1',name:'样例企业',records:[]};r.companyAnalysis={...r.companyAnalysis,companyId:'c1'};
 r.suitabilityReview={weights,dimensions:{qualification:{score:87.5,note:'三证原件已核，拟派人员关系尚欠完整承诺'},business:{score:33.33,note:'唐山屋顶合同及验收可支持业绩一分，按一除三计算；组价五分排除'},fulfillment:{score:30,note:'历史审计二十分，拟派经理局部十分，资金和施工组织待落实'}}};
 const s=buildReportSections(r).find(s=>s.title==='项目适投评分'),v=JSON.stringify(s);
 for(const word of ['51.47','先补齐再投','唐山屋顶合同及验收','组价五分排除','历史审计二十分'])assert.ok(v.includes(word),word);
 const table=s.blocks.find(b=>b.kind==='table');assert.equal(table.rows.length,3);
 assert.doesNotMatch(JSON.stringify(table),/已复核原件/);
});
