import {predictionSummaryHTML,hasNonScoringMethod} from './score-summary.js';
import {isCompanyArchiveRecord} from './company-record-kind.js';
/* Local company records: candidate extraction never implies human verification. */
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const CERTIFICATE_TYPES={energy:'节能产品认证',environment:'环境标志产品认证',greenMaterial:'绿色建材认证',testReport:'检测报告',ccc:'CCC认证',iso:'ISO体系认证',other:'其他证明'};
const CERTIFICATE_STATUS={valid:'有效',suspended:'暂停',revoked:'撤销',unknown:'未知 / 待核验'};
const list = value => Array.isArray(value) ? value : [];
const readable = value => Array.isArray(value) ? value.map(readable).join('；') : String(value ?? '');
export const COMPANY_TYPES = [
  {id:'entity',title:'执照',fields:[['registeredName','登记名称'],['creditCode','统一社会信用代码'],['legalRepresentative','法定代表人'],['businessScope','经营范围','textarea'],['validUntil','有效期至','date']]},
  {id:'qualification',title:'资质',fields:[['category','资质类别'],['specialty','专业'],['grade','等级'],['certificateNumber','证书编号'],['issuer','发证机构'],['validFrom','有效期起','date'],['validUntil','有效期至','date']]},
  {id:'performance',title:'业绩',fields:[['projectType','项目类型'],['contractNumber','合同编号'],['contractDate','合同签订日期','date'],['amount','合同金额（元）','number'],['clientName','客户 / 采购人']]},
  {id:'personnel',title:'人员',fields:[['role','拟派岗位'],['specialty','专业'],['grade','资格等级'],['certificateNumber','注册 / 资格证号'],['employer','任职单位'],['bCertificateNumber','B证编号'],['validUntil','有效期至','date'],['registeredHere','注册在本单位','checkbox'],['noConcurrentProject','无其他在建项目兼职','checkbox'],['electronicCertificate','已核对电子证书要求','checkbox']]},
  {id:'product',title:'产品',fields:[['brand','品牌'],['model','型号'],['category','产品类别'],['manufacturer','制造商'],['certificateType','证明类型','certificateType'],['coveredModels','覆盖型号（每行一个）','models'],['certificateStatus','证书状态','certificateStatus'],['policyVersion','对应政策版本'],['validFrom','有效期起','date'],['certificateNumber','认证证书编号'],['issuer','发证机构'],['validUntil','有效期至','date'],['energyPolicy','节能 / 强采政策适用情况'],['environmentPolicy','环境标志 / 优采政策适用情况'],['environmentalPerformance','材料环保性能','textarea']]}
];
export const companyFieldLabel=key=>Object.fromEntries([...COMPANY_TYPES.flatMap(type=>type.fields.map(([id,label])=>[id,label])),['subjectName','材料主体名称'],['name','资料名称'],['type','资料类型'],['notes','核对说明'],['evidence','证明材料']])[key]||'待核对字段';
const EVIDENCE_KINDS = {license:'营业执照',certificate:'资质 / 认证证书',contract:'合同',acceptanceReport:'验收报告',awardNotice:'中标通知书',webScreenshot:'网络截图',ownerProof:'业主证明',source:'导入原件（待分类）',registration:'注册证书',bCertificate:'B证',labor:'劳动关系证明',socialInsurance:'社保证明',environmentalReport:'环保检测报告',other:'其他证明'};
const STATUS = {supported:'资料支持',candidate:'待核验',pending:'待核验',reference:'人工参考', 'rule-supported':'规则预计',pass:'达到内部阈值',passed:'达到内部阈值','below-threshold':'未达到内部阈值',excluded:'不计入预计',below:'未达到内部阈值',failed:'未达到内部阈值',blocked:'硬门槛不满足','not-applicable':'不适用',met:'已确认满足',unmet:'已确认不满足',estimated:'已形成测算','scoring-only':'仅用于评分'};
const statusText = value => STATUS[value] || '待核验';
const typeInfo = type => COMPANY_TYPES.find(item => item.id === type);
const defaultKind = type => ({entity:'license',qualification:'certificate',performance:'contract',personnel:'registration',product:'certificate'})[type] || 'other';
const nameForDoc = (id, documents) => documents.find(doc => doc.id === id)?.fileName || documents.find(doc => doc.id === id)?.name || `原件 ${id}`;
const libraryTypeTitle=type=>({qualification:'资质证件',personnel:'人员资料'})[type.id]||type.title;
export function companySummary(company) {
  const records=list(company?.records),structured=records.filter(record=>!isCompanyArchiveRecord(record));
  return [...COMPANY_TYPES.map(type => `${libraryTypeTitle(type)} ${structured.filter(record => record.type === type.id).length} 条`),`归档包 ${records.length-structured.length} 包`].join('　');
}
export function evidenceRowHTML(evidence = {}, documents = [], type = 'entity') {
  const kind = evidence.kind || defaultKind(type), kinds = {...EVIDENCE_KINDS};
  if(!kinds[kind])kinds[kind] = kind;
  return `<div class="evidence-row"><label>证明种类<select name="evidenceKind">${Object.entries(kinds).map(([value,label]) => `<option value="${escape(value)}"${kind===value?' selected':''}>${escape(label)}</option>`).join('')}</select></label><label>关联原件<select name="evidenceDocumentId"><option value="">请选择本企业原件</option>${documents.map(doc=>`<option value="${escape(doc.id)}"${doc.id===evidence.documentId?' selected':''}>${escape(doc.fileName||doc.name||doc.id)}</option>`).join('')}</select></label><label class="check-label"><input type="checkbox" name="evidenceVerified"${evidence.verified===true?' checked':''}>已对照原件核对</label><label class="check-label"><input type="checkbox" name="evidenceStamped"${evidence.stamped===true?' checked':''}>已确认盖章</label><label class="check-label"><input type="checkbox" name="evidenceValid"${evidence.valid===true?' checked':''}>已确认材料有效</label><button type="button" class="icon-btn" data-remove-evidence aria-label="移除此证明关联">×</button></div>`;
}
export function recordFormHTML(record = {}, type = 'entity', documents = []) {
  const info = typeInfo(type);if(!info)return '';
  const fields = record.fields || {}, evidence = list(fields.evidence);
  const gaps=[['subjectName','材料主体名称'],...info.fields.filter(([, ,kind])=>kind!=='checkbox')].filter(([key])=>fields[key]==null||fields[key]==='').map(([,label])=>label);
  const fieldHTML = ([key,label,kind='text']) => {
    const options=kind==='certificateType'?CERTIFICATE_TYPES:kind==='certificateStatus'?CERTIFICATE_STATUS:null;
    if(options)return `<label>${label}<select name="field:${key}"><option value="">请选择 / 待核验</option>${Object.entries(options).map(([value,title])=>`<option value="${value}"${fields[key]===value?' selected':''}>${title}</option>`).join('')}</select></label>`;
    if(kind==='checkbox')return `<label class="check-label"><input type="checkbox" name="field:${key}"${fields[key]===true?' checked':''}>${label}</label>`;
    const value=kind==='models'&&Array.isArray(fields[key])?fields[key].join('\n'):fields[key];
    return `<label>${label}${['textarea','models'].includes(kind)?`<textarea name="field:${key}" maxlength="${kind==='models'?5000:key==='businessScope'?10000:8000}">${escape(value)}</textarea>`:`<input type="${kind}" name="field:${key}" value="${escape(value)}"${kind==='number'?' min="0" step="0.01"':' maxlength="500"'}>`}</label>`;
  };
  return `<form id="company-record-form" data-record-id="${escape(record.id)}" data-record-type="${escape(type)}"><div class="section-heading"><h2>${record.id?'编辑':'新增'}${info.title}资料</h2><button type="button" class="btn link" data-close-record>收起表单</button></div>${recognitionDetailsHTML(record)}${list(record.recognition?.conflicts).length?`<label class="check-label conflict-resolution"><input type="checkbox" name="conflictsResolved"${record.recognition.conflicts.every(item=>item.resolved===true)?' checked':''}>已逐项核对并解决上述冲突</label>`:''}${gaps.length?`<p class="record-field-gaps">可补充字段：${escape(gaps.join('、'))}。自动识别有局限，请按原件核对适用字段。</p>`:''}<div class="company-fields"><label>资料名称<input name="name" type="text" required maxlength="200" value="${escape(record.name)}" placeholder="填写证书、项目、人员或产品名称"></label><label>材料主体名称<input name="field:subjectName" type="text" maxlength="500" value="${escape(fields.subjectName)}"></label>${info.fields.map(fieldHTML).join('')}<label class="span-all">核对说明 / 补充信息<textarea name="field:notes" maxlength="2000" placeholder="识别有局限，请补充字段缺口、条件及核对依据">${escape(fields.notes)}</textarea></label></div><fieldset class="record-evidence"><legend>关联证明材料</legend><p class="muted">同一业绩可分别关联合同和验收报告；每份证明须单独核对。</p><div id="record-evidence-rows">${(evidence.length?evidence:[{}]).map(item=>evidenceRowHTML(item,documents,type)).join('')}</div><button type="button" class="btn" data-add-evidence>增加证明材料</button>${documents.length?'':'<p class="muted">暂无本企业原件。可以先保存资料，再导入文件并关联。</p>'}</fieldset><label class="check-label record-verify"><input type="checkbox" name="verified"${record.verified===true?' checked':''}>已人工核对本条资料的主体、字段和适用条件</label><div class="actions"><button type="submit" class="btn primary">保存资料</button><span id="company-record-status" role="status"></span></div></form>`;
}
export function recordFromValues(values, previous = null, documents = []) {
  const type = values.type || previous?.type, info = typeInfo(type), name = String(values.name || '').trim();
  if(!info)throw new Error('请选择有效资料类型。');
  if(!name)throw new Error('请填写资料名称。');
  const fields = structuredClone(previous?.fields||{});
  for(const [key,,kind='text'] of [...info.fields,['subjectName','材料主体'],['notes','核对说明']]) {
    const value = values.fields?.[key];
    if(kind==='checkbox'){fields[key]=value===true;continue;}
    if(value == null || String(value).trim()===''){delete fields[key];continue;}
    if(kind==='models'){fields[key]=[...new Set((Array.isArray(value)?value:String(value).split(/[、,，;；\n]+/)).map(item=>String(item).trim()).filter(Boolean))];continue;}
    if(kind==='certificateType'&&!CERTIFICATE_TYPES[value])throw new Error('请选择有效的产品证明类型。');
    if(kind==='certificateStatus'&&!CERTIFICATE_STATUS[value])throw new Error('请选择有效的证书状态。');
    if(kind==='number') {
      const amount=Number(value);if(!Number.isFinite(amount)||amount<0)throw new Error('合同金额须为不小于0的数值。');
      fields[key]=amount;
    } else fields[key]=String(value).trim();
  }
  fields.evidence = list(values.evidence).filter(item=>item.documentId).map(item=>{
    if(!documents.some(doc=>doc.id===item.documentId))throw new Error('关联原件必须来自本企业已上传的资料。');
    const kind=String(item.kind||'').trim();if(!kind)throw new Error('请选择证明种类。');
    const sameProof=list(previous?.fields?.evidence).some(proof=>proof.kind===kind&&proof.documentId===item.documentId);
    const confirmationAllowed=!previous||sameProof||item.confirmationAcknowledged===true;
    return {kind,documentId:item.documentId,verified:confirmationAllowed&&item.verified===true,...(item.stamped!==undefined?{stamped:confirmationAllowed&&item.stamped===true}:{}),...(item.valid!==undefined?{valid:confirmationAllowed&&item.valid===true}:{})};
  });
  const documentIds=[...new Set([...list(previous?.documentIds),...fields.evidence.map(item=>item.documentId)])];
  const factKey=record=>JSON.stringify([String(record.name||'').trim(),type,...[...info.fields,['subjectName'],['notes']].map(([key,,kind])=>kind==='checkbox'?record.fields?.[key]===true:kind==='number'&&record.fields?.[key]!=null?Number(record.fields[key]):String(record.fields?.[key]??'').trim())]);
  const proofKey=proofs=>JSON.stringify(list(proofs).map(proof=>`${proof.kind}:${proof.documentId}`).sort());
  const changed=!!previous&&(factKey(previous)!==factKey({name,fields})||proofKey(previous.fields?.evidence)!==proofKey(fields.evidence));
  const confirmationAllowed=!previous?.verified||!changed||values.confirmationAcknowledged===true;
  const verified=confirmationAllowed&&values.verified===true;
  let recognition=previous?.recognition?structuredClone(previous.recognition):undefined;
  if(recognition){
    const hadMissingFields=recognition.missingFields.length>0;
    if(!verified){
      // Withdrawing confirmation reopens prior resolutions, preserving the
      // original and incoming facts and their source history for review.
      recognition.conflicts=recognition.conflicts.map(item=>item.resolved===true?{...item,resolved:false}:item);
      if(recognition.conflicts.some(item=>item.resolved!==true))recognition.status='conflict';
    }else{
      if(values.conflictsResolved===true)recognition.conflicts=recognition.conflicts.map(item=>({...item,resolved:true}));
      recognition.missingFields=recognition.missingFields.filter(key=>{
        const value=key==='name'?name:key==='type'?type:fields[key];
        return value==null||value===''||Array.isArray(value)&&!value.length||key==='certificateStatus'&&value==='unknown'||key==='certificateType'&&value==='other';
      });
      if(recognition.conflicts.some(item=>item.resolved!==true))recognition.status='conflict';
      else if(recognition.missingFields.length||recognition.sourceComplete===false)recognition.status='pending';
      else if(hadMissingFields||recognition.status==='complete'||values.conflictsResolved===true&&recognition.conflicts.length)recognition.status='complete';
      // A pending record with no field gap may carry an OCR/reading warning;
      // typing does not change source completeness or erase that uncertainty.
    }
  }
  return {...(previous?structuredClone(previous):{}),...(previous?.id?{id:previous.id}:{}),type,name,fields,documentIds,verified,sources:list(previous?.sources),...(recognition?{recognition}:{})};
}
export function companyWithRecord(company, record) {
  const records=list(company.records).map(item=>({...item})),index=record.id?records.findIndex(item=>item.id===record.id):-1;
  if(index<0)records.push(record);else records[index]=record;
  return {...company,records};
}
export function companyWithoutRecord(company, id) {return {...company,records:list(company.records).filter(record=>record.id!==id)};}
export function analysisRequestBody({files={},mode='offline',companyId}={}) {
  return {documentIds:list(files.tender).map(doc=>doc.id),attachmentIds:list(files.attachment).map(doc=>doc.id),evidenceIds:list(files.evidence).map(doc=>doc.id),mode,...(companyId?{companyId}:{})};
}
export function companyLibraryHTML(company, type = 'entity', documents = []) {
  if(!company)return '<div class="empty-state"><h2>建立本地企业资料</h2><p>填写企业名称保存后，即可添加执照、资质、业绩、人员与产品；分析文件时也可不选择企业。</p></div>';
  const allRecords=list(company.records),structured=allRecords.filter(record=>!isCompanyArchiveRecord(record)),archives=allRecords.filter(isCompanyArchiveRecord);
  const records=type==='all'?allRecords:type==='archive'?archives:structured.filter(record=>record.type===type);
  const tabs=[{id:'all',title:'全部资料',count:allRecords.length},...COMPANY_TYPES.map(info=>({id:info.id,title:libraryTypeTitle(info),count:structured.filter(record=>record.type===info.id).length})),{id:'archive',title:'归档包',count:archives.length}];
  const rows=records.map(record=>{
    const archived=isCompanyArchiveRecord(record);
    return `<tr><td><strong>${escape(record.name)}</strong><small>${archived?'归档包 · 原件待分类，不参与资格与评分匹配':escape(recordBrief(record))}</small>${recognitionDetailsHTML(record)}</td><td>${archived?'原件归档':({complete:'识别完整',pending:'待补字段',conflict:'识别冲突'})[record.recognition?.status]||'手工录入'}${!archived&&record.recognition?.missingFields?.length?`<small>待补：${escape(record.recognition.missingFields.map(companyFieldLabel).join('、'))}</small>`:''}</td><td>${archived?'原件待分类核对':record.verified===true?'已核对资料':'待核验'}${!archived&&list(record.fields?.evidence).length?`<small>证明 ${list(record.fields.evidence).filter(proof=>proof.verified===true).length}/${record.fields.evidence.length} 已核对</small>`:''}</td><td>${list(record.documentIds).map(id=>`<button type="button" class="btn link" data-company-document="${escape(id)}">${escape(nameForDoc(id,documents))}</button>`).join('')||'<span class="muted">未关联原件</span>'}</td><td><div class="actions"><button type="button" class="btn link" data-edit-record="${escape(record.id)}">编辑</button><button type="button" class="btn link danger" data-delete-record="${escape(record.id)}">删除</button></div></td></tr>`;
  }).join('');
  return `<form id="company-name-form" class="company-name-form"><label>企业名称<input name="companyName" type="text" required maxlength="200" value="${escape(company.name)}"></label><button type="submit" class="btn">保存企业名称</button></form><p class="company-counts">${escape(companySummary(company))}</p><p class="muted company-count-basis">以上为结构化资料记录数；人员资料可含同一人的不同证件，不代表员工人数。归档包单列保存与查看原件，不作为证件、资格或评分候选。</p><nav class="company-type-tabs" aria-label="企业资料类型">${tabs.map(tab=>`<button type="button" data-company-type="${tab.id}"${type===tab.id?' aria-current="page"':''}>${tab.title}<span>${tab.count}</span></button>`).join('')}</nav><div class="company-section-actions">${type==='archive'?'':`<button type="button" class="btn" data-new-record>新增${typeInfo(type)?.title||'资料'}</button>`}<label class="btn primary file-button">批量导入证件，自动识别并录入<input id="company-import-input" type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.txt" multiple></label><span id="company-import-status" role="status"></span></div><p class="muted company-import-help">自动识别明确字段并录入，重复原件、续期与冲突分别记录。自动录入不等于人工核验；仅缺失、不清楚或冲突字段需要补充。</p>${records.length?`<div class="table-scroll company-record-scroll" tabindex="0" role="region" aria-label="企业资料表，可横向滚动查看原件与操作"><table class="company-record-table"><thead><tr><th scope="col">资料名称与关键信息</th><th scope="col">自动录入</th><th scope="col">人工核验</th><th scope="col">原件</th><th scope="col">操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty-state compact"><p>暂无这类资料。新增常用字段，或从原件导入候选后核对。</p></div>'}<div id="company-record-editor"></div>`;
}
function recognitionDetailsHTML(record){
 const conflicts=list(record.recognition?.conflicts);
 return conflicts.length?`<details class="record-conflicts"><summary>字段冲突 ${conflicts.length} 项（原值保留${conflicts.every(item=>item.resolved===true)?'，已人工处理':''}）</summary>${conflicts.map(item=>`<p><strong>${escape(companyFieldLabel(item.field))}</strong>：原值 ${escape(readable(item.existingValue))}；识别值 ${escape(readable(item.incomingValue))}</p><div>${sourceRefsHTML(item.sources)}</div>`).join('')}</details>`:'';
}
function recordBrief(record) {
  const f={...record.fields};
  if(record.type==='qualification'&&f.category?.length>100){const categories=f.category.split(/[;；\n]+/).filter(Boolean);f.category=categories.length>2?categories.slice(0,2).join('；')+`等${categories.length}项（完整类别见编辑页）`:f.category.slice(0,80)+'…（完整类别见编辑页）';}
  return ({entity:[f.registeredName,f.creditCode],qualification:[f.category,f.specialty,f.grade,f.certificateNumber],performance:[f.projectType,f.contractDate,f.amount!=null?`${f.amount}元`:''],personnel:[f.role,f.specialty,f.grade,f.employer],product:[f.brand,f.manufacturer,f.model,f.category,CERTIFICATE_TYPES[f.certificateType],CERTIFICATE_STATUS[f.certificateStatus]]})[record.type]?.filter(Boolean).join(' · ')||'字段待补充';
}
function reportEvidence(report,includeArchives=false) {
  const documents = new Map();
  const selected=new Set(list(report.scoreAssessments).flatMap(assessment=>list(assessment.evidenceIds)));
  for(const record of list(report.companySnapshot?.records))for(const id of list(record.documentIds))if(includeArchives||!isCompanyArchiveRecord(record)||selected.has(id))documents.set(id,{id,fileName:list(record.sources).find(source=>source.documentId===id)?.fileName||`${record.name} / 原件`});
  for(const id of list(report.evidenceIds))if(!documents.has(id))documents.set(id,{id,fileName:`本次证照 / ${id}`});
  return [...documents.values()];
}
export function scoreAssessmentBody(report, {scoreId,estimatedScore,reason='',evidenceIds=[]}) {
  const item=list(report.analysis?.scoring?.items).find(row=>row.id===scoreId || row.scoreId===scoreId);
  if(!item)throw new Error('该评分项尚未形成可保存的评分标准。');
  if(estimatedScore===null)return {scoreId,estimatedScore:null,reason:'',evidenceIds:[]};
  if(estimatedScore==='' || estimatedScore==null)throw new Error('请填写参考分值。');
  const score=Number(estimatedScore),max=Number(item.maxScore),basis=String(reason).trim();
  if(!Number.isFinite(score)||score<0||item.maxScore==null||!Number.isFinite(max)||score>max)throw new Error('参考分值须在0与该项满分之间。');
  if(basis.length<8)throw new Error('请填写至少8个字的参考估分理由。');
  if(basis.length>2000)throw new Error('参考估分理由不能超过2000字。');
  const allowed=new Set(reportEvidence(report,true).map(doc=>doc.id)),ids=[...new Set(evidenceIds)];
  if(ids.some(id=>!allowed.has(id)))throw new Error('参考证据必须来自本报告的企业快照或本次证照。');
  return {scoreId,estimatedScore:score,reason:basis,evidenceIds:ids};
}
export function safeReportConclusion(report) {
  const value=report.outputs?.conclusion||report.presentation?.outputs?.conclusion||{label:'待核验',reasons:[]};
  const screening=report.companyAnalysis?.screening;
  const qualification=report.companyAnalysis?.qualification;
  if(qualification?.status==='unmet')return {...value,label:'不建议投',reasons:['已确认存在资格或符合性硬门槛不满足',...list(value.reasons)]};
  if(qualification?.status==='pending'&&value.label!=='不建议投')return {...value,label:'待核验',reasons:['五类资格及企业原件尚未完成核验',...list(value.reasons)]};
  const gate=typeof screening?.hardGate==='object'?screening.hardGate?.status:screening?.hardGate;
  if(gate==='unmet'||screening?.status==='blocked')return {...value,label:'不建议投',reasons:[screening.reason||'已确认硬门槛不满足',...list(value.reasons)]};
  if(screening?.scoreStatus==='below-threshold'||screening?.status==='below-threshold')return {...value,label:'不建议投',reasons:[screening.reason||'未达到企业内部95%规则，内部不建议参与；资格核验状态独立保留',...list(value.reasons)]};
  if(value.label==='不建议投')return value;
  if(gate==='pending'||screening?.scoreStatus==='pending'||screening?.status==='pending'){
    if(!report.companyAnalysis?.companyId)return {...value,label:'待核验',reasons:list(value.reasons).length?list(value.reasons):['未选择企业，企业条件及预计分待核验。']};
    return {...value,label:'待核验',reasons:[screening?.reason||'企业条件或内部筛选仍待核验',...list(value.reasons)]};
  }
  return value;
}

const sourceRefsHTML=(references=[])=>list(references).map(ref=>`<button type="button" class="btn link source-ref" data-source-reference="${escape(JSON.stringify(ref))}">${escape(ref.page!=null?`第${ref.page}页`:ref.section||'查看出处')}</button>`).join('');
function recordMatchHTML(record) {
  const fields=record.fields||{},labels=[['subjectName','材料主体'],['projectType','项目类型'],['contractDate','合同日期'],['amount','金额（元）'],['clientName','采购人'],['role','岗位'],['employer','单位'],['registeredName','登记名称'],['category','类别'],['specialty','专业'],['grade','等级'],['brand','品牌'],['model','型号'],['certificateNumber','证书编号'],['bCertificateNumber','B证编号'],['validUntil','有效期至']];
  return `<div class="matched-record"><strong>${escape(record.name||'资料名称待补充')}</strong><span class="badge">${statusText(record.status||'candidate')}</span><dl>${labels.filter(([key])=>fields[key]!=null&&fields[key]!=='').map(([key,label])=>`<div><dt>${label}</dt><dd>${escape(fields[key])}</dd></div>`).join('')}</dl>${list(record.documentIds).length?`<div class="matched-files">${record.documentIds.map(id=>`<button type="button" class="btn link" data-company-document="${escape(id)}">查看原件</button>`).join('')}</div>`:''}${sourceRefsHTML(record.sources)}${list(record.missing).length?`<p class="missing-inline">缺项：${escape(record.missing.join('；'))}</p>`:''}</div>`;
}
const numberText=value=>value==null?'待核验':escape(value);
export function companyAnalysisHTML(report = {}) {
  const analysis=report.companyAnalysis||report.presentation?.companyAnalysis;
  if(!analysis)return '<section class="company-report"><h2>企业匹配与得分测算</h2><p class="muted">这份报告未绑定企业资料。文件分析仍可完整查看；企业条件与预计分保留待核验。</p><button type="button" class="btn link" data-view="companies">管理本地企业资料</button></section>';
  const screening=analysis.screening||{},forecast=analysis.forecast||{},scenario=forecast.scenario||{},docs=reportEvidence(report);
  const screeningLabel=statusText(screening.status),scoreLabel=statusText(screening.scoreStatus);
  const assumptions=[...new Set([...list(analysis.assumptions),...list(scenario.assumptions)])];
  if(hasNonScoringMethod(report)&&forecast.status==='not-applicable'){
    const matches=list(analysis.matches);
    return `<section class="company-report" aria-label="企业匹配与资格核验"><div class="section-heading"><h2>企业匹配与资格核验</h2><span class="badge">${escape(analysis.companyName||'未选择企业')}</span></div><p class="muted">${analysis.companyId?'按本报告保存的企业资料快照逐项核验。':'未选择企业，采购文件照常分析，企业条件仍待核验。'}</p>${predictionSummaryHTML(analysis,report)}${matches.length?`<details class="company-matches"><summary>查看逐项资料匹配（${matches.length}项）</summary>${matches.map(match=>`<article class="company-match"><h4>${escape(match.title)}</h4><span class="badge">${statusText(match.status)}</span>${list(match.records).map(recordMatchHTML).join('')||'<p class="muted">尚无可列出的匹配资料。</p>'}${list(match.missing).length?`<p class="missing-inline">待补 / 待核：${escape(match.missing.join('；'))}</p>`:''}${list(match.reasons).length?`<p>${escape(match.reasons.join('；'))}</p>`:''}${sourceRefsHTML(match.references)}</article>`).join('')}</details>`:''}${!analysis.companyId?'<button type="button" class="btn link" data-view="companies">管理本地企业资料</button>':''}</section>`;
  }
  let html=`<section class="company-report" aria-label="企业匹配与得分测算"><div class="section-heading"><h2>企业匹配与得分测算</h2><span class="badge">${escape(analysis.companyName||'未选择企业')}</span></div><p class="muted">${analysis.companyId?'使用生成报告时保存的企业快照，当前资料库编辑不会改变本报告。':'未选择企业，采购文件照常分析，企业资料支持情况待核验。'}</p>${predictionSummaryHTML(analysis)}<div class="screening-result"><strong>${screeningLabel}</strong><p>${escape(screening.reason||'先核验资格与废标硬条件，再查看得分预测。')}</p>${screening.internalScreening?`<details><summary>企业内部筛选参考（独立于招标资格）</summary><p>商务与独立附加合计：参考 ${numberText(screening.internalScreening.numerator)} / 满分 ${numberText(screening.internalScreening.denominator)}；内部参考阈值 ${escape((screening.internalScreening.threshold??.95)*100)}%，${statusText(screening.internalScreening.status)}。${escape(screening.internalScreening.reason||'该参考不单独决定投标可行性。')}</p></details>`:`<p>商务与独立附加合计：预计 ${numberText(screening.numerator)} / 满分 ${numberText(screening.denominator)}。内部参考阈值 ${escape((screening.threshold??.95)*100)}%；不作为采购资格门槛。</p>`}</div>${list(analysis.matches).length?`<details class="company-matches"><summary>查看逐项资料匹配（${analysis.matches.length}项）</summary>${analysis.matches.map(match=>`<article class="company-match"><div class="section-heading"><h4>${escape(match.title)}</h4><span class="badge">${statusText(match.status)}</span></div>${list(match.records).length?match.records.map(recordMatchHTML).join(''):'<p class="muted">尚无可列出的匹配资料。</p>'}${list(match.missing).length?`<p class="missing-inline">待补 / 待核：${escape(match.missing.join('；'))}</p>`:''}${list(match.reasons).length?`<p>${escape(match.reasons.join('；'))}</p>`:''}${sourceRefsHTML(match.references)}</article>`).join('')}</details>`:''}`;
  if(list(analysis.scoreRows).length)html+=`<h3 class="score-report-heading">逐项预计分</h3><p class="muted">规则预计仅计证据完整且已确认的客观支持；人工参考需要理由，不保证实际评审得分。</p><div class="table-scroll"><table class="company-score-table"><thead><tr><th scope="col">评分项 / 满分</th><th scope="col">资料支持与缺项</th><th scope="col">预计分</th></tr></thead><tbody>${analysis.scoreRows.map(row=>`<tr><td><span class="muted">${escape(row.group)}</span><br><strong>${escape(row.title)}</strong><br>满分 ${numberText(row.maxScore)}${list(row.materials).length?`<small>材料：${escape(row.materials.join('；'))}</small>`:''}<div>${sourceRefsHTML(row.references)}</div></td><td>${list(row.records).map(record=>`<div>${escape(record.name)}${record.fields?.brand||record.fields?.model?`（${escape([record.fields.brand,record.fields.model].filter(Boolean).join(' / '))}）`:''}</div>`).join('')||'<span class="muted">未列出匹配资料</span>'}${list(row.reasons).length?`<p>${escape(row.reasons.join('；'))}</p>`:''}${list(row.missing).length?`<p class="missing-inline">${escape(row.missing.join('；'))}</p>`:''}</td><td>${row.calculationKind==='assumed-full'?`<span>满分假设：${numberText(row.assumedScore)}</span>`:`<span>规则预计：${numberText(row.expectedScore)}</span>`}${row.range?`<small>测算区间：${numberText(row.range.min)}–${numberText(row.range.max)}</small>`:''}<br><span>人工参考：${numberText(row.referenceScore)}</span><small>${statusText(row.status)}</small></td></tr>${row.maxScore!=null?`<tr class="score-assessment-row"><td colspan="3"><details><summary>填写 / 修改「${escape(row.title)}」人工参考估分</summary><form data-score-assessment="${escape(row.scoreId)}"><label>参考分值<input type="number" name="estimatedScore" min="0" max="${escape(row.maxScore)}" step="0.01" required value="${escape(row.referenceScore)}"></label><label>参考估分理由<textarea name="reason" required minlength="8" maxlength="2000" placeholder="至少8字，说明估分依据与尚未确认的假设">${escape(list(report.scoreAssessments).find(item=>item.scoreId===row.scoreId)?.reason||'')}</textarea></label><fieldset><legend>关联证据（可选）</legend>${docs.length?docs.map(doc=>`<label class="check-label"><input name="evidenceIds" type="checkbox" value="${escape(doc.id)}"${list(report.scoreAssessments).find(item=>item.scoreId===row.scoreId)?.evidenceIds?.includes(doc.id)?' checked':''}>${escape(doc.fileName)}</label>`).join(''):'<span class="muted">本报告暂无企业原件或一次性证照可选。</span>'}</fieldset><div class="actions"><button type="submit" class="btn">保存参考估分</button>${row.referenceScore!=null?`<button type="button" class="btn link" data-clear-score="${escape(row.scoreId)}">清除参考估分</button>`:''}<span class="score-response" role="status"></span></div></form></details></td></tr>`:''}`).join('')}</tbody></table></div>`;
  html+=`<div class="forecast-summary"><h3>分值口径与满分假设</h3><p>已确认资料支持 ${numberText(forecast.evidenceSupportedScore)} 分；人工参考 ${numberText(forecast.referenceScore)} 分；待核项满分 ${numberText(forecast.pendingMaxScore)} 分。</p><p>技术满分假设 ${numberText(scenario.technicalMax)} 分，清单满分假设 ${numberText(scenario.billMax)} 分，报价满分假设 ${numberText(scenario.priceMax)} 分${scenario.total!=null?`，合计假设 ${numberText(scenario.total)} 分`:''}。</p><p>人员分包含在技术分内，只计一次；评审价格扣除属于报价处理，不是附加分。满分假设不保证取得对应分值。</p>${assumptions.length?`<ul>${assumptions.map(item=>`<li>${escape(readable(item))}</li>`).join('')}</ul>`:''}</div></section>`;
  if(!analysis.companyId)return `<section class="company-report" aria-label="企业匹配与得分测算"><h2>企业匹配与得分测算</h2><p class="muted">未选择企业，文件照常分析，企业匹配与预计分待核验。</p>${predictionSummaryHTML(analysis)}<button type="button" class="btn link" data-view="companies">管理本地企业资料</button><details class="more-details company-estimate-details"><summary>查看完整测算、人工参考及满分假设</summary>${html}</details></section>`;
  return html;
}

export function makeCompanyClient(api) {
  const idPath=id=>`/api/companies/${encodeURIComponent(id)}`;
  return {
    async list(){const value=await api.request('/api/companies');return list(value.companies);},
    get:id=>api.request(idPath(id)),
    create(name){const trimmed=String(name).trim();if(!trimmed)throw new Error('请填写企业名称。');return api.request('/api/companies',{method:'POST',body:{name:trimmed,records:[]}});},
    save:company=>api.request(idPath(company.id),{method:'PUT',body:{name:company.name,records:company.records}}),
    importDocuments:(id,type,documentIds)=>api.request(`${idPath(id)}/import`,{method:'POST',body:{type,documentIds}})
  };
}
