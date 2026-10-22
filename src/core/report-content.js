import {procurementPolicyDisplay} from '../../public/policy-labels.js';
import {CATEGORIES} from './contracts.js';
import {readText} from './analysis.js';

const unique=values=>[...new Set(values.filter(Boolean))];
const refs=items=>[...new Map(items.flatMap(item=>item.references||[]).map(ref=>[`${ref.documentId}:${ref.blockId}:${ref.quote}`,ref])).values()];
const common=/^(?:依原文整理|原文含硬性审查|提取评分标准|保留强制采购适用范围|按本次文件与企业事实)/;
const phase=item=>item.scope?.phase||(/履约|施工期间|施工过程中|进场|验收与赔偿/.test(item.stage||'')?'fulfillment':'response');
function scopeKey(item){return JSON.stringify([item.scope?.documentId||item.references?.[0]?.documentId||item.references?.[0]?.fileName||null,item.scope?.package||item.fields?.['采购包范围']||null,phase(item)]);}
function plainRequirement(item){
 if(item.source==='ai'){
  const additions=Object.entries(item.fields||{}).filter(([key,value])=>/^(?:补充解读|AI候选·)/.test(key)&&value).map(([key,value])=>`${key}：${Array.isArray(value)?value.join('；'):value}`);
  return unique([!common.test(item.interpretation||'')?item.interpretation:'',...additions]).join('\n')||'AI候选尚未形成可复核解释，请核对真实引用。';
 }
 if(item.requirement)return item.requirement;
 if(item.interpretation&&!common.test(item.interpretation))return item.interpretation;
 const parts=String(item.fields?.['要求正文']||item.quote||'').normalize('NFKC').split('|').map(value=>value.trim()).filter(value=>value&&!/^\d+(?:\.\d+)?$|^\{\{|^-(?:第)?\d+页-$/.test(value));
 // A recognized row title and an identical body are one statement; keep the body punctuation.
 if(parts.length>1&&readText(parts[0])===readText(item.title)&&readText(parts[0])===readText(parts[1]).replace(/[。.]$/,''))parts.shift();
 return parts.join('；')||'当前未定位到完整要求，待核验。';
}

// Topics are tied to clause semantics. No project identifiers or page numbers choose a rule.
function topic(item){
 const t=readText(item.fields?.['要求正文']||item.quote||item.interpretation),title=item.title||'';
 if(item.source==='derived')return{key:'derived:'+title,title};
 if(item.fields?.['条件材料路径'])return{key:'conditional-formats',title:item.title};
 if(item.title==='最后报价提交与不可撤回')return{key:'last-submission',title:item.title};
 if(item.fields?.['满分'])return{key:`score:${title}:${item.fields['满分']}`,title};
 if(item.fields?.['税社保材料分支']||/税收与社会保障资金四条/.test(title))return{key:'tax',title:'税社保材料分支'};
 if(/政府采购供应商资格承诺函/.test(t)&&/独立承担/.test(t))return{key:'general-qualification',title:'一般资格与完整资格承诺'};
 if(/拟派项目经理完整/.test(title))return{key:'special-qualification',title:'企业资质及项目经理全组资格'};
 if(/无不良信用记录/.test(t)&&/截图|承诺函/.test(t))return{key:'credit',title:'供应商信用承诺与四名单截图'};
 if(item.fields?.['低价审查触发'])return{key:'low-price',title:'异常低价审查与解释程序'};
 if(item.fields?.['报价纠错阶段'])return{key:item.fields['报价纠错阶段']==='last'?'correction-final':'correction-initial',title:item.fields['报价纠错阶段']==='last'?'最后报价纠错及电子确认':'首次清单纠错与确认'};
 if(item.fields?.['实质性要求'])return{key:`star:${title}`,title:`${title} 实质性要求`};
 if(/响应有效期/.test(t))return{key:'validity',title:'响应有效期与起算日'};
 if(/未按规定获取/.test(t)||/文件获取与公告时限/.test(title))return{key:'acquisition',title:'文件获取回执与公告时限'};
 if(/是否接受联合体/.test(t))return{key:'consortium',title:'联合体适用范围',summary:/采购包\d+[:：]不接受/.test(t)?'本包不接受联合体；后续“如接受”条件为通用分支，不能反向视为本包开放联合体。':undefined};
 if(/解密/.test(t)&&/数字证书|系统故障|无效/.test(t))return{key:'decrypt',title:'递交与解密',summary:/除因平台系统故障/.test(t)?'截止前完成签章、加密及提交并保存回执；按规定解密时间使用原加密数字证书解密。未按时解密按无效响应处理，保留平台系统故障例外；具体截止和解密时限另核公告及平台。':undefined};
 if(/加密|提交响应文件/.test(t)&&/拒绝接收|规定时间|截止|回执/.test(t))return{key:'submission',title:'电子编制 签章与递交'};
 if(/修正/.test(t)&&/报价/.test(t))return{key:/最后报价/.test(t)?'correction-final':'correction-initial',title:/最后报价/.test(t)?'最后报价纠错及电子确认':'首次清单纠错与确认'};
 if(/大写金额|单价金额小数点|单价汇总|单价\(或费率\)/.test(t))return{key:/最后报价/.test(t)||item.references?.some(ref=>/5\.3\.6|最后报价/.test(ref.section||''))?'correction-final':'arithmetic-correction',title:'报价算术纠错标准'};
 if(/串通|前述一至六|虚假材料谋取成交/.test(t))return{key:'collusion',title:'串通 虚假材料及禁止行为'};
 if(/报价须是唯一|最后报价唯一|不高于最高限价|不得超出采购预算|供应商报价不得超过/.test(t))return{key:'unique-price',title:'报价唯一与预算限价'};
 if(/按要求提供供应商自觉抵制|法定代表人资格证明书.*授权委托书/.test(t)&&/商业贿赂/.test(t))return{key:'mandatory-documents',title:'反商业贿赂 供应商承诺及法代证明或授权'};
 if(/响应文件完整性/.test(t))return{key:'completeness',title:'响应文件格式 签署与完整性'};
 if(/最后报价|磋商响应情况|供应商响应表|最终磋商|实质性响应/.test(t))return{key:'negotiation',title:'磋商响应与最后报价'};
 if(/采购活动.*终止|终止.*采购活动|供应商.*不足3家/.test(t))return{key:'termination',title:'采购整体终止与有效家数'};
 if(/综合评分法|推荐.*候选|技术指标|评分相同/.test(t))return{key:'evaluation',title:'评审方法与候选推荐'};
 if(/授权评标委员会|候选人名单中按顺序确定/.test(t))return{key:'determination',title:'成交供应商确定主体与顺序'};
 if(/是否组织.*现场考察|不组织|踏勘/.test(t)&&item.categoryId==='survey')return{key:'survey',title:'现场考察及自主了解'};
 if(item.categoryId==='sample')return{key:'sample',title:'样品与进场材料确认',summary:/无需提交样品/.test(t)?'本采购包无需提交样品，未见样品评分项；主要材料进场确认与投标提交样品属于不同阶段，材料品牌产地、性能及溯源资料仍按独立条款落实。':undefined};
 if(item.categoryId==='deposit'){const type=item.fields?.['保证金类型']||t.match(/投标(?:\(响应\))?保证金|响应保证金|履约保证金|质量保证金/)?.[0]||'未明示类型';return{key:'deposit:'+type,title:/赔偿/.test(t)?'未缴履约保证金的损失赔偿责任':type};}
 if(item.categoryId==='eco'){
  if(/主材|主要材料/.test(t))return{key:'material-performance',title:'主要材料技术及环保性能'};
  if(/强制采购|强制节能/.test(t))return{key:'eco-mandatory',title:'强制采购节能产品'};
  if(/环境标志/.test(t))return{key:'eco-environmental',title:'优先采购环境标志产品'};
  if(/优先采购节能/.test(t))return{key:'eco-preferred',title:'优先采购节能产品'};
  if(/优先采购产品评审细则/.test(t))return{key:'eco-preferred-rules',title:'优先采购评审细则'};
 }
 if(/本国产品|所投产品.*中国境内生产/.test(t))return{key:'domestic-policy',title:'本国产品政策的项目适用条件'};
 if(/知识成果|知识产权|开发接口|开发手册/.test(t))return{key:'intellectual-property',title:'采用知识成果的条件性承诺'};
 if(/详见附件|见附件|另附/.test(t))return{key:'attachment-index',title:'所引附件与格式正文缺口'};
 if(/不允许分包|严禁.*转包|不得.*转包/.test(t))return{key:'subcontract',title:'分包与转包限制'};
 if(/更换项目负责人/.test(t))return{key:'person-change',title:'负责人更换的同意与备案'};
 if(/安全要求|专项安全施工方案|购买相关保险/.test(t))return{key:'construction-safety',title:'施工安全 方案审批与人员保险'};
 if(/主材|品牌产地|溯源/.test(t))return{key:'material-performance',title:'材料品牌产地与溯源资料'};
 if(/公证费|见证费|代理服务费/.test(t))return{key:'fees',title:'成交供应商费用'};
 if(/付款方式|资金支付|审计完成/.test(t))return{key:'payment',title:'付款条件与资金责任'};
 return{key:`other:${title}`,title};
}

function subrequirements(items){return unique(items.flatMap(item=>[plainRequirement(item),item.requirement&&item.interpretation&&readText(item.requirement)!==readText(item.interpretation)?item.interpretation:'']));}
// Used only inside an existing same-topic/source/package/phase group; original subrequirements remain.
function displayRequirements(requirements){
 const seen=new Set(),lines=[];
 for(const paragraph of requirements.flatMap(value=>String(value).split('\n'))){
  let key=readText(paragraph);
  if(paragraph.startsWith('本条完整条件一并核对：')){
   // Only the leading list number and heading separator before the first enumerated subclause differ.
   const body=readText(paragraph.slice('本条完整条件一并核对：'.length)).replace(/^\d+[、.](?=\D)/,'').replace(/^([^:;()]+)[:;](?=\(1\))/,'$1:');
   key='本条完整条件一并核对:'+body;
  }
  if(!key||seen.has(key))continue;seen.add(key);lines.push(paragraph);
 }
 return lines.join('\n');
}
function withoutDuplicateRequirement(item){if(item.requirement&&readText(item.requirement)===readText(item.interpretation)){const {requirement,...result}=item;return result;}return item;}
function aggregate(items){
 const groups=new Map();
 for(const item of items){if(!item?.references?.length)continue;const rule=topic(item),key=scopeKey(item)+'|'+rule.key+(item.source==='ai'?`|ai:${item.id}`:'');const group=groups.get(key)||{rule,items:[]};group.items.push(item);groups.set(key,group);}
 return [...groups.values()].map(({rule,items})=>{
  const base=items.find(item=>item.reviewed&&item.matchStatus==='unmet'&&item.hard)||items.find(item=>item.hard)||items[0];
  const requirements=subrequirements(items),allText=readText(items.map(item=>item.quote).join(' '));
  let requirement=rule.summary||displayRequirements(requirements);
  if(base.source!=='ai'&&rule.key==='collusion'&&/前述一至六/.test(allText)&&/提供虚假材料谋取成交/.test(allText)&&/行贿/.test(allText))requirement='禁止项一至六任一触发则响应无效，已成交则成交无效：串通响应、恶意串通、虚假材料谋取成交、不正当诋毁排挤、与采购相关方恶意串通、行贿或提供其他不正当利益。串通响应包含同人编制、同人办理、同项目管理成员或联系人、文件异常一致／报价规律性差异、文件混装及同账户保证金转出；保证金账户条款仅定义串通，不能反推本包需要缴款，缴纳适用性按项目选项核对。恶意串通包含获他方信息后修改、按采购相关方授意撤换修改、协商报价或技术方案、按集团协会商会要求协同、约定成交方、商定部分放弃，以及谋求特定供应商成交或排斥他方。具体定义及法律后果按原文逐项核对。';
  if(base.source!=='ai'&&['eco-mandatory','eco-preferred','eco-environmental'].includes(rule.key)){
   if(items.every(item=>item.applicability==='not-required'||item.fields?.['附件目录属性']))requirement=`${rule.title}在本范围明确不涉及；不将通用认证或无效模板改成本包无条件必交证书，也不产生独立附加得分。材料技术及环保性能仍按主材评分和施工要求独立核对。`;
  }
  const fields={...base.fields};
  if(items.some(item=>item.fields?.['税社保材料分支']))fields['税社保材料分支']=unique(items.flatMap(item=>item.fields?.['税社保材料分支']||[]));
  if(items.some(item=>item.fields?.['低价阈值示例'])){fields['低价阈值示例']=items.find(item=>item.fields?.['低价阈值示例']).fields['低价阈值示例'];requirement+='\n'+fields['低价阈值示例'];}
  if(base.source==='ai')requirement=requirements.join('\n');
  return {...base,title:base.source==='ai'?base.title:rule.title||base.title,interpretation:requirement,requirement,materials:unique(items.flatMap(item=>item.materials||item.fields?.['证明材料']||[])),consequence:base.fields?.['不满足后果']||base.impact||'后果与适用分支按引用条款核验。',preparation:unique(items.flatMap(item=>item.actions||[])),actions:unique(items.flatMap(item=>item.actions||[])),references:refs(items),sourceFindingIds:unique(items.flatMap(item=>item.sourceFindingIds||item.relatedFindingIds||[item.id])),subrequirements:requirements,hard:items.some(item=>item.hard),conditional:items.some(item=>item.conditional),matchStatus:items.some(item=>!item.reviewed||item.matchStatus==='pending')?'pending':base.matchStatus,scope:base.scope};
 });
}

function primary(category,item){
 const t=readText(item.quote),key=topic(item).key;
 if(item.source==='ai'&&item.reviewed!==true)return false;
 if(!item.categoryId)return true;
 if(item.source==='ai')return true;
 if(category==='entity')return /独立承担|营业执照.*提供|提交.*营业执照|经营范围/.test(t);
 if(category==='scoring')return Boolean(item.fields?.['满分'])||/价格扣除|分值构成/.test(t);
 if(category==='qualification')return item.hard||item.fields?.['政策属性']==='评审价格扣除'||/税社保|一般资格|完整资格|信用承诺|信用材料|采购方信用|联合体/.test(item.title||'');
 if(category==='personnel')return /special-qualification|score:|person-change|construction-safety/.test(key);
 if(category==='performance')return /业绩|同类项目合同/.test(t);
 if(category==='rejection')return item.hard||key==='low-price'||/澄清|说明|更正|补正|反馈|书面确认|纠错/.test(t);
 if(category==='method')return /evaluation|determination|termination|negotiation|subcontract|acquisition/.test(key)||/采用竞争性磋商方式/.test(t);
 if(category==='consistency')return /以pdf格式内容为准|未填写|修正|澄清|前后|矛盾/.test(t);
 if(category==='commitment')return !item.fields?.['附件目录属性']&&!['合同履约','履约验收'].includes(item.stage);
 if(category==='eco')return !/^序号/.test(t);
 return true;
}

// Legacy scoring rows may have no source flag. Their raw category review is
// authoritative; removing a candidate must also remove its derived totals.
function scoringProjection(scoring,eligible){
 if(!scoring||(scoring.items||[]).every(eligible)&&(scoring.packages||[]).every(pack=>(pack.items||[]).every(eligible)))return scoring;
 const items=(scoring.items||[]).filter(eligible),sum=rows=>rows.length&&rows.every(item=>Number.isFinite(item.maxScore))?rows.reduce((total,item)=>total+item.maxScore,0):null;
 const groupsOf=(rows,previous=[])=>{
  const groups=new Map();for(const item of rows){const name=item.group;if(!groups.has(name))groups.set(name,{...(previous.find(group=>group.name===name)||{}),name,maxScore:0});const group=groups.get(name);group.maxScore=group.maxScore!==null&&Number.isFinite(item.maxScore)?group.maxScore+item.maxScore:null;}return [...groups.values()];
 };
 const status='已隔离未人工核验的AI候选评分行；保留已定位分项，完整评分范围待核验';
 const packages=(scoring.packages||[]).flatMap(pack=>{
  const own=(pack.items||[]).filter(eligible);if(own.length===(pack.items||[]).length)return [pack];
  return own.length?[{...pack,items:own,groups:groupsOf(own,pack.groups),total:sum(own),status}]:[];
 });
 const scopeCount=new Set(items.map(item=>JSON.stringify([item.scope?.documentId||item.references?.[0]?.documentId||null,item.scope?.package||item.package||null,item.scope?.phase||'response']))).size;
 const multiple=packages.length>1||scopeCount>1;
 const groups=multiple&&packages.length?packages.flatMap(pack=>pack.groups.map(group=>({...group,package:pack.package,scope:pack.scope,label:pack.label}))):groupsOf(items,scoring.groups);
 return {...scoring,items,groups,total:multiple?null:sum(items),packages,status};
}

/** Same source object is consumed by the page, Word and PDF; raw findings remain on report. */
export function buildReportContent(report){
 const analysis=report.analysis||{},raw=report.categories||[],output=report.outputs||{};
 const eligible=item=>item.source!=='ai'||item.reviewed===true,reviewedAI=item=>item.source==='ai'&&item.reviewed===true;
 const rawById=new Map(raw.flatMap(category=>category.items||[]).map(item=>[item.id,item]));
 const eligibleScore=item=>eligible(rawById.get(item.id)||item);
 const scoring=scoringProjection(analysis.scoring,eligibleScore);
 const domesticExclusions=(analysis.policySelections||[]).filter(item=>item.title==='本国产品'&&item.value==='不涉及');
 const policyAware=item=>{
  if(!/本国产品|所投产品.*中国境内生产/.test(readText(item.quote)))return item;
  const exclusion=domesticExclusions.find(other=>other.scope?.documentId===item.references?.[0]?.documentId&&(!other.scope?.package||other.scope.package===item.scope?.package||`采购包${other.scope.package}`===item.fields?.['采购包范围']));
  if(!exclusion)return item;
  return {...item,hard:false,applicability:'not-required',interpretation:'本范围本国产品项目表明确不涉及；20%价格扣除与80%以上产品成本占比为带适用条件的通用模板，不自动用于本包。80%是成本占比门槛，不是价格扣除比例。本国产品声明及成本占比承诺当前不自动列为必交材料。',references:refs([item,exclusion])};
 };
 const categories=CATEGORIES.map(def=>{
  const source=raw.find(category=>category.id===def.id),derived=(analysis.businessRequirements||[]).filter(item=>item.categoryId===def.id),covered=new Set(derived.flatMap(item=>item.coversFindingIds||[])),items=aggregate([...(source?.items||[]).filter(item=>primary(def.id,item)&&(!covered.has(item.id)||reviewedAI(item))),...derived].map(policyAware));
  const supplementaryItems=(source?.items||[]).filter(item=>!primary(def.id,item));
  if(def.id==='method'&&analysis.methodDetails?.length){const handled=new Set(['evaluation','negotiation','determination']);const keep=items.filter(item=>reviewedAI(item)||!handled.has(topic(item).key));items.splice(0,items.length,...keep,...aggregate(analysis.methodDetails));}
  if(def.id==='consistency')items.push(...aggregate((analysis.clarifications||[]).map(item=>({...item,categoryId:def.id}))));
  if(def.id==='entity'&&items.length&&/独立承担/.test(readText(items[0].quote))&&!(source?.items||[]).some(item=>/经营范围.*(?:必须|须|应|不得)/.test(readText(item.quote))))items[0]={...items[0],interpretation:'需要核对独立承担民事责任能力、主体名称与存续及证照主体一致性；本段未单列经营范围必须包含项目名称关键词的门槛。具体主体证明形式仍核实际附件。',requirement:'需要核对独立承担民事责任能力、主体名称与存续及证照主体一致性；本段未单列经营范围必须包含项目名称关键词的门槛。具体主体证明形式仍核实际附件。'};
  const summary=!items.length?'当前未定位到完整项目要求，不等于没有要求；结合原件及缺口核验。':items.every(item=>item.applicability==='not-required')?'本范围明确无需或不涉及，其他独立条件仍按引用核对。':`已按${items.length}个事项整理项目要求和条件；企业资料及适用性${items.every(item=>item.reviewed)?'按已复核状态查看':'待核验'}。`;
  const pendingAICandidates=aggregate((source?.items||[]).filter(item=>item.source==='ai'&&item.reviewed!==true));
  return {...def,status:source?.status||'未定位，待核验',summary,items,supplementaryItems,pendingAICandidates,sourceFindingCount:source?.items?.length||0};
 });
 const risks=aggregate([...(output.risks||[]).filter(eligible),...(analysis.preparation||[]).filter(item=>item.hard&&eligible(item))]);
 const derivedCommitments=analysis.commitmentDetails||[],coveredCommitments=new Set(derivedCommitments.flatMap(item=>item.coversFindingIds||[]));
 // Conditional-format paths do not cover the separately required anti-bribery/identity documents.
 const commitments=aggregate([...(output.commitments||[]).filter(item=>eligible(item)&&(!coveredCommitments.has(item.id)||topic(item).key==='mandatory-documents')),...derivedCommitments.filter(eligible)].map(policyAware));
 const scoreItems=(scoring?.items||[]).length?scoring.items.map(score=>{
  const source=rawById.get(score.id)||(output.scoreItems||[]).find(item=>item.id===score.id)||{};
  return {...source,...score,source:source.source??score.source,reviewed:source.reviewed??score.reviewed,matchStatus:source.matchStatus??score.matchStatus,standard:score.readableStandard||score.standard,rawStandard:score.standard,references:refs([source,score]),fields:{...source.fields,'满分':String(score.maxScore),'证明材料':score.materials,'评分性质':source.fields?.['评分性质']||'待核验'},categoryId:'scoring',interpretation:source.interpretation||score.standard,requirement:source.interpretation||score.standard,additionalRequirements:source.additionalRequirements,sourceFindingIds:[score.id],materials:score.materials||[],consequence:'影响该项计分，不能抵消资格或实质性要求。',actions:source.actions||['按完整标准核对材料与方案。']};
 }):aggregate((output.scoreItems||[]).filter(eligibleScore));
 if(scoring?.items?.length){const ids=new Set(scoring.items.map(item=>item.id));scoreItems.push(...aggregate((output.scoreItems||[]).filter(item=>!ids.has(item.id)&&eligibleScore(item))));}
 const preparation=[...(analysis.preparation||[]),...aggregate([...risks,...commitments]).map(item=>({id:item.id,title:item.title,interpretation:item.requirement,actions:item.actions,references:item.references}))];
 const aiSupplement=aggregate([...(report.synthesis?.items||[]),...(report.webChat?.synthesis||[])].map((item,index)=>({...item,id:item.id||`synthesis-${index}`,source:'ai',reviewed:false,matchStatus:'pending',fields:item.fields||{}})));
 const screening=report.companyAnalysis?.screening||{},scopeConfirmed=(scoring?.packages?.length||0)<=1&&!scoring?.packages?.some(item=>item.scope?.mixedPackages)&&!/不一致|缺口|未识别|待核验/.test(scoring?.status||'待核验');
 const thresholdRatio=screening.threshold??.95,denominator=screening.denominator??null;
 const internalScreening={thresholdRatio,denominator,thresholdScore:scopeConfirmed&&denominator>0?Math.round(denominator*thresholdRatio*100)/100:null,scopeConfirmed,hasIndependentAdditional:(scoring?.items||[]).some(item=>item.group==='附加')};
 return {procurementPolicyDisplay:procurementPolicyDisplay(report),procurementPolicy:report.procurementPolicy||null,projectContext:report.projectContext||null,policySnapshot:report.policySnapshot||null,overview:analysis.overview||[],outputs:{risks:risks.map(withoutDuplicateRequirement),scoreItems:scoreItems.map(withoutDuplicateRequirement),commitments:commitments.map(withoutDuplicateRequirement),conclusion:output.conclusion||{label:'待核验',reasons:['企业事实或原文覆盖待核验'],conditions:[]}},categories:categories.map(category=>({...category,items:category.items.map(withoutDuplicateRequirement)})),companyAnalysis:report.companyAnalysis||null,commercialRisks:analysis.commercialRisks||[],technical:analysis.technical||[],clarifications:analysis.clarifications||[],preparation,aiSupplement:aiSupplement.map(withoutDuplicateRequirement),internalScreening,scoring:scoring||{items:[],groups:[],total:null,status:'待核验'},reading:{coverage:report.coverage||{},warnings:report.warnings||[],coverageReview:report.coverageReview||null},rawSource:'report.categories'};
}
