import vm from 'node:vm';
import {load} from 'cheerio';
import {createRequire} from 'node:module';
import {basename} from 'node:path';
const require=createRequire(import.meta.url);
const {createBrowserAdapter}=require('../../src/desktop/web-chat-dom.cjs');

// HTML-backed selector/layout fixture: executes the unchanged production DOM
// actions and native-click path without contacting a provider or opening UI.
export function modeFixture({mode='豆包 快速',extraMode='',menu='<div role="menuitem" id="fast">豆包 快速</div><div role="menuitem" id="expert">豆包 专家</div>',menuOpen=false,alerts='',cover='',keepFast=false,afterModeClick=()=>{},afterExpertClick=()=>{},afterFill=()=>{},afterUploadTrigger=()=>{},afterSend=()=>{},beforeAction=()=>{},afterAction=()=>{},messages='',hang=false,provider='doubao'}={}){
 const $=load(`<main><div id="messages">${messages}</div><button id="mode">${mode}</button>${extraMode}<textarea></textarea><button id="upload" data-testid="upload_file_button">上传文件</button><button id="send" data-testid="send_button">发送</button><div id="menu" role="menu"${menuOpen?'':' hidden'}>${menu}</div>${alerts}</main>`),cache=new WeakMap(),rects=new WeakMap(),clicks=[],sentPrompts=[],fileInputReceived=[],debuggerListeners=new Set();
 let debuggerAttached=false;
 let next=0,url=provider==='doubao'?'https://www.doubao.com/chat/test':'https://chat.deepseek.com/';
 class TextArea {get value(){return $(this.raw).val()||'';}set value(value){$(this.raw).val(value);}}
 class Input extends TextArea {}
 const visible=node=>{for(let at=node;at;at=at.parent)if(at.type==='tag'&&($(at).attr('hidden')!==undefined||$(at).attr('style')?.includes('display:none')))return false;return true;};
 const rect=node=>{if(!rects.has(node))rects.set(node,{left:10,top:10+next++*30,right:130,bottom:30+(next-1)*30});return rects.get(node);};
 const wrap=node=>{
  if(!node)return null;if(cache.has(node))return cache.get(node);
  const value={raw:node,get hidden(){return $(node).attr('hidden')!==undefined;},get disabled(){return $(node).attr('disabled')!==undefined;},get innerText(){return $(node).text();},get textContent(){return $(node).text();},get parentElement(){return wrap(node.parent?.type==='tag'?node.parent:null);},get classList(){const values=($(node).attr('class')||'').split(/\s+/);values.contains=name=>values.includes(name);return values;},getAttribute:name=>$(node).attr(name)??null,getClientRects:()=>visible(node)?[rect(node)]:[],getBoundingClientRect:()=>rect(node),matches:selector=>$(node).is(selector),closest:selector=>wrap($(node).closest(selector).get(0)),querySelectorAll:selector=>$(node).find(selector).toArray().map(wrap),querySelector:selector=>wrap($(node).find(selector).get(0)),contains:other=>other===value||!!other&&$.contains(node,other.raw),compareDocumentPosition:other=>node===other.raw?0:$('*').toArray().indexOf(node)<$('*').toArray().indexOf(other.raw)?4:2,click:()=>activate(value)};
  if(node.name==='textarea'){Object.setPrototypeOf(value,TextArea.prototype);value.focus=()=>{};value.dispatchEvent=event=>{if(event.type==='input')afterFill({$});};}
  cache.set(node,value);return value;
 };
 const targetAt=(x,y)=>{for(const node of $('*').toArray()){const r=rects.get(node);if(visible(node)&&r&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return wrap(node);}return null;};
 const context=vm.createContext({document:{readyState:'complete',querySelectorAll:selector=>$(selector).toArray().map(wrap),elementFromPoint:(x,y)=>{const hit=targetAt(x,y);return hit&&cover&&$(hit.raw).is(cover)?wrap($('main').get(0)):hit;}},location:{get href(){return url;}},getComputedStyle:()=>({visibility:'visible',display:'block',opacity:'1'}),innerWidth:1200,innerHeight:2000,Node:{DOCUMENT_POSITION_FOLLOWING:4},HTMLTextAreaElement:TextArea,HTMLInputElement:Input,Event:class{constructor(type){this.type=type;}},console});
 const setURL=value=>url=value;
 const activate=target=>{if(!target)return;const id=$(target.raw).attr('id');clicks.push(id||'unknown');
  if(id==='mode'){$('#menu').removeAttr('hidden');afterModeClick({$,setURL:value=>url=value});}
  if(id==='expert'){if(!keepFast){$('#mode').text('豆包 专家');$('#menu').attr('hidden','');}afterExpertClick({$,setURL:value=>url=value});}
  if(id==='upload'){afterUploadTrigger({$,setURL:value=>url=value});for(const listener of debuggerListeners)listener({},'Page.fileChooserOpened',{backendNodeId:7});}
  if(id==='send'){const prompt=$('textarea').val();sentPrompts.push(prompt);$('textarea').val('');$('[data-testid="file_card"]').remove();afterSend({$,prompt,sentPrompts,setURL});}
 };
 const webContents={isDestroyed:()=>false,getURL:()=>url,executeJavaScript:source=>{
  if(hang)return new Promise(()=>{});const action=[...source.matchAll(/\},"([a-z-]+)",\{/g)].at(-1)?.[1];beforeAction({action,$,setURL});const result=vm.runInContext(source,context);afterAction({action,$,setURL,result});return Promise.resolve(result);
 },sendInputEvent:event=>{if(event.type==='mouseUp')activate(targetAt(event.x,event.y));},debugger:{isAttached:()=>debuggerAttached,attach:()=>{debuggerAttached=true;},detach:()=>{debuggerAttached=false;},on:(_event,listener)=>debuggerListeners.add(listener),removeListener:(_event,listener)=>debuggerListeners.delete(listener),sendCommand:async(method,params)=>{
  if(method==='DOM.setFileInputFiles'){fileInputReceived.push(...params.files);for(const path of params.files)$('main').append(`<div data-testid="file_card">${basename(path)}</div>`);}
 }}};
 const adapter=createBrowserAdapter(webContents,provider,{qualityModeTimeoutMs:60,qualityModePollMs:5});
 return {adapter,clicks,$,fileInputReceived,sentPrompts,setURL};
}
