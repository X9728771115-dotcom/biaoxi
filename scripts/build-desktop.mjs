import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyNativeCanvas} from './verify-desktop-bundle.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export function prepareDesktopBuild(platform,arch=process.arch,{root=projectRoot,hostPlatform=process.platform,hostArch=process.arch}={}){
 assert.ok(platform===hostPlatform&&arch===hostArch,'Native build only: target must match host platform and architecture');
 verifyNativeCanvas(root,{platform,arch});
 const args=[join(root,'node_modules/electron-builder/cli.js'),platform==='darwin'?'--mac':'--win',...(platform==='darwin'?['dmg','zip']:['nsis','portable']),'--'+arch,'--config.directories.output=dist','--publish','never'];
 const output=join(root,'dist'),resources=platform==='darwin'?join(output,arch==='arm64'?'mac-arm64':'mac','标析开源试用版.app','Contents','Resources','app'):join(output,'win-unpacked','resources','app');
 return {root,args,output,resources,manifest:join(output,`desktop-manifest-${platform}-${arch}.json`)};
}
export function verifyRuntimeNoticeSources(manifest,{root=projectRoot}={}){
 const source=JSON.parse(readFileSync(join(root,'node_modules/electron/package.json')));
 assert.equal(source.version,'44.7.0','Source Electron version mismatch');assert.equal(manifest.runtimeVersion,source.version,'Target Electron runtime version mismatch');
 for(const name of ['LICENSE','LICENSES.chromium.html']){
  const path=`runtime-notices/electron-${source.version}/${name}`,notice=manifest.runtimeNotices?.find(item=>item.path===path),bytes=readFileSync(join(root,'node_modules/electron/dist',name));
  assert.ok(notice,'Target Electron notice missing: '+path);
  assert.equal(notice.bytes,bytes.length,'Target Electron notice differs from source: '+name);
  assert.equal(notice.sha256,createHash('sha256').update(bytes).digest('hex'),'Target Electron notice differs from source: '+name);
 }
}
function run(root,args){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 assert.equal(result.status,0,'Desktop build/check failed');
}
function main(){
 const [platform,arch=process.arch]=process.argv.slice(2);const plan=prepareDesktopBuild(platform,arch);
 run(plan.root,plan.args);
 run(plan.root,[join(plan.root,'scripts',platform==='darwin'?'fix-mac-zip.mjs':'verify-windows-launcher.mjs'),platform==='darwin'?plan.output:join(plan.output,'win-unpacked')]);
 run(plan.root,[join(plan.root,'scripts/verify-desktop-bundle.mjs'),plan.resources,platform,arch,plan.manifest]);
 const source=JSON.parse(readFileSync(join(plan.root,'package.json'))),manifest=JSON.parse(readFileSync(plan.manifest));
 assert.equal(manifest.application.version,source.version,'Packaged application version differs from source');
 verifyRuntimeNoticeSources(manifest,{root:plan.root});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
