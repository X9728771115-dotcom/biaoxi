import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLegacyDocFixture as fixture, createLegacyNativeObject as nativeObject, CFB } from './fixtures/legacy-doc-fixture.js';
import { extractLegacyDoc } from '../src/core/legacy-doc.js';
import { createPublicLongLegacyDocFixture } from './fixtures/public-long-doc-fixture.js';

test('legacy DOC restores Chinese clauses and keeps line and cell boundaries', async () => {
  const result = await extractLegacyDoc(fixture({ body: '第一章 项目说明\r工期：28日历天。\r标段\x07金额\x07\rA\x0785万元\x07\r' }));
  assert.match(result.sections.find(s => s.key === 'body').text, /工期：28日历天。\n标段\t金额\t\nA\t85万元\t/);
  assert.ok(result.blocks.some(b => b.kind === 'table-text' && b.text.includes('A\t85万元')));
  assert.ok(result.blocks.every(b => b.page === null && Number.isInteger(b.lineStart)));
  assert.equal(result.blocks.some(b => b.tableRows || b.tableHeaders), false);
});

test('legacy DOC retains notes, annotations and textboxes in separately identified sections', async () => {
  const result = await extractLegacyDoc(fixture({ notes: { footnotes: '脚注：以合同为准', endnotes: '尾注：补充约定', annotations: '批注：需要澄清', bodyTextboxes: '文本框：最高限价85万元', headerTextboxes: '页眉文本框：示例' } }));
  for (const [key, literal] of [['footnotes', '脚注：以合同为准'], ['endnotes', '尾注：补充约定'], ['annotations', '批注：需要澄清'], ['bodyTextboxes', '文本框：最高限价85万元'], ['headerTextboxes', '页眉文本框：示例']]) {
    assert.equal(result.sections.find(s => s.key === key).text, literal);
    assert.ok(result.blocks.some(b => b.text === literal && b.page === null));
  }
});

test('source quotation marks and dashes are retained in every text section', async () => {
  const literal = '必须填写“合格”—验收。';
  const result = await extractLegacyDoc(fixture({ body: `${literal}\r`, notes: { footnotes: literal, endnotes: literal, annotations: literal, bodyTextboxes: literal, headerTextboxes: literal } }));
  for (const key of ['body', 'footnotes', 'endnotes', 'annotations', 'bodyTextboxes', 'headerTextboxes']) assert.ok(result.sections.find(s => s.key === key).text.includes(literal), key);
});

test('repeated text pieces cannot amplify a small input into unbounded decoded text', async () => {
  const cfb = CFB.read(fixture({ body: `${'采购要求'.repeat(250)}\r` }), { type: 'buffer' });
  const word = cfb.FileIndex.find(entry => entry.name === 'WordDocument').content;
  const count = 2000, characters = 1001, pieceBytes = 12 * count + 4;
  const table = Buffer.alloc(5 + pieceBytes); table[0] = 2; table.writeUInt32LE(pieceBytes, 1);
  for (let i = 0; i <= count; i++) table.writeUInt32LE(i * characters, 5 + i * 4);
  for (let i = 0; i < count; i++) table.writeUInt32LE(1024, 5 + (count + 1) * 4 + i * 8 + 2);
  word.writeUInt32LE(table.length, 0x1a6); word.writeUInt32LE(characters * count, 0x4c);
  CFB.utils.cfb_add(cfb, '0Table', table);
  await assert.rejects(extractLegacyDoc(Buffer.from(CFB.write(cfb, { type: 'buffer' }))), error => error.code === 'DOC_TOO_LARGE');
});

test('reverse physical FAT chains cannot cause quadratic CFB materialization', async () => {
  const input = fixture({ extraStreams: [['Opaque', Buffer.alloc(32000, 1)]] });
  const cfb = CFB.read(input, { type: 'buffer' });
  const index = cfb.FileIndex.findIndex(entry => entry.name === 'Opaque');
  const entry = cfb.FileIndex[index];
  const fatOffset = (input.readInt32LE(76) + 1) * 512;
  const ids = []; let next = entry.start;
  while (next >= 0) { ids.push(next); next = input.readInt32LE(fatOffset + next * 4); }
  const reversed = ids.reverse();
  for (let i = 0; i < reversed.length; i++) input.writeInt32LE(i + 1 < reversed.length ? reversed[i + 1] : -2, fatOffset + reversed[i] * 4);
  const directoryOffset = (input.readInt32LE(48) + 1) * 512;
  input.writeInt32LE(reversed[0], directoryOffset + index * 128 + 116);
  await assert.rejects(extractLegacyDoc(input), error => error.code === 'DOC_TOO_LARGE');
});

test('unknown FIB versions and incompatible fixed layouts are rejected explicitly', async () => {
  await assert.rejects(extractLegacyDoc(fixture({ nFib: 0xffff })), error => error.code === 'DOC_VERSION_UNSUPPORTED');
  const cfb = CFB.read(fixture(), { type: 'buffer' });
  cfb.FileIndex.find(entry => entry.name === 'WordDocument').content.writeUInt16LE(0, 0x20);
  await assert.rejects(extractLegacyDoc(Buffer.from(CFB.write(cfb, { type: 'buffer' }))), error => error.code === 'DOC_CORRUPT');
});

test('a final sector may omit unused padding while still containing every declared stream byte', async () => {
  const input = fixture({ body: `${'采购要求'.repeat(500)}\r` });
  const cfb = CFB.read(input, { type: 'buffer' });
  const miniStream = cfb.FileIndex[0];
  const usedEnd = (miniStream.start + 1) * 512 + miniStream.size;
  assert.ok(usedEnd < input.length && input.length - usedEnd < 512);
  const result = await extractLegacyDoc(input.subarray(0, usedEnd));
  assert.ok(result.sections.find(section => section.key === 'body').text.endsWith('采购要求\n'));
  await assert.rejects(extractLegacyDoc(input.subarray(0, usedEnd - 1)), error => error.code === 'DOC_CORRUPT');
});

test('multi-sector FAT cycles are rejected without entering the upstream allocation loop', async () => {
  const input = fixture();
  const cfb = CFB.read(input, { type: 'buffer' });
  const word = cfb.FileIndex.find(entry => entry.name === 'WordDocument');
  const fatOffset = (input.readInt32LE(76) + 1) * 512;
  input.writeInt32LE(word.start, fatOffset + (word.start + 1) * 4);
  await assert.rejects(extractLegacyDoc(input), error => error.code === 'DOC_CORRUPT');
});

test('directory self-cycles are rejected before compound path reconstruction', async () => {
  const input = fixture();
  const cfb = CFB.read(input, { type: 'buffer' });
  const index = cfb.FileIndex.findIndex(entry => entry.name === 'WordDocument');
  const directoryOffset = (input.readInt32LE(48) + 1) * 512;
  input.writeInt32LE(index, directoryOffset + index * 128 + 68);
  await assert.rejects(extractLegacyDoc(input), error => error.code === 'DOC_CORRUPT');
});

for (const [description, change] of [
  ['non-integral piece count', cfb => cfb.FileIndex.find(entry => entry.name === '0Table').content.writeUInt32LE(15, 1)],
  ['nonzero first character position', cfb => cfb.FileIndex.find(entry => entry.name === '0Table').content.writeUInt32LE(1, 5)],
  ['backwards character positions', cfb => cfb.FileIndex.find(entry => entry.name === '0Table').content.writeUInt32LE(0, 9)],
  ['story larger than decoded text', cfb => cfb.FileIndex.find(entry => entry.name === 'WordDocument').content.writeUInt32LE(9999, 0x4c)],
  ['CLX beyond stream end', cfb => cfb.FileIndex.find(entry => entry.name === 'WordDocument').content.writeUInt32LE(999999, 0x1a6)],
]) test(`invalid Word character allocation is explicit: ${description}`, async () => {
  const cfb = CFB.read(fixture(), { type: 'buffer' }); change(cfb);
  await assert.rejects(extractLegacyDoc(Buffer.from(CFB.write(cfb, { type: 'buffer' }))), error => error.code === 'DOC_CORRUPT');
});

test('Unicode embedded names and exact sizes are inventoried without expanding or executing attachments', async () => {
  const objects = [
    nativeObject('fallback.rar', Buffer.from('Rar!\x1a\x07\x00'), { unicodeName: '技术标准.rar' }),
    nativeObject('drawings.rar', Buffer.from('Rar!\x1a\x07\x00'), { unicodeName: '标段一图纸.rar' }),
    nativeObject('drawings2.pdf', Buffer.from('%PDF-1.7\n'), { unicodeName: '标段二图纸.pdf' }),
    nativeObject('drawings3.pdf', Buffer.from('%PDF-1.7\n'), { unicodeName: '标段三图纸.pdf' }),
  ];
  const input = fixture({ objects }); const before = createHash('sha256').update(input).digest('hex');
  const result = await extractLegacyDoc(input);
  assert.deepEqual(result.attachments.map(a => [a.name, a.format, a.bytes, a.parsed]), [
    ['技术标准.rar', 'rar', 7, false], ['标段一图纸.rar', 'rar', 7, false],
    ['标段二图纸.pdf', 'pdf', 9, false], ['标段三图纸.pdf', 'pdf', 9, false],
  ]);
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some(w => w.code === 'DOC_EMBEDDED_UNPARSED'));
  assert.equal(JSON.stringify(result).includes('C:\\\\PRIVATE'), false);
  assert.equal(createHash('sha256').update(input).digest('hex'), before);
});

test('VBA is reported only as skipped metadata and image/layout coverage remains incomplete', async () => {
  const result = await extractLegacyDoc(fixture({ macro: true, extraStreams: [['Data', Buffer.from([1, 2, 3])]] }));
  assert.equal(result.macros.present, true);
  assert.ok(result.macros.streamCount >= 1);
  assert.equal(result.images.status, 'not-extracted');
  assert.ok(result.images.containerStreams.some(s => s.name === 'Data'));
  assert.ok(result.warnings.some(w => w.code === 'DOC_MACROS_SKIPPED'));
  assert.ok(result.warnings.some(w => w.code === 'DOC_LAYOUT_UNVERIFIED'));
  assert.equal(result.complete, false);
});

for (const flags of [0x1100, 0x9100]) test(`encrypted DOC flags ${flags.toString(16)} are rejected before text can be treated as readable`, async () => {
  await assert.rejects(extractLegacyDoc(fixture({ flags })), error => error.code === 'DOC_ENCRYPTED');
});

test('the ignored obfuscation bit alone does not reject an unencrypted document and 1Table is selected', async () => {
  const result = await extractLegacyDoc(fixture({ flags: 0x9200 }));
  assert.ok(result.blocks.some(b => b.text === '工期：28日历天。'));
  assert.equal(result.metadata.tableStream, '1Table');
});

test('a non-Word compound file is explicitly rejected rather than decoded as document text', async () => {
  const cfb = CFB.utils.cfb_new(); CFB.utils.cfb_add(cfb, 'Workbook', Buffer.alloc(4096));
  await assert.rejects(extractLegacyDoc(Buffer.from(CFB.write(cfb, { type: 'buffer' }))), error => error.code === 'DOC_NOT_WORD');
});

test('an embedded WordDocument stream cannot impersonate the main root Word document', async () => {
  const cfb = CFB.utils.cfb_new(); CFB.utils.cfb_add(cfb, 'ObjectPool/item/WordDocument', Buffer.alloc(4096));
  await assert.rejects(extractLegacyDoc(Buffer.from(CFB.write(cfb, { type: 'buffer' }))), error => error.code === 'DOC_NOT_WORD');
});

test('encrypted Office packages are classified as encryption rather than an empty Word document', async () => {
  const cfb = CFB.utils.cfb_new(); CFB.utils.cfb_add(cfb, 'EncryptedPackage', Buffer.alloc(4096));
  await assert.rejects(extractLegacyDoc(Buffer.from(CFB.write(cfb, { type: 'buffer' }))), error => error.code === 'DOC_ENCRYPTED');
});

for (const options of [{ missingTable: true }, { corruptPiece: true }]) test(`missing or corrupt Word piece streams produce explicit failure: ${JSON.stringify(options)}`, async () => {
  await assert.rejects(extractLegacyDoc(fixture(options)), error => error.code === 'DOC_CORRUPT');
});

test('oversize, invalid input and invalid signature have distinct readable failures', async () => {
  await assert.rejects(extractLegacyDoc(Buffer.alloc(700), { maxBytes: 699 }), error => error.code === 'DOC_TOO_LARGE');
  await assert.rejects(extractLegacyDoc('not a buffer'), error => error.code === 'DOC_INVALID_INPUT');
  await assert.rejects(extractLegacyDoc(Buffer.alloc(1024)), error => error.code === 'DOC_INVALID_FORMAT');
});

test('unsupported pre-Word97 FIB versions do not yield apparently valid text', async () => {
  await assert.rejects(extractLegacyDoc(fixture({ nFib: 0x0065 })), error => error.code === 'DOC_VERSION_UNSUPPORTED');
});

test('a corrupt embedded record preserves readable main text and a visible unparsed gap', async () => {
  const result = await extractLegacyDoc(fixture({ objects: [nativeObject('broken.pdf', Buffer.from('%PDF'), { badSize: true })] }));
  assert.ok(result.blocks.some(b => b.text === '工期：28日历天。'));
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].parsed, false);
  assert.ok(result.warnings.some(w => w.code === 'DOC_EMBEDDED_INVALID'));
  assert.equal(result.complete, false);
});

test('unknown OLE object storage remains a named coverage gap', async () => {
  const result = await extractLegacyDoc(fixture({ extraStreams: [['ObjectPool/equation/Contents', Buffer.from([1, 2, 3])]] }));
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].format, 'unknown');
  assert.equal(result.attachments[0].parsed, false);
  assert.ok(result.warnings.some(w => w.code === 'DOC_EMBEDDED_UNPARSED'));
});

test('a cancelled request is not parsed or presented as a successful document', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(extractLegacyDoc(fixture(), { signal: controller.signal }), error => error.name === 'AbortError');
});

test('a public synthetic long DOC retains complete text and four unparsed OLE attachments without modifying input', async () => {
  const input = createPublicLongLegacyDocFixture();
  const before = createHash('sha256').update(input).digest('hex');
  const result = await extractLegacyDoc(input);
  const text = result.sections.find(section => section.key === 'body').text;
  for (const literal of [
    '合成长文演练：SYNTH-DOC-2026-01，仅用于文件读取测试。',
    '资格条件：供应商须具备有效的施工资质，证明材料须另行核验。',
    '报价规则：最高限价为780000元，报价超过该限价的响应无效。',
    '工期要求：合同生效后47日历天完成验收。',
    '验收规则：完成防水试验且整改关闭后办理验收。',
    '付款条件：验收合格并完成审计后支付合同价的92%，其余8%按质保约定支付。',
    '合成核验记录0700：本条为虚构的屋面巡检记录，核对示例构造的基层、搭接、固定和收口，所有责任与处理结果均由测试人员另行复核。',
  ]) assert.ok(text.includes(literal), literal);
  assert.ok(text.length > 50000);
  assert.equal((text.match(/^合成核验记录\d{4}：/gm) || []).length, 1400);
  assert.ok(text.includes('合成核验记录0001：'));
  assert.ok(text.includes('合成核验记录1400：'));
  assert.ok(text.endsWith('全文结束核对：SYNTH-DOC-END-1400，尾部内容必须完整保留。\n'));
  assert.ok(text.includes('SYNTH-01\t合成节点A\t防水收口与排水坡度\t'));
  assert.deepEqual(result.attachments.map(attachment => [attachment.name, attachment.format, attachment.parsed]), [
    ['合成甲标段图纸.pdf', 'pdf', false], ['合成乙标段图纸.pdf', 'pdf', false],
    ['合成技术要求.rar', 'rar', false], ['合成节点说明.rar', 'rar', false],
  ]);
  assert.ok(result.attachments.every(attachment => attachment.bytes > 0));
  assert.ok(result.warnings.some(warning => warning.code === 'DOC_EMBEDDED_UNPARSED'));
  assert.ok(result.warnings.some(warning => warning.code === 'DOC_LAYOUT_UNVERIFIED'));
  assert.equal(result.blocks.every(block => block.page === null), true);
  assert.equal(result.complete, false);
  assert.equal(createHash('sha256').update(input).digest('hex'), before);
});
