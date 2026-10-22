// Shared by the local library and Node analysis. An attachment bundle is not a
// credential merely because its old type or directory label names a person.
const list=value=>Array.isArray(value)?value:[];
const hasValue=value=>Array.isArray(value)?value.some(hasValue):typeof value==='string'?value.trim().length>0:value!==undefined&&value!==null&&value!==false;
export function isCompanyArchiveRecord(record={}){
 const fields=record.fields||{},proofs=list(fields.evidence);
 if(proofs.length)return proofs.every(proof=>proof?.kind==='source');
 // Older bundles predate evidence.kind=source. Keep attached empty-fact
 // records visible in the archive without inferring facts from their names.
 const attached=list(record.documentIds).length>0||list(record.sources).length>0;
 const facts=Object.entries(fields).filter(([key])=>!['notes','evidence','name'].includes(key));
 return attached&&!facts.some(([,value])=>hasValue(value));
}
