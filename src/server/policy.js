import {createHash} from 'node:crypto';
import {DEFAULT_POLICY_PACKAGE,validatePolicyPackage} from '../core/procurement-policy.js';
import {validateProjectContext} from '../core/project-context.js';
export {validateProjectContext} from '../core/project-context.js';
const summary=record=>({version:record.version,sha256:record.sha256,checkedAt:record.package.checkedAt,importedAt:record.importedAt,sourceCount:record.package.sources.length,catalogCount:record.package.catalog.length});
const officialSources=DEFAULT_POLICY_PACKAGE.sources.map(source=>({id:source.id,title:source.title,url:source.url}));
const maxSourceBytes=10*1024*1024;
async function checkSource(source,expected,fetchImpl,signal){
 try{
  const response=await fetchImpl(source.url,{method:'GET',redirect:'manual',signal,headers:{Accept:'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html;q=0.8'}});
  if(!response.ok){await response.body?.cancel();throw new Error(`官方来源返回HTTP ${response.status}（不自动跟随重定向）`);}
  const announced=Number(response.headers.get('content-length'));if(announced>maxSourceBytes)throw new Error('官方来源超过10MB读取上限');
  if(!response.body)throw new Error('官方来源返回空内容');
  const reader=response.body.getReader(),hash=createHash('sha256');let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxSourceBytes){await reader.cancel();throw new Error('官方来源超过10MB读取上限');}hash.update(value);}}finally{reader.releaseLock();}
  if(!bytes)throw new Error('官方来源返回空内容');const actualSha256=hash.digest('hex');
  return {...source,status:expected?.url===source.url?(expected.sha256===actualSha256?'unchanged':'changed'):'unverified',bytes,expectedSha256:expected?.url===source.url?expected.sha256:null,actualSha256,...(expected?.url!==source.url?{error:'当前政策包来源与固定核对范围不同，不能据此确认该来源已更新'}:{})};
 }catch(error){return {...source,status:'failed',error:error.name==='AbortError'?'官方来源读取超时':error.message};}
}
export async function registerPolicyRoutes(app,{store,fetchImpl}){
 await store.savePolicyPackage(validatePolicyPackage(DEFAULT_POLICY_PACKAGE),{activate:false});
 let checking=false;
 app.get('/api/policy',async(req,res,next)=>{try{const active=await store.getActivePolicyPackage();res.json({active:summary(active),sources:active.package.sources,packages:(await store.listPolicyPackages()).map(summary),lastCheck:await store.loadPolicyCheck(),checkScope:officialSources,message:'离线政策包不会后台联网；检查只核对固定官方原件的哈希，不自动编译或替换政策目录。'});}catch(error){next(error);}});
 app.get('/api/policy/packages/:version',async(req,res,next)=>{try{res.json(await store.getPolicyPackage(req.params.version));}catch(error){next(error);}});
 app.post('/api/policy/import',async(req,res,next)=>{try{if(Object.keys(req.body||{}).some(key=>key!=='policyPackage'))throw new Error('导入仅接受policyPackage');const pkg=validatePolicyPackage(req.body.policyPackage),record=await store.savePolicyPackage(pkg);res.status(201).json(summary(record));}catch(error){next(error);}});
 app.post('/api/policy/check-updates',async(req,res,next)=>{
  if(checking)return res.status(409).json({error:'正在核对官方来源，请稍后再检查'});
  try{if(!req.body||Array.isArray(req.body)||typeof req.body!=='object'||Object.keys(req.body).length)throw new Error('政策更新只检查固定官方来源，不接受自定义网址');checking=true;
   const active=await store.getActivePolicyPackage(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);let sources;
   try{sources=await Promise.all(officialSources.map(source=>checkSource(source,active.package.sources.find(item=>item.id===source.id),fetchImpl,controller.signal)));}finally{clearTimeout(timeout);}
   const status=sources.some(source=>source.status==='changed')?'pendingReview':sources.every(source=>source.status==='unchanged')?'checkedUnchanged':'incomplete';
   const result={version:active.version,checkedAt:new Date().toISOString(),status,sources,message:status==='pendingReview'?'官方原件内容有变化，待人工复核并导入经过核对的新版本政策包；当前目录与已保存报告未更新。':status==='checkedUnchanged'?'本次固定官方来源原件与当前包哈希一致；仅确认所列范围，地方政策和范围外文件仍需核对。':'部分官方来源未能确认，不能宣称政策已更新或为最新。'};
   await store.savePolicyCheck(result);res.json(result);
  }catch(error){next(error);}finally{checking=false;}
 });
}
