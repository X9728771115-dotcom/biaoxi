import {spawn} from 'node:child_process';
import {join} from 'node:path';

const DEFAULT_LIMITS={maxEntries:40,maxEntryBytes:50*1024*1024,maxTotalBytes:150*1024*1024,timeoutMs:30000};
const READABLE=new Set(['doc','docx','pdf','xlsx','xls','txt','md','png','jpg','jpeg','webp','bmp','tif','tiff']);
const aborted=signal=>{if(signal?.aborted){const error=new Error('已取消附件读取');error.name='AbortError';throw error;}};
const gap=message=>({entries:[],warnings:[{code:'ARCHIVE_UNREAD',message}],complete:false,reader:'system-tar'});
const trustedTar=()=>process.platform==='win32'?join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'/usr/bin/tar';

async function runTar(args,{input,signal,maxBytes,timeoutMs}){
 aborted(signal);
 return new Promise((resolve,reject)=>{
  const child=spawn(trustedTar(),args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks=[];let size=0,stderr='',finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve(result);};
  const stop=error=>{child.kill('SIGKILL');finish(error);};
  const cancel=()=>{const error=new Error('已取消附件读取');error.name='AbortError';stop(error);};
  const timer=setTimeout(()=>stop(new Error('归档读取超时')),timeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});
  child.on('error',error=>finish(error));child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)stop(new Error('附件展开字节超出限制'));else chunks.push(chunk);});
  child.stderr.on('data',chunk=>{if(stderr.length<2000)stderr+=chunk.toString('utf8').slice(0,2000-stderr.length);});
  child.on('close',code=>finish(null,{code,stdout:Buffer.concat(chunks),stderr}));
  child.stdin.end(input);if(signal?.aborted)cancel();
 });
}
const lines=buffer=>new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n');
function memberNameSafe(name){
 return !!name&&name.length<=1000&&!/[\u0000-\u001f\u007f\\*?\[\]]/.test(name)&&!name.startsWith('/')&&!/^[A-Za-z]:/.test(name)&&!name.split('/').some(part=>part==='..'||part==='.')&&!name.includes('//');
}
function listingRow(line,name){
 if(!line.endsWith(name))throw new Error('归档目录名称或显示格式无法可靠对应');
 const metadata=line.slice(0,-name.length),mode=metadata[0];
 // BSD tar (macOS / Windows system tar). GNU tar may only help ZIP; unknown
 // layouts remain unread instead of guessing a member size or type.
 const bsd=metadata.match(/^\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+/);
 const gnu=metadata.match(/^\S+\s+\S+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+/);
 const bytes=Number((bsd||gnu)?.[1]);
 if(!Number.isSafeInteger(bytes)||bytes<0||!['-','d'].includes(mode))throw new Error('归档包含链接、特殊成员或不明目录属性');
 return {name,bytes,mode};
}

/** Enumerate first, then read exact ordinary members through stdout. Never execute or unpack to member paths. */
export async function readArchiveEntries(buffer,{fileName='',signal,limits={},runImpl=runTar}={}){
 aborted(signal);
 const cap={...DEFAULT_LIMITS};for(const key of Object.keys(cap))if(Number.isSafeInteger(limits[key])&&limits[key]>0)cap[key]=Math.min(cap[key],limits[key]);
 if(!Buffer.isBuffer(buffer)||buffer.length>cap.maxEntryBytes)return gap('归档无法读取或超出本次附件字节限制。');
 if(!/\.(rar|zip)$/i.test(fileName)||!(buffer.subarray(0,4).toString('ascii')==='Rar!'||buffer.subarray(0,2).toString('ascii')==='PK'))return gap('归档格式无法确认，原件仍保留，内容未读取。');
 const run=async(args,maxBytes)=>{aborted(signal);const result=await runImpl(args,{input:buffer,signal,maxBytes,timeoutMs:cap.timeoutMs});aborted(signal);if(result.code!==0||String(result.stderr||'').trim())throw new Error('归档工具不可用、文件损坏、加密或格式不支持');if(Buffer.byteLength(result.stdout)>maxBytes)throw new Error('附件展开字节超出限制');return Buffer.from(result.stdout);};
 try{
  const names=lines(await run(['-tf','-'],1024*1024)),verbose=lines(await run(['-tvf','-'],1024*1024));
  if(!names.length||names.length>cap.maxEntries||names.length!==verbose.length)throw new Error('归档目录为空、数量超限或成员无法对应');
  const unique=new Set();let declared=0;
  const rows=names.map((name,index)=>{
   if(!memberNameSafe(name))throw new Error('归档成员路径、通配符或控制字符不明确');
   const key=name.normalize('NFKC').replace(/\/$/,'').toLocaleLowerCase();if(unique.has(key))throw new Error('归档存在重复或大小写冲突的成员名');unique.add(key);
   const row=listingRow(verbose[index],name);declared+=row.bytes;
   if(row.bytes>cap.maxEntryBytes||declared>cap.maxTotalBytes)throw new Error('归档声明的展开字节超出限制');return row;
  });
  const entries=[],warnings=[];let actual=0;
  for(const row of rows){
   aborted(signal);const format=row.name.split('.').at(-1).toLowerCase();
   if(row.mode==='d'){entries.push({...row,format:'directory',status:'directory'});continue;}
   if(!READABLE.has(format)){entries.push({...row,format,status:'unsupported',reason:'当前未解析此格式'});warnings.push({code:'ARCHIVE_MEMBER_UNREAD',message:`${row.name}原件仍在归档中，当前格式未解析。`});continue;}
   try{
    const payload=await run(['-xOf','-','--',row.name],Math.min(row.bytes+1,cap.maxEntryBytes));actual+=payload.length;
    if(!payload.length||payload.length!==row.bytes||actual>cap.maxTotalBytes)throw new Error('成员实际字节数与目录不一致或超出限制');
    entries.push({...row,format,status:'ready',payload});
   }catch(error){if(error.name==='AbortError')throw error;entries.push({...row,format,status:'blocked',reason:error.message});warnings.push({code:'ARCHIVE_MEMBER_UNREAD',message:`${row.name}未读取：${error.message}。`});}
  }
  return {entries,warnings,complete:entries.length>0&&entries.every(entry=>['ready','directory'].includes(entry.status)),reader:'system-tar'};
 }catch(error){if(error.name==='AbortError')throw error;return gap(`归档内容未读取：${error.message}。原始附件保留，可单独补充可读文件。`);}
}
