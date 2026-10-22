// Qualification review uses the immutable report snapshot. A missing record is
// unknown; only a reviewed hard failure can establish non-compliance.
import {isCompanyArchiveRecord} from '../../public/company-record-kind.js';
const clean=value=>String(value??'').normalize('NFKC').replace(/[\s\u200b]/g,'');
const unique=values=>[...new Set(values.filter(Boolean))];
export function personnelRelationshipNeeds(value){
 const text=clean(value),clauses=text.split(/[。；;]/).filter(clause=>!/无需|无须|不要求/.test(clause));
 return {labor:clauses.some(clause=>/劳动(?:关系|(?:和|及|与|、)(?:社保|社会保险)关系)/.test(clause)),socialInsurance:clauses.some(clause=>/(?:社保|社会保险)关系/.test(clause))};
}
const definitions=[
 {id:'business-license',label:'营业执照',finding:item=>item.categoryId==='entity'||/营业执照|独立承担民事责任/.test(clean(item.quote)),record:record=>record.type==='entity',proofs:['license']},
 {id:'construction-qualification',label:'企业资质',finding:item=>/企业资质|施工总承包|专业承包|建筑业企业资质/.test(clean(item.quote))||item.categoryId==='qualification'&&/资质/.test(clean(item.title+' '+item.quote))&&!/安全生产许可证/.test(clean(item.title+' '+item.quote)),record:record=>record.type==='qualification'&&!/安全生产许可/.test(clean(record.name+' '+record.fields?.category)),proofs:['certificate']},
 {id:'safety-license',label:'安全生产许可',finding:item=>/安全生产许可证/.test(clean(item.quote)),record:record=>record.type==='qualification'&&/安全生产许可/.test(clean(record.name+' '+record.fields?.category+' '+(record.sources||[]).map(source=>source.quote).join(' '))),proofs:['license','certificate']},
 {id:'personnel',label:'人员',finding:item=>item.categoryId==='personnel'&&/项目经理|建造师|拟派|人员资格/.test(clean(item.title+' '+item.quote))||/项目经理资质|拟派项目经理/.test(clean(item.quote)),record:record=>record.type==='personnel',proofs:['registration','certificate']},
 {id:'performance',label:'业绩',finding:item=>item.categoryId==='performance'||/业绩|合同案例/.test(clean(item.title)),record:record=>record.type==='performance',proofs:['contract']}
];
// Both the displayed matcher and the qualification gate use these same known
// facts. Reviewed clause text cannot override a conflicting original record.
export function companyRecordFactGaps(item,record,subjectNames=[],asOf=null){
 const fields=record.fields||{},text=clean(item.quote||item.standard),missing=[];
 const owner=record.type==='entity'?fields.registeredName||fields.subjectName:record.type==='personnel'?fields.employer:fields.subjectName;
 if(!clean(owner))missing.push(record.type==='personnel'?'缺注册单位主体':'缺资料主体');
 else if(!subjectNames.includes(clean(owner)))missing.push(record.type==='personnel'?'注册单位主体与所选企业不一致':'资料主体与所选企业不一致');
 if(fields.validFrom&&asOf&&fields.validFrom>asOf)missing.push('证书在本次分析日期尚未生效');
 if(fields.validUntil&&asOf&&fields.validUntil<asOf)missing.push('证书有效期已早于本次分析日期');
 if(/有效/.test(text)&&['qualification','personnel'].includes(record.type)&&!fields.validUntil)missing.push('证书有效期待核验');
 if(record.type==='personnel'){
  const relationship=personnelRelationshipNeeds(text),hasProof=kind=>(fields.evidence||[]).some(proof=>proof.kind===kind&&proof.verified===true&&(record.documentIds||[]).includes(proof.documentId));
  if(relationship.labor&&!hasProof('labor'))missing.push('劳动关系待核验：缺已确认的劳动关系原件');
  if(relationship.socialInsurance&&!hasProof('socialInsurance'))missing.push('社保关系待核验：缺已确认的个人社保原件');
  const managerAt=text.search(/(?:拟派)?项目经理(?:资质)?|拟派人员/),personalText=managerAt<0?text:text.slice(managerAt);
  const specialty=personalText.match(/[（(]([^（）()，,；;]{2,20})专业[）)]/)?.[1]||personalText.match(/(建筑工程|市政公用工程|机电工程|公路工程|水利水电工程|铁路工程|矿业工程|通信与广电工程|民航机场工程|港口与航道工程)专业/)?.[1];
  if(specialty&&fields.specialty&&clean(fields.specialty)!==specialty)missing.push('专业不符合原文要求');
  const ranks={'一':1,'二':2,'三':3,'四':4,'1':1,'2':2,'3':3,'4':4},required=personalText.match(/([一二三四1-4])级(?:及以上|以上)/)?.[1],actual=clean(fields.grade).match(/([一二三四1-4])级/)?.[1];
  if(required&&actual&&ranks[actual]>ranks[required])missing.push('等级不符合原文最低要求');
 }
 return unique(missing);
}
function confirmedRecord(record,definition,report,requirements){
 if(record.verified!==true||record.recognition?.sourceComplete===false||(record.recognition?.conflicts||[]).some(conflict=>conflict.resolved!==true))return false;
 const fields=record.fields||{},company=report.companySnapshot;
 const aliases=unique([clean(company?.name),...(company?.records||[]).filter(row=>row.type==='entity'&&row.verified===true&&(row.fields?.evidence||[]).some(proof=>proof.kind==='license'&&proof.verified===true&&(row.documentIds||[]).includes(proof.documentId))).map(row=>clean(row.fields?.registeredName))]);
 const asOf=String(report.createdAt||'').slice(0,10);
 if(requirements.some(item=>companyRecordFactGaps(item,record,aliases,asOf).length))return false;
 const text=clean(requirements.map(item=>item.quote).join(' '));
 const hasProof=kind=>(fields.evidence||[]).some(proof=>proof.kind===kind&&proof.verified===true&&(record.documentIds||[]).includes(proof.documentId));
 if(definition.id==='personnel'){
  if(/注册|建造师/.test(text)&&!hasProof('registration'))return false;
  if(/B证|B\)类|\(B\)类?|B类/.test(text)&&(!fields.bCertificateNumber||!hasProof('bCertificate')))return false;
  if(/(?:提供|提交)[^。；;]{0,60}劳动合同/.test(text)&&!hasProof('labor'))return false;
  if(/(?:提供|提交)[^。；;]{0,60}(?:社保证明|社会保险证明)/.test(text)&&!hasProof('socialInsurance'))return false;
  if(/本单位注册|本企业注册/.test(text)&&fields.registeredHere!==true)return false;
  if(/不兼职|无在建|不得兼任/.test(text)&&fields.noConcurrentProject!==true)return false;
  if(/建造师/.test(text)&&(!fields.specialty||!fields.grade))return false;
  if(/一级.*电子证书/.test(text)&&/^(?:一|1)级/.test(clean(fields.grade))&&fields.electronicCertificate!==true)return false;
 }
 return(fields.evidence||[]).some(proof=>definition.proofs.includes(proof.kind)&&proof.verified===true&&(record.documentIds||[]).includes(proof.documentId));
}
export function buildQualificationReview(report){
 const all=(report.categories||[]).flatMap(category=>category.items||[]),records=(report.companySnapshot?.records||[]).filter(record=>!isCompanyArchiveRecord(record));
 const groups=definitions.map(definition=>{
  const related=all.filter(definition.finding),requirements=related.filter(item=>item.hard===true||item.scopedHard===true),applicable=requirements.filter(item=>!item.scopePending&&item.applicability!=='not-required'&&item.matchStatus!=='not-applicable');
  const matched=records.filter(definition.record),confirmed=matched.filter(record=>confirmedRecord(record,definition,report,applicable));
  const failed=applicable.filter(item=>item.reviewed===true&&item.matchStatus==='unmet'),pending=applicable.filter(item=>item.reviewed!==true||item.matchStatus!=='met');
  const scoringOnly=definition.id==='performance'&&!requirements.length&&related.some(item=>/评分|得\d+(?:\.\d+)?分|分/.test(clean(item.fields?.用途+' '+item.quote)));
  let status=failed.length?'unmet':scoringOnly?'scoring-only':requirements.length&&!applicable.length&&!requirements.some(item=>item.scopePending)?'not-applicable':applicable.length&&!pending.length&&confirmed.length?'met':'pending';
  const missing=[];
  if(status==='pending'){
   if(!requirements.length)missing.push('未明确识别本类资格硬门槛，须核对采购原文适用范围');
   if(requirements.some(item=>item.scopePending))missing.push('标段适用范围待确认，仅在对应标段内核验，不扩展为全项目失败');
   if(!matched.length)missing.push('企业快照缺本类资料');else if(!confirmed.length)missing.push('本类企业原件、主体、有效期或人工确认尚不完整');
   if(pending.length)missing.push('本类采购要求仍须逐项人工核验');
  }
  return{id:definition.id,label:definition.label,status,required:applicable.length>0,requirements:requirements.map(item=>({findingId:item.id,title:item.title,quote:item.quote,status:item.reviewed===true&&item.matchStatus==='unmet'?'unmet':item.reviewed===true&&item.matchStatus==='met'&&confirmed.length?'met':'pending',references:item.references||[]})),recordIds:matched.map(record=>record.id),evidenceIds:unique(confirmed.flatMap(record=>(record.fields?.evidence||[]).filter(proof=>proof.verified===true&&(record.documentIds||[]).includes(proof.documentId)).map(proof=>proof.documentId))),references:related.flatMap(item=>item.references||[]),missing,reasons:scoringOnly?['本文件已识别的业绩仅用于评分，不增设业绩资格否决']:status==='met'?['适用采购要求已人工确认，并有本类已确认企业原件支持']:status==='unmet'?['存在已人工确认不满足的资格硬门槛']:['资料缺失或口径未知保持待核验，不等于不符合']};
 });
 const hard=all.filter(item=>item.hard),failed=hard.filter(item=>item.reviewed===true&&item.matchStatus==='unmet'),pending=hard.filter(item=>item.reviewed!==true||!['met','not-applicable'].includes(item.matchStatus));
 // Unlocated categories remain visible as pending for source review, but only
 // actual applicable requirements can impose an enterprise-evidence gate.
 const hasCompany=typeof report.companySnapshot?.id==='string'&&report.companySnapshot.id.trim().length>0;
 const status=failed.length?'unmet':!hasCompany||!hard.length||pending.length||groups.some(group=>group.required&&group.status==='pending')?'pending':'met';
 return{status,groups,hardGate:{status,findingIds:unique((failed.length?failed:pending).map(item=>item.id)),failedFindingIds:failed.map(item=>item.id),pendingFindingIds:pending.map(item=>item.id)},reasons:['先核验营业执照、企业资质、安全生产许可、人员与业绩的适用范围，再看得分预测','资格与符合性硬门槛独立判断，满分假设不能抵消已确认不符合']};
}
