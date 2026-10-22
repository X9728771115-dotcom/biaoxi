import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizeCertificates, mergeCertificateCandidates } from '../src/core/certificate-import.js';

// All names and identifiers below are synthetic; the credit code has a test-only checksum.
function document(text, kind = 'paragraph') {
  return { id: 'certificate-v5', fileName: '测试证照.txt', extraction: { complete: true, warnings: kind === 'ocr' ? [{ code: 'OCR_REVIEW_REQUIRED', message: '测试 OCR 原文待核验' }] : [], blocks: [{ id: 'source-1', text, page: 1, kind }] } };
}
function exactSources(candidate, doc) {
  for (const source of candidate.sources) assert.ok(doc.extraction.blocks.find(block => block.id === source.blockId)?.text.includes(source.quote), source.quote);
}

test('v5 license stops adjacent registration labels and reads spaced labels without changing original quotes', () => {
  const d = document('营业执照\n名 称：测试建设有限公司注册资本伍仟万元整\n统一 社会 信用 代码：９１００００００ＭＡ０ＤＥＭＱ００Ｌ\n法 定 代 表 人：李示例住所成都市测试路9号\n经营范围：建筑施工；材料销售。登记机关：测试登记机关');
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.type, 'entity');
  assert.equal(c.fields.registeredName, '测试建设有限公司');
  assert.equal(c.fields.legalRepresentative, '李示例');
  assert.equal(c.fields.creditCode, '91000000MA0DEMQ00L');
  assert.equal(c.fields.businessScope, '建筑施工;材料销售。');
  exactSources(c, d);
});

test('v5 rejects garbled legal names and invalid credit codes while retaining their field sources and pending status', () => {
  const d = document('营业执照\n名称：测试建设有限公司\n统一社会信用代码：91O00000MA0DEMQ00L\n法定代表人：wow佳 Fi GE rEmRess Easy\n经营范围：建筑施工。', 'ocr');
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.fields.legalRepresentative, undefined);
  assert.equal(c.fields.creditCode, undefined);
  assert.equal(c.recognition.status, 'pending');
  assert.ok(c.recognition.missingFields.includes('legalRepresentative'));
  assert.ok(c.recognition.missingFields.includes('creditCode'));
  assert.ok(c.sources.some(source => source.field === 'legalRepresentative' && source.quote.includes('wow佳 Fi GE rEmRess Easy')));
  assert.ok(c.sources.some(source => source.field === 'creditCode' && source.quote.includes('91O00000MA0DEMQ00L')));
  assert.equal(c.verified, false);
  exactSources(c, d);
});

test('v5 an exact standalone valid credit code is usable despite a damaged OCR label, without substituting ambiguous glyphs', () => {
  const d = document('营业执照\n统一社会篇用代礁\n91000000MA0DEMQ00L\n名称：测试建设有限公司\n法定代表人：李示例', 'ocr');
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.fields.creditCode, '91000000MA0DEMQ00L');
  assert.ok(c.sources.some(source => source.field === 'creditCode' && source.quote === '91000000MA0DEMQ00L'));
  assert.equal(c.recognition.status, 'pending');
  exactSources(c, d);
});

test('v5 qualification title fragment outranks the incidental business-license registration label', () => {
  const d = document('建筑业企业资质\n企业名称：测试建设有限公司\n营业执照注册号：待核对\n证书编号：D000000001\n资质类别：建筑工程施工总承包二级\n有效期至：2030年01月03日');
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.type, 'qualification');
  assert.equal(c.fields.subjectName, '测试建设有限公司');
  assert.equal(c.fields.certificateNumber, 'D000000001');
  exactSources(c, d);
});

for (const separator of [' ', '\n']) test(`v5 qualification registration label separated by ${separator === ' ' ? 'space' : 'newline'} never starts a business-license record`, () => {
  const d = document(`建筑业企业资质\n企业名称：测试建设有限公司\n营业执照${separator}注册号：待核对\n证书编号：D000000001\n资质类别：建筑工程施工总承包二级\n有效期至：2030年01月03日`);
  const candidates = recognizeCertificates(d).candidates;
  assert.equal(candidates.length, 1);
  const c = candidates[0];
  assert.equal(c.type, 'qualification');
  assert.equal(c.fields.subjectName, '测试建设有限公司');
  assert.equal(c.fields.certificateNumber, 'D000000001');
  assert.equal(c.fields.category, '建筑工程施工总承包二级');
  assert.equal(c.fields.validUntil, '2030-01-03');
  exactSources(c, d);
});

test('v5 mixed qualification uses clear native certificate values while retaining weak OCR sources', () => {
  const d = document('建筑业企业资质\n企业名称：“ 测试建四有限公司余\n营业执照注册号\n证书编号：0000000001\n资质类别及等级：3)', 'ocr');
  d.extraction.blocks.push({ id: 'native-1', page: 1, kind: 'paragraph', text: '测试建设有限公司\nD000000001 | 至2030年01月03日\n建筑工程施工总承包二级；\n四川省住房和城乡建设厅' });
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.type, 'qualification');
  assert.equal(c.fields.subjectName, '测试建设有限公司');
  assert.equal(c.fields.certificateNumber, 'D000000001');
  assert.equal(c.fields.validUntil, '2030-01-03');
  assert.equal(c.fields.category, '建筑工程施工总承包二级');
  assert.equal(c.fields.issuer, '四川省住房和城乡建设厅');
  assert.ok(c.sources.some(source => source.blockId === 'source-1'));
  assert.ok(c.sources.some(source => source.field === 'subjectName' && source.blockId === 'native-1'));
  assert.equal(c.recognition.status, 'pending');
  exactSources(c, d);
});

test('v5 joined native PDF lines still take precedence over a misspelled OCR company', () => {
  const d = document('建筑业企业资质证书\n企业名称：测试建爻有限公司\n证书编号：D000000001', 'ocr');
  d.extraction.blocks.push({ id: 'native-joined', page: 1, kind: 'paragraph', text: '测试建设有限公司成都市测试路9号91000000MA0DEMQ00L | 有限责任公司 D000000001 | 至2030年01月03日测试人' });
  d.extraction.blocks.push({ id: 'native-issuer', page: 1, kind: 'paragraph', text: '四川省住房和城乡建设厅2026年1月16日' });
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.fields.subjectName, '测试建设有限公司');
  assert.equal(c.fields.certificateNumber, 'D000000001');
  assert.equal(c.fields.issuer, '四川省住房和城乡建设厅');
  assert.ok(c.sources.some(source => source.field === 'subjectName' && source.blockId === 'native-joined'));
  exactSources(c, d);
});

test('v5 clearly titled native qualification can use printed values even when all field labels are an image', () => {
  const d = document('建筑业企业资质证书\n测试建设有限公司\nD000000001 | 至2030年01月03日\n建筑工程施工总承包二级；\n四川省住房和城乡建设厅');
  const candidates = recognizeCertificates(d).candidates;
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].type, 'qualification');
  assert.equal(candidates[0].fields.subjectName, '测试建设有限公司');
  assert.equal(candidates[0].fields.certificateNumber, 'D000000001');
  exactSources(candidates[0], d);
});

test('v5 OCR personnel name garbage remains missing instead of becoming a usable name', () => {
  const d = document('二级建造师注册证书\n姓名：wow佳 Fi GE\n注册编号：鲁2372020123456\n注册单位：测试建设有限公司\n有效期至：2030-01-03', 'ocr');
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.type, 'personnel');
  assert.ok(c.recognition.missingFields.includes('name'));
  assert.notEqual(c.name, 'wow佳 Fi GE');
  assert.ok(c.sources.some(source => source.field === 'name' && source.quote.includes('wow佳 Fi GE')));
  exactSources(c, d);
});

test('v5 uncertain OCR categories, certificate prose and impossible dates stay blank with original field evidence', () => {
  const d = document('建筑业企业资质证书\n企业名称：测试建设有限公司\n证书编号：wow佳 Fi GE\n资质类别及等级：3)\n有效期至：2030年02月31日', 'ocr');
  const c = recognizeCertificates(d).candidates[0];
  for (const field of ['category', 'certificateNumber', 'validUntil']) {
    assert.equal(c.fields[field], undefined);
    assert.ok(c.recognition.missingFields.includes(field));
    assert.ok(c.sources.some(source => source.field === field));
  }
  assert.equal(c.recognition.status, 'pending');
  exactSources(c, d);
});

test('v5 automatic import keeps all five material classes independent and unverified', () => {
  const texts = [
    '营业执照\n名称：测试建设有限公司\n统一社会信用代码：91000000MA0DEMQ00L\n法定代表人：李示例',
    '建筑业企业资质证书\n企业名称：测试建设有限公司\n资质类别：建筑工程\n证书编号：Q-01\n有效期至：2030-01-03',
    '合同名称：测试屋面工程\n合同乙方：测试建设有限公司\n合同编号：HT-01\n合同金额：50万元\n合同签订日期：2026-01-03',
    '二级建造师注册证书\n姓名：测试人\n注册编号：鲁2372020123456\n注册单位：测试建设有限公司\n有效期至：2030-01-03',
    '强制性产品认证证书\n制造商：测试制造有限公司\n产品名称：测试灯具\n证书编号：CCC-01\n覆盖型号：A-1、A-2\n有效期至：2030-01-03'
  ];
  const d = document('');d.extraction.blocks = texts.map((text, index) => ({ id: `five-${index}`, text, page: index + 1, kind: 'paragraph' }));
  const candidates = recognizeCertificates(d).candidates;
  assert.deepEqual(candidates.map(candidate => candidate.type), ['entity', 'qualification', 'performance', 'personnel', 'product']);
  assert.equal(candidates[0].fields.creditCode, '91000000MA0DEMQ00L');
  assert.equal(candidates[1].fields.certificateNumber, 'Q-01');
  assert.equal(candidates[2].fields.amount, 500000);
  assert.equal(candidates[3].name, '测试人');
  assert.deepEqual(candidates[4].fields.coveredModels, ['A-1', 'A-2']);
  for (const candidate of candidates) { assert.equal(candidate.verified, false); exactSources(candidate, d); }
});

test('v5 multi-category construction qualification uses a short title while retaining every category and source', () => {
  const categories = ['公路工程施工总承包二级', '机电工程施工总承包二级', '电力工程施工总承包二级', '水利水电工程施工总承包二级', '市政公用工程施工总承包二级', '建筑工程施工总承包二级', '公路路基工程专业承包二级', '城市及道路照明工程专业承包二级', '建筑机电安装工程专业承包二级', '桥梁工程专业承包二级', '公路路面工程专业承包二级', '环保工程专业承包二级', '建筑装修装饰工程专业承包一级', '建筑幕墙工程专业承包一级', '防水防腐保温工程专业承包二级', '钢结构工程专业承包二级', '消防设施工程专业承包二级', '古建筑工程专业承包二级', '地基基础工程专业承包二级', '特种工程专业承包不分等级'];
  const categoryText = categories.join('；');
  const d = document('建筑业企业资质证书\n企业名称：测试建设有限公司\n证书编号：D000000001\n有效期至：2030-01-03');
  d.extraction.blocks.push({ id: 'all-categories', text: categoryText, page: 1, kind: 'paragraph' });
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.name, '建筑业企业资质证书');
  assert.ok(categoryText.length > 200);
  assert.equal(c.fields.category, categoryText.normalize('NFKC'));
  assert.equal(c.fields.subjectName, '测试建设有限公司');
  assert.ok(c.sources.some(source => source.field === 'category' && source.quote === categoryText));
  exactSources(c, d);
});

test('v5 unnamed records use their actual certificate title before category or company text', () => {
  for (const [text, expected] of [
    ['安全生产许可证\n企业名称：测试建设有限公司\n资质类别：建筑施工企业安全生产\n证书编号：安许证001\n有效期至：2030-01-03', '安全生产许可证'],
    ['建筑业企业资质\n企业名称：测试建设有限公司\n资质类别：建筑工程施工总承包二级\n证书编号：D000000001', '建筑业企业资质证书'],
    ['强制性产品认证证书\n制造商：测试制造有限公司\n证书编号：CCC-01\n型号：A-1', '强制性产品认证证书'],
    ['营业执照\n名称：测试建设有限公司\n统一社会信用代码：91000000MA0DEMQ00L', '营业执照']
  ]) {
    const d = document(text), c = recognizeCertificates(d).candidates[0];
    assert.equal(c.name, expected);
    exactSources(c, d);
  }
});

test('v5 explicit certificate names and existing manual record names survive default-name changes', () => {
  const d = document('建筑业企业资质证书\n证书名称：企业确认的施工资质资料\n企业名称：测试建设有限公司\n资质类别：建筑工程\n证书编号：D000000001\n有效期至：2030-01-03');
  const c = recognizeCertificates(d).candidates[0];
  assert.equal(c.name, '企业确认的施工资质资料');
  const existing = structuredClone(c);existing.name = '人工命名：投标使用正本';existing.verified = true;
  const merged = mergeCertificateCandidates([existing], [c]);
  assert.equal(merged.importSummary.duplicates, 1);
  assert.equal(merged.records[0].name, '人工命名：投标使用正本');
  assert.equal(merged.records[0].fields.subjectName, '测试建设有限公司');
});
