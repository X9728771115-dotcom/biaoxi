// Local fixture integration test. Does not contact, log in to, or upload to an AI provider.
const {app,BrowserWindow}=require('electron');
const http=require('node:http');const assert=require('node:assert/strict');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');const {join}=require('node:path');const {tmpdir}=require('node:os');
const {createBrowserAdapter}=require('../src/desktop/web-chat-dom.cjs');
const {createChatRunner}=require('../src/desktop/web-chat.cjs');
let win,server,folder,resultCode=0;
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 try {
  folder=await mkdtemp(join(tmpdir(),'biaoxi-chat-smoke-'));const filePath=join(folder,'主文件.txt');await writeFile(filePath,'供应商须提供有效营业执照。');
  const html=`<!doctype html><meta charset="UTF-8"><style>button,textarea{display:block}.message{margin:10px}</style><main><div id="messages"><article data-message-author-role="assistant" data-message-id="old"><div class="flow-markdown-body">旧项目回答</div><button aria-label="复制">复制</button></article></div><button data-testid="upload_file_button">上传文件</button><input type="file" id="file" hidden><div id="attachments"></div><textarea placeholder="发送消息"></textarea><button data-testid="send_button">发送</button></main><script>
  document.querySelector('[data-testid="upload_file_button"]').onclick=()=>document.querySelector('#file').click();
  document.querySelector('#file').onchange=()=>{if(window.ignoreUpload)return;const node=document.createElement('div');node.dataset.testid='file_card';node.textContent=document.querySelector('#file').files[0].name+(window.uploadError?' 上传失败':'');document.querySelector('#attachments').append(node);};
  document.querySelector('[data-testid="send_button"]').onclick=()=>{
   const prompt=document.querySelector('textarea').value;window.sentPrompt=prompt;
   const user=document.createElement('article');user.dataset.messageAuthorRole='user';user.textContent=prompt;document.querySelector('#messages').append(user);document.querySelector('textarea').value='';
   const answer=document.createElement('article');answer.dataset.messageAuthorRole='assistant';answer.dataset.messageId='new';answer.innerHTML='<div class="flow-markdown-body">正在分析</div>';document.querySelector('#messages').append(answer);
   const stop=document.createElement('button');stop.dataset.testid='stop_button';stop.textContent='停止生成';document.querySelector('main').append(stop);stop.onclick=()=>stop.remove();
   setTimeout(()=>{answer.querySelector('div').textContent=JSON.stringify({requestId:prompt.match(/REQ:([a-zA-Z0-9-]+)/)[1],categories:[],outputs:{}});stop.remove();answer.insertAdjacentHTML('beforeend','<button aria-label="复制">复制</button>');},130);
  };
  </script>`;
  server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});await win.loadURL(origin);
  const adapter=createBrowserAdapter(win.webContents,'doubao',{isAllowedURL:url=>new URL(url).origin===origin,uploadTimeoutMs:1000});
  const initial=await adapter.inspect();assert.equal(initial.ready,true);assert.ok(initial.diagnostics,'inspection must explain which controls were found');assert.equal(initial.diagnostics.editorCount,1);assert.equal(initial.diagnostics.authentication,'unconfirmed');
  const states=[];let saved;
  const runner=createChatRunner({adapter,prepare:async()=>({requestId:'smoke-1',prompt:'请全文分析 REQ:smoke-1',files:[{path:filePath,fileName:'主文件.txt'}]}),complete:async(id,text)=>{saved={id,text};return {webChat:{status:'partial'}};},cancel:async()=>{},onState:s=>states.push(s),pollMs:20,stableMs:60,timeoutMs:1800});
  await runner.start();assert.equal(states.at(-1).stage,'captured',JSON.stringify(states));assert.equal(saved.id,'smoke-1');assert.match(saved.text,/smoke-1/);
  const uploaded=await win.webContents.executeJavaScript('document.querySelector("#file").files[0].name');assert.equal(uploaded,'主文件.txt');
  const sent=await win.webContents.executeJavaScript('window.sentPrompt');assert.equal(sent,'请全文分析 REQ:smoke-1');
  const inspector=await adapter.inspect();assert.equal(inspector.ready,false);assert.match(inspector.message,/附件|文件/);
  // A nonempty draft must never be overwritten or sent accidentally.
  await win.webContents.executeJavaScript('document.querySelector("textarea").value="用户未发送的草稿"');
  await assert.rejects(adapter.submit('REQ:another','another',new AbortController().signal),/草稿|输入框/);
  await win.webContents.executeJavaScript('document.querySelector("textarea").value=""');
  const withExistingFile=await adapter.inspect();assert.equal(withExistingFile.ready,false);assert.match(withExistingFile.message,/附件|文件/);
  await win.webContents.executeJavaScript('document.querySelector("#attachments").innerHTML="<div data-testid=file_card>主文件.txt.bak</div>";window.ignoreUpload=true');
  const guard=createBrowserAdapter(win.webContents,'doubao',{isAllowedURL:url=>new URL(url).origin===origin,uploadTimeoutMs:650});
  await assert.rejects(guard.upload({path:filePath,fileName:'主文件.txt'},new AbortController().signal),/未确认|已有|附件|上传/);
  await win.webContents.executeJavaScript('document.querySelector("#attachments").innerHTML="";document.querySelector("#file").value="";window.ignoreUpload=false;window.uploadError=true');
  await assert.rejects(guard.upload({path:filePath,fileName:'主文件.txt'},new AbortController().signal),/失败|错误/);
  await win.webContents.executeJavaScript('document.querySelector("#attachments").innerHTML="";document.querySelector("#file").value="";window.uploadError=false');
  await guard.upload({path:filePath,fileName:'主文件.txt'},new AbortController().signal);
  await win.webContents.executeJavaScript('document.querySelector("#attachments").insertAdjacentHTML("beforeend","<div data-testid=file_card>其他项目.txt</div>")');
  await assert.rejects(guard.submit('REQ:guard','guard',new AbortController().signal),/附件|文件.*变化/);
  await win.webContents.executeJavaScript('document.querySelector("#attachments").lastElementChild.remove();window.sentPrompt=undefined;document.querySelector("textarea").addEventListener("input",()=>document.querySelector("#attachments").insertAdjacentHTML("beforeend","<div data-testid=file_card>其他项目.txt</div>"),{once:true})');
  await assert.rejects(guard.submit('REQ:late-added','late-added',new AbortController().signal),/附件|文件.*变化/);
  assert.equal(await win.webContents.executeJavaScript('window.sentPrompt'),undefined);
  await win.webContents.executeJavaScript('document.querySelector("#attachments").lastElementChild.remove();document.querySelector("textarea").value="";document.querySelector("textarea").addEventListener("input",()=>document.querySelector("#attachments").innerHTML="",{once:true})');
  await assert.rejects(guard.submit('REQ:late-removed','late-removed',new AbortController().signal),/附件|文件.*变化/);
  assert.equal(await win.webContents.executeJavaScript('window.sentPrompt'),undefined);
  // After the user clears the failed composer, the same adapter can retry.
  await win.webContents.executeJavaScript('document.querySelector("textarea").value="";document.querySelector("#file").value=""');
  guard.reset();await guard.upload({path:filePath,fileName:'主文件.txt'},new AbortController().signal);
  // Only an unambiguous local-file menu item may open the native file chooser.
  await win.loadURL(origin);
  await win.webContents.executeJavaScript(`document.querySelector('#file').remove();document.querySelector('[data-testid="upload_file_button"]').onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">从本地上传</button>';menu.firstElementChild.onclick=()=>{window.menuClicks=(window.menuClicks||0)+1;const input=document.createElement('input');input.type='file';input.hidden=true;input.onchange=()=>{const card=document.createElement('div');card.dataset.testid='file_card';card.textContent=input.files[0].name;document.querySelector('#attachments').append(card);};document.body.append(input);menu.remove();input.click();};document.body.append(menu);};true;`);
  const menuAdapter=createBrowserAdapter(win.webContents,'doubao',{isAllowedURL:url=>new URL(url).origin===origin,uploadTimeoutMs:1000});
  await menuAdapter.upload({path:filePath,fileName:'主文件.txt'},new AbortController().signal);
  assert.equal(await win.webContents.executeJavaScript('window.menuClicks'),1);
  await win.loadURL(origin);
  await win.webContents.executeJavaScript(`document.querySelector('#file').remove();document.querySelector('[data-testid="upload_file_button"]').onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">从本地上传</button><button role="menuitem">从本地上传</button>';for(const item of menu.children)item.onclick=()=>window.unexpectedMenuClick=true;document.body.append(menu);};true;`);
  const ambiguousMenu=createBrowserAdapter(win.webContents,'doubao',{isAllowedURL:url=>new URL(url).origin===origin,uploadTimeoutMs:1000});
  await assert.rejects(ambiguousMenu.upload({path:filePath,fileName:'主文件.txt'},new AbortController().signal),/唯一|多个|歧义/);
  assert.equal(await win.webContents.executeJavaScript('window.unexpectedMenuClick'),undefined);
  await win.loadURL(origin);
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="upload_file_button"]').onclick=()=>{};document.querySelector('#file').onchange=()=>window.unrelatedInputChanged=true;true;`);
  const noChooser=createBrowserAdapter(win.webContents,'doubao',{isAllowedURL:url=>new URL(url).origin===origin,uploadTimeoutMs:150});
  await assert.rejects(noChooser.upload({path:filePath,fileName:'主文件.txt'},new AbortController().signal),/选择|上传|适配/);
  assert.equal(await win.webContents.executeJavaScript('window.unrelatedInputChanged'),undefined,'must never set an unrelated hidden file input');
  // A login gate must stop before upload or send.
  await win.webContents.executeJavaScript('document.body.innerHTML="<input placeholder=请输入手机号><input placeholder=请输入验证码><button>登录</button>"');
  const login=await adapter.inspect();assert.equal(login.ready,false);assert.equal(login.stage,'login');
  console.log(JSON.stringify({result:'PASS',realFileUpload:true,automaticSubmit:true,streamingReplyCaptured:true,oldReplyRejected:true,draftPreserved:true,loginGate:true,substringReceiptRejected:true,cardUploadErrorRejected:true,extraAttachmentRejected:true,attachmentChangedDuringFillRejected:true,uniqueUploadMenu:true,ambiguousUploadMenuRejected:true,safeControlDiagnostics:true,providerLoginAndUpload:'NOT_RUN'}));
 }catch(error){console.error(error.stack);resultCode=1;}
 finally {if(win&&!win.isDestroyed())win.destroy();if(server)await new Promise(resolve=>server.close(resolve));if(folder)await rm(folder,{recursive:true,force:true});app.exit(resultCode);}
});
