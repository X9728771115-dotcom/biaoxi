import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {installDesktopWebChat}=require('../src/desktop/web-chat.cjs');
const dom=require('../src/desktop/web-chat-dom.cjs');
const ready={ready:true,stage:'ready',message:'唯一输入及上传入口可用',diagnostics:{environmentRisk:false,editorCount:1,uploadCount:1}};
const risk={ready:false,stage:'environment-risk',message:'平台使用环境受限',diagnostics:{environmentRisk:true,authentication:'blocked'}};
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function harness(run){
 const originalFactory=dom.createBrowserAdapter,locals=[],remotes=[],handlers=new Map(),calls=[];
 let nextId=1,inspection=async()=>ready,preparation=async()=>({requestId:'req-1',files:[],prompt:'req-1'}),completion=async()=>({webChat:{status:'captured'}}),cancellation=async()=>{},snapshots=0;
 class Contents extends EventEmitter{
  constructor(){super();this.id=nextId++;this.url='';this.messages=[];this.destroyed=false;this.session={setPermissionRequestHandler(){},setPermissionCheckHandler(){},on(){},webRequest:{onBeforeRequest(){}}};}
  getURL(){return this.url;}isDestroyed(){return this.destroyed;}setWindowOpenHandler(){}
  async loadURL(url){this.url=url;}send(_channel,state){this.messages.push(structuredClone(state));}close(){this.destroyed=true;}
 }
 class Window extends EventEmitter{
  constructor(){super();this.webContents=new Contents();this.contentView={addChildView(){}};this.destroyed=false;locals.push(this);}
  async loadURL(url){await this.webContents.loadURL(url);}isDestroyed(){return this.destroyed;}show(){}focus(){}getContentSize(){return [1350,1000];}
  close(){this.destroyed=true;this.emit('closed');}
 }
 class View{constructor(){this.webContents=new Contents();remotes.push(this.webContents);}setBounds(){}}
 const adapter={
  inspect:()=>{calls.push('inspect');return inspection();},reset(){},
  snapshot:async()=>snapshots++?{assistantIds:['new'],answers:['{"requestId":"req-1"}'],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true}:{assistantIds:[]},
  upload:async()=>calls.push('upload'),submit:async()=>calls.push('submit'),stop:async()=>calls.push('stop')
 };
 dom.createBrowserAdapter=()=>adapter;
 const service={url:'http://127.0.0.1:4000',store:{getReport:async()=>({fileName:'匿名招标文件.pdf'})},desktopWebChat:{prepare:()=>{calls.push('prepare');return preparation();},complete:()=>{calls.push('save');return completion();},cancel:async id=>{calls.push('cancel:'+id);return cancellation(id);}}};
 const desktop=installDesktopWebChat({electron:{BrowserWindow:Window,WebContentsView:View,ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)}},service,getMainWindow:()=>null});
 try{
  await desktop.open({provider:'deepseek',reportId:'report-1'});
  const local=locals[0],remote=remotes[0],event={sender:local.webContents,senderFrame:{url:local.webContents.getURL(),parent:null}};
  await run({local,remote,calls,last:()=>local.webContents.messages.at(-1),inspectWith:fn=>inspection=fn,prepareWith:fn=>preparation=fn,completeWith:fn=>completion=fn,cancelWith:fn=>cancellation=fn,invoke:(name,...args)=>handlers.get('biaoxi-web-chat:'+name)(event,...args)});
 }finally{await desktop.close();dom.createBrowserAdapter=originalFactory;}
}

test('provider load automatically checks the visible page and retains environment restriction without transmitting files',async()=>harness(async h=>{
 const pending=gate();h.inspectWith(()=>pending.promise);
 h.remote.emit('did-finish-load');
 assert.equal(h.last()?.stage,'checking');assert.deepEqual(h.calls,['inspect']);
 pending.resolve(risk);await tick();
 assert.equal(h.last().stage,'environment-risk');assert.equal(h.last().diagnostics.environmentRisk,true);assert.equal(h.last().running,false);
 assert.equal(h.calls.some(call=>['prepare','upload','submit','save'].includes(call)),false);
}));

test('automatic inspection failure is visible instead of announcing that the platform is ready',async()=>harness(async h=>{
 h.inspectWith(async()=>{throw new Error('当前网页已关闭或离开所选平台');});h.remote.emit('did-finish-load');await tick();
 assert.equal(h.last().stage,'failed');assert.match(h.last().message,/网页|平台/);assert.equal(h.last().running,false);
}));

test('a main-frame navigation invalidates an earlier inspection, including its late ready result',async()=>harness(async h=>{
 const pending=gate();h.inspectWith(()=>pending.promise);const old=h.invoke('inspect');await tick();
 h.remote.emit('did-start-navigation',{},'https://chat.deepseek.com/sign_in',false,true);
 assert.equal(h.last().stage,'loading');pending.resolve(ready);await old;
 assert.equal(h.last().stage,'loading');
 h.inspectWith(async()=>risk);h.remote.emit('did-finish-load');await tick();assert.equal(h.last().stage,'environment-risk');
}));

test('a closed analysis window discards a pending inspection result',async()=>harness(async h=>{
 const pending=gate();h.inspectWith(()=>pending.promise);const inspection=h.invoke('inspect');await tick();const count=h.local.webContents.messages.length;
 h.local.close();pending.resolve(ready);await inspection;
 assert.equal(h.local.webContents.messages.length,count);
}));

test('an older manual inspection cannot turn an active run into ready or enable a second task',async()=>harness(async h=>{
 const inspectGate=gate(),prepareGate=gate();let inspected=0;
 h.inspectWith(()=>++inspected===1?inspectGate.promise:Promise.resolve(ready));h.prepareWith(()=>prepareGate.promise);
 const inspection=h.invoke('inspect');await tick();await h.invoke('start');await tick();
 assert.equal(h.last().stage,'preparing');assert.equal(h.last().running,true);
 inspectGate.resolve(ready);await inspection;
 assert.equal(h.last().stage,'preparing');assert.equal(h.last().running,true);
 await assert.rejects(h.invoke('start'),/正在运行/);
 await h.invoke('cancel');prepareGate.resolve({requestId:'req-1',files:[],prompt:'req-1'});await tick();
}));

test('a late load or check after cancellation cannot erase the ended task state',async()=>harness(async h=>{
 const prepareGate=gate();h.prepareWith(()=>prepareGate.promise);await h.invoke('start');await tick();await h.invoke('cancel');
 prepareGate.resolve({requestId:'req-1',files:[],prompt:'req-1'});await tick();const inspections=h.calls.filter(call=>call==='inspect').length;
 assert.equal(h.last().stage,'cancelled');h.remote.emit('did-finish-load');await tick();await h.invoke('inspect');
 assert.equal(h.last().stage,'cancelled');assert.equal(h.calls.filter(call=>call==='inspect').length,inspections);
 await assert.rejects(h.invoke('start'),/结束|重新打开/);assert.equal(h.calls.filter(call=>call==='prepare').length,1);
}));

test('saving and a saved capture survive load events and blocked navigation without cancelling accepted content',async()=>harness(async h=>{
 const saved=gate();h.prepareWith(async()=>({requestId:'req-1',files:[],prompt:'req-1'}));
 // Hold the real service completion promise while the runner is in saving.
 // The harness exposes that service through the adapter-independent hook.
 h.completeWith(()=>saved.promise);await h.invoke('start');
 const deadline=Date.now()+10000;while(!h.calls.includes('save')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));await tick();
 assert.equal(h.last().stage,'saving');let prevented=false;
 h.remote.emit('will-navigate',{preventDefault(){prevented=true;}},'https://example.invalid/');assert.equal(prevented,true);assert.equal(h.last().stage,'saving');
 h.remote.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://chat.deepseek.com/',true);h.remote.emit('did-finish-load');await tick();
 assert.equal(h.last().stage,'saving');assert.equal(h.calls.some(call=>call.startsWith('cancel:')),false);
 saved.resolve({webChat:{status:'captured'}});await tick();
 assert.equal(h.last().stage,'captured');assert.equal(h.last().reportSaved,true);const inspections=h.calls.filter(call=>call==='inspect').length;
 h.remote.emit('will-navigate',{preventDefault(){}},'https://example.invalid/');assert.equal(h.last().stage,'captured');assert.equal(h.last().reportSaved,true);
 h.remote.emit('did-finish-load');await tick();await h.invoke('inspect');
 assert.equal(h.last().stage,'captured');assert.equal(h.last().reportSaved,true);assert.equal(h.calls.filter(call=>call==='inspect').length,inspections);
 await assert.rejects(h.invoke('start'),/结束|重新打开/);assert.equal(h.calls.filter(call=>call==='prepare').length,1);
}));

test('a main-frame load failure stops an active pre-submit task and retains the failure message',async()=>harness(async h=>{
 const prepareGate=gate();h.prepareWith(()=>prepareGate.promise);await h.invoke('start');await tick();
 h.remote.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://chat.deepseek.com/',true);await tick();
 assert.equal(h.last().stage,'failed');assert.equal(h.last().running,false);assert.match(h.last().message,/加载失败/);
 prepareGate.resolve({requestId:'req-1',files:[],prompt:'req-1'});await tick();
 assert.equal(h.calls.includes('submit'),false);assert.equal(h.calls.includes('save'),false);assert.equal(h.last().stage,'failed');
}));

test('a fresh manual inspection can recover only after the platform restriction is no longer present',async()=>harness(async h=>{
 h.inspectWith(async()=>risk);h.remote.emit('did-finish-load');await tick();assert.equal(h.last().stage,'environment-risk');
 h.inspectWith(async()=>ready);await h.invoke('inspect');assert.equal(h.last().stage,'ready');assert.equal(h.last().diagnostics.environmentRisk,false);
}));

test('only the newest manual check can publish its page snapshot',async()=>harness(async h=>{
 const older=gate();h.inspectWith(()=>older.promise);const first=h.invoke('inspect');await tick();
 h.inspectWith(async()=>ready);await h.invoke('inspect');assert.equal(h.last().stage,'ready');
 older.resolve(risk);await first;assert.equal(h.last().stage,'ready');assert.equal(h.last().diagnostics.environmentRisk,false);
}));

test('manual reload invalidates an existing inspection before the next load event arrives',async()=>harness(async h=>{
 const older=gate();h.inspectWith(()=>older.promise);const first=h.invoke('inspect');await tick();await h.invoke('reload');
 assert.equal(h.last().stage,'loading');older.resolve(ready);await first;assert.equal(h.last().stage,'loading');
 h.inspectWith(async()=>risk);h.remote.emit('did-finish-load');await tick();assert.equal(h.last().stage,'environment-risk');
}));

test('same-document main-frame navigation rechecks and rejects the older snapshot',async()=>harness(async h=>{
 const older=gate();h.inspectWith(()=>older.promise);const first=h.invoke('inspect');await tick();h.inspectWith(async()=>risk);
 h.remote.emit('did-start-navigation',{},'https://chat.deepseek.com/sign_in#new',true,true);
 h.remote.emit('did-navigate-in-page',{},'https://chat.deepseek.com/sign_in#new',true);await tick();
 assert.equal(h.last().stage,'environment-risk');older.resolve(ready);await first;assert.equal(h.last().stage,'environment-risk');
}));

test('subframe and intentionally aborted loads do not erase a verified provider restriction',async()=>harness(async h=>{
 h.inspectWith(async()=>risk);await h.invoke('inspect');
 h.remote.emit('did-start-navigation',{},'https://chat.deepseek.com/frame',false,false);
 h.remote.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://chat.deepseek.com/frame',false);
 h.remote.emit('did-fail-load',{},-3,'ERR_ABORTED','https://chat.deepseek.com/',true);await tick();
 assert.equal(h.last().stage,'environment-risk');assert.equal(h.last().diagnostics.environmentRisk,true);
}));

test('blocked navigation invalidates an older ready inspection even when no load event follows',async()=>harness(async h=>{
 const older=gate();h.inspectWith(()=>older.promise);const first=h.invoke('inspect');await tick();let prevented=false;
 h.remote.emit('will-navigate',{preventDefault(){prevented=true;}},'https://example.invalid/');
 assert.equal(prevented,true);assert.equal(h.last().stage,'unsupported');older.resolve(ready);await first;assert.equal(h.last().stage,'unsupported');
}));

test('a delayed load-failure cancellation cannot stop or overwrite a newer run',async()=>harness(async h=>{
 const oldCancellation=gate(),newPreparation=gate();let cancellations=0;
 h.cancelWith(()=>++cancellations===1?oldCancellation.promise:Promise.resolve());await h.invoke('start');await tick();assert.equal(h.last().stage,'waiting');
 h.remote.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://chat.deepseek.com/',true);await tick();
 h.prepareWith(()=>newPreparation.promise);await h.invoke('start');await tick();assert.equal(h.last().stage,'preparing');assert.equal(h.last().running,true);
 oldCancellation.resolve();await tick();assert.equal(h.last().stage,'preparing');assert.equal(h.last().running,true);assert.equal(h.calls.includes('stop'),false);
 await h.invoke('cancel');newPreparation.resolve({requestId:'req-2',files:[],prompt:'req-2'});await tick();
}));

test('blocked navigation remains blocked after cancellation without erasing the terminal result',async()=>harness(async h=>{
 const prepareGate=gate();h.prepareWith(()=>prepareGate.promise);await h.invoke('start');await tick();await h.invoke('cancel');
 prepareGate.resolve({requestId:'req-1',files:[],prompt:'req-1'});await tick();assert.equal(h.last().stage,'cancelled');
 let prevented=false;h.remote.emit('will-navigate',{preventDefault(){prevented=true;}},'https://example.invalid/');
 assert.equal(prevented,true);assert.equal(h.last().stage,'cancelled');assert.equal(h.last().taskEnded,true);
}));
