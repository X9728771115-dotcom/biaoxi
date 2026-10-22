import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webChatControls,performWebChatAction,webChatDiagnosticText,mountWebChatWindow} from '../public/web-chat.js';
const require=createRequire(import.meta.url);
const {createChatRunner,selectCurrentReply}=require('../src/desktop/web-chat.cjs');
const risk={stage:'environment-risk',message:'平台提示当前使用环境受限，已停止网页分析；请按平台提示使用官方产品。',diagnostics:{environmentRisk:true,authentication:'blocked'}};
const answer={assistantIds:['new'],answers:['{"requestId":"risk-run"}'],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true};

test('a visible environment restriction stops before preparing any request',async()=>{
 const calls=[];
 const runner=createChatRunner({adapter:{inspect:async()=>({ready:false,...risk})},prepare:async()=>calls.push('prepare'),complete:async()=>calls.push('save'),cancel:async()=>calls.push('cancel')});
 await runner.start();assert.deepEqual(calls,[]);assert.equal(runner.getState().stage,'environment-risk');assert.equal(runner.getState().running,false);
});
test('a restriction appearing during prepare releases the request before uploading or submitting',async()=>{
 const calls=[];let snapshots=0;
 const runner=createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>snapshots++?answer:risk,upload:async()=>calls.push('upload'),submit:async()=>calls.push('submit')},prepare:async()=>({requestId:'risk-run',files:[{fileName:'anonymous.txt'}],prompt:'risk-run'}),complete:async()=>calls.push('save'),cancel:async id=>calls.push('cancel:'+id),pollMs:1,stableMs:1,timeoutMs:100});
 await runner.start();assert.deepEqual(calls,['cancel:risk-run']);assert.equal(runner.getState().blockingStage,'environment-risk');assert.equal(runner.getState().failedAt,'uploading');assert.equal(runner.getState().reportSaved,false);
});
test('a restriction during streaming wins over an otherwise completed answer and never saves',async()=>{
 const calls=[];let snapshots=0;
 const runner=createChatRunner({adapter:{inspect:async()=>({ready:true}),snapshot:async()=>snapshots++?{...answer,...risk}:{assistantIds:[]},submit:async()=>calls.push('submit')},prepare:async()=>({requestId:'risk-run',files:[],prompt:'risk-run'}),complete:async()=>calls.push('save'),cancel:async id=>calls.push('cancel:'+id),pollMs:1,stableMs:1,timeoutMs:100});
 await runner.start();assert.deepEqual(calls,['submit','cancel:risk-run']);assert.equal(runner.getState().blockingStage,'environment-risk');assert.equal(runner.getState().failedAt,'waiting');assert.equal(runner.getState().reportSaved,false);
 assert.equal(selectCurrentReply({assistantIds:[]},{...answer,...risk},'risk-run'),null);
});
test('restricted UI disables start and gives platform guidance without repeated login advice',async()=>{
 let starts=0;const bridge={start:async()=>starts++};
 for(const state of [{...risk,running:false},{stage:'failed',blockingStage:'environment-risk',diagnostics:risk.diagnostics,running:false}]){
  const controls=webChatControls({reportId:'r'},state);assert.equal(controls.startDisabled,true);assert.equal(controls.inspectDisabled,false);assert.equal(controls.reloadDisabled,false);
  await assert.rejects(performWebChatAction(bridge,'start',{reportId:'r'},state),error=>/平台.*环境.*受限/.test(error.message)&&!/登录/.test(error.message));
 }
 assert.equal(starts,0);
 const diagnostic=webChatDiagnosticText({blockingStage:'environment-risk',diagnostics:{...risk.diagnostics,body:'PRIVATE_ACCOUNT_TEXT'}});
 assert.match(diagnostic,/平台.*环境.*受限/);assert.doesNotMatch(diagnostic,/PRIVATE_ACCOUNT_TEXT|登录/);
});
test('window rendering replaces restriction text with fixed guidance and never suggests another login',async()=>{
 const nodes=new Map(),doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',classList:{toggle(){}},addEventListener(){},getBoundingClientRect:()=>({left:0,top:250,width:900,height:600})});return nodes.get(id);}};
 const previousWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
 try{
  const bridge={context:async()=>({provider:'deepseek',state:{...risk,message:'PRIVATE_PLATFORM_TEXT'},files:[]}),start:async()=>{},inspect:async()=>{},reload:async()=>{}};
  const mounted=mountWebChatWindow(doc,bridge);await mounted.refreshContext();
  for(const id of ['chat-status','chat-note']){assert.match(nodes.get(id).textContent,/平台.*环境.*限制|平台.*环境.*受限/);assert.doesNotMatch(nodes.get(id).textContent,/PRIVATE_|登录/);}
  assert.doesNotMatch(nodes.get('chat-files').innerHTML,/登录/);assert.equal(nodes.get('chat-start').disabled,true);assert.equal(nodes.get('chat-inspect').disabled,false);
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
});
