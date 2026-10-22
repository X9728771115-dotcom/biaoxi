import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Document,Packer,Paragraph} from 'docx';
import XLSX from 'xlsx';
import {extractDocument} from '../src/core/extractor.js';
import {createService} from '../src/server/service.js';
import {createLegacyDocFixture} from './fixtures/legacy-doc-fixture.js';
import {createPublicLongLegacyDocFixture} from './fixtures/public-long-doc-fixture.js';

const clause='供应商须具有建筑装修装饰工程专业承包贰级及以上资质。';
async function source(t,name,buffer){
 const folder=await mkdtemp(join(tmpdir(),'biaoxi-word-v7-'));
 t.after(()=>rm(folder,{recursive:true,force:true}));
 const path=join(folder,name);await writeFile(path,buffer);
 return {id:'format-source',fileName:name,path};
}
const docx=()=>Packer.toBuffer(new Document({sections:[{children:[new Paragraph('第一章 资格要求'),new Paragraph(clause)]}]}));

for(const name of ['真实旧Word.doc','后缀不符.docx'])test(`actual binary Word is readable and traceable: ${name}`,async t=>{
 const buffer=createLegacyDocFixture({body:`第一章 资格要求\r${clause}\r标段\x07要求\x07\rA\x07贰级及以上\x07\r`});
 const result=await extractDocument(await source(t,name,buffer));
 assert.equal(result.format,'doc');assert.equal(result.complete,false);
 assert.ok(result.blocks.some(b=>b.text===clause));
 assert.ok(result.blocks.some(b=>b.kind==='table-text'&&b.text.includes('A | 贰级及以上')));
 assert.ok(result.blocks.every(b=>b.documentId==='format-source'&&b.page===null));
 assert.equal(new Set(result.blocks.map(b=>b.id)).size,result.blocks.length);
 assert.ok(result.legacyWord.sections.some(s=>s.text.includes('A\t贰级及以上')));
 assert.equal(result.warnings.some(w=>w.code==='WORD_FORMAT_MISMATCH'),name.endsWith('.docx'));
});

test('actual DOCX content named .doc is read with an explicit format notice',async t=>{
 const result=await extractDocument(await source(t,'旧后缀.doc',await docx()));
 assert.equal(result.format,'docx');assert.ok(result.blocks.some(b=>b.text===clause));
 assert.ok(result.warnings.some(w=>w.code==='WORD_FORMAT_MISMATCH'));
 assert.equal(result.blocks.every(b=>b.page===null),true);
});
test('a genuine DOCX remains readable without a format mismatch notice',async t=>{
 const result=await extractDocument(await source(t,'正常.docx',await docx()));
 assert.equal(result.complete,true);assert.equal(result.format,'docx');
 assert.ok(result.blocks.some(b=>b.text===clause));
 assert.ok(!result.warnings.some(w=>w.code==='WORD_FORMAT_MISMATCH'));
});
test('invalid .doc and non-Word compound data fail explicitly without invented body text',async t=>{
 const container=XLSX.CFB.utils.cfb_new();XLSX.CFB.utils.cfb_add(container,'Workbook',Buffer.alloc(4096));
 for(const [name,buffer] of [['坏文件.doc',Buffer.from('not a Word file')],['表格误名.docx',Buffer.from(XLSX.CFB.write(container,{type:'buffer'}))]]){
  const result=await extractDocument(await source(t,name,buffer));
  assert.equal(result.complete,false);assert.equal(result.blocks.length,0);
  assert.ok(result.warnings.some(w=>w.code==='READ_FAILED'));
  assert.ok(!result.warnings.some(w=>w.code==='UNSUPPORTED_FORMAT'));
 }
});
test('an encrypted Word or Office package stays unreadable rather than becoming an empty completed result',async t=>{
 const cfb=XLSX.CFB.utils.cfb_new();XLSX.CFB.utils.cfb_add(cfb,'EncryptedPackage',Buffer.alloc(4096));
 for(const buffer of [createLegacyDocFixture({flags:0x1100}),Buffer.from(XLSX.CFB.write(cfb,{type:'buffer'}))]){
  const result=await extractDocument(await source(t,'加密.docx',buffer));
  assert.equal(result.complete,false);assert.equal(result.blocks.length,0);
  assert.ok(result.warnings.some(w=>w.code==='READ_FAILED'&&/加密/.test(w.message)));
 }
});
test('the HTTP upload accepts DOC, analyzes actual content and keeps 14 categories and four outputs',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'biaoxi-doc-upload-v7-')),service=await createService({dataDir:folder});
 t.after(async()=>{await service.close();await rm(folder,{recursive:true,force:true});});
 const {token}=await(await fetch(service.url+'/api/bootstrap')).json();
 const headers={'X-Biaoxi-Token':token};
 const form=new FormData();form.append('role','tender');form.append('files',new Blob([await docx()]),'资格文件.doc');
 const uploaded=await fetch(service.url+'/api/documents',{method:'POST',headers,body:form});
 assert.equal(uploaded.status,200,await uploaded.clone().text());
 const {documents}=await uploaded.json();
 const started=await fetch(service.url+'/api/analyses',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({documentIds:[documents[0].id],mode:'offline'})});
 assert.equal(started.status,202,await started.clone().text());const {jobId}=await started.json();
 let job;
 for(let i=0;i<400;i++){
  job=await(await fetch(service.url+'/api/jobs/'+jobId,{headers})).json();
  if(['completed','failed','cancelled'].includes(job.status))break;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(job.status,'completed');assert.equal(job.reportIds.length,1);
 const report=await(await fetch(service.url+'/api/reports/'+job.reportIds[0],{headers})).json();
 assert.equal(report.categories.length,14);assert.equal(Object.keys(report.outputs).length,4);
 assert.ok(report.categories.some(c=>c.items.some(item=>item.quote?.includes('建筑装修装饰工程'))));
});
test('a public synthetic long DOC is equally complete under DOC and misleading DOCX suffixes',async t=>{
 const buffer=createPublicLongLegacyDocFixture(),before=createHash('sha256').update(buffer).digest('hex');
 const texts=[];
 for(const name of ['合成长文.doc','合成长文误后缀.docx']){
  const input=await source(t,name,buffer),result=await extractDocument(input);
  assert.equal(result.format,'doc');assert.equal(result.complete,false);
  const text=result.blocks.map(block=>block.text).join('\n');texts.push(text);
  for(const literal of [
   '合成长文演练：SYNTH-DOC-2026-01，仅用于文件读取测试。',
   '资格条件：供应商须具备有效的施工资质，证明材料须另行核验。',
   '报价规则：最高限价为780000元，报价超过该限价的响应无效。',
   '工期要求：合同生效后47日历天完成验收。',
   '验收规则：完成防水试验且整改关闭后办理验收。',
   '付款条件：验收合格并完成审计后支付合同价的92%，其余8%按质保约定支付。',
   '全文结束核对：SYNTH-DOC-END-1400，尾部内容必须完整保留。',
  ])assert.ok(text.includes(literal),literal);
  assert.ok(text.length>50000);
  assert.equal((text.match(/^合成核验记录\d{4}：/gm)||[]).length,1400);
  for(const marker of ['合成核验记录0001：','合成核验记录0700：','合成核验记录1400：'])assert.ok(text.includes(marker),marker);
  assert.ok(result.blocks.every(block=>block.page===null));
  assert.ok(result.blocks.some(block=>block.kind==='table-text'&&block.text.includes('SYNTH-01 | 合成节点A | 防水收口与排水坡度')));
  assert.deepEqual(result.legacyWord.attachments.map(attachment=>[attachment.name,attachment.format,attachment.parsed]),[
   ['合成甲标段图纸.pdf','pdf',false],['合成乙标段图纸.pdf','pdf',false],
   ['合成技术要求.rar','rar',false],['合成节点说明.rar','rar',false],
  ]);
  assert.ok(result.warnings.some(warning=>warning.code==='DOC_EMBEDDED_UNPARSED'));
  assert.ok(result.warnings.some(warning=>warning.code==='DOC_LAYOUT_UNVERIFIED'));
  assert.equal(result.warnings.some(warning=>warning.code==='WORD_FORMAT_MISMATCH'),name.endsWith('.docx'));
  assert.equal(createHash('sha256').update(await readFile(input.path)).digest('hex'),before);
 }
 assert.equal(texts[0],texts[1]);
 assert.equal(createHash('sha256').update(buffer).digest('hex'),before);
});
