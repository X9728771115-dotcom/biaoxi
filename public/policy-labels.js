// Shared wording for the on-screen project list and both report export formats.
export function procurementPolicyLabel(row={}){
 if(row.policyType==='energy')return row.policyKind==='requirement'?'政府强制采购节能':'节能优先采购';
 if(row.policyType==='environment')return '环境标志优先采购';
 if(row.policyType==='greenMaterial')return row.policyKind==='requirement'?'适用项目绿色建材必选':'适用项目选用';
 return '范围待核验';
}
export function procurementPolicyOverview(products=[]){
 const candidates=products.filter(row=>row.status!=='notApplicable');
 return {energyMandatory:candidates.filter(row=>row.policyType==='energy'&&row.policyKind==='requirement').length,preference:candidates.filter(row=>['energy','environment'].includes(row.policyType)&&row.policyKind==='preference').length,greenMaterial:candidates.filter(row=>row.policyType==='greenMaterial').length,pending:products.filter(row=>['pending','missing'].includes(row.status)).length};
}
const CERTIFICATE_LABELS={energy:'节能产品认证',environment:'环境标志产品认证',greenMaterial:'绿色建材认证',testReport:'检测报告',ccc:'CCC认证',iso:'ISO体系认证',other:'其他证明'};
export function procurementPolicyDisplay(report={}){
 const policy=report.procurementPolicy||report.presentation?.procurementPolicy;if(!policy)return null;
 const records=new Map((report.companySnapshot?.records||[]).map(record=>[record.id,record]));
 return {...policy,products:(policy.products||[]).map(row=>({...row,companyEvidence:(row.companyEvidence||[]).map(evidence=>{
  const record=records.get(evidence.recordId),fields=record?.fields||{},models=Array.isArray(fields.coveredModels)?fields.coveredModels:typeof fields.coveredModels==='string'?fields.coveredModels.split(/[、,，;；\n]+/).filter(Boolean):[];
  const visible=models.length<=5?models:[...new Set([...(models.includes(row.model)?[row.model]:[]),...models.slice(0,5)])].slice(0,5);
  const recordDetails=[fields.certificateNumber?'证号：'+fields.certificateNumber:'',fields.validUntil?'有效期至：'+fields.validUntil:'',visible.length?'覆盖型号：'+visible.join('、')+(models.length>visible.length?`（共${models.length}个型号，详见原件）`:''):''].filter(Boolean).join('；');
  const recordName=record?.name||evidence.recordName||(evidence.sources||[]).find(source=>source.fileName)?.fileName||`资料名称待核验（${CERTIFICATE_LABELS[evidence.certificateType]||'证明类别待核验'}）`;
  return {...evidence,recordName,recordDetails};
 })}))};
}
