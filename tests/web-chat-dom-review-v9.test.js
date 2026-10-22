import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {modeFixture} from './helpers/web-chat-mode-fixture-v9.js';
const requestId='dom-review-v9',firstText=JSON.stringify({requestId,pass:'first'}),reviewPrompt='对照原文复核 '+requestId;
const signal=()=>new AbortController().signal;
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const user=text=>`<article data-role="user"><div data-testid="message_text_content"><span>${escape(text)}</span></div></article>`;
const assistant=text=>`<article data-testid="receive_message" data-message-role="assistant"><div data-testid="message_text_content"><div class="flow-markdown-body">${escape(text)}</div></div><div data-testid="message_action_bar"><button data-testid="message_action_copy">复制</button></div></article>`;
async function prime(t,options={}){
 const folder=await mkdtemp(join(tmpdir(),'biaoxi-dom-review-'));t.after(()=>rm(folder,{recursive:true,force:true}));const path=join(folder,'匿名.txt');await writeFile(path,'仅用于本地复核守卫测试');
 const h=modeFixture({mode:'豆包 专家',...options,afterSend:ctx=>{ctx.$('#messages').append(user(ctx.prompt)+assistant(ctx.sentPrompts.length===1?firstText:JSON.stringify({requestId,pass:'reviewed'})));options.afterSend?.(ctx);}});
 if(options.confirmQuality!==false)await h.adapter.ensureQualityMode(signal());
 await h.adapter.upload({path,fileName:'匿名.txt'},signal());await h.adapter.submit('首次分析 '+requestId,requestId,signal());
 const snapshot=await h.adapter.snapshot(requestId);assert.equal(snapshot.answers.at(-1),firstText);
 return {...h,folder,proof:{reviewOnly:true,previousAssistantId:snapshot.assistantIds.at(-1),previousAnswer:firstText}};
}
async function rejectedWithoutWrite(h,options=h.proof){
 await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),options));assert.equal(h.sentPrompts.length,1);assert.equal(h.$('textarea').val(),'');assert.equal(h.fileInputReceived.length,1);
}

test('one proven same-task text review sends with no additional file upload and cannot repeat',async t=>{
 const h=await prime(t);await h.adapter.submit(reviewPrompt,requestId,signal(),h.proof);
 assert.deepEqual(h.sentPrompts,['首次分析 '+requestId,reviewPrompt]);assert.equal(h.fileInputReceived.length,1);
 const latest=await h.adapter.snapshot(requestId);await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),{reviewOnly:true,previousAssistantId:latest.assistantIds.at(-1),previousAnswer:latest.answers.at(-1)}));assert.equal(h.sentPrompts.length,2);
});

test('normal zero-attachment submission remains forbidden',async()=>{
 const h=modeFixture({mode:'豆包 专家'});await h.adapter.ensureQualityMode(signal());await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal()));assert.deepEqual(h.sentPrompts,[]);assert.deepEqual(h.fileInputReceived,[]);
});

for(const [name,change] of [
 ['missing previous id',proof=>{delete proof.previousAssistantId;}],
 ['missing previous raw answer',proof=>{delete proof.previousAnswer;}],
 ['wrong assistant id',proof=>{proof.previousAssistantId='different';}],
 ['wrong raw answer',proof=>{proof.previousAnswer=firstText+' changed';}],
])test(`${name} cannot write a corrective prompt`,async t=>{
 const h=await prime(t);const proof={...h.proof};change(proof);await rejectedWithoutWrite(h,proof);
});

test('a different request cannot reuse the first task proof',async t=>{
 const h=await prime(t);await assert.rejects(h.adapter.submit('另一个任务 other-id','other-id',signal(),h.proof));assert.equal(h.$('textarea').val(),'');assert.equal(h.sentPrompts.length,1);
});

test('an existing platform answer alone cannot authorize a zero-attachment review channel',async()=>{
 const h=modeFixture({mode:'豆包 专家',messages:user(requestId)+assistant(firstText)});await h.adapter.ensureQualityMode(signal());const snapshot=await h.adapter.snapshot(requestId);
 await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),{reviewOnly:true,previousAssistantId:snapshot.assistantIds.at(-1),previousAnswer:firstText}));assert.equal(h.$('textarea').val(),'');assert.deepEqual(h.sentPrompts,[]);
});

test('a first send without local expert confirmation cannot authorize a review',async t=>{
 const h=await prime(t,{confirmQuality:false});await rejectedWithoutWrite(h);
});

test('DeepSeek cannot use the Doubao text-review branch',async()=>{
 const h=modeFixture({provider:'deepseek'});await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),{reviewOnly:true,previousAssistantId:'fake',previousAnswer:firstText}));assert.equal(h.$('textarea').val(),'');assert.deepEqual(h.sentPrompts,[]);
});

for(const [name,mutate] of [
 ['changed conversation',h=>h.$('#messages').empty()],
 ['new foreign user',h=>h.$('#messages').append(user('用户的新问题'))],
 ['changed source answer',h=>h.$('.flow-markdown-body').text(firstText+' edited')],
 ['new attachment',h=>h.$('main').append('<div data-testid="file_card">另一个.txt</div>')],
 ['streaming answer',h=>h.$('[data-testid="receive_message"]').attr('data-streaming','true')],
 ['missing completion',h=>h.$('[data-testid="message_action_bar"]').remove()],
 ['quick-mode drift',h=>h.$('#mode').text('豆包 快速')],
 ['quota',h=>h.$('main').append('<div role="alert">次数已达上限</div>')],
])test(`${name} before review cannot write to the external input`,async t=>{
 const h=await prime(t);mutate(h);await rejectedWithoutWrite(h);
});

test('a user draft is preserved without corrective text or a send',async t=>{
 const h=await prime(t);h.$('textarea').val('用户未发送的草稿');await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),h.proof));assert.equal(h.$('textarea').val(),'用户未发送的草稿');assert.equal(h.sentPrompts.length,1);
});

test('locally queued extra files cannot be consumed as a pure-text review',async t=>{
 const h=await prime(t);const path=join(h.folder,'额外.txt');await writeFile(path,'额外匿名文件');await h.adapter.upload({path,fileName:'额外.txt'},signal());
 await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),h.proof));assert.equal(h.$('textarea').val(),'');assert.equal(h.sentPrompts.length,1);assert.equal(h.fileInputReceived.length,2);
});

test('nested user body candidates, assistant content and an ancestor wrapper are not foreign later users',async t=>{
 const h=await prime(t);h.$('#messages').wrap('<section data-testid="message_text_content"></section>');h.$('textarea').attr('data-testid','message_text_content');const snapshot=await h.adapter.snapshot(requestId);assert.equal(snapshot.hasLaterUser,false);
 await h.adapter.submit(reviewPrompt,requestId,signal(),h.proof);assert.equal(h.sentPrompts.length,2);
});

test('a foreign user after the prior assistant is reported even without the original marker text',async t=>{
 const h=await prime(t);h.$('#messages').append('<article data-message-role="user"><div data-testid="message_text_content">不含原任务标记的新问题</div></article>');const snapshot=await h.adapter.snapshot(requestId);assert.equal(snapshot.hasLaterUser,true);await rejectedWithoutWrite(h);
});

for(const [name,mutate] of [
 ['different conversation',({$})=>$('#messages').empty()],
 ['new foreign user',({$})=>$('#messages').append(user('后来问题'))],
 ['new attachment',({$})=>$('main').append('<div data-testid="file_card">后来.txt</div>')],
 ['streaming',({$})=>$('[data-testid="receive_message"]').attr('data-streaming','true')],
 ['mode drift',({$})=>$('#mode').text('豆包 快速')],
 ['same-provider navigation',({setURL})=>setURL('https://www.doubao.com/chat/another')],
 ['external navigation',({setURL})=>setURL('https://other.example/')],
])test(`${name} after preflight but before fill does not write a late prompt`,async t=>{
 let armed=false;const h=await prime(t,{beforeAction:ctx=>{if(armed&&ctx.action==='fill')mutate(ctx);}});armed=true;await rejectedWithoutWrite(h);
});

for(const [name,mutate] of [
 ['different conversation',({$})=>$('#messages').empty()],
 ['foreign user',({$})=>$('#messages').append(user('后来问题'))],
 ['attachment',({$})=>$('main').append('<div data-testid="file_card">后来.txt</div>')],
 ['streaming',({$})=>$('[data-testid="receive_message"]').attr('data-streaming','true')],
 ['mode drift',({$})=>$('#mode').text('豆包 快速')],
 ['navigation',({setURL})=>setURL('https://www.doubao.com/chat/another')],
])test(`${name} after fill prevents the corrective send`,async t=>{
 let armed=false;const h=await prime(t,{afterAction:ctx=>{if(armed&&ctx.action==='fill')mutate(ctx);}});armed=true;
 await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),h.proof));assert.equal(h.sentPrompts.length,1);assert.equal(h.fileInputReceived.length,1);
});

test('cancellation before corrective fill never writes or sends',async t=>{
 const h=await prime(t),controller=new AbortController();const pending=h.adapter.submit(reviewPrompt,requestId,controller.signal,h.proof);queueMicrotask(()=>controller.abort());await assert.rejects(pending,/取消/);assert.equal(h.$('textarea').val(),'');assert.equal(h.sentPrompts.length,1);
});

test('cancellation by an input handler prevents the corrective send',async t=>{
 let armed=false;const controller=new AbortController();const h=await prime(t,{afterFill:()=>{if(armed)controller.abort();}});armed=true;await assert.rejects(h.adapter.submit(reviewPrompt,requestId,controller.signal,h.proof),/取消/);assert.equal(h.sentPrompts.length,1);
});

test('a review prompt changed after input still fails the existing exact-text check',async t=>{
 let armed=false;const h=await prime(t,{afterFill:({$})=>{if(armed)$('textarea').val(reviewPrompt+' changed');}});armed=true;await assert.rejects(h.adapter.submit(reviewPrompt,requestId,signal(),h.proof),/不一致/);assert.equal(h.sentPrompts.length,1);
});
