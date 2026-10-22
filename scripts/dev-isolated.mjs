import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export function createLaunchConfig(mode,{root=projectRoot,environment=process.env}={}){
 if(!['web','desktop'].includes(mode))throw new Error('Choose web or desktop.');
 root=resolve(root);
 const env={...environment};
 delete env.BIAOXI_DATA_DIR;delete env.BIAOXI_USER_DATA_DIR;
 delete env.ELECTRON_RUN_AS_NODE;
 const dataDir=join(root,'candidate-data',mode);
 if(mode==='web')env.BIAOXI_DATA_DIR=dataDir;
 else env.BIAOXI_USER_DATA_DIR=dataDir;
 return{command:process.execPath,args:mode==='web'?[join(root,'src/server/cli.js')]:[join(root,'node_modules/electron/cli.js'),root],cwd:root,env,dataDir};
}
async function main(){
 const config=createLaunchConfig(process.argv[2]);
 if(process.argv.includes('--print-config')){
  const env={};for(const key of ['BIAOXI_DATA_DIR','BIAOXI_USER_DATA_DIR','BIAOXI_PORT'])if(config.env[key]!==undefined)env[key]=config.env[key];
  console.log(JSON.stringify({...config,env},null,2));return;
 }
 await mkdir(config.dataDir,{recursive:true});
 console.log('Biaoxi candidate isolated data: '+config.dataDir);
 const child=spawn(config.command,config.args,{cwd:config.cwd,env:config.env,stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});
 child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
