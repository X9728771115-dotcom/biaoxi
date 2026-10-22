import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export function createTestConfig({ocr=false,root=projectRoot,environment=process.env}={}){
 const env={...environment};
 for(const key of Object.keys(env))if(key.startsWith('BIAXI_REAL_')||key.startsWith('BIAOXI_REAL_'))delete env[key];
 if(ocr)env.BIAXI_OCR_TEST='1';else delete env.BIAXI_OCR_TEST;
 const files=readdirSync(join(root,'tests')).filter(name=>name.endsWith('.test.js')).sort().map(name=>join(root,'tests',name));
 return{command:process.execPath,args:['--test',...files],cwd:resolve(root),env};
}
function main(){
 const config=createTestConfig({ocr:process.argv.includes('--ocr')});
 if(process.argv.includes('--print-config')){
  const env={};for(const key of ['BIAXI_OCR_TEST','BIAXI_REAL_DOC_FILE','BIAXI_REAL_CERTIFICATE_DIR'])if(config.env[key]!==undefined)env[key]=config.env[key];
  console.log(JSON.stringify({...config,env},null,2));return;
 }
 const child=spawn(config.command,config.args,{cwd:config.cwd,env:config.env,stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code??1;});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
