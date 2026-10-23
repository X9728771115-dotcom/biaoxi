import {mkdtemp,rm,cp} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const [bundle,fixtures]=process.argv.slice(2);if(!bundle||!fixtures)throw new Error('需要打包资源目录和测试素材目录');
const temp=await mkdtemp(join(tmpdir(),'biaoxi-packaged-'));
try{
 // Move dependencies away from the development checkout: missing bundled modules cannot fall back to its node_modules.
 const isolated=join(temp,'app');await cp(resolve(bundle),isolated,{recursive:true});
 const env={...process.env};delete env.NODE_PATH;
 const child=spawn(process.execPath,[fileURLToPath(new URL('./package-smoke-worker.mjs',import.meta.url)),isolated,resolve(fixtures)],{env,stdio:['ignore','inherit','inherit']});
 await new Promise((done,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>code===0?done():reject(new Error(`打包功能检查 worker 退出失败：${code??signal}`)));});
 // Windows keeps loaded native DLLs locked until the importing process exits.
}finally{await rm(temp,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
