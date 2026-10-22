import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {modeFixture} from './helpers/web-chat-mode-fixture-v9.js';
const require=createRequire(import.meta.url);
const {createChatRunner}=require('../src/desktop/web-chat.cjs');

const signal=()=>new AbortController().signal;

test('runner confirms quality mode before preparing or uploading any material',async()=>{
 const calls=[];let snap=0;const states=[];
 const adapter={inspect:async()=>({ready:true}),ensureQualityMode:async()=>{calls.push('quality');return {ready:true,qualityMode:'expert'};},reset:()=>calls.push('reset'),snapshot:async()=>snap++?{assistantIds:['new'],answers:['{"requestId":"quality-run"}'],markerSeen:true,markerAfterBaseline:true,generating:false,completionVisible:true}:{assistantIds:[]},upload:async()=>calls.push('upload'),submit:async()=>calls.push('submit')};
 const runner=createChatRunner({adapter,prepare:async()=>{calls.push('prepare');return {requestId:'quality-run',prompt:'quality-run',files:[{}]};},complete:async()=>{calls.push('complete');return {webChat:{status:'partial'}};},cancel:async()=>{},onState:s=>states.push(s),pollMs:1,stableMs:1,timeoutMs:100});
 await runner.start();assert.deepEqual(calls,['quality','reset','prepare','upload','submit','complete']);
 assert.ok(states.some(s=>s.running&&/专家/.test(s.message)));
});

test('an unavailable quality mode stops before preparing, uploading or submitting',async()=>{
 const calls=[];const runner=createChatRunner({adapter:{inspect:async()=>({ready:true}),ensureQualityMode:async()=>{throw Object.assign(new Error('专家模式不可用'),{blockingStage:'quality-mode'});}},prepare:async()=>calls.push('prepare'),complete:async()=>calls.push('complete'),cancel:async()=>calls.push('cancel')});
 await runner.start();assert.deepEqual(calls,[]);assert.equal(runner.getState().blockingStage,'quality-mode');
});

test('cancellation during mode confirmation prevents a late preparation',async()=>{
 let release,reached;const gate=new Promise(r=>release=r),started=new Promise(r=>reached=r),calls=[];
 const runner=createChatRunner({adapter:{inspect:async()=>({ready:true}),ensureQualityMode:async()=>{reached();await gate;return {ready:true,qualityMode:'expert'};}},prepare:async()=>calls.push('prepare'),complete:async()=>{},cancel:async()=>{}});
 const pending=runner.start();await Promise.race([started,new Promise(r=>setTimeout(r,20))]);await runner.cancel();release();await pending;
 assert.deepEqual(calls,[]);assert.equal(runner.getState().stage,'cancelled');
});

test('already selected expert mode is preserved without clicking controls',async()=>{
 const {adapter,clicks}=modeFixture({mode:'豆包 专家'});const result=await adapter.ensureQualityMode(signal());
 assert.equal(result.ready,true);assert.equal(result.qualityMode,'expert');assert.deepEqual(clicks,[]);
});

test('quick mode switches only through its unique visible expert menu option',async()=>{
 const {adapter,clicks}=modeFixture();const result=await adapter.ensureQualityMode(signal());
 assert.equal(result.ready,true);assert.equal(result.qualityMode,'expert');assert.deepEqual(clicks,['mode','expert']);
});

for(const attribute of ['aria-hidden','inert','hidden'])test(`an opened mode menu may isolate its trigger with ${attribute} while its own expert option stays actionable`,async()=>{
 const {adapter,clicks}=modeFixture({afterModeClick:({$})=>$('#mode').attr(attribute,attribute==='aria-hidden'?'true':''),afterExpertClick:({$})=>$('#mode').removeAttr(attribute)});
 const result=await adapter.ensureQualityMode(signal());assert.equal(result.qualityMode,'expert');assert.deepEqual(clicks,['mode','expert']);
});

test('an initially hidden expert trigger is still rejected without clicking',async()=>{
 const {adapter,clicks,$}=modeFixture({mode:'豆包 专家'});$('#mode').attr('aria-hidden','true');
 await assert.rejects(adapter.ensureQualityMode(signal()),/模式按钮/);assert.deepEqual(clicks,[]);
});

test('expert selection still requires the final trigger to leave modal isolation',async()=>{
 const {adapter,clicks}=modeFixture({afterModeClick:({$})=>$('#mode').attr('aria-hidden','true')});
 await assert.rejects(adapter.ensureQualityMode(signal()),/模式按钮/);assert.deepEqual(clicks,['mode','expert']);
});

test('isolating the underlying trigger never authorizes an unknown or paid menu option',async()=>{
 const {adapter,clicks}=modeFixture({menu:'<div role="menuitem">豆包 快速</div><div role="menuitem" id="expert">豆包 专家 升级会员</div>',afterModeClick:({$})=>$('#mode').attr('aria-hidden','true')});
 await assert.rejects(adapter.ensureQualityMode(signal()),/升级|付费/);assert.deepEqual(clicks,['mode']);
});

for(const [name,options] of [
 ['unknown mode',{mode:'豆包 未知'}],
 ['multiple mode buttons',{extraMode:'<button>豆包 快速</button>'}],
 ['covered mode button',{cover:'#mode'}],
 ['pre-existing menu',{menuOpen:true}],
 ['login gate',{alerts:'<input placeholder="手机号"><button>登录</button>'}],
 ['quota gate',{alerts:'<div role="alert">专家次数已达上限</div>'}],
 ['paid upgrade dialog',{alerts:'<div role="dialog">请升级会员后使用专家</div>'}],
])test(`${name} stops without clicking or sending`,async()=>{
 const {adapter,clicks}=modeFixture(options);await assert.rejects(adapter.ensureQualityMode(signal()));assert.deepEqual(clicks,[]);
});

for(const [name,options] of [
 ['missing expert',{menu:'<div role="menuitem">豆包 快速</div>'}],
 ['duplicate expert',{menu:'<div role="menuitem">豆包 快速</div><div role="menuitem">豆包 专家</div><div role="menuitem">豆包 专家</div>'}],
 ['disabled expert',{menu:'<div role="menuitem">豆包 快速</div><div role="menuitem" aria-disabled="true">豆包 专家</div>'}],
 ['unknown extra option',{menu:'<div role="menuitem">豆包 快速</div><div role="menuitem">豆包 专家</div><div role="menuitem">其他模式</div>'}],
 ['upgrade inside menu',{menu:'<div role="menuitem">豆包 快速</div><div role="menuitem">豆包 专家 升级会员</div>'}],
 ['covered expert',{cover:'#expert'}],
])test(`${name} cannot fall back to quick or click an upgrade`,async()=>{
 const {adapter,clicks}=modeFixture(options);await assert.rejects(adapter.ensureQualityMode(signal()));assert.deepEqual(clicks,['mode']);
});

test('a selection that remains quick times out without retrying or falling back',async()=>{
 const {adapter,clicks}=modeFixture({keepFast:true});await assert.rejects(adapter.ensureQualityMode(signal()),/专家|超时|限定/);assert.deepEqual(clicks,['mode','expert']);
});

test('cancellation after opening the mode menu prevents the option click',async()=>{
 const controller=new AbortController();const {adapter,clicks}=modeFixture({afterModeClick:()=>controller.abort()});await assert.rejects(adapter.ensureQualityMode(controller.signal),/取消/);assert.deepEqual(clicks,['mode']);
});

test('leaving the selected provider after opening its menu prevents further clicks',async()=>{
 const {adapter,clicks}=modeFixture({afterModeClick:({setURL})=>setURL('https://other.example/')});await assert.rejects(adapter.ensureQualityMode(signal()),/离开|关闭/);assert.deepEqual(clicks,['mode']);
});

test('a stalled DOM call is bounded and cannot cause a delayed mode click',async()=>{
 const {adapter,clicks}=modeFixture({hang:true});const began=Date.now();await assert.rejects(adapter.ensureQualityMode(signal()),/超时|限定|专家/);assert.ok(Date.now()-began<500);assert.deepEqual(clicks,[]);
});

test('composer changes during selection are rejected by the final read-only check',async()=>{
 const {adapter,clicks}=modeFixture({afterExpertClick:({$})=>$('textarea').val('用户新草稿')});await assert.rejects(adapter.ensureQualityMode(signal()),/草稿|输入/);assert.deepEqual(clicks,['mode','expert']);
});

test('a mode changed back to quick after confirmation stops before a later upload',async()=>{
 const {adapter,clicks,$}=modeFixture({mode:'豆包 专家'});await adapter.ensureQualityMode(signal());$('#mode').text('豆包 快速');
 await assert.rejects(adapter.upload({path:'/not-a-real-test-file',fileName:'本次.txt'},signal()),/专家模式/);assert.deepEqual(clicks,[]);
});

test('a mode changed back to quick after confirmation stops before filling the prompt',async()=>{
 const {adapter,clicks,$}=modeFixture({mode:'豆包 专家'});await adapter.ensureQualityMode(signal());$('#mode').text('豆包 快速');
 await assert.rejects(adapter.submit('quality-id','quality-id',signal()),/专家模式/);assert.equal($('textarea').val(),'');assert.deepEqual(clicks,[]);
});

test('a mode changed while filling is checked again in the same DOM task as sending',async()=>{
 const {adapter,clicks}=modeFixture({mode:'豆包 专家',afterFill:({$})=>$('#mode').text('豆包 快速')});await adapter.ensureQualityMode(signal());
 await assert.rejects(adapter.submit('quality-id','quality-id',signal()),/专家模式/);assert.deepEqual(clicks,[]);
});

test('a microtask mode change after the entry check cannot write any prompt into the external input',async()=>{
 const {adapter,$}=modeFixture({mode:'豆包 专家'});await adapter.ensureQualityMode(signal());
 const pending=adapter.submit('quality-id','quality-id',signal());queueMicrotask(()=>$('#mode').text('豆包 快速'));
 await assert.rejects(pending,/专家模式/);assert.equal($('textarea').val(),'');
});

test('a mode changed while the native chooser opens cannot put files into its external file input',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'biaoxi-quality-race-'));
 try{
  const path=join(folder,'匿名.txt');await writeFile(path,'仅用于本地时序测试');
  const {adapter,fileInputReceived,clicks}=modeFixture({mode:'豆包 专家',afterUploadTrigger:({$})=>$('#mode').text('豆包 快速')});await adapter.ensureQualityMode(signal());
  let rejection;await adapter.upload({path,fileName:'匿名.txt'},signal()).catch(error=>{rejection=error;});
  assert.deepEqual(fileInputReceived,[]);assert.deepEqual(clicks,['upload']);assert.match(rejection?.message||'',/专家模式/);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('DeepSeek keeps its existing adapter and has no Doubao quality-mode hook',()=>{
 assert.equal(modeFixture({provider:'deepseek'}).adapter.ensureQualityMode,undefined);
});
