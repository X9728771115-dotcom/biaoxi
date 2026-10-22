import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, Header } from 'docx';
import { createCanvas } from '@napi-rs/canvas';
import { extractDocument } from '../src/core/extractor.js';
import { contentStructurePdf, complexGridPdf, textLayoutPdf, nestedGridPdf } from './fixtures/content-structure-fixture.js';

async function fixture(t, name, content) {
  const dir = await mkdtemp(join(tmpdir(), 'biaoxi-extractor-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, name);
  await writeFile(path, content);
  return { id: 'test-document', fileName: name, path };
}

async function pdfBuffer(build) {
  const pdf = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  build(pdf);
  pdf.end();
  return done;
}

test('TXT preserves complete paragraphs, BOM, source IDs and section rather than guessing pages', async t => {
  const source = '\ufeff第一章 采购要求\r\n\r\n经营范围应包含办公家具。\r\n不得以评分补偿资格不符。\r\n\r\n第二章 付款方式\r\n验收后支付合同金额的 95%，保留 5% 质保金。';
  const input = await fixture(t, '采购要求.txt', source);
  const events = [];
  const result = await extractDocument(input, { onProgress: event => events.push(event) });
  assert.equal(result.complete, true);
  assert.equal(result.format, 'txt');
  assert.ok(result.blocks.some(block => block.text.includes('不得以评分补偿资格不符')));
  assert.ok(result.blocks.some(block => block.section.includes('第二章') && block.text.includes('95%')));
  assert.ok(result.blocks.every(block => block.page === null && block.documentId === input.id));
  assert.equal(new Set(result.blocks.map(block => block.id)).size, result.blocks.length);
  assert.ok(events.length > 0);
});

test('real DOCX includes all table cells, chapters and header without fabricated page numbers', async t => {
  const document = new Document({ sections: [{ headers: { default: new Header({ children: [new Paragraph('招标编号 BX-2026-01')] }) }, children: [
    new Paragraph({ text: '第三章 评分细则', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('商务、技术、报价分别计分，不提供样品不得分。'),
    new Table({ rows: [
      new TableRow({ children: [new TableCell({ children: [new Paragraph('评分项')] }), new TableCell({ children: [new Paragraph('分值与证明材料')] })] }),
      new TableRow({ children: [new TableCell({ children: [new Paragraph('同类业绩')] }), new TableCell({ children: [new Paragraph('近三年每份合同 2 分，最高 6 分；合同及验收证明。')] })] })
    ] }),
    new Paragraph({ text: '第四章 承诺内容', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('必须提交售后服务承诺函。')
  ] }] });
  const result = await extractDocument(await fixture(t, '评分.docx', await Packer.toBuffer(document)));
  assert.equal(result.complete, true);
  const text = result.blocks.map(block => block.text).join('\n');
  assert.match(text, /招标编号 BX-2026-01/);
  assert.match(text, /近三年每份合同 2 分/);
  assert.match(text, /合同及验收证明/);
  assert.ok(result.blocks.some(block => block.kind === 'table' && block.section.includes('第三章')));
  assert.ok(result.blocks.every(block => block.page === null));
  assert.ok(result.blocks.some(block => block.section.includes('第四章') && block.text.includes('售后服务')));
});

test('real multipage PDF extracts every page with page references and reading order', async t => {
  const buffer = await pdfBuffer(pdf => {
    pdf.fontSize(12).text('Section 1. Qualification: valid license is mandatory. No submission leads to rejection.');
    pdf.addPage().text('Section 2. Payment: 95 percent after acceptance; remaining 5 percent after warranty.');
  });
  const result = await extractDocument(await fixture(t, '采购.pdf', buffer));
  assert.equal(result.complete, true);
  assert.equal(result.pages.length, 2);
  assert.match(result.pages[0].text, /valid license/);
  assert.match(result.pages[1].text, /95 percent/);
  assert.ok(result.blocks.some(block => block.page === 2 && block.text.includes('warranty')));
  assert.ok(result.pages.every(page => page.source === 'text'));
});

test('unreadable and unsupported files explicitly report incomplete coverage', async t => {
  const corrupt = await extractDocument(await fixture(t, '损坏.pdf', 'not a valid PDF file'));
  assert.equal(corrupt.complete, false);
  assert.ok(corrupt.warnings.some(warning => warning.code === 'READ_FAILED'));
  const unknown = await extractDocument(await fixture(t, '采购.xyz', 'unsupported contents'));
  assert.equal(unknown.complete, false);
  assert.ok(unknown.warnings.some(warning => warning.code === 'UNSUPPORTED_FORMAT'));
});

test('empty input is not reported as successful full-text extraction', async t => {
  const result = await extractDocument(await fixture(t, '空白.txt', '   \n\t'));
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(warning => warning.code === 'NO_TEXT'));
});

test('cancelled extraction rejects AbortError instead of returning a misleading report', async t => {
  const input = await fixture(t, '取消.txt', '投标须知');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(extractDocument(input, { signal: controller.signal }), { name: 'AbortError' });
});

test('real image OCR and mixed scan PDF use bundled language data and mark source', { skip: process.env.BIAXI_OCR_TEST !== '1', timeout: 120000 }, async t => {
  const canvas = createCanvas(1600, 550);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  context.font = '58px Arial';
  context.fillText('BID GUARANTEE 50000', 90, 150);
  context.fillText('Payment after acceptance', 90, 260);
  context.fillText('Submit license before deadline', 90, 370);
  const image = canvas.toBuffer('image/png');
  const imageResult = await extractDocument(await fixture(t, '扫描页.png', image));
  assert.match(imageResult.pages[0].text, /GUARANTEE\s+50000/i);
  assert.equal(imageResult.pages[0].source, 'ocr');
  assert.ok(imageResult.warnings.some(warning => warning.code === 'OCR_REVIEW_REQUIRED'));
  const pdf = await pdfBuffer(document => {
    document.fontSize(10).text('PAGE 1');
    document.image(image, 40, 140, { width: 520 });
    document.addPage().fontSize(12).text('Text page with valid qualification evidence and complete payment requirements.');
    document.addPage().fontSize(12).text('Machine-readable qualification section with sufficient text. The embedded image below contains additional mandatory conditions and must also be read.');
    document.image(image, 40, 200, { width: 520 });
  });
  const result = await extractDocument(await fixture(t, '混合扫描.pdf', pdf));
  assert.equal(result.pages.length, 3);
  assert.equal(result.pages[0].source, 'mixed');
  assert.equal(result.pages[1].source, 'text');
  assert.match(result.pages[0].text, /50000/);
  assert.ok(result.blocks.some(block => block.page === 3 && block.text.includes('50000')));
  assert.ok(result.blocks.some(block => block.page === 3 && block.text.includes('Machine-readable')));
  assert.equal(new Set(result.blocks.map(block => block.id)).size, result.blocks.length);
});

test('PDF embedded text attachment remains attributable to parent report', async t => {
  const pdf = await pdfBuffer(document => {
    document.fontSize(12).text('Tender with attached binding requirements. Read every attached file.');
    document.file(Buffer.from('投标附件要求：必须提供节能产品认证，证书应在有效期内。'), { name: '附件.txt' });
  });
  const result = await extractDocument(await fixture(t, '带附件.pdf', pdf));
  assert.equal(result.complete, true);
  assert.ok(result.blocks.some(block => block.text.includes('必须提供节能产品认证') && block.section.includes('内嵌附件') && block.documentId === 'test-document'));
});

test('cancellation during OCR promptly returns AbortError', { skip: process.env.BIAXI_OCR_TEST !== '1', timeout: 15000 }, async t => {
  const canvas = createCanvas(1600, 450);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'black'; context.font = '60px Arial'; context.fillText('Cancel OCR after worker starts', 50, 100);
  const input = await fixture(t, '中断识别.png', canvas.toBuffer('image/png'));
  const controller = new AbortController();
  await assert.rejects(extractDocument(input, { signal: controller.signal, onProgress: event => {
    if (event.phase === 'ocr' && event.message === '正在离线识别扫描内容') controller.abort();
  } }), { name: 'AbortError' });
});

test('Chinese scanned clauses retain contiguous Chinese words usable by category rules', { skip: process.env.BIAXI_OCR_TEST !== '1', timeout: 60000 }, async () => {
  const fileName = '中文扫描条款-测试用途.png';
  const path = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', fileName);
  const result = await extractDocument({ id: 'chinese-scan', fileName, path });
  const text = result.blocks.map(block => block.text).join('\n');
  assert.match(text, /投标保证金/);
  assert.match(text, /政府强制采购/);
  assert.match(text, /营业执照经营范围/);
  assert.match(text, /20000/);
  assert.ok(result.warnings.some(warning => warning.code === 'OCR_REVIEW_REQUIRED'));
});

test('recognition normalizes compatibility ideographs without replacing source text', async t => {
  const raw = '第一章 资格要求\n1.供应商须提供营业执照；投标保证⾦不收取，报价不得超过１００万元。';
  const result = await extractDocument(await fixture(t, '兼容字.txt', raw));
  const clause = result.blocks.find(block => block.text.includes('保证⾦'));
  assert.ok(clause, 'the source block must preserve compatibility characters');
  assert.match(clause.normalizedText || '', /投标保证金不收取/);
  assert.match(clause.normalizedText || '', /100万元/);
  assert.match(result.pages[0].text, /保证⾦/);
  assert.equal(clause.heading, false, 'a numbered obligation must not become a heading');
  assert.equal(clause.section, '第一章 资格要求');
});

test('real PDF reconstructs multiline score cells instead of mixing adjacent columns', async t => {
  const result = await extractDocument(await fixture(t, '结构评分.pdf', await contentStructurePdf()));
  const block = result.blocks.find(block => block.page === 2 && block.tableRows?.some(row => row.cells.includes('维护业绩')));
  assert.ok(block, 'a score row must be exposed as structured cells');
  const score = block.tableRows.find(row => row.cells.includes('维护业绩'));
  assert.equal(score.cells.length, 6);
  assert.equal(score.cells[0], '商务评审');
  assert.equal(score.cells[1], '维护业绩');
  assert.match(score.cells[2], /近三年同类合同每份1分/);
  assert.match(score.cells[2], /最多3分；合同及验收报告/);
  assert.equal(score.cells[3], '3');
  assert.equal(score.cells[4], '客观');
  assert.match(score.cells[5], /合同/);
  assert.match(score.cells[5], /验收报告/);
  assert.ok(block.text.includes(score.text), 'row quotes must exist verbatim in their source block');
  assert.equal(score.page, 2);
});

test('cross-page table fragments retain header meanings and page-specific raw references', async t => {
  const result = await extractDocument(await fixture(t, '跨页续表.pdf', await contentStructurePdf()));
  const first = result.blocks.find(block => block.page === 1 && block.tableRows?.some(row => row.cells.includes('系统部署')));
  const next = result.blocks.find(block => block.page === 2 && block.tableRows?.some(row => row.text.includes('缺项不得分')));
  assert.ok(first && next, 'both fragments of the split row must remain accessible');
  assert.equal(next.tableId, first.tableId);
  assert.deepEqual(next.tableHeaders, ['分类', '评审内容', '具体标准和要求', '分值', '主客观', '证明材料']);
  const continuation = next.tableRows.find(row => row.text.includes('缺项不得分'));
  assert.equal(continuation.continued, true);
  assert.equal(continuation.page, 2);
  assert.ok(next.text.includes(continuation.text));
  assert.ok(!next.text.includes('配置方案完整'), 'page one text must not be fabricated into the page two quote');
  assert.match(result.pages[0].text, /配置方案完整/);
  assert.match(result.pages[1].text, /缺项不得分/);
});

test('PDF star rows retain complete conditions and obligation text is not a heading', async t => {
  const result = await extractDocument(await fixture(t, '星号条件.pdf', await contentStructurePdf()));
  const block = result.blocks.find(block => block.page === 3 && block.tableRows?.some(row => row.cells.includes('条件承诺')));
  assert.ok(block);
  const conditional = block.tableRows.find(row => row.cells.includes('条件承诺'));
  assert.equal(conditional.cells[1], '★');
  assert.match(conditional.cells[3], /如需安装，必须提交安装承诺/);
  assert.match(conditional.cells[3], /非安装范围不适用/);
  assert.ok(block.text.includes(conditional.text));
  assert.equal(block.heading, false);
  const obligation = result.blocks.find(item => item.text.includes('供应商须提供有效许可证'));
  assert.equal(obligation.heading, false);
  assert.ok(!obligation.section.includes('供应商须提供'), 'the preceding real section must remain the context');
});

test('PDF negative values stay connected to their item and policy caption', async t => {
  const result = await extractDocument(await fixture(t, '否定范围.pdf', await contentStructurePdf()));
  const guarantee = result.blocks.find(block => block.page === 4 && block.tableRows?.some(row => row.text.includes('投标（响应）保证⾦')));
  assert.ok(guarantee);
  const row = guarantee.tableRows.find(item => item.text.includes('投标（响应）保证⾦'));
  assert.deepEqual(row.cells, ['投标（响应）保证⾦', '不收取保证⾦']);
  assert.match(guarantee.normalizedText, /投标\(响应\)保证金/);
  const policy = result.blocks.find(block => block.page === 4 && block.tableRows?.some(item => item.text.includes('不涉及')));
  assert.ok(policy);
  assert.match(policy.section.normalize('NFKC'), /强制采购节能产品/);
  assert.ok(policy.tableHeaders.includes('产品名称'));
  assert.ok(policy.text.includes(policy.tableRows.find(item => item.text.includes('不涉及')).text));
});

test('overprinted PDF title layers produce one logical heading without hiding clauses', async t => {
  const result = await extractDocument(await fixture(t, '叠字标题.pdf', await contentStructurePdf()));
  const headings = result.blocks.filter(block => block.page === 1 && block.heading && block.normalizedText?.includes('第五章评审办法'));
  assert.equal(headings.length, 1);
  assert.equal(headings[0].text, '第五章 评审办法');
  assert.ok(result.blocks.some(block => block.page === 1 && block.text.includes('配置方案完整')));
});

test('DOCX tables expose raw cell rows while headings and normalized recognition remain separate', async t => {
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: '第二章 政策要求', heading: HeadingLevel.HEADING_1 }),
    new Table({ rows: [
      new TableRow({ children: ['事项', '具体要求'].map(text => new TableCell({ children: [new Paragraph(text)] })) }),
      new TableRow({ children: ['投标保证⾦', '不收取'].map(text => new TableCell({ children: [new Paragraph(text)] })) })
    ] })
  ] }] });
  const result = await extractDocument(await fixture(t, '原始表格.docx', await Packer.toBuffer(document)));
  const block = result.blocks.find(item => item.kind === 'table');
  assert.deepEqual(block.tableRows?.[1].cells, ['投标保证⾦', '不收取']);
  assert.match(block.normalizedText || '', /投标保证金/);
  assert.ok(block.text.includes(block.tableRows[1].text));
  assert.equal(block.tableRows[1].page, null);
  assert.equal(result.blocks.find(item => item.text === '第二章 政策要求').heading, true);
});

test('PDF internal headers replace outer summary columns without fabricating raw row text', async t => {
  const result = await extractDocument(await fixture(t, '表内表头.pdf', await complexGridPdf()));
  const block = result.blocks.find(item => item.tableRows?.some(row => row.cells.includes('管理体系')));
  assert.deepEqual(block.tableHeaders, ['分类', '评审内容', '具体标准和要求', '分值', '主客观', '证明材料']);
  const row = block.tableRows.find(item => item.cells.includes('管理体系'));
  assert.deepEqual(row.headers, block.tableHeaders);
  assert.ok(block.text.includes(row.text));
  assert.equal(row.cells[3], '4');
});

test('PDF merged classification is associated with all spanned rows rather than a phantom clause', async t => {
  const result = await extractDocument(await fixture(t, '合并分类.pdf', await complexGridPdf()));
  const block = result.blocks.find(item => item.tableRows?.some(row => row.cells.includes('实施案例')));
  const rows = block.tableRows.filter(row => row.cells.includes('管理体系') || row.cells.includes('实施案例'));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(row.cellSpans?.some(span => span.column === 0 && span.text === '商务评审'));
    assert.ok(block.text.includes(row.text));
  }
  assert.equal(block.text.split('商务评审').length - 1, 1, 'merged text must appear once in raw quote');
  assert.equal(block.tableRows.filter(row => row.cells.filter(Boolean).length === 1 && row.cells.includes('商务评审')).length, 0);
});

test('CJK supplemental radical page numbers are preserved but excluded from requirement headings', async t => {
  const result = await extractDocument(await fixture(t, '页码部首.pdf', await complexGridPdf()));
  const footer = result.blocks.find(block => block.text === '-第1⻚-');
  assert.equal(footer.role, 'page-number');
  assert.equal(footer.heading, true);
  assert.equal(footer.normalizedText, '-第1页-');
  assert.ok(result.pages[0].text.includes('-第1⻚-'));
});

test('numeric score rows mentioning materials are not misclassified as table headers', async t => {
  const result = await extractDocument(await fixture(t, '评分不是表头.pdf', await complexGridPdf()));
  const table = result.blocks.find(block => block.tableRows?.some(row => row.cells.includes('实施案例')));
  for (const row of table.tableRows.filter(row => row.cells.includes('管理体系') || row.cells.includes('实施案例'))) {
    assert.deepEqual(row.headers, ['分类', '评审内容', '具体标准和要求', '分值', '主客观', '证明材料']);
    assert.notDeepEqual(row.headers, row.cells);
  }
});

test('ordinary PDF wrapped paragraphs retain a complete requirement across wide line spacing', async t => {
  const result = await extractDocument(await fixture(t, '行距与段落.pdf', await textLayoutPdf()));
  const block = result.blocks.find(item => item.page === 2 && item.text.includes('供应商应具备有效施工资质'));
  assert.match(block.text, /并提供完整承诺和证明资料/);
  const numbered = result.blocks.find(item => item.page === 2 && item.text.includes('1.供应商须提交授权证明'));
  assert.match(numbered.text, /由法定代表人签署并加盖公章/);
  assert.equal(numbered.heading, false);
});

test('PDF contents, repeated margin headers and page numbers remain raw evidence but not requirements', async t => {
  const result = await extractDocument(await fixture(t, '目录和页眉.pdf', await textLayoutPdf()));
  const contents = result.blocks.filter(block => block.page === 1 && /废标|承诺/.test(block.text));
  assert.ok(contents.length);
  assert.ok(contents.every(block => block.role === 'toc' && block.heading === true));
  const headers = result.blocks.filter(block => block.text === '示例采购文件');
  assert.equal(headers.length, 3);
  assert.ok(headers.every(block => block.role === 'page-header' && block.heading === true));
  assert.equal(result.blocks.find(block => block.page === 1 && block.text === '1').role, 'page-number');
  assert.ok(result.pages[0].text.includes('必须承诺内容'));
  assert.ok(result.blocks.find(block => block.text.includes('详见附件：施工图纸')).heading === false);
});

test('PDF overlapping source layers explicitly require verification rather than claiming reliable complete reading', async t => {
  const result = await extractDocument(await fixture(t, '文字重叠.pdf', await textLayoutPdf()));
  assert.ok(result.warnings.some(warning => warning.code === 'PDF_OVERLAPPING_TEXT' && warning.page === 3));
  assert.equal(result.complete, false);
  assert.ok(result.pages[2].text.includes('施工工艺必须完整说明'));
  assert.ok(result.pages[2].text.includes('报价资料应按要求提交'));
});

test('PDF nested tables own their text once while preserving the outer requirement and inner row relationships', async t => {
  const result = await extractDocument(await fixture(t, '嵌套表格.pdf', await nestedGridPdf()));
  const tables = result.blocks.filter(block => block.tableRows);
  assert.equal(tables.length, 2);
  const allText = result.blocks.map(block => block.text).join('\n');
  assert.equal(allText.split('提供有效维护资质证书。').length - 1, 1);
  assert.ok(allText.includes('须符合以下明细'));
  const rawCharacters = text => [...text.replace(/[\s|]/g, '')].sort().join('');
  assert.equal(rawCharacters(allText), rawCharacters(result.pages[0].text), 'all raw characters must be retained exactly once');
  const inner = tables.find(block => block.tableRows.some(row => row.cells.includes('维护资格')));
  assert.deepEqual(inner.tableRows.find(row => row.cells.includes('维护资格')).cells, ['维护资格', '提供有效维护资质证书。']);
});
