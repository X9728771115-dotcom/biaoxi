import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPricingAnalysis} from '../src/core/pricing.js';
const id='fceb1331-fc8a-4203-b3a1-e3009c8d8772';
const fileName='1.谈判文件2026LXGC-249 (1).doc';
const block=(number,text,section='第二章 竞标人须知')=>({id:`${id}:b${number}`,documentId:id,fileName,page:null,section,text});
// Hand-checked excerpts from 249, retaining exact source wording and legacy DOC null pages.
const real=[
 block(273,'| 评审办法的采用 | 经评审的最低投标价法，通过形式评审、资格评审、响应性评审、施工组织设计、项目管理机构评审的竞标人进行二次报价（最终报价）。如竞标人二次报价（最终报价）一致，有相关施工业绩的优先，最终由评审小组确定。如竞标人最终报价超出最高投标限价或预算价的，评审小组可向报价方提出参考价格，经协商确定成交意向。反之，采购人将重新组织采购。 |'),
 block(280,'投标报价含税。 |'),
 block(382,'3.2.1 竞标人应按第五章“工程量清单”的要求填写相应表格。','3.2 投标报价'),
 block(383,'3.2.2 竞标人在投标截止时间前修改投标函中的投标报价总额，应同时修改“已标价工程量清单”中的相应报价，投标报价总额为各分项金额之和。此修改须符合本章第4.3款的有关要求。','3.2 投标报价'),
 block(517,'本次评审采用经评审的最低投标价法。评审小组对满足谈判文件实质要求的投标文件，按照经评审的投标价由低到高的顺序推荐成交候选人，或根据采购人授权直接确定成交人，但投标报价低于其成本的除外。经评审的投标价相等时，投标报价低的优先。','2.1.4'),
 block(549,'1.3 采购人提供的工程量清单中所列工程量是竞标人报价的参考，不作为最终结算与支付的依据。','第四章 工程量清单'),
 block(554,'2.1 投标报价应包括按照谈判文件的要求实施完成本包全部工程，以及修复任何缺陷（含保修期）所需的全部费用，投标报价含税。','第四章 工程量清单'),
 block(556,'工程量清单计价表中的每一项目须填入单价或价格，且只允许有一个报价。竞标人没有填入单价或价格的项目，其费用应视为已分摊在工程量清单的有关项目的单价或价格中。','第四章 工程量清单'),
 block(920,'章号 | 节号 | 名称 | 含税报价金额（元） | 税率 | 备注 |','第四章 工程量清单'),
 block(971,'（六）合同价款：本工程价格形式为 （请选择：固定总价／固定单价），工程款（总计／单价）（含增值税）人民币大写 元整（小写： 元）（其中不含税价人民币 元，增值税 元）（可在工程内容列表中标明工作量及总价／单价逐项计价情况）。','第七章 合同条款及格式（参考模板）'),
 block(1023,'固定总价合同：在合同签订后，工程总价不作调整。','第七章 合同条款及格式（参考模板）'),
 block(1024,'固定单价合同：在合同签订后，工作量的增加需以甲方书面确认为准，经甲方确认后的工作量方可计入合同总价的计算。','第七章 合同条款及格式（参考模板）')
];
const document=(blocks=real)=>({id,fileName,role:'tender',extraction:{complete:true,blocks}});
const values=(r,key)=>r[key].map(x=>x.value).join('\n');
const ref=b=>({documentId:id,fileName,blockId:b.id,page:null,section:b.section,quote:b.text});

test('249 compilation preserves tax inclusive total, item prices and no invented tax rate',()=>{
 const r=buildPricingAnalysis({}, {documents:[document()]});
 assert.match(values(r,'compilation'),/含税/);assert.match(values(r,'compilation'),/各分项金额之和/);assert.match(values(r,'compilation'),/每一项目|逐项/);
 assert.match(values(r,'warnings'),/税率.*未明确|未明确.*税率/);assert.doesNotMatch(JSON.stringify(r),/9%|13%|6%/);
 for(const item of r.compilation)assert.ok(item.references.length&&item.references.every(s=>real.some(b=>b.id===s.blockId&&b.text.includes(s.quote))));
});
test('249 rounds distinguish initial document price from final second quotation with its entry conditions',()=>{
 const r=buildPricingAnalysis({}, {documents:[document()]});
 assert.match(values(r,'rounds'),/初次|首次/);assert.match(values(r,'rounds'),/二次报价.{0,10}最终报价/);assert.match(values(r,'rounds'),/形式评审.*资格评审.*响应性评审/);
});
test('249 evaluated price ranking and two distinct tie conditions remain sourced and pending clarification',()=>{
 const r=buildPricingAnalysis({}, {documents:[document()]});
 assert.match(values(r,'evaluation'),/经评审的投标价由低到高/);assert.match(values(r,'evaluation'),/不等同|不能等同|不能.*原始|区别/);
 assert.match(values(r,'ties'),/最终报价.*一致.*相关施工业绩/);assert.match(values(r,'ties'),/经评审的投标价相等.*投标报价低/);
 assert.match(values(r,'warnings'),/同价.*适用|同价.*层次|同价.*先后/);
});
test('249 unselected fixed total and unit template never establishes the selected contract method',()=>{
 const r=buildPricingAnalysis({}, {documents:[document()]});
 assert.match(values(r,'contract'),/待澄清|未选择|未选定/);assert.match(values(r,'contract'),/固定总价.*固定单价/);
 assert.ok(r.contract.some(x=>x.references.some(s=>s.blockId.endsWith(':b971'))));
 assert.doesNotMatch(values(r,'contract'),/^本项目采用固定总价/m);
});
test('explicit selected contract and tax rate take precedence over generic template descriptions',()=>{
 const r=buildPricingAnalysis({}, {documents:[document([...real,block(2001,'本项目合同价格形式为固定单价合同。税率为9%。','专用合同条款')])]});
 assert.match(values(r,'contract'),/本项目.*固定单价/);assert.doesNotMatch(values(r,'contract'),/未选|待澄清/);assert.doesNotMatch(values(r,'warnings'),/税率.*未明确|未明确.*税率/);
 assert.match(values(r,'compilation'),/税率.*9%/);
});
test('negative declarations and generic method introductions do not assert a project method or second round',()=>{
 const r=buildPricingAnalysis({}, {documents:[document([block(1,'本项目不采用经评审的最低投标价法，不进行二次报价。'),block(2,'常用评审方法包括综合评分法和经评审的最低投标价法。固定总价合同是常见合同类型。')])]});
 assert.equal(r.evaluation.length,0);assert.equal(r.rounds.length,0);assert.equal(r.contract.length,0);
});
test('legacy reports use only their retained original references and ignore free summaries, AI fields and company evidence',()=>{
 const report={analysis:{overview:[{label:'评审方法',value:'错误的直接最低价',references:[ref(real[0]),ref(real[4])]}]},categories:[{items:[{references:[ref(real[5])]}]}],presentation:{aiSupplement:{references:[{...ref(real[9]),quote:'本项目采用固定总价合同。'}]}},companySnapshot:{records:[{sources:[{...ref(real[9]),quote:'本项目采用固定总价合同。'}]}]}};
 const before=JSON.stringify(report),r=buildPricingAnalysis(report);
 assert.match(values(r,'evaluation'),/经评审/);assert.equal(r.compilation.length,0);assert.equal(r.contract.length,0);assert.match(values(r,'warnings'),/报价编制.*待核|报价编制.*缺/);assert.equal(JSON.stringify(report),before);
});
test('lot limits remain separate and preserve their own original reference',()=>{
 const b=block(251,'标段1：含税212300元（含安全生产费5131元）;标段2：含税479500元（含安全生产费14500元）;标段3：含税658800元（含安全生产费12600元）。 |');
 const r=buildPricingAnalysis({analysis:{overview:[{kind:'lot-limit',label:'标段1最高投标限价',package:'1',value:'含税212300元（含安全生产费5131元）',references:[ref(b)]}]}});
 assert.ok(r.limits.some(x=>/标段1/.test(x.value)&&/212300/.test(x.value)));assert.ok(r.limits.every(x=>x.references[0].blockId===b.id));
});
test('example tax percentages do not become the project tax rate',()=>{
 const r=buildPricingAnalysis({}, {documents:[document([block(3,'投标报价含税，税率自行填报。例如税率为9%。')])]});
 assert.doesNotMatch(values(r,'compilation'),/原文明确税率为9%/);assert.match(values(r,'warnings'),/未明确具体税率/);
});
test('when original documents are supplied an absent block cannot validate a retained pricing citation',()=>{
 const r=buildPricingAnalysis({analysis:{overview:[{references:[{...ref(real[0]),blockId:id+':fake',quote:'本项目进行二次报价（最终报价）。'}]}]}},{documents:[document([block(1,'本项目报价程序待明确。')])]});
 assert.equal(r.rounds.length,0);
});
test('forbidden second quotations and negated contract selection do not create positive pricing facts',()=>{
 const r=buildPricingAnalysis({}, {documents:[document([block(3,'本项目不得进行二次报价。本项目不实行固定总价合同。')])]});
 assert.equal(r.rounds.length,0);assert.ok(r.contract.every(item=>!/明确采用固定总价/.test(item.value)));
});
test('a plain tax-inclusive quotation clause remains compilation evidence',()=>{
 const r=buildPricingAnalysis({}, {documents:[document([block(3,'本项目报价含税，应覆盖实施完成工程所需全部费用。')])]});
 assert.match(values(r,'compilation'),/报价含税/);
});

test('roof pricing uses relevant table rows once and marks page 23 overlapping evidence pending',async()=>{
 const fs=await import('node:fs');const {analyzeDocument}=await import('../src/core/analyzer.js');
 const extraction=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8'));
 const report=analyzeDocument(extraction),r=report.pricingAnalysis;
 assert.ok(r.rounds.every(item=>item.references.every(s=>s.blockId!=='roof-v2:b300')),'重叠表格不能成为确定报价轮次');
 assert.match(values(r,'warnings'),/23.*重叠.*待核|重叠.*23.*待核/);
 assert.ok(r.warnings.some(item=>item.references.some(s=>s.blockId==='roof-v2:b300')),'待核条款仍保留原文入口');
 assert.doesNotMatch(values(r,'limits'),/联合体|代理服务费|履约保证/);assert.equal(r.limits.filter(item=>/1,122,100/.test(item.value)).length,1);
 assert.match(values(r,'evaluation'),/综合评分法/);
 assert.match(values(r,'rounds').normalize('NFKC'),/不得少于3家/);assert.match(values(r,'rounds').normalize('NFKC'),/可以为2家/);
 for(const field of ['rounds','evaluation','limits'])for(const item of r[field])for(const s of item.references){const b=extraction.blocks.find(b=>b.id===s.blockId);assert.ok(b?.text.includes(s.quote),`${field}原句须是实际原文子串`);}
});
test('same table block whole and partial references preserve the full relevant limit row only once',()=>{
 const row='1 | 最高投标限价 | 采购包1：含税100000元；如最终需求调整，按采购方书面通知复核。';
 const whole='序号 | 名称 | 要求\n'+row+'\n2 | 联合体 | 不接受\n3 | 代理服务费 | 5000元';
 const b=block(3,whole),report={categories:[{items:[{references:[ref(b),{...ref(b),quote:row},{...ref(b),quote:'最高投标限价 | 采购包1：含税100000元'}]}]}]};
 const r=buildPricingAnalysis(report);assert.equal(r.limits.length,1);assert.match(values(r,'limits'),/如最终需求调整.*书面通知/);assert.doesNotMatch(values(r,'limits'),/联合体|代理服务费/);
});
test('a single allowed round retains the explicit ban on a second round',()=>{
 const b=block(3,'报价轮次 | 本项目只允许一次报价，不进行二次报价；但采购人依法要求澄清的除外。');
 const r=buildPricingAnalysis({}, {documents:[document([b])]});assert.match(values(r,'rounds'),/只允许一次报价.*不进行二次报价.*澄清的除外/);
});
test('compilation retains the complete related exception and the stated calculation base',()=>{
 const b=block(3,'本项目报价含税，以工程量清单分项金额之和为报价基数。甲供设备价款除外，其安装费仍应计入报价。');
 const r=buildPricingAnalysis({}, {documents:[document([b])]});assert.match(values(r,'compilation'),/报价基数.*甲供设备价款除外.*安装费仍应计入/);
});
test('a structural method row establishes comprehensive evaluation without generic method mentions',()=>{
 const b=block(3,'2 | 评审方法 | 综合评分法（具体规则详见第五章）');
 const r=buildPricingAnalysis({}, {documents:[document([b])]});assert.match(values(r,'evaluation'),/综合评分法/);assert.equal(r.evaluation[0].references[0].quote,b.text);
 const generic=buildPricingAnalysis({}, {documents:[document([block(4,'评审方法介绍：常用方法包括综合评分法与最低价法。')])]});assert.equal(generic.evaluation.length,0);
});
test('evaluation of submitted prices and procurement review after quotation do not become quotation rounds',()=>{
 const blocks=[block(3,'由磋商小组采用综合评分法对提交最后报价的供应商的响应文件和最后报价进行综合评分。'),block(4,'供应商最后报价结束后，代理机构应当组织人员对评审结果进行复核。')];
 const r=buildPricingAnalysis({}, {documents:[document(blocks)]});assert.equal(r.rounds.length,0);assert.match(values(r,'evaluation'),/综合评分法/);
});
test('roof comprehensive scoring ties retain equal-score price comparison and equal-score-plus-price technical ordering',async()=>{
 const fs=await import('node:fs');const extraction=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8'));
 const b=extraction.blocks.find(block=>block.id==='roof-v2:b428');
 const r=buildPricingAnalysis({}, {documents:[{...extraction,role:'tender',blocks:[b]}]});
 const value=values(r,'ties').normalize('NFKC');assert.match(value,/评审得分相同的.*按最后报价由低到高/);assert.match(value,/评审得分且最后报价相同的.*按照技术指标优劣.*技术指标得分/);
 assert.doesNotMatch(value,/相关施工业绩|经评审的投标价相等/);assert.equal(r.ties.length,1);assert.equal(r.ties[0].references[0].quote,b.text);assert.equal(r.ties[0].references[0].page,33);
});
test('comprehensive score ties cannot be rewritten as unconditional lowest-price priority',()=>{
 const q='综合评分同分处理：评审得分相同的，按最后报价由低到高排序；评审得分且最后报价相同的，按技术指标得分由高到低排序。';
 const r=buildPricingAnalysis({}, {documents:[document([block(3,q,'评审办法')])]});assert.match(values(r,'ties'),/评审得分且最后报价相同/);assert.match(values(r,'ties'),/技术指标得分/);assert.doesNotMatch(values(r,'ties'),/^最后报价低的优先/);
 const generic=buildPricingAnalysis({}, {documents:[document([block(4,'通常评审得分相同的，按最后报价由低到高排序，仅为通用规则示例。')])]});assert.equal(generic.ties.length,0);
});
