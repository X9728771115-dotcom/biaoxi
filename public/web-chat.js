const PLATFORMS={doubao:{label:'豆包',url:'https://www.doubao.com/chat/'},deepseek:{label:'DeepSeek',url:'https://chat.deepseek.com/'}};
const DESKTOP_MESSAGE='网页 AI 试验需使用标析桌面版，请在桌面版中打开；浏览器开发版无法显示内置平台窗口。';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ENVIRONMENT_RISK_MESSAGE='平台提示当前使用环境受限，已停止网页分析；请按平台提示使用官方产品。';
const environmentRestricted=state=>state.stage==='environment-risk'||state.blockingStage==='environment-risk'||state.diagnostics?.environmentRisk===true;
const STAGES={'environment-risk':'平台使用环境受限',idle:'等待操作',loading:'正在打开',ready:'准备就绪',checking:'正在检查',preparing:'准备本次任务',login:'请先登录','login-required':'请先登录',awaiting_login:'请先登录',captcha:'请处理验证码',quota:'平台额度受限',unsupported:'当前页面无法操作',draft:'输入框有已有内容',attachments:'已有附件待处理',uploading:'正在上传','upload-error':'上传未完成',oversized:'文件超出限制',sending:'正在提交',submitting:'正在提交',waiting:'等待回答',capturing:'正在取回',saving:'正在校验保存',completed:'回答已保存',captured:'已取回，待复核',partial:'取回有缺口',cancelled:'已取消',failed:'未完成'};
export function webChatDiagnosticText(state={}) {
 const parts=[],diagnostics=state.diagnostics||{};
 if(STAGES[state.failedAt])parts.push(`停止阶段：${STAGES[state.failedAt]}`);
 if(STAGES[state.blockingStage])parts.push(`平台状态：${STAGES[state.blockingStage]}`);
 const counts=[['editorCount','输入框'],['uploadCount','上传入口'],['sendCount','可用发送按钮'],['attachmentCount','附件卡片'],['assistantCount','回答块']].flatMap(([key,label])=>Number.isInteger(diagnostics[key])&&diagnostics[key]>=0&&diagnostics[key]<10000?[`${label} ${diagnostics[key]}`]:[]);
 if(counts.length)parts.push('控件检查：'+counts.join('，'));
 if(typeof diagnostics.markerSeen==='boolean')parts.push(diagnostics.markerSeen?'已识别本次消息':'尚未识别本次消息');
 if(typeof diagnostics.completionVisible==='boolean')parts.push(diagnostics.completionVisible?'已识别回答结束控件':'尚未识别回答结束控件');
 if(diagnostics.authentication==='unconfirmed')parts.push('控件可用不等于登录或上传成功');
 return parts.join('；');
}
export async function openWebChat(bridge,{provider,reportId}={}) {
 if(!PLATFORMS[provider])throw new Error('请选择豆包或 DeepSeek 平台。');
 if(typeof bridge?.open!=='function')throw new Error(DESKTOP_MESSAGE);
 const options={provider};if(reportId)options.reportId=String(reportId);
 const result=await bridge.open(options);
 if(result?.ok!==true)throw new Error(result?.error?.message||result?.error||'内置窗口未能打开，请重试。');
 return result;
}
export function webChatControls(context={},state={}) {
 const running=state.running===true,ended=state.taskEnded===true||['completed','captured','partial','cancelled'].includes(state.stage);
 const checking=['loading','checking'].includes(state.stage);
 return {startDisabled:!context.reportId||running||ended||state.stage!=='ready'||environmentRestricted(state),cancelDisabled:!running||state.stage==='saving',reloadDisabled:running,inspectDisabled:running||checking,finished:ended};
}
export async function performWebChatAction(bridge,action,context={},state={}) {
 if(typeof bridge?.[action]!=='function'||!['start','cancel','inspect','reload'].includes(action))throw new Error(DESKTOP_MESSAGE);
 if(action==='cancel'&&state.stage==='saving')throw new Error('回答正在校验保存，已接收保存不能取消，请等待完成。');
 if(action==='start'&&environmentRestricted(state))throw new Error(ENVIRONMENT_RISK_MESSAGE);
 if(action==='start'&&!context.reportId)throw new Error('请先在主界面选择报告，再打开本次网页分析。');
 if(state.running&&['start','reload','inspect'].includes(action))throw new Error('正在处理本次任务，请等待完成或取消。');
 if(action==='start'&&webChatControls(context,state).finished)throw new Error('本次任务已结束；请关闭此窗口后，从报告重新打开。');
 if(action==='start'&&state.stage!=='ready')throw new Error('平台尚未准备好；请先检查登录和页面状态。');
 return bridge[action]();
}
export function webChatViewportBounds(rect={}) {
 const values=[rect.left,rect.top,rect.width,rect.height];
 if(!values.every(Number.isFinite))return null;
 return {x:Math.max(0,Math.round(rect.left)),y:Math.max(0,Math.round(rect.top)),width:Math.max(0,Math.round(rect.width)),height:Math.max(0,Math.round(rect.height))};
}
export function mountWebChatWindow(doc=document,bridge=window.biaoxiWebChat) {
 const $=id=>doc.getElementById(id),viewport=$('chat-viewport');
 let context={},state={running:false,stage:'loading',message:'正在读取本次窗口信息…'},version=0;
 const pending=new Set();
 function acceptState(next){const ended=webChatControls(context,state).finished||webChatControls(context,next).finished;state={...next,taskEnded:ended};}
 function render() {
  const platform=PLATFORMS[context.provider]||PLATFORMS[state.provider];
  $('chat-provider').textContent=platform?.label||'网页 AI';$('chat-url').textContent=platform?.url||'尚未选择平台';
  $('chat-report').textContent=context.reportName||(context.reportId?'本次报告':'仅登录平台，尚未选择报告');
  $('chat-files').innerHTML=(context.files||[]).map(file=>`<li><span class="file-role">${escape(file.fromCompanySnapshot?'本次企业快照原件':({tender:'主招标文件',main:'主招标文件',attachment:'关联附件',evidence:'本次证照补充'})[file.role]||'本次材料')}</span>${escape(file.fileName)}</li>`).join('')||(environmentRestricted(state)?'<li class="muted">未选择材料；平台当前使用环境受限。</li>':'<li class="muted">未选择材料；可先在下方平台页面登录。</li>');
  $('chat-stage').textContent=STAGES[state.stage]||'网页 AI 试验';
  $('chat-status').textContent=environmentRestricted(state)?ENVIRONMENT_RISK_MESSAGE:state.message||'请在下方真实平台页面完成登录，然后检查登录状态。';
  $('chat-status').classList.toggle('error',!!state.error||state.stage==='failed'||environmentRestricted(state));
  const diagnostic=$('chat-diagnostics');if(diagnostic){diagnostic.textContent=webChatDiagnosticText(state);diagnostic.hidden=!diagnostic.textContent;}
  const sourceWarning=$('chat-source-warning');if(sourceWarning){sourceWarning.hidden=context.localCoverage?.complete!==false;sourceWarning.textContent=context.localCoverage?.complete===false?'本次材料存在本地读取缺口。可把所选原件与已提取全文交由网页分析；取回后无法核对的引文及全文覆盖仍待复核。':'';}
  $('chat-return').hidden=!state.reportSaved;
  const controls=webChatControls(context,state);
  $('chat-note').textContent=environmentRestricted(state)?'这是平台对当前使用环境的限制，标析已停止自动操作。可关闭此窗口，返回报告选择豆包。':state.stage==='saving'?'回答正在校验保存，已接收保存不能取消，请等待完成。':controls.finished?'本次任务已结束。关闭此窗口后，从报告重新打开，才能发起新的网页分析。':!context.reportId?'试验能力。可先登录平台；回主界面选择报告后，才能开始网页分析。':(context.provider==='doubao'?'豆包会先确认专家模式，再发送本次材料；有缺口时自动对照原文复核一次。无法确认模式时停止。':'')+'点击开始后，将本次列出的原件、已提取全文及解析要求发送到所选平台。回答仍须对照原文和企业证据复核。';
  for(const action of ['start','cancel','inspect','reload'])$('chat-'+action).disabled=typeof bridge?.[action]!=='function'||controls[action+'Disabled']||pending.has(action);
 }
 async function refreshContext() {
  const sequence=version;
  try{context=await bridge.context();if(sequence===version)acceptState(context.state||state);render();reportBounds();}
  catch(error){state={running:false,stage:'failed',error:true,message:error.message||'无法读取本次窗口信息。'};render();}
 }
 async function action(name) {
  if(pending.has(name)||webChatControls(context,state)[name+'Disabled'])return;
  const prior=state,sequence=version;pending.add(name);
  if(name==='start')state={...state,running:true,stage:'preparing',message:'正在准备本次材料，请勿重复开始…'};
  else if(name==='inspect'&&!webChatControls(context,prior).finished)state={...state,stage:'checking',message:'正在检查平台登录与页面状态…'};
  else if(name==='reload'&&!webChatControls(context,prior).finished)state={...state,stage:'loading',message:'正在重新打开平台，完成后自动检查…'};
  render();
  try{
   const result=await performWebChatAction(bridge,name,context,prior);
   if(sequence===version){const next=result?.state||result;if(next?.stage)acceptState(next);else if(name==='cancel')acceptState({...state,running:false,stage:'cancelled',message:'已取消本次任务。'});}
  }catch(error){if(sequence===version)state={...state,running:false,stage:'failed',error:true,message:error.message||'操作未完成，请检查平台页面。'};}
  finally{pending.delete(name);render();}
 }
 function reportBounds() {
  if(typeof bridge?.bounds!=='function')return;
  const bounds=webChatViewportBounds(viewport.getBoundingClientRect());
  if(bounds)Promise.resolve(bridge.bounds(bounds)).catch(()=>{});
 }
 for(const name of ['start','inspect','reload','cancel'])$('chat-'+name).addEventListener('click',()=>action(name));
 let unsubscribe;
 if(typeof bridge?.onState==='function'){
  const subscribed=bridge.onState(next=>{
   if(!next||typeof next!=='object')return;
   if(context.reportId&&next.reportId&&next.reportId!==context.reportId)return;
   if(context.provider&&next.provider&&next.provider!==context.provider)return;
   version++;acceptState(next);render();reportBounds();
  });
  Promise.resolve(subscribed).then(stop=>{if(typeof stop==='function')unsubscribe=stop;}).catch(()=>{});
 }
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(reportBounds):null;
 observer?.observe(viewport);window.addEventListener('resize',reportBounds);
 window.addEventListener('beforeunload',()=>{observer?.disconnect();unsubscribe?.();window.removeEventListener('resize',reportBounds);},{once:true});
 render();
 if(typeof bridge?.context==='function')refreshContext();
 else{state={running:false,stage:'failed',error:true,message:DESKTOP_MESSAGE};render();}
 return {refreshContext};
}
if(typeof document!=='undefined'&&document.getElementById('chat-viewport'))mountWebChatWindow();
