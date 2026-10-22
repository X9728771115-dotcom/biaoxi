// Inspect the real NSIS compiler defines before compilation, using a packaged app.
// Shared temporary directories let a second launch remove the first launch's modules.
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {build,Platform} from 'electron-builder';
import {Arch} from 'builder-util';
const app=resolve(process.argv[2]||'dist/win-unpacked');
await access(join(app,'resources/app/node_modules/@napi-rs/canvas/geometry.js'));
const output=await mkdtemp(join(tmpdir(),'biaoxi-launcher-check-'));
let inspected=false;
try{
 await build({projectDir:process.cwd(),prepackaged:app,targets:Platform.WINDOWS.createTarget(['portable'],Arch.x64),config:{directories:{output},portable:{useZip:true}},effectiveOptionComputed:async([defines])=>{
  inspected=true;
  assert.ok(!Object.hasOwn(defines,'UNPACK_DIR_NAME'),'Portable launcher reuses a shared temporary directory; a second launch can remove running modules');
  console.log(JSON.stringify({sharedTemporaryDirectory:false,uniquePluginDirectory:true,geometryPresent:true,pass:true}));
  return true;
 }});
 assert.ok(inspected,'NSIS launcher defines were not inspected');
}finally{await rm(output,{recursive:true,force:true});}
