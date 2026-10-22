import {buildSuitabilityAssessment,validateSuitabilityReview} from '../core/suitability.js';
import {buildPricingAnalysis} from '../core/pricing.js';
import express from 'express';import multer from 'multer';import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';import {basename,extname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {unlink,mkdir,copyFile,chmod,rm,stat,writeFile,rename} from 'node:fs/promises';
import {createStore} from './store.js';import {validateSettings,enhanceAnalysis,testConnection} from './ai.js';import {exportReport} from './export.js';import {extractDocument} from '../core/extractor.js';import {analyzeDocument,summarizeReport} from '../core/analyzer.js';import {CATEGORIES,OUTPUTS} from '../core/contracts.js';
import {webChatDocumentSelections,createWebChatRequest,createWebChatReviewRequest,mergeWebChatReply} from './web-chat.js';
import {localCalendarDate} from '../core/project-context.js';
import {registerPolicyRoutes,validateProjectContext} from './policy.js';
import {registerCompanyRoutes} from './company.js';
import {ensureEmbeddedAttachments} from './embedded.js';
import {readFile} from 'node:fs/promises';
const appVersion=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8')).version;
const pdfjsRoot=fileURLToPath(new URL('../../node_modules/pdfjs-dist/',import.meta.url));
const publicDir=fileURLToPath(new URL('../../public/',import.meta.url));
const safeDocument=doc=>{const {path,...safe}=doc;return safe;};
const hasReadableText=extraction=>Array.isArray(extraction?.blocks)&&extraction.blocks.some(block=>typeof block?.text==='string'&&block.text.trim());
function embeddedAnalysisInput(extraction,expanded,children){
 if(!expanded.inventory?.length&&!expanded.warnings?.length)return extraction;
 const warnings=(extraction.warnings||[]).filter(warning=>warning.code!=='DOC_EMBEDDED_UNPARSED');
 const unread=expanded.inventory.filter(entry=>['unsupported','blocked','unread','failed','partial'].includes(entry.status));
 const generatedIds=new Set(expanded.inventory.map(entry=>entry.documentId)),readChildren=children.filter(child=>generatedIds.has(child.id)&&hasReadableText(child));
 warnings.push(...expanded.warnings);
 if(unread.length)warnings.push({code:'DOC_EMBEDDED_UNPARSED',message:`${readChildren.length?'已展开可读内嵌附件并单独分析':'内嵌附件内容尚未读取'}；仍未解析：${unread.map(entry=>entry.name||entry.fileName||entry.archiveEntry||'附件').join('；')}。图纸文字识别不代表图面尺寸及工程量已核实。`});
 if(readChildren.some(child=>/图纸|drawing/i.test(child.fileName)))warnings.push({code:'DRAWING_GEOMETRY_UNVERIFIED',message:'图纸附件已进入独立逐页文字提取/OCR；图面尺寸、比例及工程量关系仍须对照原图核验。'});
 return {...extraction,warnings};
}
function embeddedInventory(expanded,children){
 const byId=new Map(children.map(child=>[child.id,child]));
 return (expanded.inventory||[]).map(entry=>{const child=byId.get(entry.documentId);return child?{...entry,status:hasReadableText(child)?'read':'unread',complete:child.complete===true,pages:child.pages?.length||0,blocks:child.blocks?.length||0}:entry;});
}
function retainEvidenceGaps(report,evidence){
 if(!evidence.length)return report;
 const warnings=[...(report.warnings||[])];
 const append=warning=>{if(!warnings.some(existing=>existing.documentId===warning.documentId&&existing.code===warning.code&&existing.message===warning.message&&existing.page===warning.page))warnings.push(warning);};
 let incomplete=false;
 for(const item of evidence){
  for(const warning of item.warnings||[])append({...warning,documentId:item.id,message:`证照 ${item.fileName}：${warning.message}`});
  if(!hasReadableText(item)){incomplete=true;append({code:'EVIDENCE_READ_FAILED',documentId:item.id,message:`${item.fileName}未读取到可分析文字，证照内容未完成对照，企业资料及资格仍待核验。`});}
  else if(item.complete===false){incomplete=true;append({code:'EVIDENCE_PARTIAL',documentId:item.id,message:`${item.fileName}仅部分内容可读取，证照附表、图片或其他读取缺口仍需对照原件核验。`});}
 }
 report.warnings=warnings;if(incomplete)report.coverage={...report.coverage,complete:false};return summarizeReport(report);
}
const extensions=new Set(['.pdf','.doc','.docx','.xlsx','.xls','.txt','.md','.png','.jpg','.jpeg','.webp','.bmp','.tif','.tiff']);
const webBlockingStages=new Set(['environment-risk','login','captcha','quota','upload-error','oversized','quality-mode','review','draft','attachments','unsupported','failed']);
function webCancellationCause(value){
 // The desktop bridge may supply a small diagnostic, never a path, arbitrary
 // object or object accessor. Invalid diagnostics retain normal cancel behavior.
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;
  const keys=Reflect.ownKeys(value),fields=Object.getOwnPropertyDescriptors(value);
  if(keys.length!==2||!keys.includes('blockingStage')||!keys.includes('message')||!Object.hasOwn(fields.blockingStage,'value')||!Object.hasOwn(fields.message,'value'))return null;
  const blockingStage=fields.blockingStage.value,message=fields.message.value;
  if(!webBlockingStages.has(blockingStage)||typeof message!=='string'||!message.trim()||message.length>500)return null;
  return {blockingStage,message};
 }catch{return null;}
}
export async function createService({dataDir,port=0,secretVault=null,fetchImpl=fetch}={}){
 const store=await createStore(dataDir),app=express(),token=randomBytes(32).toString('hex'),jobs=new Map(),webRequests=new Map(),webReportLocks=new Set(),reportEditLocks=new Set(),webOperations=new Set();let server,url,sessionKey='',queue=Promise.resolve(),closed=false,closePromise;let settings={enabled:false,provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'',...await store.loadSettings()};
 const keyContext=config=>config.provider+'|'+new URL(config.baseUrl).origin;
 const rawKey=async()=>secretVault?await secretVault.get():sessionKey;
 const getKey=async(config=settings)=>settings.keyBinding===keyContext(config)?await rawKey():'';
 const reportIsBusy=id=>reportEditLocks.has(id)||webReportLocks.has(id)||[...jobs.values()].some(j=>['queued','running'].includes(j.status)&&j.reportIds.includes(id));
 const roundRecord=(pending,result,prompt,round)=>({round,requestId:pending.request.requestId,provider:pending.request.provider,request:prompt,rawText:result.webChat.rawText,capturedAt:result.webChat.capturedAt,coverage:structuredClone(result.webChat.coverage),contentCheckCount:(result.webChat.contentReview?.checks.length||0)+(result.webChat.contentReview?.omittedCount||0),displayedContentCheckCount:result.webChat.contentReview?.checks.length||0});
 async function persistWebReview(pending,status){
  if(!pending.first)return;
  // The durable raw audit is outside upload-copy cleanup. A report-write
  // failure must not erase an already captured provider answer.
  const folder=join(store.root,'web-chat-history');await mkdir(folder,{recursive:true,mode:0o700});
  const path=join(folder,pending.request.requestId+'.json'),temporary=path+'.'+randomUUID()+'.tmp';
  const audit={requestId:pending.request.requestId,reportId:pending.request.reportId,provider:pending.request.provider,status,updatedAt:new Date().toISOString(),files:pending.request.files.map(({documentId,fileName,role})=>({documentId,fileName,role})),reviewRounds:pending.rounds,...(pending.blockingCause?{blocking:{...pending.blockingCause}}:{}),...(pending.reviewPlan?{followup:{required:pending.reviewPlan.required,stopped:pending.reviewPlan.stopped||false,prompt:pending.reviewPlan.prompt,reason:pending.reviewPlan.reason,requestedAt:pending.reviewRequestedAt}}:{})};
  try{await writeFile(temporary,JSON.stringify(audit,null,2),{mode:0o600});await rename(temporary,path);}catch(error){await rm(temporary,{force:true}).catch(()=>{});throw error;}
 }
 async function saveFirstWebReview(pending,reason){
  if(!pending.first)return;
  const blocking=pending.blockingCause;if(blocking)reason=`网页分析受阻（${blocking.blockingStage}）：${blocking.message}；第二轮复核未完成。`;
  const result=structuredClone(pending.first.result),warning={code:'WEB_CHAT_REVIEW_INCOMPLETE',message:'仅保留首轮回答；自动纠错复核未完成，不能视为复核通过。'+reason,...(blocking?{blockingStage:blocking.blockingStage}:{})};
  result.webChat={...result.webChat,status:'partial',reviewRounds:[structuredClone(pending.first.round)],review:{attempted:true,completed:false,status:'incomplete',reason,...(blocking?{...blocking}:{}),requestedAt:pending.reviewRequestedAt||null,note:'首轮内容与企业条件仍待人工核验。'},warnings:[...result.webChat.warnings,warning]};
  result.warnings=[...(result.warnings||[]),warning];result.updatedAt=new Date().toISOString();
  const durable=await Promise.allSettled([persistWebReview(pending,'incomplete'),store.saveReport(result)]);
  const failed=durable.find(outcome=>outcome.status==='rejected');if(failed)throw failed.reason;return result;
 }
 // This bridge is returned only to the Electron main process. No HTTP route
 // accepts its file paths, request payloads or externally supplied answers.
 const desktopWebChat={
  async prepare(reportId,provider){
   if(closed)throw new Error('本地服务已关闭');
   if(reportIsBusy(reportId))throw new Error('该报告正在生成或网页分析进行中，请先完成或取消');
   webReportLocks.add(reportId);
   const preparation=(async()=>{let tempDir;try{
    const report=await store.getReport(reportId),ids=webChatDocumentSelections(report).map(selection=>selection.id);
    const documents=await Promise.all([...new Set(ids)].map(id=>store.getDocument(id)));
    const request=createWebChatRequest({report,documents,provider});
    tempDir=join(store.root,'web-chat',request.requestId);
    // Uploaded originals have UUID-only disk names. Give each request its own
    // named copies; per-file subdirectories also preserve duplicate filenames.
    for(let index=0;index<request.files.length;index++){
     const file=request.files[index],folder=join(tempDir,String(index+1)),path=join(folder,file.fileName);
     const fileInfo=await stat(file.path).catch(()=>null);
     if(!fileInfo?.isFile()||fileInfo.size===0)throw new Error('本次原文件为空或不可读取，请重新上传');
     await mkdir(folder,{recursive:true,mode:0o700});
     try{await copyFile(file.path,path);}catch{throw new Error('本次原文件不可读取，请重新分析');}
     await chmod(path,0o600);
     file.path=path;
    }
    if(closed)throw new Error('本地服务已关闭');
    webRequests.set(request.requestId,{request,documents,tempDir,originalReport:structuredClone(report),stage:'ready',reviewAttempted:false,rounds:[]});
    return structuredClone(request);
   }catch(error){try{if(tempDir)await rm(tempDir,{recursive:true,force:true});}finally{webReportLocks.delete(reportId);}throw error;}})();
   webOperations.add(preparation);try{return await preparation;}finally{webOperations.delete(preparation);}
  },
  async review(requestId,rawText){
   const pending=webRequests.get(requestId);
   if(closed||!pending||pending.cancelled)throw new Error('网页请求不存在、已取消或已失效');
   if(pending.reviewAttempted||pending.stage!=='ready')throw new Error('本次请求仅允许一次自动复核，或复核正在进行');
   pending.reviewAttempted=true;
   if(pending.request.provider!=='doubao')return {required:false,requestId};
   pending.stage='reviewing';
   const reviewing=(async()=>{
    try{
     const evaluated=mergeWebChatReply({report:pending.originalReport,documents:pending.documents,request:pending.request,rawText});
     if(evaluated.webChat.warnings.some(warning=>warning.code==='WEB_CHAT_REQUEST_MISMATCH'))throw new Error('首轮回答包含非本次请求标识，停止自动复核');
     const round=roundRecord(pending,evaluated,pending.request.prompt,1);pending.first={result:evaluated,round};pending.rounds=[round];
     await persistWebReview(pending,'first-captured');
     if(pending.cancelled||closed)return {required:false,stopped:true,requestId,reason:'本次复核已取消或服务关闭；首轮回答保留。'};
     const plan=createWebChatReviewRequest({report:pending.originalReport,documents:pending.documents,request:pending.request,evaluated});
     pending.reviewPlan=plan;pending.reviewRequestedAt=new Date().toISOString();
     await persistWebReview(pending,plan.required?'awaiting-review':plan.stopped?'stopped':'not-required');
     if(plan.stopped)await saveFirstWebReview(pending,plan.reason);
     if(pending.cancelled||closed)return {required:false,stopped:true,requestId,reason:'本次复核已取消或服务关闭；首轮回答保留。'};
     pending.stage=plan.stopped?'review-stopped':plan.required?'awaiting-review':'review-not-required';
     return structuredClone(plan);
    }catch(error){pending.stage='review-failed';if(pending.first)await saveFirstWebReview(pending,'复核检查失败：'+error.message);throw error;}
   })();
   pending.reviewPromise=reviewing;webOperations.add(reviewing);try{return await reviewing;}finally{webOperations.delete(reviewing);}
  },
  async complete(requestId,rawText){
   const pending=webRequests.get(requestId);
   if(closed||!pending)throw new Error('网页请求不存在、已取消或已失效');
   if(pending.stage==='reviewing')throw new Error('首轮复核检查正在进行，请勿提前完成');
   if(['review-stopped','review-failed'].includes(pending.stage))throw new Error('自动复核已停止或未完成，请取消并保留首轮回答');
   // Claim synchronously before any await. A completed/cancelled request cannot
   // be replayed; saving an accepted completion keeps its report lock held.
   webRequests.delete(requestId);
   const completion=(async()=>{
    try{
     const report=pending.originalReport;
     const result=mergeWebChatReply({report,documents:pending.documents,request:pending.request,rawText});
     if(pending.first){
      if(result.webChat.warnings.some(warning=>warning.code==='WEB_CHAT_REQUEST_MISMATCH'))throw new Error('复核回答不是本次请求标识，首轮回答保留');
      if(pending.reviewPlan?.required)pending.rounds=[pending.first.round,roundRecord(pending,result,pending.reviewPlan.prompt,2)];
      result.webChat.reviewRounds=structuredClone(pending.rounds);
      result.webChat.review={attempted:Boolean(pending.reviewPlan?.required),completed:Boolean(pending.reviewPlan?.required),status:pending.reviewPlan?.required?(result.webChat.status==='partial'?'completed-with-gaps':'completed-pending-human'):'not-required',requestedAt:pending.reviewRequestedAt,note:'仅记录一次模型纠错取回；不代表内容已人工验收、企业资格已满足或实际得分确定。'};
      await persistWebReview(pending,'captured');
     }
     await store.saveReport(result);return result;
    }catch(error){if(pending.first)await saveFirstWebReview(pending,'末轮取回或保存失败：'+error.message);throw error;
    }finally{try{await rm(pending.tempDir,{recursive:true,force:true});}finally{webReportLocks.delete(pending.request.reportId);}}
   })();
   webOperations.add(completion);
   try{return await completion;}
   finally{webOperations.delete(completion);}
  },
  async cancel(requestId,cause){
   const pending=webRequests.get(requestId);if(!pending)return false;
   pending.blockingCause=webCancellationCause(cause);pending.cancelled=true;webRequests.delete(requestId);
   const cancellation=(async()=>{try{if(pending.reviewPromise)await pending.reviewPromise.catch(()=>{});if(pending.first)await saveFirstWebReview(pending,closed?'服务关闭，第二轮复核未完成。':'自动操作已取消或等待超时，第二轮复核未完成。');return true;}finally{try{await rm(pending.tempDir,{recursive:true,force:true});}finally{webReportLocks.delete(pending.request.reportId);}}})();
   webOperations.add(cancellation);try{return await cancellation;}finally{webOperations.delete(cancellation);}
  }
 };
 const publicSettings=async()=>({enabled:settings.enabled,provider:settings.provider,baseUrl:settings.baseUrl,model:settings.model,hasKey:!!await getKey(),keyStorage:secretVault?'system':'session'});
 app.disable('x-powered-by');
 app.use((req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; worker-src 'self'; base-uri 'none'; form-action 'self'"});
  const host=req.headers.host;if(!server||!['127.0.0.1:'+server.address().port,'localhost:'+server.address().port].includes(host))return res.status(403).json({error:'仅允许本机访问'});
  if(req.headers.origin&&!['http://'+host].includes(req.headers.origin))return res.status(403).json({error:'不允许跨站访问'});
  if(req.path.startsWith('/api/')&&req.path!=='/api/bootstrap'){const input=req.headers['x-biaoxi-token'];if(typeof input!=='string'||input.length!==token.length||!timingSafeEqual(Buffer.from(input),Buffer.from(token)))return res.status(401).json({error:'会话已失效，请刷新页面'});}next();
 });
 app.use(express.json({limit:'3mb'}));
 app.get('/api/bootstrap',(req,res)=>res.json({version:appVersion,token,categories:CATEGORIES,outputs:OUTPUTS,desktop:!!secretVault,uploadLimits:{fileBytes:100*1024*1024,spreadsheetBytes:20*1024*1024,files:20}}));
 await registerPolicyRoutes(app,{store,fetchImpl});
 registerCompanyRoutes(app,{store,reportIsBusy,reportEditLocks});
 const upload=multer({storage:multer.diskStorage({destination:store.folders.uploads,filename:(req,file,cb)=>cb(null,randomUUID())}),limits:{fileSize:100*1024*1024,files:20,fields:3},fileFilter:(req,file,cb)=>cb(extensions.has(extname(file.originalname).toLowerCase())?null:new Error('支持 PDF、Word（DOC/DOCX）、Excel（XLSX/XLS，20MB以内）、图片、TXT'),extensions.has(extname(file.originalname).toLowerCase()))});
 app.post('/api/documents',upload.array('files',20),async(req,res,next)=>{
  try{if(!req.files?.length)throw new Error('请选择文件');if(!['tender','attachment','evidence'].includes(req.body.role||'tender'))throw new Error('无效的文件用途');if(req.files.some(file=>['.xlsx','.xls'].includes(extname(file.originalname).toLowerCase())&&file.size>20*1024*1024))throw new Error('Excel文件解析上限为20MB，请拆分后上传；其他文件上传上限为100MB');const documents=[];for(const file of req.files){const decoded=Buffer.from(file.originalname,'latin1').toString('utf8'),name=decoded.includes('\ufffd')?file.originalname:decoded;const doc={id:randomUUID(),fileName:basename(name.replace(/\\/g,'/')),name:basename(name.replace(/\\/g,'/')),path:file.path,mimeType:extname(name).toLowerCase()==='.xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':extname(name).toLowerCase()==='.xls'?'application/vnd.ms-excel':file.mimetype,role:req.body.role||'tender',byteSize:file.size,createdAt:new Date().toISOString(),status:'queued'};await store.saveDocument(doc);documents.push(safeDocument(doc));}res.json({documents});}catch(e){await Promise.all((req.files||[]).map(f=>unlink(f.path).catch(()=>{})));next(e);}
 });
 app.get('/api/documents',async(req,res)=>res.json({documents:(await store.listDocuments()).map(safeDocument)}));
 app.get('/api/documents/:id',async(req,res,next)=>{try{res.json(safeDocument(await store.getDocument(req.params.id)));}catch(e){next(e);}});
 app.get('/api/documents/:id/file',async(req,res,next)=>{try{const doc=await store.getDocument(req.params.id);res.type(extname(doc.fileName)||'application/octet-stream');res.set('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);res.sendFile(doc.path,error=>{if(error)next(error);});}catch(error){next(error);}});
 async function extract(doc,job,base,span){
  // Historical failed extractions were saved as ready. Retry their original
  // bytes; a cache with real partial text remains useful and is not discarded.
  if(hasReadableText(doc.extraction))return doc.extraction;
  doc.status='extracting';delete doc.error;await store.saveDocument(doc);job.message=`读取 ${doc.fileName}`;
  try{doc.extraction=await extractDocument(doc,{signal:job.controller.signal,onProgress:p=>{job.progress=Math.min(85,base+span*(typeof p==='number'?p:p.progress||0));job.message=typeof p==='object'&&p.message?p.message:`读取 ${doc.fileName}`;}});}
  catch(e){
   if(job.controller.signal.aborted){doc.status='error';doc.error='已取消读取';await store.saveDocument(doc);throw e;}
   doc.extraction={id:doc.id,fileName:doc.fileName,blocks:[],pages:[],complete:false,warnings:[{code:'READ_FAILED',message:'文件无法完整读取：'+e.message}]};
  }
  if(!hasReadableText(doc.extraction)){
   const cause=(doc.extraction.warnings||[]).find(w=>w.code==='READ_FAILED'||w.code==='UNSUPPORTED_FORMAT'||w.code==='NO_TEXT')?.message;
   doc.status='error';doc.error=`${doc.fileName}未读取到可分析正文，请核对原件或重新上传可读取版本。${cause?' '+cause:''}`;
   doc.extraction.complete=false;await store.saveDocument(doc);
   if(doc.role==='tender')throw new Error(doc.error);
   return doc.extraction;
  }
  doc.status='ready';delete doc.error;await store.saveDocument(doc);return doc.extraction;
 }
 app.post('/api/analyses',async(req,res,next)=>{
  try{const {documentIds,attachmentIds=[],evidenceIds=[],mode='offline',companyId=null,projectContext:inputContext={}}=req.body;if(!Array.isArray(documentIds)||!documentIds.length||documentIds.length>20)throw new Error('请选择1到20份主招标文件');if(!['offline','online'].includes(mode))throw new Error('无效的分析模式');if(!Array.isArray(attachmentIds)||!Array.isArray(evidenceIds)||attachmentIds.length>20||evidenceIds.length>20)throw new Error('关联文件过多');if(mode==='online'&&(!settings.enabled||!await getKey()||!settings.model))throw new Error('请先开启并配置 AI 接口，或选择离线分析');
   const documents=await Promise.all([...new Set(documentIds)].map(id=>store.getDocument(id))),attachments=await Promise.all([...new Set(attachmentIds)].map(id=>store.getDocument(id))),evidence=await Promise.all([...new Set(evidenceIds)].map(id=>store.getDocument(id)));if(documents.some(d=>d.role!=='tender')||attachments.some(d=>d.role!=='attachment')||evidence.some(d=>d.role!=='evidence'))throw new Error('文件用途与本次选择不一致');
   const mainIds=new Set(documents.map(document=>document.id));if(attachments.some(item=>(item.derivedFrom||item.rootDocumentId)&&!mainIds.has(item.rootDocumentId)))throw new Error('内嵌附件归属其他主文件，不能混入本项目');
   const projectContext=validateProjectContext(inputContext),policyRecord=structuredClone(await store.getActivePolicyPackage()),policyPackage=policyRecord.package,analysisDate=localCalendarDate(),policySnapshot={version:policyRecord.version,sha256:policyRecord.sha256,package:policyPackage,asOf:analysisDate};
   const companySnapshot=companyId===null?null:structuredClone(await store.getCompany(companyId));
   const job={id:randomUUID(),status:'queued',progress:0,message:'等待分析',reportIds:[],controller:new AbortController()};jobs.set(job.id,job);const aiSettings={...settings,apiKey:mode==='online'?await getKey():''};
   queue=queue.catch(()=>{}).then(async()=>{if(job.controller.signal.aborted){job.status='cancelled';return;}job.status='running';try{
    const all=documents.length+attachments.length+evidence.length;let count=0;const attached=[],proof=[];for(const d of attachments)attached.push(await extract(d,job,count++/all*65,65/all));for(const d of evidence)proof.push(await extract(d,job,count++/all*65,65/all));
    for(const doc of documents){if(job.controller.signal.aborted)throw new Error('已取消');const extracted=await extract(doc,job,count++/all*65,65/all);
     const expanded=await ensureEmbeddedAttachments(doc,{store,signal:job.controller.signal,onProgress:value=>{if(value?.message)job.message=value.message;}}),embedded=[];
     const selectedAttachments=attachments.filter(item=>!item.derivedFrom&&!item.rootDocumentId||item.rootDocumentId===doc.id),explicitIds=new Set(selectedAttachments.map(item=>item.id));
     for(const child of expanded.documents)if(!explicitIds.has(child.id))embedded.push(await extract(child,job,Math.min(60,job.progress||0),0));
     const selectedAttachmentIds=selectedAttachments.map(item=>item.id),documentAttachments=[...attached.filter(item=>explicitIds.has(item.id)),...embedded],documentAttachmentIds=[...new Set([...selectedAttachmentIds,...expanded.documents.map(item=>item.id)])];
     const inventory=embeddedInventory(expanded,documentAttachments),inputExtraction=embeddedAnalysisInput(extracted,{...expanded,inventory},documentAttachments);
     job.message=`分析 ${doc.fileName} 的14类条款`;let report=retainEvidenceGaps(analyzeDocument(inputExtraction,{attachments:documentAttachments,evidence:proof,companySnapshot,policyPackage,projectContext,analysisDate,policySnapshot}),proof);report.id=randomUUID();report.attachmentIds=documentAttachmentIds;report.selectedAttachmentIds=selectedAttachmentIds;report.embeddedAttachments=inventory;report.evidenceIds=evidence.map(d=>d.id);report.mode='offline';const reportId=report.id;job.reportIds.push(reportId);await store.saveReport(report);if(mode==='online'){job.message='等待所选模型返回';try{const combined={...inputExtraction,blocks:[...inputExtraction.blocks.map(b=>({...b,role:'tender'})),...documentAttachments.flatMap(a=>a.blocks.map(b=>({...b,role:'attachment'}))),...proof.flatMap(a=>a.blocks.map(b=>({...b,role:'evidence'})))]};const enhanced=await enhanceAnalysis(combined,aiSettings,{signal:job.controller.signal,fetchImpl,reportContext:{findings:report.categories.flatMap(c=>c.items),coverage:report.coverage,warnings:report.warnings},onProgress:p=>{job.progress=65+p.progress*30;job.message=p.message;}});report=analyzeDocument(inputExtraction,{attachments:documentAttachments,evidence:proof,additionalFindings:enhanced.findings,companySnapshot,policyPackage,projectContext,analysisDate,procurementPolicy:report.procurementPolicy,policySnapshot:report.policySnapshot});report.id=reportId;report.attachmentIds=documentAttachmentIds;report.selectedAttachmentIds=selectedAttachmentIds;report.embeddedAttachments=inventory;report.evidenceIds=evidence.map(d=>d.id);report.mode=enhanced.findings.length||enhanced.synthesis?.status!=='failed'?'online':'offline';report.synthesis=enhanced.synthesis;report.warnings=[...(report.warnings||[]),...enhanced.warnings];if(enhanced.synthesis?.status!=='completed'){report.onlineFailed=true;report.analysisStatus='partial';if(enhanced.synthesis?.status==='failed'&&!enhanced.findings.length)report.warnings.push({code:'AI_FAILED',message:'联网分析未完成，继续使用已保存的离线分析报告。'});}report=summarizeReport(report);}catch(e){if(job.controller.signal.aborted){if(e.partialResult){const saved=analyzeDocument(inputExtraction,{attachments:documentAttachments,evidence:proof,additionalFindings:e.partialResult.findings,companySnapshot,policyPackage,projectContext,analysisDate,procurementPolicy:report.procurementPolicy,policySnapshot:report.policySnapshot});saved.id=reportId;saved.attachmentIds=documentAttachmentIds;saved.selectedAttachmentIds=selectedAttachmentIds;saved.embeddedAttachments=inventory;saved.evidenceIds=evidence.map(d=>d.id);saved.mode=e.partialResult.findings.length?'online':'offline';saved.synthesis=e.partialResult.synthesis;saved.onlineFailed=true;saved.warnings.push(...e.partialResult.warnings,{code:'AI_CANCELLED',message:'联网分析已取消，保留已完成内容；全文复核未完成。'});await store.saveReport(retainEvidenceGaps(summarizeReport(saved),proof));}throw e;}report.warnings.push({code:'AI_FAILED',message:e.message+'；继续使用已保存的离线分析报告'});report.analysisStatus='partial';report.onlineFailed=true;}}
     report.embeddedAttachments=inventory;report=retainEvidenceGaps(report,proof);await store.saveReport(report);job.progress=count/all*100;
    }job.status='completed';job.progress=100;job.message=`已保存 ${job.reportIds.length} 份独立报告`;
   }catch(e){job.status=job.controller.signal.aborted?'cancelled':'failed';job.error=job.controller.signal.aborted?'已取消；已完成的离线报告保留':e.message;job.message=job.error;}finally{delete job.controller;}});
   job.documents=documents.map(d=>d.id);res.status(202).json({jobId:job.id});
  }catch(e){next(e);}
 });
 app.get('/api/jobs/:id',(req,res)=>{const job=jobs.get(req.params.id);if(!job)return res.status(404).json({error:'任务不存在'});const {controller,...safe}=job;res.json(safe);});
 app.post('/api/jobs/:id/cancel',(req,res)=>{const job=jobs.get(req.params.id);if(!job)return res.status(404).json({error:'任务不存在'});job.controller?.abort();res.json({ok:true});});
 app.get('/api/reports',async(req,res)=>{const reports=await store.listReports();res.json({reports:reports.map(r=>({id:r.id,fileName:r.fileName,documentId:r.documentId,createdAt:r.createdAt,mode:r.mode,analysisStatus:reportIsBusy(r.id)?'归纳中':r.analysisStatus,conclusion:r.outputs?.conclusion?.label,riskCount:r.outputs?.risks?.length||0}))});});
 const withDecisionAssessments=report=>({...report,pricingAnalysis:report.pricingAnalysis||buildPricingAnalysis(report),suitabilityAssessment:buildSuitabilityAssessment(report)});
 app.get('/api/reports/:id',async(req,res,next)=>{try{res.json(withDecisionAssessments(await store.getReport(req.params.id)));}catch(e){next(e);}});
 app.put('/api/reports/:id/suitability',async(req,res,next)=>{
  const reportId=req.params.id;let locked=false;try{
   if(reportIsBusy(reportId))return res.status(409).json({error:'报告正在分析或编辑，请完成后再调整适投评估'});
   reportEditLocks.add(reportId);locked=true;
   const review=validateSuitabilityReview(req.body),report=await store.getReport(reportId);
   const updated=withDecisionAssessments({...report,suitabilityReview:review,updatedAt:new Date().toISOString()});
   await store.saveReport(updated);res.json(updated);
  }catch(error){next(error);}finally{if(locked)reportEditLocks.delete(reportId);}
 });
 app.delete('/api/reports/:id',async(req,res,next)=>{try{if(reportIsBusy(req.params.id))return res.status(409).json({error:'该报告正在生成，请完成或取消分析后再删除'});await store.deleteReport(req.params.id);res.json({ok:true});}catch(e){next(e);}});
 app.post('/api/reports/:id/review',async(req,res,next)=>{let editLocked=false;try{if(reportIsBusy(req.params.id))return res.status(409).json({error:'该报告正在生成，请完成或取消分析后再复核'});reportEditLocks.add(req.params.id);editLocked=true;const report=await store.getReport(req.params.id),{findingId,status,note=''}=req.body;if(!['pending','met','unmet','not-applicable'].includes(status)||typeof note!=='string'||note.length>2000)throw new Error('无效的复核内容');const item=report.categories.flatMap(c=>c.items).find(i=>i.id===findingId);if(!item)throw new Error('条款不存在');const outputItem=[...(report.outputs?.risks||[]),...(report.outputs?.scoreItems||[]),...(report.outputs?.commitments||[])].find(i=>i.id===findingId);const ids=new Set([findingId,...(outputItem?.relatedFindingIds||[])]);for(const related of report.categories.flatMap(c=>c.items).filter(i=>ids.has(i.id))){related.matchStatus=status;related.reviewed=status!=='pending';related.reviewNote=note;const notes=Array.isArray(related.notes)?related.notes:related.notes?[String(related.notes)]:[];related.notes=[...notes.filter(n=>!n.startsWith('人工复核：')),...(note?['人工复核：'+note]:[])];}report.updatedAt=new Date().toISOString();const result=summarizeReport(report);await store.saveReport(result);res.json(result);}catch(e){next(e);}finally{if(editLocked)reportEditLocks.delete(req.params.id);}});
 app.post('/api/reports/:id/coverage-review',async(req,res,next)=>{let editLocked=false;try{if(reportIsBusy(req.params.id))return res.status(409).json({error:'该报告正在生成，请稍后复核'});reportEditLocks.add(req.params.id);editLocked=true;const {reviewed,note=''}=req.body;if(typeof reviewed!=='boolean'||typeof note!=='string'||note.length>2000||(reviewed&&note.trim().length<8))throw new Error('请记录至少8个字的覆盖复核依据');const report=await store.getReport(req.params.id);report.coverageReview={reviewed,note:note.trim(),reviewedAt:new Date().toISOString()};report.updatedAt=new Date().toISOString();const result=summarizeReport(report);await store.saveReport(result);res.json(result);}catch(e){next(e);}finally{if(editLocked)reportEditLocks.delete(req.params.id);}});
 app.get('/api/reports/:id/export',async(req,res,next)=>{try{if(reportIsBusy(req.params.id))return res.status(409).json({error:'报告正在归纳，请完成或取消分析后再导出'});const report=await store.getReport(req.params.id),format=req.query.format;if(!['pdf','docx'].includes(format))throw new Error('请选择 PDF 或 Word');const b=await exportReport(report,format,{includeRaw:req.query.details==='1'});res.set({'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':`attachment; filename="report.${format}"; filename*=UTF-8''${encodeURIComponent(report.fileName+'-分析报告.'+format)}`});res.send(b);}catch(e){next(e);}});
 app.get('/api/settings',async(req,res)=>res.json(await publicSettings()));
 app.put('/api/settings',async(req,res,next)=>{try{const nextSettings=validateSettings(req.body);let binding=settings.keyBinding;if(keyContext(nextSettings)!==binding){binding=undefined;if(secretVault)await secretVault.set('');else sessionKey='';}if(req.body.apiKey!==undefined){if(typeof req.body.apiKey!=='string'||req.body.apiKey.length>3000)throw new Error('无效密钥');if(req.body.apiKey.trim()){if(secretVault)await secretVault.set(req.body.apiKey.trim());else sessionKey=req.body.apiKey.trim();binding=keyContext(nextSettings);}}settings={...nextSettings,keyBinding:binding};await store.saveSettings(settings);res.json(await publicSettings());}catch(e){next(e);}});
 app.post('/api/settings/test',async(req,res,next)=>{try{const config=validateSettings({...settings,...req.body,enabled:true});config.apiKey=req.body.apiKey?.trim()||await getKey(config);res.json(await testConnection(config,{fetchImpl}));}catch(e){next(e);}});
 app.use('/vendor/pdfjs',express.static(pdfjsRoot,{index:false}));
 app.use(express.static(publicDir,{index:'index.html'}));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const notFound=err.code==='ENOENT';let message=notFound?'本地记录不存在':err.code==='LIMIT_FILE_SIZE'?'单文件不能超过100MB':err.message||'操作失败';if(/password|Bearer |sk-[a-z]/i.test(message))message='操作失败，请检查设置';res.status(err.status|| (notFound?404:400)).json({error:message});});
 server=await new Promise((resolve,reject)=>{const s=app.listen(port,'127.0.0.1',()=>resolve(s));s.on('error',reject);});url=`http://127.0.0.1:${server.address().port}`;
 return {url,store,desktopWebChat,async close(){if(closePromise)return closePromise;closed=true;closePromise=(async()=>{const cleanup=[...webRequests.keys()].map(requestId=>desktopWebChat.cancel(requestId));for(const j of jobs.values())j.controller?.abort();await Promise.allSettled([queue,...webOperations,...cleanup]);await new Promise(resolve=>server.close(resolve));})();return closePromise;}};
}
