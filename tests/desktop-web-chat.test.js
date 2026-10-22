import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let desktop;
try { desktop=require('../src/desktop/web-chat.cjs'); } catch {}

test('only exact local trusted top-level windows may access the chat bridge',()=>{
 assert.ok(desktop,'desktop chat module exists');
 const trusted={id:4,getURL:()=> 'http://127.0.0.1:4000/web-chat.html'};
 const event={sender:trusted,senderFrame:{url:trusted.getURL(),parent:null}};
 assert.equal(desktop.isTrustedChatSender(event,'http://127.0.0.1:4000',new Set([4])),true);
 assert.equal(desktop.isTrustedChatSender({...event,senderFrame:{url:'https://www.doubao.com/chat/',parent:null}},'http://127.0.0.1:4000',new Set([4])),false);
 assert.equal(desktop.isTrustedChatSender({...event,senderFrame:{url:trusted.getURL(),parent:{}}},'http://127.0.0.1:4000',new Set([4])),false);
 assert.equal(desktop.isTrustedChatSender({...event,sender:{id:9,getURL:trusted.getURL}},'http://127.0.0.1:4000',new Set([4])),false);
});

test('provider navigation rejects lookalike hosts, local URLs, credentials and unsafe protocols',()=>{
 assert.ok(desktop,'desktop chat module exists');
 assert.equal(desktop.allowedProviderURL('deepseek','https://chat.deepseek.com/sign_in'),true);
 assert.equal(desktop.allowedProviderURL('doubao','https://www.doubao.com/chat/123'),true);
 for(const url of ['https://chat.deepseek.com.attacker.test','https://user:pass@chat.deepseek.com/','http://chat.deepseek.com','http://127.0.0.1:4000/api/bootstrap','file:///etc/passwd','javascript:alert(1)'])assert.equal(desktop.allowedProviderURL('deepseek',url),false,url);
});

test('capturing a reply requires this request marker, new answer, and an explicit completed generation',()=>{
 assert.ok(desktop,'desktop chat module exists');
 const base={assistantIds:['old'],answers:['旧答案']};
 const good={markerSeen:true,markerAfterBaseline:true,assistantIds:['old','new'],answers:['旧答案','{"requestId":"run-a"}'],generating:false,completionVisible:true};
 assert.equal(desktop.selectCurrentReply(base,{...good,markerSeen:false},'run-a'),null);
 assert.equal(desktop.selectCurrentReply(base,{...good,markerAfterBaseline:false},'run-a'),null);
 assert.equal(desktop.selectCurrentReply(base,{...good,generating:true},'run-a'),null);
 assert.equal(desktop.selectCurrentReply(base,{...good,completionVisible:false},'run-a'),null);
 assert.equal(desktop.selectCurrentReply(base,{...good,answers:['旧答案','{"requestId":"another"}']},'run-a'),null);
 assert.equal(desktop.selectCurrentReply(base,good,'run-a'),'{"requestId":"run-a"}');
});

test('runner stops before submitting when any selected attachment failed, and releases the request',async()=>{
 assert.ok(desktop,'desktop chat module exists');
 const calls=[],states=[];
 const runner=desktop.createChatRunner({
  adapter:{inspect:async()=>({ready:true}),snapshot:async()=>({assistantIds:[],answers:[]}),upload:async f=>{calls.push('upload:'+f.fileName);if(f.fileName==='附件.pdf')throw new Error('上传失败');},submit:async()=>calls.push('submit')},
  prepare:async()=>({requestId:'r-1',prompt:'REQ:r-1',files:[{fileName:'主.pdf'},{fileName:'附件.pdf'}]}),complete:async()=>calls.push('save'),cancel:async id=>calls.push('cancel:'+id),onState:s=>states.push(s),pollMs:1,timeoutMs:100
 });
 await runner.start();
 assert.deepEqual(calls,['upload:主.pdf','upload:附件.pdf','cancel:r-1']);
 assert.equal(states.at(-1).stage,'failed');assert.equal(states.at(-1).running,false);
});

test('runner cancellation prevents a delayed answer from being persisted and prevents overlapping start',async()=>{
 assert.ok(desktop,'desktop chat module exists');
 let release;const gate=new Promise(resolve=>release=resolve),calls=[],states=[];
 const runner=desktop.createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>({assistantIds:[],answers:[]}),upload:async()=>{},submit:async()=>{await gate;calls.push('submitted');},stop:async()=>calls.push('stop')},prepare:async()=>({requestId:'r-2',prompt:'REQ:r-2',files:[]}),complete:async()=>calls.push('save'),cancel:async id=>calls.push('cancel:'+id),onState:s=>states.push(s),pollMs:1,timeoutMs:100});
 const first=runner.start();await new Promise(r=>setTimeout(r,5));
 await assert.rejects(runner.start(),/正在/);
 await runner.cancel();release();await first;
 assert.ok(!calls.includes('save'));assert.ok(calls.includes('cancel:r-2'));assert.equal(states.at(-1).stage,'cancelled');
});

test('runner waits for stable completed response, saves it once and keeps partial validation visible',async()=>{
 assert.ok(desktop,'desktop chat module exists');
 let index=0,completed=0;const states=[];
 const snapshots=[{assistantIds:['old'],answers:['旧答案']},{assistantIds:['old','new'],answers:['旧答案','{"requestId":"run-good"}'],markerSeen:true,markerAfterBaseline:true,generating:true,completionVisible:false},{assistantIds:['old','new'],answers:['旧答案','{"requestId":"run-good"}'],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true}];
 const runner=desktop.createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>snapshots[Math.min(index++,2)],upload:async()=>{},submit:async()=>{}},prepare:async()=>({requestId:'run-good',prompt:'REQ:run-good',files:[]}),complete:async(id,text)=>{assert.equal(id,'run-good');assert.equal(text,'{"requestId":"run-good"}');completed++;return {webChat:{status:'partial'}};},cancel:async()=>{},onState:s=>states.push(s),pollMs:1,stableMs:3,timeoutMs:100});
 await runner.start();assert.equal(completed,1);assert.equal(states.at(-1).stage,'captured');assert.equal(states.at(-1).reportSaved,true);assert.match(states.at(-1).message,/缺口|待复核/);
});

test('an accepted capture in saving stage cannot be reported as cancelled while its save is in progress',async()=>{
 assert.ok(desktop);
 let resolveSave,reached;const saving=new Promise(r=>resolveSave=r),saveReached=new Promise(r=>reached=r),states=[];
 let snap=0;
 const runner=desktop.createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>snap++?{assistantIds:['new'],answers:['{"requestId":"save-r"}'],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true}:{assistantIds:[],answers:[]},upload:async()=>{},submit:async()=>{}},prepare:async()=>({requestId:'save-r',files:[],prompt:'save-r'}),complete:async()=>{reached();await saving;return {webChat:{status:'captured'}};},cancel:async()=>{},onState:s=>states.push(s),pollMs:1,stableMs:1,timeoutMs:100});
 const task=runner.start();await saveReached;
 const cancelled=await runner.cancel();assert.equal(cancelled.stage,'saving');assert.equal(cancelled.running,true);
 resolveSave();await task;assert.equal(states.at(-1).stage,'captured');assert.equal(states.at(-1).reportSaved,true);
});

test('a failed run records the failed phase and does not carry upload bookkeeping into a user-cleared retry',async()=>{
 let attempt=0,uploaded=[],snapshots=0,saved=0;const states=[];
 const adapter={
  inspect:async()=>({ready:true,diagnostics:{editorCount:1,uploadCount:1,authentication:'unconfirmed'}}),
  reset(){attempt++;uploaded=[];snapshots=0;},
  snapshot:async()=>snapshots++?{assistantIds:['new'],answers:['{"requestId":"retry-r"}'],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true}:{assistantIds:[],answers:[]},
  async upload(file){if(uploaded.includes(file.fileName))throw new Error('旧上传记账未清理');uploaded.push(file.fileName);if(attempt<2&&file.fileName==='附件.txt')throw new Error('平台文件处理失败');},
  submit:async()=>{},
 };
 const runner=desktop.createChatRunner({adapter,prepare:async()=>({requestId:'retry-r',files:[{fileName:'主.txt'},{fileName:'附件.txt'}],prompt:'retry-r'}),complete:async()=>{saved++;return {webChat:{status:'partial'}};},cancel:async()=>{},onState:s=>states.push(s),pollMs:1,stableMs:1,timeoutMs:100});
 await runner.start();
 assert.equal(states.at(-1).stage,'failed');assert.equal(states.at(-1).failedAt,'uploading');
 assert.equal(states.at(-1).diagnostics.editorCount,1);
 await runner.start();
 assert.equal(saved,1);assert.equal(states.at(-1).stage,'captured');assert.equal(states.at(-1).failedAt,undefined);
});

test('a platform login or captcha interruption retains the blocking cause and the waiting phase',async()=>{
 let snap=0;const states=[];
 const runner=desktop.createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>snap++?{stage:'captcha',message:'请本人完成验证',diagnostics:{authentication:'blocked'}}:{assistantIds:[]},upload:async()=>{},submit:async()=>{}},prepare:async()=>({requestId:'blocked-r',files:[],prompt:'blocked-r'}),complete:async()=>assert.fail('must not save'),cancel:async()=>{},onState:s=>states.push(s),pollMs:1,timeoutMs:100});
 await runner.start();assert.equal(states.at(-1).failedAt,'waiting');assert.equal(states.at(-1).blockingStage,'captcha');assert.equal(states.at(-1).diagnostics.authentication,'blocked');
});

test('cancelling before this task has submitted never clicks a stop control for an unrelated platform answer',async()=>{
 let finishInspection,stops=0;const inspecting=new Promise(resolve=>finishInspection=resolve);
 const runner=desktop.createChatRunner({adapter:{inspect:()=>inspecting,stop:async()=>stops++},prepare:async()=>assert.fail('cancelled task must not prepare'),complete:async()=>{},cancel:async()=>{}});
 const task=runner.start();await runner.cancel();finishInspection({ready:true});await task;
 assert.equal(stops,0);assert.equal(runner.getState().stage,'cancelled');
});
