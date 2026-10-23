const {app,BrowserWindow,dialog,safeStorage}=require('electron');
const {join,isAbsolute}=require('node:path');const {mkdirSync}=require('node:fs');const {readFile,writeFile,unlink,mkdir}=require('node:fs/promises');
app.setName('标析开源试用版');
const developmentDataDir=!app.isPackaged&&process.env.BIAOXI_USER_DATA_DIR;
if(developmentDataDir&&!isAbsolute(developmentDataDir))throw new Error('BIAOXI_USER_DATA_DIR 必须是绝对路径');
if(developmentDataDir)mkdirSync(developmentDataDir,{recursive:true});
app.setPath('userData',developmentDataDir||join(app.getPath('appData'),'标析开源试用版'));
let service,window,webChat,quitting=false;
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
 app.whenReady().then(async()=>{
  try{
   const dataDir=join(app.getPath('userData'),'data');await mkdir(dataDir,{recursive:true});const keyFile=join(dataDir,'credential.bin');
   const vault={async get(){try{if(!safeStorage.isEncryptionAvailable())return '';return safeStorage.decryptString(await readFile(keyFile));}catch(e){if(e.code==='ENOENT')return '';throw new Error('系统密钥存储无法读取，请重新保存接口密钥');}},async set(key){if(!safeStorage.isEncryptionAvailable())throw new Error('系统安全存储不可用，密钥未保存');if(!key){await unlink(keyFile).catch(()=>{});return;}await writeFile(keyFile,safeStorage.encryptString(key),{mode:0o600});}};
   const {createService}=await import('../server/service.js');service=await createService({dataDir,secretVault:vault});
   if(developmentDataDir)console.log('标析隔离桌面服务：'+service.url);
   webChat=require('./web-chat.cjs').installDesktopWebChat({electron:require('electron'),service,getMainWindow:()=>window});createWindow();
  }catch(e){dialog.showErrorBox('标析启动失败',e.message);app.quit();}
 });
 function createWindow(){window=new BrowserWindow({width:1440,height:1000,minWidth:1050,minHeight:720,title:'标析开源试用版 · 招标文件分析助手',backgroundColor:'#ffffff',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,target)=>{try{if(new URL(event.url||target).origin!==service.url)event.preventDefault();}catch{event.preventDefault();}});window.webContents.session.setPermissionRequestHandler((webContents,permission,callback)=>callback(false));window.loadURL(service.url);window.on('closed',()=>window=null);}
 app.on('activate',()=>{if(!window&&service)createWindow();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if(service&&!quitting){event.preventDefault();quitting=true;Promise.resolve(webChat?.close()).then(()=>service.close()).finally(()=>app.quit());}});
}
