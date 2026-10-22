import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const generated=new Set(['.git','node_modules','dist','.data','.candidate-data','candidate-data','policy-source-cache','test-output']);
const credential=/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b|-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/;
const privatePath=/\/(?:Users|home)\/[^\s/"'<>]+\/|[A-Za-z]:[\\/]+Users[\\/]+[^\s\\/"'<>]+[\\/]/;
function walk(root,directory=root){
 const files=[];
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  if(generated.has(entry.name))continue;
  const path=join(directory,entry.name);
  if(entry.isDirectory())files.push(...walk(root,path));else files.push(relative(root,path));
 }
 return files;
}
export function checkSource(root=projectRoot){
 root=resolve(root);
 const git=spawnSync('git',['-C',root,'ls-files','--stage','-z'],{encoding:'utf8'});
 const index=git.status===0?git.stdout.split('\0').filter(Boolean).map(entry=>{
  const tab=entry.indexOf('\t');
  const [mode,object,stage]=entry.slice(0,tab).split(' ');
  return {file:entry.slice(tab+1),mode,object,stage};
 }):[];
 const files=[...new Set([...walk(root),...index.map(entry=>entry.file)])];
 const issues=[];let scanned=0,binary=0;
 if(git.status!==0&&existsSync(join(root,'.git')))issues.push({file:'.git/index',line:0,code:'INDEX_ENUMERATION_FAILED',source:'index'});
 function inspect(file,buffer,source){
  if(buffer.includes(0)){binary++;return;}
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{binary++;return;}
  scanned++;
  for(const [number,line]of text.split(/\r?\n/).entries()){
   if(credential.test(line))issues.push({file,line:number+1,code:'CREDENTIAL',source});
   if(privatePath.test(line))issues.push({file,line:number+1,code:'PRIVATE_PATH',source});
  }
 }
 function prohibited(file){
  return file.split('/').some(part=>generated.has(part))||/^assets\/policies\/(?:official|qa)(?:\/|$)/.test(file)||/(?:^|\/)credential\.bin$/.test(file)||/(?:^|\/)\.env(?:$|\.(?!example$|sample$))/.test(file);
 }
 const workBuffers=new Map();
 for(const file of files){
  const normalized=file.replaceAll('\\','/');
  if(prohibited(normalized)){
   issues.push({file:normalized,line:0,code:'RUNTIME_DATA'});continue;
  }
  const path=join(root,file);let stat;
  try{stat=lstatSync(path);}catch{issues.push({file:normalized,line:0,code:'MISSING_TRACKED_FILE'});continue;}
  if(stat.isSymbolicLink()){issues.push({file:normalized,line:0,code:'SYMLINK'});continue;}
  if(!stat.isFile())continue;
  const buffer=readFileSync(path);
  workBuffers.set(file,buffer);
  inspect(normalized,buffer,'working-tree');
 }
 for(const entry of index){
  const file=entry.file.replaceAll('\\','/');
  if(prohibited(file))continue;
  if(entry.stage!=='0')issues.push({file,line:0,code:'UNMERGED_INDEX',source:'index'});
  if(entry.mode==='120000'||entry.mode==='160000'){
   issues.push({file,line:0,code:entry.mode==='120000'?'SYMLINK':'SUBMODULE',source:'index'});continue;
  }
  const blob=spawnSync('git',['-C',root,'cat-file','blob',entry.object],{maxBuffer:64*1024*1024});
  if(blob.status!==0){issues.push({file,line:0,code:'UNREADABLE_INDEX',source:'index'});continue;}
  if(!workBuffers.get(entry.file)?.equals(blob.stdout))inspect(file,blob.stdout,'index');
 }
 return{mode:index.length?'index-and-working-tree':'working-tree',files:files.length,indexFiles:index.length,textFiles:scanned,binaryFiles:binary,issues};
}
function main(){
 const index=process.argv.indexOf('--root');
 const result=checkSource(index>=0?process.argv[index+1]:projectRoot);
 console.log(JSON.stringify(result,null,2));
 if(result.issues.length)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
