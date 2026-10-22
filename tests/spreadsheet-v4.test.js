import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractDocument } from '../src/core/extractor.js';
import { analysisUnits } from '../src/core/analysis.js';
import PDFDocument from 'pdfkit';
import { addBiffFormula } from './spreadsheet-v4-fixture-builder.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const JSZip = createRequire(require.resolve('mammoth'))('jszip');

// These generated files are deterministic TEST samples, not company credentials.
async function fixture(t, name, bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'biaoxi-spreadsheet-v4-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, name);
  await writeFile(path, bytes);
  return { id: 'excel-test', fileName: name, path };
}

function workbook(bookType = 'xlsx', edit = () => {}) {
  const book = XLSX.utils.book_new();
  const quantities = XLSX.utils.aoa_to_sheet([
    ['测试工程量清单'],
    ['序号', '项目名称', '规格型号', '单位', '工程量', '综合单价', '合价（元）'],
    [1, '水嘴', 'DN15', '个', 2, 150.25, 300.5],
    [2, '雨水口', 'DN100', '套', 3, 200, 600],
  ]);
  quantities['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  quantities.G3 = { t: 'n', v: 300.5, f: 'E3*F3', z: '"人民币"0.00' };
  XLSX.utils.book_append_sheet(book, quantities, '工程量清单');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['评审内容', '具体标准和要求', '分值', '证明材料'],
    ['同类业绩', '每份合同得2分，最高6分。', 6, '合同及验收证明'],
  ]), '评分标准');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['测试隐含材料'], ['保温板', 'A级', 'm²']]), '隐藏材料');
  book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] };
  edit(book);
  const bytes = XLSX.write(book, { type: 'buffer', bookType, bookSST: true });
  return bookType === 'xls' ? addBiffFormula(bytes) : bytes;
}

for (const format of ['xlsx', 'xls']) test(`real ${format} keeps every meaningful sheet, merged heading, raw cells and cached amount`, async t => {
  const input = await fixture(t, `测试清单.${format}`, workbook(format));
  const result = await extractDocument(input);
  assert.equal(result.complete, true);
  assert.equal(result.format, format);
  assert.deepEqual(result.sheets.map(sheet => sheet.name), ['工程量清单', '评分标准', '隐藏材料']);
  assert.equal(result.sheets[2].hidden, true);
  const sheet = result.sheets[0];
  assert.equal(sheet.merges[0].range, 'A1:G1');
  const amount = sheet.cells.find(cell => cell.address === 'G3');
  assert.equal(amount.rawValue, 300.5);
  assert.equal(amount.cachedValue, 300.5);
  assert.equal(amount.formula, format === 'xls' ? '$E$3*$F$3' : 'E3*F3');
  assert.equal(amount.displayValue, '人民币300.50');
  assert.deepEqual(amount.source, { documentId: 'excel-test', fileName: input.fileName, sheet: '工程量清单', row: 3, column: 7, cell: 'G3' });
  assert.ok(result.blocks.every(block => block.page === null && block.section.includes(block.sheet) && /行/.test(block.section)));
  const rows = result.blocks.filter(block => block.sheet === '工程量清单').flatMap(block => block.tableRows);
  assert.deepEqual(rows[0].cells, ['测试工程量清单', '', '', '', '', '', '']);
  assert.deepEqual(rows[2].headers, ['序号', '项目名称', '规格型号', '单位', '工程量', '综合单价', '合价（元）']);
  assert.equal(rows[2].sourceCells.find(cell => cell.address === 'D3').rawValue, '个');
  assert.match(result.blocks.map(block => block.text).join('\n'), /雨水口/);
  const score = analysisUnits(result).find(unit => unit.score?.title === '同类业绩');
  assert.equal(score.score.maxScore, 6);
  assert.match(score.score.standard, /每份合同得2分/);
});

test('formula without cached result is retained and explicitly incomplete, never calculated', async t => {
  const bytes = workbook('xlsx', book => { book.Sheets['工程量清单'].G3 = { t: 'n', f: 'E3*F3' }; });
  const result = await extractDocument(await fixture(t, '无缓存.xlsx', bytes));
  assert.equal(result.complete, false);
  const cell = result.sheets[0].cells.find(cell => cell.address === 'G3');
  assert.equal(cell.formula, 'E3*F3');
  assert.equal(cell.hasCachedValue, false);
  assert.equal(cell.cachedValue, null);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_FORMULA_CACHE_MISSING' && item.sheet === '工程量清单' && item.cell === 'G3'));
  assert.match(result.blocks.map(block => block.text).join('\n'), /=E3\*F3/);
});

test('vertical merged headers carry traced meanings without copying source cells', async t => {
  const bytes = workbook('xlsx', book => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['项目名称', '金额', ''],
      ['', '单价', '合价'],
      ['水嘴', 2, 4],
    ]);
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }];
    book.Sheets['工程量清单'] = sheet;
  });
  const result = await extractDocument(await fixture(t, '合并表头.xlsx', bytes));
  const rows = result.blocks.filter(block => block.sheet === '工程量清单').flatMap(block => block.tableRows);
  assert.deepEqual(rows[1].cells, ['', '单价', '合价']);
  assert.deepEqual(rows[2].headers, ['项目名称', '单价', '合价']);
  assert.deepEqual(rows[2].headerSources[0].map(source => source.cell), ['A1']);
  assert.deepEqual(rows[2].headerSources[1].map(source => source.cell), ['B1', 'B2']);
});

test('external formulas, hyperlinks and macro streams are data, with explicit warnings', async t => {
  const bytes = workbook('xlsx', book => {
    book.Sheets['工程量清单'].H3 = { t: 'n', v: 12, f: "'[remote.xlsx]Sheet1'!A1" };
    book.Sheets['工程量清单'].B3.l = { Target: 'https://invalid.example.test/never-fetch' };
    book.Sheets['工程量清单']['!ref'] = 'A1:H4';
  });
  const zip = await JSZip.loadAsync(bytes);
  zip.file('xl/vbaProject.bin', Buffer.from('TEST inert macro bytes'));
  const result = await extractDocument(await fixture(t, '外链宏.xlsx', await zip.generateAsync({ type: 'nodebuffer' })));
  assert.equal(result.sheets[0].cells.find(cell => cell.address === 'H3').cachedValue, 12);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_EXTERNAL_LINK'));
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_MACROS_NOT_EXECUTED'));
});

for (const [name, bytes] of [['损坏.xlsx', Buffer.from('text pretending to be a spreadsheet')], ['损坏.xls', Buffer.from('text pretending to be binary')], ['截断.xlsx', workbook().subarray(0, 300)]]) test(`${name} is not silently read as CSV or successful empty content`, async t => {
  const result = await extractDocument(await fixture(t, name, bytes));
  assert.equal(result.complete, false);
  assert.equal(result.blocks.length, 0);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_READ_FAILED'));
});

test('encrypted OOXML container is rejected explicitly', async t => {
  const cfb = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(cfb, 'EncryptedPackage', Buffer.from('TEST encrypted payload'));
  XLSX.CFB.utils.cfb_add(cfb, 'EncryptionInfo', Buffer.from('TEST encryption info'));
  const result = await extractDocument(await fixture(t, '加密.xlsx', XLSX.CFB.write(cfb, { type: 'buffer' })));
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_ENCRYPTED'));
});

test('excessive worksheet declared range is rejected without silently truncating rows', async t => {
  const zip = await JSZip.loadAsync(workbook());
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  zip.file('xl/worksheets/sheet1.xml', xml.replace(/<dimension ref="[^"]+"/, '<dimension ref="A1:XFD1048576"'));
  const result = await extractDocument(await fixture(t, '超限.xlsx', await zip.generateAsync({ type: 'nodebuffer' })));
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_LIMIT'));
});

test('ZIP uncompressed content cap is enforced before spreadsheet decoding', async t => {
  const zip = await JSZip.loadAsync(workbook());
  zip.file('xl/test-extra.xml', Buffer.alloc(17 * 1024 * 1024, 0x20));
  const result = await extractDocument(await fixture(t, '压缩超限.xlsx', await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })));
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_LIMIT'));
});

test('missing sheet part is incomplete even when other sheets remain readable', async t => {
  const zip = await JSZip.loadAsync(workbook());
  zip.remove('xl/worksheets/sheet2.xml');
  const result = await extractDocument(await fixture(t, '缺失工作表.xlsx', await zip.generateAsync({ type: 'nodebuffer' })));
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_READ_FAILED'));
});

test('sparse rows cannot expand to an excessive materialized table', async t => {
  const book = XLSX.utils.book_new();
  const sheet = {};
  for (let row = 1; row <= 2100; row++) sheet[`AMJ${row}`] = { t: 's', v: '测试稀疏单元格' };
  sheet['!ref'] = 'A1:AMJ2100';
  XLSX.utils.book_append_sheet(book, sheet, '稀疏');
  const result = await extractDocument(await fixture(t, '稀疏超限.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })));
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_LIMIT'));
});

test('PDF-attached workbook exposes sheet metadata and original parent attribution', async t => {
  const pdf = new PDFDocument();
  const chunks = [];
  const done = new Promise((resolve, reject) => { pdf.on('data', bytes => chunks.push(bytes)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
  pdf.text('TEST procurement attachment');
  pdf.file(workbook(), { name: '测试附件.xlsx' });
  pdf.end();
  const result = await extractDocument(await fixture(t, '测试带清单.pdf', await done));
  assert.equal(result.complete, true);
  assert.ok(result.sheets.some(sheet => sheet.name === '工程量清单' && sheet.containerFileName === '测试带清单.pdf'));
  assert.ok(result.blocks.some(block => block.sheet === '工程量清单' && block.fileName.includes('测试附件.xlsx') && block.section.includes('内嵌附件') && block.cells.some(cell => cell.address === 'G3')));
});

test('empty workbook is incomplete and cancellation rejects AbortError', async t => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, {}, '空表');
  const input = await fixture(t, '空表.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const result = await extractDocument(input);
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(item => item.code === 'NO_TEXT'));
  const controller = new AbortController();
  await assert.rejects(extractDocument(input, { signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
});

test('CRC-corrupt bytes cannot silently alter material evidence', async t => {
  const bytes = Buffer.from(workbook());
  const position = bytes.indexOf(Buffer.from('水嘴'));
  assert.ok(position >= 0, 'TEST STORE fixture must expose material bytes');
  Buffer.from('木嘴').copy(bytes, position);
  const result = await extractDocument(await fixture(t, 'CRC损坏.xlsx', bytes));
  assert.equal(result.complete, false);
  assert.equal(result.blocks.length, 0);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_READ_FAILED' && /CRC/i.test(item.message)));
});

for (const [label, transform] of [
  ['missing worksheet close', xml => xml.replace('</worksheet>', '')],
  ['missing row close', xml => xml.replace('</row>', '')],
  ['invalid numeric lexical value', xml => xml.replace('<v>300.5</v>', '<v>BADNUM</v>')],
  ['numeric overflow', xml => xml.replace('<v>300.5</v>', '<v>1e309</v>')],
]) test(`valid CRC does not conceal ${label}`, async t => {
  const zip = await JSZip.loadAsync(workbook());
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const changed = transform(xml);
  assert.notEqual(changed, xml, 'TEST fixture must change source XML');
  zip.file('xl/worksheets/sheet1.xml', changed);
  const result = await extractDocument(await fixture(t, `${label}.xlsx`, await zip.generateAsync({ type: 'nodebuffer' })));
  assert.equal(result.complete, false);
  assert.equal(result.blocks.length, 0);
  assert.ok(result.warnings.some(item => item.code === 'SPREADSHEET_READ_FAILED'));
});

test('repeated headers use only active provenance with linear output size', async t => {
  const book = XLSX.utils.book_new();
  const rows = Array.from({ length: 3000 }, (_, index) => [`项目名称${index}`, `单位${index}`]);
  rows.push(['测试数据', 2], ['第二项', 3]);
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '重复表头');
  const result = await extractDocument(await fixture(t, '重复表头.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true })));
  assert.equal(result.complete, true);
  const extractedRows = result.blocks.flatMap(block => block.tableRows);
  const referenceCount = extractedRows.reduce((sum, row) => sum + row.headerSources.flat().length, 0);
  assert.ok(referenceCount <= 6100, `header references must be linear, got ${referenceCount}`);
  assert.deepEqual(extractedRows[2999].headerSources.flat().map(source => source.cell), ['A3000', 'B3000']);
  assert.equal(extractedRows[3000].headerSources, extractedRows[3001].headerSources, 'data rows share immutable active header provenance');
  assert.equal(extractedRows[3000].headers, extractedRows[3001].headers);
});

test('130000 real stored cells below limits retain full extraction', async t => {
  const book = XLSX.utils.book_new();
  const values = Array.from({ length: 1300 }, (_, row) => Array.from({ length: 100 }, (_, column) => row * 100 + column));
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(values), '大表');
  const result = await extractDocument(await fixture(t, '合法大表.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true })));
  assert.equal(result.complete, true);
  assert.equal(result.sheets[0].cells.length, 130000);
  assert.equal(result.blocks.flatMap(block => block.tableRows).length, 1300);
  assert.equal(result.sheets[0].cells.find(cell => cell.address === 'CV1300').rawValue, 129999);
});
