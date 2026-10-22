import test from 'node:test';
import assert from 'node:assert/strict';
import * as extractor from '../src/core/extractor.js';

// Credential numbers are synthetic; paired values preserve OCR comparison cases.
const attempt = (text, confidence) => ({ text, confidence });

test('v13 spaced OCR certificate titles trigger the certificate comparison without a descriptive filename', () => {
  assert.equal(extractor.isCertificateOCR('人员扫描.png', '安 全 生 产 考 核 合 格 证 书\n姓 名：李 明'), true);
  assert.equal(extractor.isCertificateOCR('扫描.png', '中 华 人 民 共 和 国 一 级 建 造 师 注 册 证 书'), true);
  assert.equal(extractor.isCertificateOCR('扫描.png', '建筑业企\n业资质证书'), true);
  assert.equal(extractor.isCertificateOCR('现场照片.jpg', '办公楼入口及停车场'), false);
});

test('v13 more labels cannot replace a pass whose readable certificate number and date disappear', () => {
  const original = attempt('建筑业企业资质证书\n证书编号：D123T45678\n有效期：至2028年09月12日', 70);
  const enhanced = attempt('企业名称：交儿膏训\n法定代表人：汛胡间\n资质类别：We心加\n证书编号：[13\n有效期：EsJUNG\n注册资本：不清楚', 59);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), original);
});

test('v13 an enhancement retaining the same number and calendar date can improve the reading', () => {
  const original = attempt('证书编号：D123T45678\n有效期：至2028年9月12日\nXYZ', 60);
  const enhanced = attempt('企业名称：示例建设有限公司\n法定代表人：李明\n资质类别：施工劳务不分等级\n证书编号：D123T45678\n有效期：至2028-09-12', 90);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), enhanced);
});

test('v13 a different alphanumeric certificate number is not a harmless OCR improvement', () => {
  const original = attempt('证书编号：D123T45678\n有效期至：2028-09-12', 60);
  const enhanced = attempt('企业名称：示例建设有限公司\n法定代表人：李明\n资质类别：施工劳务\n证书编号：D123T45679\n有效期至：2028-09-12', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), original);
});

test('v13 selection preserves every original transcript exactly', () => {
  const original = attempt('  证 书 编 号：D123T45678\n有 效 期 至：2028 年 09 月 12 日\n', 70);
  const enhanced = attempt('企业名称：示例建设有限公司\n证书编号：没有数字\n有效期至：不清楚', 99);
  const before = structuredClone([original, enhanced]);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), original);
  assert.deepEqual([original, enhanced], before);
});

test('v13 unreadable original without number or date can still accept a better enhancement', () => {
  const original = attempt('xxx | ||', 20);
  const enhanced = attempt('企业名称：示例建设有限公司\n证书编号：D123T45678\n有效期至：2028年09月12日', 80);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), enhanced);
});

test('v13 ordinary page digits do not freeze a poor attempt when credential fields improve', () => {
  const original = attempt('证书\n第 1 2 3 4 5 6 页', 25);
  const enhanced = attempt('职业培训合格证书\n姓名：测试人\n企业名称：示例企业有限公司\n证书编号：0132000000000000001\n第1页', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), enhanced);
});

test('v13 a known credential keeps its core identifier without freezing trailing OCR decoration', () => {
  const original = attempt('安全生产考核合格证书\n证书编号：川交安 C26G00001 Arif ST\n有效期至：2028-07-04', 60);
  const enhanced = attempt('安全生产考核合格证书\n姓名：测试人\n企业名称：示例企业有限公司\n证书编号：川交安C26G00001\n有效期至：2028-07-04', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), enhanced);
});

test('v13 report identifiers keep legal suffix protection alongside registration in the same transcript', () => {
  const original = attempt('一级建造师注册证书\n注册编号：鲁1012026000000001\n检测报告\n报告编号：鲁1234567890123A', 60);
  const enhanced = attempt('一级建造师注册证书\n姓名：测试人\n企业名称：示例有限公司\n注册编号：鲁1012026000000001\n检测报告\n报告编号：鲁1234567890123B', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), original);
});

test('v13 a report identifier never loses a legal numeric suffix during OCR comparison', () => {
  const original = attempt('检测报告\n报告编号：D123T45678-2026', 60);
  const enhanced = attempt('检测报告\n企业名称：示例企业有限公司\n法定代表人：测试人\n报告编号：D123T45678', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), original);
});

test('v13 a generic certificate-number label inside a report preserves the complete legal identifier', () => {
  const original = attempt('检测报告\n证书编号：D123T45678-2026', 60);
  const enhanced = attempt('检测报告\n企业名称：示例企业有限公司\n法定代表人：测试人\n证书编号：D123T45678', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), original);
});

test('v13 a readable bare training coding label remains an important identifier', () => {
  const original = attempt('职业培训合格证\n编码：0132000000000000001', 60);
  const enhanced = attempt('职业培训合格证\n企业名称：示例企业有限公司\n法定代表人：测试人\n姓名：测试人', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), original);
});

test('v13 a footer date cannot inherit an unreadable issue-date label from a previous line', () => {
  const original = attempt('职业培训合格证\n发证日期：不清楚\n第1页：2026-10-20\n证书编码：0132000000000000001', 30);
  const enhanced = attempt('职业培训合格证\n姓名：测试人\n企业名称：示例企业有限公司\n发证日期：2025-04-18\n证书编码：0132000000000000001', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), enhanced);
});

test('v13 explicit contract amount fields remain protected when an enhancement omits them', () => {
  for (const label of ['合同金额','合同价款','价税合计']) {
    const original = attempt(`合同\n${label}：人民币100.50万元`, 60);
    const enhanced = attempt('合同\n企业名称：示例企业有限公司\n法定代表人：测试人\n合同编号：TEST-20260001', 95);
    assert.equal(extractor.chooseOCRAttempt(original, enhanced), original, label);
  }
});

test('v13 matching contract amounts normalize units decimal formatting and equivalent currency labels', () => {
  const original = attempt('合同\n合同金额：人民币100.50万元', 60);
  const enhanced = attempt('合同\n企业名称：示例企业有限公司\n合同金额：CNY 1,005,000.00元', 95);
  assert.equal(extractor.chooseOCRAttempt(original, enhanced), enhanced);
  const dollars = attempt('合同\n合同价款：USD 100.50', 60);
  const sameDollars = attempt('合同\n企业名称：示例企业有限公司\n合同价款：US$100.500美元', 95);
  assert.equal(extractor.chooseOCRAttempt(dollars, sameDollars), sameDollars);
});

test('v13 changed contract amount or currency is not accepted as a harmless OCR improvement', () => {
  const original = attempt('合同\n价税合计：USD100.50', 60);
  for (const value of ['USD100.51','人民币100.50元']) {
    const enhanced = attempt(`合同\n企业名称：示例企业有限公司\n法定代表人：测试人\n价税合计：${value}`, 95);
    assert.equal(extractor.chooseOCRAttempt(original, enhanced), original, value);
  }
});

test('v13 contract amount units in the label remain protected and match the ordinary tax annotation form', () => {
  for (const label of ['合同金额（万元）','合同金额（含税）（万元）','合同金额（万元）（含税）']) {
    const original = attempt(`合同\n${label}：100.50`, 60);
    const missing = attempt('合同\n企业名称：示例公司\n法定代表人：测试人\n合同编号：DEMO-20260001', 95);
    const equivalent = attempt('合同\n企业名称：示例公司\n合同金额(含税)：人民币1,005,000.00元', 95);
    assert.equal(extractor.chooseOCRAttempt(original, missing), original, label);
    assert.equal(extractor.chooseOCRAttempt(original, equivalent), equivalent, label);
  }
});
