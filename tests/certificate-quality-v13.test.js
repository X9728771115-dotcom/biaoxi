import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeCertificates} from '../src/core/certificate-import.js';

// Credential and identity numbers below are synthetic format fixtures.
const doc=text=>({id:'quality-doc',fileName:'证件.png',extraction:{complete:true,blocks:[{id:'quality-block',page:1,kind:'ocr',text}]}});
const candidate=text=>recognizeCertificates(doc(text),{type:'personnel'}).candidates[0];
const registration='中华人民共和国一级建造师注册证书\n姓名：测试人\n注册编号：鲁1012026000000001\n聘用企业：示例建设有限公司';
const exactSources=(record,document)=>{for(const source of record.sources)assert.ok(document.extraction.blocks.find(block=>block.id===source.blockId).text.includes(source.quote));assert.equal(record.verified,false);assert.ok(record.fields.evidence.every(proof=>proof.verified===false));};

test('V13 training certificate coding is read without substituting a neighbouring identity number',()=>{
 const d=doc('住房和城乡建设领域施工现场专业人员职业培训合格证\n证书编码：0132000000000000001\n姓名：测试人\n身份证号：000000000000000002\n岗位名称：市政工程质量员\n专业人员职业培训，测试成绩合格。');
 const [r]=recognizeCertificates(d).candidates;
 assert.equal(r.type,'personnel');assert.equal(r.fields.certificateNumber,'0132000000000000001');assert.equal(r.fields.specialty,undefined);exactSources(r,d);
});

test('V13 bare coding label is accepted on a titled credential',()=>{
 const r=candidate('职业培训合格证\n编码：0132000000000000001\n姓名：测试人');
 assert.equal(r.fields.certificateNumber,'0132000000000000001');
});

test('V13 a training certificate keeps its coding printed above its title',()=>{
 const d=doc('记书编码 : 0132000000000000002\n住房和城乡建设领域施工现场专业人员\n职业培训合格证\n姓名：测试人\n身份证号：00000000000000000X\n岗位名称：土建质量员');
 const records=recognizeCertificates(d).candidates;
 assert.equal(records.length,1);assert.equal(records[0].type,'personnel');assert.equal(records[0].fields.certificateNumber,'0132000000000000002');exactSources(records[0],d);
});

test('V13 identity labels with punctuation cannot supply a certificate number',()=>{
 for(const identity of ['身份证号 . 000000000000000002','身份证号码：000000000000000002','公民身份号码：000000000000000002']){
  const r=candidate(`职业培训合格证\n姓名：测试人\n${identity}`);
  assert.equal(r.fields.certificateNumber,undefined);assert.ok(r.recognition.missingFields.includes('certificateNumber'));
 }
});

test('V13 training prose is not a specialty even after a valid certificate number',()=>{
 const r=candidate('职业培训合格证\n姓名：测试人\n证书编号：0132000000000000001\n岗位名称：市政工程质量员\n专业人员职业培训，测试成绩合格。');
 assert.equal(r.fields.specialty,undefined);
});

test('V13 recognised safety and construction numbers do not retain trailing OCR prose',()=>{
 for(const [text,expected]of [
  ['安全生产考核合格证书\n姓名：测试人\n证书编号：鲁交安 C26G00001 Arif ST','鲁交安C26G00001'],
  [registration.replace('鲁1012026000000001','鲁 1012026000000001 一 c Eee'),'鲁1012026000000001']
 ])assert.equal(candidate(text).fields.certificateNumber,expected);
});

test('V13 a detection report keeps its legal identifier suffix rather than using construction-number syntax',()=>{
 const d=doc('检测报告\n报告编号：鲁1234567890123-2026\n制造商：样例有限公司');
 d.extraction.blocks[0].kind='paragraph';
 const [r]=recognizeCertificates(d).candidates;
 assert.equal(r.type,'product');assert.equal(r.fields.certificateNumber,'鲁1234567890123-2026');exactSources(r,d);
});

test('V13 a report following registration in one OCR block keeps its legal alphabetic suffix',()=>{
 const d=doc(registration+'\n检测报告\n报告编号：鲁1234567890123A\n制造商：样例有限公司');
 const records=recognizeCertificates(d).candidates,report=records.find(record=>record.type==='product');
 assert.equal(records.length,2);assert.equal(report.fields.certificateNumber,'鲁1234567890123A');exactSources(report,d);
});

test('V13 electronic use period limits the document while professional registration stays explained',()=>{
 const d=doc(registration+'\n使用有效期：2026年06月17日 - 2026年12月14日\n注册专业：公路工程（有效期：2026-06-12至2029-06-11）');
 const [r]=recognizeCertificates(d).candidates;
 assert.equal(r.fields.validUntil,'2026-12-14');assert.match(r.fields.notes,/2026-06-17.*2026-12-14/);assert.match(r.fields.notes,/公路工程.*2026-06-12.*2029-06-11/);assert.equal(r.fields.specialty,'公路工程');exactSources(r,d);
});

test('V13 independent professions with different periods do not silently share the first expiry',()=>{
 const r=candidate(registration+'\n使用有效期：2025-09-18至2026-12-18\n注册专业：水利水电工程（有效期：2023-12-19至2026-12-18）\n建筑工程（有效期：2025-09-18至2028-09-17）');
 assert.equal(r.fields.validUntil,undefined);assert.ok(r.recognition.missingFields.includes('validUntil'));assert.equal(r.recognition.status,'pending');assert.match(r.fields.notes,/水利水电工程/);assert.match(r.fields.notes,/建筑工程/);
});

test('V13 a labelled native electronic use interval is considered alongside an OCR registration interval',()=>{
 const d=doc(registration+'\n注册专业：公路工程（有效期：2026-06-12至2029-06-11）');
 d.extraction.blocks.push({id:'native-use',page:1,kind:'paragraph',text:'使用有效期: 2026年06月17日 - 2026年12月14日'});
 const [r]=recognizeCertificates(d).candidates;
 assert.equal(r.fields.validUntil,'2026-12-14');assert.ok(r.sources.some(source=>source.blockId==='native-use'&&source.field==='validUntil'));exactSources(r,d);
});
