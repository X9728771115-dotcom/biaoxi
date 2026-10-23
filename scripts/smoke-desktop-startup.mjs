// Exercise final installer artifacts in a disposable native runner. No model
// credentials, real documents, GUI automation or existing profile are used.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,readdir,mkdtemp,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {verifyDesktopBundle} from './verify-desktop-bundle.mjs';

const run=promisify(execFile),[platform,arch]=process.argv.slice(2);
assert.ok(process.env.CI==='true'||process.env.BIAOXI_PACKAGE_SMOKE==='1','Requires a disposable CI runner or explicit BIAOXI_PACKAGE_SMOKE=1');
assert.equal(platform,process.platform);assert.equal(arch,process.arch);
assert.ok(platform==='darwin'||platform==='win32');
const product='标析开源试用版',pkg=JSON.parse(await readFile('package.json','utf8'));
const sourceCommit=(await run('git',['rev-parse','HEAD'])).stdout.trim();
const profile=platform==='darwin'?join(homedir(),'Library','Application Support',product):join(process.env.APPDATA,product);
const originalProfile=platform==='darwin'?join(homedir(),'Library','Application Support','标析'):join(process.env.APPDATA,'标析');
async function exists(path){try{await access(path);return true;}catch{return false;}}
async function snapshot(root){
 const entries=[];
 async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){const p=join(folder,e.name);if(e.isDirectory())await walk(p);else if(e.isFile())entries.push([p.slice(root.length),createHash('sha256').update(await readFile(p)).digest('hex')]);}}
 if(await exists(root))await walk(root);return JSON.stringify(entries.sort());
}
assert.equal(await exists(profile),false,'Refusing to reuse any existing open-source edition profile');
const originalBefore=await snapshot(join(originalProfile,'data'));
const temp=await mkdtemp(join(tmpdir(),'biaoxi-installer-smoke-'));
let mounted=false,child,executable,appDir,uninstaller;
async function stop(){
 if(!child||child.exitCode!==null||child.signalCode!==null){child=null;return;}
 const p=child;child=null;
 if(platform==='win32')await run('taskkill',['/PID',String(p.pid),'/T','/F']).catch(()=>{});else p.kill('SIGTERM');
 if(p.exitCode===null&&p.signalCode===null)await Promise.race([new Promise(r=>p.once('exit',r)),delay(10000)]);
 assert.ok(p.exitCode!==null||p.signalCode!==null,'Owned application process did not stop');
}
async function start(){
 const environment={...process.env,BIAOXI_USER_DATA_DIR:originalProfile};delete environment.ELECTRON_RUN_AS_NODE;
 child=spawn(executable,[],{stdio:['ignore','pipe','pipe'],env:environment});
 let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);
 let failure;child.on('error',e=>failure=e);
 for(let i=0;i<120;i++){
  if(failure)throw failure;
  if(child.exitCode!==null||child.signalCode!==null)throw new Error('Packaged application exited before ready: '+output.slice(-1800));
  try{
   const args=platform==='darwin'?['-nP','-a','-p',String(child.pid),'-iTCP','-sTCP:LISTEN','-Fn']:['-NoProfile','-NonInteractive','-Command',`Get-NetTCPConnection -OwningProcess ${child.pid} -State Listen -ErrorAction SilentlyContinue | Where-Object LocalAddress -eq '127.0.0.1' | Select-Object -ExpandProperty LocalPort`];
   const raw=(await run(platform==='darwin'?'lsof':'powershell.exe',args,{timeout:15000})).stdout;
   const ports=platform==='darwin'?[...raw.matchAll(/^n127\.0\.0\.1:(\d+)$/gm)].map(x=>x[1]):raw.trim().split(/\s+/).filter(x=>/^\d+$/.test(x));
   for(const port of ports){
    const url='http://127.0.0.1:'+port;
    const response=await fetch(url+'/api/bootstrap',{signal:AbortSignal.timeout(2000)});
    if(!response.ok)continue;
    const boot=await response.json();assert.equal(boot.version,pkg.version);assert.equal(boot.desktop,true);assert.equal(boot.categories.length,14);
    assert.ok(await exists(join(profile,'data')),'Expected independent edition data directory was not created');
    return {url,boot};
   }
  }catch(e){if(e.code==='ERR_ASSERTION')throw e;}
  await delay(500);
 }
 throw new Error('Packaged desktop service did not become ready: '+output.slice(-1800));
}
function client({url,boot}){
 return async(path,options={})=>{const response=await fetch(url+path,{...options,headers:{'X-Biaoxi-Token':boot.token,...options.headers},signal:AbortSignal.timeout(60000)});assert.ok(response.ok,`${path}: HTTP ${response.status}`);return response;};
}
try{
 if(platform==='darwin'){
  const dmg=resolve(`dist/biaoxi-oss-${pkg.version}-${arch}-mac.dmg`);
  await mkdir(join(temp,'mounted'));
  await run('hdiutil',['attach',dmg,'-readonly','-nobrowse','-mountpoint',join(temp,'mounted')],{timeout:120000});mounted=true;
  const app=join(temp,'mounted',product+'.app');appDir=join(app,'Contents','Resources','app');executable=join(app,'Contents','MacOS',product);
 }else{
  const installer=resolve(`dist/biaoxi-oss-${pkg.version}-windows-${arch}-setup.exe`),destination=join(process.env.LOCALAPPDATA,'Programs',pkg.name);
  assert.equal(pkg.name,'biaoxi-oss-trial');
  assert.equal(await exists(destination),false,'Refusing to reuse an existing installation');
  await run(installer,['/S'],{timeout:180000});
  executable=join(destination,product+'.exe');appDir=join(destination,'resources','app');
  const files=await readdir(destination);uninstaller=files.find(n=>n.startsWith('Uninstall ')&&n.endsWith('.exe'));
  assert.ok(uninstaller,'Installed uninstaller missing');uninstaller=join(destination,uninstaller);
 }
 await access(executable);await verifyDesktopBundle(appDir,{platform,arch});
 let session=await start(),request=client(session);
 assert.equal((await(await request('/api/reports')).json()).reports.length,0,'First launch must have no reports');
 const form=new FormData();form.append('role','tender');form.append('files',new Blob([await readFile('tests/fixtures/综合招标-测试用途.txt')]),'综合招标-测试用途.txt');
 const document=(await(await request('/api/documents',{method:'POST',body:form})).json()).documents[0];
 const task=await(await request('/api/analyses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentIds:[document.id],mode:'offline'})})).json();
 let job;
 assert.ok(task.jobId);for(let i=0;i<120;i++){job=await(await request('/api/jobs/'+task.jobId)).json();if(['completed','failed','cancelled'].includes(job.status))break;await delay(500);}
 assert.equal(job.status,'completed',JSON.stringify(job));assert.equal(job.reportIds.length,1);
 const reportId=job.reportIds[0],report=await(await request('/api/reports/'+reportId)).json();
 assert.equal(report.categories.length,14);assert.equal(report.outputs.conclusion.label,'待核验');
 const exported={};for(const format of ['pdf','docx']){const bytes=Buffer.from(await(await request('/api/reports/'+reportId+'/export?format='+format)).arrayBuffer());assert.ok(bytes.length>1000);assert.equal(bytes.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');exported[format]=bytes.length;}
 await stop();session=await start();request=client(session);
 assert.ok((await(await request('/api/reports')).json()).reports.some(r=>r.id===reportId));
 await stop();
 if(uninstaller){
  const reportsBefore=await snapshot(join(profile,'data'));
  assert.notEqual(reportsBefore,'[]','Expected a persisted trial report before uninstall');
  // NSIS _?= must be last and unquoted; run in place so execFile waits for
  // actual uninstall completion instead of the temporary-copy launcher.
  await run(uninstaller,['/S','_?='+dirname(executable)],{timeout:180000,windowsVerbatimArguments:true});
  for(let i=0;i<120&&await exists(executable);i++)await delay(500);
  assert.equal(await exists(executable),false,'Uninstall did not remove the installed executable');
  assert.equal(await snapshot(join(profile,'data')),reportsBefore,'Uninstall changed or removed persisted report data');
 }
 assert.equal(await snapshot(join(originalProfile,'data')),originalBefore,'Original-edition report data changed');
 const result={pass:true,version:pkg.version,sourceCommit,platform,arch,fromFinalArtifact:platform==='darwin'?'dmg':'nsis-setup',bootstrapDesktop:true,firstLaunchEmpty:true,dataProfileIsolated:true,inheritedOriginalPathIgnored:true,syntheticOfflineAnalysis:true,categories:14,exported,reportPersistsAfterProcessRestart:true,processStop:'owned process termination, not a GUI quit test',defaultInstallDirectoryIsolated:platform==='win32'?true:'NOT_APPLICABLE',uninstallPreservesData:uninstaller?'report-data-sha256-unchanged':'NOT_APPLICABLE',uninstallRemovesExecutable:uninstaller?true:'NOT_APPLICABLE',originalProfileUnchanged:true,interactiveGuiAcceptance:'NOT_RUN',developerCertificateSigning:'NOT_CONFIGURED',appleNotarization:platform==='darwin'?'NOT_CONFIGURED':'NOT_APPLICABLE'};
 await writeFile(`dist/startup-smoke-${platform}-${arch}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await stop();if(mounted)await run('hdiutil',['detach',join(temp,'mounted')],{timeout:120000});}
