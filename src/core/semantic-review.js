import {createHash} from 'node:crypto';
import {readText} from './analysis.js';

const array=value=>Array.isArray(value)?value:[];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);
const referenceKey=ref=>JSON.stringify([ref.documentId,ref.blockId,ref.page,ref.quote]);
const distinctRefs=refs=>[...new Map(refs.map(ref=>[referenceKey(ref),ref])).values()];
const GROUPS={overview:'fact',technical:'condition',commercialRisks:'condition',clarifications:'gap',businessRequirements:'condition'};
const MAX_CHECKS=80,MAX_DESCRIPTION=1600;
const metadataLine=/^\s*(?:采购项目名称|项目名称|采购项目编号|项目编号|采购人|采购代理机构|代理机构)[ \t]*[:：|\t]/;
const requirementBody=quote=>quote.split('\n').filter(line=>!metadataLine.test(line)).join('\n');
// These source anchors select local clauses for comparison, not conclusions
// about compliance. A clause explicitly waiving an obligation matters too.
const CATEGORY_SOURCE={entity:/营业执照|经营范围|独立承担民事责任/,qualification:/资质|许可|资格(?:要求|条件|审查)|资格.{0,10}(?:须|应|必须|具备|具有)|(?:须|应当|必须|具备|具有).{0,20}资格|信用|税收|纳税|社会保障|社保|联合体/,scoring:/评分|得分(?:标准|条件|规则)|分值|加分|扣分|满分|每.{0,20}\d+(?:\.\d+)?分/,rejection:/无效|废标|否决|不予接受|拒绝|实质性|不予受理/,payment:/付款|支付|预付款|进度款|质保金|发票|结算/,method:/评审|评标|磋商|谈判|定标|成交|最低评标价|综合评分/,survey:/踏勘|勘查|现场考察|现场勘察/,sample:/样品|样板|送样/,performance:/业绩|合同案例/,personnel:/人员|负责人|项目经理|建造师|职称|岗位/,deposit:/保证金|保函/,eco:/节能|环保|环境标志|强制采购|优先采购|绿色建材/,consistency:/一致|冲突|矛盾|差异|澄清|修正|更正/,commitment:/承诺|声明|保证书/};

function sourceBlocks(report,documents){
 const roles=new Map([[report?.documentId,'tender'],...array(report?.attachmentIds).map(id=>[id,'attachment'])]);
 return array(documents).flatMap(doc=>{
  if(!roles.has(doc?.id)||doc.role==='evidence'||doc.role&&doc.role!==roles.get(doc.id))return [];
  return array(doc.extraction?.blocks||doc.blocks).filter(block=>typeof block?.id==='string'&&typeof block.text==='string').map(block=>{
   const packages=[...new Set([...readText(block.text).matchAll(/采购包([\d一二三四五六七八九十]+)/g)].map(match=>match[1]))];
   return {documentId:doc.id,blockId:block.id,page:Number.isInteger(block.page)&&block.page>0?block.page:null,quote:block.text,package:block.scope?.package??(packages.length===1?packages[0]:packages.length>1?'mixed:'+block.id:null),phase:block.scope?.phase??null};
  });
 });
}

function resolveReference(value,blocks){
 if(!object(value)||typeof value.documentId!=='string'||typeof value.quote!=='string'||value.quote.trim().length<4)return null;
 if(value.blockId!==undefined&&(typeof value.blockId!=='string'||!value.blockId))return null;
 if(value.page!==undefined&&value.page!==null&&(!Number.isInteger(value.page)||value.page<=0))return null;
 const matches=blocks.filter(block=>block.documentId===value.documentId&&(value.blockId===undefined||block.blockId===value.blockId)&&(value.page===undefined||value.page===block.page)&&block.quote.includes(value.quote));
 if(matches.length!==1)return null;
 const block=matches[0];return {documentId:block.documentId,blockId:block.blockId,page:block.page,quote:value.quote};
}

export function buildSourceChecklist({report,documents}={}){
 const blocks=sourceBlocks(report,documents),items=[],seen=new Set();
 const append=(item,kind,extra={})=>{
  if(!object(item)||item.origin==='user-rule')return;
  const title=typeof (item.title||item.label)==='string'?(item.title||item.label):'',interpretation=typeof (item.interpretation||item.value)==='string'?(item.interpretation||item.value):'';
  const detail=extra.fields?Object.entries(extra.fields).map(([key,value])=>key+'：'+(Array.isArray(value)?value.join('；'):value)).join('\n'):'';
  const text=[interpretation,detail].filter(Boolean).join('\n');
  if(!title||!text||/企业.{0,8}(?:预计|测算|得分)|预计分数|满分假设|内部规则/.test(readText(title+text)))return;
  const rawRefs=array(item.references),references=rawRefs.map(ref=>resolveReference(ref,blocks));
  // A summary depending on an unlocated/evidence reference is not promoted by
  // silently dropping that reference. Original citation strings are immutable.
  if(!references.length||references.some(ref=>!ref))return;
  const safeRefs=distinctRefs(references),key=JSON.stringify([title,text,safeRefs,extra.scope]);if(seen.has(key))return;seen.add(key);
  items.push({id:'source-'+hash(key),title:title.slice(0,160),...(typeof item.categoryId==='string'?{categoryId:item.categoryId}:{}),text:text.length>MAX_DESCRIPTION?text.slice(0,MAX_DESCRIPTION)+'（说明过长，完整事实与条件请核对以下原文。）':text,references:safeRefs,kind,...extra,...(text.length>MAX_DESCRIPTION?{omittedTextCharacters:text.length-MAX_DESCRIPTION}:{})});
 };
 for(const [group,kind] of Object.entries(GROUPS))for(const item of array(report?.analysis?.[group]))append(item,kind);
 // These existing local findings carry conditional branches which are not all
 // represented by overview/synthesis items. Do not promote pending AI text.
 for(const category of array(report?.categories))for(const item of array(category?.items)){
  if(!object(item)||item.source==='ai'&&item.reviewed!==true)continue;
  const rawRefs=array(item.references),references=rawRefs.map(ref=>resolveReference(ref,blocks));if(!references.length||references.some(ref=>!ref))continue;
  const source=readText(references.map(ref=>ref.quote).join('；'));
  const tax=stringValues(item.fields?.['税社保材料分支']).some(Boolean);
  const personnel=category.id==='personnel'&&/项目经理/.test(source)&&/注册|证书|建造师/.test(source);
  const performance=category.id==='performance'&&/同类项目|同类业绩/.test(source)&&/合同|验收|证明|签订|日期/.test(source);
  const bodyReferences=references.filter(ref=>requirementBody(ref.quote).trim()),body=readText(bodyReferences.map(ref=>requirementBody(ref.quote)).join('；'));
  const ordinary=CATEGORY_SOURCE[category.id]?.test(body);
  if(!tax&&!personnel&&!performance&&!ordinary)continue;
  const located=references.map(ref=>blocks.find(block=>block.documentId===ref.documentId&&block.blockId===ref.blockId)),documentIds=[...new Set(references.map(ref=>ref.documentId))],packages=[...new Set(located.map(block=>block.package).filter(value=>value!==null).map(String))],phases=[...new Set(located.map(block=>block.phase).filter(value=>value!==null))];
  const statedPackage=item.scope?.package??readText(item.fields?.['采购包范围']).match(/采购包([\d一二三四五六七八九十]+)/)?.[1];
  // A local composite can span blocks, but not borrow another document/package
  // or a conflicting phase. Unknown package stays unknown rather than guessed.
  if(documentIds.length!==1||packages.length>1||packages.some(value=>value.startsWith('mixed:'))||phases.length>1||item.scope?.mixedPackages===true||item.scope?.documentId&&item.scope.documentId!==documentIds[0]||statedPackage!==undefined&&packages.length&&String(statedPackage)!==packages[0]||item.scope?.phase&&phases.length&&item.scope.phase!==phases[0])continue;
  const fields=Object.fromEntries(Object.entries(object(item.fields)?item.fields:{}).filter(([key,value])=>!/^(?:AI候选|补充解读|证照比对)/.test(key)&&/分支|经理完整条件|证明材料|时间口径|逻辑关系|条件与例外|否定与限定|同类|日期|审查属性|适用主体|适用阶段|适用性|不满足后果/.test(key)&&(typeof value==='string'||Array.isArray(value)&&value.every(part=>typeof part==='string'))).map(([key,value])=>[key,Array.isArray(value)?[...value]:value]));
  const scope={documentId:documentIds[0],...(packages.length||statedPackage!==undefined?{package:packages[0]??String(statedPackage)}:{}),...(phases.length||item.scope?.phase?{phase:phases[0]??item.scope.phase}:{})};
  // Ordinary clauses are compared with their source body, not a local
  // explanation that may repeat an adjacent project number or metadata row.
  // Special composite conditions keep their full local branch explanation.
  const ordinaryClause=ordinary&&!tax&&!personnel&&!performance;
  // The original body already preserves its conditions. These two local
  // fields duplicate an entire joined unit, including unrelated metadata.
  const comparisonFields=ordinaryClause?Object.fromEntries(Object.entries(fields).filter(([key])=>!['条件与例外','否定与限定'].includes(key))):fields;
  append({...item,categoryId:category.id,...(ordinaryClause?{interpretation:body,references:bodyReferences}:{})},'condition',{fields:comparisonFields,scope});
 }
 // Return every located item. The caller can budget the request explicitly;
 // checklist size must never silently replace the full selected source text.
 return items;
}

function stringValues(value){
 if(typeof value==='string')return [value];
 if(Array.isArray(value))return value.flatMap(stringValues);
 return object(value)?Object.values(value).flatMap(stringValues):[];
}
function modelItems(categories,findings){
 return [...array(findings),...array(categories).flatMap(card=>array(card?.findings).map(item=>object(item)?{...item,categoryId:item.categoryId||card.id}:item))].filter(object);
}
function description(item){return [typeof item.interpretation==='string'?item.interpretation:'',...stringValues(item.fields)].filter(Boolean).join('；');}
function itemReferences(item,blocks){
 const refs=Array.isArray(item.references)?item.references:[item];
 const located=refs.map(ref=>resolveReference(ref,blocks));
 return located.some(ref=>!ref)?[]:distinctRefs(located);
}
function overlap(first,second){return first.documentId===second.documentId&&first.blockId===second.blockId&&(first.quote.includes(second.quote)||second.quote.includes(first.quote));}
function numericTokens(value){
 const text=String(value||'').normalize('NFKC'),tokens=[];
 const pattern=/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
 for(const match of text.matchAll(pattern)){
  const parts=match[0].replace(/,/g,'').replace(/^\+/,'').split('.'),integer=parts[0].replace(/^(-?)0+(?=\d)/,'$1'),fraction=(parts[1]||'').replace(/0+$/,'');
  const number=integer+(fraction?'.'+fraction:'');
  const suffix=text.slice(match.index+match[0].length).match(/^\s*(个百分点|百分比|日历天|日历日|工作日|亿元|万元|千元|个月|mm|cm|m2|m3|%|‰|元|万|亿|分|年|月|日|天|级|个|项|份|人)/)?.[1];
  const unit=suffix==='百分比'?'%':suffix||(/百分之\s*$/.test(text.slice(0,match.index))?'%':'');
  // Keep explicit units. No inference that a bare decimal is a percentage,
  // or that equal digits in yuan/ten-thousand-yuan describe the same amount.
  tokens.push(JSON.stringify([number,unit]));
 }
 return tokens;
}
function explanationCovers(item,explanation){
 if(readText(explanation).length<6)return false;
 const source=readText(item.references.map(ref=>ref.quote).join('；')),text=readText(explanation),numbers=new Set(numericTokens(explanation));
 // A whole table quotation containing a quality percentage cannot establish
 // that the explanation covered quality rather than payment or plan scoring.
 if(/质量/.test(item.title+item.text)&&/分项工程.*一次验收/.test(source)){
  const rates=[...source.matchAll(/一次验收通过率(\d+(?:\.\d+)?)%/g)].map(match=>match[1]);
  if(!/质量.{0,12}合格/.test(text)||!/分项工程/.test(text)||!/一次验收/.test(text)||!rates.every(rate=>numericTokens(rate+'%').every(token=>numbers.has(token))))return false;
 }
 if(item.kind==='gap'&&!/待|缺口|未读|缺失|不完整|澄清|核验|核对/.test(text))return false;
 return numericTokens(item.text).every(token=>numbers.has(token));
}

const splitClaims=text=>String(text||'').split(/[。；;\n]/).map(readText).filter(Boolean);
const cautious=text=>/待(?:核验|核对|确认|澄清)|未(?:明确|定义|明示)|不(?:能|应|得).{0,12}(?:推定|认定|新增|要求|限定)|不作为.{0,8}必交|不当必交|是否|先核|建议|优先检索|不排除/.test(text);
const feeWords=/代理(?:服务)?费|代理服务费用|服务费|见证费|收费|(?:成交|中标)(?:后)?(?:服务)?费用/;
const socialProof=/(?:社保|社会保险|社会保障资金?)(?:缴纳)?证明/;
const deniesHardConsequence=text=>/(?:不|不得|不能|不应)(?:作为|构成|属于|认定为|视为).{0,12}(?:无效|废标|否决)/.test(text);
function feeConsequence(text){
 return /(?:拒不缴纳|拒缴|未缴|不缴|不支付|未支付|不付|未付).{0,60}(?:通知书|签订合同|签署合同|无效|处罚|法律责任|合同责任)/.test(text)||/(?:缴纳|支付|缴清|结清|付费).{0,35}(?:方可|才能|后).{0,15}(?:领取|发放|发出|签订|签署).{0,8}(?:通知书|合同)/.test(text);
}
function personalProofRequired(text){
 return splitClaims(text).some(part=>!/(?:无需|不要求|未要求|不需|不必).{0,25}(?:社保|社会保障|社会保险)/.test(part)&&(/(?:项目经理|建造师|拟派人员).{0,45}(?:提供|提交|须|应).{0,20}(?:社保|社会保险|社会保障).{0,8}证明/.test(part)||/(?:社保|社会保险|社会保障).{0,8}证明.{0,30}(?:项目经理|建造师|拟派人员)/.test(part)));
}
function groupedSources(blocks){
 const map=new Map();for(const block of blocks){const key=JSON.stringify([block.documentId,block.package,block.phase]);if(!map.has(key))map.set(key,[]);map.get(key).push(block);}return [...map.values()];
}

function priceFormulaTerms(value){
 const text=readText(value).replace(/[×xX]/g,'*').replace(/[∕÷]/g,'/'),terms=[];
 // Recognize a deliberately small grammar. In particular, never remove all
 // parentheses: 基准价/(评审报价*100) is not (基准价/评审报价)*100.
 const pattern=/(?:\((?:评审)?基准价\/评审报价\)|(?:评审)?基准价\/评审报价)\*(\d+(?:\.\d+)?)(\*价格权重|\*(\d+(?:\.\d+)?)%)?/g;
 for(const match of text.matchAll(pattern)){
  const before=text.slice(0,match.index),after=text.slice(match.index+match[0].length);
  if(/[\d.*\/+\-^(]$/.test(before)||after&&!/^[。；;,，|]/.test(after))continue;
  const assertionPrefix=before.split(/[。；;,，|]/).at(-1);
  if(/不要|不能|不得|不应|错误|有误|误写|避免|不采用/.test(assertionPrefix))continue;
  const factor=Number(match[1]);if(!Number.isFinite(factor)||factor<=0)continue;
  terms.push({factor,weight:match[2]==='*价格权重'?'symbol':match[3]!==undefined?Number(match[3])/100:null});
 }
 return [...new Map(terms.map(term=>[JSON.stringify(term),term])).values()];
}
function sourcePriceMaximum(quote,maxScore){
 const text=readText(quote),literal=maxScore.toString().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 if(new RegExp('(?:价格|报价)(?:部分|评分|得分|分)?(?:的)?(?:满分|分值|最高得分)(?:为|:)?'+literal+'(?:\\.0+)?分').test(text))return true;
 return quote.split('\n').some(line=>{
  const cells=line.split('|').map(readText),kind=cells.findIndex(cell=>/^(?:主观|客观)$/.test(cell));
  return kind>1&&cells.slice(0,2).some(cell=>/价格|报价/.test(cell))&&/^\d+(?:\.\d+)?$/.test(cells[kind-1])&&Number(cells[kind-1])===maxScore;
 });
}
function declaredPriceWeights(refs){
 const weights=[];
 for(const ref of refs){
  const text=readText(ref.quote);
  for(const match of text.matchAll(/价格权重/g)){
   const after=text.slice(match.index+match[0].length);
   // The formula's symbolic operand is not a declaration. Any other following
   // wording must be an entire supported numeric value, never a guessed prefix.
   if(!after||/^[。；;,，)*/+\-]/.test(after))continue;
   const declaration=after.match(/^(?:为|是|:|=|\|)?(\d+(?:\.\d+)?)(%)?(?=$|[。；;,，|])/);
   if(!declaration)return null;
   const weight=Number(declaration[1])/(declaration[2]?100:1);
   if(!Number.isFinite(weight)||weight<0||weight>1)return null;
   weights.push(weight);
  }
 }
 return weights;
}
function sourcePriceRules(report,blocks){
 return array(report?.analysis?.scoring?.items).flatMap(item=>{
  if(!object(item)||!['价格','报价'].includes(item.group)||!Number.isFinite(item.maxScore)||item.maxScore<=0||item.scope?.mixedPackages)return [];
  const refs=array(item.references).map(ref=>resolveReference(ref,blocks));if(!refs.length||refs.some(ref=>!ref))return [];
  const ids=[...new Set(refs.map(ref=>ref.documentId))];if(ids.length!==1||item.scope?.documentId&&item.scope.documentId!==ids[0])return [];
  const located=refs.map(ref=>blocks.find(block=>block.documentId===ref.documentId&&block.blockId===ref.blockId)),packages=[...new Set(located.map(block=>block.package).filter(value=>value!==null))],phases=[...new Set(located.map(block=>block.phase).filter(value=>value!==null))];
  if(packages.length>1||packages.some(value=>String(value).startsWith('mixed:'))||phases.length>1||item.scope?.package!==undefined&&packages.length&&String(item.scope.package)!==String(packages[0]))return [];
  const terms=[...new Map(refs.flatMap(ref=>priceFormulaTerms(ref.quote)).map(term=>[JSON.stringify(term),term])).values()];
  if(terms.length!==1||terms[0].weight!=='symbol'||!refs.some(ref=>sourcePriceMaximum(ref.quote,item.maxScore))||!refs.some(ref=>/评审报价最低.{0,15}基准价|最低.{0,15}评审报价.{0,15}基准价/.test(readText(ref.quote))))return [];
  const weight=item.maxScore/terms[0].factor;if(!(weight>0&&weight<=1))return [];
  const explicitWeights=declaredPriceWeights(refs);
  if(!explicitWeights||explicitWeights.some(value=>Math.abs(value-weight)>1e-8))return [];
  return [{documentId:ids[0],package:item.scope?.package??packages[0]??null,maxScore:item.maxScore,weight,references:distinctRefs(refs)}];
 });
}
function priceRulesForClaim(item,blocks,priceRules){
 const rawRefs=Array.isArray(item.references)?item.references:[item],ids=[...new Set(rawRefs.map(ref=>ref?.documentId).filter(id=>typeof id==='string'))];
 if(ids.length!==1||item.scope?.mixedPackages||item.scope?.documentId&&item.scope.documentId!==ids[0])return [];
 const resolved=rawRefs.map(ref=>resolveReference(ref,blocks)),allLocated=resolved.length>0&&resolved.every(Boolean);
 const located=allLocated?resolved.map(ref=>blocks.find(block=>block.documentId===ref.documentId&&block.blockId===ref.blockId)):[];
 const packages=[...new Set(located.map(block=>block.package).filter(value=>value!==null).map(String))],declared=item.scope?.package;
 if(packages.length>1||packages.some(value=>value.startsWith('mixed:'))||declared!==undefined&&(String(declared).startsWith('mixed:')||packages.length&&String(declared)!==packages[0]))return [];
 const pages=[...new Set((allLocated?resolved:rawRefs).map(ref=>ref?.page).filter(page=>page!==undefined))];
 if(!allLocated&&!pages.length)return [];
 if(!packages.length){
  // Wrong/unknown locations may support only an independent same-page hint.
  // They cannot select a procurement package from an ambiguous source page.
  const nearby=blocks.filter(block=>block.documentId===ids[0]&&(!pages.length||pages.includes(block.page)));
  const nearbyPackages=[...new Set(nearby.map(block=>block.package).filter(value=>value!==null).map(String))];
  if(nearbyPackages.length>1||nearbyPackages.some(value=>value.startsWith('mixed:')))return [];
 }
 const procurementPackage=packages[0]??(declared!==undefined?String(declared):undefined);
 return priceRules.filter(rule=>rule.documentId===ids[0]&&(!pages.length||pages.every(page=>rule.references.some(ref=>ref.page===page)))&&(procurementPackage===undefined||String(rule.package)===procurementPackage));
}

export function reviewWebContent({report,documents,categories=[],modelOutputs={},findings=[],unverifiedItems=[]}={}){
 const blocks=sourceBlocks(report,documents),sourceChecklist=buildSourceChecklist({report,documents}),items=modelItems(categories,findings),verified=items.map(item=>({item,references:itemReferences(item,blocks),text:description(item)})),checks=[],seen=new Set();
 const add=(issue,title,message,references,categoryId,id)=>{
  const safeRefs=distinctRefs(references.map(ref=>resolveReference(ref,blocks)).filter(Boolean));if(!safeRefs.length)return;
  const key=JSON.stringify([issue,safeRefs]);if(seen.has(key)&&!id)return;seen.add(key);
  checks.push({id:id||'review-'+hash(key),title:title.slice(0,160),...(categoryId?{categoryId}:{}),issue,message:message.slice(0,MAX_DESCRIPTION),references:safeRefs});
 };
 for(const source of sourceChecklist){
  const covered=verified.some(candidate=>candidate.references.length&&source.references.every(ref=>candidate.references.some(other=>overlap(ref,other)))&&explanationCovers(source,candidate.text));
  if(!covered)add('source-not-covered',source.title,'本地已有可定位的事项，但本次模型未提供同时对应这些原文的有效条款及实际解读；保留待复核，标题、四项输出或整段引文不能代替内容覆盖。',source.references,source.categoryId,source.id);
 }
 // A fabricated or invalid finding must not turn a false "not found" into
 // an unreported omission. Preserve the actual waiver/condition in evidence;
 // the existence of a clause does not establish a positive obligation.
 for(const card of array(categories).filter(card=>object(card)&&card.status==='not-found')){
  const located=sourceChecklist.filter(item=>item.categoryId===card.id);
  if(located.length)add('source-absence-contradicted','模型未找到结论与原文不一致','模型将本类标为未找到，但本次采购原文已有相关条款。请按所引原文核对金额、时点、免除及适用条件；不能将本类判定为不存在，也不能把免除条款改成缴纳或提交义务。',located.flatMap(item=>item.references),card.id);
 }
 const priceRules=sourcePriceRules(report,blocks);
 for(const item of items.filter(item=>item.categoryId==='scoring')){
  const terms=priceFormulaTerms(description(item));if(!terms.length)continue;
  const rules=priceRulesForClaim(item,blocks,priceRules);
  if(rules.length!==1)continue;
  const rule=rules[0];
  for(const term of terms){
   const atBase=term.factor*(term.weight==='symbol'?rule.weight:term.weight===null?1:term.weight);
   if(!Number.isFinite(atBase)||Math.abs(atBase-rule.maxScore)<=1e-8*Math.max(1,rule.maxScore))continue;
   const score=Number(atBase.toPrecision(10));
   add('price-formula-mismatch','报价公式与原文满分代入不一致','本次真实评分原文同时载明价格公式、最低评审报价为基准价及满分'+rule.maxScore+'分。令基准价等于评审报价，按该满分推得同一价格权重，网页所写公式得到'+score+'分，与原文满分'+rule.maxScore+'分不一致，可能重复乘权重或改变系数。请逐项复核；这项数学差异不会修复网页错误引用，也不确认网页解读或企业得分。',rule.references,'scoring');
  }
 }
 const claims=[...verified.map(candidate=>({text:candidate.text,title:candidate.item.title||'',categoryId:candidate.item.categoryId,references:candidate.references,documentIds:[...new Set((Array.isArray(candidate.item.references)?candidate.item.references:[candidate.item]).map(ref=>ref?.documentId).filter(id=>typeof id==='string'))],fields:candidate.item.fields})),...array(unverifiedItems).filter(object).map(item=>({text:description(item),title:item.title||'',categoryId:item.categoryId,references:[],documentIds:[...new Set(array(item.references).map(ref=>ref?.documentId).filter(id=>typeof id==='string'))],fields:item.fields})),...array(categories).filter(object).map(card=>({text:card.summary||'',categoryId:card.id,references:[]})),...stringValues(modelOutputs).map(text=>({text,references:[]}))];
 const groups=groupedSources(blocks);
 const related=(claim,candidates)=>{
  if(claim.references.length)return candidates.filter(group=>claim.references.some(ref=>group.some(block=>ref.documentId===block.documentId&&ref.blockId===block.blockId)));
  if(claim.documentIds?.length){const matching=candidates.filter(group=>claim.documentIds.includes(group[0].documentId));return matching.length===1?matching:[];}
  return candidates.length===1?candidates:[];
 };
 const taxGroups=groups.filter(group=>group.some(block=>/依法免税|不(?:需要|需|用)缴纳社会保障/.test(readText(block.quote))&&/税收|纳税/.test(readText(block.quote))));
 const authorityGroups=groups.filter(group=>group.some(block=>/授权.{0,20}(?:评标委员会|磋商小组|评审委员会).{0,30}确定.{0,15}(?:成交|中标)/.test(readText(block.quote)))&&group.some(block=>/(?:采购人|采购单位)应当.{0,90}确定成交/.test(readText(block.quote))&&!/授权/.test(readText(block.quote))));
 const performanceGroups=groups.filter(group=>group.some(block=>/同类项目(?:合同|业绩|案例)/.test(readText(block.quote))));
 const personnelGroups=groups.filter(group=>group.some(block=>/项目经理/.test(readText(block.quote))&&/注册|证书/.test(readText(block.quote))));
 const feeGroups=groups.filter(group=>group.some(block=>feeWords.test(readText(block.quote))&&/成交|中标/.test(readText(block.quote))&&/承担|支付|收取/.test(readText(block.quote)))||sourceChecklist.some(item=>feeWords.test(item.title)&&item.references.some(ref=>group.some(block=>block.blockId===ref.blockId&&block.documentId===ref.documentId))));
 for(const claim of claims){
  const parts=splitClaims(claim.text);
  const consequence=stringValues(claim.fields?.['不满足后果']).map(readText);
  const assertedHard=consequence.some(part=>/无效|废标|否决|不予接受|不予受理|不得参加/.test(part)&&!deniesHardConsequence(part)&&!cautious(part)&&!/可能|风险|建议|核对/.test(part));
  const explicitHard=claim.references.some(ref=>splitClaims(ref.quote).some(part=>/无效|废标|否决|不予接受|不予受理|不得参加/.test(part)&&!deniesHardConsequence(part)));
  if(claim.references.length&&assertedHard&&!explicitHard)add('hard-consequence-added','模型新增否决后果待复核','模型将不满足后果写成确定的废标或无效，但当前所引条款尚未定位该硬性后果。请另引真实否决依据；不能仅由“须提交／须缴纳”推定为原文明示的直接废标项。',claim.references,claim.categoryId);
  for(const group of related(claim,taxGroups))if(parts.some(part=>!cautious(part)&&!/免税|免缴|不需要缴|无需缴|例外|按适用|实际缴纳/.test(part)&&/(?:省外注册|省外(?:供应商|企业)|非[^，,。；;]{1,8}注册).{0,18}(?:需要|需|须|应|必须|均|一律).{0,55}(?:纳税|税收|社保|社会保障|缴纳).{0,16}(?:证明|材料)/.test(part))){
   const evidence=group.filter(block=>/依法免税|不(?:需要|需|用)缴纳社会保障/.test(readText(block.quote)));add('tax-branch-scope','税收社保分支范围待复核','原文按承诺制、实际缴纳与免税免缴等条件分支；模型把省外注册直接写成普通缴纳证明义务，可能遗漏或收窄适用条件。请依真实缴纳地及例外核对，不据此确认企业满足或不满足。',evidence,'qualification');
  }
  for(const group of related(claim,authorityGroups))if(!cautious(readText(claim.text))&&parts.some(part=>/授权.{0,20}(?:磋商小组|评标委员会|评审委员会).{0,20}确定.{0,15}(?:成交|中标)|(?:仅由|直接由|由)(?:磋商小组|评标委员会|评审委员会)(?:直接)?确定.{0,15}(?:成交|中标)/.test(part))){
   const evidence=group.filter(block=>/授权.{0,20}(?:评标委员会|磋商小组|评审委员会).{0,30}确定.{0,15}(?:成交|中标)|(?:采购人|采购单位)应当.{0,90}确定成交/.test(readText(block.quote)));add('determination-scope','定标主体并列表述待复核','同一来源范围存在授权委员会确定及采购人按候选顺序确定的并列表述；模型给出单一确定主体，尚未交代两处适用关系。请核对有效条款，不自动认定冲突已解决。',evidence,'method');
  }
  for(const group of related(claim,performanceGroups))for(const part of parts){
   if(cautious(part))continue;
   const qualifier=part.match(/同类([^，,。；;]{1,20}?)项目(?:合同|案例|业绩)?/)?.[1];
   if(!qualifier||/^(?:型|类|工程|的)$/.test(qualifier)||!/(?:需|须|必须|未提供|补充|仅|才|证明|合同|验收)/.test(part))continue;
   const source=group.map(block=>readText(block.quote)).join('；');if(source.includes('同类'+qualifier+'项目')||new RegExp('同类(?:项目|业绩)[^。；]{0,16}(?:指|为|限于|包括)[^。；]{0,16}'+qualifier.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(source))continue;
   add('performance-scope','同类业绩具体范围待复核','所引业绩原文仅列同类项目，模型又限定了具体项目类型。该收窄尚无本条依据；应核对正式定义或澄清，不把未提供该具体类型自动认定为企业失分。',group.filter(block=>/同类项目(?:合同|业绩|案例)/.test(readText(block.quote))),'performance');
  }
  for(const group of related(claim,personnelGroups)){
   if(group.some(block=>personalProofRequired(block.quote)))continue;
   const corporateOnly=text=>/供应商|投标人|企业|公司/.test(text)&&!/项目经理|建造师|拟派人员|个人/.test(text);
   const requiredField=object(claim.fields)&&Object.entries(claim.fields).some(([key,value])=>/证明材料|提交材料|资格材料/.test(key)&&stringValues(value).some(text=>socialProof.test(readText(text))&&!cautious(readText(text))&&!corporateOnly(readText(text))));
   const personnelContext=claim.categoryId==='personnel'||/项目经理|建造师|拟派人员/.test(readText(claim.title));
   // A neighbouring enterprise obligation cannot inherit a manager mentioned
   // before a comma. Personnel-specific headings can still govern their list.
   const personalParts=String(claim.text).split(/[。；;，,\n]/).map(readText).filter(Boolean);
   const explicitObligation=personalParts.some(part=>socialProof.test(part)&&!cautious(part)&&!corporateOnly(part)&&!/无需|不要求|不必|不是.{0,15}(?:经理|人员|个人)/.test(part)&&/(?:须|需|应|必须|提交|提供)/.test(part)&&(personnelContext||/项目经理|建造师|拟派人员/.test(part)));
   if(personnelContext&&requiredField||explicitObligation)add('personnel-proof-added','人员社保证明义务待复核','当前已定位经理资格条款列注册、证书或任职条件，未在该范围列所述个人社保证明义务；模型将其列为必交材料。企业税社保不能直接替代个人要求，仍须核对其他条款及附件，不能据此判企业失败。',group.filter(block=>/项目经理/.test(readText(block.quote))&&/注册|证书/.test(readText(block.quote))),'personnel');
  }
  for(const group of related(claim,feeGroups)){
   if(group.some(block=>splitClaims(block.quote).some(part=>feeWords.test(part)&&feeConsequence(part))))continue;
   const feeContext=feeWords.test(readText(claim.title+claim.text))||claim.references.some(ref=>group.some(block=>overlap(ref,block)&&feeWords.test(readText(block.quote))));
   if(feeContext&&parts.some(part=>!cautious(part)&&feeConsequence(part)&&(!/保证金/.test(part)||feeWords.test(part))))add('fee-consequence-added','成交费用新增后果待复核','当前已读费用条款支持承担费用，但未在该费用出处定位模型所述拒缴罚则或通知书、签约前置后果。请另核真实约定及完整合同；不凭常识补充责任，也不宣称其他条款不存在。',group.filter(block=>feeWords.test(readText(block.quote))&&/承担|支付|收取/.test(readText(block.quote))).length?group.filter(block=>feeWords.test(readText(block.quote))&&/承担|支付|收取/.test(readText(block.quote))):sourceChecklist.filter(item=>feeWords.test(item.title)).flatMap(item=>item.references),'payment');
  }
 }
 // Bound the display only after explicit semantic differences have priority.
 // Stable partition retains the original order within each group, leaves all
 // inputs untouched and counts every hidden check rather than dropping it.
 const ordered=[...checks.filter(check=>check.issue!=='source-not-covered'),...checks.filter(check=>check.issue==='source-not-covered')];
 return {status:checks.length?'needs-review':'not-established',checks:ordered.slice(0,MAX_CHECKS),omittedCount:Math.max(0,checks.length-MAX_CHECKS),sourceChecklist};
}
