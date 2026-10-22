import test from 'node:test';
import assert from 'node:assert/strict';
import {extractLegacyDoc} from '../src/core/legacy-doc.js';
import {createLegacyDocFixture,createLegacyNativeObject} from './fixtures/legacy-doc-fixture.js';
import {readArchiveEntries} from '../src/core/archive-reader.js';

const archive=Buffer.from('Rar!fixture');
const reader=(rows,contents={})=>async(args)=>({code:0,stdout:Buffer.from(args[0]==='-tf'?rows.map(r=>r.name).join('\n')+'\n':args[0]==='-tvf'?rows.map(r=>`${r.mode||'-rw-r--r--'}  0 0 0 ${r.bytes} Oct 20 10:20 ${r.name}`).join('\n')+'\n':contents[args.at(-1)]||''),stderr:''});

test('explicit binary attachment reading preserves payload bytes and ordinary extraction excludes them',async()=>{
 const payload=Buffer.from('%PDF-test\0binary'),source=createLegacyDocFixture({objects:[createLegacyNativeObject('技术要求.pdf',payload)]});
 const ordinary=await extractLegacyDoc(source),expanded=await extractLegacyDoc(source,{includeAttachmentPayloads:true});
 assert.equal(Object.hasOwn(ordinary.attachments[0],'payload'),false);assert.deepEqual(expanded.attachments[0].payload,payload);
 assert.equal(expanded.attachments[0].sourceStream,'ObjectPool/item0/Ole10Native');
 assert.deepEqual(expanded.blocks,ordinary.blocks);assert.ok(!JSON.stringify(ordinary).includes('PRIVATE'));
});
test('archive reader returns independent readable bytes and leaves CAD explicitly unsupported',async()=>{
 const rows=[{name:'技术标准.doc',bytes:3},{name:'图纸.dwg',bytes:10}];
 const r=await readArchiveEntries(archive,{fileName:'附件.rar',runImpl:reader(rows,{'技术标准.doc':'DOC'})});
 assert.deepEqual(r.entries[0].payload,Buffer.from('DOC'));assert.equal(r.entries[0].status,'ready');
 assert.equal(r.entries[1].status,'unsupported');assert.equal(Object.hasOwn(r.entries[1],'payload'),false);assert.equal(r.complete,false);
});
test('untrusted archive paths and wildcard names never reach extraction',async()=>{
 for(const name of ['../x.doc','/x.doc','C:/x.doc','x\\y.doc','x*.doc','x?.doc','x[1].doc','x\u0001.doc']){
  const seen=[];const run=reader([{name,bytes:3}],{[name]:'DOC'});
  const r=await readArchiveEntries(archive,{fileName:'附件.rar',runImpl:async(...args)=>{seen.push(args[0]);return run(...args);}});
  assert.equal(r.complete,false,name);assert.ok(!seen.some(args=>args[0]==='-xOf'),name);
 }
});
test('duplicate and case-colliding names, links, output-size mismatch and declared limits remain unread',async()=>{
 for(const rows of [[{name:'x.doc',bytes:3},{name:'x.doc',bytes:3}],[{name:'X.doc',bytes:3},{name:'x.doc',bytes:3}],[{name:'x.doc',bytes:3,mode:'lrwxrwxrwx'}],[{name:'x.doc',bytes:5}],[{name:'x.doc',bytes:999999999}]]){
  const r=await readArchiveEntries(archive,{fileName:'附件.rar',runImpl:reader(rows,{'x.doc':'DOC','X.doc':'DOC'})});
  assert.equal(r.complete,false);assert.ok(r.warnings.length);
 }
});
test('missing archive reader is a reported gap and cancellation stays a cancellation',async()=>{
 const r=await readArchiveEntries(archive,{fileName:'附件.rar',runImpl:async()=>{throw new Error('ENOENT');}});assert.equal(r.complete,false);assert.match(r.warnings[0].message,/未读|无法|不可/);
 const c=new AbortController();c.abort();await assert.rejects(readArchiveEntries(archive,{fileName:'附件.rar',signal:c.signal}),{name:'AbortError'});
});
