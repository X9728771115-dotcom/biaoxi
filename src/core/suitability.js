// Internal project suitability is deliberately independent of purchase scoring.
// References never rewrite the report's qualification facts or evidence snapshot.
import {companyScopePending} from './company-analysis.js';
const definitions=[
 {id:'qualification',label:'资格',weight:35.29},
 {id:'business',label:'商务',weight:35.29},
 {id:'fulfillment',label:'履约',weight:29.42}
];
const ids=definitions.map(item=>item.id);
const legacyIds=[...ids,'quotation'];
const qualificationIds=new Set(['business-license','construction-qualification','safety-license','personnel','performance']);
const defaultWeights=Object.fromEntries(definitions.map(item=>[item.id,item.weight]));
const defaultThresholds={recommend:80,cautious:60};
const list=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values.filter(value=>typeof value==='string'&&value.trim()))];
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
const bounded=(value,max=100)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max;
const text=value=>typeof value==='string'?value:'';
const clean=value=>text(value).normalize('NFKC').replace(/[\s\u200b]/g,'');
function plain(value,label){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label}必须是普通对象`);
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).some(key=>typeof key!=='string'||descriptors[key].get||descriptors[key].set))throw new Error(`${label}仅接受普通数据字段`);
 return value;
}
function keys(value,allowed,label){
 plain(value,label);
 if(Reflect.ownKeys(value).some(key=>!allowed.includes(key)))throw new Error(`${label}含未知字段，仅接受${allowed.join('、')}`);
}

export function validateSuitabilityReview(input={}, {migrateLegacy=false}={}){
 keys(input,['weights','dimensions','thresholds'],'适投参考评估');
 const weights={...defaultWeights};
 if(input.weights!==undefined){
  keys(input.weights,legacyIds,'三维权重');
  if(ids.some(id=>!Object.hasOwn(input.weights,id)||!bounded(input.weights[id])))throw new Error('三维权重必须完整提供0至100的有限数值');
  const quotation=Object.hasOwn(input.weights,'quotation')?input.weights.quotation:0;
  if(!bounded(quotation))throw new Error('兼容报价权重必须为0至100的有限数值');
  if(quotation>0&&!migrateLegacy)throw new Error('新版适投仅使用资格、商务、履约三维，报价权重须为0');
  const total=ids.reduce((sum,id)=>sum+input.weights[id],0);
  if(Math.abs(total+quotation-100)>1e-8)throw new Error('三维权重总和必须为100');
  if(total<=0)throw new Error('历史权重无法归一化：资格、商务、履约三维不能全为0');
  for(const id of ids)weights[id]=quotation>0?round(input.weights[id]*100/total):input.weights[id];
  if(quotation>0){
   weights.fulfillment=round(100-weights.qualification-weights.business);
   // Preserve the requested final-dimension remainder without producing -0.01
   // when rounding the first two weights of a zero-fulfillment legacy review.
   if(weights.fulfillment<0){weights.fulfillment=0;weights.business=round(100-weights.qualification);}
  }
 }
 const dimensions={};
 if(input.dimensions!==undefined){
  keys(input.dimensions,migrateLegacy?legacyIds:ids,'适投参考维度');
  for(const id of Object.keys(input.dimensions)){
   const entry=input.dimensions[id];keys(entry,['score','note'],'维度人工参考');
   if(!bounded(entry.score))throw new Error('人工参考分数必须为0至100的有限数值');
   const note=text(entry.note).trim(),length=Array.from(note).length;
   if(length<8||length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(note))throw new Error('人工参考理由须为8至2000字的普通文本');
   if(id!=='quotation')dimensions[id]={score:entry.score,note};
  }
 }
 const thresholds={...defaultThresholds};
 if(input.thresholds!==undefined){
  keys(input.thresholds,['recommend','cautious'],'内部建议阈值');
  for(const key of Object.keys(input.thresholds))thresholds[key]=input.thresholds[key];
  if(!bounded(thresholds.recommend)||!bounded(thresholds.cautious)||thresholds.cautious>=thresholds.recommend)throw new Error('内部建议阈值须满足0≤谨慎阈值<可投阈值≤100，且为有限数值');
 }
 return{weights,dimensions,thresholds};
}

function references(values){
 const seen=new Set();
 return list(values).filter(value=>{
  if(!value||typeof value!=='object')return false;
  const key=JSON.stringify(value);if(seen.has(key))return false;seen.add(key);return true;
 }).map(value=>structuredClone(value));
}
function unknown(basis,gaps,refs=[]){return{status:'pending',score:null,range:{min:0,max:100},basis:list(basis),gaps:list(gaps),references:references(refs),manualReference:false};}
function interval(min,max,basis,gaps,refs=[]){
 min=round(min);max=round(max);
 return{status:min===max?'confirmed':min===0&&max===100?'pending':'range',score:min===max?min:null,range:{min,max},basis:unique(basis),gaps:unique(gaps),references:references(refs),manualReference:false};
}
const pendingScopeFindings=report=>list(report.categories).flatMap(category=>list(category?.items)).filter(item=>item?.scopePending===true&&(item.source!=='ai'||item.reviewed===true)&&item.applicability!=='not-required'&&!(item.reviewed===true&&item.matchStatus==='not-applicable'));
function qualificationDimension(report,hasCompany){
 if(!hasCompany)return unknown(['资格仅使用本报告绑定企业的核验事实'],['尚未绑定有效企业快照，资格未知，不能作为实际零分或满足']);
 const scoped=pendingScopeFindings(report);
 if(scoped.length)return unknown(['标段条款须先确认所投标段与适用范围，不能扩展为全项目满足或失败'],['所投标段适用范围待确认，资格满足率暂不汇总'],scoped.flatMap(item=>list(item.references)));
 const qualification=report.companyAnalysis?.qualification;
 const applicable=list(qualification?.groups).filter(group=>qualificationIds.has(group?.id)&&group.required===true&&!['not-applicable','scoring-only'].includes(group.status));
 if(!applicable.length)return unknown(['未明确适用的资格组不增设硬门槛，也不按已满足计分'],['尚无可据以计算满足率的适用资格组，须核对采购原文和企业原件']);
 const met=applicable.filter(group=>group.status==='met').length,pending=applicable.filter(group=>!['met','unmet'].includes(group.status)).length;
 const gaps=applicable.flatMap(group=>group.status==='met'?[]:[`${group.label||group.id}：${group.status==='unmet'?'已确认不满足':'待核验'}`,...list(group.missing)]);
 return interval(100*met/applicable.length,100*(met+pending)/applicable.length,[`适用资格共${applicable.length}组；${met}组已核验满足，${pending}组待核验；按适用组平均计算已核验满足率区间`],gaps,applicable.flatMap(group=>list(group.references).concat(list(group.requirements).flatMap(item=>list(item.references)))));
}
function nonScoringBusiness(report){
 const findings=new Map(list(report.categories).flatMap(category=>list(category.items)).filter(Boolean).map(item=>[item.id,item]));
 const scoreIds=new Set(list(report.analysis?.scoring?.items).map(item=>item?.id));
 const matches=list(report.companyAnalysis?.matches).filter(match=>{
  const item=findings.get(match?.findingId);
  return item&&item.hard!==true&&!scoreIds.has(item.id)&&!/^评分要求/.test(text(item.fields?.用途))&&item.applicability!=='not-required'&&item.matchStatus!=='not-applicable'&&match.status!=='not-applicable'&&(match.type==='performance'||['entity','qualification','performance'].includes(item.categoryId));
 });
 if(!matches.length)return unknown(['未识别商务采购计分项时，改按非评分商务或业绩事实评估'],['尚无已核验的非评分商务证据，商务适投能力保留未知']);
 let met=0,pending=0;const gaps=[];
 for(const match of matches){
  const item=findings.get(match.findingId),supported=list(match.records).some(record=>record?.verified===true&&record.status==='supported'&&list(record.evidenceIds).length>0);
  if(item.reviewed===true&&item.matchStatus==='unmet')gaps.push(`${item.title||match.title||'商务证明'}：已人工确认不满足`);
  else if(item.reviewed===true&&item.matchStatus==='met'&&match.status==='supported'&&supported)met++;
  else{pending++;gaps.push(`${item.title||match.title||'商务证明'}：要求、企业原件或匹配结果仍待核验`,...list(match.missing));}
 }
 return interval(100*met/matches.length,100*(met+pending)/matches.length,[`无商务采购计分表，按${matches.length}项非评分商务或业绩要求与本企业证据的实际匹配区间评估`],gaps,matches.flatMap(match=>list(match.references)));
}
function nonPricingBusinessRows(report){
 const originals=new Map(list(report.categories).flatMap(category=>list(category?.items)).concat(list(report.analysis?.scoring?.items)).filter(Boolean).map(item=>[item.id,item]));
 const rows=[],mixed=[],excluded=[];
 for(const row of list(report.companyAnalysis?.scoreRows).filter(row=>['商务','附加'].includes(row?.group))){
  const original=originals.get(row.scoreId),group=clean(original?.group);
  // scoreRows retain the original id, materials and references, but not the
  // scoring standard. Prefer that linked standard over the presentation title.
  const standard=original?.readableStandard||original?.standard||original?.quote;
  const rule=clean(standard||list(row.references).map(reference=>text(reference?.quote)).join(' '));
  const pricingRule=/组价合理性|报价合理性|综合单价报价|不均衡报价|价格(?:得分|评分|分值|扣除|优惠|折扣|调整)|投标(?:价格|报价)(?:得分|评分)|报价.{0,20}(?:扣除|优惠|折扣)|最低报价|基准价|评审价|清单(?:报价|计价)|已标价工程量清单/.test(rule);
  const pricingMaterials=/报价明细表|开标\(报价\)一览表|已标价工程量清单/.test(clean(list(original?.materials).concat(list(row.materials)).join(' ')));
  const assumed=row.calculationKind==='assumed-full'||row.assumedScore!==null&&row.assumedScore!==undefined;
  const companyEvidence=/业绩|合同案例|资质|资格|证书|认证|获奖|荣誉|专利|人员|项目经理|合同(?:扫描件|复印件)|验收报告/.test(rule);
  if(/^(?:投标)?(?:价格|报价|清单)(?:评审|评分|部分|分)?$/.test(group)){excluded.push(row);continue;}
  if(pricingRule||assumed&&pricingMaterials){(companyEvidence?mixed:excluded).push(row);continue;}
  rows.push(row);
 }
 return{rows,mixed,excluded};
}
function businessScopePending(report,selection){
 const rows=selection.rows.concat(selection.mixed);
 if(!rows.length)return false;
 const scopes=rows.filter(row=>row.scope).map(row=>JSON.stringify([row.scope.documentId||null,row.scope.package||row.package||null,row.scope.lot||null,row.scope.phase||'response']));
 const rowIds=new Set(rows.map(row=>row.scoreId));
 const scopedReport={...report,analysis:{...report.analysis,scoring:{...report.analysis?.scoring,items:list(report.analysis?.scoring?.items).filter(item=>rowIds.has(item?.id))}}};
 return companyScopePending(scopedReport)||rows.some(row=>row.scopePending===true||row.scope?.mixedPackages)||new Set(scopes).size>1;
}
function businessDimension(report,hasCompany,scopePending,selection){
 if(!hasCompany)return unknown(['商务评估须有本报告绑定的企业事实'],['尚未绑定有效企业快照，不能把采购评分假设视为企业能力']);
 const {rows,mixed,excluded}=selection;
 if(mixed.length)return unknown(['非报价商务只使用可独立确认的企业证据分，不把复合条款中的报价分纳入'],['商务条款同时包含报价与企业证据，须先拆分确认非报价分值'],rows.flatMap(row=>list(row.references)));
 if(!rows.length&&excluded.length)return unknown(['采购商务评分项均为报价或组价内容，本次适投商务仅评估非报价事实'],['尚无可独立评估的非报价商务评分项，须另核企业商务事实']);
 if(!rows.length)return nonScoringBusiness(report);
 if(scopePending)return unknown(['商务采购分须在唯一完整的采购包与评分适用范围内评估'],['采购包、版本或评分适用范围待核验，不能跨包平均或合并商务适投分'],rows.flatMap(row=>list(row.references)));
 if(rows.some(row=>!bounded(row.maxScore,Number.MAX_VALUE))||rows.reduce((sum,row)=>sum+row.maxScore,0)<=0)return unknown(['商务与独立附加采购分的原始上限尚未完整确定'],['商务评分分值或适用口径有缺口，不能形成确定商务适投分'],rows.flatMap(row=>list(row.references)));
 const maximum=rows.reduce((sum,row)=>sum+row.maxScore,0);let minimum=0,upper=0;const gaps=[],basis=[];
 for(const row of rows){
  const assumed=row.calculationKind==='assumed-full'||row.assumedScore!==null&&row.assumedScore!==undefined;
  const confirmed=assumed?0:bounded(row.confirmedScore,row.maxScore)?row.confirmedScore:0;
  const ceiling=assumed?row.maxScore:bounded(row.range?.max,row.maxScore)?Math.max(confirmed,row.range.max):row.maxScore;
  minimum+=confirmed;upper+=ceiling;
  basis.push(`${row.title||row.scoreId||'商务项'}：已确认企业证据支持${confirmed}/${row.maxScore}采购分，仅归一化为内部商务适投区间`);
  if(assumed)gaps.push(`${row.title||row.scoreId||'清单项'}：采购测算满分是假设，本次不计入已确认商务分，保留0至原上限`);
  else if(confirmed!==ceiling)gaps.push(`${row.title||row.scoreId||'商务项'}：尚有未核验得分空间，未知下限不是实际零分判定`);
  gaps.push(...list(row.missing));
 }
 return interval(100*minimum/maximum,100*upper/maximum,['只使用非报价商务与独立附加采购项的确认证据分及未核验上限；报价、组价及清单计价内容不纳入分母或证据',...basis],gaps,rows.flatMap(row=>list(row.references)));
}
function hardGate(report,hasCompany){
 if(!hasCompany)return{status:'pending',failedFindingIds:[],pendingFindingIds:[],findingIds:[],reasons:['当前企业快照未绑定或与企业分析身份不一致，旧企业资格结果不能用于本次适投判断']};
 const qualification=report.companyAnalysis?.qualification,gate=qualification?.hardGate||{};
 const scoped=pendingScopeFindings(report),failedFindingIds=unique(list(gate.failedFindingIds)),pendingFindingIds=unique(list(gate.pendingFindingIds).concat(scoped.map(item=>item.id)));
 const failed=failedFindingIds.length>0||qualification?.status==='unmet'||gate.status==='unmet'||list(qualification?.groups).some(group=>group?.required===true&&group.status==='unmet');
 const pendingGroups=list(qualification?.groups).some(group=>group?.required===true&&!['met','not-applicable','scoring-only'].includes(group.status));
 const status=failed?'unmet':qualification?.status==='met'&&gate.status==='met'&&!pendingGroups&&!pendingFindingIds.length&&!scoped.length?'met':'pending';
 return{status,failedFindingIds,pendingFindingIds,scopePending:scoped.length>0,findingIds:unique(list(gate.findingIds).concat(failedFindingIds,pendingFindingIds)),reasons:[status==='unmet'?'已确认资格或实质性硬门槛不满足，内部适投分不能抵消':scoped.length?'所投标段适用范围尚未确认，标段条款不扩展为全项目满足或失败':status==='met'?'资格与实质性硬门槛沿用企业原件核验结果，人工适投参考分不改变该事实':'资格、条件适用或企业原件尚待核验，人工参考分不能确认采购资格']};
}
function coverageIsConfirmed(report){
 if(report.coverageReview?.reviewed===true&&text(report.coverageReview.note).trim())return true;
 const coverage=report.coverage;
 return coverage?.complete===true&&!['missingCategories','unrecognizedBlocks','missingAttachments'].some(key=>list(coverage[key]).length);
}
const weightedRange=(dimensions,weights,reference=false)=>({
 min:round(dimensions.reduce((sum,item)=>sum+(reference&&item.manualReference?item.score:item.range.min)*weights[item.id]/100,0)),
 max:round(dimensions.reduce((sum,item)=>sum+(reference&&item.manualReference?item.score:item.range.max)*weights[item.id]/100,0))
});

export function buildSuitabilityAssessment(report={}){
 if(!report||typeof report!=='object')report={};
 let review,reviewInvalid=false;
 try{review=validateSuitabilityReview(report.suitabilityReview,{migrateLegacy:true});}catch{review=validateSuitabilityReview();reviewInvalid=true;}
 const historical=report.suitabilityReview;
 const migrated=!reviewInvalid&&(historical?.weights?.quotation>0||Object.hasOwn(historical?.dimensions||{},'quotation'));
 const reviewMigration=migrated?{migrated:true,previousWeights:historical?.weights?structuredClone(historical.weights):null,note:'历史适投评估已移除报价维度；资格、商务、履约按原有比例归一化至100%，历史报价人工参考分已忽略，原记录保持不变'}:{migrated:false};
 const snapshot=report.companySnapshot,analysisCompany=report.companyAnalysis?.companyId;
 const hasCompany=Boolean(text(snapshot?.id).trim()&&analysisCompany===snapshot.id),businessSelection=nonPricingBusinessRows(report),commercialScopePending=businessScopePending(report,businessSelection);
 const automatic={
  qualification:qualificationDimension(report,hasCompany),business:businessDimension(report,hasCompany,commercialScopePending,businessSelection),
  fulfillment:unknown(['履约适投须结合本企业资金、人员、工期与供货或施工计划'],['缺少本企业已核验的资金承受能力和履约计划；招标文件履约义务不能证明企业已经具备能力'])
 };
 const dimensions=definitions.map(({id,label})=>{
  const item={id,label,weight:review.weights[id],...automatic[id]},manual=review.dimensions[id];
  if(manual){item.evidenceScore=item.score;item.score=manual.score;item.status='reference';item.manualReference=true;item.note=manual.note;item.basis=[...item.basis,`人工内部参考：${manual.note}`];item.gaps=unique([...item.gaps,'人工参考不缩窄事实区间，不确认采购资格、企业证据或实际采购得分']);}
  return item;
 });
 const completePoints=dimensions.filter(item=>item.weight>0).every(item=>bounded(item.score));
 const referenceScore=hasCompany&&completePoints?round(dimensions.reduce((sum,item)=>sum+(item.score??0)*item.weight/100,0)):null;
 const totalRange=weightedRange(dimensions,review.weights),hasManual=dimensions.some(item=>item.manualReference&&item.weight>0);
 const referenceRange=hasCompany&&hasManual?weightedRange(dimensions,review.weights,true):null;
 const gate=hardGate(report,hasCompany),coverageConfirmed=coverageIsConfirmed(report);
 const reasons=[],conditions=[`可投${review.thresholds.recommend}分、谨慎${review.thresholds.cautious}分为试行内部口径，不替代采购评审、资格核验或实际得分`];
 let status='pending',label='暂评待核',basis='pending-evidence';
 if(gate.status==='unmet'){status='blocked';label='不建议投';basis='hard-gate';reasons.push(...gate.reasons);}
 else if(!hasCompany){reasons.push('尚未绑定有效企业快照，不能形成针对本企业的适投建议');conditions.push('先选择企业并核验与项目对应的原件事实');}
 else if(gate.status!=='met'){reasons.push(...gate.reasons);conditions.push(gate.scopePending?'先确认所投标段和条款适用范围，再逐项核验对应资格；不跨标段判定满足或失败':'先完成适用资格与实质性要求的逐项核验');}
 else if(commercialScopePending){reasons.push('采购包或评分适用范围尚未唯一确定，适投结果先作暂评');conditions.push('先确认所投采购包及适用评分规则，不能跨包平均商务分或以人工参考代替范围确认');}
 else if(!coverageConfirmed){reasons.push('采购原文覆盖尚未确认完整，适投结果先作暂评');conditions.push('对照原件核对附件、未识别类别和未归类段落后确认覆盖');}
 else if(referenceScore===null){reasons.push('部分适投维度仍未知，不能强填总分或给出确定建议');conditions.push('补齐有依据的维度评估；可填写有理由的人工内部参考分');}
 else{
  status=referenceScore>=review.thresholds.recommend?'recommend':referenceScore>=review.thresholds.cautious?'cautious':'not-recommended';
  label=status==='recommend'?'可投':status==='cautious'?'谨慎可投':'不建议投';basis=hasManual?'manual-reference':'confirmed-evidence';
  reasons.push(`按本次三维权重及试行内部阈值，内部${hasManual?'参考':'证据支持'}适投分为${referenceScore}分`);
  if(hasManual)conditions.push('本建议属于内部参考，人工分仅反映所填理由；未核验的履约和资金事实仍须落实，不代表采购资格或实际评审得分已确认');
 }
 if(migrated)conditions.push(reviewMigration.note);
 if(reviewInvalid)conditions.push('历史适投参考输入未通过校验，本次已忽略无效输入并恢复默认权重；须重新填写有效参考');
 const recommendation={status,label,basis,reasons:unique(reasons),conditions:unique(conditions)};
 let internalAction={...recommendation,reasons:[...recommendation.reasons],conditions:[...recommendation.conditions]};
 if(gate.status!=='unmet'&&hasCompany){
  if(gate.scopePending||commercialScopePending||companyScopePending(report))internalAction={status:'scope-pending',label:'先确认所投范围',basis:'pending-scope',reasons:['所投采购包、标段或评分适用范围尚未唯一确认，内部参考分不能代替范围确认'],conditions:['先确认所投范围，再按该范围补齐资格与非报价商务证据，不跨包汇总或建议具体标段']};
  else if(gate.status==='pending'&&referenceScore!==null)internalAction={status:'conditional',label:'先补齐再投',basis:'manual-reference-pending-gate',reasons:[`三维内部参考分为${referenceScore}分；资格与实质性要求仍待核验`],conditions:unique([...conditions,'先补齐对应资格与履约证明，再决定递交；内部行动建议不确认采购资格或实际评审得分'])};
 }
 return{version:'suitability-v16.1',scope:'internal',weights:{...review.weights},dimensions,totalRange,referenceScore,referenceRange,referenceLabel:'内部参考分',referenceRangeLabel:'内部参考区间',hardGate:gate,coverageConfirmed,recommendation,internalAction,thresholds:{...review.thresholds},reviewMigration};
}
