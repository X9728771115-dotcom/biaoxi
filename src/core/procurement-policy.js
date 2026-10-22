// Offline policy evidence support. Tender statements and external policy remain
// separate; this module never creates a rejection clause or decides bid validity.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readText as clean} from './analysis.js';
const unique=values=>[...new Set(values.filter(Boolean))];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function localCalendarDate(){const now=new Date();return`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
function date(value,label='日期'){
 if(typeof value!=='string'||!DATE.test(value))throw new Error(`${label}请使用有效YYYY-MM-DD日期`);
 const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||!d.toISOString().startsWith(value))throw new Error(`无效${label}`);return value;
}
function text(value,label,max=1000){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`无效或超长${label}`);return value;}
function keys(value,allowed,label){
 if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new Error(`无效${label}字段`);
 for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))if(descriptor.get||descriptor.set)throw new Error(`${label}只能包含JSON数据`);
}
function list(value,label,max){if(!Array.isArray(value)||value.length>max)throw new Error(`无效或过多${label}`);return value;}
function jsonData(value,depth=0){
 if(depth>12)throw new Error('政策包嵌套超限');
 if(value===null||['string','boolean'].includes(typeof value))return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){if(value.length>1500)throw new Error('政策包数组超限');value.forEach(v=>jsonData(v,depth+1));return;}
 if(!plain(value))throw new Error('政策包只能包含普通JSON数据');
 for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(value))){if(['__proto__','constructor','prototype'].includes(key)||descriptor.get||descriptor.set)throw new Error('政策包禁止代码或原型字段');jsonData(descriptor.value,depth+1);}
}
export function validatePolicyPackage(pkg){
 jsonData(pkg);if(Buffer.byteLength(JSON.stringify(pkg),'utf8')>2*1024*1024)throw new Error('政策包不能超过2MB');
 keys(pkg,['schemaVersion','version','checkedAt','sources','catalog','notes','greenMaterial'],'政策包');
 if(pkg.schemaVersion!==1)throw new Error('不支持的政策包schemaVersion');text(pkg.version,'政策版本',100);date(pkg.checkedAt,'核对日期');
 const sources=list(pkg.sources,'政策来源',50),sourceIds=new Set();if(!sources.length)throw new Error('政策包缺官方来源');
 for(const source of sources){
  keys(source,['id','title','url','publishedAt','issuedAt','effectiveFrom','checkedAt','sha256','localFile','pageCount'],'政策来源');
  text(source.id,'来源编号',100);if(sourceIds.has(source.id))throw new Error('政策来源编号重复');sourceIds.add(source.id);
  text(source.title,'来源标题',500);text(source.url,'来源网址',2000);
  let url;try{url=new URL(source.url);}catch{throw new Error('无效政策网址');}
  if(url.protocol!=='https:'||!url.hostname.endsWith('.gov.cn')||url.username||url.password)throw new Error('政策网址须为官方HTTPS政府网址');
  for(const field of ['publishedAt','effectiveFrom','checkedAt'])date(source[field],field);if(source.issuedAt!==undefined)date(source.issuedAt,'发文日期');
  if(source.checkedAt>pkg.checkedAt)throw new Error('来源核对日期不能晚于政策包核对日期');
  if(!/^[a-f0-9]{64}$/.test(source.sha256))throw new Error('来源SHA256无效');
  if(source.localFile!==undefined){text(source.localFile,'原件路径',300);if(!/^official\/[A-Za-z0-9._-]+$/.test(source.localFile))throw new Error('无效原件路径');}
  if(source.pageCount!==undefined&&(!Number.isInteger(source.pageCount)||source.pageCount<1||source.pageCount>1000))throw new Error('无效来源页数');
 }
 const entries=list(pkg.catalog,'品目',1000),ids=new Set();if(!entries.length)throw new Error('政策包缺品目清单');
 for(const item of entries){
  keys(item,['id','categoryCode','name','policyType','policyKind','standard','scope','sourceId','sourcePage','sourceTable','sourceRow','clause','group','ordinal','aliases','excludedTerms','conditions'],'品目');
  text(item.id,'品目编号',100);if(ids.has(item.id))throw new Error('品目编号重复');ids.add(item.id);
  text(item.categoryCode,'品目代码',100);text(item.name,'品目名称',500);text(item.standard,'标准',3000);text(item.scope,'适用范围',3000);
  if(!['energy','environment','greenMaterial'].includes(item.policyType)||!['requirement','preference'].includes(item.policyKind))throw new Error('无效政策类别');
  if(item.policyType==='environment'&&item.policyKind!=='preference')throw new Error('环境标志清单不得改为强制采购');
  if(!sourceIds.has(item.sourceId))throw new Error('品目引用不存在的政策来源');
  for(const field of ['sourcePage','sourceTable','sourceRow','ordinal'])if(item[field]!==undefined&&(!Number.isInteger(item[field])||item[field]<1||item[field]>10000))throw new Error('品目来源定位无效');
  if(!item.sourcePage)throw new Error('品目缺来源页码');
  const src=sources.find(s=>s.id===item.sourceId);if(src.pageCount&&item.sourcePage>src.pageCount)throw new Error('品目页码超过官方原件');
  for(const field of ['aliases','excludedTerms'])list(item[field],field,100).forEach(v=>text(v,field,300));
  for(const field of ['clause','group'])if(item[field]!==undefined)text(item[field],field,300);
  if(item.conditions!==undefined){keys(item.conditions,['buildingStructure'],'适用条件');if(!['钢结构','装配式混凝土结构'].includes(item.conditions.buildingStructure))throw new Error('不支持的结构适用条件');}
 }
 list(pkg.notes??[],'政策说明',30).forEach(v=>text(v,'政策说明',3000));
 const g=pkg.greenMaterial;keys(g,['sourceId','citiesSourceId','authoritySourceId','effectiveFrom','cities','projectTypes','optionalCategoryRatio','withinCategoryRatio'],'绿色建材规则');
 for(const field of ['sourceId','citiesSourceId','authoritySourceId'])if(!sourceIds.has(g[field]))throw new Error('绿色建材规则来源不存在');date(g.effectiveFrom,'绿色建材生效日期');
 if(g.optionalCategoryRatio!==0.4||g.withinCategoryRatio!==0.8)throw new Error('不支持改变官方小类40%和同类80%计算口径');
 const cityKeys=new Set();for(const city of list(g.cities,'实施城市',500)){keys(city,['province','name','ordinal'],'城市');text(city.province,'省份',100);text(city.name,'城市',100);if(!Number.isInteger(city.ordinal)||city.ordinal<1||city.ordinal>500)throw new Error('城市序号无效');const key=city.province+city.name;if(cityKeys.has(key))throw new Error('实施城市重复');cityKeys.add(key);}
 list(g.projectTypes,'项目类型',50).forEach(v=>text(v,'项目类型',100));
 return structuredClone(pkg);
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const DEFAULT_POLICY_PACKAGE=freeze(validatePolicyPackage(JSON.parse(fs.readFileSync(new URL('../../assets/policies/cn-gpp-2019-2025.1.json',import.meta.url),'utf8'))));
function sourcesFrom(documents){
 const output=[];
 for(const document of documents||[]){if(document.role==='evidence')continue;const extraction=document.extraction||document;
  for(const block of extraction.blocks||[]){
   const base={documentId:document.id||extraction.id,blockId:block.id,fileName:document.fileName||extraction.fileName,page:block.page??null,section:block.section||'',...(block.sheet?{sheet:block.sheet}:{})};
   if(Array.isArray(block.tableRows)&&block.tableRows.length){
    for(let index=0;index<block.tableRows.length;index++){const row=block.tableRows[index],cells=Array.isArray(row)?row:row.cells||[];const cellStrings=cells.map(cell=>typeof cell==='object'?String(cell.displayValue??cell.formatted??cell.value??''):String(cell??''));
     const quote=typeof row.text==='string'?row.text:cellStrings.join(' | ');if(!quote.trim())continue;
     output.push({...base,page:row.page??base.page,rowStart:row.rowStart??row.row??(block.rowStart!==undefined?block.rowStart+index:undefined),rowEnd:row.rowEnd??row.rowStart??row.row??(block.rowStart!==undefined?block.rowStart+index:undefined),quote,cells:cellStrings,headers:row.headers||block.tableHeaders||[],table:true});
    }
    // Paragraph text can carry a policy clause omitted from the table cells.
    if(block.text&&!(block.tableRows||[]).some(row=>(row.text||'').includes(block.text)))output.push({...base,quote:block.text,paragraph:true});
   }else if(block.text?.trim()){
    for(const quote of block.text.split(/\n+/).filter(v=>v.trim()))output.push({...base,...(block.rowStart!==undefined?{rowStart:block.rowStart,rowEnd:block.rowEnd??block.rowStart}:{}),quote,cells:(block.cells||[]).map(c=>typeof c==='object'?String(c.displayValue??c.value??''):String(c)),headers:block.tableHeaders||[],table:block.kind==='table'});
   }
  }
 }
 return output;
}
const sourceView=s=>Object.fromEntries(Object.entries(s).filter(([key,value])=>!['cells','headers','table','paragraph'].includes(key)&&value!==undefined));
const labelValue=(quote,labels)=>quote.match(new RegExp(`(?:${labels})[：:]\\s*([^；;|，,\\n]+)`))?.[1]?.trim()||null;
// Original evidence identifiers are whole tokens, never prefixes of another
// model, certificate number or legal entity. Preserve whitespace boundaries.
function boundedOriginalValue(quote,value){
 if(!value)return false;const q=String(quote).normalize('NFKC'),v=String(value).normalize('NFKC').trim();
 const identifierChar=character=>Boolean(character)&&/[\p{L}\p{N}_.\/+\-]/u.test(character);
 let offset=0;while(offset<=q.length){const at=q.indexOf(v,offset);if(at<0)return false;if(!identifierChar(q[at-1])&&!identifierChar(q[at+v.length]))return true;offset=at+v.length;}
 return false;
}
function originalFields(quote){
 return String(quote).normalize('NFKC').split(/[；;|\n]/).flatMap(part=>{
  const field=part.trim().match(/^(?:\d+[.、]\s*)?([^：:]+)[：:]\s*(.*)$/);return field?[{name:clean(field[1]),value:field[2].trim()}]:[];
 });
}
const fieldContains=(field,value)=>field.value.split(/[、,，;；|]/).some(part=>clean(part)===clean(value));
function labeledOriginalValue(quote,value,labels){
 const allowed=labels.split('|'),fields=originalFields(quote),related=fields.filter(field=>allowed.some(label=>field.name.endsWith(label)));
 // Labels are entire field names. Qualified/negated labels do not silently
 // become positive fields; a matching value under one is not positive proof.
 if(related.some(field=>!allowed.includes(field.name)&&fieldContains(field,value)))return false;
 if(related.length)return related.some(field=>allowed.includes(field.name)&&fieldContains(field,value));
 return boundedOriginalValue(quote,value);
}
const MODEL_FIELDS=['覆盖型号','认证范围','覆盖范围','规格型号','产品型号','认证型号','型号'];
function originalModelValue(quote,value){
 const fields=originalFields(quote),related=fields.filter(field=>MODEL_FIELDS.some(label=>field.name.endsWith(label)));
 if(related.some(field=>!MODEL_FIELDS.includes(field.name)&&fieldContains(field,value)))return false;
 const coverage=related.filter(field=>['覆盖型号','认证范围','覆盖范围'].includes(field.name));
 if(coverage.length)return coverage.some(field=>fieldContains(field,value));
 if(related.length)return related.some(field=>MODEL_FIELDS.includes(field.name)&&fieldContains(field,value));
 return boundedOriginalValue(quote,value);
}
const greenNegative=q=>/(?:不|未|未能|尚未|尚不)(?:符合|满足|通过)|不合格|未达标|不达标|(?:检测|检验)失败|结论[：:]?(?:不通过|失败)/.test(q);
function greenClaimReview(quote,product,item){
 let affirmative=false,ambiguous=false,activeModels=null;
 // Accept complete affirmative clauses, rather than searching for a verb
 // embedded in arbitrary modal or qualified language. Other wording is pending.
 const grammar=/^(?:(?:检测|检验)?(?:结论|结果)[：:])?(?:(?:本|该)(?:产品|型号|样品))?(?:完全)?(?:符合|满足)《?绿色建筑和绿色建材政府采购需求标准(?:\(2025年版\))?》?第([\d.]+)条(?:的)?(?:全部|所有)适用(?:技术)?指标$/;
 for(const part of String(quote).normalize('NFKC').split(/[。；;\n]/)){
  const claim=clean(part),modelField=originalFields(part).find(field=>MODEL_FIELDS.includes(field.name));
  if(modelField)activeModels=modelField.value.split(/[、,，]/).map(clean);
  if(!claim.includes('绿色建筑和绿色建材政府采购需求标准')||!/(?:符合|满足)/.test(claim))continue;
  const match=claim.match(grammar);
  if(!match||match[1]!==item.clause||(activeModels&&!activeModels.includes(clean(product.model))))ambiguous=true;
  else affirmative=true;
 }
 return{affirmative:affirmative&&!ambiguous&&!greenNegative(clean(quote)),ambiguous};
}
const greenConclusion=(quote,product,item)=>greenClaimReview(quote,product,item).affirmative;
const ACCESSORY=/^(?:支架|底座|保护套|替换件|连接线|电源线|插座|包装箱|配套附件)/;
function productMention(q,term,item){
 let at=q.indexOf(term);while(at>=0){
  if(!ACCESSORY.test(q.slice(at+term.length))||/(?:支架|底座|保护套|替换件|连接线|电源线|包装箱|附件)/.test(item.name))return true;
  at=q.indexOf(term,at+term.length);
 }
 return false;
}
// A replacement row can contain both old objects and newly supplied materials.
// Keep its exact quoted row, but search only the remaining procurement spans.
function procurementSpans(name,features){
 const action=/(?:重新安装|更换为|换装|新装|安装|采购|新增|新做|更新为|改换)/;
 const removed=/(?:拆除|拆卸|拆旧|移除)/;
 if(!removed.test(name+' '+features))return{searchText:name+' | '+features,newName:null};
 const split=value=>value.split(/(?=重新安装|更换为|换装|新装|安装|采购|新增|新做|更新为|改换|拆除|拆卸|拆旧|移除)/).filter(Boolean);
 const featureParts=split(features),newParts=featureParts.filter(part=>action.test(part)&&!removed.test(part));
 const neutralParts=featureParts.filter(part=>!action.test(part)&&!removed.test(part));
 const newNames=split(name).filter(part=>action.test(part)&&!removed.test(part));
 if(removed.test(name)&&!newParts.length&&!newNames.length)return null;
 // Without an explicit new action, retain only substantive feature text before
 // an incidental demolition instruction (e.g. a roof material specification).
 const substantive=neutralParts.filter(part=>clean(part).length>15&&!/^(?:\d+[.:])?(?:名称|材质|型号|规格)[：:]/.test(clean(part)));
 const included=newParts.length||newNames.length?[...newParts,...newNames]:substantive;
 if(!included.length)return null;
 const first=newParts[0]||newNames[0];
 const newName=first?clean(first).replace(/^(?:重新安装|更换为|换装|新装|安装|采购|新增|新做|更新为|改换)/,'').split(/[；;，,。|]/)[0]:null;
 return{searchText:included.join(' | '),newName};
}
// A named owner-supplied item or an existing opening is not a bidder
// product purchase. Retain the exact original source separately from gaps.
function responsibilityEvidence(sources,pkg){
 const terms=unique(pkg.catalog.flatMap(item=>[item.name,...item.aliases])).sort((a,b)=>b.length-a.length),declarations=[],exclusions=[];
 for(const source of sources){
  for(const part of source.quote.split(/[。；;，,\n|]/).map(clean).filter(Boolean)){
   const negated=/(?:不|非|不得|并非|不是)(?:由)?(?:建设单位|采购人|甲方|业主)|非甲供|不(?:属|是)?甲供/.test(part);
   const providedInstructions=/(?:建设单位|采购人|甲方|业主)(?:负责)?提供(?:的)?(?:技术|资料|图纸|要求|清单|标准|条件|信息|参数)/.test(part);
   const owner=!negated&&!providedInstructions&&/(?:建设单位|采购人|甲方|业主)(?:负责)?(?:自理|自行采购|供应|提供)|甲供/.test(part);
   const reserved=/(?:仅|只)(?:预留|负责预留)|不采购|不含[^。；;]{0,12}采购/.test(part);
   const opening=/(?:对|在)?(?:外|既有|原有)?窗[^。；;]{0,12}(?:进行)?开洞/.test(part);
   if(!owner&&!reserved&&!opening)continue;
   const matched=terms.filter(term=>part.includes(clean(term))).filter(term=>!terms.some(other=>other.length>term.length&&other.includes(term)&&part.includes(clean(other))));
   // Opening a window describes work to the existing object; it does not
   // transfer a neighbouring fan or other newly purchased product to the owner.
   const names=opening?matched.filter(term=>/窗/.test(term)):matched;
   for(const name of names){
    const reason=owner?'建设单位自理／甲供：原文由采购方供应或自理，本企业仅按原文承担配合、预留或安装职责，不生成该设备采购认证缺口':opening?'原文涉及对窗开洞及保护，不足以证明本企业采购新窗；不生成新窗采购认证缺口':'原文仅预留安装条件或明确不采购，不生成该设备采购认证缺口';
    declarations.push({name,documentId:source.documentId,section:source.section,blockId:source.blockId,scope:owner&&source.section&&!source.table&&!source.quote.includes('|')?'section':'block'});
    const existing=exclusions.find(item=>item.name===name&&item.reason===reason&&item.sources.some(ref=>ref.documentId===source.documentId&&ref.section===source.section));
    if(existing){if(!existing.sources.some(ref=>ref.blockId===source.blockId&&ref.quote===source.quote))existing.sources.push(sourceView(source));}
    else exclusions.push({name,reason,sources:[sourceView(source)]});
   }
  }
 }
 return{declarations,exclusions};
}
function bidderProcurement(candidate,source,declarations,pkg){
 const relevant=declarations.filter(item=>item.documentId===source.documentId&&(item.scope==='block'?item.blockId===source.blockId:item.section===source.section));
 if(!relevant.length)return candidate;
 let searchText=candidate.searchText||candidate.name||source.quote;
 for(const declaration of relevant){
  const name=clean(declaration.name);
  // A separate explicit bidder purchase remains visible, even in the same
  // section. A mere performance or installation condition does not revive it.
  const localParts=source.quote.split(/[。；;，,\n|]/).map(clean);
  const purchase=localParts.some(part=>part.includes(name)&&!/(?:不采购|不由|无需|无须|甲供|自理)/.test(part)&&(new RegExp(`(?:投标人|竞标人|承包人|供应商|施工单位).{0,12}(?:采购|购置|供应).{0,12}${name}|(?:采购|购置).{0,6}${name}`).test(part)));
  if(purchase)continue;
  searchText=searchText.replaceAll(declaration.name,'');
 }
 const ownName=clean(candidate.unknownName||candidate.name);
 if(ownName&&relevant.some(item=>ownName.includes(clean(item.name)))&&!pkg.catalog.some(item=>[item.name,...item.aliases].some(term=>productMention(clean(searchText),clean(term),item))))return null;
 return{...candidate,searchText};
}
function inventory(source){
 const quote=source.quote,headers=(source.headers||[]).map(clean),cells=source.cells||[],section=clean(source.section);
 const index=pattern=>headers.findIndex(h=>pattern.test(h));
 if(source.paragraph)return null;
 if(source.table){
  if(/资格|评分|评审|供应商基本|联系人|响应格式|投标格式|证明材料|采购人信息/.test(section))return null;
  const codedIndex=cells.findIndex(c=>/^\d{12}$/.test(clean(c))),coded=codedIndex>=0,featureIndex=index(/^项目特征描述$|^材料特征$|^技术参数与性能指标$/),isBoq=coded||(index(/^项目名称$/)>=0&&featureIndex>=0&&index(/^工程量$|^计量单位$/)>=0);
  let nameIndex=index(/^材料名称$|^产品名称$|^设备名称$|^货物名称$|^品名$/);
  const explicitProduct=nameIndex>=0;
  if(nameIndex<0&&isBoq)nameIndex=index(/^项目名称$/);
  if(nameIndex<0&&coded)nameIndex=codedIndex+1;
  // Supplier goods/material lists often call the product column 项目名称 and
  // omit engineering item codes/features. Require both context and real goods
  // columns; a generic project-name/form table is not a product inventory.
  const goodsTable=/(?:产品|材料)(?:清单|表)/.test(section)&&index(/^(?:规格型号|型号|制造商|生产厂家|生产商|生产企业)$/)>=0&&index(/^(?:单位|计量单位|数量|工程量)$/)>=0;
  if(nameIndex<0&&goodsTable)nameIndex=index(/^项目名称$/);
  if(nameIndex<0&&/(?:材料清单|材料表|产品清单|货物清单|设备清单|采购需求|技术参数)/.test(section))nameIndex=index(/^名称$/);
  if(nameIndex<0)return null;
  let name=cells[nameIndex]?.trim();if(!name)return null;
  const n=clean(name);
  if(/^(?:序号|名称|项目名称|材料名称|产品名称|设备名称|合计|总计|小计|无|不涉及|--?|工程量清单)$/.test(n)||headers[nameIndex]===n)return null;
  if(/措施|施工费|搬运费|运输费|保护费|生产费|设施费|环境保护费|文明施工费|施工增加|弃置|清理|操作平台|临时支撑|防护棚|机械.*进出场|施工排水|施工降水|脚手架|垂直运输|设施保护|吊装加固|胎\(模\)具|顶升|临时施工/.test(n))return null;
  const features=cells[featureIndex>=0?featureIndex:coded?codedIndex+2:3]||'';
  const spans=procurementSpans(n,clean(features));if(!spans)return null;
  if(isBoq&&!coded&&!features.trim())return null; // BOQ section/subsection title.
  const featureText=clean(features),explicitName=labelValue(featureText,'名称')?.split(/\d+[.:](?:材质|型号|规格|名称|有效高度)/)[0];
  let unknownName=name;
  if(isBoq){
   const first=featureText.match(/^(?:\d+[.:])?([^:(),，;；\d]{2,30})/);
   unknownName=spans.newName||explicitName||first?.[1]||name.replace(/更换|安装|新做|工程/g,'');
   if(explicitName&&clean(spans.searchText).includes(clean(explicitName)))unknownName=explicitName;
   if(/(?:支架|底座|保护套|替换件|连接线|电源线|包装箱|配套附件)$/.test(n))unknownName=name;
   if(/检测|检验|验收|勘察|设计|咨询|监理/.test(clean(unknownName)))return null;
   if(/施工|概况|质量要求|技术要求|改造$|防水工程/.test(clean(unknownName)))unknownName=null;
  }
  const modelIndex=index(/规格型号|型号|规格/),makerIndex=index(/制造商|生产厂家|生产商|生产企业/);
  const fieldScope=/拆除|拆卸|拆旧|移除/.test(n+featureText)?spans.searchText:quote;
  return{name,unknownName,model:modelIndex>=0?cells[modelIndex]?.trim()||null:labelValue(fieldScope,'型号规格|规格型号|产品型号|型号'),manufacturer:makerIndex>=0?cells[makerIndex]?.trim()||null:labelValue(fieldScope,'制造商|生产厂家|生产商|生产企业'),source,inventory:explicitProduct||!isBoq||Boolean(unknownName),searchText:isBoq?spans.searchText:name,isBoq};
 }
 if(/资格|评分|评审|响应格式|投标格式|证明材料/.test(section))return null;
 // Policy template lists cannot establish that each listed product is purchased.
 if(/不涉及|不适用|品目清单|目录|国家规定|凡属于|如(?:所投|采购)|若(?:所投|采购)|若涉及|如涉及/.test(quote))return null;
 if(!/采购|购置|供货|安装|更换|产品名称|材料名称|型号[：:]|规格[：:]/.test(quote)&&!/(?:材料清单|工程量清单|采购需求|技术参数)/.test(section))return null;
 return{name:labelValue(quote,'产品名称|材料名称|设备名称')||null,model:labelValue(quote,'规格型号|产品型号|型号'),manufacturer:labelValue(quote,'制造商|生产厂家|生产商|生产企业'),source,inventory:false};
}
function contextualProject(projectContext,sources){
 const text=sources.map(s=>s.quote).join('\n'),project={...projectContext};
 if(project.governmentProcurement===undefined&&/政府采购/.test(text))project.governmentProcurement=true;
 if(!project.projectDate){const raw=labelValue(text,'采购日期|公告发布日期|投标截止日期|开标时间');const match=raw?.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);if(match){try{project.projectDate=date(`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`);}catch{}}}
 if(!project.region)project.region=labelValue(text,'项目地点|建设地点|项目所在城市|实施地点');
 if(!project.projectType)project.projectType=labelValue(text,'项目类型|建筑类型');
 if(project.localImplementationConfirmed===undefined&&/本项目(?:已)?纳入政府采购支持绿色建材[^。；\n]*实施范围/.test(text))project.localImplementationConfirmed=true;
 return project;
}
function application(pkg,project,sources){
 const policy=s=>structuredClone(pkg.sources.find(x=>x.id===s)),baseGaps=[];
 if(project.governmentProcurement!==true&&project.governmentProcurement!==false)baseGaps.push('是否属于政府采购项目待核验');
 if(!project.projectDate)baseGaps.push('缺项目采购日期，分析日期不能替代项目适用日期');else{try{date(project.projectDate,'项目采购日期');}catch{baseGaps.push('项目采购日期无效');}}
 const baseStatus=project.governmentProcurement===false?'notApplicable':baseGaps.length?'pending':project.projectDate<'2019-04-01'?'pending':'applicable';
 const baseReason=baseStatus==='notApplicable'?'明确为非政府采购项目；另按本项目约定核对':baseStatus==='applicable'?'按2019年品目清单与有效认证证书机制核对；外部政策不生成废标条款':project.projectDate&&project.projectDate<'2019-04-01'?'既往采购项目须核对当时政策，本包不能代替历史版本':baseGaps.join('；');
 const value=(sourceId)=>({status:baseStatus,reason:baseReason,gaps:[...baseGaps],sources:[policy('authority-2019'),policy(sourceId)]});
 const greenGaps=[...baseGaps],g=pkg.greenMaterial;
 if(project.projectDate&&project.projectDate<g.effectiveFrom)greenGaps.push('既往项目须核对2022版及当时试点/地方政策，2025版不能直接套用');
 if(!project.region)greenGaps.push('缺项目地区（市/区），无法核对101城市及地方扩围');
 const cities=g.cities.filter(c=>clean(project.region).includes(clean(c.name))&&(!project.province||clean(project.province)===clean(c.province)));
 if(project.region&&!cities.length)greenGaps.push('地区未明确落入本包101实施市/区，地方扩围及具体实施范围待核验');
 if(!project.projectType)greenGaps.push('缺具体建筑/工程项目类型');else if(!g.projectTypes.some(t=>clean(project.projectType).includes(clean(t))))greenGaps.push('项目类型未明确落入规定建筑项目，其他工程纳入情况须查地方实施文件');
 if(project.localImplementationConfirmed!==true)greenGaps.push('本项目纳入地方实施范围及地方具体要求尚未确认');
 const greenStatus=project.governmentProcurement===false?'notApplicable':greenGaps.length?'pending':'applicable';
 const scoring=sources.filter(s=>/(?:节能|环境标志|绿色建材)[^。；\n]*(?:\d+(?:\.\d+)?分|加分|评分|优先待遇)/.test(s.quote));
 return{energyMandatory:value('energy-2019'),energyPreference:value('energy-2019'),environmentPreference:value('environment-2019'),greenMaterial:{status:greenStatus,reason:greenStatus==='notApplicable'?'明确为非政府采购项目；另查政府投资或项目约定':greenGaps.length?greenGaps.join('；'):'地区、规定建筑类型、采购日期及本项目纳入地方实施范围已明确；逐小类和全部适用技术指标核对',gaps:greenGaps,sources:[policy(g.authoritySourceId),policy(g.sourceId),policy(g.citiesSourceId)],matchedCities:structuredClone(cities)},projectScoring:{status:scoring.length?'pending':'notApplicable',reason:scoring.length?'保留本项目评分原文，按评分条件另核材料；国家优先采购不自动折算加分':'已提供原文中未识别具体产品政策计分条款，不能推定加分',gaps:scoring.length?['具体分值、条件及材料仍按项目评分原文逐项核对']:[],sources:scoring.map(sourceView)}};
}
function productMatches(item,candidate){
 const q=clean(candidate.searchText??candidate.name??candidate.source.quote),all=candidate.isBoq?q:clean(candidate.source.quote);
 if(item.excludedTerms.some(term=>q.includes(clean(term))))return null;
 if(item.categoryCode==='A10030102'&&/水泥砂浆|水泥混凝土|水泥板|水泥基/.test(q)&&clean(candidate.name)!=='水泥')return null;
 const baseName=item.name.replace(/[（(]制冷量[^）)]+[）)]/,'');
 let terms=[item.name,...item.aliases];if(item.policyType==='energy'&&/制冷量/.test(item.name))terms.push(baseName);
 // Some official names include explanation parentheses but the base name is
 // exact; no edit-distance or fuzzy brand/model matching is used.
 if(item.name==='普通电视设备（电视机）')terms.push('电视机');
 if(item.name==='便器')terms.push('坐便器','蹲便器','小便器','马桶');
 const matchedTerms=terms.map(clean).filter(t=>productMention(q,t,item));if(!matchedTerms.length)return null;
 const term=matchedTerms.sort((a,b)=>b.length-a.length)[0];
 const gaps=[];
 if(/制冷量/.test(item.name)){
  const m=all.match(/(?:制冷量|冷量|制冷能力)[：:=]?([\d.]+)(kW|KW|W)/i);let power=m?Number(m[1])*(m[2].toLowerCase()==='kw'?1000:1):null;
  if(power===null)gaps.push('缺制冷量，无法确认大于或不大于14000W的品目范围');
  else if(item.name.includes('>14000W')?power<=14000:power>14000)return null;
 }
 if(item.name==='电机'&&!/三相异步|中小型/.test(all))gaps.push('电机总称不能证明属于中小型三相异步电动机范围');
 if(item.policyType==='environment'&&['A02061808','A060804','A10039901','A180201','A170112','A100702'].includes(item.categoryCode)){
  const range={A02061808:/太阳能|集热器/,A060804:/陶瓷|卫生陶瓷/,A10039901:/刚性防水/,A180201:/塑料管材|PVC|PPR|PE管|再生塑料/i,A170112:/胶粘剂|粘合剂/,A100702:/塑料窗|塑料门窗|PVC窗/i}[item.categoryCode];if(!range.test(all))gaps.push(`具体产品是否落入标准范围待核验：${item.scope}`);
 }
 return{gaps,term};
}
const applicableFor=(item,a)=>item.policyType==='greenMaterial'?a.greenMaterial:item.policyType==='environment'?a.environmentPreference:item.policyKind==='requirement'?a.energyMandatory:a.energyPreference;
function originalNegations(sources,item){
 return sources.filter(s=>{const q=clean(s.quote+' '+s.section);if(!/不涉及|不适用|无须|无需/.test(q))return false;return item.policyType==='energy'?/节能/.test(q)&&(!/强制采购/.test(q)||item.policyKind==='requirement')&&(!/优先采购/.test(q)||item.policyKind==='preference'):item.policyType==='environment'?/环境标志|环保产品/.test(q):/绿色建材/.test(q);}).map(sourceView);
}
function certificateEvidence(product,item,records,pkg,asOf,documents){
 const candidates=[];
 for(const record of records){if(record.type!=='product')continue;const f=record.fields||{},models=Array.isArray(f.coveredModels)?f.coveredModels:typeof f.coveredModels==='string'?f.coveredModels.split(/[、,，;；\n]+/):[];
  if(!(product.model&&[f.model,...models].some(m=>clean(m)===clean(product.model)))&&!([item.name,...item.aliases].some(n=>clean(f.category||record.name).includes(clean(n)))))continue;
  const gaps=[],goodType=item.policyType===f.certificateType||(item.policyType==='greenMaterial'&&f.certificateType==='testReport');
  if(!goodType)gaps.push(`证件类型${f.certificateType||'未知'}不能替代${item.policyType}产品政策证明`);
  const categoryTerms=[item.name,...item.aliases,item.name.replace(/[（(]制冷量[^）)]+[）)]/,'')];
  if(!f.category)gaps.push('证明产品类别未明确');else if(clean(f.category)!==clean(item.categoryCode)&&!categoryTerms.some(term=>clean(f.category).includes(clean(term))))gaps.push('证明产品类别与本小类未形成明确对应关系');
  if(record.verified!==true)gaps.push('企业产品条目尚未人工确认');
  if(record.recognition?.sourceComplete===false)gaps.push('证明原件读取不完整，范围及附页须补查');
  const historicalConflicts=record.recognition?.conflicts||[];
  if(historicalConflicts.some(conflict=>conflict.resolved!==true)||(record.recognition?.status==='conflict'&&!historicalConflicts.length))gaps.push('产品识别存在未解决字段冲突');
  if(!product.model)gaps.push('本项目产品型号未明确');
  if(!product.manufacturer)gaps.push('本项目制造商未明确');
  if(!f.manufacturer)gaps.push('证明缺制造商');else if(product.manufacturer&&clean(product.manufacturer)!==clean(f.manufacturer))gaps.push('证明制造商与所投制造商不一致');
  if(!models.length)gaps.push('证明缺明确覆盖型号');else if(product.model&&!models.some(m=>clean(m)===clean(product.model)))gaps.push('具体型号不在证书已确认覆盖范围内；系列相似名称不能证明覆盖');
  if(!f.certificateNumber)gaps.push('缺证书/报告编号');if(!f.issuer)gaps.push('缺认证或检测机构');
  if(f.certificateStatus!=='valid')gaps.push(`证书/报告状态${f.certificateStatus||'unknown'}，须核验有效状态`);
  let start=null,end=null;try{start=date(f.validFrom);}catch{gaps.push('缺或无效的证明生效日期');}try{end=date(f.validUntil);}catch{gaps.push('缺或无效的证明有效期截止日期');}
  if(start&&end&&start>end)gaps.push('证明起止日期矛盾');if(start&&start>asOf)gaps.push('证明尚未生效');if(end&&end<asOf)gaps.push('证明已过有效期');
  const ids=record.documentIds||[],linkedSources=(record.sources||[]).filter(s=>ids.includes(s.documentId)&&s.blockId&&typeof s.quote==='string'&&s.quote.trim());
  const proofKinds=f.certificateType==='testReport'?['testReport','environmentalReport']:['certificate',f.certificateType];
  const proofs=(f.evidence||[]).filter(p=>proofKinds.includes(p.kind)&&p.verified===true&&p.valid!==false&&ids.includes(p.documentId)&&linkedSources.some(s=>s.documentId===p.documentId));
  if(!ids.length||!linkedSources.length||!proofs.length)gaps.push('缺已核验且关联原件、原文定位的证明链');
  const typePatterns={energy:/节能(?:产品)?(?:认证|证书)|节水(?:产品)?(?:认证|证书)/,environment:/环境标志(?:产品)?(?:认证|证书)/,greenMaterial:/绿色建材(?:产品)?(?:认证|证书)/,testReport:/检测报告/};
  const chainSources=linkedSources.filter(s=>proofs.some(p=>p.documentId===s.documentId));
  const quotes=chainSources.map(s=>clean(s.quote)).join('\n');
  const canonicalDates=q=>q.replace(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?/g,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
  const originalDateValue=(q,value)=>[...canonicalDates(clean(q)).matchAll(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g)].some(match=>match[0]===value);
  for(const [field,value]of [['生效日期',start],['有效期截止日期',end]])if(value&&!originalDateValue(quotes,value))gaps.push(`${field}未能准确追溯到已核验原件日期引文`);
  if(/(?:证书状态|认证状态|状态)[：:]?(?:暂停|撤销|吊销|无效|失效)|证书(?:已)?(?:暂停|撤销|吊销)|未获得节能认证|未获得环境标志认证/.test(quotes))gaps.push('原件载明暂停、撤销或无效，与有效状态冲突');
  const identifiers=[['制造商',f.manufacturer,'制造商名称|生产企业名称|生产厂家|制造商|生产企业|生产厂'],['证书编号',f.certificateNumber,'证书编号|证书号码|认证编号|报告编号|注册编号|编号'],['机构',f.issuer,'颁发机构|发证机关|发证机构|认证机构|检测机构|签发机构']];
  const originalGroups=proofs.map(p=>{const q=chainSources.filter(s=>s.documentId===p.documentId).map(s=>s.quote).join('\n');return{quote:q,coherent:identifiers.filter(([,value])=>value).every(([,value,labels])=>labeledOriginalValue(q,value,labels))&&(!product.model||originalModelValue(q,product.model))&&(!start||originalDateValue(q,start))&&(!end||originalDateValue(q,end))&&typePatterns[f.certificateType]?.test(clean(q))};});
  if(!originalGroups.some(group=>group.coherent))gaps.push('制造商、具体型号、证号、机构和起止日期须准确追溯到同一份已核验原件，不能使用标识前缀');
  for(const [field,value,labels]of identifiers)if(value&&!chainSources.some(s=>labeledOriginalValue(s.quote,value,labels)))gaps.push(`${field}未能准确追溯到关联原件引文`);
  if(product.model&&!originalGroups.some(group=>originalModelValue(group.quote,product.model)))gaps.push('所投具体型号缺原件准确覆盖引文，型号前缀或备注不能证明覆盖');
  if(!typePatterns[f.certificateType]?.test(quotes))gaps.push('证件类型未能追溯到关联原件引文');
  for(const source of linkedSources){const doc=documents.find(d=>d.id===source.documentId);if(doc){const block=(doc.extraction?.blocks||doc.blocks||[]).find(b=>b.id===source.blockId);if(!block||!block.text?.includes(source.quote)||(block.page??null)!==(source.page??null))gaps.push('引用与提供的原件块、页或引文不一致');}}
  if(item.policyType==='greenMaterial'){
   if(f.policyVersion!==pkg.version)gaps.push('绿色建材证明与本次政策版本对应关系待核验');
   if(greenNegative(quotes))gaps.push('原件存在不符合、不合格或未通过的否定结论，不能认定绿色建材符合');
   if(originalGroups.some(group=>greenClaimReview(group.quote,product,item).ambiguous))gaps.push('原件符合性表达未形成无歧义的本型号、本条款肯定结论，否定、限定或未知表达须待核验');
   if(f.certificateType==='testReport'&&!originalGroups.some(group=>group.coherent&&greenConclusion(group.quote,product,item)))gaps.push('一般检测报告不能替代本型号、本小类完整需求标准的肯定符合性结论，须核对全部适用指标');
  }
  candidates.push({recordId:record.id,certificateType:f.certificateType||null,status:gaps.length?'pending':'met',gaps:unique(gaps),sources:linkedSources.map(s=>structuredClone(s)),proofs:structuredClone(proofs),goodType});
 }
 return candidates;
}
export function analyzeProcurementPolicy({documents=[],companySnapshot=null,projectContext={},policyPackage=DEFAULT_POLICY_PACKAGE,asOf}={}){
 const pkg=validatePolicyPackage(policyPackage),analysisDate=date(asOf||localCalendarDate(),'分析日期');
 const sources=sourcesFrom(documents),project=contextualProject(projectContext,sources),applicability=application(pkg,project,sources),products=[],warnings=[];
 const {declarations,exclusions}=responsibilityEvidence(sources,pkg);
 const records=companySnapshot?.records||[];
 for(const document of documents)if((document.extraction||document).complete===false)warnings.push({code:'POLICY_EXTRACTION_INCOMPLETE',documentId:document.id,message:'原文读取不完整，产品名单和政策适用范围须补查'});
 for(const source of sources){const inventoryCandidate=inventory(source);if(!inventoryCandidate)continue;const candidate=bidderProcurement(inventoryCandidate,source,declarations,pkg);if(!candidate)continue;let recognized=false;
  const matches=pkg.catalog.map(item=>({item,match:productMatches(item,candidate)})).filter(m=>m.match);
  const precise=matches.filter(m=>!matches.some(other=>other.item.policyType===m.item.policyType&&other.match.term.length>m.match.term.length&&other.match.term.includes(m.match.term)));
  for(const {item,match}of precise){recognized=true;
   const app=applicableFor(item,applicability),originalStatements=originalNegations(sources,item),gaps=[...match.gaps],name=candidate.isBoq?item.name:candidate.name||item.name;
   if(item.conditions){const structure=clean(project.buildingStructure);if(!structure)gaps.push(`缺结构形式，${item.name}仅${item.conditions.buildingStructure}建筑必选`);else if(!structure.includes(clean(item.conditions.buildingStructure)))gaps.push(`结构形式与${item.conditions.buildingStructure}必选条件不符，具体小类需求须核对`);}
   if(app.status==='pending')gaps.push(...app.gaps);
   const product={id:'policy-'+createHash('sha256').update([source.documentId,source.blockId,source.rowStart??source.quote,item.id,candidate.model||''].join('|')).digest('hex').slice(0,20),name,categoryCode:item.categoryCode,policyType:item.policyType,policyKind:item.policyKind,status:'pending',requirement:item.policyType==='greenMaterial'?(item.policyKind==='requirement'?'纳入适用项目且涉及本必选小类时应选用符合全部适用技术指标的绿色建材；可用绿色建材认证或符合需求标准的有效检测报告等证明':'适用项目的可选小类按种类数量至少选择40%，每个计入选用的小类绿色用量须达到同类80%；无需将每一可选材料都强制认证'):item.policyKind==='requirement'?'属于官方强制采购品目范围时，核对制造商、具体型号及有效节能产品认证证书':'属于优先采购品目范围时，按有效认证及本项目具体优先/评分条件核对',model:candidate.model||null,manufacturer:candidate.manufacturer||null,documents:[source.documentId].filter(Boolean),sources:[sourceView(source)],policySources:pkg.sources.filter(s=>s.id===item.sourceId||s.id===(item.policyType==='greenMaterial'?pkg.greenMaterial.authoritySourceId:'authority-2019')).map(s=>({...structuredClone(s),...(s.id===item.sourceId?{categoryCode:item.categoryCode,sourcePage:item.sourcePage,scope:item.scope,standard:item.standard,...(item.clause?{clause:item.clause,sourceTable:item.sourceTable,sourceRow:item.sourceRow}: {})}:{})})),matchedRecordIds:[],gaps:[],reason:'',originalStatements};
   const evidence=certificateEvidence(product,item,records,pkg,analysisDate,documents);product.companyEvidence=evidence.map(({goodType,...e})=>e);const supported=evidence.filter(e=>e.status==='met');
   if(app.status==='notApplicable'){product.status='notApplicable';product.reason=app.reason;}
   else{
    if(!candidate.model)gaps.push('本项目产品型号未明确，不能判定覆盖范围');if(!candidate.manufacturer)gaps.push('本项目制造商未明确，不能判定原件主体');
    if(originalStatements.length){gaps.push('招标原文“不涉及/不适用”与品目候选存在冲突，须向采购方澄清，不能自行新增废标条件');warnings.push({code:'POLICY_TENDER_CONFLICT',productId:product.id,message:'产品品目政策候选与招标原文声明冲突；保留双方依据并待澄清',sources:originalStatements,policySourceIds:product.policySources.map(s=>s.id)});}
    if(!evidence.length)gaps.push('未找到该产品的已核验证明材料');else if(!supported.length)gaps.push(...evidence.flatMap(e=>e.gaps));
    product.status=supported.length&&!gaps.length?'met':!evidence.some(e=>e.goodType)&&candidate.model&&candidate.manufacturer&&!match.gaps.length&&app.status==='applicable'&&!originalStatements.length?'missing':'pending';
    product.matchedRecordIds=product.status==='met'?supported.map(e=>e.recordId):[];
    product.reason=product.status==='met'?'具体制造商、型号覆盖、有效日期和状态、证件类别、人工核验原件链已具备；最终响应条件仍按招标原文核对':product.status==='missing'?'缺本产品适用类型的证明材料；资料缺失不自动构成废标':'类别范围、政策适用性或证据链仍待核验；不能据此认定不合格';
   }
   product.gaps=unique(gaps);products.push(product);
  }
  if(!recognized&&candidate.inventory){products.push({id:'policy-'+createHash('sha256').update([source.documentId,source.blockId,source.rowStart??source.quote,'unknown'].join('|')).digest('hex').slice(0,20),name:candidate.unknownName||candidate.name,categoryCode:null,policyType:'unknown',policyKind:'preference',status:'pending',requirement:'产品类别及是否属于官方政策范围待核验；本包未命中不能证明无需任何产品要求',model:candidate.model||null,manufacturer:candidate.manufacturer||null,documents:[source.documentId].filter(Boolean),sources:[sourceView(source)],policySources:[],matchedRecordIds:[],companyEvidence:[],originalStatements:[],gaps:['品目类别未确认，需人工核对详细材料、规格和适用标准'],reason:'保留清单产品原文，未凭相似名称推定政策类别'});}
 }
 const optional=unique(products.filter(p=>p.policyType==='greenMaterial'&&p.policyKind==='preference').map(p=>p.categoryCode));
 const summary={totalProducts:products.length,requirement:products.filter(p=>p.policyKind==='requirement').length,preference:products.filter(p=>p.policyKind==='preference'&&p.policyType!=='unknown').length,met:products.filter(p=>p.status==='met').length,pending:products.filter(p=>p.status==='pending').length,missing:products.filter(p=>p.status==='missing').length,notApplicable:products.filter(p=>p.status==='notApplicable').length,unknown:products.filter(p=>p.policyType==='unknown').length,greenMaterial:{optionalCategories:optional.length,minimumSelectedCategories:Math.ceil(optional.length*pkg.greenMaterial.optionalCategoryRatio),ratioBasis:'涉及的可选建材小类数量',optionalCategoryRatio:pkg.greenMaterial.optionalCategoryRatio,withinCategoryRatio:pkg.greenMaterial.withinCategoryRatio,status:'pending',reason:'证明符合性支持不等于确认实际选用量；须逐小类核对量纲、同类绿色用量80%及地方要求'}};
 if(!products.length)warnings.push({code:'POLICY_INVENTORY_PENDING',message:'已提供原文未形成可核查的产品清单；须补查工程量清单、技术参数及材料表，不能认定不涉及产品政策'});
 if(analysisDate>pkg.checkedAt)warnings.push({code:'POLICY_PACKAGE_FRESHNESS',message:`离线政策包核对日期为${pkg.checkedAt}；之后的官方及地方变更须通过显式检查核实`});
 return{version:pkg.version,asOf:analysisDate,policySources:structuredClone(pkg.sources),applicability,products,exclusions,warnings,summary};
}
