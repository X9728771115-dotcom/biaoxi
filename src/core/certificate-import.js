import {randomUUID} from 'node:crypto';

const fieldsByType={
 entity:['registeredName','creditCode','legalRepresentative','businessScope','validUntil'],
 qualification:['category','specialty','grade','certificateNumber','issuer','validFrom','validUntil'],
 performance:['projectType','contractNumber','contractDate','amount','clientName'],
 personnel:['role','specialty','grade','certificateNumber','employer','bCertificateNumber','validUntil'],
 product:['brand','model','category','certificateNumber','issuer','validFrom','validUntil','manufacturer','coveredModels','certificateStatus','policyVersion','energyPolicy','environmentPolicy','environmentalPerformance']
};
const labels={
 registeredName:['企业名称','公司名称','名称'],creditCode:['统一社会信用代码'],legalRepresentative:['法定代表人','法人'],businessScope:['经营范围'],
 category:['资质类别及等级','资质类别','资质名称','产品类别'],specialty:['注册专业','专业类别','专业'],grade:['等级','级别'],certificateNumber:['证书编号','证书号码','证书编码','编码','认证编号','注册编号','报告编号'],issuer:['颁发机构','发证机关','发证机构','认证机构','签发机构'],validFrom:['有效期起始','有效期自','有效开始日期','生效日期'],validUntil:['有效期截止','有效期至','有效期结束','有效截止日期','到期日期'],validityInterval:['有效期'],
 projectType:['项目类型','业绩类型'],contractNumber:['合同编号'],contractDate:['合同签订日期','合同签订时间','签订日期'],amount:['合同金额'],clientName:['业主名称','甲方名称','委托方'],role:['拟派岗位','岗位','职务'],employer:['注册单位','工作单位','聘用企业'],bCertificateNumber:['B类证书编号','B证编号'],brand:['品牌'],model:['型号规格','规格型号','产品型号','型号'],coveredModels:['覆盖型号','认证范围','覆盖范围'],manufacturer:['制造商名称','生产企业名称','生产厂名称','制造商','生产企业','生产厂'],subjectName:['证书主体','申请人名称','持证人名称','申请人','持证人','获证组织','合同乙方','乙方名称'],energyPolicy:['节能认证'],environmentPolicy:['环境标志认证'],environmentalPerformance:['环保性能'],policyVersion:['政策版本'],certificateStatus:['证书状态','认证状态'],name:['产品名称','项目名称','合同名称','证书名称','姓名']
};
// These printed labels delimit neighbouring cells without becoming company facts.
labels._boundary=['注册资本','企业类型','类型','成立日期','住所地址','住所','详细地址','登记机关','营业期限','营业执照注册号','经济性质','身份证号码','身份证号','公民身份号码','性别','出生日期','岗位名称','操作项目','作业类别','培训机构','发证时间'];
const labelEntries=Object.entries(labels).flatMap(([key,values])=>values.map(label=>({key,label}))).sort((a,b)=>b.label.length-a.label.length);
const labelPattern=new RegExp(labelEntries.map(e=>[...e.label].join('[\\s\\u3000]*')).join('|'),'g');
const labelKey=label=>labelEntries.find(e=>e.label===label.replace(/\s/g,''))?.key;
const titles=/中国环境标志产品认证证书|环境标志产品认证证书|(?:中国)?节能产品认证证书|节能认证证书|绿色建材(?:产品)?认证证书|强制性产品认证证书|(?:CCC|3C)(?:强制性产品)?认证证书|建筑业企业资质证书|安全生产许可证|营业执照|(?:注册)?(?:一级|二级)?建造师(?:注册)?证书|职业培训合格证(?:书)?|岗位培训考核合格证(?:书)?|ISO\s*\d+(?:[：:]\d+)?(?:[^\n]{0,15}认证证书)?|(?:产品)?(?:检验|检测)报告/gi;
const clean=value=>String(value??'').normalize('NFKC').replace(/^[\s：:|｜]+|[\s；;|｜]+$/g,'').trim();
const canonical=value=>clean(Array.isArray(value)?[...value].sort().join('|'):value).replace(/\s+/g,'').toLowerCase();
function parseDate(value){const m=clean(value).replace(/\s+/g,'').match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/);if(!m)return undefined;const s=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().startsWith(s)?s:undefined;}
function detectedType(text){
 // Registration-number labels on qualifications are not business-license titles.
 const title=[...text.matchAll(titles)].find(m=>!/^\s*注册号/.test(text.slice(m.index+m[0].length)))?.[0]||'';
 if(/营业执照/.test(title))return'entity';
 if(/资质证书|安全生产许可证/.test(title))return'qualification';
 if(/建造师|职业培训合格证|岗位培训考核合格证/.test(title))return'personnel';
 if(/节能|环境标志|绿色建材|强制性产品|CCC|3C|ISO|检验报告|检测报告/i.test(title))return'product';
 if(/建筑业企业资质/.test(text))return'qualification';
 if(/居民身份证|公民身份号码/.test(text))return null;
 if(/建造师|安全生产考核合格证书|B类证书|B证编号|拟派岗位/.test(text))return'personnel';
 if(/合同编号|合同名称|合同金额|验收报告|项目名称/.test(text))return'performance';
 if(/资质类别|资质名称|安全生产许可证/.test(text))return'qualification';
 if(/产品名称|制造商|规格型号|型号|\bCCC\b/i.test(text))return'product';
 if(/统一社会信用代码/.test(text))return'entity';
 if(['注册资本','法定代表人','经营范围'].filter(label=>text.replace(/\s/g,'').includes(label)).length>=2)return'entity';
 return null;
}
function personName(value,{ocr=false}={}){return /^[\p{Script=Han}]{2,8}(?:[·•][\p{Script=Han}]{1,8})*$/u.test(value)||(!ocr&&/^[A-Z][a-z]+(?:[ -][A-Z][a-z]+){1,3}$/.test(value));}
function creditCode(value){
 const code=clean(value).replace(/\s/g,'').toUpperCase(),alphabet='0123456789ABCDEFGHJKLMNPQRTUWXY',weights=[1,3,9,27,19,26,16,17,20,29,25,13,8,24,10,30,28];
 if(!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(code))return undefined;
 const sum=[...code.slice(0,17)].reduce((total,char,index)=>total+alphabet.indexOf(char)*weights[index],0);
 return alphabet[(31-sum%31)%31]===code[17]?code:undefined;
}
function credentialNumber(value,{ocr=false,registration=false,safety=false}={}){
 const compact=clean(value).replace(/\s/g,'');
 // Extract only a complete known credential syntax; OCR decoration is not part of its identifier.
 const known=(safety&&(compact.match(/^([\p{Script=Han}]{1,3}交安[ABC][123]?(?:\(\d{2}\)|\d{2})G\d{5})(?=$|[\p{Script=Han}A-Za-z])/u)
  ||compact.match(/^([\p{Script=Han}]{1,3}(?:建安|交安|水安)[ABC][123]?\(\d{4}\)\d{4,10})(?=$|[\p{Script=Han}A-Za-z])/u)
  ||compact.match(/^([\p{Script=Han}]{1,3}水安[ABC]\d{11})(?=$|[\p{Script=Han}A-Za-z])/u)))
  ||(registration&&compact.match(/^([\p{Script=Han}]{1,3}[12]\d{10,18})(?=$|[\p{Script=Han}A-Za-z])/u));
 if(known)return known[1];
 if((ocr&&!/\d/.test(compact))||!/^[\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9()./-]*$/u.test(compact))return undefined;
 return clean(value);
}
function registrationValidity(parts){
 const result={use:[],professions:[]};
 const date='(?:19|20)\\d{2}\\s*[年./-]\\s*\\d{1,2}\\s*[月./-]\\s*\\d{1,2}\\s*日?';
 const interval=`(${date})\\s*(?:至|到|—|–|~|～|-)\\s*(${date})`;
 for(const part of parts){
  for(const match of part.text.matchAll(new RegExp(`使用\\s*有效期\\s*[：:]?\\s*${interval}`,'g'))){
   const from=parseDate(match[1]),until=parseDate(match[2]);if(from&&until&&from<=until)result.use.push({from,until,part,quote:match[0]});
  }
  for(const match of part.text.matchAll(new RegExp(`(建筑工程|市政公用工程|公路工程|水利水电工程|机电工程|矿业工程|港口与航道工程|民航机场工程|铁路工程|通信与广电工程)\\s*[（(]\\s*有效期\\s*[：:]?\\s*${interval}`,'g'))){
   const from=parseDate(match[2]),until=parseDate(match[3]);if(from&&until&&from<=until)result.professions.push({specialty:match[1],from,until,part,quote:match[0]});
  }
 }
 return result;
}
function nativeFacts(part,recordType){
 const entries=[],ocr=part.block.kind==='ocr',lines=part.text.split('\n');
 // A complete organisation line or checksum-valid identifier is usable even when
 // its printed label lives in the image layer. Never repair OCR glyphs by guess.
 for(const raw of lines){
  const value=clean(raw);
  if(/^[\p{Script=Han}A-Za-z0-9（）()·-]{2,100}(?:有限公司|有限责任公司|股份公司|集团公司)$/u.test(value))entries.push({key:recordType==='entity'?'registeredName':'subjectName',value,quote:raw,implicit:true});
  if(recordType==='entity'&&creditCode(value))entries.push({key:'creditCode',value:creditCode(value),quote:raw,implicit:true});
  if(ocr||recordType!=='qualification')continue;
  const organisation=raw.match(/^([\p{Script=Han}A-Za-z0-9（）()·-]{2,100}?(?:有限公司|有限责任公司|股份公司|集团公司))(?=[\p{Script=Han}\d\s|]|$)/u);if(organisation)entries.push({key:'subjectName',value:clean(organisation[1]),quote:organisation[1],implicit:true});
  const number=raw.match(/(?:^|[\s|])(D\d{6,12})(?=\s*(?:\||$))/);if(number)entries.push({key:'certificateNumber',value:number[1],quote:number[1],implicit:true});
  const until=raw.match(/至\s*\d{4}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2}\s*日?/);if(until&&parseDate(until[0]))entries.push({key:'validUntil',value:parseDate(until[0]),quote:until[0],implicit:true});
  const issuer=raw.match(/^([\p{Script=Han}]{2,40}(?:住房和城乡建设厅|住房和城乡建设局|建设委员会))(?=\s*\d{4}\s*年|$)/u);if(issuer)entries.push({key:'issuer',value:clean(issuer[1]),quote:issuer[1],implicit:true});
 }
 if(!ocr&&recordType==='qualification'){
  const start=lines.findIndex(line=>/^[\p{Script=Han}]{1,35}工程.*(?:总承包|专业承包|承包[一二三四五六特]级)/u.test(clean(line)));
  if(start>=0){let end=start+1;while(end<lines.length&&!/^(?:[\p{Script=Han}]{2,40}(?:厅|局|委员会)|\d{4}\s*年)/u.test(clean(lines[end]))&&![...lines[end].matchAll(labelPattern)].some(m=>m.index===0))end++;const quote=lines.slice(start,end).join('\n');entries.push({key:'category',value:clean(quote),quote,implicit:true});}
 }
 return entries;
}
function certificateType(title){if(/环境标志/.test(title))return'environment';if(/节能/.test(title))return'energy';if(/绿色建材/.test(title))return'greenMaterial';if(/强制性产品|CCC|3C/i.test(title))return'ccc';if(/ISO\s*\d+/i.test(title))return'iso';if(/检验报告|检测报告/.test(title))return'testReport';return'other';}
function modelList(value){
 const text=clean(value),count=text.match(/共\s*(\d+)\s*(?:款|种|个)?(?:型号|产品)?/);
 const items=text.replace(/[（(]?共\s*\d+\s*(?:款|种|个)?(?:型号|产品)?[）)]?/g,'').split(/[、,，;；\n|]+/).map(clean).filter(Boolean);
 const ambiguous=/(?:详见|见附件|未列全|等等|等型号|\.\.\.|…|系列|～|~)/.test(text)||Boolean(count&&Number(count[1])!==items.length);
 return{items,ambiguous};
}
function readFields(part){
 if(part.tableFields)return part.tableFields;
 const found=[];
 for(const match of part.text.matchAll(labelPattern)){
  const boundary=match.index===0||/[\s|｜；;：:]/.test(part.text[match.index-1])||/^\s*[：:]/.test(part.text.slice(match.index+match[0].length));
  const key=labelKey(match[0]),priorKey=found.length?labelKey(found.at(-1)[0]):null;
  if((key==='_boundary'||match[0].replace(/\s/g,'').length>2||boundary)&&!(key===priorKey&&!boundary)&&!(key==='businessScope'&&!boundary))found.push(match);
 }
 const result=[];
 for(let n=0;n<found.length;n++){
  const match=found[n],key=labelKey(match[0]),start=match.index+match[0].length,end=found[n+1]?.index??part.text.length;if(key==='_boundary')continue;
  const raw=['businessScope','model','coveredModels'].includes(key)?part.text.slice(start,end):part.text.slice(start,end).split(/[\n；;]/)[0];let value=clean(raw);if(!value&&/^\s*\n/.test(part.text.slice(start,end)))value=clean(part.text.slice(start,end)).split(/[\n；;]/)[0];
  // Adjacent table cells may be separated by a pipe, but retain the original quote verbatim.
  value=clean(value);if(!value)continue;
  const quote=part.text.slice(match.index,end).trim();
  if(['category','specialty','role','projectType'].includes(key)&&!/[\p{Script=Han}A-Za-z]/u.test(value)){result.push({key,quote,rejected:true});continue;}
  if(key==='specialty'&&/^(?:人员|技术人员|现场人员|职业培训)|职业培训|测试成绩|合格证书/.test(value)){result.push({key,quote,rejected:true});continue;}
  if(['certificateNumber','bCertificateNumber'].includes(key)){const context=part.text,personnel=detectedType(context)==='personnel';value=credentialNumber(value,{ocr:part.block?.kind==='ocr',registration:personnel&&/建造师|注册证书/.test(context),safety:personnel&&/安全生产考核|建安|交安|水安/.test(context)});if(!value){result.push({key,quote,rejected:true});continue;}}
  if(key==='contractNumber'&&part.block?.kind==='ocr'&&(!/\d/.test(value)||!/^[\p{Script=Han}A-Za-z0-9()\s./-]+$/u.test(value))){result.push({key,quote,rejected:true});continue;}
  if(key==='creditCode'){const valid=creditCode(value);if(!valid){result.push({key,quote,rejected:true});continue;}value=valid;}
  if(key==='legalRepresentative'&&!personName(value,{ocr:part.block?.kind==='ocr'})){result.push({key,quote,rejected:true});continue;}
  if(key==='registeredName'&&!/^[\p{Script=Han}A-Za-z0-9（）()·. &-]{2,100}$/u.test(value)){result.push({key,quote,rejected:true});continue;}
  if(['validFrom','validUntil','contractDate'].includes(key)){value=parseDate(value);if(!value){result.push({key,quote,rejected:true});continue;}}
  if(key==='amount'){const a=value.match(/^([\d,.]+)\s*(万元|亿元|元)?/);if(!a){result.push({key,quote,rejected:true});continue;}value=Number(a[1].replace(/,/g,''))*({万元:1e4,亿元:1e8,元:1}[a[2]]||1);if(!Number.isFinite(value)){result.push({key,quote,rejected:true});continue;}}
  let ambiguous=false;if(['model','coveredModels'].includes(key)){const parsed=modelList(value);ambiguous=parsed.ambiguous;if(key==='coveredModels')value=parsed.items;}
  if(key==='certificateStatus'){value=({有效:'valid',正常:'valid',暂停:'suspended',撤销:'revoked',注销:'revoked',valid:'valid',suspended:'suspended',revoked:'revoked',unknown:'unknown'})[value];if(!value)continue;}
  result.push({key,value,quote,...(ambiguous?{ambiguous:true}:{})});
 }
 // Certificate layouts often print a single validity interval rather than separate labels.
 const range=part.text.match(/有效期\s*[：:]?\s*(\d{4}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2}\s*日?)\s*(?:至|到|—|~|～)\s*(\d{4}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2}\s*日?)/);
 if(range)for(const [key,index]of [['validFrom',1],['validUntil',2]]){const value=parseDate(range[index]);if(value)result.push({key,value,quote:range[0]});}
 return result;
}
const source=(doc,part,field,quote)=>({documentId:doc.id,blockId:part.block.id,page:part.block.page??null,fileName:doc.fileName,section:part.block.section||'',quote:quote.trim().slice(0,5000),...(field?{field}:{})});

function partsForBlock(block){
 const headers=(block.tableHeaders||[]).map(clean),headerKeys=headers.map(header=>labelEntries.find(e=>e.label===header)?.key);
 if(headerKeys.filter(Boolean).length>=2&&Array.isArray(block.tableRows)){
  const parts=[];
  for(const row of block.tableRows){
   const cells=(Array.isArray(row)?row:row.cells)||[];if(cells.map(clean).every((cell,i)=>cell===headers[i]))continue;
   const entries=[];
   for(let i=0;i<headerKeys.length;i++){
    const key=headerKeys[i],raw=String(cells[i]??''),value=clean(raw);if(!key||!value||!block.text.includes(raw))continue;
    // Reuse field conversions, replacing generated labels with the actual original cell quote.
    const entry=readFields({text:`${headers[i]}：${value}`})[0];if(entry)entries.push({...entry,quote:raw});
   }
   if(entries.length)parts.push({block,text:block.text,tableFields:entries,startsTitle:false});
  }
  if(parts.length)return parts;
 }
 const titleMatches=[...block.text.matchAll(titles)].filter(match=>{
  if(/^\s*注册号/.test(block.text.slice(match.index+match[0].length)))return false;
  const prefix=block.text.slice(block.text.lastIndexOf('\n',match.index-1)+1,match.index);return /^\s*(?:证书名称[：:]?\s*)?$/.test(prefix);
 }).map(match=>{
  const before=block.text.slice(0,match.index),lineStart=before.lastIndexOf('\n')+1,prefix=before.slice(lineStart);
  return{...match,index:/^\s*(?:证书名称[：:]?\s*)?$/.test(prefix)?lineStart:match.index};
 });
 // Training cards often print their coding above the title on the same image.
 if(titleMatches.length===1&&/职业培训合格证|岗位培训考核合格证/.test(titleMatches[0][0])){
  const prefix=block.text.slice(0,titleMatches[0].index),facts=readFields({block,text:prefix}).filter(entry=>!entry.rejected);
  if(prefix.length<=180&&facts.length===1&&facts[0].key==='certificateNumber')titleMatches[0].index=0;
 }
 const cutSet=new Set([0,...titleMatches.map(m=>m.index)]),numberMatches=[...block.text.matchAll(/证书编号|证书号码|认证编号|注册编号|报告编号/g)];
 for(let n=1;n<numberMatches.length;n++)if(!titleMatches.some(m=>m.index>numberMatches[n-1].index&&m.index<=numberMatches[n].index))cutSet.add(numberMatches[n].index);
 const cuts=[...cutSet].sort((a,b)=>a-b);
 return cuts.map((start,n)=>({block,text:block.text.slice(start,cuts[n+1]??block.text.length),startsTitle:titleMatches.some(m=>m.index===start)})).filter(part=>part.text.trim());
}

export function recognizeCertificates(doc,{type='auto'}={}){
 if(type!=='auto'&&!Object.hasOwn(fieldsByType,type))throw new Error('无效的企业资料类型');
 const extraction=doc.extraction||{},warnings=(extraction.warnings||[]).map(w=>({documentId:doc.id,...w}));const groups=[];let current=null,lastPage;
 for(const block of extraction.blocks||[]){
  if(typeof block.text!=='string'||!block.text.trim())continue;
  for(const part of partsForBlock(block)){
   const startsTitle=part.startsTitle,entries=readFields(part),number=entries.find(e=>e.key==='certificateNumber')?.value;
   const known=current?.parts.flatMap(readFields).find(e=>e.key==='certificateNumber')?.value;
   const pageChanged=lastPage!==undefined&&(block.page??null)!==lastPage;
   // Link across pages only with an explicit repeated number, and never past a new title.
   const priorFacts=Object.fromEntries((current?.parts||[]).flatMap(readFields).filter(e=>!e.rejected).map(e=>[e.key,e.value])),nextFacts=Object.fromEntries(entries.filter(e=>!e.rejected).map(e=>[e.key,e.value]));
   const identityAgrees=['name','employer','subjectName','registeredName','manufacturer','validFrom','validUntil'].every(key=>!priorFacts[key]||!nextFacts[key]||canonical(priorFacts[key])===canonical(nextFacts[key]));
   const continued=pageChanged&&!startsTitle&&number&&known&&canonical(number)===canonical(known)&&identityAgrees;
   const differentNumber=number&&known&&canonical(number)!==canonical(known);
   if(!current||startsTitle||differentNumber||!identityAgrees||(pageChanged&&!continued)){
    const contextTitle=!startsTitle&&!pageChanged&&(differentNumber||!identityAgrees)?current?.contextTitle:null;
    current={parts:[],contextTitle};groups.push(current);
   }
   if(startsTitle)current.contextTitle=part;
   current.parts.push(part);lastPage=block.page??null;
  }
 }
 // Repeated page headers are safe to join only when the printed identity and version agree.
 const joined=[];
 for(const group of groups){
  const facts=Object.fromEntries(group.parts.flatMap(readFields).map(e=>[e.key,e.value])),number=facts.certificateNumber;
  const title=group.contextTitle?.text.match(titles)?.[0];
  const previous=number&&title?joined.find(other=>{
   const prior=Object.fromEntries(other.parts.flatMap(readFields).map(e=>[e.key,e.value]));
   return other.parts.at(-1).block.page!==group.parts[0].block.page&&canonical(prior.certificateNumber)===canonical(number)&&other.contextTitle?.text.match(titles)?.[0]===title&&['name','employer','manufacturer','subjectName','registeredName','validFrom','validUntil'].every(key=>!prior[key]||!facts[key]||canonical(prior[key])===canonical(facts[key]));
  }):null;
  if(previous)previous.parts.push(...group.parts);else joined.push(group);
 }
 const candidates=[];
 for(const group of joined){
  const content=(group.contextTitle&&!group.parts.includes(group.contextTitle)?group.contextTitle.text+'\n':'')+group.parts.map(p=>p.text).join('\n'),autoType=detectedType(content),recordType=type==='auto'?(autoType||'qualification'):type;
  const clearNativeFacts=autoType&&['entity','qualification'].includes(autoType)&&group.parts.some(part=>nativeFacts(part,autoType).length);
  if(type==='auto'&&!group.parts.flatMap(readFields).length&&!clearNativeFacts){warnings.push({documentId:doc.id,code:'COMPANY_UNASSIGNED_SOURCE',message:'说明文字或单独标题保留在原件，未当作独立证件入库',sources:group.parts.map(part=>source(doc,part,null,part.text.trim()))});continue;}
  const fields={},sources=[],conflicts=[],ambiguousFields=new Set(),rejectedFields=new Set(),priorities={};let name,explicitName=false;
  const allowed=new Set([...fieldsByType[recordType],'subjectName']);
  for(const part of group.parts)for(const entry of [...readFields(part),...nativeFacts(part,recordType)]){
   if(entry.key==='name'){sources.push(source(doc,part,'name',entry.quote));if(recordType==='personnel'&&!personName(entry.value,{ocr:part.block.kind==='ocr'})){rejectedFields.add('name');continue;}name??=entry.value;explicitName=true;continue;}
   if(!allowed.has(entry.key))continue;
   const proofs=[];for(let offset=0;offset<entry.quote.length;offset+=5000)proofs.push(source(doc,part,entry.key,entry.quote.slice(offset,offset+5000)));sources.push(...proofs);if(entry.ambiguous)ambiguousFields.add('coveredModels');
   if(entry.rejected){rejectedFields.add(entry.key);continue;}
   const priority=part.block.kind==='ocr'?(entry.implicit?0:1):2;
   if(fields[entry.key]===undefined||priority>priorities[entry.key]){fields[entry.key]=entry.value;priorities[entry.key]=priority;}
   else if(priority===priorities[entry.key]&&canonical(fields[entry.key])!==canonical(entry.value)){
    if(entry.implicit&&entry.key==='category'&&priority===2){fields.category+='\n'+entry.value;continue;}
    conflicts.push({field:entry.key,existingValue:fields[entry.key],incomingValue:entry.value,sources:proofs,resolved:false});
   }
  }
  if(recordType==='product'){
   const titlePart=group.contextTitle||group.parts.find(p=>p.startsTitle),title=titlePart?.text.match(titles)?.[0]||'';
   fields.certificateType=certificateType(title);fields.certificateStatus??='unknown';
   if(!fields.coveredModels&&fields.model){const parsed=modelList(fields.model);fields.coveredModels=parsed.items;if(parsed.ambiguous)ambiguousFields.add('coveredModels');const proof=sources.find(s=>s.field==='model');if(proof)sources.push({...proof,field:'coveredModels'});}
   if(!fields.model&&fields.coveredModels?.length)fields.model=fields.coveredModels.join('、');
   if(title&&titlePart)sources.push(source(doc,titlePart,'certificateType',title));
  }
  if(recordType==='entity')fields.subjectName??=fields.registeredName;
  if(recordType==='qualification'&&!fields.subjectName){for(const part of group.parts){const entry=readFields(part).find(e=>e.key==='registeredName'&&!e.rejected);if(entry){fields.subjectName=entry.value;sources.push(source(doc,part,'subjectName',entry.quote));break;}}}
  if(recordType==='personnel'&&/建造师/.test(content)){
   const periods=registrationValidity(group.parts),professions=[...new Map(periods.professions.map(period=>[`${period.specialty}:${period.from}:${period.until}`,period])).values()];
   const notes=[];
   for(const period of periods.use){notes.push(`本张电子证书使用期：${period.from}至${period.until}`);sources.push(source(doc,period.part,'notes',period.quote));}
   for(const period of professions){notes.push(`${period.specialty}专业注册期：${period.from}至${period.until}`);sources.push(source(doc,period.part,'notes',period.quote));}
   const specialties=new Set(professions.map(period=>period.specialty));
   if(specialties.size===1){fields.specialty=professions[0].specialty;sources.push(source(doc,professions[0].part,'specialty',professions[0].quote));}
   if(professions.length>1){
    delete fields.validUntil;notes.push('多专业或版本期限未唯一对应，结构化有效期留空待核');
    for(const proof of sources)if(proof.field==='validUntil')proof.field='notes';
   }else if(periods.use.length){
    const endings=[...periods.use,...professions],end=endings.reduce((prior,period)=>period.until<prior.until?period:prior);
    fields.validUntil=end.until;sources.push(source(doc,end.part,'validUntil',end.quote));notes.push('有效期至按本张使用期与已读专业注册期较早截止保存，专业注册期另列');
    for(let index=conflicts.length-1;index>=0;index--)if(conflicts[index].field==='validUntil')conflicts.splice(index,1);
   }
   if(notes.length)fields.notes=notes.join('；');
  }
  if(name===undefined){
   const title=[...content.matchAll(titles)].find(match=>!/^\s*注册号/.test(content.slice(match.index+match[0].length)))?.[0];
   name=title||(recordType==='qualification'&&/建筑业企业资质/.test(content)?'建筑业企业资质证书':{entity:'营业执照',qualification:'资质证件',performance:'项目业绩资料',personnel:'人员证件',product:'产品证件'}[recordType]);
   const titlePart=title&&[group.contextTitle,...group.parts].find(part=>part?.text.includes(title));if(titlePart)sources.push(source(doc,titlePart,'name',title));
  }
  const safetyPerson=/安全生产考核合格证书|(?:建安|B类证书|B证编号)/.test(content);
  const safetyB=safetyPerson&&/(?:建安|类别[：:]?\s*)B(?:[（(\d]|类|\b)|B类证书|B证编号/.test(content);
  const sourceOnly=/居民身份证|公民身份号码/.test(content)||(type==='auto'&&!autoType);
  const kind=sourceOnly?'source':recordType==='performance'?(/验收报告|验收证明/.test(content)?'acceptanceReport':'contract'):recordType==='entity'?'license':recordType==='personnel'?(safetyPerson?(safetyB?'bCertificate':'certificate'):/建造师|注册证书/.test(content)?'registration':/职业培训合格证|岗位培训考核合格证/.test(content)?'certificate':'source'):fields.certificateType==='testReport'?'environmentalReport':'certificate';
  if(kind==='bCertificate'&&!fields.bCertificateNumber&&fields.certificateNumber){fields.bCertificateNumber=fields.certificateNumber;for(const proof of sources.filter(s=>s.field==='certificateNumber'))sources.push({...proof,field:'bCertificateNumber'});}
  fields.evidence=[{kind,documentId:doc.id,verified:false}];
  const required={entity:['registeredName','creditCode'],qualification:['subjectName','certificateNumber','category','validUntil'],performance:['subjectName','contractNumber'],personnel:['name','certificateNumber','employer','validUntil'],product:['manufacturer','certificateNumber','coveredModels','validUntil']}[recordType];
  const missingFields=required.filter(key=>key==='name'?!explicitName:!fields[key]||(Array.isArray(fields[key])&&!fields[key].length));if(type==='auto'&&!autoType)missingFields.push('type');
  for(const key of rejectedFields)if((key==='name'?!explicitName:!fields[key])&&!missingFields.includes(key))missingFields.push(key);
  if(recordType==='product'&&fields.certificateType==='other')missingFields.push('certificateType');for(const field of ambiguousFields)if(!missingFields.includes(field))missingFields.push(field);
  const sourceComplete=extraction.complete!==false,ocr=group.parts.some(p=>p.block.kind==='ocr')||warnings.some(w=>/OCR/.test(w.code||'')&&(!w.page||group.parts.some(p=>p.block.page===w.page)));
  const status=conflicts.length?'conflict':missingFields.length||!sourceComplete||ocr?'pending':'complete';
  if(!sources.length)for(const part of group.parts)sources.push(source(doc,part,null,part.text.trim()));
  if(status!=='complete')warnings.push({documentId:doc.id,code:'COMPANY_FIELDS_PENDING',message:'证件缺失、不清楚、冲突或读取覆盖不足的信息需要核对',missingFields});
  candidates.push({id:randomUUID(),type:recordType,name:String(name||'未命名候选').slice(0,200),fields,documentIds:[doc.id],verified:false,sources,recognition:{status,missingFields,conflicts,sourceComplete}});
 }
 if(extraction.complete===false)warnings.push({documentId:doc.id,code:'COMPANY_EXTRACTION_INCOMPLETE',message:'原件读取不完整，已读取字段保留原文，缺失信息待核验'});
 if(!candidates.length)warnings.push({documentId:doc.id,code:'COMPANY_NO_CERTIFICATE',message:'未读取到证件文字，请核对原件'});
 return{candidates,warnings};
}

function identity(record){const f=record.fields||{},subject=record.type==='product'?f.manufacturer:record.type==='personnel'?(personName(record.name||'')?record.name:null):(f.subjectName||f.registeredName);const number=f.certificateNumber||f.bCertificateNumber||f.contractNumber||f.creditCode;const fallback=record.type==='product'?(f.coveredModels||f.model):null;if(!subject||(!number&&!fallback))return null;const personKeys=record.type==='personnel'?[canonical(f.employer||''),canonical([...new Set((f.evidence||[]).map(p=>p.kind))].sort())]:[];return[record.type,canonical(subject),...personKeys,canonical(f.certificateType||f.category||f.specialty||record.type),canonical(number||fallback)].join('::');}
const unique=(values,key=JSON.stringify)=>{const seen=new Map();for(const value of values)if(!seen.has(key(value)))seen.set(key(value),value);return[...seen.values()];};
function differences(a,b){return Object.keys(b.fields||{}).filter(k=>!['evidence','notes','validFrom','validUntil'].includes(k)&&a.fields?.[k]!==undefined&&b.fields[k]!==undefined&&canonical(a.fields[k])!==canonical(b.fields[k])).map(field=>({field,existingValue:a.fields[field],incomingValue:b.fields[field],sources:(b.sources||[]).filter(s=>s.field===field),resolved:false}));}
export function mergeCertificateCandidates(existing,candidates){
 const records=structuredClone(existing),importSummary={added:0,duplicates:0,renewals:0,conflicts:0,pending:0};
 for(const incoming of candidates){
  const candidate=structuredClone(incoming);candidate.verified=false;for(const conflict of candidate.recognition?.conflicts||[])conflict.resolved=false;for(const proof of candidate.fields?.evidence||[])proof.verified=false;
  const key=identity(candidate),matching=key?records.filter(r=>identity(r)===key):[];
  const same=matching.find(r=>(r.fields?.validFrom||'')===(candidate.fields?.validFrom||'')&&(r.fields?.validUntil||'')===(candidate.fields?.validUntil||''))||matching.at(-1);
  if(!same){records.push(candidate);importSummary.added++;}
  else{
   const conflicts=unique([...differences(same,candidate),...(candidate.recognition?.conflicts||[])]),dateChanges=['validFrom','validUntil'].filter(k=>same.fields?.[k]&&candidate.fields?.[k]&&same.fields[k]!==candidate.fields[k]);
   const renewal=!conflicts.length&&dateChanges.length&&candidate.fields.validUntil&&(!same.fields.validUntil||candidate.fields.validUntil>same.fields.validUntil)&&(!same.fields.validFrom||!candidate.fields.validFrom||candidate.fields.validFrom>same.fields.validFrom);
   if(renewal){candidate.recognition={...candidate.recognition,previousRecordId:same.id};records.push(candidate);importSummary.renewals++;}
   else if(conflicts.length||dateChanges.length){
    conflicts.push(...dateChanges.map(field=>({field,existingValue:same.fields[field],incomingValue:candidate.fields[field],sources:(candidate.sources||[]).filter(s=>s.field===field),resolved:false}))); 
    candidate.recognition={...candidate.recognition,status:'conflict',conflicts,previousRecordId:same.id};records.push(candidate);importSummary.conflicts++;
   }else{
    same.documentIds=unique([...(same.documentIds||[]),...(candidate.documentIds||[])],v=>v);same.sources=unique([...(same.sources||[]),...(candidate.sources||[])]);
    const evidence=same.fields?.evidence||[];same.fields.evidence=unique([...evidence,...(candidate.fields.evidence||[])],v=>`${v.kind}:${v.documentId}`);
    // Clear new facts may fill gaps, but a confirmed record's fields remain untouched.
    if(!same.verified)for(const [field,value]of Object.entries(candidate.fields))if(same.fields[field]===undefined)same.fields[field]=value;
    if(!same.verified&&same.recognition?.status==='pending'&&candidate.recognition?.status==='complete')same.recognition=structuredClone(candidate.recognition);
    importSummary.duplicates++;
   }
  }
  if(candidate.recognition?.status!=='complete')importSummary.pending++;
 }
 return{records,importSummary};
}
