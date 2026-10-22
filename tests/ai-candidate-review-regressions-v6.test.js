import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument,summarizeReport} from '../src/core/analyzer.js';
import {buildReportContent} from '../src/core/report-content.js';
import {buildReportSections} from '../src/server/export.js';
import {confirmedCompanyFixture} from './fixtures/company-facts-fixture.js';

const all=report=>report.categories.flatMap(category=>category.items);
const category=(report,id)=>report.categories.find(item=>item.id===id);
const scoreHeaders=['评审因素分类','评审内容','具体标准和要求','分值','客观/主观','关联投标文件'];
function readyReport(){
  const report=analyzeDocument({id:'review-ready',fileName:'匿名确认材料.txt',complete:true,warnings:[],blocks:[{id:'license',page:1,text:'供应商须提供有效营业执照复印件，否则响应无效。'}]},{companySnapshot:confirmedCompanyFixture()});
  assert.ok(category(report,'entity').items.some(item=>item.hard===true),'已确认可投样本须先识别营业执照资格硬门槛');
  for(const item of all(report)){item.reviewed=true;item.matchStatus='met';}
  report.coverageReview={reviewed:true,note:'人工已对照采购原件及企业证照确认完整适用范围'};
  return summarizeReport(report);
}
function pendingCandidate(report,changes={}){
  return {...structuredClone(all(report)[0]),id:'pending-ai-review',categoryId:'personnel',title:'候选增加个人社保证明',source:'ai',reviewed:false,matchStatus:'pending',conditional:true,hard:true,interpretation:'拟派人员须另交个人社保证明。',fields:{'补充解读（待核验）':'拟派人员须另交个人社保证明。'},...changes};
}
function scoredReport(){
  const rows=[
    ['技术评审','实施方案','方案完整合理得6分。','6','主观','实施方案'],
    ['商务评审','服务方案','服务方案合理得5分。','5','主观','服务方案'],
    ['价格评审','投标价格得分','报价得分=(评审基准价/评审报价)×10。','10','客观','报价一览表']
  ].map(cells=>({cells,text:cells.join(' | ')}));
  return analyzeDocument({id:'review-score',fileName:'匿名评分标准.txt',complete:true,warnings:[],blocks:[
    {id:'groups',page:1,text:'技术部分6分；商务部分5分；价格部分10分。'},
    {id:'scores',page:2,section:'评分标准',kind:'table',tableId:'score-table',tableHeaders:scoreHeaders,tableRows:rows,text:rows.map(row=>row.text).join('\n')}
  ]});
}
function addLegacyScore(report,{reviewed=false}={}){
  const source=category(report,'scoring').items.find(item=>item.fields['满分']==='5');
  const candidate=pendingCandidate(report,{...structuredClone(source),id:'legacy-ai-extra-score',title:'候选附加社保99分',categoryId:'scoring',source:'ai',reviewed,matchStatus:reviewed?'met':'pending',hard:false,interpretation:'个人社保证明附加99分。',fields:{...source.fields,满分:'99','补充解读（待核验）':'个人社保证明附加99分。'}});
  category(report,'scoring').items.push(candidate);
  const row={id:candidate.id,title:candidate.title,group:'附加',maxScore:99,standard:'个人社保证明附加99分。',materials:['个人社保证明'],references:candidate.references,scope:structuredClone(report.analysis.scoring.items[0].scope)};
  // Historical structured rows need not carry source/reviewed; their category record is authoritative.
  report.analysis.scoring.items.push(row);
  report.analysis.scoring.groups.push({name:'附加',maxScore:99});
  report.analysis.scoring.total+=99;
  const own=report.analysis.scoring.packages[0];own.items.push(row);own.groups.push({name:'附加',maxScore:99});own.total+=99;
  return candidate;
}

test('未审候选不改变已完成人工确认的可投结论，原输入与候选复核路径保留',()=>{
  const report=readyReport(),baseline=structuredClone(report.outputs.conclusion),ai=pendingCandidate(report);
  assert.equal(baseline.label,'可投');
  category(report,'personnel').items.push(ai);
  const before=structuredClone(report),updated=summarizeReport(report);
  assert.deepEqual(updated.outputs.conclusion,baseline);
  assert.equal(updated.categories.length,14);
  assert.equal(Object.keys(updated.outputs).length,4);
  assert.ok(!updated.analysis.keyRequirements.some(item=>item.id===ai.id));
  assert.ok(!updated.outputs.risks.some(item=>item.id===ai.id));
  assert.ok(category(updated.presentation,'personnel').pendingAICandidates.some(item=>item.id===ai.id));
  assert.deepEqual(report,before);
});

test('仅有未审候选仍无可确认要求，不能因排除候选而自动形成可投结论',()=>{
  const report=readyReport(),ai=pendingCandidate(report);
  for(const group of report.categories)group.items=[];
  category(report,'personnel').items.push(ai);
  const updated=summarizeReport(report);
  assert.equal(updated.outputs.conclusion.label,'待核验');
  assert.ok(updated.outputs.conclusion.reasons.some(value=>value.includes('没有足够')));
});

test('人工确认的AI硬门槛失败及原人工失败继续优先于候选和评分',()=>{
  for(const source of ['ai','manual']){
    const report=readyReport(),failure=pendingCandidate(report,{id:'confirmed-failure',source,reviewed:true,matchStatus:'unmet',hard:true,conditional:false,notes:['人工确认该硬条件不能满足']});
    category(report,'personnel').items.push(failure,pendingCandidate(report));
    const updated=summarizeReport(report);
    assert.equal(updated.outputs.conclusion.label,'不建议投');
    assert.ok(updated.outputs.risks.some(item=>item.reviewed&&item.matchStatus==='unmet'));
    assert.ok(all(updated).some(item=>item.id===failure.id&&item.reviewed));
  }
});

test('历史未审AI评分行不能进入主评分投影、95%附加口径或默认导出',()=>{
  const report=scoredReport(),ai=addLegacyScore(report),before=structuredClone(report),updated=summarizeReport(report);
  assert.ok(!updated.outputs.scoreItems.some(item=>item.id===ai.id));
  assert.ok(!updated.presentation.outputs.scoreItems.some(item=>item.id===ai.id));
  assert.ok(!updated.presentation.scoring.items.some(item=>item.id===ai.id));
  assert.deepEqual(updated.presentation.scoring.groups.map(group=>[group.name,group.maxScore]),[['技术',6],['商务',5],['价格',10]]);
  assert.equal(updated.presentation.scoring.total,21);
  assert.equal(updated.presentation.internalScreening.hasIndependentAdditional,false);
  assert.equal(updated.companyAnalysis.screening.internalScreening.denominator,5);
  const sections=buildReportSections(updated),scores=sections.find(section=>section.title==='必须加分项'),details=sections.find(section=>section.title==='14类详细分析');
  assert.ok(!JSON.stringify(scores).includes('候选附加社保99分'));
  assert.ok(JSON.stringify(details).includes('候选附加社保99分'));
  assert.ok(JSON.stringify(details).includes('个人社保证明附加99分'));
  assert.ok(category(updated.presentation,'scoring').pendingAICandidates.some(item=>item.id===ai.id&&item.references.length));
  assert.deepEqual(report,before);
});

test('没有结构化评分时，历史outputs中的未审AI行也不重新进入主投影',()=>{
  const report=scoredReport(),ai=addLegacyScore(report);
  report.analysis.scoring.items=[];
  report.outputs.scoreItems=[ai];
  const before=structuredClone(report),projection=buildReportContent(report);
  assert.equal(projection.outputs.scoreItems.length,0);
  assert.deepEqual(report,before);
});

test('已人工确认AI评分仍进入主评分投影并保留材料解释和来源',()=>{
  const report=scoredReport(),ai=addLegacyScore(report,{reviewed:true}),updated=summarizeReport(report);
  assert.ok(updated.outputs.scoreItems.some(item=>item.id===ai.id));
  const row=updated.presentation.outputs.scoreItems.find(item=>item.id===ai.id);
  assert.ok(row);
  assert.equal(row.maxScore,99);
  assert.equal(row.reviewed,true);
  assert.ok(row.references.length);
  assert.ok(updated.companyAnalysis.scoreRows.some(item=>item.scoreId===ai.id));
  assert.ok(!category(updated.presentation,'scoring').pendingAICandidates.some(item=>item.id===ai.id));
});

test('原始人工复核优先于历史评分行的旧AI状态',()=>{
  const report=scoredReport(),ai=addLegacyScore(report,{reviewed:true});
  const row=report.analysis.scoring.items.find(item=>item.id===ai.id);row.source='ai';row.reviewed=false;
  report.outputs.scoreItems.push({...structuredClone(ai),reviewed:false});
  const projection=buildReportContent(report),shown=projection.outputs.scoreItems.find(item=>item.id===ai.id);
  assert.ok(shown);
  assert.equal(shown.reviewed,true);
  assert.ok(!category(projection,'scoring').pendingAICandidates.some(item=>item.id===ai.id));
});

test('隔离候选后未知满分保持未知，不把null视作零分配平总分',()=>{
  const report=scoredReport();addLegacyScore(report);
  report.analysis.scoring.items[0].maxScore=null;
  const projection=buildReportContent(report);
  assert.equal(projection.scoring.total,null);
  assert.equal(projection.scoring.groups.find(group=>group.name==='技术').maxScore,null);
  assert.match(projection.scoring.status,/待核验/);
});

test('methodDetails保留已人工确认AI解释，默认14类导出不将其覆盖',()=>{
  const quote='本采购采用综合评分法，按评审得分推荐3名候选供应商。';
  const report=analyzeDocument({id:'reviewed-method',fileName:'匿名评审方法.txt',complete:true,warnings:[],blocks:[{id:'method',page:4,section:'评审方法',text:quote}]},{additionalFindings:[{categoryId:'method',source:'ai',title:'已核验补充评审口径',quote,interpretation:'人工已确认：并列推荐须按有效补充澄清办理。',fields:{准备事项:'保存正式补充澄清及签收记录'},references:[{documentId:'reviewed-method',blockId:'method',quote}]}]});
  const ai=all(report).find(item=>item.source==='ai');ai.reviewed=true;ai.matchStatus='met';ai.notes=['人工已核对正式补充澄清'];
  const before=structuredClone(report),updated=summarizeReport(report),method=category(updated.presentation,'method');
  assert.ok(method.items.some(item=>item.sourceFindingIds.includes(ai.id)));
  assert.ok(JSON.stringify(method.items).includes('人工已确认：并列推荐'));
  assert.ok(method.items.some(item=>item.source==='derived'||item.id.startsWith('analysis-')),'现有本地方法解释保留');
  assert.ok(!method.pendingAICandidates.some(item=>item.id===ai.id));
  const details=buildReportSections(updated).find(section=>section.title==='14类详细分析');
  for(const value of ['人工已确认：并列推荐','保存正式补充澄清及签收记录','第4页'])assert.ok(JSON.stringify(details).includes(value),value);
  assert.deepEqual(report,before);
});

test('派生coversFindingIds不覆盖已人工确认AI的独立解释',()=>{
  const report=readyReport(),ai=pendingCandidate(report,{reviewed:true,matchStatus:'met',hard:false});
  category(report,'personnel').items.push(ai);
  report.analysis.businessRequirements.push({id:'derived-same-source',source:'derived',categoryId:'personnel',title:'本地同源事项',quote:ai.quote,interpretation:'本地同源说明仍保留。',fields:{},references:ai.references,coversFindingIds:[ai.id],actions:[]});
  const projection=buildReportContent(report);
  assert.ok(category(projection,'personnel').items.some(item=>item.sourceFindingIds.includes(ai.id)));
  assert.ok(category(projection,'personnel').items.some(item=>item.id==='derived-same-source'));
});
