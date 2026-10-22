const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>typeof value==='number'&&Number.isFinite(value)?escape(value):'待核验';
const range=value=>value&&Number.isFinite(value.min)&&Number.isFinite(value.max)?`${number(value.min)}–${number(value.max)} 分`:'待核验';
const statuses={met:'已确认满足',unmet:'已确认不满足',pending:'待核验','scoring-only':'仅用于评分','not-applicable':'本项不适用'};
// Recognize a current-project choice, not a mention in an introduction, negation or example.
export function explicitEvaluationMethods(value='',section=''){
 const normalize=text=>String(text||'').normalize('NFKC').replace(/\s+/g,''),packageOf=text=>text.match(/(?:采购包|包件|标段)([\d一二三四五六七八九十]+)|第([\d一二三四五六七八九十]+)包/)?.slice(1).find(Boolean)||null;
 const names='((?:经评审的)?最低(?:投标|评标)?价法|综合评分法|综合评估法)';
 const subject='(?:本(?:采购)?项目|本次(?:评审|采购|招标|谈判)|本(?:标段|包)|(?:采购包|包件|标段)[\\d一二三四五六七八九十]+)';
 const choice=new RegExp('^(?:\\d+(?:\\.\\d+)*[.、)]?)?'+subject+'[：:|]*(?:的)?(?:明确)?(?:采用|选用|适用|使用|(?:评审|评标)(?:方法|办法)(?:为|是|[：:]))[：:|]*'+names);
 const row=new RegExp('^(?:[\\d.]+[：:|]*)?[|]*(?:评审|评标)(?:方法|办法)(?:的采用)?[：:|]+(?:采用|为|是)?'+names);
 return normalize(value).split(/[，,。；;\n]/).flatMap(clause=>{
  const match=clause.match(choice)||clause.match(row);if(!match)return [];
  if(/^(?:或者?|、|以及|和|与|及).*(?:最低(?:投标|评标)?价法|综合评分法|综合评估法)/.test(clause.slice(match[0].length)))return [];
  const label=match[1];return[{method:/最低/.test(label)?'lowest-price':'comprehensive',label,package:packageOf(clause)||packageOf(normalize(section))}];
 });
}
export function hasNonScoringMethod(report={}){
 const scoring=report.analysis?.scoring;
 if(scoring?.status!=='not-applicable'||scoring.method!=='lowest-price')return false;
 const choices=(scoring.references||[]).filter(ref=>ref.documentId&&ref.blockId).flatMap(ref=>explicitEvaluationMethods(ref.quote,ref.section));
 return choices.length>0&&choices.every(choice=>choice.method==='lowest-price'&&!choice.package);
}

export function predictionSummaryHTML(analysis={},report={}){
 const qualification=analysis.qualification,forecast=analysis.forecast||{},business=forecast.business;
 if(!qualification&&!business)return '';
 const hasCompany=typeof analysis.companyId==='string'&&analysis.companyId.trim().length>0;
 const qualificationStatus=qualification?.status==='met'&&!hasCompany?'pending':qualification?.status;
 if(hasNonScoringMethod(report)&&forecast.status==='not-applicable')return `<div class="prediction-overview"><h3>资格核验与评审路径</h3><p>资格核验：<strong>${statuses[qualificationStatus]||'待核验'}</strong></p><p>采购评标得分预测不适用：文件明确采用最低价法。项目适投评分仍按资格、商务、履约评估，不含报价；报价编制、最终报价与排序规则见“报价与评审分析”。</p>${qualification?.groups?.length?`<ul>${qualification.groups.map(group=>`<li>${escape(group.label)}：${statuses[group.status]||'待核验'}；${(group.missing||group.reasons||[]).map(escape).join('；')}</li>`).join('')}</ul>`:''}<p class="muted">资格和企业证据仍须逐项核验，价格排序不能抵消已确认不满足的硬门槛。</p></div>`;
 return `<div class="prediction-overview"><h3>资格与得分预测</h3><div class="prediction-metrics"><div><span>资格核验</span><strong>${statuses[qualificationStatus]||'待核验'}</strong></div><div><span>满分假设下的总分区间</span><strong>${range(forecast.totalRange)}</strong></div><div><span>商务已核证据支持</span><strong>${number(business?.confirmedScore)} 分</strong></div></div><p>技术、清单及报价按对应评分项满分假设计算；同一项只计一次。此区间为投标准备测算，不能替代实际评审。</p>${business?`<p class="business-score-basis">商务满分 ${number(business.maxScore)}；其中清单满分假设 ${number(business.assumedScore)}，已核证据支持 ${number(business.confirmedScore)}，人工参考 ${number(business.conditionalScore)}，待核验项上限 ${number(business.pendingMaxScore)}。商务测算区间：${range(business.range)}。</p>`:''}${qualification?.groups?.length?`<table class="qualification-summary"><thead><tr><th>五类资料</th><th>资格核验结果</th><th>待补或待核内容</th></tr></thead><tbody>${qualification.groups.map(group=>`<tr><td>${escape(group.label)}</td><td>${statuses[group.status]||'待核验'}</td><td>${(group.missing||[]).map(escape).join('；')||(group.reasons||[]).map(escape).join('；')||'按原文核对适用条件'}</td></tr>`).join('')}</tbody></table>`:''}<p class="muted">缺资料、未识别或未核实均保留待核验；未知不等于实际零分，已核证据支持0分仅表示当前尚无可计入的已核证据；已确认不满足硬门槛时，分数再高也不能判为可投。</p></div>`;
}
