const {join}=require('node:path');
const PROVIDERS={doubao:{label:'豆包',url:'https://www.doubao.com/chat/',hosts:['www.doubao.com','doubao.com']},deepseek:{label:'DeepSeek',url:'https://chat.deepseek.com/',hosts:['chat.deepseek.com']}};

function allowedProviderURL(provider,value){
 try {const url=new URL(value);return !!PROVIDERS[provider]&&url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&PROVIDERS[provider].hosts.includes(url.hostname);}
 catch {return false;}
}
function isTrustedChatSender(event,origin,ids){
 if(!event?.senderFrame||event.senderFrame.parent||!ids.has(event.sender?.id))return false;
 try {const frame=new URL(event.senderFrame.url),page=new URL(event.sender.getURL());return frame.origin===origin&&page.origin===origin&&['/','/index.html','/web-chat.html'].includes(frame.pathname)&&frame.href===page.href;}
 catch {return false;}
}
function selectCurrentReply(baseline,snapshot,requestId){
 if(snapshot.stage==='environment-risk'||snapshot.diagnostics?.environmentRisk===true)return null;
 if(!snapshot.markerSeen||!snapshot.markerAfterBaseline||snapshot.generating||!snapshot.completionVisible)return null;
 const ids=snapshot.assistantIds||[],answers=snapshot.answers||[],old=new Set(baseline.assistantIds||[]);
 const at=ids.length-1,text=answers[at];
 if(at<0||old.has(ids[at])||typeof text!=='string'||!text.includes(requestId)||text.length>1024*1024)return null;
 return text;
}
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted)return reject(new Error('已取消'));
 const abort=()=>{clearTimeout(timer);reject(new Error('已取消'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
 signal.addEventListener('abort',abort,{once:true});
});
function createChatRunner({adapter,prepare,review,complete,cancel,onState=()=>{},pollMs=1200,stableMs=4500,timeoutMs=15*60*1000}){
 let active=null,sequence=0,state={stage:'idle',message:'先登录所选平台，再开始本次文件分析。',running:false};
 const publish=(stage,message,extra={})=>{state={...state,stage,message,...extra};onState(state);return state;};
 const check=run=>{if(run.controller.signal.aborted||active!==run)throw new Error('已取消');};
 const checkPlatform=snapshot=>{
  const stage=snapshot.diagnostics?.environmentRisk===true?'environment-risk':snapshot.stage;
  if(['environment-risk','login','captcha','quota','upload-error','oversized'].includes(stage))throw Object.assign(new Error(stage==='environment-risk'?'平台提示当前使用环境受限，已停止网页分析；请按平台提示使用官方产品。':snapshot.message||'平台要求人工处理，已停止本次自动分析。'),{blockingStage:stage,diagnostics:snapshot.diagnostics});
 };
 async function waitForReply(run,baseline,anchor){
  const deadline=Date.now()+timeoutMs;let previous='',stableAt=0;
  while(Date.now()<deadline){
   check(run);const snapshot=await adapter.snapshot(run.requestId);check(run);
   if(snapshot.diagnostics&&JSON.stringify(snapshot.diagnostics)!==JSON.stringify(state.diagnostics))publish('waiting',state.message,{diagnostics:snapshot.diagnostics});
   checkPlatform(snapshot);
   if(anchor){
    const at=snapshot.assistantIds?.indexOf(anchor.id)??-1;
    if(!snapshot.markerSeen||!snapshot.markerAfterBaseline||at<0||snapshot.answers?.[at]!==anchor.text)throw new Error('复核期间会话或首轮回答已变化，已停止；首轮回答保留供复核。');
   }
   const reply=selectCurrentReply(baseline,snapshot,run.requestId);
   if(reply){
    if(reply!==previous){previous=reply;stableAt=Date.now();}
    else if(Date.now()-stableAt>=stableMs){run.awaitingReply=false;return {text:reply,id:snapshot.assistantIds.at(-1),snapshot};}
   }else{previous='';stableAt=0;}
   await wait(pollMs,run.controller.signal);
  }
  throw new Error(anchor?'对照原文复核等待超时，未取得属于本次任务的新回答；首轮回答保留供复核。':'等待超时，未取得明确完成且属于本次任务的回答；本地报告保留。');
 }
 const sameFirstReply=(baseline,snapshot,first,requestId)=>{
  checkPlatform(snapshot);
  if(snapshot.assistantIds?.at(-1)!==first.id||snapshot.answers?.at(-1)!==first.text||selectCurrentReply(baseline,snapshot,requestId)!==first.text)throw new Error('首轮回答或当前会话已变化，未发送复核要求；首轮回答保留供复核。');
  return snapshot;
 };
 async function start(){
  if(active)throw new Error('网页分析正在运行，请先完成或取消。');
  const run={controller:new AbortController(),requestId:null,sequence:++sequence};active=run;
  publish('checking','检查登录、输入框与上传入口…',{running:true,error:undefined,reportSaved:false,requestId:undefined,failedAt:undefined,blockingStage:undefined,diagnostics:undefined,firstReplyCaptured:undefined,reviewRequired:undefined,reviewRound:0});
  try {
   const readiness=await adapter.inspect();check(run);
   if(!readiness.ready){publish(readiness.stage||'unsupported',readiness.message||'当前网页尚未准备好，请先登录或处理提示。',{running:false,diagnostics:readiness.diagnostics});return;}
   if(adapter.ensureQualityMode){
    publish('checking','正在确认豆包专家模式，确认完成前不发送本次材料…',{running:true,diagnostics:readiness.diagnostics});
    const quality=await adapter.ensureQualityMode(run.controller.signal);check(run);checkPlatform(quality||{});
    if(quality?.ready!==true||quality.qualityMode!=='expert')throw Object.assign(new Error('尚未确认豆包专家模式，未准备或发送本次材料。'),{blockingStage:'quality-mode',diagnostics:quality?.diagnostics});
   }
   // A retry is allowed only after inspect confirms that the user cleared the
   // composer. Reset our local receipt ledger; do not remove files from the site.
   adapter.reset?.();
   publish('preparing','核对本次原文件及本地读取缺口…',{diagnostics:readiness.diagnostics});
   const request=await prepare();run.requestId=request.requestId;check(run);
   publish('uploading',`上传本次 ${request.files.length} 份文件…`,{requestId:request.requestId});
   let baseline=await adapter.snapshot(request.requestId);check(run);
   checkPlatform(baseline);
   if(baseline.generating)throw new Error('当前聊天正在生成回答，请等待结束后再开始本次分析。');
   for(const file of request.files){check(run);publish('uploading',`正在上传：${file.fileName}`);await adapter.upload(file,run.controller.signal);check(run);}
   // Never automatically submit into a page whose selected files or composer changed.
   publish('submitting','文件上传已确认，提交本次全文分析要求…');
   await adapter.submit(request.prompt,request.requestId,run.controller.signal);run.submitted=true;run.awaitingReply=true;check(run);
   let anchor;
   // A source-backed corrective round is allowed once. It uses the same request
   // and conversation, sends no new files, and cannot recursively review itself.
   for(let round=0;round<2;round++){
    publish('waiting',round?'等待平台完成对照原文复核，完成后自动取回。':'等待平台完成本次分析，完成后自动取回。',{reviewRound:round});
    const captured=await waitForReply(run,baseline,anchor);check(run);
    if(round===0&&typeof review==='function'){
     publish('checking','首轮回答已取回，正在对照原文复核漏项与误判…',{firstReplyCaptured:true});
     const decision=await review(request.requestId,captured.text);check(run);
     if(!decision||typeof decision.required!=='boolean'||decision.requestId!==undefined&&decision.requestId!==request.requestId)throw new Error('本次复核任务标识或返回格式无效，未继续发送；首轮回答保留供复核。');
     if(decision.stopped)throw new Error('对照原文复核未完成：'+(typeof decision.reason==='string'?decision.reason.slice(0,500):'复核条件未满足，首轮回答保留供复核。'));
     const latest=await adapter.snapshot(request.requestId);check(run);sameFirstReply(baseline,latest,captured,request.requestId);
     if(decision.required){
      if(typeof decision.prompt!=='string'||!decision.prompt.trim()||!decision.prompt.includes(request.requestId)||decision.prompt.length>150000)throw new Error('本次对照原文复核要求无效或过长，未继续发送；首轮回答保留供复核。');
      publish('checking','正在确认原会话与空白输入框，准备一次对照原文复核…',{reviewRequired:true});
      const inspection=await adapter.inspect();check(run);checkPlatform(inspection||{});
      if(inspection?.ready!==true)throw Object.assign(new Error(inspection?.message||'平台输入框或附件已变化，未发送复核要求。'),{blockingStage:inspection?.stage||'review',diagnostics:inspection?.diagnostics});
      const confirmed=await adapter.snapshot(request.requestId);check(run);sameFirstReply(baseline,confirmed,captured,request.requestId);
      publish('submitting','提交一次对照原文复核要求，不重复上传原件…',{reviewRound:1});
      await adapter.submit(decision.prompt,request.requestId,run.controller.signal,{reviewOnly:true,previousAssistantId:captured.id,previousAnswer:captured.text});run.awaitingReply=true;check(run);
      baseline=confirmed;anchor=captured;continue;
     }
    }
    publish('saving','已取回回答，核对原文并整理14类与四项输出…');
    const result=await complete(request.requestId,captured.text);check(run);
    publish('captured',result?.webChat?.status==='partial'?'回答已保存，存在缺口；请回报告查看待复核事项。':'回答已保存并整理；内容与企业条件仍待复核。',{running:false,reportSaved:true});return result;
   }
  }catch(error){
   if(run.requestId){
    if(run.controller.signal.aborted)await cancel(run.requestId).catch(()=>{});
    else{
     const known=['environment-risk','login','captcha','quota','upload-error','oversized','quality-mode','review','draft','attachments','unsupported','failed'];
     const cause={blockingStage:known.includes(error?.blockingStage)?error.blockingStage:'failed',message:(typeof error?.message==='string'&&error.message?error.message:'网页分析未完成，本地报告保留。').slice(0,500)};
     await cancel(run.requestId,cause).catch(()=>{});
    }
   }
   if(!run.controller.signal.aborted)publish('failed',error.message||'网页分析未完成，本地报告保留。',{running:false,error:error.message,failedAt:state.stage,blockingStage:error.blockingStage,diagnostics:error.diagnostics||state.diagnostics});
  }finally{if(active===run)active=null;}
 }
 async function stop(){
  const run=active;if(!run)return state;
  if(state.stage==='saving')return state;
  run.controller.abort();
  if(run.requestId)await cancel(run.requestId).catch(()=>{});
  if(run.sequence!==sequence)return state;
  if(run.submitted&&run.awaitingReply)await adapter.stop?.().catch(()=>{});
  if(run.sequence!==sequence)return state;
  return publish('cancelled','已停止自动分析；已发送的文件和消息需在平台内自行管理，本地报告保留。',{running:false});
 }
 return {start,cancel:stop,getState:()=>state,isRunning:()=>!!active};
}

function installDesktopWebChat({electron,service,getMainWindow}){
 const {BrowserWindow,WebContentsView,ipcMain}=electron;
 const windows=new Map(),trusted=new Set(),origin=service.url,channels=[];
 const validateEvent=event=>{
  const main=getMainWindow();const ids=new Set([...trusted,...(main&&!main.isDestroyed()?[main.webContents.id]:[])]);
  if(!isTrustedChatSender(event,origin,ids))throw new Error('只有标析本地界面可以操作网页分析。');
 };
 const current=event=>{validateEvent(event);const entry=windows.get(event.sender.id);if(!entry)throw new Error('请在标析网页分析窗口中操作。');return entry;};
 function handle(name,fn){const channel='biaoxi-web-chat:'+name;ipcMain.handle(channel,async(event,...args)=>{validateEvent(event);return fn(event,...args);});channels.push(channel);}
 function send(entry,state){entry.state={...state,...(entry.taskEnded?{taskEnded:true}:{}),provider:entry.provider,reportId:entry.reportId};if(!entry.window.isDestroyed())entry.window.webContents.send('biaoxi-web-chat:state',entry.state);const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('biaoxi-web-chat:state',entry.state);}
 const canInspect=entry=>!entry.closed&&!entry.window.isDestroyed()&&!entry.runner.isRunning()&&!entry.taskEnded;
 async function inspectEntry(entry){
  if(!canInspect(entry))return entry.state;
  const revision=++entry.readinessRevision;
  send(entry,{stage:'checking',message:'正在检查平台页面、登录状态与可用控件…',running:false});
  try{
   const result=await entry.adapter.inspect();
   // Navigation, a newer check, or a task state takes precedence over this
   // read-only DOM snapshot. Never revive a stopped or saved task with it.
   if(revision!==entry.readinessRevision||!canInspect(entry))return entry.state;
   send(entry,{stage:result.ready?'ready':result.stage||'unsupported',message:result.message,diagnostics:result.diagnostics,running:false});
  }catch(error){
   if(revision!==entry.readinessRevision||!canInspect(entry))return entry.state;
   send(entry,{stage:'failed',message:error.message||'平台网页检查失败，请按平台提示处理后重新检查。',error:true,running:false});
  }
  return entry.state;
 }
 async function open({provider,reportId}={}){
  if(!PROVIDERS[provider])throw new Error('请选择豆包或 DeepSeek。');
  if(reportId!==undefined&&(typeof reportId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(reportId)))throw new Error('无效的报告编号。');
  if(reportId)await service.store.getReport(reportId);
  for(const entry of windows.values())if(entry.provider===provider&&entry.reportId===(reportId||null)){entry.window.show();entry.window.focus();return {ok:true};}
  const local=new BrowserWindow({width:1350,height:1000,minWidth:950,minHeight:700,title:`标析 · ${PROVIDERS[provider].label} 网页分析试验`,autoHideMenuBar:true,backgroundColor:'#ffffff',webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  const view=new WebContentsView({webPreferences:{partition:'persist:biaoxi-webchat-'+provider,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  const remote=view.webContents;
  const entry={window:local,view,provider,reportId:reportId||null,readinessRevision:0,navigationRevision:0,taskRevision:0,closed:false,taskEnded:false,state:{stage:'loading',message:'正在打开平台网页，请在下方自行登录。',running:false}};
  const localId=local.webContents.id;windows.set(localId,entry);trusted.add(localId);
  local.contentView.addChildView(view);view.setBounds({x:0,y:250,width:1350,height:700});
  const checkNav=(event,url)=>{const target=event.url||url;if(!allowedProviderURL(provider,target)){event.preventDefault();entry.readinessRevision++;if(entry.taskEnded||entry.runner?.getState().stage==='saving')return;if(entry.runner?.isRunning())entry.runner.cancel();send(entry,{...entry.state,stage:'unsupported',message:'该链接超出所选平台范围，已阻止在分析窗口中跳转。'});}};
  remote.on('will-navigate',checkNav);remote.on('will-redirect',checkNav);
  remote.on('did-navigate',(_event,url)=>{if(!allowedProviderURL(provider,url))entry.runner.cancel();});
  remote.setWindowOpenHandler(({url})=>{if(allowedProviderURL(provider,url)&&!entry.runner.isRunning())remote.loadURL(url).catch(()=>{});return {action:'deny'};});
  remote.on('will-attach-webview',event=>event.preventDefault());
  remote.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));remote.session.setPermissionCheckHandler(()=>false);
  remote.session.on('will-download',(event)=>event.preventDefault());
  remote.session.webRequest.onBeforeRequest({urls:['file://*/*','http://*/*','https://localhost/*','https://127.0.0.1/*','https://[::1]/*']},(details,callback)=>callback({cancel:true}));
  local.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  local.webContents.on('will-navigate',(event,target)=>{try{if(new URL(event.url||target).origin!==origin)event.preventDefault();}catch{event.preventDefault();}});
  const {createBrowserAdapter}=require('./web-chat-dom.cjs');
  entry.adapter=createBrowserAdapter(remote,provider);
  entry.runner=createChatRunner({adapter:entry.adapter,prepare:()=>{
   if(!entry.reportId)throw new Error('请先在主界面选择已生成的招标文件报告。');
   return service.desktopWebChat.prepare(entry.reportId,provider);
  },review:typeof service.desktopWebChat.review==='function'?(id,text)=>service.desktopWebChat.review(id,text):undefined,complete:(id,text)=>service.desktopWebChat.complete(id,text),cancel:(id,cause)=>cause===undefined?service.desktopWebChat.cancel(id):service.desktopWebChat.cancel(id,cause),onState:s=>{entry.readinessRevision++;if(entry.closed)return;if(['completed','captured','partial','cancelled'].includes(s.stage))entry.taskEnded=true;send(entry,s);}});
  remote.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{
   if(!mainFrame)return;
   entry.navigationRevision++;entry.readinessRevision++;
   if(!inPlace&&canInspect(entry))send(entry,{stage:'loading',message:'正在打开平台网页，载入后会自动检查可用状态。',running:false});
  });
  remote.on('did-navigate-in-page',(_event,_url,mainFrame)=>{if(mainFrame){entry.navigationRevision++;entry.readinessRevision++;void inspectEntry(entry);}});
  remote.on('did-finish-load',()=>{void inspectEntry(entry);});
  remote.on('did-fail-load',async(_event,code,_description,_url,mainFrame)=>{
   if(!mainFrame||code===-3)return;
   entry.readinessRevision++;const navigation=entry.navigationRevision,task=entry.taskRevision;
   if(entry.closed||entry.taskEnded||entry.runner.getState().stage==='saving')return;
   if(entry.runner.isRunning())await entry.runner.cancel();
   if(entry.closed||navigation!==entry.navigationRevision||task!==entry.taskRevision)return;
   send(entry,{stage:'failed',message:'平台网页加载失败，请检查网络后重新加载；已停止的任务请从报告重新打开。',running:false});
  });
  local.on('closed',()=>{entry.closed=true;entry.readinessRevision++;entry.navigationRevision++;entry.runner.cancel();windows.delete(localId);trusted.delete(localId);if(!remote.isDestroyed())remote.close();});
  await local.loadURL(origin+'/web-chat.html');remote.loadURL(PROVIDERS[provider].url).catch(()=>{});return {ok:true};
 }
 handle('open',(_event,options)=>open(options));
 handle('context',async event=>{
  const entry=current(event);let report,docs=[];
  if(entry.reportId){const {webChatDocumentSelections,selectedWebChatDocuments}=await import('../server/web-chat.js');report=await service.store.getReport(entry.reportId);const selections=webChatDocumentSelections(report);docs=selectedWebChatDocuments(report,await Promise.all(selections.map(({id})=>service.store.getDocument(id))));}
  const incompleteDocuments=docs.filter(doc=>doc.extraction?.complete!==true||!doc.extraction?.blocks?.some(block=>typeof block.text==='string'&&block.text.trim())).map(doc=>({documentId:doc.id,fileName:doc.fileName}));
  return {provider:entry.provider,providerLabel:PROVIDERS[entry.provider].label,providerURL:PROVIDERS[entry.provider].url,reportId:entry.reportId,reportName:report?.fileName||'',files:docs.map(({fileName,role,fromCompanySnapshot})=>({fileName,role,...(fromCompanySnapshot?{fromCompanySnapshot:true}:{})})),localCoverage:{complete:incompleteDocuments.length===0,incompleteDocuments},state:entry.state,validation:'experimental'};
 });
 handle('start',event=>{const entry=current(event);if(entry.taskEnded)throw new Error('本次任务已结束，请关闭此窗口后从报告重新打开。');if(entry.runner.isRunning())throw new Error('网页分析正在运行。');entry.taskRevision++;entry.runner.start().catch(error=>send(entry,{stage:'failed',message:error.message,running:false}));return {ok:true};});
 handle('cancel',event=>current(event).runner.cancel());
 handle('inspect',event=>inspectEntry(current(event)));
 handle('reload',event=>{const entry=current(event);if(entry.runner.isRunning())throw new Error('请先取消当前任务再重新加载。');entry.readinessRevision++;entry.navigationRevision++;if(canInspect(entry))send(entry,{stage:'loading',message:'正在重新加载平台网页，载入后会自动检查可用状态。',running:false});entry.view.webContents.loadURL(PROVIDERS[entry.provider].url).catch(()=>{});return {ok:true};});
 handle('bounds',(event,bounds)=>{
  const entry=current(event),[width,height]=entry.window.getContentSize();
  if(!bounds||!['x','y','width','height'].every(key=>Number.isFinite(bounds[key])))throw new Error('无效的窗口布局。');
  const x=Math.max(0,Math.min(width-1,Math.round(bounds.x))),y=Math.max(140,Math.min(height-1,Math.round(bounds.y)));
  entry.view.setBounds({x,y,width:Math.max(1,Math.min(width-x,Math.round(bounds.width))),height:Math.max(1,Math.min(height-y,Math.round(bounds.height)))});return {ok:true};
 });
 return {open,async close(){for(const entry of [...windows.values()]){await entry.runner.cancel();if(!entry.window.isDestroyed())entry.window.close();}for(const channel of channels)ipcMain.removeHandler(channel);}};
}

module.exports={PROVIDERS,allowedProviderURL,isTrustedChatSender,selectCurrentReply,createChatRunner,installDesktopWebChat};
