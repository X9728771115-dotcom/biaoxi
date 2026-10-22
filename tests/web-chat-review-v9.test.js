import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url);
const {createChatRunner,installDesktopWebChat}=require('../src/desktop/web-chat.cjs');
const dom=require('../src/desktop/web-chat-dom.cjs');
const requestId='review-v9',firstText=JSON.stringify({requestId,pass:'first'}),finalText=JSON.stringify({requestId,pass:'reviewed'});
const ready={ready:true,stage:'ready',diagnostics:{editorCount:1,uploadCount:1}};
const old={assistantIds:['old'],answers:['old answer']};
const first={assistantIds:['first'],answers:[firstText],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true};
const final={...first,assistantIds:['first','second'],answers:[firstText,finalText]};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate,ms=1000){const deadline=Date.now()+ms;while(!predicate()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,1));assert.ok(predicate(),'expected runner phase was not reached');}

function harness(options={}){
 const calls=[],sent=[],saved=[],cancelled=[],reviewed=[],states=[];let submitted=0,inspected=0;
 const adapter={
  inspect:async()=>{calls.push('inspect');inspected++;return options.inspect?options.inspect({submitted,inspected}):ready;},
  reset:()=>calls.push('reset'),
  snapshot:async()=>{calls.push('snapshot:'+submitted);return options.snapshot?options.snapshot({submitted,inspected}):submitted===0?old:submitted===1?first:final;},
  upload:async file=>calls.push('upload:'+file.fileName),
  submit:async(prompt,id,signal,submitOptions)=>{submitted++;calls.push('submit:'+submitted);sent.push({prompt,id,signal,options:submitOptions});if(options.submit)await options.submit({submitted});},
  stop:async()=>calls.push('stop'),
 };
 const runner=createChatRunner({adapter,prepare:async()=>{calls.push('prepare');return {requestId,prompt:'initial '+requestId,files:[{fileName:'source.pdf'}]};},
  ...(options.review?{review:async(id,text)=>{calls.push('review');reviewed.push({id,text});return options.review(id,text);}}:{}),
  complete:async(id,text)=>{calls.push('complete');saved.push({id,text});if(options.complete)return options.complete(id,text);return {webChat:{status:'partial'}};},
  cancel:async id=>{calls.push('cancel');cancelled.push(id);},onState:state=>states.push({...state}),pollMs:1,stableMs:1,timeoutMs:options.timeoutMs||100});
 return {runner,calls,sent,saved,cancelled,reviewed,states,phase:()=>submitted};
}

test('required review sends once without uploading again and completes only the new stable answer',async()=>{
 const h=harness({review:async()=>({required:true,requestId,prompt:'对照原文复核 '+requestId})});await h.runner.start();
 assert.equal(h.reviewed.length,1);assert.deepEqual(h.reviewed[0],{id:requestId,text:firstText});
 assert.equal(h.sent.length,2);assert.equal(h.calls.filter(x=>x.startsWith('upload:')).length,1);
 assert.equal(h.sent[0].options,undefined);assert.equal(h.sent[1].options.reviewOnly,true);
 assert.equal(h.sent[1].options.previousAssistantId,'first');assert.equal(h.sent[1].options.previousAnswer,firstText);
 assert.deepEqual(h.saved,[{id:requestId,text:finalText}]);assert.equal(h.states.at(-1).stage,'captured');
 assert.ok(h.states.some(s=>s.running&&/对照原文复核/.test(s.message)));
});

test('the first answer cannot complete while the required second answer is still generating',async()=>{
 let allowFinal=false;const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),snapshot:({submitted})=>submitted===0?old:submitted===1?first:allowFinal?final:{...final,generating:true,completionVisible:false}});
 const pending=h.runner.start();await until(()=>h.phase()===2);await tick();assert.deepEqual(h.saved,[]);
 allowFinal=true;await pending;assert.deepEqual(h.saved,[{id:requestId,text:finalText}]);
});

test('a review not required completes the first answer without a second send',async()=>{
 const h=harness({review:async()=>({required:false,requestId})});await h.runner.start();assert.equal(h.sent.length,1);assert.equal(h.reviewed.length,1);assert.deepEqual(h.saved,[{id:requestId,text:firstText}]);
});

test('an absent review callback preserves the existing one-pass adapter protocol',async()=>{
 const h=harness();await h.runner.start();assert.equal(h.sent.length,1);assert.equal(h.calls.filter(x=>x==='inspect').length,1);assert.deepEqual(h.saved,[{id:requestId,text:firstText}]);
});

for(const [name,decision] of [
 ['stopped review',{required:false,stopped:true,reason:'完整复核材料超过上限',requestId}],
 ['mismatched request',{required:true,prompt:'复核 '+requestId,requestId:'another'}],
 ['missing prompt',{required:true,requestId}],
 ['prompt without this request marker',{required:true,prompt:'unrelated task',requestId}],
 ['invalid decision',{}],
])test(`${name} cancels safely without completing the first answer as reviewed`,async()=>{
 const h=harness({review:async()=>decision});await h.runner.start();assert.equal(h.sent.length,1);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);assert.equal(h.states.at(-1).stage,'failed');assert.equal(h.states.at(-1).firstReplyCaptured,true);
});

for(const [name,changed] of [
 ['different assistant id',{...first,assistantIds:['someone-else']}],
 ['changed first answer',{...first,answers:[firstText+' edited']}],
 ['missing marker',{...first,markerSeen:false}],
 ['missing marker provenance',{...first,markerAfterBaseline:false}],
 ['still generating',{...first,generating:true}],
 ['not visibly completed',{...first,completionVisible:false}],
 ['quota block',{...first,stage:'quota',message:'次数上限'}],
 ['different conversation',{assistantIds:[],answers:[],markerSeen:false}],
])test(`${name} after the server review prevents any corrective prompt from being sent`,async()=>{
 let changedPage=false;const h=harness({review:async()=>{changedPage=true;return {required:true,prompt:'复核 '+requestId};},snapshot:({submitted})=>submitted===0?old:changedPage?changed:first});
 await h.runner.start();assert.equal(h.sent.length,1);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);
});

for(const stage of ['draft','attachments','login','unsupported'])test(`${stage} before review sending is preserved without overwriting or resubmitting`,async()=>{
 const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),inspect:({inspected})=>inspected===1?ready:{ready:false,stage,message:'请先处理 '+stage}});
 await h.runner.start();assert.equal(h.sent.length,1);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);assert.equal(h.states.at(-1).stage,'failed');
});

test('a conversation changed during read-only inspection is checked again before review submit',async()=>{
 let changed=false;const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),inspect:({inspected})=>{if(inspected>1)changed=true;return ready;},snapshot:({submitted})=>submitted===0?old:changed?{...first,assistantIds:['replaced']}:first});
 await h.runner.start();assert.equal(h.sent.length,1);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);
});

test('cancelling while the server review is pending prevents a late corrective send',async()=>{
 const pendingReview=gate();const h=harness({review:()=>pendingReview.promise});const pending=h.runner.start();await until(()=>h.reviewed.length===1);await h.runner.cancel();pendingReview.resolve({required:true,prompt:'复核 '+requestId});await pending;
 assert.equal(h.sent.length,1);assert.deepEqual(h.saved,[]);assert.equal(h.states.at(-1).stage,'cancelled');assert.ok(!h.calls.includes('stop'),'completed first generation must not stop an unrelated new generation');
});

test('cancelling while inspection awaits prevents review submission after it resolves',async()=>{
 const pendingInspection=gate();const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),inspect:({inspected})=>inspected===1?ready:pendingInspection.promise});const pending=h.runner.start();await until(()=>h.calls.filter(x=>x==='inspect').length===2);await h.runner.cancel();pendingInspection.resolve(ready);await pending;
 assert.equal(h.sent.length,1);assert.deepEqual(h.saved,[]);assert.equal(h.states.at(-1).stage,'cancelled');
});

test('reusing the first assistant identity cannot be accepted as a reviewed response',async()=>{
 const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),snapshot:({submitted})=>submitted===0?old:submitted===1?first:{...first,answers:[finalText]},timeoutMs:25});await h.runner.start();
 assert.equal(h.sent.length,2);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);assert.equal(h.states.at(-1).stage,'failed');
});

test('a new conversation answer cannot become the review even with a copied request marker',async()=>{
 const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),snapshot:({submitted})=>submitted===0?old:submitted===1?first:{...first,assistantIds:['elsewhere'],answers:[finalText]},timeoutMs:25});await h.runner.start();
 assert.equal(h.sent.length,2);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);
});

test('an unrelated latest answer cannot borrow the request marker from the preserved first reply',async()=>{
 const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),snapshot:({submitted})=>submitted===0?old:submitted===1?first:{...final,answers:[firstText,'another task answer']},timeoutMs:25});await h.runner.start();
 assert.equal(h.sent.length,2);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);
});

test('expert-mode drift rejected by the submit guard stops review without completing the first pass',async()=>{
 const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),submit:({submitted})=>{if(submitted===2)throw Object.assign(new Error('豆包专家模式已变化'),{blockingStage:'quality-mode'});}});await h.runner.start();
 assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);assert.equal(h.states.at(-1).blockingStage,'quality-mode');assert.equal(h.states.at(-1).firstReplyCaptured,true);
});

test('a rejected server review cancels and retains the first-reply availability state',async()=>{
 const h=harness({review:async()=>{throw new Error('首答复核审计写入失败');}});await h.runner.start();
 assert.equal(h.sent.length,1);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);assert.equal(h.states.at(-1).firstReplyCaptured,true);
});

test('a second-round timeout cancels with the first answer still available for server audit',async()=>{
 const retained=[];const h=harness({review:async(id,text)=>{retained.push({id,text});return {required:true,prompt:'复核 '+requestId};},snapshot:({submitted})=>submitted===0?old:submitted===1?first:{...first,generating:true,completionVisible:false},timeoutMs:25});await h.runner.start();
 assert.deepEqual(retained,[{id:requestId,text:firstText}]);assert.deepEqual(h.saved,[]);assert.deepEqual(h.cancelled,[requestId]);assert.equal(h.states.at(-1).firstReplyCaptured,true);
});

test('each answer gets its own bounded waiting period',async()=>{
 let initialAt=0,reviewAt=0;const h=harness({timeoutMs:200,review:async()=>({required:true,prompt:'复核 '+requestId}),submit:({submitted})=>{if(submitted===1)initialAt=Date.now();else reviewAt=Date.now();},snapshot:({submitted})=>submitted===0?old:submitted===1?(Date.now()-initialAt>=120?first:{...first,generating:true,completionVisible:false}):(Date.now()-reviewAt>=120?final:{...final,generating:true,completionVisible:false})});
 await h.runner.start();assert.deepEqual(h.saved,[{id:requestId,text:finalText}]);assert.ok(reviewAt-initialAt>=120);
});

test('a complete failure after review cancels without recursively reviewing again',async()=>{
 const h=harness({review:async()=>({required:true,prompt:'复核 '+requestId}),complete:async()=>{throw new Error('保存失败');}});await h.runner.start();assert.equal(h.reviewed.length,1);assert.equal(h.saved.length,1);assert.deepEqual(h.cancelled,[requestId]);assert.equal(h.states.at(-1).stage,'failed');
});

test('desktop installation connects the optional service review callback to the runner',async()=>{
 const originalFactory=dom.createBrowserAdapter,handlers=new Map(),locals=[];let id=0,snapshots=0,reviewed=0;const completeCalled=gate();
 class Contents extends EventEmitter{constructor(){super();this.id=++id;this.url='';this.session={setPermissionRequestHandler(){},setPermissionCheckHandler(){},on(){},webRequest:{onBeforeRequest(){}}};}getURL(){return this.url;}isDestroyed(){return false;}setWindowOpenHandler(){}async loadURL(url){this.url=url;}send(){}close(){}}
 class Window extends EventEmitter{constructor(){super();this.webContents=new Contents();this.contentView={addChildView(){}};this.destroyed=false;locals.push(this);}async loadURL(url){await this.webContents.loadURL(url);}isDestroyed(){return this.destroyed;}show(){}focus(){}close(){this.destroyed=true;this.emit('closed');}}
 class View{constructor(){this.webContents=new Contents();}setBounds(){}}
 dom.createBrowserAdapter=()=>({inspect:async()=>ready,reset(){},snapshot:async()=>snapshots++?first:old,upload:async()=>{},submit:async()=>{},stop:async()=>{}});
 const service={url:'http://127.0.0.1:4000',store:{getReport:async()=>({})},desktopWebChat:{prepare:async()=>({requestId,files:[],prompt:requestId}),review:async(id,text)=>{assert.equal(id,requestId);assert.equal(text,firstText);reviewed++;return {required:false};},complete:async()=>{completeCalled.resolve();return {webChat:{status:'captured'}};},cancel:async()=>{}}};
 const desktop=installDesktopWebChat({electron:{BrowserWindow:Window,WebContentsView:View,ipcMain:{handle:(name,handler)=>handlers.set(name,handler),removeHandler:name=>handlers.delete(name)}},service,getMainWindow:()=>null});
 try{
  await desktop.open({provider:'doubao',reportId:'report-review'});const sender=locals[0].webContents;await handlers.get('biaoxi-web-chat:start')({sender,senderFrame:{url:sender.getURL(),parent:null}});
  let timer;try{await Promise.race([completeCalled.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('desktop completion timeout')),7500);})]);}finally{clearTimeout(timer);}assert.equal(reviewed,1);
 }finally{await desktop.close();dom.createBrowserAdapter=originalFactory;}
});
