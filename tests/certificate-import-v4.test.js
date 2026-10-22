import {test} from 'node:test';
import assert from 'node:assert/strict';

const api=()=>import('../src/core/certificate-import.js');
const doc=(texts,id='doc-1')=>({id,fileName:'演示测试证件.txt',extraction:{complete:true,warnings:[],blocks:texts.map((text,i)=>({id:`${id}-b${i}`,text,page:i+1,section:'测试'}))}});
const energy=(number='E-001',until='2028-01-01',extra='')=>`节能产品认证证书\n制造商 演示制造有限公司 产品名称测试水嘴 品牌演示牌 型号 M-1、M-2 证书编号 ${number} 颁发机构 测试机构 有效期自2024年1月1日 有效期至${until} ${extra}`;

test('automatic mixed certificates extract labels without punctuation and retain exact field original sources',async()=>{
 const {recognizeCertificates}=await api();const d=doc(['营业执照\n名称 演示企业有限公司\n统一社会信用代码 91370000TEST000001\n法定代表人 测试人',energy()]);const {candidates}=recognizeCertificates(d);
 assert.equal(candidates.length,2);assert.deepEqual(candidates.map(c=>c.type),['entity','product']);assert.equal(candidates[0].fields.registeredName,'演示企业有限公司');
 const p=candidates[1];assert.equal(p.fields.manufacturer,'演示制造有限公司');assert.equal(p.fields.certificateType,'energy');assert.deepEqual(p.fields.coveredModels,['M-1','M-2']);assert.equal(p.fields.validFrom,'2024-01-01');assert.equal(p.fields.validUntil,'2028-01-01');assert.equal(p.fields.certificateStatus,'unknown');assert.equal(p.verified,false);assert.equal(p.recognition.status,'complete');
 for(const c of candidates)for(const s of c.sources){const b=d.extraction.blocks.find(b=>b.id===s.blockId);assert.ok(b.text.includes(s.quote));assert.equal(s.page,b.page);}
});
test('one text block containing multiple certificates produces independent candidates',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc([energy()+'\n中国环境标志产品认证证书\n制造商 演示制造有限公司 产品名称测试水嘴 型号 M-2 证书编号 H-002 发证机关测试机构 有效期至2029-01-01']));assert.equal(r.candidates.length,2);assert.equal(r.candidates[1].fields.certificateType,'environment');assert.equal(r.candidates[0].fields.certificateNumber,'E-001');assert.equal(r.candidates[1].fields.certificateNumber,'H-002');
});
test('same page split blocks and table labels link fields but unrelated next pages do not contaminate first certificate',async()=>{
 const {recognizeCertificates}=await api();const d=doc(['节能产品认证证书\n制造商：演示厂\n证书编号：E-1','产品名称 | 测试产品\n规格型号 | M-1\n有效期至 | 2028-01-01','中国环境标志产品认证证书\n制造商：另一个厂\n证书编号：H-1']);d.extraction.blocks[1].page=1;
 const r=recognizeCertificates(d);assert.equal(r.candidates.length,2);assert.equal(r.candidates[0].fields.model,'M-1');assert.equal(r.candidates[1].fields.model,undefined);assert.equal(r.candidates[1].recognition.status,'pending');
});
test('explicit repeated certificate number links a continuation page while unlabeled next page remains pending',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['节能产品认证证书\n制造商：演示厂\n证书编号：E-1','证书编号：E-1\n型号：M-1\n有效期至：2028-01-01','型号：OTHER\n有效期至：2030-01-01']));assert.equal(r.candidates.length,2);assert.equal(r.candidates[0].fields.model,'M-1');assert.equal(r.candidates[1].recognition.status,'pending');assert.equal(r.candidates[1].fields.model,'OTHER');
});
test('incomplete source and ambiguous OCR stay pending without fabricating verification or dates',async()=>{
 const {recognizeCertificates}=await api();const d=doc([energy('E-1','2028-02-31')]);d.extraction.complete=false;d.extraction.warnings=[{code:'OCR_REVIEW_REQUIRED',message:'置信度 52%'}];const r=recognizeCertificates(d);assert.equal(r.candidates[0].fields.validUntil,undefined);assert.equal(r.candidates[0].recognition.sourceComplete,false);assert.equal(r.candidates[0].recognition.status,'pending');assert.ok(r.warnings.length);assert.equal(r.candidates[0].verified,false);
});
test('duplicate sources merge, renewal remains a separate version, conflicts never replace confirmed fields',async()=>{
 const {recognizeCertificates,mergeCertificateCandidates}=await api();const first=recognizeCertificates(doc([energy()])).candidates[0];first.verified=true;first.fields.evidence[0].verified=true;
 const duplicate=recognizeCertificates(doc([energy()],'doc-2')).candidates[0];const d=mergeCertificateCandidates([first],[duplicate]);assert.equal(d.records.length,1);assert.equal(d.importSummary.duplicates,1);assert.equal(d.records[0].verified,true);assert.deepEqual(d.records[0].documentIds,['doc-1','doc-2']);
 const renewal=recognizeCertificates(doc([energy('E-001','2030-01-01').replace('2024年1月1日','2028年1月2日')],'doc-3')).candidates[0];const r=mergeCertificateCandidates(d.records,[renewal]);assert.equal(r.records.length,2);assert.equal(r.importSummary.renewals,1);assert.equal(r.records[1].recognition.previousRecordId,first.id);
 const conflict=recognizeCertificates(doc([energy().replace('演示牌','冲突品牌')],'doc-4')).candidates[0];const c=mergeCertificateCandidates([first],[conflict]);assert.equal(c.importSummary.conflicts,1);assert.equal(c.records[0].fields.brand,'演示牌');assert.equal(c.records[0].verified,true);assert.equal(c.records[1].recognition.status,'conflict');assert.equal(c.records[1].verified,false);assert.equal(first.documentIds.length,1);
});
test('uncertain identity cannot collapse different certificates and manual legacy type remains accepted',async()=>{
 const {recognizeCertificates,mergeCertificateCandidates}=await api();const r=recognizeCertificates(doc(['项目名称：测试工程\n合同编号：HT-01\n合同签订日期：2023年1月1日\n合同金额：50万元']),{type:'performance'});assert.equal(r.candidates[0].fields.amount,500000);assert.equal(r.candidates[0].fields.contractDate,'2023-01-01');assert.equal(r.candidates[0].type,'performance');
 const p=recognizeCertificates(doc(['节能产品认证证书\n型号：M-1'])).candidates;const m=mergeCertificateCandidates(p,recognizeCertificates(doc(['节能产品认证证书\n型号：M-1'],'doc-2')).candidates);assert.equal(m.records.length,2);assert.equal(m.importSummary.pending,1);
});
test('repeated number labels without repeated titles split separate certificates',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['节能产品认证证书\n证书编号：E-1\n制造商：测试甲厂\n型号：A\n有效期至：2028-01-01\n证书编号：E-2\n制造商：测试乙厂\n型号：B\n有效期至：2029-01-01']));assert.equal(r.candidates.length,2);assert.equal(r.candidates[0].fields.manufacturer,'测试甲厂');assert.equal(r.candidates[1].fields.manufacturer,'测试乙厂');assert.equal(r.candidates[1].fields.certificateType,'energy');
});
test('certificate-name label title is part of the certificate rather than an extra empty candidate',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['证书名称：节能产品认证证书\n制造商：测试厂\n型号：A\n证书编号：E-1\n有效期至：2028-01-01']));assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].fields.certificateType,'energy');
});
test('columnar table headers retain exact original values and derive covered models',async()=>{
 const {recognizeCertificates}=await api();const d=doc(['节能产品认证证书','制造商 | 产品名称 | 型号 | 证书编号 | 有效期至\n演示制造有限公司 | 演示产品 | M-1 | E-01 | 2028-01-01']);d.extraction.blocks[1].page=1;d.extraction.blocks[1].kind='table';d.extraction.blocks[1].tableHeaders=['制造商','产品名称','型号','证书编号','有效期至'];d.extraction.blocks[1].tableRows=[['演示制造有限公司','演示产品','M-1','E-01','2028-01-01']];const r=recognizeCertificates(d);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].fields.manufacturer,'演示制造有限公司');assert.equal(r.candidates[0].fields.certificateNumber,'E-01');assert.equal(r.candidates[0].recognition.status,'complete');for(const source of r.candidates[0].sources)assert.ok(d.extraction.blocks.find(b=>b.id===source.blockId).text.includes(source.quote));
});
test('duplicate first version after renewal merges the matching version and does not create an artificial conflict',async()=>{
 const {recognizeCertificates,mergeCertificateCandidates}=await api();const old=recognizeCertificates(doc([energy()])).candidates,newer=recognizeCertificates(doc([energy('E-001','2030-01-01').replace('2024年1月1日','2028年1月2日')],'new')).candidates;const initial=mergeCertificateCandidates(old,newer),again=mergeCertificateCandidates(initial.records,recognizeCertificates(doc([energy()],'repeat')).candidates);assert.equal(again.records.length,2);assert.equal(again.importSummary.duplicates,1);assert.equal(again.importSummary.conflicts,0);assert.equal(again.records[0].documentIds.at(-1),'repeat');
});
test('preface and Chinese heading prefix do not create phantom certificates; actual titles outrank incidental credit code',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['以下为测试虚构证件，不代表真实企业资格。','建筑业企业资质证书\n企业名称：演示企业\n统一社会信用代码：91370000TEST000001\n资质类别：建筑工程\n证书编号：Q-01\n有效期至：2028-01-01','中国节能产品认证证书\n制造商：演示企业\n统一社会信用代码：91370000TEST000001\n型号：M-1\n证书编号：E-01\n有效期至：2028-01-01']));assert.equal(r.candidates.length,2);assert.deepEqual(r.candidates.map(c=>c.type),['qualification','product']);assert.equal(r.candidates[1].fields.certificateType,'energy');
});
test('repeated page heading with same number continues the same certificate but different validity is separate',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc([energy(),'节能产品认证证书\n证书编号：E-001\n制造商：演示制造有限公司\n型号：M-1、M-2\n有效期至：2028-01-01']));assert.equal(r.candidates.length,1);assert.ok(r.candidates[0].sources.some(s=>s.page===2));const versions=recognizeCertificates(doc([energy(),energy('E-001','2030-01-01')]));assert.equal(versions.candidates.length,2);
});
test('multiline labels without colons preserve fields with original newlines and single validity interval',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['节能产品认证证书\n制造商\n演示制造有限公司\n产品名称\n演示水嘴\n型号\nM-1\n证书编号\nE-01\n有效期 2024年1月1日至2028年1月1日']));assert.equal(r.candidates[0].fields.manufacturer,'演示制造有限公司');assert.equal(r.candidates[0].fields.validFrom,'2024-01-01');assert.equal(r.candidates[0].fields.validUntil,'2028-01-01');assert.equal(r.candidates[0].recognition.status,'complete');
});
test('an internally conflicting duplicate must preserve incoming conflict rather than silently retaining complete state',async()=>{
 const {recognizeCertificates,mergeCertificateCandidates}=await api();const first=recognizeCertificates(doc([energy()])).candidates,conflict=recognizeCertificates(doc([energy()+'\n品牌：冲突品牌'],'duplicate')).candidates;const r=mergeCertificateCandidates(first,conflict);assert.equal(r.importSummary.conflicts,1);assert.equal(r.records.at(-1).recognition.status,'conflict');assert.equal(r.importSummary.pending,1);
});
test('specialty words inside a category value are not mistaken for labels',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['建筑业企业资质证书\n企业名称：演示建筑企业\n资质类别：防水防腐保温工程专业承包\n等级：二级\n证书编号：Q-01\n有效期至：2028-01-01']));assert.equal(r.candidates[0].fields.category,'防水防腐保温工程专业承包');assert.equal(r.candidates[0].fields.specialty,undefined);
});
test('issuer names containing issuer label aliases and semicolon business scope stay complete',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['营业执照\n名称：测试企业\n统一社会信用代码：91370000TEST000001\n经营范围：建筑工程施工；防水工程；材料销售。',energy().replace('颁发机构 测试机构','发证机关：测试发证机构')]));assert.equal(r.candidates[0].fields.businessScope,'建筑工程施工；防水工程；材料销售。'.normalize('NFKC'));assert.equal(r.candidates[1].fields.issuer,'测试发证机构');
});
test('reimport of the same original never clears explicit proof verification stamp or validity',async()=>{
 const {recognizeCertificates,mergeCertificateCandidates}=await api();const first=recognizeCertificates(doc([energy()])).candidates[0];first.verified=true;first.fields.evidence[0]={...first.fields.evidence[0],verified:true,stamped:true,valid:true};const result=mergeCertificateCandidates([first],recognizeCertificates(doc([energy()])).candidates);assert.equal(result.importSummary.duplicates,1);assert.deepEqual(result.records[0].fields.evidence[0],first.fields.evidence[0]);assert.equal(result.records[0].verified,true);
});
test('document title and actual qualification category are distinct fields without a fabricated conflict',async()=>{
 const {recognizeCertificates}=await api();const r=recognizeCertificates(doc(['证书名称：建筑业企业资质证书\n企业名称：演示企业\n资质类别：防水防腐保温工程专业承包\n证书编号：Q-01\n有效期至：2028-01-01']));assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].fields.category,'防水防腐保温工程专业承包');assert.equal(r.candidates[0].recognition.status,'complete');
});
test('B1 model-size alias wins longest label match and preserves exact original field quote',async()=>{
 const {recognizeCertificates}=await api();const d=doc([energy().replace('型号 M-1、M-2','型号规格：SZ-1、SZ-2')]);const p=recognizeCertificates(d).candidates[0];assert.equal(p.fields.model,'SZ-1、SZ-2');assert.deepEqual(p.fields.coveredModels,['SZ-1','SZ-2']);assert.ok(p.sources.some(s=>s.field==='model'&&s.quote.includes('型号规格：SZ-1、SZ-2')));
});
test('B2 actual OCR 95-percent text spaced dates populate clear facts while originals and OCR pending state remain',async()=>{
 const {recognizeCertificates}=await api();const d=doc(['中国节能产品认证证书','制造商 : 演示制造有限公司 ( 测试 )\n产品名称 : 激光打印机','规格型号 : TEST-LP100','覆盖型号 : TESTLP100、TEST-LP200\n证书编号 : CQC-TEST-ENERGY001\n发证机构 : 中国质量认证中心 ( 测试文本 )\n有效期自 : 2025 年 1 月 1 日','有效期至 : 2030 年 1 月 1 日']);for(const b of d.extraction.blocks){b.page=null;b.kind='ocr';}d.extraction.warnings=[{code:'OCR_REVIEW_REQUIRED',message:'置信度 95%'}];const p=recognizeCertificates(d).candidates[0];assert.equal(p.fields.validFrom,'2025-01-01');assert.equal(p.fields.validUntil,'2030-01-01');assert.equal(p.recognition.status,'pending');assert.equal(p.verified,false);assert.ok(!p.recognition.missingFields.includes('validUntil'));assert.ok(p.sources.some(s=>s.field==='validUntil'&&s.quote==='有效期至 : 2030 年 1 月 1 日'));for(const s of p.sources)assert.ok(d.extraction.blocks.find(b=>b.id===s.blockId).text.includes(s.quote));
});
test('B3 actual CCC and ISO headings outrank incidental product words energy-saving lamp and environmental sign',async()=>{
 const {recognizeCertificates}=await api();for(const [heading,name,expected]of [['强制性产品认证证书','节能灯','ccc'],['CCC认证证书','环境标志牌','ccc'],['ISO9001质量管理体系认证证书','节能灯','iso'],['产品检测报告','节能灯','testReport'],['中国节能产品认证证书','环境标志牌','energy']]){const p=recognizeCertificates(doc([energy().replace('节能产品认证证书',heading).replace('测试水嘴',name)])).candidates[0];assert.equal(p.fields.certificateType,expected);assert.ok(p.sources.some(s=>s.field==='certificateType'&&s.quote.includes(expected==='iso'?'ISO9001':heading)));}const other=recognizeCertificates(doc([energy().replace('节能产品认证证书','普通产品证书').replace('测试水嘴','节能灯')])).candidates[0];assert.equal(other.fields.certificateType,'other');assert.equal(other.recognition.status,'pending');
});
test('B4 semicolon and newline coverage retains each explicit model plus all original coverage lines',async()=>{
 const {recognizeCertificates}=await api();for(const list of ['SZ-1；SZ-2；SZ-3','SZ-1\nSZ-2\nSZ-3']){const d=doc([energy().replace('型号 M-1、M-2',`覆盖型号：${list}`)]);const p=recognizeCertificates(d).candidates[0];assert.deepEqual(p.fields.coveredModels,['SZ-1','SZ-2','SZ-3']);assert.equal(p.recognition.status,'complete');const s=p.sources.find(s=>s.field==='coveredModels');assert.ok(s.quote.includes(list));assert.ok(d.extraction.blocks[0].text.includes(s.quote));}const incomplete=recognizeCertificates(doc([energy().replace('型号 M-1、M-2','覆盖型号：共3款\nSZ-1\nSZ-2')])).candidates[0];assert.equal(incomplete.recognition.status,'pending');assert.ok(incomplete.recognition.missingFields.includes('coveredModels'));
});
test('automatic imports cannot resolve a conflict even when an external candidate supplies resolved true',async()=>{
 const {recognizeCertificates,mergeCertificateCandidates}=await api();const p=recognizeCertificates(doc([energy()+'\n品牌：冲突品牌'])).candidates[0];p.recognition.conflicts[0].resolved=true;const r=mergeCertificateCandidates([], [p]);assert.equal(r.records[0].recognition.conflicts[0].resolved,false);assert.equal(r.records[0].verified,false);
});
test('B4 generic validity interval ends model coverage while actual newline model continuation stays intact',async()=>{
 const {recognizeCertificates}=await api();const interval='有效期：2026年1月1日至2028年12月31日';
 for(const label of ['型号规格','覆盖型号'])for(const list of ['SZ-1、SZ-2','SZ-1\nSZ-2']){
  const d=doc([`中国节能产品认证证书\n证书编号：TEST-ENERGY-123456\n制造商：测试制造商（虚构）\n产品名称：水嘴\n${label}：${list}\n${interval}`]),p=recognizeCertificates(d).candidates[0];
  assert.deepEqual(p.fields.coveredModels,['SZ-1','SZ-2']);assert.ok(!p.fields.model.includes('有效期'));assert.equal(p.fields.validFrom,'2026-01-01');assert.equal(p.fields.validUntil,'2028-12-31');assert.equal(p.recognition.status,'complete');
  for(const field of ['validFrom','validUntil'])assert.ok(p.sources.some(s=>s.field===field&&s.quote===interval));const coverage=p.sources.filter(s=>s.field==='coveredModels');assert.ok(coverage.some(s=>s.quote.includes(list)));assert.ok(coverage.every(s=>!s.quote.includes('有效期')));for(const s of p.sources)assert.ok(d.extraction.blocks[0].text.includes(s.quote));
 }
});
