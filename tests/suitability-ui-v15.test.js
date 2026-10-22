import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import * as ui from '../public/app.js';
const weights={qualification:35.29,business:35.29,fulfillment:29.42};
const dims=Object.entries(weights).map(([id,weight])=>({id,label:{qualification:'资格',business:'商务',fulfillment:'履约',quotation:'报价'}[id],weight,status:'pending',score:null,range:{min:0,max:100},basis:['按本报告原文核验'],gaps:['企业资料尚待核验'],references:[]}));
const report={id:'r-v15',suitabilityAssessment:{weights,dimensions:dims,totalRange:{min:0,max:100},referenceScore:null,hardGate:{status:'pending'},recommendation:{status:'pending',label:'暂评待核',reasons:['资格待核验'],conditions:[]},thresholds:{recommend:80,cautious:60}}};
const feature=name=>{assert.equal(typeof ui[name],'function',`缺少${name}`);return ui[name];};
test('最低价项目仍显示三维适投区间和独立的待核建议，不冒充采购评分',()=>{
 const html=feature('suitabilityAssessmentHTML')({...report,analysis:{scoring:{status:'not-applicable'}}}),$=load(html);
 assert.equal($('.project-suitability').length,1);assert.match($.text(),/项目适投评分/);assert.match($.text(),/0[—–-]100/);assert.match($.text(),/暂评待核/);
 assert.deepEqual($('[name^="weight:"]').map((i,e)=>$(e).attr('value')).get(),['35.29','35.29','29.42']);assert.match($.text(),/内部/);assert.equal($('[name="weight:quotation"]').length,0);assert.equal($('[name="score:quotation"]').length,0);assert.doesNotMatch($.text(),/适投评分不适用/);
});
test('内部参考点、事实区间和采购资格分别展示，理由安全转义',()=>{
 const html=feature('suitabilityAssessmentHTML')({...report,suitabilityReview:{weights,dimensions:{business:{score:90,note:'<img src=x onerror=alert(1)>企业人工参考理由'}}},suitabilityAssessment:{...report.suitabilityAssessment,referenceScore:88,dimensions:dims.map(d=>d.id==='business'?{...d,score:90,status:'reference',manualReference:true,basis:['<img src=x onerror=alert(1)>人工理由']}:d)}}),$=load(html);
 assert.match($.text(),/88/);assert.match($.text(),/参考/);assert.match($.text(),/证据/);assert.equal($('img').length,0);assert.match($.text(),/onerror/);assert.match($.text(),/资格/);
});
test('报价方式与评审、轮次、同价、合同模板留白分别保留原文入口',()=>{
 const h=feature('pricingAnalysisHTML')({pricingAnalysis:{compilation:[{value:'按清单汇总含税总价',references:[{documentId:'d',blockId:'b1',quote:'含税总价',section:'投标报价'}]}],rounds:[{value:'二次报价即最终报价',references:[]}],evaluation:[{value:'经评审的最低投标价法',references:[]}],ties:[{value:'最终报价同价时业绩优先',references:[]}],contract:[{value:'固定总价或单价模板未选，待澄清',references:[]}],limits:[],warnings:[]}}),$=load(h);
 for(const s of ['报价编制','报价轮次','价格评审','同价处理','合同计价','模板未选'])assert.ok($.text().includes(s),s);assert.equal($('[data-source-reference]').length,1);
});
test('表单只形成三维权重和有理由的人工参考，不携带资格确认字段',()=>{
 const fn=feature('suitabilityReviewBody');const body=fn({'weight:qualification':'35.29','weight:business':'35.29','weight:fulfillment':'29.42','score:business':'80','note:business':'结合既有业绩作为内部参考','recommend':'80','cautious':'60',verified:true});
 assert.deepEqual(body,{weights,dimensions:{business:{score:80,note:'结合既有业绩作为内部参考'}},thresholds:{recommend:80,cautious:60}});
 assert.throws(()=>fn({'weight:qualification':'100','weight:business':'35.29','weight:fulfillment':'29.42'}),/100|权重/);
 assert.throws(()=>fn({'weight:qualification':'35.29','weight:business':'35.29','weight:fulfillment':'29.42','score:business':'90','note:business':'短'}),/理由|8/);
});
test('有参考分时单列参投行动，保留资格待核事实并转义内容',()=>{
 const r={...report,suitabilityAssessment:{...report.suitabilityAssessment,referenceScore:51.47,internalAction:{label:'先补齐再投',reasons:['<img src=x>拟派证明尚缺']}}};
 const $=load(feature('suitabilityAssessmentHTML')(r));
 assert.match($('.suitability-recommendation').text(),/先补齐再投/);
 assert.match($.text(),/资格核验.*待核验/);
 assert.match($.text(),/拟派证明尚缺/);assert.equal($('img').length,0);
});
test('资格状态展示不使用投标建议标签',()=>{
 const r={...report,suitabilityAssessment:{...report.suitabilityAssessment,referenceScore:40,hardGate:{status:'met'},recommendation:{label:'不建议投',reasons:[]}}};
 const $=load(feature('suitabilityAssessmentHTML')(r));
 assert.match($.text(),/资格核验：已核验满足/);assert.doesNotMatch($.text(),/资格核验：不建议投/);
});
test('已给出有依据的参考点分时表格突出本次测算，事实区间留在依据中',()=>{
 const r={...report,suitabilityAssessment:{...report.suitabilityAssessment,referenceScore:51.47,dimensions:dims.map(d=>({...d,score:30,manualReference:true,note:'已核原件后形成内部参考'}))}};
 const $=load(feature('suitabilityAssessmentHTML')(r));assert.doesNotMatch($('.suitability-table').text(),/0[—–-]100/);assert.match($('.suitability-basis').text(),/0[—–-]100/);
 assert.doesNotMatch($('.suitability-table').text(),/原件已复核/);
});
