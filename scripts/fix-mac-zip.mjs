// electron-builder's ZIP backend can write UTF-8 filenames without bit 11.
// Correct the metadata without recompressing files or changing permissions.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const folder=process.argv[2]||'dist';
for(const file of await readdir(folder)){
 if(!file.endsWith('-mac.zip'))continue;
 const path=join(folder,file),data=await readFile(path);
 let end=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){
  if(data.readUInt32LE(i)===0x06054b50 && i+22+data.readUInt16LE(i+20)===data.length){end=i;break;}
 }
 if(end<0)throw new Error(`${file}: ZIP end record missing`);
 const count=data.readUInt16LE(end+10);
 let offset=data.readUInt32LE(end+16),changed=0;
 if(count===65535||offset===0xffffffff)throw new Error(`${file}: ZIP64 is unsupported`);
 for(let i=0;i<count;i++){
  if(data.readUInt32LE(offset)!==0x02014b50)throw new Error(`${file}: invalid central directory`);
  const flags=data.readUInt16LE(offset+8),length=data.readUInt16LE(offset+28);
  const name=data.subarray(offset+46,offset+46+length);
  if(!Buffer.from(name.toString('utf8'),'utf8').equals(name))throw new Error(`${file}: filename is not UTF-8`);
  if(name.some(byte=>byte>127)&&!(flags&0x800)){
   const local=data.readUInt32LE(offset+42);
   if(data.readUInt32LE(local)!==0x04034b50)throw new Error(`${file}: invalid local record`);
   data.writeUInt16LE(flags|0x800,offset+8);
   data.writeUInt16LE(data.readUInt16LE(local+6)|0x800,local+6);
   changed++;
  }
  offset+=46+length+data.readUInt16LE(offset+30)+data.readUInt16LE(offset+32);
 }
 if(changed)await writeFile(path,data);
 console.log(`${file}: UTF-8 filename metadata verified (${changed} entries corrected)`);
}
