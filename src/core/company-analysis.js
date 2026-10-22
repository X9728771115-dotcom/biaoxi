// Local evidence matching. Procurement clauses stay authoritative; company records
// and reference estimates never mark a procurement hard condition as satisfied.
import {buildQualificationReview,companyRecordFactGaps} from './qualification.js';
import {isCompanyArchiveRecord} from '../../public/company-record-kind.js';
import {hasNonScoringMethod} from '../../public/score-summary.js';
const clean=value=>String(value??'').normalize('NFKC').replace(/[\s\u200b]/g,'');
const unique=values=>[...new Set(values.filter(Boolean))];
const round=value=>Math.round(value*10000)/10000;
const groupName=value=>/商务/.test(value)?'商务':/附加/.test(value)?'附加':/报价|价格/.test(value)?'价格':/技术/.test(value)?'技术':/清单|计价/.test(value)?'清单':null;
const typeFor=item=>item.fields?.['用途']==='施工履约安全管理责任'?null:({entity:'entity',qualification:'qualification',performance:'performance',personnel:'personnel',eco:'product'})[item.categoryId]||(/业绩|合同案例/.test(clean(item.title+' '+item.standard))?'performance':/人员|项目经理|建造师/.test(clean(item.title))?'personnel':/材料|产品|品牌/.test(clean(item.title))?'product':null);
const proofLabels={contract:'合同',acceptanceReport:'验收报告',ownerProof:'业主证明',certificate:'资质证书',registration:'注册证',bCertificate:'B证',labor:'劳动合同',socialInsurance:'社保证明',license:'许可证',environmentalReport:'检测报告'};
const proofLabel=kind=>proofLabels[kind]||'证明材料';
function confirmedProof(record,kind){return(record.fields?.evidence||[]).some(proof=>proof.kind===kind&&proof.verified===true&&(record.documentIds||[]).includes(proof.documentId));}
function dateValue(text){const match=clean(text).match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?/);if(!match)return null;const value=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().startsWith(value)?value:null;}
function amountValue(raw,unit){return Number(raw.replace(/,/g,''))*({万元:10000,亿元:100000000,元:1}[unit]||1);}
function requirementClauses(text){
 const clauses=[];let start=0,depth=0;
 for(let index=0;index<text.length;index++){
  if(text[index]==='(')depth++;else if(text[index]===')')depth--;
  if(depth===0&&/[,，;；。]/.test(text[index])){clauses.push(text.slice(start,index));start=index+1;}
 }
 clauses.push(text.slice(start));return clauses.filter(Boolean);
}
// A small explicit proof grammar. AND binds inside a phrase; punctuation starts
// another required phrase, so a local OR cannot waive a later mandatory proof.
function materialExpression(value){
 const text=clean(value).replace(/(?:须|必须|应当|应|需|需要)?提供/g,'').replace(/^(?:且|并且|同时|以及|及|和)/,'');
 const tokens=[];let offset=0;
 while(offset<text.length){
  const remaining=text.slice(offset),atom=remaining.match(/^((?:加盖公章的?|盖章的?|有效的?)*)(合同(?:扫描件|复印件)?|验收(?:报告|证明|材料)(?:扫描件|复印件)?|业主证明(?:扫描件|复印件)?)/);
  if(atom){const kind=/^合同/.test(atom[2])?'contract':/^验收/.test(atom[2])?'acceptanceReport':'ownerProof';tokens.push({kind,stamped:/盖章|公章/.test(atom[1]),valid:/有效/.test(atom[1])});offset+=atom[0].length;continue;}
  const operator=remaining.match(/^(以及|并且|同时|且|及|和|、|,|，|或|\(|\))/);
  if(!operator)return{tree:null,gap:`证明材料条件未完整识别：${text.slice(offset)}`};
  tokens.push(operator[0]==='或'?'or':/[()]/.test(operator[0])?operator[0]:'and');offset+=operator[0].length;
 }
 let cursor=0;
 function primary(){const token=tokens[cursor++];if(token==='('){const node=alternative();if(tokens[cursor++]!==')')throw new Error('分组括号不完整');return node;}if(token&&typeof token==='object')return token;throw new Error('证明材料分组不完整');}
 function conjunction(){let node=primary();while(tokens[cursor]==='and'){cursor++;node={op:'and',children:[node,primary()]};}return node;}
 function alternative(){let node=conjunction();while(tokens[cursor]==='or'){cursor++;node={op:'or',children:[node,conjunction()]};}return node;}
 try{const tree=alternative();if(cursor!==tokens.length)throw new Error('存在未覆盖关系');return{tree,gap:null};}catch{return{tree:null,gap:'证明材料的且／或分组未完整识别'};}
}
const materialKinds=tree=>tree.kind?[tree.kind]:tree.children.flatMap(materialKinds);
function materialDescription(tree){return tree.kind?proofLabel(tree.kind):tree.children.map(child=>child.op&&child.op!==tree.op?`（${materialDescription(child)}）`:materialDescription(child)).join(tree.op==='or'?' 或 ':' 且 ');}
function materialIndex(value){
 const text=clean(value),names=text.match(/合同(?:扫描件|复印件)?|验收(?:报告|证明|材料)(?:扫描件|复印件)?|业主证明(?:扫描件|复印件)?|案例一览表|业绩一览表|证明材料/g)||[];
 const rest=text.replace(/合同(?:扫描件|复印件)?|验收(?:报告|证明|材料)(?:扫描件|复印件)?|业主证明(?:扫描件|复印件)?|案例一览表|业绩一览表|证明材料/g,'').replace(/以及|及|和|、|,|，/g,'');
 return names.length&&!rest?names:null;
}
function performanceSource(item){
 const raw=clean(item.standard||item.quote),readable=typeof item.readableStandard==='string'?clean(item.readableStandard):'';
 const cells=raw.split('|').map(clean).filter(Boolean),body=cells.indexOf(readable);
 if(!readable||!raw.includes('|')||body<0)return{text:raw,indexes:[]};
 const extras=[],indexes=[];
 for(const [index,cell] of cells.entries()){
  if(index===body||cell===clean(item.title)||[clean(item.group),clean(item.group)+'评审',clean(item.group)+'部分'].includes(cell))continue;
  if(index>body&&(/^(?:客观|主观)(?:评分|评审)?$/.test(cell)||/^\d+(?:\.\d+)?$/.test(cell)&&Number(cell)===item.maxScore))continue;
  const names=index>body?materialIndex(cell):null;if(names){indexes.push(...names);continue;}
  // Readable text is accepted only as a whole original cell. Other columns
  // containing extra instructions remain rule constraints, never disappear.
  extras.push(cell);
 }
 return{text:[readable,...extras].join(';'),indexes};
}
function performanceDescription(clause){
 const date='\\d{4}[年/-]\\d{1,2}[月/-]\\d{1,2}日?';
 const match=clause.match(new RegExp('^(?:供应商|投标人)?(?:须|必须|应当|应|需|需要)?(?:提供|具有|具备|完成)(?:'+date+'(?:(?:至|到)(?:今|'+date+')|起)?的?)?([\\u4e00-\\u9fff]{2,24}?)项目(?:合同案例|合同|案例|业绩)$'));
 if(!match)return null;
 const type=match[1].replace(/^(?:同类|类似)(?=.)/,'');return{projectType:/^(?:同类|类似)$/.test(match[1])?null:type};
}
function materialRequirements(item,points){
 const trees=[],gaps=[],remaining=[];
 const submissionGap=name=>gaps.push(name==='证明材料'?'证明材料具体内容及提交情况待核验':`${name}提交情况待核验`);
 for(const clause of requirementClauses(clean(item.standard||item.quote))){
  const withoutPoints=points?clause.replace(points[0],''):clause;
  if(!withoutPoints||performanceDescription(withoutPoints))continue;
  const marker=withoutPoints.match(/(?:须|必须|应当|应|需|需要)?提供/);
  if(!marker){remaining.push(withoutPoints);continue;}
  const prefix=withoutPoints.slice(0,marker.index).replace(/^(?:且|并且|同时)/,'');
  if(prefix&&!/^(?:注[:：]?)?(?:响应文件中|投标文件中)?$/.test(prefix)){remaining.push(prefix);}
  const expression=withoutPoints.slice(marker.index+marker[0].length).replace(/否则不得分$/,'');
  const indexNames=materialIndex(expression);if(indexNames?.every(name=>/^(?:案例一览表|业绩一览表|证明材料)$/.test(name))){indexNames.forEach(submissionGap);continue;}
  const result=materialExpression(expression);if(result.tree)trees.push(result.tree);if(result.gap)gaps.push(result.gap);
 }
 // The existing parser also emits a name-only index derived from the standard.
 // Bare names already covered by its expression cannot add a second AND rule.
 // New materials and explicit instructions/relationships remain constraints.
 const standardKinds=unique(trees.flatMap(materialKinds));
 for(const value of item.materials||[]){
  if(typeof value!=='string'){gaps.push('证明材料列包含无法识别的条件');continue;}
  const clauses=requirementClauses(clean(value));
  for(const clause of clauses){
   const indexNames=materialIndex(clause);if(indexNames?.every(name=>/^(?:案例一览表|业绩一览表|证明材料)$/.test(name))){indexNames.forEach(submissionGap);continue;}
   const result=materialExpression(clause),bareName=/^(?:合同(?:扫描件|复印件)?|验收(?:报告|证明|材料)(?:扫描件|复印件)?|业主证明(?:扫描件|复印件)?)$/.test(clause);
   if(bareName&&result.tree?.kind&&standardKinds.includes(result.tree.kind))continue;
   if(result.tree)trees.push(result.tree);if(result.gap)gaps.push(result.gap);
  }
 }
 return{trees,kinds:unique(trees.flatMap(materialKinds)),gaps,remaining:remaining.join(';')};
}
function proofSatisfied(record,tree){
 if(tree.kind)return(record.fields?.evidence||[]).some(proof=>proof.kind===tree.kind&&proof.verified===true&&(record.documentIds||[]).includes(proof.documentId)&&(!tree.stamped||proof.stamped===true)&&(!tree.valid||proof.valid===true));
 return tree.op==='and'?tree.children.every(child=>proofSatisfied(record,child)):tree.children.some(child=>proofSatisfied(record,child));
}
function performanceRule(item,{scoring=true}={}){
 const source=performanceSource(item),text=source.text;const project=text.match(/(?:提供|具有|具备|完成|同类|类似)?([\u4e00-\u9fff]{2,24}?)项目(?:业绩|合同|案例)/);
 let projectType=project?.[1]?.replace(/^.*[：:|]/,'').replace(/^(?:供应商提供|供应商|须提供|提供|具有|具备|完成|类似|同类)/,'');if(!projectType||/^(?:同类|类似)$/.test(projectType)||/\d|至今/.test(projectType))projectType=null;
 const description=requirementClauses(text).map(performanceDescription).find(Boolean);if(description)projectType=description.projectType;
 const dateRanges=[...text.matchAll(/\d{4}年\d{1,2}月(?:\d{1,2}日)?|\d{4}[-/]\d{1,2}[-/]\d{1,2}/g)].map(match=>{const raw=match[0],month=raw.match(/^(\d{4})年(\d{1,2})月$/);return{raw,value:month?`${month[1]}-${month[2].padStart(2,'0')}-01`:dateValue(raw),precision:month?'month':'day'};}).filter(date=>date.value);
 const dates=dateRanges.map(date=>date.value),start=dates[0]||null,end=dates[1]||null;const dateBasis=/合同签订(?:时间|日期)|签订合同(?:时间|日期)/.test(text);
 const amount=text.match(/(?:合同)?金额(?:不低于|不少于|至少|达到|≥)[：:]?([\d,.]+)(万元|亿元|元)/);
 const points=text.match(/每(?:提供)?(?:\d+个?|个|项)(?:合同|业绩|项目)?(?:得|计|加)(\d+(?:\.\d+)?)分/);
 const material=materialRequirements({...item,standard:text,materials:unique([...(item.materials||[]),...source.indexes])},points),kinds=material.kinds;
 const unsupported=/近\d+年|最近|同类|类似/.test(text)&&!projectType||/(?:除外|免除|任选|二选一|如属|若属|每满|累计)/.test(text)||(/金额/.test(text)&&!amount)||(/验收时间|竣工日期/.test(text)&&!dateBasis);
 const gaps=[...material.gaps];if(!projectType)gaps.push('同类项目类型口径未明确');if(start&&!dateBasis)gaps.push(`日期用途或计算口径未明确：原文起点${dateRanges[0].raw}，不能直接推定为合同签订日`);if(scoring&&!points)gaps.push('逐项计分规则未完整识别');if(!kinds.length)gaps.push('证明材料条件未完整识别');if(unsupported)gaps.push('条件或例外仍须逐条核验');
 let uncovered=material.remaining;
 if(project)uncovered=uncovered.replace(project[0],'');
 uncovered=uncovered.replace(/\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?(?:(?:至|到)(?:今|\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?)|起)?/g,'').replace(/(?:时间)?以?合同签订(?:时间|日期)(?:为准)?/g,'');
 if(amount)uncovered=uncovered.replace(amount[0],'');
 uncovered=uncovered.replace(/(?:最高|最多|满分|上限|总分)(?:得)?\d+(?:\.\d+)?分/g,'').replace(/客观(?:评分)?|否则不得分|未提供不得分|缺项不得分/g,'').replace(/[;:|,，、。.()]/g,'');
 if(uncovered)gaps.push(`未覆盖的业绩条件：${uncovered}`);
 const perCount=Number(text.match(/每(?:提供)?(\d+)个?(?:合同|业绩|项目)/)?.[1]||1);
 return{projectType,start,end,dateBasis,dateRanges,scoring,perCount,minAmount:amount?amountValue(amount[1],amount[2]):null,points:points?Number(points[1]):null,kinds,materialGroups:material.trees,gaps:unique(gaps),complete:!gaps.length};
}
function contractIdentity(record,date,subjectKey){
 const f=record.fields||{};
 return{number:f.contractNumber?`${subjectKey}:${clean(f.contractNumber)}`:null,
  content:f.clientName&&date&&Number.isFinite(f.amount)?`${subjectKey}:${date}:${f.amount}:${clean(f.clientName)}`:null,
  documents:unique((f.evidence||[]).filter(proof=>proof.kind==='contract'&&proof.verified===true&&(record.documentIds||[]).includes(proof.documentId)).map(proof=>proof.documentId)),
  date,amount:f.amount,client:clean(f.clientName)};
}
function contractRelation(first,second){
 // Different confirmed contract numbers establish different contracts even if
 // one PDF contains both and their dates, parties and amounts happen to match.
 if(first.number&&second.number&&first.number!==second.number)return'distinct';
 if(first.number&&first.number===second.number){
  if(first.date!==second.date||(Number.isFinite(first.amount)&&Number.isFinite(second.amount)&&first.amount!==second.amount)||(first.client&&second.client&&first.client!==second.client))return'uncertain';
  return'duplicate';
 }
 if(first.content&&first.content===second.content)return first.documents.some(documentId=>second.documents.includes(documentId))?'duplicate':'uncertain';
 return'distinct';
}
function performanceRecords(item,records,subjectNames=[],asOf=null,options={}){
 const rule=performanceRule(item,options),seen=[];
 const results=records.map(record=>{
  const f=record.fields||{},missing=[...rule.gaps],reasons=[];let excluded=false;
  if(record.verified!==true)missing.push('企业条目尚未人工确认');
  if(!f.subjectName)missing.push('缺合同主体');else if(!subjectNames.includes(clean(f.subjectName)))missing.push('合同主体与所选企业不一致，须核验');
  if(!f.contractDate)missing.push('缺合同签订日期');if(!f.projectType)missing.push('缺业绩项目类型');
  if(!record.documentIds?.length)missing.push('缺关联原件');
  if(rule.projectType&&f.projectType&&clean(f.projectType)!==clean(rule.projectType)){missing.push('业绩类型不符合本项明确类型');excluded=record.verified===true;}
  const date=dateValue(f.contractDate);if(f.contractDate&&!date)missing.push('合同日期无效');if(rule.dateBasis&&rule.start&&date&&date<rule.start){missing.push('合同签订日期早于规定起点');excluded=record.verified===true;}
  if(rule.dateBasis&&rule.end&&date&&date>rule.end){missing.push('合同签订日期晚于规定终点');excluded=record.verified===true;}
  if(rule.dateBasis&&/至今/.test(clean(item.standard||item.quote))){if(!asOf)missing.push('至今日期终点需核验');else if(date&&date>asOf){missing.push('合同签订日期晚于本次分析日期');excluded=record.verified===true;}}
  if(rule.minAmount!==null){if(!Number.isFinite(f.amount))missing.push('缺合同金额');else if(f.amount<rule.minAmount){missing.push('合同金额低于规定下限');excluded=record.verified===true;}}
  for(const group of rule.materialGroups)if(!proofSatisfied(record,group))missing.push(`缺已确认材料组：${materialDescription(group)}`);
  const identity=contractIdentity(record,date,subjectNames[0]);
  if(!identity.number&&!identity.content)missing.push('缺合同唯一识别信息，无法去重');
  const eligible=!missing.length;
  if(eligible){
   const duplicate=seen.find(previous=>contractRelation(previous,identity)==='duplicate');
   if(duplicate){missing.push(rule.scoring?'同一合同重复，不重复计分':'同一合同重复，不重复作为资格业绩');excluded=true;duplicate.number ||= identity.number;duplicate.documents=unique([...duplicate.documents,...identity.documents]);}
   else if(seen.some(previous=>contractRelation(previous,identity)==='uncertain'))missing.push(rule.scoring?'合同唯一性或标识一致性待核验，不合并也不重复计分':'合同唯一性或标识一致性待核验，不重复作为资格业绩');
   else seen.push(identity);
  }
  if(!missing.length&&!excluded)reasons.push(rule.scoring?'条目、类型、合同日、金额和全部适用证明已确认；仅作规则资料支持预计':'条目及适用业绩证据已确认；采购资格要求仍须人工核验');
  return{...structuredClone(record),status:excluded?'excluded':missing.length?'candidate':'supported',missing:unique(missing),reasons,evidenceIds:unique((f.evidence||[]).filter(p=>p.verified===true&&(record.documentIds||[]).includes(p.documentId)).map(p=>p.documentId))};
 });
 return{records:results,rule};
}
function proofMentions(value){
 const pattern=/劳动(?:关系证明|合同)|社保(?:证明|材料)|社会保险(?:证明|材料)|安全生产考核合格证书\(?B\)?类?|B(?:类)?证(?:书)?|注册[^，,；;。|]{0,20}建造师证书|(?:建造师)?(?:电子)?注册证(?:书)?|建造师证书|验收(?:报告|证明|材料)(?:扫描件|复印件)?|业主证明|检测报告|营业执照|安全生产许可证|许可证|资质证书|资格证书|认证证书|证书|合同(?:扫描件|复印件|原件|证明)?/g;
 const text=clean(value);
 // The contract in a declaration of capability is its purpose, not an original
 // being submitted. Explicit contract originals/scans still have their suffix.
 return[...text.matchAll(pattern)].filter(match=>!(match[0]==='合同'&&/履行$/.test(text.slice(0,match.index)))).map(match=>{const name=match[0];let kind=/劳动/.test(name)?'labor':/社保|社会保险/.test(name)?'socialInsurance':/安全生产考核|^B/.test(name)?'bCertificate':/注册|建造师/.test(name)?'registration':/^验收/.test(name)?'acceptanceReport':/^业主/.test(name)?'ownerProof':/^检测/.test(name)?'environmentalReport':/执照|许可证/.test(name)?'license':/证书/.test(name)?'certificate':'contract';return{kind,name,index:match.index};});
}
function proofOwner(text,initial=null){
 const markers=[...text.matchAll(/企业资质|供应商|投标人|项目经理资质|拟派(?:项目经理|人员)|项目经理|建造师|个人|所投产品|产品/g)];
 if(!markers.length)return initial;const last=markers.at(-1)[0];return/项目经理|拟派|建造师|个人/.test(last)?'personnel':/产品/.test(last)?'product':'enterprise';
}
function generalProofRequirements(item,type){
 const text=clean(item.quote||item.standard),subject=clean(item.subject||item.fields?.['适用主体']),target=type==='personnel'?'personnel':type==='product'?'product':'enterprise';
 const initial=/供应商|投标人/.test(subject)&&/项目经理|人员|个人/.test(subject)?null:proofOwner(subject),required=new Set(),uncertain=new Set(),occurrences=[];
 let inherited=initial,carriedSubmission=false,submissionOwner=null;
 const add=(mention,owner)=>{if(/营业执照|安全生产许可证/.test(mention.name))owner='enterprise';if(owner===target)required.add(mention.kind);else if(!owner)uncertain.add(mention.kind);};
 const parts=text.split(/([。；;，,|])/);
 for(let index=0;index<parts.length;index+=2){
  const clause=parts[index],mentions=proofMentions(clause),owner=proofOwner(clause,inherited);let remainder=clause;
  for(const mention of [...mentions].reverse())remainder=remainder.slice(0,mention.index)+remainder.slice(mention.index+mention.name.length);
  const nameList=mentions.length>0&&!remainder.replace(/、|以及|及|和/g,'');
  const materialContext=/提供|提交|出具|扫描件|复印件|原件|证明/.test(clause)||(carriedSubmission&&nameList&&owner===submissionOwner);
  for(const mention of mentions){const mentionOwner=proofOwner(clause.slice(0,mention.index),inherited);occurrences.push({...mention,owner:mentionOwner});if(materialContext)add(mention,mentionOwner);}
  inherited=owner;
  // A comma list can inherit the directive; a new subject, full stop, semicolon
  // or non-list statement cannot borrow another material's submission context.
  carriedSubmission=materialContext&&/^[，,]$/.test(parts[index+1]||'');submissionOwner=owner;
 }
 // Structured proof lists supply submission context, but do not move an
 // enterprise permit into a person's missing documents in a mixed clause.
 for(const value of [...(item.fields?.['证明材料']||[]),...(item.materials||[])])for(const mention of proofMentions(value)){
  const owners=unique(occurrences.filter(found=>found.kind===mention.kind).map(found=>found.owner));
  const owner=owners.length===1?owners[0]:owners.length?null:initial;add(mention,owner);
 }
 return{required:[...required],uncertain:[...uncertain].filter(kind=>!required.has(kind))};
}
function generalRecords(item,records,subjectNames=[],asOf=null){
 const text=clean(item.quote||item.standard);
 return records.map(record=>{const f=record.fields||{},missing=[],proofs=generalProofRequirements(item,record.type);if(record.verified!==true)missing.push('企业条目尚未人工确认');if(!record.documentIds?.length)missing.push('缺关联原件');for(const kind of proofs.required)if(!confirmedProof(record,kind))missing.push(`缺已确认材料：${proofLabel(kind)}`);for(const kind of proofs.uncertain)missing.push(`材料归属待核：${proofLabel(kind)}`);
  missing.push(...companyRecordFactGaps(item,record,subjectNames,asOf));
  if(/有效/.test(text)&&!f.validUntil)missing.push('证书有效期待核验');
  if(record.type==='personnel'){
   if(!f.role)missing.push('缺拟派岗位');if(/专业|建造师/.test(text)&&!f.specialty)missing.push('缺专业');if(/级|建造师/.test(text)&&!f.grade)missing.push('缺证书等级');if(/B[)）]?类|B证/.test(text)&&!f.bCertificateNumber)missing.push('缺B类证书编号');if(/本单位|本企业/.test(text)&&f.registeredHere!==true)missing.push('本单位注册待核验');if(/不兼职|无在建|不得兼任/.test(text)&&f.noConcurrentProject!==true)missing.push('项目占用与兼职限制待核验');if(/一级.*电子/.test(text)&&/一|1/.test(clean(f.grade))&&f.electronicCertificate!==true)missing.push('一级电子证书形式待核验');
  }
  if(record.type==='product'){if(!f.brand)missing.push('缺品牌');if(!f.model)missing.push('缺型号');if(/环保性能|环保要求|检测/.test(text)&&!confirmedProof(record,'environmentalReport'))missing.push('环保性能检测原件待核验');}
  missing.push('专业、等级、有效期、主体及复合条件须按原文逐项人工核验');
  return{...structuredClone(record),status:'candidate',missing:unique(missing),reasons:[],evidenceIds:unique((f.evidence||[]).filter(p=>p.verified===true&&(record.documentIds||[]).includes(p.documentId)).map(p=>p.documentId))};
 });
}
const scopedKey=item=>JSON.stringify([item.scope?.documentId||item.references?.[0]?.documentId||null,item.scope?.package||item.package||null,item.scope?.phase||'response']);
export function companyScoreItems(report){const pending=new Set((report.categories||[]).flatMap(c=>c.items||[]).filter(item=>item.source==='ai'&&item.reviewed!==true).map(item=>item.id));return [...new Map((report.analysis?.scoring?.items||[]).filter(item=>!pending.has(item.id)).map(item=>[item.id,item])).values()];}
export function hasConfirmedCompanyFacts(report){
 const snapshot=report.companySnapshot;
 return Boolean(snapshot?.id&&snapshot?.name&&(snapshot.records||[]).some(record=>!isCompanyArchiveRecord(record)&&record.verified===true&&(record.fields?.evidence||[]).some(proof=>proof.kind!=='source'&&proof.verified===true&&(record.documentIds||[]).includes(proof.documentId))));
}
export function companyScopePending(report){const scoring=report.analysis?.scoring;if(!scoring)return true;const items=companyScoreItems(report);return!scoring.status||items.some(item=>!item.scope?.documentId&&!item.references?.some(reference=>reference.documentId))||(scoring.packages?.length||0)>1||scoring.packages?.some(p=>p.scope?.mixedPackages)||new Set(items.map(scopedKey)).size>1||/待核验|不一致|缺口|未识别/.test(scoring.status);}
export function buildCompanyAnalysis(report){
 const analysis=report.analysis?.scoring?{...report.analysis,scoring:{...report.analysis.scoring,items:companyScoreItems(report)}}:report.analysis;
 report={...report,...(analysis?{analysis}:{}),categories:(report.categories||[]).map(category=>({...category,items:(category.items||[]).filter(item=>item.source!=='ai'||item.reviewed===true)}))};
 const snapshot=report.companySnapshot,companyRecords=(snapshot?.records||[]).filter(record=>!isCompanyArchiveRecord(record)),subjectNames=unique([clean(snapshot?.name),...companyRecords.filter(r=>r.type==='entity'&&r.verified===true&&confirmedProof(r,'license')).map(r=>clean(r.fields?.registeredName))]),asOf=dateValue(report.createdAt),all=(report.categories||[]).flatMap(c=>c.items||[]);
 const qualification=buildQualificationReview(report);
 const matches=snapshot?all.filter(item=>typeFor(item)).map(item=>{
  const type=typeFor(item),notApplicable=item.applicability==='not-required'||item.matchStatus==='not-applicable';
  const applicable=companyRecords.filter(record=>record.type===type),scoring=companyScoreItems(report).some(score=>score.id===item.id)||(!hasNonScoringMethod(report)&&/评分|计分|得\d+(?:\.\d+)?分/.test(clean(item.fields?.['用途']+' '+item.quote))),results=notApplicable?[]:type==='performance'?performanceRecords(item,applicable,subjectNames,asOf,{scoring}).records:generalRecords(item,applicable,subjectNames,asOf);
  return{findingId:item.id,title:item.title,type,status:notApplicable?'not-applicable':results.length&&results.every(r=>r.status==='supported')?'supported':'candidate',records:results,missing:unique(results.flatMap(r=>r.missing).concat(!notApplicable&&!results.length?['企业快照缺对应资料']:[])),reasons:notApplicable?['本条明确不需要或不涉及，保留适用范围']:['企业资料匹配不代替采购条款人工复核'],references:item.references||[]};
 }):[];
 if(hasNonScoringMethod(report)){
  const reason=report.analysis.scoring.explanation||'文件明确采用最低价评审，未列计分表，得分预测不适用。';
  return{companyId:snapshot?.id||null,companyName:snapshot?.name||'',qualification,matches,scoreRows:[],forecast:{status:'not-applicable',reason,totalRange:null,assumedScore:null,evidenceSupportedScore:null,referenceScore:null,pendingMaxScore:null,business:null,scenario:null},screening:{status:'not-applicable',scoreStatus:'not-applicable',reason,threshold:null,internalRule:false,numerator:null,denominator:null,ratio:null,hardGate:qualification.hardGate,internalScreening:null},assumptions:['企业资格及原件仍须按文件逐项核验，最低价法不免除资格与实质性审查。']};
 }
 const scoreRows=companyScoreItems(report).map(item=>{
  const text=clean(item.standard),group=groupName(item.group),type=typeFor(item),objective=/客观/.test(text)&&!/主观/.test(text),materials=item.materials||[];
  const ownRecords=companyRecords.filter(record=>record.type===type);const evaluated=type==='performance'?performanceRecords(item,ownRecords,subjectNames,asOf):{records:type?generalRecords(item,ownRecords,subjectNames,asOf):[],rule:null};
  const records=evaluated.records,missing=unique([...(evaluated.rule?.gaps||[]),...records.flatMap(r=>r.status==='candidate'?r.missing:[])]);let expectedScore=null,confirmedScore=0;const reasons=[];
  // These are distinct entries in the original scoring table. The bill item
  // may live in the business group, so classify by its own title as well.
  const billItem=group==='清单'||/组价合理性|清单(?:编制|报价|计价)|报价合理性|工程量清单|报价明细/.test(clean(item.title));
  const companyEvidence=/业绩|经验|合同案例|资质|资格|证书|认证|获奖|荣誉|专利|人员|项目经理|合同(?:扫描件|复印件)|验收报告/.test(clean(item.title+' '+item.standard+' '+materials.join(' ')));
  const assumedFull=['技术','价格'].includes(group)||billItem&&!companyEvidence;
  if(billItem&&companyEvidence)missing.push('本项含企业业绩、资格或复合证明条件，不能因清单或报价关键词按整项满分假设，须按原文核验或拆分');
  const maxScore=Number.isFinite(item.maxScore)?item.maxScore:null;
  if(!assumedFull&&objective&&type==='performance'&&evaluated.rule.complete===true&&maxScore!==null){
   confirmedScore=Math.min(maxScore,Math.floor(records.filter(r=>r.status==='supported').length/evaluated.rule.perCount)*evaluated.rule.points);
  }
  if(objective&&type==='performance'&&records.length&&evaluated.rule.complete===true&&!records.some(r=>r.status==='candidate')&&Number.isFinite(item.maxScore)){
   expectedScore=Math.min(item.maxScore,Math.floor(records.filter(r=>r.status==='supported').length/evaluated.rule.perCount)*evaluated.rule.points);reasons.push('客观规则预计仅使用已人工确认且材料齐备的去重合同');
  }else if(objective)reasons.push('客观规则或证据未完整确认，保持待核验');else reasons.push('主观评审或报价公式不能推定实际专家得分');
  if(type&&!records.length)missing.push('企业快照缺对应资料');
  const assessment=(report.scoreAssessments||[]).find(a=>a.scoreId===item.id);const validReference=assessment&&Number.isFinite(assessment.estimatedScore)&&assessment.estimatedScore>=0&&assessment.estimatedScore<=item.maxScore&&typeof assessment.reason==='string'&&assessment.reason.trim().length>=8;
  const referenceScore=validReference?assessment.estimatedScore:null;if(validReference)reasons.push(`人工参考估计：${assessment.reason}`);
  const assumedScore=assumedFull?maxScore:null,conditionalScore=!assumedFull&&expectedScore===null&&validReference?referenceScore:null;
  let upper=maxScore;
  if(!assumedFull&&objective&&type==='performance'&&evaluated.rule.complete===true&&records.length&&maxScore!==null){
   upper=Math.min(maxScore,Math.floor(records.filter(record=>record.status!=='excluded').length/evaluated.rule.perCount)*evaluated.rule.points);
   if(validReference&&expectedScore===null)upper=Math.max(upper,referenceScore);
  }
  const range=maxScore===null?null:assumedFull?{min:maxScore,max:maxScore}:{min:expectedScore??confirmedScore,max:expectedScore??upper};
  if(!assumedFull&&expectedScore===null)reasons.push(objective?'区间下限只计已确认资料；上限保留未核证据及规则口径，未知不等于实际零分':'主观区间保留0至本项满分；人工参考点不代表专家得分，也不缩窄未核验范围');
  return{scoreId:item.id,title:item.title,group:group||item.group,maxScore,expectedScore:assumedFull?null:expectedScore,referenceScore,confirmedScore:assumedFull?0:confirmedScore,conditionalScore,assumedScore,calculationKind:assumedFull?'assumed-full':objective?'objective':'subjective',range,gap:range?round(maxScore-range.min):null,status:assumedFull?'assumed-full':expectedScore!==null?'rule-supported':validReference?'reference':'pending',objective,reasons:assumedFull?['按本次技术、清单及报价对应评分项满分作测算假设；在原评分组内只计一次，不是企业已确认得分']:reasons,missing:unique(missing),recordIds:records.map(r=>r.id),records,evidenceIds:unique([...records.flatMap(r=>r.evidenceIds||[]),...(validReference?assessment.evidenceIds||[]:[])]),materials,references:item.references||[],scope:item.scope||null};
 });
 const scopePending=companyScopePending(report)||!scoreRows.length,unknownMax=scoreRows.some(r=>r.maxScore===null||!groupName(r.group));const scoreValue=row=>row.expectedScore??row.referenceScore;
 const business=scoreRows.filter(row=>['商务','附加'].includes(row.group));const denominator=business.reduce((n,row)=>n+(row.maxScore||0),0);const businessValue=row=>row.assumedScore??scoreValue(row),businessUnknown=business.some(row=>businessValue(row)===null);
 const numerator=!scopePending&&!unknownMax&&!businessUnknown?business.reduce((n,row)=>n+businessValue(row),0):null;
 const ratio=denominator>0&&numerator!==null?numerator/denominator:null;
 const scoreStatus=scopePending||unknownMax?'pending':denominator===0?'not-applicable':ratio===null?'pending':'estimated';
 const hardGate=qualification.hardGate;
 const internalScreening={threshold:0.95,enforced:false,numerator,denominator:scopePending||unknownMax?null:denominator,ratio,status:scopePending||unknownMax?'pending':denominator===0?'not-applicable':ratio===null?'pending':ratio>=0.95?'pass':'below-threshold',reason:'95%仅作独立企业内部提示，不改变资格状态或投标结论'};
 const screening={threshold:0.95,internalRule:true,numerator,denominator:internalScreening.denominator,ratio,scoreStatus,status:hardGate.status==='unmet'?'blocked':scoreStatus==='not-applicable'?'not-applicable':hardGate.status==='pending'?'pending':scoreStatus,reason:hardGate.status==='unmet'?'已确认硬门槛不满足，高分不能抵消':scopePending||unknownMax?'采购包、版本或评分规则尚未唯一完整确定':hardGate.status==='pending'?'资格及实质性要求仍待核验；得分区间与内部比例独立展示':'得分测算供决策参考；不以内部比例替代资格判断',hardGate,internalScreening};
 const aggregateReady=!scopePending&&!unknownMax;
 const evidenceSupportedScore=aggregateReady?round(scoreRows.reduce((n,row)=>n+row.confirmedScore,0)):null,referenceScore=aggregateReady?round(scoreRows.reduce((n,row)=>n+(row.conditionalScore??0),0)):null;
 const technicalMax=round(scoreRows.filter(row=>row.group==='技术').reduce((n,row)=>n+(row.maxScore||0),0)),priceMax=round(scoreRows.filter(row=>row.group==='价格').reduce((n,row)=>n+(row.maxScore||0),0));
 const assumedScore=aggregateReady?round(scoreRows.reduce((sum,row)=>sum+(row.assumedScore??0),0)):null,billMax=round(scoreRows.filter(row=>row.assumedScore!==null&&!['技术','价格'].includes(row.group)).reduce((sum,row)=>sum+row.assumedScore,0));
 const totalRange=!scopePending&&!unknownMax?{min:round(scoreRows.reduce((sum,row)=>sum+row.range.min,0)),max:round(scoreRows.reduce((sum,row)=>sum+row.range.max,0))}:null;
 const total=!scopePending&&!unknownMax&&!businessUnknown?round(scoreRows.reduce((sum,row)=>sum+(row.assumedScore??scoreValue(row)??0),0)):null;
 const summarizeRows=rows=>aggregateReady?{maxScore:round(rows.reduce((sum,row)=>sum+(row.maxScore??0),0)),assumedScore:round(rows.reduce((sum,row)=>sum+(row.assumedScore??0),0)),confirmedScore:round(rows.reduce((sum,row)=>sum+row.confirmedScore,0)),conditionalScore:round(rows.reduce((sum,row)=>sum+(row.conditionalScore??0),0)),pendingMaxScore:round(rows.reduce((sum,row)=>sum+(row.assumedScore===null&&row.expectedScore===null?Math.max(0,(row.maxScore??0)-row.confirmedScore):0),0)),gap:round(rows.reduce((sum,row)=>sum+(row.assumedScore===null?Math.max(0,(row.maxScore??0)-row.confirmedScore):0),0)),range:{min:round(rows.reduce((sum,row)=>sum+row.range.min,0)),max:round(rows.reduce((sum,row)=>sum+row.range.max,0))}}:{maxScore:null,assumedScore:null,confirmedScore:null,conditionalScore:null,pendingMaxScore:null,gap:null,range:null};
 const businessSummary=summarizeRows(business);
 const assumptions=['企业资料为本报告分析时快照，修改企业库不改变旧报告','客观预计要求条目与每份适用材料已人工确认；缺证据保持待核验，区间下限不是实际零分判定','主观估计仅为有理由的人工参考，不代表真实专家得分','技术、清单及报价对应评分项满分仅为测算假设，各项在原评分组内只计一次','95%仅为独立企业内部提示，不直接否决投标，不改变资格状态','5%等价格优惠仅处理评审价格，不能当附加得分','资格及废标硬门槛优先，高分不可抵消已确认不满足'];
 return{companyId:snapshot?.id||null,companyName:snapshot?.name||'',qualification,matches,scoreRows,forecast:{status:totalRange===null?'pending':total===null?'range':'scenario',assumedScore,evidenceSupportedScore,referenceScore,pendingMaxScore:summarizeRows(scoreRows).pendingMaxScore,totalRange,business:businessSummary,scenario:{technicalMax:aggregateReady?technicalMax:null,billMax:aggregateReady?billMax:null,priceMax:aggregateReady?priceMax:null,total,totalRange,assumptions:['技术满分假设（包含人员分）','清单及组价对应评分项满分假设（保留原评分组，只计一次）','报价满分假设（其他报价未知，不计算实际报价得分）']}},screening,assumptions};
}
