import {buildSuitabilityAssessment} from '../core/suitability.js';
import {buildPricingAnalysis} from '../core/pricing.js';
import {procurementPolicyLabel} from '../../public/policy-labels.js';
import PDFDocument from 'pdfkit';
import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,BorderStyle,HeadingLevel,Footer,PageNumber,AlignmentType} from 'docx';
import {fileURLToPath} from 'node:url';
import {buildReportContent} from '../core/report-content.js';
import {readText} from '../core/analysis.js';
import {hasNonScoringMethod} from '../../public/score-summary.js';
const font=fileURLToPath(new URL('../../assets/SourceHanSansSC-Regular.otf',import.meta.url));
const text=value=>Array.isArray(value)?value.map(text).join('；'):String(value??'');
const compact=value=>text(value).normalize('NFKC').replace(/\s+/g,'');
const unique=values=>[...new Set(values.filter(Boolean))];
function location(item,report){
 const groups=new Map();
 for(const ref of item?.references||[]){const key=ref.documentId||ref.fileName||report.documentId;const group=groups.get(key)||{name:key===report.documentId?'主文件':ref.fileName||'关联原文',pages:[],sections:[]};if(ref.page!=null)group.pages.push(ref.page);else if(ref.sheet)group.sections.push(`${ref.sheet} / 第${ref.rowStart??'待核'}${ref.rowEnd&&ref.rowEnd!==ref.rowStart?'–'+ref.rowEnd:''}行`);else if(ref.section)group.sections.push(ref.section);groups.set(key,group);}
 return [...groups.values()].map(group=>`${group.name} ${group.pages.length?'第'+unique(group.pages).sort((a,b)=>a-b).join('、')+'页':unique(group.sections).join('、')||'正文'}`).join('\n')||'来源待核验';
}
const paragraph=(value,level=0)=>({kind:'paragraph',text:text(value),level});
const table=(headers,rows,widths)=>({kind:'table',headers,rows,widths});
const status={pending:'待核验',candidate:'候选 待核验',supported:'资料支持',excluded:'不计入',reference:'人工参考估计','rule-supported':'规则预计','not-applicable':'不适用',pass:'达到内部阈值','below-threshold':'低于内部阈值',scenario:'假设测算',estimated:'已形成测算',met:'已确认满足',unmet:'已确认不满足','scoring-only':'仅用于评分'};
const statement=item=>item.requirement||item.interpretation||item.standard||item.quote||'待核验';
const recordLabels={subjectName:'材料主体',registeredName:'登记名称',creditCode:'统一社会信用代码',legalRepresentative:'法定代表人',businessScope:'经营范围',category:'类别',specialty:'专业',grade:'等级',certificateNumber:'证书编号',issuer:'发证机构',validFrom:'有效期起',validUntil:'有效期至',projectType:'项目类型',contractNumber:'合同编号',contractDate:'合同签订日期',amount:'合同金额元',clientName:'客户采购人',role:'拟派岗位',employer:'任职单位',bCertificateNumber:'B证编号',registeredHere:'注册在本单位',noConcurrentProject:'无其他在建项目兼职',electronicCertificate:'电子证书形式已核对',brand:'品牌',model:'型号',manufacturer:'制造商',certificateType:'证明类型',coveredModels:'覆盖型号',certificateStatus:'证书状态',policyVersion:'政策版本',energyPolicy:'节能强采政策适用',environmentPolicy:'环境标志优采适用',environmentalPerformance:'材料环保性能',notes:'核对说明'};
const proofLabels={contract:'合同',acceptanceReport:'验收报告',certificate:'证书',registration:'注册证',bCertificate:'B证',license:'执照许可',source:'关联原件',environmentalReport:'材料环保检测',ownerProof:'业主证明',socialInsurance:'社保证明',labor:'劳动关系'};
const evidenceText=record=>{
 const proofs=record.fields?.evidence||[];
 return proofs.map(proof=>`${proofLabels[proof.kind]||proof.kind||'原件'} ${record.sources?.find(source=>source.documentId===proof.documentId)?.fileName||proof.documentId||'待关联'}${proof.page?` 第${proof.page}页`:''}${proof.verified?' 已确认':' 待确认'}`).join('；')||text(record.sources?.map(source=>typeof source==='string'?source:source.documentId||source.fileName||source.quote))||'关联原件待核验';
};
const specificCompanyRecord=(record,referenceIds)=>record.verified===true||(record.matchStatuses||[record.status]).some(value=>['supported','met','unmet','reference','rule-supported'].includes(value))||(record.evidenceIds||[]).length>0||(record.fields?.evidence||[]).some(proof=>proof.verified===true&&(record.documentIds||[]).includes(proof.documentId))||(record.documentIds||[]).some(id=>referenceIds.has(id));
const commonRecordGaps=records=>records.length?unique(records[0].missing||[]).filter(gap=>records.every(record=>(record.missing||[]).includes(gap))):[];
function compactCompanyRecords(records,referenceIds,limit=12){
 const priority=record=>{
  if((record.matchStatuses||[record.status]).some(value=>['supported','met','unmet','reference','rule-supported'].includes(value))||(record.documentIds||[]).some(id=>referenceIds.has(id)))return 0;
  if((record.fields?.evidence||[]).some(proof=>proof.kind==='auditReport'&&proof.verified===true))return 1;
  if(record.type==='performance'||record.type==='personnel'&&/本项目|拟派|用户确认/.test(record.fields?.role||''))return 1;
  if(record.type==='entity'||record.type==='qualification'&&/施工|承包|建筑业|安全生产/.test(record.fields?.category||''))return 2;
  return 10;
 };
 const ordered=records.map((record,index)=>({record,index,priority:priority(record)})).sort((a,b)=>a.priority-b.priority||a.index-b.index);
 const pinned=ordered.filter(item=>item.priority<10),other=ordered.filter(item=>item.priority===10);
 const selected=new Set([...pinned,...other.slice(0,Math.max(0,limit-pinned.length))].map(item=>item.record));
 return{detailed:ordered.filter(item=>selected.has(item.record)).map(item=>item.record),summarized:records.filter(record=>!selected.has(record))};
}

/** A single section/row model feeds both formats. It never traverses report.presentation. */
export function buildReportSections(report,{includeRaw=false}={}){
 const p=buildReportContent(report),sections=[],nonScoring=hasNonScoringMethod(report);
 const append=(title,blocks)=>sections.push({title,blocks});
 append('',[paragraph('招标文件解读报告',1),paragraph(report.fileName),paragraph(`生成时间 ${new Date(report.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`),paragraph(nonScoring?`当前投标可行性结论：${p.outputs.conclusion.label}。本项目采用最低价法，采购评标得分预测不适用；内部适投评分仍按三维评估。先核验资格与实质性要求，再核对报价与履约能力。`:`当前投标可行性结论：${p.outputs.conclusion.label}。先核验企业资格及实质性要求，再查看技术、清单及报价满分情景和商务证据测算，最后确认施工、工期、验收与资金能力。95%仅作企业内部参考。资料缺失保持待核验。`)]);
 const assessment=buildSuitabilityAssessment(report),pricing=report.pricingAnalysis||buildPricingAnalysis(report);
 const range=value=>value&&Number.isFinite(value.min)&&Number.isFinite(value.max)?value.min===value.max?String(value.min):`${value.min}—${value.max}`:'待核验';
 append('项目适投评分',[
  paragraph(`${Number.isFinite(assessment.referenceScore)?'内部参考分：'+assessment.referenceScore:'证据评分区间：'+range(assessment.totalRange)} / 100。投标建议：${assessment.internalAction?.label||assessment.recommendation?.label||'暂评待核'}。`,3),
  paragraph('项目适投分只看资格、商务、履约，不含报价；参考分不确认资格事实，缺资料不直接算实际零分，硬门槛不满足不被高分抵消。'),
  table(['维度','权重','证据状态','本次测算与待核'],(assessment.dimensions||[]).map(row=>[row.label,`${row.weight}%`,row.manualReference?'内部参考，证据另核':range(row.range),`${row.manualReference?'人工参考：':Number.isFinite(row.score)?'已核验：':''}${Number.isFinite(row.score)?row.score:'待核验'}${row.gaps?.length?'；'+row.gaps.length+'项待核':''}`]),[.18,.13,.22,.47]),
  paragraph('资格核验：'+(({met:'已核验满足',unmet:'已确认不满足',pending:'待核验'})[assessment.hardGate?.status]||'待核验')+'。'),
  ...(assessment.internalAction?.reasons||[]).map(value=>paragraph(value)),
  ...(assessment.dimensions||[]).filter(row=>row.manualReference&&row.note).map(row=>paragraph(row.label+'参考依据：'+row.note)),
  ...(assessment.recommendation?.reasons||[]).map(value=>paragraph(value))
 ]);
 append('项目概况',[table(['事项','文件信息','出处'],p.overview.map(item=>[item.label,text(item.value),location(item,report)]),[.20,.67,.13])]);
 const pricingNames=[['compilation','报价编制'],['rounds','报价轮次'],['evaluation','价格评审'],['ties','同价处理'],['contract','合同计价'],['limits','限价与报价约束']];
 append('报价与评审分析',[paragraph('报价编制、最终报价、价格排序及合同结算口径分别核对；固定总价或单价未选的模板保持待澄清。'),table(['事项','项目要求','出处'],pricingNames.flatMap(([key,label])=>(pricing[key]||[]).length?pricing[key].map(row=>[label,row.value,location(row,report)]):[[label,'原文依据不足，待核验','待核验']]),[.16,.69,.15]),...(pricing.warnings||[]).map(value=>paragraph(typeof value==='string'?value:value.value||value.message||''))]);
 const seen=new Map(),displayedClauses=new Map();
 const sourceKey=ref=>JSON.stringify([ref.documentId||ref.fileName,ref.blockId,ref.quote]);
 const sourceParts=quote=>String(quote||'').split('|').map(readText).filter(part=>part&&!/^\d+(?:\.\d+)?$/.test(part));
 const itemContent=item=>{
  const value=statement(item),material=text(item.materials||item.fields?.['证明材料']);
  const consequence=item.hard&&!/无效|不得参与|资格|拒绝/.test(value)?item.consequence||item.fields?.['不满足后果']||'适用硬条件未满足须核对无效后果。':'';
  const sources=unique((item.references||[]).map(ref=>ref.documentId||ref.fileName||report.documentId)).sort();
  const key=JSON.stringify([compact(value),compact(material),compact(consequence),sources,item.scope?.documentId||null,item.scope?.package||item.fields?.['采购包范围']||null,item.scope?.phase||item.stage||null]);
  return {value,material,consequence,key};
 };
 const scoreNarrative=item=>{
  const value=compact(statement(item)),prefix=compact(`${item.title}满分${item.maxScore??item.fields?.['满分']}分。`),boilerplate=compact('资料完整后可作规则预计或有理由的人工参考估计，主观评审不保证满分。');
  return value.startsWith(prefix)?value.slice(prefix.length).replace(boilerplate,''):value;
 };
 const representedScore=(score,item)=>item.source!=='ai'&&(item.sourceFindingIds||[item.id]).includes(score.id)&&compact(item.materials||item.fields?.['证明材料'])===compact(score.materials||score.fields?.['证明材料'])&&compact(item.fields?.['评分性质'])===compact(score.fields?.['评分性质'])&&compact(item.fields?.['满分'])===compact(score.fields?.['满分'])&&scoreNarrative(item)===compact((score.standard||statement(score))+(score.additionalRequirements||''))&&JSON.stringify(unique((item.references||[]).map(ref=>ref.documentId||ref.fileName)).sort())===JSON.stringify(unique((score.references||[]).map(ref=>ref.documentId||ref.fileName)).sort());
 const itemRow=(item,context,includeAction=false)=>{
  const {value,material,consequence,key}=itemContent(item);
  const badge=item.source==='ai'?'AI候选解读 企业条件待核验':item.reviewed&&item.matchStatus==='met'?'已满足（已复核）':item.reviewed&&item.matchStatus==='unmet'?'不满足（已复核）':item.matchStatus?'企业条件待核验':'';
  const showBadge=!['废标项清单','必须承诺内容'].includes(context)&&badge;
  // A verbatim source summary may point back only when every exact cited clause
  // was printed in full. New interpretation, source, material or consequence stays.
  const sourceSummary=item.sourceClauseSummary,ownRefs=item.references||[];
  const unchangedSummary=sourceSummary&&compact(value)===compact(ownRefs.map(ref=>ref.quote).join('；')+sourceSummary.suffix);
  const coveredContexts=unchangedSummary&&ownRefs.length&&!material&&!consequence&&item.source!=='ai'?ownRefs.map(ref=>displayedClauses.get(sourceKey(ref))):[];
  if(coveredContexts.length&&coveredContexts.every(Boolean))return Object.assign([item.title,[showBadge?badge:'',`详见${unique(coveredContexts).join('、')}的同源完整条款。`,sourceSummary.suffix.replace(/^。/,'')].filter(Boolean).join('\n'),location(item,report)],{repeatedSourceSummary:true});
  if(seen.has(key)&&seen.get(key)!==context&&item.source!=='ai')return Object.assign([item.title,[showBadge&&item.reviewed?badge:'',`详见${seen.get(key)}的同一事项（含适用条件、材料及后果）。`,includeAction&&item.impact?'影响：'+text(item.impact):'',includeAction&&item.actions?.length?'准备：'+text(item.actions):''].filter(Boolean).join('\n'),location(item,report)],{crossReference:true});
  if(item.source!=='ai')seen.set(key,context);
  if(item.source!=='ai')for(const ref of ownRefs){const parts=sourceParts(ref.quote);if(parts.length&&parts.every(part=>readText(value).includes(part)))displayedClauses.set(sourceKey(ref),context);}
  const action=includeAction?text(item.preparation||item.actions):'';
  const body=[showBadge?badge:'',value,material&&!compact(value).includes(compact(material))?'材料：'+material:'',consequence?'后果：'+consequence:'',item.impact&&includeAction?'影响：'+text(item.impact):'',action?'准备：'+action:''].filter(Boolean).join('\n');
  return[item.title,body,location(item,report)];
 };
 append('废标项清单',[paragraph('区分资格不合格、响应无效、文件拒收与采购活动整体终止；可澄清、更正、低价解释及平台故障例外按原文保留。95%内部筛选、评分材料缺口和本包不适用政策均不自动成为采购原文废标条件。'),table(['事项','要求 材料及后果','出处'],p.outputs.risks.map(item=>itemRow(item,'废标项清单',false)),[.22,.65,.13])]);
 const scoring=p.scoring;
 const scoreNote=(scoring.groups||[]).map(group=>`${group.label||group.name} ${group.maxScore}分`).join('；')+(scoring.total!=null?`；合计${scoring.total}分。`:'；未跨范围合计。');
 if(nonScoring)append('必须加分项',[paragraph('不适用：文件采用经评审的最低投标价法，未列计分表。通过资格与实质性审查后，按最终报价及文件约定的价格排序核验，不把业绩优先换算为加分。')]);
 else{ append('必须加分项',[paragraph(`${scoreNote}落实得分材料与方案。预计和人工参考估计均不保证实际专家得分；技术／报价满分只为明确假设，人员及主材在技术组内计一次，5%价格优惠不是加5分。`),table(['评分项','满分','标准及对应材料','出处'],p.outputs.scoreItems.map(item=>{
  const {key,value,material,consequence}=itemContent(item),standard=item.standard||value;
  if(item.source!=='ai'&&!consequence&&(!material||item.materials?.length||compact(standard).includes(compact(material)))){
   if(scoreNarrative(item)===compact(standard+(item.additionalRequirements||'')))seen.set(key,'必须加分项评分表');
   for(const category of p.categories)for(const candidate of category.items)if(representedScore(item,candidate))seen.set(itemContent(candidate).key,'必须加分项评分表');
  }
  return[`${item.group||''} ${item.title}`,text(item.maxScore??item.fields?.['满分']??'待核验'),`${item.fields?.['评分性质']||'性质待核验'}\n${item.standard||statement(item)}${item.additionalRequirements?'\n相关条件：'+text(item.additionalRequirements):''}${item.materials?.length?'\n材料：'+text(item.materials):''}`,location(item,report)];
 }),[.24,.08,.55,.13]),paragraph(scoring.status||'评分完整性待核验')]);
 }
 append('必须承诺内容',[paragraph('承诺及材料按投标主体、条件分支和提交阶段落实；法定代表人证明或授权保留“或”路径，条件性材料保留“如有”。未取得实际模板时，签署落款和版式仍待核验。'),table(['承诺或材料','范围 适用条件及签署','出处'],p.outputs.commitments.map(item=>itemRow(item,'必须承诺内容',false)),[.22,.65,.13])]);
 append('投标可行性结论',[paragraph(p.outputs.conclusion.label,3),...(p.outputs.conclusion.reasons||[]).map(value=>paragraph(value)),...(p.outputs.conclusion.conditions||[]).map(value=>paragraph('参与前提：'+value))]);
 const details=[paragraph('14类按项目事项整理；相同要求指向上文对应清单，完整候选及原引用保留在软件的深入条款和报告JSON中。')];
 p.categories.forEach((category,index)=>{
  details.push(paragraph(`${index+1} ${category.title}`,3));
  if(category.id==='scoring'&&p.outputs.scoreItems.length)details.push(paragraph('分值与标准见“必须加分项”评分表；本类逐项保留未在该表完整呈现的独立条件，价格政策另核适用主体及材料。'));
  if(category.id==='scoring'&&nonScoring)details.push(paragraph('得分预测不适用；最低价评审流程及最终报价规则见评审方式。'));
  else if(!category.items.length)details.push(paragraph(category.summary));
  else {const rows=category.items.map(item=>itemRow(item,category.title,false)).filter(row=>!row.repeatedSourceSummary);if(rows.length)details.push(table(['事项','项目解读及准备','出处'],rows,[.22,.65,.13]));else details.push(paragraph('本类原句已在上文完整展示，按同源条款逐项核验。'));}
  if(category.pendingAICandidates?.length)details.push(paragraph('AI候选解读（待复核；未纳入资格门槛、得分和四项主清单）'),table(['候选事项','AI补充与待核条件','原文出处'],category.pendingAICandidates.map(item=>itemRow(item,'AI候选解读',false)),[.22,.65,.13]));
 });
 append('14类详细分析',details);
 if(p.aiSupplement.length)append('AI辅助综合解读待复核',[paragraph('以下说明保留各自真实来源，模型解释不确认企业资格、实际得分或可投结论。'),table(['事项','有依据的补充解释 影响及动作','出处'],p.aiSupplement.map(item=>itemRow(item,'AI辅助综合解读',true)),[.22,.65,.13])]);
 if(p.procurementPolicy){
  const policy=p.procurementPolicyDisplay||p.procurementPolicy,kind={energy:'节能产品',environment:'环境标志产品',greenMaterial:'绿色建材',unknown:'品目待核验'},result={met:'资料支持',pending:'待核验',missing:'缺适用证明材料',notApplicable:'不适用'},appLabels={energyMandatory:'节能强制采购',energyPreference:'节能优先采购',environmentPreference:'环境标志优先采购',greenMaterial:'绿色建材',projectScoring:'本项目政策评分'};
  const officialLocation=source=>`${source.title}${source.sourcePage?` 第${source.sourcePage}页`:''}${source.clause?' '+source.clause:''}\n${source.url}`;
  const compactSources=unique((policy.products||[]).flatMap(row=>row.policySources||[]).map(source=>source.id));
  const sources=(policy.policySources||[]).filter(source=>compactSources.includes(source.id)||Object.values(policy.applicability||{}).some(app=>(app.sources||[]).some(ref=>ref.id===source.id)));
  append('本项目产品政策名单',[
   paragraph(`政策版本 ${policy.version}；证书核对日期 ${policy.asOf}；包内官方来源核对日期 ${p.policySnapshot?.package?.checkedAt||'待核验'}。本表核对外部政策与项目产品，缺材料不自动生成废标条件，优先采购不自动折算评委分值。`),
   table(['适用政策','适用说明'],Object.entries(policy.applicability||{}).map(([key,app])=>[appLabels[key]||key,`${app.status==='applicable'?'适用':app.status==='notApplicable'?'不适用':'待核验'}：${app.reason}${app.gaps?.length?'\n缺口：'+text(app.gaps):''}`]),[.23,.77]),
   ...((report.procurementPolicy?.exclusions||[]).length?[paragraph('采购责任范围排除：以下不作为本企业必须采购产品或认证资料缺口。'),table(['产品','排除原因','原文出处'],report.procurementPolicy.exclusions.map(row=>[row.name,[row.reason,...unique((row.sources||[]).map(ref=>ref.quote))].filter(Boolean).join('\n原文：'),location({references:row.sources},report)]),[.19,.65,.16])]:[]),
   ...(policy.products?.length?[table(['产品 / 规格型号','清单品目与政策','所需资料','企业资料与缺口','来源'],policy.products.map(row=>[
    `${row.name}\n型号：${row.model||'待核验'}\n制造商：${row.manufacturer||'待核验'}`,
    `${row.categoryCode||'待核验'} ${kind[row.policyType]||row.policyType}\n${procurementPolicyLabel(row)}\n${result[row.status]||'待核验'}`,
    row.requirement,
    [...(row.companyEvidence||[]).map(e=>`${e.recordName||'资料名称待核验'}${e.recordDetails?'\n'+e.recordDetails:''}：${result[e.status]||'待核验'}${e.gaps?.length?'（'+text(e.gaps)+'）':''}${e.sources?.length?'\n企业原件：'+location({references:e.sources},report):''}`),...(row.gaps?.length?['缺口：'+text(row.gaps)]:[]),row.reason,...(row.originalStatements||[]).map(ref=>'招标原文：'+ref.quote+'（须澄清与政策品目的冲突）')].filter(Boolean).join('\n'),
    location({references:row.sources},report)+'\n'+unique((row.policySources||[]).map(ref=>`${ref.title}${ref.sourcePage?' 第'+ref.sourcePage+'页':''}${ref.clause?' '+ref.clause:''}`)).join('；')
   ]),[.19,.16,.25,.26,.14])]:[paragraph(report.procurementPolicy?.exclusions?.length?'已识别的上述甲供、自理或仅预留事项不列为本企业采购证明缺口；其他自购产品和未读附件仍须核验。':'已提供文件未形成可核查的产品清单，须补充采购清单与技术参数；不能认定不涉及产品政策。')]),
   ...(policy.summary?.greenMaterial?.optionalCategories?[paragraph(`绿色建材：可选小类按涉及种类至少选用${policy.summary.greenMaterial.optionalCategoryRatio*100}%，计入小类同类绿色用量至少${policy.summary.greenMaterial.withinCategoryRatio*100}%；绿色建材认证或符合全部适用技术指标的有效检测报告等证明路径保留。选用量和地方具体范围仍待核验。`)]:[]),
   paragraph('政策官方来源（完整品目目录保留在本地政策包）：'),...sources.map(source=>paragraph(officialLocation(source)))
  ]);
 }
 const company=p.companyAnalysis,companyBlocks=[],records=new Map();
 const referenceIds=new Set((company?.scoreRows||[]).filter(row=>row.status==='reference'||Number.isFinite(row.referenceScore)&&Number.isFinite(row.maxScore)&&row.referenceScore>=0&&row.referenceScore<=row.maxScore).flatMap(row=>row.evidenceIds||[]));
 for(const match of [...(company?.matches||[]),...(company?.scoreRows||[])])for(const record of match.records||[]){
  const type=record.type||match.type,key=type+':'+record.id;
  const entry=records.get(key)||{...record,type,procurementRefs:[],missing:[],reasons:[],matchStatuses:[],evidenceIds:[]};
  entry.procurementRefs.push(...(match.references||[]));entry.missing.push(...(record.missing||[]));entry.reasons.push(...(record.reasons||[]));entry.matchStatuses.push(record.status);entry.evidenceIds.push(...(record.evidenceIds||[]));entry.verified=entry.verified||record.verified===true;records.set(key,entry);
 }
 if(company?.qualification&&company.companyId){
  const q=company.qualification,f=company.forecast||{},b=f.business||{};
  companyBlocks.push(paragraph(`五类资格核验：${status[q.status]||'待核验'}。候选记录数不等于人数或符合要求的数量。资料缺失或未识别不等于不符合；已确认不满足硬门槛时，测算高分不能抵消。`),table(['资料类别','资格核验结果','候选记录数','依据与共性待核缺口'],q.groups.map(group=>{
   const ids=Array.isArray(group.recordIds)?unique(group.recordIds):null,own=ids?.map(id=>[...records.values()].find(record=>record.id===id)).filter(Boolean)||[];
   const common=ids&&own.length===ids.length?commonRecordGaps(own):[];
   return[group.label,status[group.status]||'待核验',ids?`${ids.length}条`:'待核验',unique([...(group.missing||[]),...common,...(group.reasons||[])]).join('；')];
  }),[.17,.16,.13,.54]));
  if(!nonScoring)companyBlocks.push(paragraph(`满分假设下的总分区间：${f.totalRange?f.totalRange.min+'—'+f.totalRange.max:'待核验'}分；技术、清单及报价假设合计${f.assumedScore??'待核验'}分。`),paragraph(`商务满分${b.maxScore??'待核验'}分，其中清单假设${b.assumedScore??'待核验'}分，证据已确认${b.confirmedScore??'待核验'}分，人工参考${b.conditionalScore??'待核验'}分，待核验项上限${b.pendingMaxScore??'待核验'}分。上述口径不保证实际评审得分。`));
 }

 if(!company?.companyId)companyBlocks.push(paragraph(nonScoring?'本次未选择企业资料。企业资格、业绩、人员与履约能力保留待核验；得分预测不适用，按原文审查与最终报价核验。':'本次未选择具有真实原件证据的企业资料。业绩名称、可配置人员、产品品牌型号和企业资格均待核验；不虚构库内命中。技术与报价满分假设不代表企业实际得分。'));
 else{
  companyBlocks.push(paragraph(`分析企业 ${company.companyName}。本报告使用分析时企业快照，后续库编辑不会改写本报告的企业事实。`));
  const labels={entity:'主体',qualification:'资质',performance:'业绩',personnel:'人员',product:'产品'};
  const allRecords=[...records.values()],eligible=allRecords.filter(record=>record.type==='performance'||specificCompanyRecord(record,referenceIds)),selection=compactCompanyRecords(eligible,referenceIds),visibleRecords=includeRaw?allRecords:selection.detailed,omitted=allRecords.length-eligible.length;
  if(!includeRaw&&omitted)companyBlocks.push(paragraph(`默认报告省略${omitted}条尚无确认支持或人工参考关联的候选记录逐项明细；人员候选未据此确定拟派。完整明细仍在资料库及完整核查版，未删除企业记录。`));
  if(!includeRaw&&selection.summarized.length){
   companyBlocks.push(paragraph(`另有${selection.summarized.length}条候选资料仅汇总名称与状态，已核静态证照不等于本项目已拟派或资格满足；完整字段、原件及缺口见资料库和完整核查版。`),table(['其他候选资料（汇总）','记录及状态'],Object.keys(labels).flatMap(type=>{const own=selection.summarized.filter(record=>record.type===type);return own.length?[[labels[type]+' '+own.length+'条',own.map(record=>`${record.name}（${record.verified?'静态内容已核':'待核验'}）`).join('；')]]:[]}),[.20,.80]));
  }
  if(visibleRecords.length)companyBlocks.push(table(['企业记录','匹配条件 证据及缺口','采购出处'],visibleRecords.map(record=>{
   const f=record.fields||{};const details=Object.entries(f).filter(([key])=>!['evidence','normalizedName'].includes(key)).map(([key,value])=>`${recordLabels[key]||key}：${typeof value==='boolean'?(value?'已确认':'未确认'):text(value)}`).join('；');
   return[`${labels[record.type]||record.type} ${record.name||'名称待核验'}`,`${unique(record.matchStatuses.map(value=>status[value]||'待核验')).join('；')}\n${details}\n企业材料：${evidenceText(record)}${record.missing.length?'\n缺口：'+unique(record.missing).join('；'):''}${record.reasons.length?'\n依据：'+unique(record.reasons).join('；'):''}`,location({references:record.procurementRefs},report)];
  }),[.23,.64,.13]));
  if(!nonScoring)companyBlocks.push(table(['评分项','满分','预计或参考 依据及缺口','出处'],(company.scoreRows||[]).map(row=>{
   const own=row.records||[],specific=includeRaw?own:compactCompanyRecords(own.filter(record=>specificCompanyRecord(record,referenceIds)),referenceIds,4).detailed,count=new Set(own.map((record,index)=>record.id||`record-${index}`)).size;
   const recordNote=own.length?`\n候选记录数：${count}条${specific.length?'；对应具体记录：'+unique(specific.map(record=>record.name)).join('、'):''}${!includeRaw&&specific.length<own.length?'；其他明细见资料库或完整核查版':''}`:'';
   return[row.title,text(row.maxScore),`${status[row.status]||row.status}：${row.calculationKind==='assumed-full'?'满分假设 '+row.assumedScore:row.expectedScore??row.referenceScore??'待核验'}${row.range?'；区间 '+row.range.min+'—'+row.range.max:''}\n${text(row.reasons)}${row.missing?.length?'\n缺口：'+text(row.missing):''}${recordNote}`,location(row,report)];
  }),[.24,.08,.55,.13]));
 }
 if(company&&!nonScoring){const screening=company.screening?.internalScreening||company.screening||{},scenario=company.forecast?.scenario||{};companyBlocks.push(paragraph(`95%企业内部筛选：商务与独立附加合计满分${screening.denominator??'待核验'}，比例阈值${(p.internalScreening.thresholdRatio*100).toFixed(0)}%${p.internalScreening.thresholdScore!=null?'，对应分值'+p.internalScreening.thresholdScore.toFixed(2):'，对应分值待核验'}；状态${status[screening.scoreStatus]||screening.scoreStatus||'待核验'}。无独立附加项时只用商务满分；未知分值或范围保持待核验。这是单独的内部参考，不作为采购资格门槛或单独否决投标的依据。${p.internalScreening.scopeConfirmed&&!p.internalScreening.hasIndependentAdditional?'本范围未设独立附加分，不虚增附加5分分母。':''}`),paragraph(`技术满分假设${scenario.technicalMax??'待核验'}＋清单满分假设${scenario.billMax??'待核验'}＋报价满分假设${scenario.priceMax??'待核验'}＋商务及独立附加预计／参考，测算总分${scenario.total??'待核验'}；这是用户批注的企业内部预测口径，不是企业实际分。人员及主材在各自所属评分组内计一次，不另加到评分组满分之上。`),...(company.companyId||includeRaw?company.assumptions||[]:[]).map(value=>paragraph(value)));}
 if(nonScoring)companyBlocks.push(paragraph('采购评标得分预测不适用；项目适投评价另列，继续核验企业资格、实质性要求，并按原文核验报价轮次与价格排序。'));
 append(nonScoring?'企业资格与评审路径':'企业匹配与得分测算',companyBlocks);
 append('工程与履约资金风险',[table(['事项','履约与资金影响 准备动作','出处'],p.commercialRisks.map(item=>itemRow(item,'工程与履约资金风险',true)),[.22,.65,.13]),...p.technical.flatMap(item=>{
  const {key,value}=itemContent(item),previous=seen.get(key);if(!previous&&item.source!=='ai')seen.set(key,'工程与履约资金风险');
  const blocks=[paragraph(item.title,3),paragraph(previous&&item.source!=='ai'?`本事项的适用条件与材料已完整列于${previous}，按该行核对。`:value),paragraph('准备：'+text(item.actions)),paragraph('出处：'+location(item,report))];
  if(item.quantities?.length)blocks.push(table(['工程内容','数量','特征与核对事项','出处'],item.quantities.map(row=>[row.name,`${row.quantity}${row.unit}`,row.description,location(row,report)]),[.23,.14,.50,.13]));return blocks;
 })]);
 append('准备事项与待澄清及缺口',[table(['事项','待核验内容及下一步','出处'],p.clarifications.map(item=>itemRow(item,'待澄清及缺口',true)),[.22,.65,.13]),paragraph('递交前按上文红线、承诺、评分和企业材料缺口逐项准备，先确认硬条件与四★，再作内部筛选及资金施工决策。完整合同、施工图和响应模板未取得时不得视为已核验。')]);
 const sourceNames=unique([...p.categories.flatMap(c=>c.items),...p.clarifications,...p.technical].flatMap(i=>(i.references||[]).map(r=>r.fileName)));
 const warningText=value=>typeof value==='string'?value:value.message||value.code;
 const webWarningMessages=unique((report.webChat?.warnings||[]).map(warningText));
 const warningMessages=unique([...(report.warnings||[]).map(warningText),...webWarningMessages]);
 const reading=[paragraph('分析文件：'+sourceNames.join('；')),paragraph(`已读取${report.coverage?.documentCount||1}份文件、${report.coverage?.blockCount||0}段；段数不是理解准确率。当前覆盖状态：${report.coverage?.complete?'提取完整，仍需条款与企业复核':'存在未完成读取或附件缺口，待核验'}。`),...warningMessages.map(message=>paragraph((webWarningMessages.includes(message)?'网页辅助提示：':'')+message)),...(report.synthesis?.warnings||[]).map(value=>paragraph('AI辅助提示：'+text(value.message||value)))];
 if(report.webChat){const chat=report.webChat,coverage=chat.coverage||{},provider=chat.provider==='deepseek'?'DeepSeek':chat.provider==='doubao'?'豆包':'网页AI';reading.push(paragraph(`网页 AI 试验 来源 ${provider}；任务 ${chat.requestId||'待核验'}；分类覆盖 ${coverage.categoryCount??0} / 14；重点输出 ${coverage.outputCount??0} / 4。`),...unique([...(coverage.missingCategories||[]),...(coverage.missingOutputs||[])]).map(value=>paragraph('未返回或待核验：'+value)),...(coverage.unverifiedReferences&&Array.isArray(coverage.unverifiedReferences)?coverage.unverifiedReferences:[]).map(value=>paragraph('引用未通过校验：'+text(value))));}
 append('适投评分依据',[paragraph('以下为三维内部评估依据，采购资格与企业事实仍按原文和原件分别核验。'),table(['维度','依据与待核事项','出处'],(assessment.dimensions||[]).map(row=>[row.label,[...(row.basis||[]),...(row.gaps||[]).map(value=>'待核：'+value),report.suitabilityReview?.dimensions?.[row.id]?.note?'人工参考理由：'+report.suitabilityReview.dimensions[row.id].note:''].filter(Boolean).join('；'),location(row,report)]),[.15,.70,.15]),paragraph(`试行内部参考线：可投${assessment.thresholds?.recommend??80}，谨慎可投${assessment.thresholds?.cautious??60}；未知资格或文件覆盖不直接作可投判断。`)]);
 append('读取覆盖与待核验',reading);
 if(report.webChat){
  const chat=report.webChat,rounds=(Array.isArray(chat.reviewRounds)?chat.reviewRounds:[]).filter(round=>round&&typeof round.rawText==='string').slice(0,2);
  if(chat.review?.attempted===true)reading.push(paragraph(`${chat.review.completed===true&&rounds.length===2?'自动复核已结束':'自动复核未完成'}：已保留${rounds.length}轮原答，内容仍需人工核验；不能据此确认企业条件或实际得分。`));
  const count=Number.isSafeInteger(chat.coverage?.unverifiedReferences)&&chat.coverage.unverifiedReferences>=0?chat.coverage.unverifiedReferences:Array.isArray(chat.coverage?.unverifiedReferences)?chat.coverage.unverifiedReferences.length:0;
  if(count)reading.push(paragraph('引用未通过：'+count+'处；这些候选引文未作为已核实条款合并。'));
 }
 if(report.webChat?.contentReview){
  const review=report.webChat.contentReview;
  append('网页AI内容核对',[paragraph(`已列${review.sourceChecklist?.length||0}项原文核对事项；以下${review.checks?.length||0}项存在未覆盖或待复核内容。类别及输出数量不代表内容准确率，未列出的问题也不等于已经人工核实。${review.omittedCount?`另有${review.omittedCount}项未在本清单展开，须返回本次任务复核。`:''}`),table(['事项','内容缺口或疑点','原文位置'],(review.checks||[]).map(item=>[item.title,item.message,location(item,report)]),[.23,.64,.13])]);
 }
 if(includeRaw){
  const allRefs=[...report.categories.flatMap(category=>category.items||[]),...(report.analysis?.commercialRisks||[]),...(report.analysis?.technical||[]),...(report.analysis?.clarifications||[]),...(report.synthesis?.items||[]),...(report.webChat?.synthesis||[])].flatMap(item=>item.references||[]).filter(ref=>ref.quote);
  const evidence=[...new Map(allRefs.map(ref=>[JSON.stringify([ref.documentId,ref.page,ref.section,compact(ref.quote)]),ref])).values()].filter(ref=>!allRefs.some(other=>other!==ref&&(other.documentId||other.fileName)===(ref.documentId||ref.fileName)&&other.page===ref.page&&compact(other.quote).length>compact(ref.quote).length&&compact(other.quote).includes(compact(ref.quote))));
  append('原文证据',[paragraph('本节为显式选择的完整核查附录；每段按真实出处保留，作为复核而非模型指令。'),...evidence.flatMap((ref,index)=>[paragraph(`E${index+1} ${location({references:[ref]},report)}`,3),paragraph(ref.quote)])]);
  if(report.webChat){
   const chat=report.webChat,rounds=(Array.isArray(chat.reviewRounds)?chat.reviewRounds:[]).filter(round=>round&&typeof round.rawText==='string').slice(0,2);
   const rawBlocks=[paragraph('保留平台原始返回，不将其中企业结论视为已经确认。')];
   if(rounds.length===2)rawBlocks.push(paragraph('首轮原答',3),paragraph(rounds[0].rawText),paragraph('复核原答',3));
   rawBlocks.push(paragraph(chat.rawText||'没有保存原始回答。'));append('网页 AI 原始回答',rawBlocks);
  }
 }
 return sections;
}

function wordTable(model){
 const border={style:BorderStyle.SINGLE,size:4,color:'D9D9D9'},width=9638;
 // Treat every glyph as a full 10pt character: only conservatively short rows stay together.
 const shortRow=cells=>cells.every((value,index)=>String(value??'').split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(Array.from(line).length*200/Math.max(200,width*model.widths[index]-200))),0)<=8);
 const row=(cells,header)=>new TableRow({tableHeader:header,cantSplit:shortRow(cells)?true:undefined,children:(cells.crossReference?[cells.join('；')]:cells).map((value,index)=>new TableCell({columnSpan:cells.crossReference?model.widths.length:undefined,width:{size:Math.round(width*(cells.crossReference?1:model.widths[index])),type:WidthType.DXA},shading:header?{fill:'F2F2F2'}:undefined,margins:{top:85,bottom:85,left:100,right:100},children:String(value??'').split('\n').map(line=>new Paragraph({spacing:{after:35,line:260},children:[new TextRun({text:line,font:{ascii:'Microsoft YaHei',eastAsia:'微软雅黑'},size:20,bold:header,color:'000000'})]}))}))});
 return new Table({width:{size:width,type:WidthType.DXA},columnWidths:model.widths.map(value=>Math.round(width*value)),borders:{top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border},rows:[row(model.headers,true),...model.rows.map(cells=>row(cells,false))]});
}
function wordParagraph(block){const level=block.level;return new Paragraph({style:level===1?'Title':undefined,heading:level===2?HeadingLevel.HEADING_1:level===3?HeadingLevel.HEADING_2:undefined,keepNext:Boolean(level),spacing:{before:level?120:0,after:level?140:90,line:310},children:[new TextRun({text:block.text,color:'000000',size:level===1?36:level===2?28:level===3?24:22,bold:Boolean(level),font:{ascii:'Microsoft YaHei',eastAsia:'微软雅黑'}})]});}
function pdfTable(pdf,model){
 const x=pdf.page.margins.left,width=pdf.page.width-x-pdf.page.margins.right,columns=model.widths.map(fraction=>width*fraction),fontSize=10,lineHeight=13.5,padding=5;
 const wrap=(value,colWidth)=>{
  const result=[],limit=colWidth-padding*2;
  for(const paragraph of String(value??'').split('\n')){
   let line='';
   const tokens=paragraph.match(/[+-]?\d+(?:[.,]\d+)*(?:[A-Za-z]+(?:\d+|[²³])?|[%％‰℃㎡㎥]|[万亿]?元|日历日|工作日|平方米|立方米|毫米|厘米|千米|米|页|天|日|月|年|个|分|份|项|座|台|套|吨)?|[\s\S]/gu)||[];
   for(const token of tokens){
    if(pdf.widthOfString(token)>limit){
     for(const character of token){if(line&&pdf.widthOfString(line+character)>limit){result.push(line);line='';}line+=character;}
    }else{if(line&&pdf.widthOfString(line+token)>limit){result.push(line);line='';}line+=token;}
   }
   result.push(line);
  }
  return result;
 };
 const draw=(lines,y,header)=>{const activeColumns=lines.length===1?[width]:columns;const height=Math.max(...lines.map(cell=>cell.length),1)*lineHeight+padding*2;let left=x;lines.forEach((cell,index)=>{if(header)pdf.save().rect(left,y,activeColumns[index],height).fill('#f2f2f2').restore();pdf.save().lineWidth(.5).strokeColor('#d9d9d9').rect(left,y,activeColumns[index],height).stroke().restore();pdf.fillColor('#000000');cell.forEach((line,lineIndex)=>pdf.text(line,left+padding,y+padding+lineIndex*lineHeight,{width:activeColumns[index]-padding*2,lineBreak:false}));left+=activeColumns[index];});pdf.y=y+height;return height;};
 pdf.fontSize(fontSize);const headerLines=model.headers.map((value,index)=>wrap(value,columns[index])),headerHeight=Math.max(...headerLines.map(value=>value.length))*lineHeight+padding*2;
 const bottom=()=>pdf.page.height-pdf.page.margins.bottom;
 const newPage=()=>{pdf.addPage();pdf.font(font).fontSize(fontSize);draw(headerLines,pdf.y,true);};
 if(pdf.y+headerHeight+lineHeight+padding*2>bottom())pdf.addPage();draw(headerLines,pdf.y,true);
 for(const row of model.rows){let remaining=row.crossReference?[wrap(row.join('；'),width)]:row.map((value,index)=>wrap(value,columns[index]));while(remaining.some(cell=>cell.length)){
  let linesFit=Math.floor((bottom()-pdf.y-padding*2)/lineHeight);
  const required=Math.max(...remaining.map(cell=>cell.length));
  // Keep short rows together, matching Word. Long clauses may continue beneath a repeated header.
  if(required>linesFit&&required<=8){newPage();linesFit=Math.floor((bottom()-pdf.y-padding*2)/lineHeight);}
  if(linesFit<1){newPage();linesFit=Math.floor((bottom()-pdf.y-padding*2)/lineHeight);}
  const chunk=remaining.map(cell=>cell.slice(0,linesFit));draw(chunk,pdf.y,false);remaining=remaining.map(cell=>cell.slice(linesFit));if(remaining.some(cell=>cell.length))newPage();
 }}pdf.y+=9;pdf.x=x;
}
export async function exportReport(report,format,options={}){
 const sections=buildReportSections(report,options);
 if(format==='docx'){
  const content=sections.flatMap(section=>[...(section.title?[wordParagraph(paragraph(section.title,2))]:[]),...section.blocks.map(block=>block.kind==='table'?wordTable(block):wordParagraph(block))]);
  // Word viewers merge adjacent tables, including their repeated headers.
  const children=content.flatMap((child,index)=>child instanceof Table&&content[index-1] instanceof Table?[new Paragraph({spacing:{before:0,after:80,line:80}}),child]:[child]);
  const doc=new Document({creator:'标析',title:report.fileName+'解读报告',styles:{default:{document:{run:{font:{ascii:'Microsoft YaHei',eastAsia:'微软雅黑'},size:22,color:'000000'},paragraph:{spacing:{after:90,line:310}}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{color:'000000',size:36,bold:true},paragraph:{spacing:{after:160}}},{id:'Heading1',name:'heading 1',basedOn:'Normal',next:'Normal',run:{color:'000000',size:28,bold:true}},{id:'Heading2',name:'heading 2',basedOn:'Normal',next:'Normal',run:{color:'000000',size:24,bold:true}}]},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1080,bottom:1080,left:1134,right:1134}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'标析 ',color:'000000',size:18}),new TextRun({children:[PageNumber.CURRENT],size:18,color:'000000'})]})]})},children}]});
  return Packer.toBuffer(doc);
 }
 if(format==='pdf')return new Promise((resolve,reject)=>{
  const pdf=new PDFDocument({size:'A4',margins:{top:42,left:42,right:42,bottom:46},bufferPages:true,info:{Title:report.fileName+'解读报告',Author:'标析'}}),chunks=[];
  pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);
  try{
   pdf.font(font);
   const drawParagraph=block=>{const size=block.level===1?19:block.level===2?14:block.level===3?12:11;pdf.fontSize(size).fillColor('#000000');const reserve=block.level?60:20;if(pdf.y>pdf.page.height-pdf.page.margins.bottom-reserve)pdf.addPage();pdf.text(block.text,{lineGap:3,paragraphGap:block.level?8:5});pdf.y+=block.level?5:3;};
   for(const section of sections){if(section.title)drawParagraph(paragraph(section.title,2));for(const block of section.blocks){if(block.kind==='table')pdfTable(pdf,block);else drawParagraph(block);}}
   const range=pdf.bufferedPageRange();for(let index=range.start;index<range.start+range.count;index++){pdf.switchToPage(index);pdf.fontSize(8).fillColor('#000000').text(`标析 ${index+1} / ${range.count}`,42,pdf.page.height-28,{lineBreak:false});}pdf.end();
  }catch(error){pdf.destroy();reject(error);}
 });
 throw new Error('仅支持 PDF 或 Word 导出');
}
