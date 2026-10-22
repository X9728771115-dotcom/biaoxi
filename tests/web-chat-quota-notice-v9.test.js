import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {modeFixture} from './helpers/web-chat-mode-fixture-v9.js';
const require=createRequire(import.meta.url);
const {createChatRunner,installDesktopWebChat}=require('../src/desktop/web-chat.cjs');
const dom=require('../src/desktop/web-chat-dom.cjs');
const requestId='quota-v9';
const notice='近7天办公能力的免费额度用完了，我得休息一阵子了，预计10月24日10:37恢复为你服务，到时我再接着帮你。开通豆包订阅，免等待，继续为你服务。你也可以点击左下角切换到对话，继续使用快速模型。';
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const user=text=>`<article data-role="user"><div data-testid="message_text_content">${escape(text)}</div></article>`;
const assistant=(text,extra='')=>`<article data-message-role="assistant" data-testid="receive_message"><div data-testid="message_text_content"><div class="flow-markdown-body">${escape(text)}</div>${extra}</div><button aria-label="复制">复制</button></article>`;
const normal=assistant(JSON.stringify({requestId,summary:'本次采购要求待复核'}));
const quota={stage:'quota',message:'豆包办公能力免费额度已用完，当前分析已停止；请在平台额度恢复后重试。',diagnostics:{quotaNotice:true}};

test('the actual short latest assistant office-quota notice stops this marked task',async()=>{
 const h=modeFixture({mode:'豆包 专家',messages:user(requestId)+assistant(notice)});const snapshot=await h.adapter.snapshot(requestId);
 assert.equal(snapshot.stage,'quota');assert.equal(snapshot.message,quota.message);assert.equal(snapshot.diagnostics.quotaNotice,true);assert.deepEqual(h.clicks,[]);
});

test('the actual second-round quota notice is recognized after the task review prompt',async()=>{
 const h=modeFixture({messages:user(requestId)+normal+user('对照原文复核 '+requestId)+assistant(notice)});assert.equal((await h.adapter.snapshot(requestId)).stage,'quota');
});

for(const [name,messages] of [
 ['old quota before the task marker',assistant(notice)+user(requestId)+normal],
 ['old quota followed by a newer normal assistant',user(requestId)+assistant(notice)+normal],
 ['quota text in a user message',user(requestId+' '+notice)+normal],
 ['another task latest user',user(requestId)+normal+user('other-request')+assistant(notice)],
 ['no current task marker',user('another-request')+assistant(notice)],
 ['source quotation with a prose prefix',user(requestId)+assistant('以下是招标文件引用：'+notice)],
 ['quoted whole notification',user(requestId)+assistant('“'+notice+'”')],
 ['notification in NDJSON',user(requestId)+assistant(JSON.stringify({requestId,summary:notice}))],
 ['only a generic quota mention',user(requestId)+assistant('本项目可能存在免费额度不足的问题，待复核。')],
 ['missing restoration and subscription context',user(requestId)+assistant('近7天办公能力的免费额度用完了。')],
 ['generic fallback without explicit assistant role',user(requestId)+`<div class="flow-markdown-body">${notice}</div>`],
 ['a later foreign user after the notice',user(requestId)+assistant(notice)+user('另外的问题')],
])test(`${name} is not promoted to a platform quota restriction`,async()=>{
 const snapshot=await modeFixture({messages}).adapter.snapshot(requestId);assert.notEqual(snapshot.stage,'quota');
});

test('an exact notice rendered inside a blockquote remains quoted content',async()=>{
 const quoted=`<article data-message-role="assistant"><div class="flow-markdown-body"><blockquote>${notice}</blockquote></div><button aria-label="复制">复制</button></article>`;
 assert.notEqual((await modeFixture({messages:user(requestId)+quoted}).adapter.snapshot(requestId)).stage,'quota');
});

test('an exact notice rendered inside code remains source content',async()=>{
 const quoted=`<article data-message-role="assistant"><div class="flow-markdown-body"><pre><code>${notice}</code></pre></div><button aria-label="复制">复制</button></article>`;
 assert.notEqual((await modeFixture({messages:user(requestId)+quoted}).adapter.snapshot(requestId)).stage,'quota');
});

test('a hidden latest-looking notice cannot replace the visible task answer',async()=>{
 const h=modeFixture({messages:user(requestId)+normal+assistant(notice)});h.$('[data-testid="receive_message"]').last().attr('hidden','');assert.notEqual((await h.adapter.snapshot(requestId)).stage,'quota');
});

for(const attribute of ['aria-hidden','inert'])test(`a ${attribute} chat copy cannot become a visible platform quota warning`,async()=>{
 const h=modeFixture({messages:user(requestId)+normal+assistant(notice)});h.$('[data-testid="receive_message"]').last().attr(attribute,attribute==='aria-hidden'?'true':'');assert.notEqual((await h.adapter.snapshot(requestId)).stage,'quota');
});

for(const attribute of ['aria-hidden','inert'])test(`a visible assistant with a ${attribute} notification content root is not a quota warning`,async()=>{
 const h=modeFixture({messages:user(requestId)+assistant(notice)});h.$('[data-testid="receive_message"] [data-testid="message_text_content"]').attr(attribute,attribute==='aria-hidden'?'true':'');assert.notEqual((await h.adapter.snapshot(requestId)).stage,'quota');
});

test('a visible content root cannot promote its hidden inner text to a quota notice',async()=>{
 const h=modeFixture({messages:user(requestId)+assistant(notice)});h.$('.flow-markdown-body').attr('aria-hidden','true');assert.notEqual((await h.adapter.snapshot(requestId)).stage,'quota');
});

function runnerHarness({userCancel=false}={}){
 let snapshots=0;const calls=[],states=[],firstText=JSON.stringify({requestId,pass:1}),first={assistantIds:['first'],answers:[firstText],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true};
 const runner=createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>snapshots++===0?{assistantIds:[]}:userCancel?{...first,generating:true,completionVisible:false}:quota,upload:async()=>{},submit:async()=>{},stop:async()=>{}},prepare:async()=>({requestId,prompt:requestId,files:[]}),complete:async()=>assert.fail('quota must not complete'),cancel:async(...args)=>calls.push(args),onState:s=>states.push(s),pollMs:1,stableMs:1,timeoutMs:100});
 return {runner,calls,states};
}

test('a failed platform wait passes its bounded quota cause to cancellation',async()=>{
 const h=runnerHarness();await h.runner.start();assert.deepEqual(h.calls,[[requestId,{blockingStage:'quota',message:quota.message}]]);assert.equal(h.states.at(-1).stage,'failed');assert.equal(h.states.at(-1).blockingStage,'quota');
});

test('ordinary user cancellation and its late catch do not invent a platform cause',async()=>{
 const h=runnerHarness({userCancel:true});const pending=h.runner.start();while(!h.states.some(s=>s.stage==='waiting'))await new Promise(r=>setImmediate(r));await h.runner.cancel();await pending;assert.ok(h.calls.length);for(const args of h.calls)assert.deepEqual(args,[requestId]);
});

test('a generic failure uses only the safe failed-stage and a bounded message',async()=>{
 const causes=[];const runner=createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>({assistantIds:[]}),submit:async()=>{throw new Error('x'.repeat(600));}},prepare:async()=>({requestId,prompt:requestId,files:[]}),complete:async()=>{},cancel:async(...args)=>causes.push(args)});await runner.start();assert.equal(causes[0][1]?.blockingStage,'failed');assert.equal(causes[0][1]?.message.length,500);assert.deepEqual(Object.keys(causes[0][1]).sort(),['blockingStage','message']);
});

test('desktop installation forwards the cancellation cause without adding any IPC cause input',async()=>{
 const originalFactory=dom.createBrowserAdapter,handlers=new Map(),locals=[],calls=[];let id=0;
 class Contents extends EventEmitter{constructor(){super();this.id=++id;this.url='';this.session={setPermissionRequestHandler(){},setPermissionCheckHandler(){},on(){},webRequest:{onBeforeRequest(){}}};}getURL(){return this.url;}isDestroyed(){return false;}setWindowOpenHandler(){}async loadURL(url){this.url=url;}send(){}close(){}}
 class Window extends EventEmitter{constructor(){super();this.webContents=new Contents();this.contentView={addChildView(){}};this.dead=false;locals.push(this);}async loadURL(url){await this.webContents.loadURL(url);}isDestroyed(){return this.dead;}show(){}focus(){}close(){this.dead=true;this.emit('closed');}}
 class View{constructor(){this.webContents=new Contents();}setBounds(){}}
 dom.createBrowserAdapter=()=>({inspect:async()=>({ready:true}),reset(){},snapshot:async()=>quota,upload:async()=>{},submit:async()=>{},stop:async()=>{}});
 const service={url:'http://127.0.0.1:4000',store:{getReport:async()=>({})},desktopWebChat:{prepare:async()=>({requestId,files:[],prompt:requestId}),complete:async()=>{},cancel:async(...args)=>calls.push(args)}};
 const desktop=installDesktopWebChat({electron:{BrowserWindow:Window,WebContentsView:View,ipcMain:{handle:(name,handler)=>handlers.set(name,handler),removeHandler:name=>handlers.delete(name)}},service,getMainWindow:()=>null});
 try{
  await desktop.open({provider:'doubao',reportId:'quota-report'});const sender=locals[0].webContents;await handlers.get('biaoxi-web-chat:start')({sender,senderFrame:{url:sender.getURL(),parent:null}});
  const deadline=Date.now()+1000;while(!calls.length&&Date.now()<deadline)await new Promise(r=>setImmediate(r));assert.deepEqual(calls[0],[requestId,{blockingStage:'quota',message:quota.message}]);
 }finally{await desktop.close();dom.createBrowserAdapter=originalFactory;}
});
