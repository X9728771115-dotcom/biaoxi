import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const verifier=fileURLToPath(new URL('../scripts/verify-desktop-bundle.mjs',import.meta.url));
const dependencies=['@napi-rs/canvas','@tesseract.js-data/chi_sim','@tesseract.js-data/eng','cheerio','docx','express','mammoth','multer','pdfjs-dist','pdfkit','sax','tesseract.js','tesseract.js-core','word-extractor','xlsx','body-parser','domutils','saxes','yauzl','fontkit'];
const binaryEvidence=['third_party/BINARY-DISTRIBUTION.md','third_party/binary-distribution/CODE-MATCH-EVIDENCE.json','third_party/binary-distribution/NOTICE-PROVENANCE.json','third_party/binary-distribution/PACKAGE-DECLARATIONS.json','third_party/binary-distribution/SOURCE-INSPECTION.json','third_party/binary-distribution/TARGET-VALIDATION.json','third_party/binary-distribution/notices/boolbase/LICENSE','third_party/binary-distribution/notices/tr46/LICENSE.md','third_party/binary-distribution/notices/tessdata-later-root/LICENSE'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function put(root,path,value='synthetic resource'){
 const destination=join(root,path);mkdirSync(dirname(destination),{recursive:true});
 writeFileSync(destination,typeof value==='object'&&!Buffer.isBuffer(value)?JSON.stringify(value):value);
}
function fixture(t,{platform='darwin',arch='arm64'}={}){
 const temporary=mkdtempSync(join(tmpdir(),'biaoxi-bundle-test-')),resources=join(temporary,'Resources'),root=join(resources,'app');
 mkdirSync(root,{recursive:true});t.after(()=>rmSync(temporary,{recursive:true,force:true}));
 put(root,'package.json',{name:'biaoxi-oss-trial',version:'0.5.6-alpha.2',license:'MIT',main:'src/desktop/main.cjs',dependencies:Object.fromEntries(dependencies.map(name=>[name,name==='@napi-rs/canvas'?'1.0.10':'1.0.0']))});
 put(root,'src/desktop/main.cjs',"const {app}=require('electron');app.setName('标析开源试用版');app.setPath('userData',require('node:path').join(app.getPath('appData'),'标析开源试用版'));app.requestSingleInstanceLock();");
 for(const path of ['LICENSE','THIRD_PARTY_NOTICES.md','assets/FONT-LICENSE.txt','assets/SourceHanSansSC-Regular.otf','public/index.html','src/desktop/preload.cjs','src/desktop/web-chat.cjs','src/desktop/web-chat-dom.cjs','src/server/service.js','src/server/export.js','src/core/extractor.js','src/core/analyzer.js'])put(root,path);
 for(const name of dependencies){put(root,`node_modules/${name}/package.json`,{name,version:name==='@napi-rs/canvas'?'1.0.10':'1.0.0',main:'index.js'});put(root,`node_modules/${name}/index.js`);}
 const target=platform==='win32'?'win32-x64-msvc':arch==='arm64'?'darwin-arm64':'darwin-x64';
 const binary=`node_modules/@napi-rs/canvas-${target}/skia.${target}.node`,bytes=Buffer.alloc(128);
 if(platform==='darwin'){bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(arch==='arm64'?0x0100000c:0x01000007,4);}else{bytes.write('MZ');bytes.writeUInt32LE(64,60);bytes.write('PE\0\0',64);bytes.writeUInt16LE(0x8664,68);}
 put(root,`node_modules/@napi-rs/canvas-${target}/package.json`,{name:`@napi-rs/canvas-${target}`,version:'1.0.10',main:`skia.${target}.node`,os:[platform],cpu:[arch]});
 put(root,binary,bytes);if(platform==='win32')put(root,'node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat');
 put(root,'node_modules/@napi-rs/canvas/geometry.js');put(root,'node_modules/tesseract.js/src/worker-script/node/index.js');
 for(const variant of ['','-lstm','-simd','-simd-lstm','-relaxedsimd','-relaxedsimd-lstm'])for(const suffix of ['.js','.wasm','.wasm.js'])put(root,`node_modules/tesseract.js-core/tesseract-core${variant}${suffix}`);
 for(const language of ['chi_sim','eng'])for(const variant of ['4.0.0','4.0.0_best_int'])put(root,`node_modules/@tesseract.js-data/${language}/${variant}/${language}.traineddata.gz`,`synthetic ${language} ${variant} model`);
 for(const name of ['native-source-provenance','source-provenance','canvas-rust-inventory','canvas-skia-deps','declaration-evidence'])put(root,`third_party/${name}.json`,{schemaVersion:1});
 for(const path of binaryEvidence)put(root,path,path.endsWith('.json')?{schemaVersion:1}:'synthetic notice evidence');
 const notices=['LICENSE','LICENSES.chromium.html'].map(name=>({path:`third_party/runtime/electron-44.7.0/${name}`,sha256:sha('synthetic Electron notice')}));
 for(const notice of notices)put(root,notice.path,'synthetic Electron notice');
 for(const name of ['LICENSE','LICENSES.chromium.html'])put(resources,`runtime-notices/electron-44.7.0/${name}`,`synthetic target ${name} notice`);
 put(root,'third_party/dependency-inventory.json',{packages:[{name:'electron',version:'44.7.0',noticeFiles:notices}]});
 return {root,resources,sourceRoot:join(temporary,'native-build-source'),binary,platform,arch};
}
function run({root,platform,arch},output=join(root,'manifest.json')){
 return spawnSync(process.execPath,[verifier,root,platform,arch,output],{encoding:'utf8'});
}

test('bundle verifier records final bundled hashes and only relative component paths',async t=>{
 const bundle=fixture(t),result=run(bundle);assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(readFileSync(join(bundle.root,'manifest.json'),'utf8'));
 assert.equal(manifest.platform,'darwin');assert.equal(manifest.arch,'arm64');assert.equal(manifest.application.version,'0.5.6-alpha.2');assert.equal(manifest.version,'0.5.6-alpha.2');
 assert.ok(manifest.files.every(file=>!file.path.startsWith('/')&&!file.path.includes('..')&&!file.path.includes('\\')));
 assert.equal(manifest.files.find(file=>file.path===bundle.binary).sha256,sha(readFileSync(join(bundle.root,bundle.binary))));
 assert.ok(manifest.packages.some(item=>item.name==='fontkit'));
 assert.equal(JSON.stringify(manifest).includes(bundle.root),false);
 const {verifyDesktopBundle}=await import('../scripts/verify-desktop-bundle.mjs');
 const changed=readFileSync(join(bundle.root,bundle.binary));changed[changed.length-1]=1;put(bundle.root,bundle.binary,changed);
 assert.notEqual(verifyDesktopBundle(bundle.root,bundle).files.find(file=>file.path===bundle.binary).sha256,manifest.files.find(file=>file.path===bundle.binary).sha256);
});

test('bundle verifier records every distributed model variant with its actual bytes',t=>{
 const bundle=fixture(t),result=run(bundle);assert.equal(result.status,0,result.stderr);
 const models=JSON.parse(readFileSync(join(bundle.root,'manifest.json'),'utf8')).files.filter(file=>file.path.endsWith('.traineddata.gz'));
 assert.deepEqual(models.map(file=>file.path).sort(),[
  'node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz',
  'node_modules/@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz',
  'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz',
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
 ]);
 for(const model of models){const bytes=readFileSync(join(bundle.root,model.path));assert.equal(model.sha256,sha(bytes));assert.equal(model.bytes,bytes.length);}
});

test('extra model variants cannot substitute either required base model',t=>{
 for(const language of ['chi_sim','eng']){
  const bundle=fixture(t),path=`node_modules/@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`;
  rmSync(join(bundle.root,path));const result=run(bundle);assert.equal(result.status,1);assert.ok(result.stderr.includes(path),result.stderr);
 }
});

for(const path of binaryEvidence)test(`bundle verifier rejects missing binary distribution evidence ${path}`,t=>{
 const bundle=fixture(t);rmSync(join(bundle.root,path));const result=run(bundle);
 assert.equal(result.status,1);assert.ok(result.stderr.includes(path),result.stderr);
});

test('bundle verifier rejects the original npm identity used by default Windows installation paths',t=>{
 const bundle=fixture(t),pkg=JSON.parse(readFileSync(join(bundle.root,'package.json'),'utf8'));
 put(bundle.root,'package.json',{...pkg,name:'biaoxi'});const result=run(bundle);
 assert.equal(result.status,1);assert.match(result.stderr,/package identity/);
});

for(const target of [{platform:'darwin',arch:'x64'},{platform:'win32',arch:'x64'}])test(`bundle verifier accepts ${target.platform}/${target.arch} resources`,t=>{
 const bundle=fixture(t,target),result=run(bundle);assert.equal(result.status,0,result.stderr);
 if(target.platform==='win32')assert.ok(JSON.parse(readFileSync(join(bundle.root,'manifest.json'),'utf8')).files.some(file=>file.path==='node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat'));
});

for(const path of ['LICENSE','assets/SourceHanSansSC-Regular.otf','third_party/native-source-provenance.json','third_party/runtime/electron-44.7.0/LICENSES.chromium.html','node_modules/@napi-rs/canvas/geometry.js','node_modules/tesseract.js/src/worker-script/node/index.js','node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm','node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz','node_modules/body-parser/package.json'])test(`bundle verifier rejects missing ${path}`,t=>{
 const bundle=fixture(t);rmSync(join(bundle.root,path));const result=run(bundle);
 assert.equal(result.status,1);assert.ok(result.stderr.includes(path),result.stderr);
});

test('bundle verifier rejects an entrypoint selecting the original-edition data directory',t=>{
 const bundle=fixture(t);put(bundle.root,'src/desktop/main.cjs',readFileSync(join(bundle.root,'src/desktop/main.cjs'),'utf8').replaceAll('标析开源试用版','标析'));
 const result=run(bundle);assert.equal(result.status,1);assert.match(result.stderr,/namespace/);
});

test('bundle verifier rejects runtime data, original policy bytes and all nine development-only packages',t=>{
 const forbidden=['.data/report.json','candidate-data/settings.json','credential.bin','assets/policies/official/original.pdf','assets/policies/qa/page.png',...['@electron-internal/extract-zip','chromium-pickle-js','cross-dirname','err-code','lazy-val','node-api-version','read-binary-file-arch','temp-file','tmp-promise'].map(name=>`node_modules/parent/node_modules/${name}/package.json`)];
 for(const path of forbidden){const bundle=fixture(t);put(bundle.root,path);const result=run(bundle);assert.equal(result.status,1,path);assert.match(result.stderr,/Forbidden bundled path/,path);}
});

test('bundle verifier rejects mismatched native versions and architecture',t=>{
 const bundle=fixture(t),nativePackage='node_modules/@napi-rs/canvas-darwin-arm64/package.json';
 const original=JSON.parse(readFileSync(join(bundle.root,nativePackage),'utf8'));
 put(bundle.root,nativePackage,{...original,version:'1.0.11'});assert.match(run(bundle).stderr,/Canvas version/);
 put(bundle.root,nativePackage,original);const binary=readFileSync(join(bundle.root,bundle.binary));binary.writeUInt32LE(0x01000007,4);put(bundle.root,bundle.binary,binary);
 assert.match(run(bundle).stderr,/Native architecture/);
});

test('bundle verifier rejects changed Electron notices against their source record',t=>{
 const bundle=fixture(t);put(bundle.root,'third_party/runtime/electron-44.7.0/LICENSE','changed notice');
 const result=run(bundle);assert.equal(result.status,1);assert.match(result.stderr,/Electron notice hash/);
});

test('bundle verifier records actual target runtime notices separately from historical notices',t=>{
 const bundle=fixture(t),result=run(bundle);assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(readFileSync(join(bundle.root,'manifest.json'),'utf8'));
 assert.equal(manifest.runtimeVersion,'44.7.0');
 assert.deepEqual(manifest.runtimeNotices.map(item=>item.path),['runtime-notices/electron-44.7.0/LICENSE','runtime-notices/electron-44.7.0/LICENSES.chromium.html']);
 for(const notice of manifest.runtimeNotices){
  const bytes=readFileSync(join(bundle.resources,notice.path));assert.equal(notice.bytes,bytes.length);assert.equal(notice.sha256,sha(bytes));
  assert.notEqual(notice.sha256,sha('synthetic Electron notice'));
 }
 assert.equal(JSON.stringify(manifest).includes(bundle.resources),false);
});

for(const name of ['LICENSE','LICENSES.chromium.html'])test(`bundle verifier rejects a missing actual target Electron ${name}`,t=>{
 const bundle=fixture(t),path=`runtime-notices/electron-44.7.0/${name}`;rmSync(join(bundle.resources,path));
 const result=run(bundle);assert.equal(result.status,1);assert.ok(result.stderr.includes(path),result.stderr);
});

function runtimeSource(bundle,version='44.7.0'){
 put(bundle.sourceRoot,'node_modules/electron/package.json',{name:'electron',version});
 for(const name of ['LICENSE','LICENSES.chromium.html'])put(bundle.sourceRoot,'node_modules/electron/dist/'+name,`synthetic target ${name} notice`);
 return {root:bundle.sourceRoot};
}

test('native build check accepts notices matching its installed Electron runtime',async t=>{
 const {verifyDesktopBundle}=await import('../scripts/verify-desktop-bundle.mjs');
 const {verifyRuntimeNoticeSources}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),options=runtimeSource(bundle);
 assert.doesNotThrow(()=>verifyRuntimeNoticeSources(verifyDesktopBundle(bundle.root,bundle),options));
});

test('native build check rejects target notices copied from a different runtime source',async t=>{
 const {verifyDesktopBundle}=await import('../scripts/verify-desktop-bundle.mjs');
 const {verifyRuntimeNoticeSources}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),options=runtimeSource(bundle);put(bundle.sourceRoot,'node_modules/electron/dist/LICENSE','different runtime source notice');
 assert.throws(()=>verifyRuntimeNoticeSources(verifyDesktopBundle(bundle.root,bundle),options),/Target Electron notice differs from source/);
});

test('native build check rejects an installed Electron version outside the retained runtime version',async t=>{
 const {verifyDesktopBundle}=await import('../scripts/verify-desktop-bundle.mjs');
 const {verifyRuntimeNoticeSources}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),options=runtimeSource(bundle,'44.7.1');
 assert.throws(()=>verifyRuntimeNoticeSources(verifyDesktopBundle(bundle.root,bundle),options),/Source Electron version/);
});

test('native Electron installation replaces inherited target overrides only in its child environment',async()=>{
 const {createNativeBuildEnvironment}=await import('../scripts/build-desktop.mjs');
 const inherited={ELECTRON_INSTALL_PLATFORM:'win32',ELECTRON_INSTALL_ARCH:'x64',npm_config_platform:'win32',npm_config_arch:'x64',NPM_CONFIG_ARCH:'x64',npm_config_target_platform:'win32',npm_config_target_arch:'x64',npm_config_target:'43.0.0',ELECTRON_OVERRIDE_DIST_PATH:'external-runtime',ELECTRON_SKIP_BINARY_DOWNLOAD:'1',electron_use_remote_checksums:'1',npm_config_electron_use_remote_checksums:'1',HTTPS_PROXY:'https://proxy.example',electron_config_cache:'download-cache'};
 const original={...inherited},environment=createNativeBuildEnvironment('darwin','arm64',inherited);
 assert.equal(environment.ELECTRON_INSTALL_PLATFORM,'darwin');assert.equal(environment.ELECTRON_INSTALL_ARCH,'arm64');
 assert.equal(environment.npm_config_platform,'darwin');assert.equal(environment.npm_config_arch,'arm64');
 for(const key of ['NPM_CONFIG_ARCH','npm_config_target_platform','npm_config_target_arch','npm_config_target','ELECTRON_OVERRIDE_DIST_PATH','ELECTRON_SKIP_BINARY_DOWNLOAD','electron_use_remote_checksums','npm_config_electron_use_remote_checksums'])assert.equal(environment[key],undefined,key);
 assert.equal(environment.HTTPS_PROXY,'https://proxy.example');assert.equal(environment.electron_config_cache,'download-cache');assert.deepEqual(inherited,original);
});

test('pre-builder source check accepts an installed version with both runtime notices',async t=>{
 const {verifyInstalledElectronSource}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),options=runtimeSource(bundle);assert.doesNotThrow(()=>verifyInstalledElectronSource(options));
});

for(const name of ['LICENSE','LICENSES.chromium.html'])test(`pre-builder source check rejects an absent installed runtime ${name}`,async t=>{
 const {verifyInstalledElectronSource}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),options=runtimeSource(bundle);rmSync(join(bundle.sourceRoot,'node_modules/electron/dist',name));
 assert.throws(()=>verifyInstalledElectronSource(options),/Missing installed Electron runtime notice/);
});

test('pre-builder source check rejects an unexpected installed Electron version',async t=>{
 const {verifyInstalledElectronSource}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),options=runtimeSource(bundle,'44.7.1');assert.throws(()=>verifyInstalledElectronSource(options),/Source Electron version/);
});

test('build preflight fails before building when target differs from host or native resource is absent',async t=>{
 const {prepareDesktopBuild}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),options={root:bundle.root,hostPlatform:'darwin',hostArch:'arm64'};
 assert.throws(()=>prepareDesktopBuild('darwin','x64',options),/Native build only/);
 rmSync(join(bundle.root,bundle.binary));assert.throws(()=>prepareDesktopBuild('darwin','arm64',options),/skia\.darwin-arm64\.node/);
});

test('build preflight produces nonpublishing native target arguments without executing the builder',async t=>{
 const {prepareDesktopBuild}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t),plan=prepareDesktopBuild('darwin','arm64',{root:bundle.root,hostPlatform:'darwin',hostArch:'arm64'});
 assert.ok(plan.args.includes('--arm64'));assert.deepEqual(plan.args.slice(-2),['--publish','never']);
 assert.ok(plan.args.includes('dmg'));assert.ok(plan.args.includes('zip'));
 assert.equal(plan.manifest,join(bundle.root,'dist','desktop-manifest-darwin-arm64.json'));
});

test('build preflight defaults an omitted architecture to the native Node architecture',async t=>{
 const {prepareDesktopBuild}=await import('../scripts/build-desktop.mjs');
 const bundle=fixture(t,{platform:'darwin',arch:process.arch});
 const plan=prepareDesktopBuild('darwin',undefined,{root:bundle.root,hostPlatform:'darwin',hostArch:process.arch});
 assert.ok(plan.args.includes('--'+process.arch));
});
