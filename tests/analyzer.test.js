import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Document, Packer, Paragraph} from 'docx';
import {confirmedCompanyFixture} from './fixtures/company-facts-fixture.js';

let implementation = {};
try { implementation = await import('../src/core/analyzer.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
function analyze(...args) {
  assert.equal(typeof implementation.analyzeDocument, 'function', '缺少真实文档分析实现');
  return implementation.analyzeDocument(...args);
}
function summarize(report) {
  assert.equal(typeof implementation.summarizeReport, 'function', '缺少报告重新归纳实现');
  return implementation.summarizeReport(report);
}
function document(lines, id = 'tender-1', sections = []) {
  return {
    id, fileName: `${id}.txt`, format: 'txt', complete: true, warnings: [],
    pages: [], blocks: lines.map((text, i) => ({
      id: `${id}-b${i + 1}`, documentId: id, fileName: `${id}.txt`,
      text, page: null, section: sections[i] || `第${i + 1}段`, kind: 'paragraph'
    }))
  };
}
const findings = report => report.categories.flatMap(category => category.items);
const category = (report, id) => report.categories.find(item => item.id === id);

test('从实际条款得到14类及四项输出，所有结论引用输入原文', () => {
  const input = document([
    '投标人须提交有效营业执照；经营范围信息供本项目适配核验。',
    '供应商须提供有效的ISO9001质量管理体系认证证书。',
    '商务20分、技术45分、价格30分、附加5分，总分100分；合同及验收材料作为商务评分证明。',
    '投标报价超过最高限价120万元的，投标将被否决。',
    '合同生效后支付30%，验收合格且收到发票后30日内支付65%，质保期满后支付5%。',
    '采购方式为公开招标；评审采用综合评分法；按推荐顺序确定中标人。',
    '不统一组织现场踏勘，供应商可自愿预约，不要求踏勘证明。',
    '办公椅样品1把，须在投标截止前递交；未提供样品仅该项不得分，不作为否决条件。',
    '资格要求：至少1项同类家具业绩，单项合同金额不少于30万元，验收日期不早于2023年1月1日，合同及验收证明同时提供。',
    '安装负责人1名，须有同类家具交付经验，提供最近连续3个月社保证明，不要求职业证书。',
    '投标保证金2万元，可提交银行保函或转账；投标截止前到账，未提交将被否决。',
    '采购清单中标注强制采购的产品，必须提供有效节能认证证书，其他环保认证仅作评分。',
    '前附表：质保期满后15日内支付尾款。',
    '合同草案：质保期满后30日内支付尾款。',
    '须提交交付承诺书，承诺合同生效后30日内完成供货安装，由授权代表签字并盖章。'
  ]);
  const report = analyze(input);
  assert.equal(report.categories.length, 14);
  for (const item of report.categories) assert.ok(item.items.length, `${item.title}缺失`);
  assert.equal(report.outputs.conclusion.label, '待核验');
  assert.ok(report.outputs.risks.length > 0);
  assert.ok(report.outputs.scoreItems.length > 0);
  assert.ok(report.outputs.commitments.length > 0);
  for (const item of findings(report)) {
    assert.ok(item.references.length);
    assert.ok(item.references.every(ref => input.blocks.some(block => block.id === ref.blockId && block.text.includes(ref.quote))));
    assert.equal(item.matchStatus, 'pending');
    assert.ok(Object.keys(item.fields).every(key => /[\u4e00-\u9fff]/.test(key)));
  }
});

test('未提供评分材料只影响得分，含否决一词的否定句不能成为硬条件', () => {
  const report = analyze(document(['样品评分最高10分；未提供样品仅该项不得分，不作为否决投标条件。']));
  assert.ok(category(report, 'sample').items.length);
  assert.ok(category(report, 'scoring').items.length);
  assert.equal(findings(report).filter(item => item.hard).length, 0);
  assert.equal(report.outputs.risks.filter(item => item.hard).length, 0);
});

test('评分章节中的材料和后续句子关联，不把证明缺失推成资格失败', () => {
  const input = document(['同类家具供货业绩，每项2分，最高10分。', '须同时提供合同及验收证明，材料缺失不得分。'], 'score', ['商务评分标准', '商务评分标准']);
  const report = analyze(input);
  const item = category(report, 'performance').items[0];
  assert.equal(item.hard, false);
  assert.match(item.fields['用途'], /评分/);
  assert.ok(item.references.some(ref => ref.blockId === 'score-b2'));
  assert.match(JSON.stringify(item.fields), /合同.*验收/);
});

test('阈值、且或关系、否定和例外来自同一原文，不被简化为词命中', () => {
  const report = analyze(document(['如由代理商投标，须提供制造商授权，且近三年至少2项业绩，每项金额不低于50万元；合同或验收证明任选其一，原厂直营除外。']));
  const item = category(report, 'performance').items[0];
  assert.equal(item.conditional, true);
  assert.match(item.quote, /原厂直营除外/);
  const fields = JSON.stringify(item.fields);
  assert.match(fields, /不低于50万元/);
  assert.match(fields, /至少2项/);
  assert.match(fields, /且/);
  assert.match(fields, /或/);
  assert.match(fields, /除外/);
});

test('明确强制采购醒目；非强制、评分认证及条件适用保持区别', () => {
  const yes = analyze(document(['清单标明的节能产品属于强制采购，须提供有效认证。']));
  assert.equal(category(yes, 'eco').items[0].priority, 'policy');
  assert.match(category(yes, 'eco').items[0].fields['强制采购'], /明确|是/);
  const no = analyze(document(['环境标志认证仅用于评分，不属于强制采购要求。']));
  assert.equal(category(no, 'eco').items[0].hard, false);
  assert.notEqual(category(no, 'eco').items[0].priority, 'policy');
  assert.match(category(no, 'eco').items[0].fields['强制采购'], /非|不/);
  const conditional = analyze(document(['如产品属于强制采购品目，才须提供节能认证；具体范围以附件为准。']));
  assert.equal(category(conditional, 'eco').items[0].matchStatus, 'pending');
  assert.equal(category(conditional, 'eco').items[0].conditional, true);
});

test('同事项冲突引用双方原文，不同付款节点不能误判为冲突', () => {
  const report = analyze(document(['前附表：质保期满后15日内支付尾款。', '合同草案：质保期满后30日内支付尾款。']));
  const conflict = category(report, 'consistency').items[0];
  assert.equal(conflict.references.length, 2);
  assert.match(conflict.quote, /15日/);
  assert.match(conflict.quote, /30日/);
  assert.equal(conflict.matchStatus, 'pending');
  const different = analyze(document(['合同生效后15日内支付预付款。', '验收后30日内支付验收款。']));
  assert.equal(category(different, 'consistency').items.length, 0);
});

test('附件属于本报告且证据可回链，每个主文件仍独立', () => {
  const main = document(['样品规格及数量见附件2。'], 'main');
  const attachment = document(['办公椅样品须提交2把，未提交仅样品项不得分。'], 'attachment');
  const report = analyze(main, {attachments: [attachment]});
  assert.equal(report.documentId, 'main');
  assert.ok(findings(report).some(item => item.references.some(ref => ref.documentId === 'attachment')));
  assert.equal(analyze(document(['无需提交样品。'], 'other')).documentId, 'other');
});

test('没有企业证照不判不满足，单次上传证照只形成可追溯有限比对', () => {
  const main = document(['须提供有效营业执照，统一社会信用代码应清晰可辨。']);
  const absent = analyze(main);
  assert.equal(category(absent, 'entity').items[0].matchStatus, 'pending');
  const evidence = document(['营业执照；企业名称：甲家具有限公司；统一社会信用代码：91310000TEST000001。'], 'license');
  const present = analyze(main, {evidence: [evidence]});
  const item = category(present, 'entity').items[0];
  assert.match(item.fields['证照比对'], /营业执照|已找到/);
  assert.ok(item.references.some(ref => ref.documentId === 'license'));
  assert.equal(item.matchStatus, 'pending');
  assert.equal(present.outputs.conclusion.label, '待核验');
});

test('人工确认硬门槛失败优先于其他评分或缺资料，重归纳保留警示', () => {
  const report = analyze(document(['投标保证金未在截止前提交的，投标将被否决。', '评分最高100分。']));
  const hard = findings(report).find(item => item.hard);
  hard.matchStatus = 'unmet'; hard.reviewed = true; hard.notes = '已核对截止后无法补交';
  const updated = summarize(report);
  assert.equal(updated.documentId, report.documentId);
  const outputs = updated.outputs;
  assert.ok(outputs, '重新归纳必须返回内含outputs的完整报告');
  assert.equal(outputs.conclusion.label, '不建议投');
  assert.ok(outputs.conclusion.reasons.some(reason => /保证金|否决/.test(reason)));
  assert.ok(outputs.risks.some(item => item.id === hard.id));
});

test('复核匹配只能按已确认状态应用，未知状态仍待核验', () => {
  const main = document(['投标保证金须提供2万元，未提交投标将被否决。']);
  const first = analyze(main); const id = findings(first).find(item => item.hard).id;
  const reviewed = analyze(main, {reviews: {[id]: {status: 'met', note: '已核对保函'}}});
  assert.equal(findings(reviewed).find(item => item.id === id).reviewed, true);
  assert.equal(findings(reviewed).find(item => item.id === id).matchStatus, 'met');
  assert.equal(reviewed.outputs.conclusion.label, '待核验');
  const invalid = analyze(main, {reviews: {[id]: {status: '满分'}}});
  assert.equal(findings(invalid).find(item => item.id === id).matchStatus, 'pending');
});

test('无法读取、空文档及未识别内容保持覆盖缺口而不生成虚构条款', () => {
  const empty = analyze({...document([]), complete: false, warnings: [{code: 'OCR_FAILED', message: '第2页识别失败', page: 2}]});
  assert.equal(findings(empty).length, 0);
  assert.equal(empty.outputs.conclusion.label, '待核验');
  assert.equal(empty.coverage.complete, false);
  assert.ok(empty.warnings.some(warning => /识别失败/.test(warning.message)));
  const unknown = analyze(document(['这是一段未包含可识别业务约束的文本。']));
  assert.equal(unknown.outputs.conclusion.label, '待核验');
  assert.ok(unknown.coverage.unrecognizedBlocks.length);
});

test('DOCX无页码不伪造页码，长表格原文仍保留证据锚点', () => {
  const table = document(['项目名称 | 参数 | 证明材料\n办公椅 | 承重不少于120kg | 提供检测报告。']);
  table.format = 'docx'; table.blocks[0].kind = 'table'; table.blocks[0].section = '采购需求表第2行';
  const report = analyze(table);
  assert.ok(findings(report).length);
  assert.ok(findings(report).every(item => item.references.every(ref => ref.page === null)));
  assert.ok(findings(report).some(item => item.references[0].section.includes('采购需求表')));
});

test('拒绝无依据补充结论，AI条款必须逐条对应已选文件原文', () => {
  const main = document(['本项目不接受联合体投标。']);
  const valid = {categoryId: 'qualification', title: '联合体限制', quote: '本项目不接受联合体投标。', references: [{blockId: 'tender-1-b1', documentId: 'tender-1', quote: '本项目不接受联合体投标。'}], source: 'ai'};
  const forged = {categoryId: 'qualification', title: '虚构门槛', quote: '供应商必须具有十年经验。', references: [{blockId: 'tender-1-b1', documentId: 'tender-1', quote: '供应商必须具有十年经验。'}], source: 'ai', hard: true, matchStatus: 'met'};
  const report = analyze(main, {additionalFindings: [valid, forged]});
  assert.ok(findings(report).some(item => item.source === 'ai' && item.title === '联合体限制'));
  assert.equal(findings(report).some(item => item.title === '虚构门槛'), false);
  assert.ok(report.warnings.some(item => /原文|依据/.test(item.message)));
  assert.equal(report.outputs.conclusion.label, '待核验');
});

test('附件缺失的引用须报告，明确无需提交不能反推为要求提交', () => {
  const report = analyze(document(['无需提供履约保证金。投标保证金具体退还条件见附件3。']));
  const deposit = category(report, 'deposit').items;
  assert.ok(deposit.some(item => /无需/.test(item.quote)));
  assert.ok(deposit.every(item => !item.hard));
  assert.ok(report.warnings.some(item => /附件/.test(item.message)));
});

test('同段资格门槛与额外加分必须分别保留，不能因含加分词取消门槛', () => {
  const report = analyze(document(['资格条件：至少1项同类业绩，合同及验收证明同时提交；资格通过后，每增加1项业绩加2分，最高10分。']));
  assert.ok(category(report, 'performance').items.some(item => item.hard));
  assert.match(category(report, 'performance').items[0].fields['用途'], /资格/);
  assert.ok(report.outputs.scoreItems.length);
});

test('同一段不同产品的质保年限不误报冲突', () => {
  const report = analyze(document(['办公桌质保期为3年。', '办公椅质保期为5年。']));
  assert.equal(category(report, 'consistency').items.length, 0);
});

test('不接受联合体是准入限制，不要求某证书不是必须持证', () => {
  const report = analyze(document(['本项目不接受联合体投标。', '资格要求：不要求提供特定职业证书。']));
  assert.ok(category(report, 'qualification').items.some(item => /联合体/.test(item.quote) && item.hard));
  assert.ok(findings(report).filter(item => /不要求/.test(item.quote)).every(item => !item.hard));
});

test('充分核验后仅评分材料不满足时给条件性谨慎建议，未知硬门槛仍待核验', () => {
  const report = analyze(document(['投标保证金须在截止前提交，未提交投标将被否决。', '评分材料：同类业绩合同每项2分，未提供不得分。']));
  report.companySnapshot=confirmedCompanyFixture();
  report.coverage = {...report.coverage, complete: true, missingCategories: [], unrecognizedBlocks: []};
  for (const item of findings(report)) { item.reviewed = true; item.matchStatus = item.hard ? 'met' : 'unmet'; }
  assert.equal(summarize(report).outputs.conclusion.label, '谨慎可投');
  const hard = findings(report).find(item => item.hard);
  hard.reviewed = false; hard.matchStatus = 'pending';
  assert.equal(summarize(report).outputs.conclusion.label, '待核验');
});

test('真实综合TXT与PDF中的截止日期差异引用双方日期，不仅命中冲突说明', async () => {
  const {extractDocument} = await import('../src/core/extractor.js');
  for (const format of ['txt', 'pdf']) {
    const extraction = await extractDocument({id: `deadline-${format}`, fileName: `综合招标-测试用途.${format}`, path: fileURLToPath(new URL(`./fixtures/综合招标-测试用途.${format}`, import.meta.url))});
    assert.equal(extraction.complete, true);
    const report = analyze(extraction);
    const conflict = category(report, 'consistency').items.find(item => item.references.some(ref => ref.quote.includes('2026年10月20日09:00')) && item.references.some(ref => ref.quote.includes('2026年10月21日09:00')));
    assert.ok(conflict, `${format}没有生成包含双方实际日期的冲突`);
    assert.equal(conflict.matchStatus, 'pending');
    assert.equal(conflict.references.length, 2);
  }
});

test('强采标题、分类指导及待核问题不冒充明确产品强采要求', () => {
  const report = analyze(document([
    '第十二章 节能、环保及政府强制采购',
    '办公家具环境标志认证属于评分材料；应分别标注“政府强制采购”“节能认证加分”“优先采购”，不得混淆。',
    '是否属于法定强制采购范围及目录版本需复核。',
    '附件清单第3项显示器明确列为政府强制采购产品，须提供有效节能认证。'
  ]));
  const items = category(report, 'eco').items;
  assert.ok(items.filter(item => !item.quote.includes('显示器')).every(item => !/^原文明确/.test(item.fields['强制采购'])));
  assert.ok(items.find(item => item.quote.includes('显示器')).fields['强制采购'].startsWith('原文明确'));
});

test('同段强采产品与非强制评分产品分别保留，不能由非强制否定整个段落', () => {
  const report = analyze(document(['显示器明确列为强制采购产品，须提供认证；办公家具处于非强制采购范围，认证仅用于加分。']));
  const item = category(report, 'eco').items[0];
  assert.match(item.fields['强制采购'], /^原文明确/);
  assert.match(item.fields['强制采购'], /非强制/);
});

test('未关联附件A和B须明确覆盖缺口，正文说明另行上传不算完整内嵌附件', () => {
  const report = analyze(document(['样品规格见附件A，日程见附件B。', '附件A：技术参数与样品规格，可另行上传关联附件。', '附件B：采购日程与表单格式，需另行提供。']));
  assert.deepEqual(report.coverage.missingAttachments.sort(), ['附件A', '附件B']);
  assert.equal(report.coverage.complete, false);
});

test('主文件已完整内嵌附件A正文时不再错误要求另传相同附件', () => {
  const report = analyze(document(['样品规格见附件A。', '附件A：样品规格', '办公椅样品1把，高度不少于80厘米，须在投标截止前送达。']));
  assert.deepEqual(report.coverage.missingAttachments, []);
  assert.ok(!report.warnings.some(warning => warning.code === 'ATTACHMENT_REFERENCE_PENDING'));
});

test('废标输出按相同原文去重，优先保留强采字段并合并证照引用', () => {
  const quote = '显示器属于强制采购节能产品，须提供有效认证证书；未提供则投标无效。';
  const report = analyze(document([quote]));
  const repeated = report.outputs.risks.filter(item => item.quote === quote);
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].categoryId, 'eco');
  assert.ok(repeated[0].fields['强制采购']);
  const main = document(['须提交有效营业执照，未提供投标无效。']);
  const evidence = document(['营业执照，企业名称：甲公司；统一社会信用代码91310000TEST000001。'], 'license');
  const combined = analyze(main, {evidence: [evidence]});
  assert.equal(combined.outputs.risks.length, 1);
  assert.ok(combined.outputs.risks[0].references.some(ref => ref.documentId === 'license'));
});

test('无计分标准的加分指导及明确非废标后果不进入真实四项重点清单', () => {
  const report = analyze(document(['不可通过其他加分项抵消上述硬性要求。', '样品未提供不得分，不作为直接废标理由。', '业绩合同及验收材料每项2分，最高6分。']));
  assert.equal(report.outputs.risks.length, 0);
  assert.ok(report.outputs.scoreItems.length);
  assert.ok(report.outputs.scoreItems.every(item => item.quote.includes('每项2分')));
  assert.ok(category(report, 'rejection').items.length);
});

test('AI结构化字段和备注作为待核候选保留，不覆盖离线约束或升格已满足', () => {
  const quote = '制造商须提供有效授权证明。';
  const main = document([quote]);
  const report = analyze(main, {additionalFindings: [{
    categoryId: 'qualification', title: '授权主体要求', quote, source: 'ai',
    fields: {'适用主体': '制造商', '证明材料': ['授权证明'], '用途': '已可投'},
    notes: ['主体关系需人工核对'], hard: true, matchStatus: 'met',
    references: [{documentId: main.id, blockId: main.blocks[0].id, quote}]
  }]});
  const ai = findings(report).find(item => item.source === 'ai');
  assert.ok(ai);
  assert.equal(ai.fields['AI候选·适用主体（待核验）'], '制造商');
  assert.deepEqual(ai.fields['AI候选·证明材料（待核验）'], ['授权证明']);
  assert.notEqual(ai.fields['用途'], '已可投');
  assert.ok(ai.notes.some(note => note.includes('主体关系')));
  assert.equal(ai.matchStatus, 'pending');
  assert.equal(ai.hard, false);
});

test('真实DOCX覆盖经明确人工复核后可到达三档结论，保留原始缺口和读取提示', async t => {
  const {extractDocument} = await import('../src/core/extractor.js');
  const directory = await mkdtemp(join(tmpdir(), 'biaoxi-analyzer-coverage-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const path = join(directory, '覆盖复核.docx');
  const word = new Document({sections: [{children: [
    new Paragraph('招标编号 BX-COVERAGE-TEST。'),
    new Paragraph('投标人须提交有效营业执照，未提供投标无效。'),
    new Paragraph('评分要求：同类业绩合同每项2分，未提供仅该项不得分。')
  ]}]});
  await writeFile(path, await Packer.toBuffer(word));
  const extraction = await extractDocument({id: 'coverage-docx', fileName: '覆盖复核.docx', path});
  assert.equal(extraction.complete, true);
  assert.ok(extraction.warnings.some(item => item.code === 'DOCX_SECTION_REFERENCES'));
  const report = analyze(extraction);
  assert.equal(report.coverage.complete, false);
  assert.ok(report.coverage.missingCategories.length);
  assert.ok(report.coverage.unrecognizedBlocks.length);
  report.companySnapshot=confirmedCompanyFixture();
  const originalCoverage = structuredClone(report.coverage);
  const originalWarnings = structuredClone(report.warnings);
  for (const item of findings(report)) { item.reviewed = true; item.matchStatus = 'met'; }
  assert.equal(summarize(report).outputs.conclusion.label, '待核验');
  report.coverageReview = {reviewed: true, note: '已对照完整原件确认未识别类别、未归类段落及页码提示。', reviewedAt: '2026-10-10T00:00:00.000Z'};
  const ready = summarize(report);
  assert.equal(ready.outputs.conclusion.label, '可投');
  assert.deepEqual(ready.coverage, originalCoverage);
  assert.deepEqual(ready.warnings, originalWarnings);
  assert.match(ready.outputs.conclusion.reasons.join(''), /未识别类别.*未归类段落.*读取提示.*人工确认/);
  assert.ok(!ready.outputs.conclusion.conditions.some(text => /以下类别未明确识别|检查未归类|先核对无法读取/.test(text)));
  const cautious = structuredClone(ready);
  findings(cautious).find(item => item.categoryId === 'scoring').matchStatus = 'unmet';
  assert.equal(summarize(cautious).outputs.conclusion.label, '谨慎可投');
  const rejected = structuredClone(cautious);
  findings(rejected).find(item => item.hard).matchStatus = 'unmet';
  assert.equal(summarize(rejected).outputs.conclusion.label, '不建议投');
  const pending = structuredClone(ready);
  const unchecked = findings(pending).find(item => item.hard);
  unchecked.reviewed = false; unchecked.matchStatus = 'pending';
  assert.equal(summarize(pending).outputs.conclusion.label, '待核验');
});

test('覆盖复核须有明确确认及说明，AI失败保留离线事实而不阻断已核验结论', () => {
  const report = analyze(document(['须提交有效营业执照，未提供投标无效。']));
  report.companySnapshot=confirmedCompanyFixture();
  for (const item of findings(report)) { item.reviewed = true; item.matchStatus = 'met'; }
  for (const coverageReview of [{reviewed: true, note: ''}, {reviewed: false, note: '已看原件'}, {reviewed: 'true', note: '已看原件'}]) {
    assert.equal(summarize({...report, coverageReview}).outputs.conclusion.label, '待核验');
  }
  report.coverageReview = {reviewed: true, note: '人工对照原件确认本报告提取覆盖及提示。'};
  report.warnings.push({code: 'AI_FAILED', message: '联网分析失败；继续使用离线报告。'});
  report.onlineFailed = true;
  const result = summarize(report);
  assert.equal(result.outputs.conclusion.label, '可投');
  assert.equal(result.mode, 'offline');
  assert.equal(result.onlineFailed, true);
  assert.ok(result.warnings.some(item => item.code === 'AI_FAILED'));
});
