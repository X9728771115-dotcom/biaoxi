const electron=require('electron');const {app,BrowserWindow,webContents}=electron;
const {mkdtemp,mkdir,rm}=require('node:fs/promises');const {join}=require('node:path');const {tmpdir}=require('node:os');const {pathToFileURL}=require('node:url');const assert=require('node:assert/strict');
const {installDesktopWebChat}=require('../src/desktop/web-chat.cjs');
let folder,service,bridge,main,exitCode=0;
app.setName('标析网页窗口验证');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 try {
  folder=await mkdtemp(join(tmpdir(),'biaoxi-chat-desktop-'));await mkdir(join(folder,'session'),{recursive:true});app.setPath('userData',join(folder,'session'));
  const {createService}=await import(pathToFileURL(join(__dirname,'../src/server/service.js')).href);service=await createService({dataDir:join(folder,'data')});
  main=new BrowserWindow({show:false,webPreferences:{preload:join(__dirname,'../src/desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});await main.loadURL(service.url);
  bridge=installDesktopWebChat({electron,service,getMainWindow:()=>main});
  const opened=await main.webContents.executeJavaScript('window.biaoxiWebChat.open({provider:"deepseek"})');assert.equal(opened.ok,true);
  const chat=BrowserWindow.getAllWindows().find(win=>win!==main);assert.ok(chat);
  const context=await chat.webContents.executeJavaScript('window.biaoxiWebChat.context()');assert.equal(context.provider,'deepseek');assert.equal(context.reportId,null);assert.equal(context.files.length,0);
  const rect=await chat.webContents.executeJavaScript('(()=>{const r=document.getElementById("chat-viewport").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()');
  const bounds=await chat.webContents.executeJavaScript('window.biaoxiWebChat.bounds('+JSON.stringify(rect)+')');assert.equal(bounds.ok,true);assert.ok(rect.y>140);assert.ok(rect.height>200);
  const remote=webContents.getAllWebContents().find(wc=>wc!==main.webContents&&wc!==chat.webContents&&wc.getType()!=='devtools');assert.ok(remote,'remote view exists');
  // Wait for normal public login page, without logging in or using a account.
  await Promise.race([new Promise(resolve=>remote.once('did-finish-load',resolve)),new Promise(resolve=>setTimeout(resolve,12000))]);
  const remoteBridge=await remote.executeJavaScript('typeof window.biaoxiWebChat');assert.equal(remoteBridge,'undefined');
  const remotePrefs=remote.getLastWebPreferences();assert.equal(remotePrefs.nodeIntegration,false);assert.equal(remotePrefs.sandbox,true);assert.equal(remotePrefs.contextIsolation,true);assert.equal(remotePrefs.webSecurity,true);
  await assert.rejects(main.webContents.executeJavaScript('window.biaoxiWebChat.open({provider:"custom",url:"file:///etc/passwd"})'));
  console.log(JSON.stringify({result:'PASS',actualLocalPreload:true,internalWebContentsView:true,viewBoundsCorrect:true,noRemoteBridge:true,sandbox:true,providerURL:remote.getURL(),loggedInUploadAndCapture:'NOT_RUN'}));
 }catch(error){console.error(error.stack);exitCode=1;}
 finally {if(bridge)await bridge.close();if(service)await service.close();if(folder)await rm(folder,{recursive:true,force:true});app.exit(exitCode);}
});
