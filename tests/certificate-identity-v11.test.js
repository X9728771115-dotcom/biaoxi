import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeCertificates,mergeCertificateCandidates} from '../src/core/certificate-import.js';

const doc=(text)=>({id:'test-doc',fileName:'原件.png',extraction:{complete:true,blocks:[{id:'p1',page:1,kind:'ocr',text}]}});
test('V11 identity card remains a source attachment rather than registration evidence',()=>{
 const result=recognizeCertificates(doc('中华人民共和国居民身份证\n姓名：测试人\n公民身份号码：000000000000000000'));
 assert.ok(result.candidates.every(r=>r.fields.evidence.every(p=>p.kind==='source')));
});
test('V11 an isolated personnel name without a credential title or number is not a registration',()=>{
 const result=recognizeCertificates(doc('姓名：测试人\n工作单位：演示企业有限公司'));
 assert.ok(result.candidates.every(r=>r.fields.evidence.every(p=>p.kind==='source')));
});
test('V11 safety B certificate is personnel B proof, never enterprise qualification or registration',()=>{
 const [r]=recognizeCertificates(doc('建筑施工企业主要负责人、项目负责人和专职安全生产管理人员安全生产考核合格证书\n姓名：测试人\n证书编号：川建安B(2024)0000001\n聘用企业：演示企业有限公司\n有效期至：2028-01-01')).candidates;
 assert.equal(r.type,'personnel');assert.equal(r.fields.evidence[0].kind,'bCertificate');assert.equal(r.fields.bCertificateNumber,'川建安B(2024)0000001');
});
test('V11 safety A and C proofs never stand in for manager B or registration',()=>{
 for(const cls of ['A','C2']){const [r]=recognizeCertificates(doc(`安全生产考核合格证书\n姓名：测试人\n证书编号：川建安${cls}(2024)0000001\n聘用企业：演示企业有限公司`)).candidates;
 assert.equal(r.type,'personnel');assert.equal(r.fields.evidence[0].kind,'certificate');assert.equal(r.fields.bCertificateNumber,undefined);}
});
const personnel=(id,name,kind='registration',employer='演示企业有限公司')=>({id,type:'personnel',name,verified:false,documentIds:[id],fields:{subjectName:employer,employer,certificateNumber:'TEST-001',evidence:[{kind,documentId:id,verified:false}]},sources:[],recognition:{status:'pending',missingFields:[],conflicts:[],sourceComplete:true}});
test('V11 personnel merge uses individual identity, credential kind and employer rather than company subject alone',()=>{
 for(const other of [personnel('b','另一人'),personnel('b','测试人','bCertificate'),personnel('b','测试人','registration','另一企业有限公司')]){
  assert.equal(mergeCertificateCandidates([personnel('a','测试人')],[other]).records.length,2);
 }
 assert.equal(mergeCertificateCandidates([personnel('a','测试人')],[personnel('b','测试人')]).records.length,1);
});
test('V11 repeated page number cannot join different named persons before merging',()=>{
 const d=doc('二级建造师注册证书\n姓名：测试人\n注册编号：TEST-001\n注册单位：演示企业有限公司');
 d.extraction.blocks.push({id:'p2',page:2,kind:'ocr',text:d.extraction.blocks[0].text.replace('测试人','另一人')});
 const result=recognizeCertificates(d);assert.equal(result.candidates.length,2);assert.deepEqual(result.candidates.map(r=>r.name),['测试人','另一人']);
});
test('V11 untitled continuation with a repeated number still cannot join another person or employer',()=>{
 for(const replacement of [['测试人','另一人'],['演示企业有限公司','另一企业有限公司']]){
  const first='二级建造师注册证书\n姓名：测试人\n注册编号：TEST-001\n注册单位：演示企业有限公司',d=doc(first);
  d.extraction.blocks.push({id:'p2',page:2,kind:'ocr',text:first.replace('二级建造师注册证书\n','').replace(...replacement)});
  assert.equal(recognizeCertificates(d).candidates.length,2);
 }
});
test('V11 same-page untitled blocks cannot silently overwrite a different person under the same number',()=>{
 const first='二级建造师注册证书\n姓名：测试人\n注册编号：TEST-001\n注册单位：演示企业有限公司',d=doc(first);
 d.extraction.blocks.push({id:'same-page-2',page:1,kind:'ocr',text:first.replace('二级建造师注册证书\n','').replace('测试人','另一人')});
 const r=recognizeCertificates(d);assert.equal(r.candidates.length,2);assert.deepEqual(r.candidates.map(c=>c.name),['测试人','另一人']);
 assert.ok(r.candidates.every(c=>c.fields.evidence[0].kind==='registration'));
});
