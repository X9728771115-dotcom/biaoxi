import test from 'node:test';
import assert from 'node:assert/strict';
import {webChatControls,performWebChatAction,mountWebChatWindow} from '../public/web-chat.js';

test('only a checked ready platform can enable file analysis',async()=>{
 let starts=0;const bridge={start:async()=>{starts++;return {ok:true};}},context={reportId:'r'};
 for(const stage of [undefined,'idle','loading','checking','login','captcha','quota','unsupported','draft','attachments','failed','upload-error']){
  const state={stage,running:false};assert.equal(webChatControls(context,state).startDisabled,true,String(stage));
  await assert.rejects(performWebChatAction(bridge,'start',context,state),/尚未准备|检查/);
 }
 assert.equal(starts,0);assert.equal(webChatControls(context,{stage:'ready',running:false}).startDisabled,false);
 assert.deepEqual(await performWebChatAction(bridge,'start',context,{stage:'ready',running:false}),{ok:true});assert.equal(starts,1);
});

test('loading and checking disable repeated inspection without disabling a deliberate reload',()=>{
 for(const stage of ['loading','checking']){
  const controls=webChatControls({reportId:'r'},{stage,running:false});
  assert.equal(controls.startDisabled,true);assert.equal(controls.inspectDisabled,true);assert.equal(controls.reloadDisabled,false);
 }
 const risk=webChatControls({reportId:'r'},{stage:'environment-risk',running:false});
 assert.equal(risk.startDisabled,true);assert.equal(risk.inspectDisabled,false);
});

for(const action of ['inspect','reload'])test(`clicking ${action} immediately disables analysis while its IPC response is pending`,async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),nodes=new Map();
 const doc={getElementById:id=>{
  if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',handlers:{},classList:{toggle(){}},addEventListener(name,fn){this.handlers[name]=fn;},getBoundingClientRect:()=>({left:0,top:250,width:900,height:600})});
  return nodes.get(id);
 }};
 const previous=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
 try{
  let calls=0;
  const bridge={context:async()=>({provider:'deepseek',reportId:'r',state:{stage:'ready',running:false},files:[]}),start:async()=>{},inspect:async()=>{calls++;await gate;return {stage:'login',running:false};},reload:async()=>{calls++;await gate;return {ok:true};}};
  const mounted=mountWebChatWindow(doc,bridge);await mounted.refreshContext();
  assert.equal(nodes.get('chat-start').disabled,false);
  const task=nodes.get('chat-'+action).handlers.click();
  assert.equal(nodes.get('chat-start').disabled,true,'must not remain ready while checking/loading');
  assert.equal(calls,1);release();await task;
  assert.equal(nodes.get('chat-start').disabled,true,'no successful readiness check yet');
 }finally{release();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('checking or reloading an ended task keeps its saved or cancelled status visible',async()=>{
 const previous=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
 try{
  for(const stage of ['captured','cancelled'])for(const action of ['inspect','reload']){
   const nodes=new Map(),original={stage,running:false,message:'本次任务已结束，保留结果。',reportSaved:stage==='captured'};
   const doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',handlers:{},classList:{toggle(){}},addEventListener(name,fn){this.handlers[name]=fn;},getBoundingClientRect:()=>({left:0,top:250,width:900,height:600})});return nodes.get(id);}};
   const bridge={context:async()=>({provider:'deepseek',reportId:'r',state:original,files:[]}),start:async()=>{},inspect:async()=>original,reload:async()=>({ok:true})};
   const mounted=mountWebChatWindow(doc,bridge);await mounted.refreshContext();
   const label=nodes.get('chat-stage').textContent;
   await nodes.get('chat-'+action).handlers.click();
   assert.equal(nodes.get('chat-stage').textContent,label,stage+' '+action);
   assert.equal(nodes.get('chat-status').textContent,original.message);
   assert.equal(nodes.get('chat-start').disabled,true);
  }
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
