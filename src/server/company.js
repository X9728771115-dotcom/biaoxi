import {randomUUID} from 'node:crypto';
import {extractDocument} from '../core/extractor.js';
import {summarizeReport} from '../core/analyzer.js';
import {companyScopePending,companyScoreItems} from '../core/company-analysis.js';
import {recognizeCertificates,mergeCertificateCandidates} from '../core/certificate-import.js';

export const COMPANY_FIELDS={
 entity:['registeredName','creditCode','legalRepresentative','businessScope','validUntil'],
 qualification:['category','specialty','grade','certificateNumber','issuer','validFrom','validUntil'],
 performance:['projectType','contractNumber','contractDate','amount','clientName'],
 personnel:['role','specialty','grade','certificateNumber','employer','bCertificateNumber','validUntil','registeredHere','noConcurrentProject','electronicCertificate'],
 product:['brand','model','category','certificateNumber','issuer','validUntil','energyPolicy','environmentPolicy','environmentalPerformance','manufacturer','certificateType','coveredModels','validFrom','certificateStatus','policyVersion']
};
const commonFields=['subjectName','notes','evidence'];
const booleans=new Set(['registeredHere','noConcurrentProject','electronicCertificate']);
const dateFields=new Set(['contractDate','validFrom','validUntil']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const allowedKeys=(value,keys,label)=>{if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new Error(`无效的${label}字段`);};
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9-]{1,80}$/.test(value))throw new Error('无效的记录编号');return value;};
const string=(value,label,max=300,empty=true)=>{if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))throw new Error(`无效的${label}`);return value.trim();};
const ids=(value,label,max=50)=>{if(!Array.isArray(value)||value.length>max)throw new Error(`无效或过多的${label}`);return[...new Set(value.map(id))];};
const date=value=>{if(value==='')return value;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('日期请使用 YYYY-MM-DD');const parsed=new Date(value+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||!parsed.toISOString().startsWith(value))throw new Error('无效日期');return value;};
function normalizeCompany(input,previous){
 allowedKeys(input,['id','name','records','createdAt','updatedAt'],'企业');
 if(Buffer.byteLength(JSON.stringify(input),'utf8')>2*1024*1024)throw new Error('企业资料不能超过2MiB');
 const name=string(input.name,'企业名称',200,false),records=input.records??[];if(!Array.isArray(records)||records.length>500)throw new Error('企业条目不能超过500条');
 const seen=new Set();const normalized=records.map(record=>{
  allowedKeys(record,['id','type','name','fields','documentIds','verified','sources','recognition'],'企业条目');
  if(!Object.hasOwn(COMPANY_FIELDS,record.type))throw new Error('无效的企业资料类型');
  const recordId=record.id===undefined?randomUUID():id(record.id);if(seen.has(recordId))throw new Error('企业条目编号重复');seen.add(recordId);
  if(record.verified!==undefined&&typeof record.verified!=='boolean')throw new Error('资料确认状态必须为布尔值');
  const fields=record.fields??{};allowedKeys(fields,[...COMPANY_FIELDS[record.type],...commonFields],'资料');
  const documentIds=ids(record.documentIds??[],'证明文件');const resultFields={};
  for(const[key,value]of Object.entries(fields)){
   if(key==='evidence'){
    if(!Array.isArray(value)||value.length>50)throw new Error('证明关系不能超过50条');
    resultFields.evidence=value.map(proof=>{allowedKeys(proof,['kind','documentId','verified','stamped','valid'],'证明关系');const documentId=id(proof.documentId);if(!documentIds.includes(documentId))throw new Error('证明关系必须引用本条关联原件');if(typeof proof.verified!=='boolean')throw new Error('每份证明须明确人工确认状态');for(const key of ['stamped','valid'])if(proof[key]!==undefined&&typeof proof[key]!=='boolean')throw new Error('证明盖章与有效确认须为布尔值');return{kind:string(proof.kind,'证明类型',80,false),documentId,verified:proof.verified,...(proof.stamped!==undefined?{stamped:proof.stamped}:{}),...(proof.valid!==undefined?{valid:proof.valid}:{})};});
   }else if(booleans.has(key)){if(typeof value!=='boolean')throw new Error('结构条件必须为布尔值');resultFields[key]=value;}
   else if(key==='amount'){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e15)throw new Error('合同金额请填有效的非负元数值');resultFields[key]=value;}
   else if(key==='coveredModels'){const models=typeof value==='string'?value.split(/[、,，;；\n]+/):value;if(!Array.isArray(models)||models.length>100)throw new Error('覆盖型号不能超过100条');resultFields[key]=[...new Set(models.map(model=>string(model,'覆盖型号',1000,false)))];}
   else if(key==='certificateType'){if(!['energy','environment','greenMaterial','testReport','ccc','iso','other'].includes(value))throw new Error('无效的产品证书类别');resultFields[key]=value;}
   else if(key==='certificateStatus'){if(!['valid','suspended','revoked','unknown'].includes(value))throw new Error('无效的产品证书状态');resultFields[key]=value;}
   else if(dateFields.has(key))resultFields[key]=date(value);
   else resultFields[key]=string(value,key,key==='notes'?5000:key==='businessScope'?10000:1000);
  }
  const sources=record.sources??[];if(!Array.isArray(sources)||sources.length>500)throw new Error('原文引用不能超过500条');
  const normalizedSources=sources.map(source=>{allowedKeys(source,['documentId','blockId','page','quote','fileName','section','field'],'原文引用');if(!documentIds.includes(source.documentId))throw new Error('原文引用必须来自本条关联原件');if(source.page!==null&&(!Number.isInteger(source.page)||source.page<=0))throw new Error('无效的原件页码');return{documentId:id(source.documentId),blockId:string(source.blockId,'原文块',200,false),page:source.page,quote:string(source.quote,'原文引文',5000,false),...(source.fileName!==undefined?{fileName:string(source.fileName,'文件名',300)}:{}),...(source.section!==undefined?{section:string(source.section,'来源章节',500)}:{}),...(source.field!==undefined?{field:string(source.field,'来源字段',80)}:{})};});
  const recognition=normalizeRecognition(record.recognition,normalizedSources,record.verified===true);
  return{id:recordId,type:record.type,name:string(record.name,'资料名称',200,false),fields:resultFields,documentIds,verified:record.verified===true,sources:normalizedSources,...(recognition?{recognition}:{})};
 });
 const now=new Date().toISOString();return{id:previous?.id||randomUUID(),name,records:normalized,createdAt:previous?.createdAt||now,updatedAt:now};
}
function normalizeRecognition(value,sources,verified){
 if(value===undefined)return undefined;
 allowedKeys(value,['status','missingFields','conflicts','sourceComplete','previousRecordId'],'识别结果');
 if(!['complete','pending','conflict'].includes(value.status)||typeof value.sourceComplete!=='boolean')throw new Error('无效的识别状态');
 if(!Array.isArray(value.missingFields)||value.missingFields.length>50||!Array.isArray(value.conflicts)||value.conflicts.length>50)throw new Error('无效的待核对字段');
 const allowedFields=new Set(['type','name',...commonFields,...Object.values(COMPANY_FIELDS).flat()]);
 const field=name=>{if(typeof name!=='string'||!allowedFields.has(name))throw new Error('无效的识别字段');return name;};
 const fact=(value,max=1000)=>{if(Array.isArray(value)){if(value.length>100)throw new Error('冲突型号过多');return value.map(v=>string(v,'冲突型号',1000));}if(typeof value==='number'&&Number.isFinite(value))return value;if(typeof value==='boolean')return value;return string(value,'冲突值',max);};
 const conflicts=value.conflicts.map(conflict=>{allowedKeys(conflict,['field','existingValue','incomingValue','sources','resolved'],'字段冲突');if(conflict.resolved!==undefined&&typeof conflict.resolved!=='boolean')throw new Error('冲突解决状态必须为布尔值');if(conflict.resolved===true&&!verified)throw new Error('解决冲突须明确人工确认资料');if(!Array.isArray(conflict.sources)||conflict.sources.length>50)throw new Error('无效的冲突来源');const linked=conflict.sources.map(source=>{const original=sources.find(s=>s.documentId===source.documentId&&s.blockId===source.blockId&&s.quote===source.quote&&s.page===source.page&&s.field===source.field);if(!original)throw new Error('冲突来源须引用本条原文');return original;});return{field:field(conflict.field),existingValue:fact(conflict.existingValue,conflict.field==='businessScope'?10000:1000),incomingValue:fact(conflict.incomingValue,conflict.field==='businessScope'?10000:1000),sources:linked,resolved:conflict.resolved===true};});
 return{status:value.status,sourceComplete:value.sourceComplete,missingFields:[...new Set(value.missingFields.map(field))],conflicts,...(value.previousRecordId!==undefined?{previousRecordId:id(value.previousRecordId)}:{})};
}
export function registerCompanyRoutes(app,{store,reportIsBusy,reportEditLocks}){
 let mutationQueue=Promise.resolve();const serial=operation=>{const run=mutationQueue.catch(()=>{}).then(operation);mutationQueue=run;return run;};
 async function documentsFor(company){
  const documents=await Promise.all([...new Set(company.records.flatMap(r=>r.documentIds))].map(documentId=>store.getDocument(documentId)));
  for(const document of documents){if(document.role!=='evidence')throw new Error('企业原件须为企业证明材料用途');if(document.companyId&&document.companyId!==company.id)throw new Error('原件已归属其他企业，不能混用');}
  const companies=await store.listCompanies();for(const other of companies.filter(c=>c.id!==company.id)){const owned=new Set(other.records.flatMap(r=>r.documentIds||[]));if(documents.some(d=>owned.has(d.id)))throw new Error('原件已归属其他企业，不能混用');}
  const docs=new Map(documents.map(d=>[d.id,d]));
  for(const record of company.records)for(const source of record.sources){const doc=docs.get(source.documentId),block=doc.extraction?.blocks?.find(b=>b.id===source.blockId);if(!block||!(block.text||'').includes(source.quote)||(block.page??null)!==source.page)throw new Error('企业原文引用与上传原件不一致');}
  return documents;
 }
 async function saveCompany(company){const documents=await documentsFor(company);await store.saveCompany(company);for(const doc of documents)if(!doc.companyId)await store.saveDocument({...doc,companyId:company.id});return company;}
 app.get('/api/companies',async(req,res,next)=>{try{res.json({companies:await store.listCompanies()});}catch(error){next(error);}});
 app.get('/api/companies/:id',async(req,res,next)=>{try{res.json(await store.getCompany(req.params.id));}catch(error){next(error);}});
 app.post('/api/companies',async(req,res,next)=>{try{const result=await serial(()=>saveCompany(normalizeCompany(req.body)));res.status(201).json(result);}catch(error){next(error);}});
 app.put('/api/companies/:id',async(req,res,next)=>{try{const result=await serial(async()=>saveCompany(normalizeCompany(req.body,await store.getCompany(req.params.id))));res.json(result);}catch(error){next(error);}});
 app.post('/api/companies/:id/import',async(req,res,next)=>{try{const result=await serial(async()=>{
  allowedKeys(req.body,['type','documentIds'],'导入');const type=req.body.type??'auto';if(type!=='auto'&&!Object.hasOwn(COMPANY_FIELDS,type))throw new Error('无效的企业资料类型');const documentIds=ids(req.body.documentIds,'导入文件',20);if(!documentIds.length)throw new Error('请选择原件');const company=await store.getCompany(req.params.id);const documents=await Promise.all(documentIds.map(documentId=>store.getDocument(documentId)));
  await documentsFor({...company,records:[...company.records,{documentIds,sources:[]}]});
  const warnings=[],candidates=[];for(const doc of documents){if(!doc.extraction){doc.extraction=await extractDocument(doc);doc.status='ready';await store.saveDocument(doc);}const recognized=recognizeCertificates(doc,{type});candidates.push(...recognized.candidates);warnings.push(...recognized.warnings);}
  const {records,importSummary}=mergeCertificateCandidates(company.records,candidates);
  const updated=normalizeCompany({...company,records},company);await saveCompany(updated);return{company:updated,candidates,warnings,importSummary};
 });res.json(result);}catch(error){next(error);}});
 app.post('/api/reports/:id/score-assessments',async(req,res,next)=>{
  const reportId=req.params.id;if(reportIsBusy(reportId))return res.status(409).json({error:'报告正在生成或复核，请完成或取消后再保存参考估计'});reportEditLocks.add(reportId);
  try{
   allowedKeys(req.body,['scoreId','estimatedScore','reason','evidenceIds'],'参考估计');const report=await store.getReport(reportId),item=companyScoreItems(report).find(s=>s.id===req.body.scoreId);if(!item)throw new Error('只能估计本报告已识别的评分分项');if(companyScopePending(report))throw new Error('评分包、版本或规则未唯一完整确定，暂不能保存合计参考估计');
   const value=req.body.estimatedScore;if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>item.maxScore||!Number.isFinite(item.maxScore)))throw new Error('参考分须在0与本项满分之间');
   const evidenceIds=ids(req.body.evidenceIds??[],'估计证据');const allowed=new Set([...(report.evidenceIds||[]),...(report.companySnapshot?.records||[]).flatMap(r=>r.documentIds||[])]);if(evidenceIds.some(documentId=>!allowed.has(documentId)))throw new Error('参考估计证据不属于本报告企业快照或选定材料');
   const assessments=(report.scoreAssessments||[]).filter(a=>a.scoreId!==item.id);if(value!==null){const reason=string(req.body.reason,'估计依据',2000,false);if(reason.length<8)throw new Error('请记录至少8个字的人工参考估计依据');assessments.push({scoreId:item.id,estimatedScore:value,reason,evidenceIds,assessedAt:new Date().toISOString(),kind:'reference'});}
   const result=summarizeReport({...report,scoreAssessments:assessments,updatedAt:new Date().toISOString()});await store.saveReport(result);res.json(result);
  }catch(error){next(error);}finally{reportEditLocks.delete(reportId);}
 });
}
