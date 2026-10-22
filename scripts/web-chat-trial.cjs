// Standalone desktop trial launcher; keeps the running older 标析 instance untouched.
const electron=require('electron');const {app,BrowserWindow}=electron;
const {join}=require('node:path');const {mkdir,readFile,writeFile}=require('node:fs/promises');const {pathToFileURL}=require('node:url');
const {installDesktopWebChat}=require('../src/desktop/web-chat.cjs');
const folder=join(__dirname,'../.data/web-ai-trial');
app.setName('标析网页AI试验');app.setPath('userData',join(folder,'desktop-session'));
let service,bridge,main,quitting=false;
app.whenReady().then(async()=>{
 try {
  await mkdir(folder,{recursive:true});const {createService}=await import(pathToFileURL(join(__dirname,'../src/server/service.js')).href);
  service=await createService({dataDir:join(folder,'desktop-data')});
  const bootstrap=await(await fetch(service.url+'/api/bootstrap')).json(),headers={'X-Biaoxi-Token':bootstrap.token};
  let reports=await service.store.listReports();
  if(!reports.length){
   const path=join(__dirname,'../tests/fixtures/综合招标-测试用途.pdf');
   const form=new FormData();form.append('role','tender');form.append('files',new Blob([await readFile(path)]),'综合招标-测试用途.pdf');
   const uploaded=await(await fetch(service.url+'/api/documents',{method:'POST',headers,body:form})).json();
   if(!uploaded.documents?.length)throw new Error('试验样本未读取');
   const accepted=await(await fetch(service.url+'/api/analyses',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({documentIds:[uploaded.documents[0].id],mode:'offline'})})).json();
   const deadline=Date.now()+120000;
   while(Date.now()<deadline){const job=await(await fetch(service.url+'/api/jobs/'+accepted.jobId,{headers})).json();if(job.status==='completed')break;if(['failed','cancelled'].includes(job.status))throw new Error(job.error);await new Promise(resolve=>setTimeout(resolve,200));}
   reports=await service.store.listReports();if(!reports.length)throw new Error('本地试验初稿未生成');
  }
  main=new BrowserWindow({width:1440,height:1000,title:'标析 · 网页AI试验版',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'../src/desktop/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  main.webContents.setWindowOpenHandler(()=>({action:'deny'}));main.webContents.on('will-navigate',(event,target)=>{if(new URL(event.url||target).origin!==service.url)event.preventDefault();});
  bridge=installDesktopWebChat({electron,service,getMainWindow:()=>main});await main.loadURL(service.url);
  await writeFile(join(folder,'desktop-runtime.json'),JSON.stringify({pid:process.pid,url:service.url,reportId:reports[0].id,updatedAt:new Date().toISOString()},null,2));
  await bridge.open({provider:process.env.BIAOXI_TRIAL_PROVIDER==='deepseek'?'deepseek':'doubao',reportId:reports[0].id});
  console.log('标析网页AI试验窗口已打开；本地初稿14类与四输出保留。实际登录与上传还未验证。');
 }catch(error){console.error(error.stack);app.exit(1);}
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(service&&!quitting){event.preventDefault();quitting=true;Promise.resolve(bridge?.close()).then(()=>service.close()).finally(()=>app.quit());}});
