import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {load} from 'cheerio';
const require=createRequire(import.meta.url);
const {createBrowserAdapter}=require('../src/desktop/web-chat-dom.cjs');
const {selectCurrentReply}=require('../src/desktop/web-chat.cjs');

// Exercise the production browser-evaluated code against an HTML selector/tree
// implementation. Layout is deliberately minimal; no provider or UI is opened.
function fixture(html){
 const $=load(html),cache=new WeakMap(),ordered=$('*').toArray();
 const rendered=node=>{
  if(node.type==='text')return node.data||'';
  if(node.name==='br')return '\n';
  const children=node.children||[];let value='';
  for(let i=0;i<children.length;i++){
   const child=children[i],block=['div','p','article'].includes(child.name);
   if(block&&value&&!value.endsWith('\n'))value+='\n';
   value+=rendered(child);
   if(block&&i<children.length-1&&!value.endsWith('\n'))value+='\n';
  }return value;
 };
 const wrap=node=>{
  if(!node)return null;if(cache.has(node))return cache.get(node);
  const value={
   get hidden(){return $(node).attr('hidden')!==undefined;},
   get disabled(){return $(node).attr('disabled')!==undefined;},
   get innerText(){return rendered(node);},get textContent(){return $(node).text();},
   get parentElement(){return wrap(node.parent?.type==='tag'?node.parent:null);},
   get classList(){const values=($(node).attr('class')||'').split(/\s+/);values.contains=name=>values.includes(name);return values;},
   getAttribute:name=>$(node).attr(name)??null,
   getClientRects:()=>$(node).attr('hidden')!==undefined?[]:[{x:0,y:0,width:100,height:20}],
   matches:selector=>$(node).is(selector),
   closest:selector=>wrap($(node).closest(selector).get(0)),
   querySelectorAll:selector=>$(node).find(selector).toArray().map(wrap),
   querySelector:selector=>wrap($(node).find(selector).get(0)),
   contains:other=>other===value||!!other&&$.contains(node,other.raw),
   compareDocumentPosition:other=>ordered.indexOf(node)<ordered.indexOf(other.raw)?4:2,
   raw:node,
  };cache.set(node,value);return value;
 };
 const context=vm.createContext({document:{readyState:'complete',querySelectorAll:selector=>$(selector).toArray().map(wrap)},location:{href:'https://www.doubao.com/chat/test'},getComputedStyle:()=>({visibility:'visible',display:'block',opacity:'1'}),Node:{DOCUMENT_POSITION_FOLLOWING:4},console});
 return createBrowserAdapter({isDestroyed:()=>false,getURL:()=>context.location.href,executeJavaScript:source=>Promise.resolve(vm.runInContext(source,context))},'doubao');
}
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const record=id=>JSON.stringify({requestId:'capture-v9',type:'category',id,summary:id});
const marker='<article data-role="user"><div data-testid="message_text_content">请分析 capture-v9</div></article>';
const assistant=(chunks,{copy=true,streaming=false}={})=>`<article data-testid="receive_message" data-message-role="assistant"><div data-testid="message_text_content"${streaming?' data-streaming="true"':''}>${chunks.map(chunk=>`<div class="flow-markdown-body">${escape(chunk)}</div>`).join('')}</div>${copy?'<div data-testid="message_action_bar"><button data-testid="message_action_copy">复制</button></div>':''}</article>`;

test('one assistant message retains every markdown fragment in order',async()=>{
 const adapter=fixture(marker+assistant([record('payment'),record('deposit'),record('commitment')]));
 const snapshot=await adapter.snapshot('capture-v9');
 assert.equal(snapshot.assistantIds.length,1);
 assert.equal(selectCurrentReply({assistantIds:[]},snapshot,'capture-v9'),[record('payment'),record('deposit'),record('commitment')].join('\n'));
});

test('nested profile matches are captured once without losing preceding prose or records',async()=>{
 const html=`${marker}<article data-message-role="assistant"><div data-testid="message_text_content"><div class="flow-markdown-body">${escape(record('payment'))}<div class="flow-markdown-body">${escape(record('deposit'))}</div></div><div class="flow-markdown-body">${escape(record('commitment'))}</div></div><button aria-label="复制">复制</button></article>`;
 const snapshot=await fixture(html).snapshot('capture-v9');
 const answer=selectCurrentReply({assistantIds:[]},snapshot,'capture-v9');
 assert.ok(answer.includes(record('payment')),'outer paragraph must not be dropped');
 assert.equal(answer.split(record('deposit')).length-1,1);
 assert.ok(answer.indexOf(record('payment'))<answer.indexOf(record('deposit')));
 assert.ok(answer.indexOf(record('deposit'))<answer.indexOf(record('commitment')));
});

test('fragments from separate assistant messages remain separate replies',async()=>{
 const snapshot=await fixture(marker+assistant([record('payment')])+assistant([record('commitment')])).snapshot('capture-v9');
 assert.equal(snapshot.assistantIds.length,2);
 assert.equal(selectCurrentReply({assistantIds:[]},snapshot,'capture-v9'),record('commitment'));
 assert.ok(!snapshot.answers.at(-1).includes(record('payment')));
});

test('unknown shared wrappers cannot be used to concatenate separate fragments',async()=>{
 const html=`${marker}<section><div class="flow-markdown-body">${escape(record('payment'))}</div><div class="flow-markdown-body">${escape(record('commitment'))}</div><button aria-label="复制">复制</button></section>`;
 const snapshot=await fixture(html).snapshot('capture-v9');
 assert.equal(snapshot.assistantIds.length,2);
 assert.equal(snapshot.answers[0],record('payment'));
 assert.equal(snapshot.answers[1],record('commitment'));
});

test('legacy whole-message matches cannot add copy controls to an otherwise exact reply',async()=>{
 const html=`${marker}<article data-testid="message_block" data-role="assistant"><div class="flow-markdown-body">${escape(record('payment'))}</div><div class="flow-markdown-body">${escape(record('commitment'))}</div><button aria-label="复制">复制</button></article>`;
 const snapshot=await fixture(html).snapshot('capture-v9');
 assert.equal(snapshot.assistantIds.length,1);
 assert.equal(selectCurrentReply({assistantIds:[]},snapshot,'capture-v9'),record('payment')+'\n'+record('commitment'));
});

test('old answers and user markdown never become fragments of this answer',async()=>{
 const old=assistant(['old task capture-v9']),user='<article data-role="user"><div class="flow-markdown-body">user fake capture-v9</div></article>';
 const snapshot=await fixture(old+marker+user+assistant([record('payment'),record('commitment')])).snapshot('capture-v9');
 assert.equal(snapshot.assistantIds.length,1);
 const answer=selectCurrentReply({assistantIds:[]},snapshot,'capture-v9');
 assert.ok(!answer.includes('old task'));assert.ok(!answer.includes('user fake'));
});

test('an unrelated latest assistant message cannot borrow the request id from an earlier answer',async()=>{
 const snapshot=await fixture(marker+assistant([record('payment')])+assistant(['other task'])).snapshot('capture-v9');
 assert.equal(selectCurrentReply({assistantIds:[]},snapshot,'capture-v9'),null);
});

test('the same completed assistant owner keeps its baseline identity across snapshots',async()=>{
 const adapter=fixture(marker+assistant([record('payment'),record('commitment')]));
 const baseline=await adapter.snapshot('capture-v9'),later=await adapter.snapshot('capture-v9');
 assert.equal(later.assistantIds[0],baseline.assistantIds[0]);
 assert.equal(selectCurrentReply(baseline,later,'capture-v9'),null);
});

test('a copy action on an older message does not complete the current message',async()=>{
 const snapshot=await fixture(assistant(['old'])+marker+assistant([record('payment'),record('commitment')],{copy:false})).snapshot('capture-v9');
 assert.equal(snapshot.completionVisible,false);
 assert.equal(selectCurrentReply({assistantIds:[]},snapshot,'capture-v9'),null);
});

test('streaming on a shared message body blocks capture of all its fragments',async()=>{
 const snapshot=await fixture(marker+assistant([record('payment'),record('commitment')],{streaming:true})).snapshot('capture-v9');
 assert.equal(snapshot.generating,true);
 assert.equal(selectCurrentReply({assistantIds:[]},snapshot,'capture-v9'),null);
});

test('a combined reply above the limit fails closed instead of saving its last fragment',async()=>{
 const snapshot=await fixture(marker+assistant(['capture-v9 '+ 'x'.repeat(600000),'capture-v9 '+ 'y'.repeat(600000)])).snapshot('capture-v9');
 assert.equal(snapshot.stage,'oversized');
 assert.equal(snapshot.answers.length,0);
 assert.equal(selectCurrentReply({assistantIds:[]},snapshot,'capture-v9'),null);
});
