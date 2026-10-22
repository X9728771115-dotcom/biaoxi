import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeDocument} from '../src/core/analyzer.js';
import {inferProjectContext} from '../src/core/project-context.js';
import {predictionSummaryHTML} from '../public/score-summary.js';
import {hasNonScoringMethod} from '../public/score-summary.js';
import {companyAnalysisHTML} from '../public/company-view.js';
import {buildCompanyAnalysis} from '../src/core/company-analysis.js';
import {projectOverviewHTML,prioritySummaryHTML} from '../public/analysis-view.js';
import {scoringSectionHint} from '../public/app.js';

const doc=(rows,warnings=[])=>({id:'anonymous-negotiation',fileName:'匿名谈判文件.doc',complete:false,warnings,blocks:rows.map((value,index)=>({id:`anonymous-negotiation:b${index+1}`,text:typeof value==='string'?value:value.text,section:'采购公告',kind:'paragraph',page:null,...(typeof value==='object'?value:{})}))});
const content=()=>doc([
 '采购项目：培训用房消防门、公共区域及排水设施维修项目工程',
 '2.1建设地点：','某市某区示例路18号。','2.2计划工期：','37日历天。',
 '1.1.5 本采购项目建设地点：见竞标人须知前附表。',
 '1.3.2 | 计划工期 | 见第一章采购公告。 |',
 '2.4采购范围：','划分为3个标段。（标段1：消防门改造、标段2：公共区域维修、标段3：排水整修）',
 '3.2.3 | 最高投标限价 | ☑有，最高投标限价：',
 '标段1：含税123400元（含安全生产费3210元）;标段2：含税456700元（含安全生产费6540元）;标段3：含税789000元（含安全生产费9870元）。 |',
 '竞标人在中华人民共和国境内合法注册，具有独立法人资格，符合其经营范围。',
 '应为一般纳税人（结算时提供增值税专用发票）。',
 '安全生产许可证在有效期内。',
 '竞标人必须具备建筑装修装饰工程专业承包贰级及以上资质。',
 '竞标人必须具备近三年（2024年5月至今）类似方面的业绩。',
 '项目经理：竞标人拟派项目经理须具备有效的安全生产考核合格证书，与竞标人具有有效的劳动和社保关系。',
 '1.4.2 | 是否接受联合体投标 | ☑不接受 |',
 '3.3.1 | 投标保证金 | 是否要求竞标人递交投标保证金：','☑不要求 |',
 '电子版1份，须以PDF格式（按规定加盖公章或签字）存储于U盘中，电子版应与投标文件正本一致，页面内容不能空白，U盘须单独密封完好后递交。未按以上要求递交的，采购人将予以拒收。',
 '评审办法的采用 | 经评审的最低投标价法，通过形式评审、资格评审、响应性评审、施工组织设计、项目管理机构评审的竞标人进行二次报价（最终报价）。如二次报价一致，有相关施工业绩的优先。',
 '评审小组按照经评审的投标价由低到高的顺序推荐成交候选人，但低于其成本的除外。',
 '付款方式：项目验工计价完成且收到合格的增值税专用发票30日以银行转账方式支付发票金额的96%；剩余6%作为质量保证金，2年后不计息支付。',
 '质量保证金：合同价的4%。',
 '本项目结算需经过第三方审计出具审计报告无异议后且竣工验收合格后结算。',
 '第五章 技术标准和要求','第六章 图纸',
 {text:'第七章 合同条款及格式（参考模板）',section:'第七章 合同条款及格式（参考模板）'},
 {text:'工程预付款按照合同价款的10%支付。季度结算工程款按照验工计价的90%支付。',section:'第七章 合同条款及格式（参考模板）'},
 {text:'2-4联合体协议书（如有）',section:'第八章 投标文件格式'},
 {text:'所有成员自愿组成联合体，共同参加投标。',section:'第八章 投标文件格式'}
]);
const facts=report=>report.analysis.overview;
const assertSources=(items,input)=>{const blocks=new Map(input.blocks.map(block=>[block.id,block]));for(const item of items)for(const ref of item.references||[]){assert.equal(ref.documentId,input.id);assert.ok(blocks.get(ref.blockId)?.text.includes(ref.quote),`非原文引用：${ref.quote}`);}};

test('v13 procurement project name and native next-paragraph location/duration resolve front-table references',()=>{
 const input=content(),report=analyzeDocument(input),overview=facts(report);
 assert.equal(overview.find(f=>f.label==='项目名称')?.value,'培训用房消防门、公共区域及排水设施维修项目工程');
 assert.equal(overview.find(f=>f.label==='建设地点')?.value,'某市某区示例路18号');
 assert.equal(overview.find(f=>f.label==='工期／交付')?.value,'37日历天');
 assert.equal(report.projectContext.region,'某市某区示例路18号');
 assert.ok(!String(report.projectContext.region).includes('见'));
 assertSources(overview,input);assertSources([{references:report.projectContext.provenance.region}],input);
});

test('v13 each lot retains its own cap and safety fee rather than borrowing the first amount',()=>{
 const input=content(),report=analyzeDocument(input),limits=facts(report).filter(f=>f.kind==='lot-limit');
 assert.deepEqual(limits.map(f=>[f.package,f.amount,f.safetyFee]),[['1',123400,3210],['2',456700,6540],['3',789000,9870]]);
 assertSources(limits,input);
});

test('v13 explicit lowest-price procedure without a scoring table makes score forecasting inapplicable',()=>{
 const input=content(),report=analyzeDocument(input);
 assert.equal(report.analysis.scoring.status,'not-applicable');
 assert.match(report.analysis.scoring.explanation,/最低.*价/);
 assert.equal(report.companyAnalysis.forecast.status,'not-applicable');
 assert.equal(report.companyAnalysis.forecast.totalRange,null);
 assert.equal(report.companyAnalysis.screening.status,'not-applicable');
 assert.equal(report.companyAnalysis.screening.internalScreening,null);
 assert.equal(report.outputs.scoreItems.length,0);assert.equal(report.categories.length,14);assert.equal(Object.keys(report.outputs).length,4);
 const method=report.analysis.methodDetails.find(item=>item.title.includes('最低'));assert.ok(method);assert.match(method.interpretation,/审查|评审/);assert.match(method.interpretation,/二次报价/);assert.match(method.interpretation,/由低到高/);
 const summary=predictionSummaryHTML(report.companyAnalysis,report);assert.match(summary,/不适用/);assert.doesNotMatch(summary,/技术.*满分|95%|商务满分|总分区间/);
 assert.match(scoringSectionHint(report),/不适用/);assert.doesNotMatch(scoringSectionHint(report),/满分/);
 assert.match(prioritySummaryHTML(report),/0[\s\S]*不适用|不适用[\s\S]*0/);
 assert.match(projectOverviewHTML(report),/最低.*价/);assertSources([method],input);
});

test('v13 the full company view and conclusion omit all empty score assumptions for a sourced lowest-price method',()=>{
 for(const companySnapshot of [null,{id:'company-demo',name:'匿名企业',records:[]}]){
  const report=analyzeDocument(content(),{companySnapshot}),html=companyAnalysisHTML(report);
  assert.match(html,/资格核验|资格.*待核验/);assert.match(html,/最低价/);
  assert.doesNotMatch(html,/95%|技术满分|清单满分|报价满分|分值口径|完整测算|逐项预计分/);
  if(companySnapshot)assert.match(html,/逐项资料匹配/);
  assert.doesNotMatch(report.outputs.conclusion.conditions.join('；'),/技术和报价满分|技术、清单及报价满分/);
 }
});

test('v13 a legacy report without sourced scoring metadata cannot be inferred to use a lowest-price method',()=>{
 const report={createdAt:'2026-10-21T00:00:00Z',categories:[],analysis:{scoring:{items:[],status:'not-applicable'}}};
 assert.notEqual(buildCompanyAnalysis(report).forecast.status,'not-applicable');
 const legacy={companyAnalysis:{qualification:{status:'pending',groups:[]},forecast:{status:'not-applicable'},screening:{},matches:[]}};
 assert.doesNotMatch(companyAnalysisHTML(legacy),/文件明确采用最低价法/);
 assert.doesNotMatch(projectOverviewHTML(report),/评分与得分预测不适用/);
});

test('v13 a negated lowest-price mention does not override the current comprehensive-scoring choice',()=>{
 const input=doc(['本项目采用综合评分法，不得采用最低价法。']),report=analyzeDocument(input);
 assert.notEqual(report.analysis.scoring.status,'not-applicable');assert.notEqual(report.companyAnalysis.forecast.status,'not-applicable');assert.equal(hasNonScoringMethod(report),false);
 assert.equal(facts(report).find(fact=>fact.label==='评审方法')?.value,'综合评分法');
});

test('v13 an introductory list of methods is not the current project selection',()=>{
 const input=doc(['常用评审方法包括综合评分法、最低价法，本项目采用综合评分法。']),report=analyzeDocument(input);
 assert.notEqual(report.analysis.scoring.status,'not-applicable');assert.notEqual(report.companyAnalysis.forecast.status,'not-applicable');assert.equal(hasNonScoringMethod(report),false);
 assert.equal(facts(report).find(fact=>fact.label==='评审方法')?.value,'综合评分法');
});

test('v13 package-specific mixed methods never become one lowest-price method for an unselected whole report',()=>{
 const input=doc(['采购包1评审方法：最低价法。','采购包2评审方法：综合评分法。']),report=analyzeDocument(input);
 assert.notEqual(report.analysis.scoring.status,'not-applicable');assert.notEqual(report.companyAnalysis.forecast.status,'not-applicable');assert.equal(hasNonScoringMethod(report),false);
 assert.match(facts(report).find(fact=>fact.label==='评审方法')?.value||'',/范围|包|待核验/);
});

test('v13 the explicit current lowest-price choice survives a negated or introductory other method',()=>{
 for(const text of ['本项目明确采用最低价法，综合评分法不适用。','常用评审方法包括综合评分法、最低价法，本项目明确采用最低价法。']){
  const input=doc([text]),report=analyzeDocument(input);
  assert.equal(report.analysis.scoring.status,'not-applicable');assert.equal(report.companyAnalysis.forecast.status,'not-applicable');assert.equal(hasNonScoringMethod(report),true);
  assert.equal(facts(report).find(fact=>fact.label==='评审方法')?.value,'最低价法');assertSources(report.analysis.methodDetails,input);
 }
});

test('v13 neither hypothetical method examples nor cross-document conflicting choices produce a global lowest-price forecast',()=>{
 for(const text of ['例如：本项目采用最低价法。','若本项目采用最低价法，则按价格排序。','本项目可采用最低价法。','评审方法：最低价法或综合评分法。','本项目采用最低价法或者综合评分法，另行确定。']){
  const report=analyzeDocument(doc([text]));assert.notEqual(report.analysis.scoring.status,'not-applicable',text);assert.equal(hasNonScoringMethod(report),false,text);
 }
 const input=doc(['本项目采用最低价法。']),attachment={...doc(['本项目采用综合评分法。']),id:'other-method',fileName:'另一个方法附件.txt'};
 attachment.blocks=attachment.blocks.map(block=>({...block,id:'other-method:'+block.id}));
 const report=analyzeDocument(input,{attachments:[attachment]});assert.notEqual(report.analysis.scoring.status,'not-applicable');assert.equal(hasNonScoringMethod(report),false);
});

test('v13 company evidence with its own site label cannot supply or conflict with the tender project region',()=>{
 const input=doc(['建设地点：本市示例路8号。']),evidence={...doc(['建设地点：外省市其它工程2号。']),id:'company-evidence',role:'evidence'};
 const context=inferProjectContext([input,evidence]);assert.equal(context.region,'本市示例路8号');assert.deepEqual(context.conflictFields,[]);
 assert.equal(inferProjectContext([evidence]).region,undefined);
});

test('v13 the selected consortium checkbox cannot jump across an unselected opposite choice',()=>{
 const input=doc(['是否接受联合体投标：☑接受 □不接受。']),report=analyzeDocument(input);
 const option=report.analysis.businessRequirements.find(item=>/联合体.*选项/.test(item.title));
 assert.ok(option);assert.match(option.interpretation,/勾选接受/);assert.doesNotMatch(option.interpretation,/勾选不接受/);assertSources([option],input);
 const excluded=analyzeDocument(doc(['是否接受联合体投标：□接受 ☑不接受。']));
 assert.match(excluded.analysis.businessRequirements.find(item=>/联合体.*选项/.test(item.title))?.interpretation||'',/勾选不接受/);
});

test('v13 payment conflict is computed from actual clauses while audit and acceptance stay conjunctive',()=>{
 const input=content(),report=analyzeDocument(input),conflict=report.analysis.clarifications.find(item=>/付款比例.*冲突/.test(item.title));
 assert.ok(conflict);assert.match(conflict.interpretation,/96%/);assert.match(conflict.interpretation,/6%/);assert.match(conflict.interpretation,/4%/);assert.match(conflict.interpretation,/102%/);
 assert.match(conflict.interpretation,/若按同一基数.*102%/);assert.match(conflict.interpretation,/发票.*合同价.*基数差异/);
 const payment=report.analysis.commercialRisks.find(item=>item.title==='付款触发与履约资金占用');
 assert.match(payment.interpretation,/第三方审计/);assert.match(payment.interpretation,/且.*竣工验收合格/);
 assert.ok(!payment.references.some(ref=>/参考模板/.test(ref.section)));
 assert.doesNotMatch(payment.interpretation,/10%|90%/);assertSources([conflict,payment],input);
});

test('v13 staged payments are not declared arithmetically inconsistent by comparing only the first payment with the retention',()=>{
 const input=doc(['付款方式：预付款支付合同价的20%；验收后支付合同价的70%；剩余10%作为质量保证金。']),report=analyzeDocument(input);
 assert.ok(!report.analysis.clarifications.some(item=>/付款比例.*冲突/.test(item.title)));
 assert.match(report.analysis.commercialRisks.find(item=>item.title==='付款触发与履约资金占用')?.interpretation||'',/20%.*70%.*10%/);
});

test('v13 actual qualification and USB refusal clauses enter project summaries without consortium template facts',()=>{
 const input=content(),report=analyzeDocument(input),requirements=report.analysis.businessRequirements;
 const qualification=requirements.find(item=>/项目.*资格/.test(item.title));assert.ok(qualification);
 assert.match(qualification.interpretation,/独立法人资格/);assert.match(qualification.interpretation,/一般纳税人/);assert.match(qualification.interpretation,/建筑装修装饰工程专业承包贰级/);
 const consortium=requirements.find(item=>/联合体.*选项/.test(item.title));assert.ok(consortium);assert.match(consortium.interpretation,/不接受/);assert.ok(!consortium.references.some(ref=>ref.quote.includes('自愿组成')));
 const usb=report.analysis.preparation.find(item=>/U盘/.test(item.title));assert.ok(usb);assert.equal(usb.hard,true);assert.match(usb.interpretation,/拒收/);assert.match(usb.interpretation,/单独密封/);
 assertSources([...requirements,usb],input);
});

test('v13 a qualification list item retains its prohibitive parent and neighbouring enumerated conditions',()=>{
 const input=doc(['竞标人应为一般纳税人。','竞标人必须具备有效的安全生产许可证。','1.4.2 竞标人不得存在下列情形之一：','（1）为采购人不具有独立法人资格的附属机构（单位）；','（2）为本采购项目的监理人；','1.5 费用承担']),report=analyzeDocument(input);
 const qualification=report.analysis.businessRequirements.find(item=>/项目.*资格/.test(item.title));assert.ok(qualification);
 assert.match(qualification.interpretation,/不得存在下列情形之一.*附属机构.*监理人/);
 assert.ok(qualification.references.some(ref=>ref.blockId===input.blocks[2].id&&ref.quote===input.blocks[2].text));
 assert.ok(qualification.references.some(ref=>ref.blockId===input.blocks[4].id));assertSources([qualification],input);
});

test('v13 unread embedded files are identified by the actual processing warning without inventing their contents',()=>{
 const input=content();input.warnings=[{code:'DOC_EMBEDDED_UNPARSED',message:'发现 4 个内嵌附件，均未展开分析：技术要求.rar；甲标段图纸.rar；乙标段图纸.pdf；丙标段图纸.pdf。请将附件单独上传。'}];
 const report=analyzeDocument(input),gap=report.analysis.clarifications.find(item=>/内嵌附件.*未读/.test(item.title));
 assert.ok(gap);for(const name of ['技术要求.rar','甲标段图纸.rar','乙标段图纸.pdf','丙标段图纸.pdf'])assert.ok(gap.interpretation.includes(name));
 assert.equal(gap.processingSources[0].code,'DOC_EMBEDDED_UNPARSED');assert.match(gap.interpretation,/4/);assertSources([gap],input);
});

test('v13 unresolved location references and agency addresses never become an inferred project region',()=>{
 const input=doc(['建设地点：见竞标人须知前附表。','代理机构地址：海州市示例路8号。']);
 assert.equal(inferProjectContext([input]).region,undefined);
});

test('v13 joined native cover labels stop the project name at its project-number label',()=>{
 const input=doc(['采购项目名称：匿名屋面维修改造采购项目编号：TEST-2026-88']);
 assert.equal(facts(analyzeDocument(input)).find(fact=>fact.label==='项目名称')?.value,'匿名屋面维修改造');
});

test('v13 a blank location in a nested contract-template appendix cannot consume the next duty paragraph',()=>{
 const input=doc(['建设地点：某市示例路8号。',
  {text:'第七章 合同条款及格式（参考模板）',section:'第七章 合同条款及格式（参考模板）'},
  {text:'工程项目地点：',section:'附件四 廉政协议'},
  {text:'为加强工程建设廉政管理，规范甲乙双方的行为，特订立本协议书。',section:'附件四 廉政协议'},
  {text:'第八章 投标文件格式',section:'第八章 投标文件格式'}]);
 const locations=facts(analyzeDocument(input)).filter(fact=>fact.label==='建设地点');
 assert.equal(locations.length,1);assert.equal(locations[0].value,'某市示例路8号');
 assert.equal(inferProjectContext([input]).region,'某市示例路8号');
});

test('v13 lowest-price specialization does not suppress the synthetic roof scoring table',async()=>{
 const input=JSON.parse(await readFile(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8')),report=analyzeDocument(input);
 assert.equal(report.analysis.scoring.total,100);assert.equal(report.companyAnalysis.scoreRows.length,13);assert.deepEqual(report.companyAnalysis.forecast.totalRange,{min:97,max:100});
 assert.notEqual(report.analysis.scoring.status,'not-applicable');
 assert.match(companyAnalysisHTML(report),/技术满分假设/);
 assert.equal(facts(report).find(fact=>fact.label==='评审方法')?.value,'综合评分法');
 assert.ok(!report.analysis.clarifications.some(item=>item.title==='评审方法的包件或来源适用范围待核验'),'同法且已读取计分表不另制造方法冲突');
});

test('v13 BOQ table headers do not become extra project names',()=>{
 const input=doc(['采购项目名称：某处屋面维修改造',
 '序号 | 项目编码 | 项目名称 | 项目特征描述 | 计量单位 | 工程量 | 金额（元）\n1 | 010902 | 新做屋面工程 | 见特征 | m2 | 1800 |',
 '序号 | 项目编码 | 项目名称 | 工作内容 | 价格（元） | 备注\n1 | 1 | 通用措施项目费 | | |']);
 const report=analyzeDocument(input);assert.deepEqual(report.analysis.overview.filter(f=>f.label==='项目名称').map(f=>f.value),['某处屋面维修改造']);
 assertSources(report.analysis.overview,input);
});

test('v13 a package budget followed by a reference to a later cap is not itself a lot cap',()=>{
 const input=doc(['采购预算及最高限价 | 本项目各包采购预算金额如下：采购包1：123400元。供应商报价不得超过预算，最高限价详见第三章。']);
 const report=analyzeDocument(input);assert.equal(report.analysis.overview.filter(fact=>fact.kind==='lot-limit').length,0,'不得借用后面的最高限价标签给前面预算换类型');
 const actual=content();assert.equal(analyzeDocument(actual).analysis.overview.filter(fact=>fact.kind==='lot-limit').length,3,'明确限价标题下的三个标段仍分别保留');
});
