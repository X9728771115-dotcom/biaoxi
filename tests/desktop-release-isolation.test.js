import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const mainFile=fileURLToPath(new URL('../src/desktop/main.cjs',import.meta.url));
const source=readFileSync(mainFile,'utf8');
const nodeRequire=createRequire(import.meta.url);

test('Windows one-click installer uses an independent default program directory',()=>{
 const metadata=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const {AppInfo}=nodeRequire('app-builder-lib/out/appInfo.js');
 const {getWindowsInstallationDirName}=nodeRequire('app-builder-lib/out/targets/targetUtil.js');
 const appInfo=new AppInfo({metadata,config:metadata.build});
 const directory=getWindowsInstallationDirName(appInfo,!metadata.build.nsis.oneClick||metadata.build.nsis.perMachine);
 assert.equal(directory,'biaoxi-oss-trial');
 assert.notEqual(directory,'biaoxi');
});

function loadDesktop({isPackaged,appData,environment={}}){
 const calls=[],paths=new Map();let name;
 // Electron cannot run inside Node's test runner. Keep its lifecycle pending so
 // the real entrypoint selects storage without opening windows or a service.
 const app={isPackaged,setName(value){name=value;},getPath(key){if(key==='appData')return appData;return paths.get(key);},setPath(key,value){paths.set(key,value);calls.push({method:'setPath',key,value});},requestSingleInstanceLock(){calls.push({method:'lock',userData:paths.get('userData')});return true;},on(){},whenReady(){return new Promise(()=>{});}};
 const context={process:{env:{...environment}},__dirname:dirname(mainFile),require(specifier){if(specifier==='electron')return {app};if(specifier.startsWith('node:'))return nodeRequire(specifier);throw new Error('Unexpected dependency before Electron is ready: '+specifier);}};
 return {run(){new Script(source,{filename:mainFile}).runInNewContext(context);},calls,paths,get name(){return name;}};
}

function profileRoot(t){
 const directory=mkdtempSync(join(tmpdir(),'biaoxi-desktop-release-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 return directory;
}

test('packaged desktop ignores an inherited original-edition profile path',t=>{
 const appData=profileRoot(t),originalProfile=join(appData,'标析');
 const desktop=loadDesktop({isPackaged:true,appData,environment:{BIAOXI_USER_DATA_DIR:originalProfile}});
 desktop.run();
 assert.equal(desktop.paths.get('userData'),join(appData,'标析开源试用版'));
 assert.notEqual(desktop.paths.get('userData'),originalProfile);
 assert.equal(desktop.name,'标析开源试用版');
 assert.equal(existsSync(originalProfile),false);
});

test('development desktop uses and creates an explicit absolute profile',t=>{
 const appData=profileRoot(t),explicitProfile=join(appData,'isolated-development');
 const desktop=loadDesktop({isPackaged:false,appData,environment:{BIAOXI_USER_DATA_DIR:explicitProfile}});
 desktop.run();
 assert.equal(desktop.paths.get('userData'),explicitProfile);
 assert.equal(existsSync(explicitProfile),true);
});

test('development desktop rejects a relative profile before selecting storage or locking',t=>{
 const desktop=loadDesktop({isPackaged:false,appData:profileRoot(t),environment:{BIAOXI_USER_DATA_DIR:'relative-user-data'}});
 assert.throws(()=>desktop.run(),/BIAOXI_USER_DATA_DIR 必须是绝对路径/);
 assert.equal(desktop.paths.has('userData'),false);
 assert.equal(desktop.calls.some(call=>call.method==='lock'),false);
});

for(const isPackaged of [true,false]){
 test(`${isPackaged?'packaged':'development'} desktop without an override selects its own edition profile`,t=>{
  const appData=profileRoot(t),desktop=loadDesktop({isPackaged,appData});
  desktop.run();
  assert.equal(desktop.paths.get('userData'),join(appData,'标析开源试用版'));
 });
}

test('desktop selects its isolated profile before requesting the single-instance lock',t=>{
 const appData=profileRoot(t),explicitProfile=join(appData,'isolated-lock-profile');
 const desktop=loadDesktop({isPackaged:false,appData,environment:{BIAOXI_USER_DATA_DIR:explicitProfile}});
 desktop.run();
 const storageIndex=desktop.calls.findIndex(call=>call.method==='setPath'&&call.key==='userData');
 const lockIndex=desktop.calls.findIndex(call=>call.method==='lock');
 assert.ok(storageIndex>=0&&lockIndex>storageIndex);
 assert.equal(desktop.calls[lockIndex].userData,explicitProfile);
});
