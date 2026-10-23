import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Script} from 'node:vm';

const edition='标析开源试用版';
const developmentOnly=new Set(['@electron-internal/extract-zip','chromium-pickle-js','cross-dirname','err-code','lazy-val','node-api-version','read-binary-file-arch','temp-file','tmp-promise','electron','electron-builder']);
const corePackages=['@napi-rs/canvas','@tesseract.js-data/chi_sim','@tesseract.js-data/eng','cheerio','docx','express','mammoth','multer','pdfjs-dist','pdfkit','sax','tesseract.js','tesseract.js-core','word-extractor','xlsx','body-parser','domutils','saxes','yauzl','fontkit'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function file(root,path){
 assert.ok(!isAbsolute(path)&&!path.split(/[\\/]/).includes('..'),'Unsafe component path');
 const location=join(root,path);
 assert.ok(existsSync(location)&&lstatSync(location).isFile()&&lstatSync(location).size>0,'Missing bundled file: '+path);
 assert.ok(!lstatSync(location).isSymbolicLink(),'Symlink bundled file: '+path);
 return readFileSync(location);
}
const json=(root,path)=>JSON.parse(file(root,path));
export function verifyNativeCanvas(root,{platform,arch}){
 assert.ok((platform==='darwin'&&['arm64','x64'].includes(arch))||(platform==='win32'&&arch==='x64'),'Unsupported desktop target');
 const target=platform==='win32'?'win32-x64-msvc':`darwin-${arch}`,name='@napi-rs/canvas-'+target;
 const folder='node_modules/'+name,metadata=json(root,folder+'/package.json');
 assert.equal(json(root,'node_modules/@napi-rs/canvas/package.json').version,'1.0.10','Canvas version');
 assert.equal(metadata.version,'1.0.10','Canvas version');assert.equal(metadata.name,name);
 assert.ok(metadata.os?.includes(platform)&&metadata.cpu?.includes(arch),'Canvas target metadata');
 const binary=folder+`/skia.${target}.node`,bytes=file(root,binary);
 if(platform==='darwin')assert.ok(bytes.length>=8&&bytes.readUInt32LE(0)===0xfeedfacf&&bytes.readUInt32LE(4)===(arch==='arm64'?0x0100000c:0x01000007),'Native architecture mismatch');
 else {
  const offset=bytes.length>=64?bytes.readUInt32LE(60):bytes.length;
  assert.ok(bytes.length>=64&&bytes.toString('ascii',0,2)==='MZ'&&offset+6<=bytes.length&&bytes.toString('ascii',offset,offset+4)==='PE\0\0'&&bytes.readUInt16LE(offset+4)===0x8664,'Native architecture mismatch');
  file(root,folder+'/icudtl.dat');
 }
 return binary;
}
function verifyNamespace(source){
 let name,userData,lockData;
 const app={isPackaged:true,setName(value){name=value;},getPath(){return 'profile-root';},setPath(key,value){if(key==='userData')userData=value;},requestSingleInstanceLock(){lockData=userData;return false;},quit(){}};
 // Check the shipped entrypoint at the Electron boundary without starting its
 // service, touching user storage, or loading any native package.
 const require=specifier=>{
  if(specifier==='electron')return {app};
  if(specifier==='node:path')return {join,isAbsolute};
  if(specifier==='node:fs')return {mkdirSync(){throw new Error('Packaged namespace attempted a storage override');}};
  if(specifier==='node:fs/promises')return {};
  throw new Error('Unexpected packaged namespace dependency');
 };
 new Script(source,{filename:'src/desktop/main.cjs'}).runInNewContext({require,process:{env:{BIAOXI_USER_DATA_DIR:join('profile-root','标析')}}},{timeout:1000});
 assert.ok(name===edition&&userData===join('profile-root',edition)&&lockData===userData,'Packaged desktop namespace mismatch');
}
export function verifyDesktopBundle(appDir,{platform,arch}){
 const root=resolve(appDir),all=[];
 function walk(directory,path=''){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
   const relative=path?path+'/'+entry.name:entry.name,location=join(directory,entry.name);
   const packageName=('/'+relative).split('/node_modules/').slice(1).map(part=>part.startsWith('@')?part.split('/').slice(0,2).join('/'):part.split('/')[0]);
   assert.ok(!/^(?:\.data|\.candidate-data|candidate-data|data|desktopData|uploads|reports|companies|web-chat-history|policy-source-cache|test-output)(?:\/|$)/.test(relative)&&!/(?:^|\/)credential\.bin$/.test(relative)&&!/^assets\/policies\/(?:official|qa)(?:\/|$)/.test(relative)&&!packageName?.some(name=>developmentOnly.has(name)),'Forbidden bundled path: '+relative);
   assert.ok(!entry.isSymbolicLink(),'Symlink bundled path: '+relative);
   if(entry.isDirectory())walk(location,relative);else if(entry.isFile())all.push(relative);
  }
 }
 walk(root);
 const pkg=json(root,'package.json');assert.equal(pkg.name,'biaoxi-oss-trial','Desktop package identity must remain separate from the original edition');assert.equal(pkg.license,'MIT');assert.equal(pkg.main,'src/desktop/main.cjs');
 verifyNamespace(file(root,pkg.main).toString('utf8'));
 const required=new Set(['package.json','src/desktop/main.cjs','src/desktop/preload.cjs','src/desktop/web-chat.cjs','src/desktop/web-chat-dom.cjs','src/server/service.js','src/server/export.js','src/core/extractor.js','src/core/analyzer.js','public/index.html','LICENSE','THIRD_PARTY_NOTICES.md','assets/FONT-LICENSE.txt','assets/SourceHanSansSC-Regular.otf','node_modules/@napi-rs/canvas/geometry.js','node_modules/tesseract.js/src/worker-script/node/index.js',verifyNativeCanvas(root,{platform,arch})]);
 if(platform==='win32')required.add('node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat');
 for(const name of [...new Set([...corePackages,...Object.keys(pkg.dependencies||{})])]){
  const folder='node_modules/'+name,metadata=json(root,folder+'/package.json');assert.equal(metadata.name,name);
  required.add(folder+'/package.json');required.add(folder+'/'+(metadata.main||'index.js'));
 }
 for(const variant of ['','-lstm','-simd','-simd-lstm','-relaxedsimd','-relaxedsimd-lstm'])for(const suffix of ['.js','.wasm','.wasm.js'])required.add(`node_modules/tesseract.js-core/tesseract-core${variant}${suffix}`);
 for(const language of ['chi_sim','eng'])required.add(`node_modules/@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`);
 for(const name of ['dependency-inventory','native-source-provenance','source-provenance','canvas-rust-inventory','canvas-skia-deps','declaration-evidence'])required.add(`third_party/${name}.json`);
 required.add('third_party/BINARY-DISTRIBUTION.md');
 for(const name of ['CODE-MATCH-EVIDENCE','NOTICE-PROVENANCE','PACKAGE-DECLARATIONS','SOURCE-INSPECTION','TARGET-VALIDATION'])required.add(`third_party/binary-distribution/${name}.json`);
 for(const path of ['boolbase/LICENSE','tr46/LICENSE.md','tessdata-later-root/LICENSE'])required.add('third_party/binary-distribution/notices/'+path);
 const electron=json(root,'third_party/dependency-inventory.json').packages?.find(item=>item.name==='electron');assert.ok(electron?.version,'Electron provenance record missing');
 for(const name of ['LICENSE','LICENSES.chromium.html']){
  const path=`third_party/runtime/electron-${electron.version}/${name}`,notice=electron.noticeFiles?.find(item=>item.path===path);
  assert.ok(notice,'Electron notice provenance missing: '+path);assert.equal(digest(file(root,path)),notice.sha256,'Electron notice hash mismatch: '+path);required.add(path);
 }
 const packages=[];
 for(const path of all){
  if(path.startsWith('third_party/')||path.endsWith('.traineddata.gz'))required.add(path);
  if(path.startsWith('node_modules/')&&path.endsWith('/package.json')){
   const metadata=json(root,path);required.add(path);
   if(metadata.name){assert.ok(!developmentOnly.has(metadata.name),'Forbidden bundled path: '+path);packages.push({name:metadata.name,version:metadata.version,path});}
  }
 }
 const files=[...required].sort().map(path=>{const bytes=file(root,path);return {path:path.split(sep).join('/'),bytes:bytes.length,sha256:digest(bytes)};});
 return {schemaVersion:1,version:pkg.version,application:{name:pkg.name,version:pkg.version},platform,arch,sourceCommit:/^[a-f0-9]{40}$/i.test(process.env.GITHUB_SHA||'')?process.env.GITHUB_SHA:null,scope:'Static bundled-resource checks only; target execution and final linkage are not verified. Hashes describe final bundled bytes, including any signing changes, not original npm binary bytes.',packages:packages.sort((a,b)=>a.path.localeCompare(b.path)),files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [appDir,platform,arch,output]=process.argv.slice(2);assert.ok(appDir&&isAbsolute(appDir)&&output,'Usage: verify-desktop-bundle.mjs <absolute appDir> <darwin|win32> <arm64|x64> <manifest>');
  const result=verifyDesktopBundle(appDir,{platform,arch});writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({platform,arch,files:result.files.length,packages:result.packages.length}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
