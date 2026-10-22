import {mkdir,readFile,writeFile,rename,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';import {randomUUID,createHash} from 'node:crypto';
export async function createStore(root){
 const folders={documents:join(root,'documents'),reports:join(root,'reports'),companies:join(root,'companies'),uploads:join(root,'uploads'),policies:join(root,'policies'),settings:root};
 await Promise.all(Object.values(folders).map(p=>mkdir(p,{recursive:true})));
 const valid=id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new Error('无效的记录编号');return id;};
 const path=(type,id)=>join(folders[type],valid(id)+'.json');
 const read=async(type,id)=>JSON.parse(await readFile(path(type,id),'utf8'));
 const save=async(type,item)=>{const dest=path(type,item.id),tmp=dest+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(item,null,2),{mode:0o600});await rename(tmp,dest);return item;};
 // All callers (analysis extraction, imports, error saves) pass through the same
 // document write gate. A stale queued object cannot remove an existing owner.
 const documentWrites=new Map();
 const saveDocument=item=>{
  const documentId=valid(item.id),input=structuredClone(item);
  const pending=(documentWrites.get(documentId)||Promise.resolve()).catch(()=>{}).then(async()=>{
   let current;try{current=await read('documents',documentId);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(current?.companyId){
    if(input.companyId&&input.companyId!==current.companyId)throw new Error('原件已有不可变的企业归属，不能改绑其他企业');
    input.companyId=current.companyId;
   }
   if(input.companyId)valid(input.companyId);
   return save('documents',input);
  });
  documentWrites.set(documentId,pending);
  const release=()=>{if(documentWrites.get(documentId)===pending)documentWrites.delete(documentId);};pending.then(release,release);
  return pending;
 };
 const list=async type=>{const names=await readdir(folders[type]);const items=await Promise.all(names.filter(n=>n.endsWith('.json')).map(n=>read(type,n.slice(0,-5)).catch(()=>null)));return items.filter(Boolean).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));};
 const canonical=value=>JSON.stringify(value&&typeof value==='object'?(Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))]))):value);
 const policyId=version=>{if(typeof version!=='string'||!version.trim()||version.length>100)throw new Error('无效政策版本');return createHash('sha256').update(version).digest('hex');};
 const getPolicyPackage=async version=>{const record=await read('policies',policyId(version));if(record.version!==version)throw new Error('政策版本不匹配');return record;};
 const activeFile=join(folders.policies,'active.json'),checkFile=join(folders.policies,'check.json');
 const atomicJSON=async(dest,data)=>{const tmp=dest+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await rename(tmp,dest);};
 let policyWrites=Promise.resolve();
 const savePolicyPackage=(pkg,{activate=true}={})=>{
  const input=structuredClone(pkg);const pending=policyWrites.catch(()=>{}).then(async()=>{
   const sha256=createHash('sha256').update(canonical(input)).digest('hex');let current;
   try{current=await getPolicyPackage(input.version);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(current&&current.sha256!==sha256){const error=new Error('同一政策版本已有不同内容，请使用新的版本号；旧版本不能覆盖');error.status=409;throw error;}
   const record=current||{id:policyId(input.version),version:input.version,sha256,package:input,importedAt:new Date().toISOString()};
   if(!current)await save('policies',record);
   let active;try{active=JSON.parse(await readFile(activeFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(activate||!active)await atomicJSON(activeFile,{version:record.version,sha256:record.sha256});return record;
  });policyWrites=pending;return pending;
 };
 const getActivePolicyPackage=async()=>getPolicyPackage(JSON.parse(await readFile(activeFile,'utf8')).version);
 const listPolicyPackages=async()=>(await list('policies')).filter(item=>item.package&&item.version);
 const loadPolicyCheck=async()=>{try{return JSON.parse(await readFile(checkFile,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
 return {root,folders,savePolicyPackage,getPolicyPackage,getActivePolicyPackage,listPolicyPackages,loadPolicyCheck,savePolicyCheck:value=>atomicJSON(checkFile,value),saveDocument,getDocument:id=>read('documents',id),listDocuments:()=>list('documents'),saveCompany:c=>save('companies',c),getCompany:id=>read('companies',id),listCompanies:()=>list('companies'),saveReport:r=>save('reports',r),getReport:id=>read('reports',id),listReports:()=>list('reports'),deleteReport:id=>unlink(path('reports',id)),async loadSettings(){try{return JSON.parse(await readFile(join(root,'settings.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}},async saveSettings(settings){const p=join(root,'settings.json'),tmp=p+'.tmp';await writeFile(tmp,JSON.stringify(settings),{mode:0o600});await rename(tmp,p);}};
}
