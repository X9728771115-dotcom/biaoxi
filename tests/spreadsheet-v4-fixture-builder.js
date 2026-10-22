import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const XLSX = createRequire(import.meta.url)('xlsx');

// SheetJS's XLS writer omits formulas. Insert a real BIFF8 multiplication
// FORMULA record with explicit absolute references and a specified cached value.
export function addBiffFormula(bytes, { address = 'G3', left = 'E3', right = 'F3', value = 300.5 } = {}) {
  const target = XLSX.utils.decode_cell(address);
  const leftCell = XLSX.utils.decode_cell(left); const rightCell = XLSX.utils.decode_cell(right);
  const cfb = XLSX.CFB.read(bytes, { type: 'buffer' });
  const stream = cfb.FileIndex.find(entry => entry.name === 'Workbook');
  const content = Buffer.from(stream.content);
  let position = -1;
  for (let offset = 0; offset + 4 < content.length;) {
    const id = content.readUInt16LE(offset); const length = content.readUInt16LE(offset + 2);
    if (id === 0x0203 && content.readUInt16LE(offset + 4) === target.r && content.readUInt16LE(offset + 6) === target.c) { position = offset; break; }
    offset += length + 4;
  }
  if (position < 0) throw new Error(`TEST fixture missing numeric record ${address}`);
  const record = Buffer.alloc(37);
  record.writeUInt16LE(0x0006, 0); record.writeUInt16LE(33, 2);
  content.copy(record, 4, position + 4, position + 10);
  record.writeDoubleLE(value, 10); record.writeUInt16LE(11, 24);
  record[26] = 0x24; record.writeUInt16LE(leftCell.r, 27); record.writeUInt16LE(leftCell.c, 29);
  record[31] = 0x24; record.writeUInt16LE(rightCell.r, 32); record.writeUInt16LE(rightCell.c, 34); record[36] = 0x05;
  const delta = record.length - 18;
  for (let offset = 0; offset + 4 < content.length;) {
    const length = content.readUInt16LE(offset + 2);
    if (content.readUInt16LE(offset) === 0x0085 && content.readUInt32LE(offset + 4) > position) content.writeUInt32LE(content.readUInt32LE(offset + 4) + delta, offset + 4);
    offset += length + 4;
  }
  stream.content = Buffer.concat([content.subarray(0, position), record, content.subarray(position + 18)]);
  stream.size = stream.content.length;
  return XLSX.CFB.write(cfb, { type: 'buffer' });
}

export function qaWorkbookBytes(format) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['功能测试清单（虚构产品，不是真实采购清单）'],
    ['序号', '项目名称', '规格型号', '制造商', '单位', '工程量', '综合单价', '合价（元）'],
    [1, '激光打印机', 'TEST-LP100', '演示制造有限公司（测试）', '台', 2, 1200, 2400],
    [2, '自粘防水卷材', 'TEST-WP3', '演示建材有限公司（测试）', '㎡', 1440, 18, 25920],
    [3, '雨水口', 'DN150', '', '个', 16, 25, 400],
  ]);
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
  sheet.H3 = { t: 'n', v: 2400, f: 'F3*G3', z: '0.00' };
  XLSX.utils.book_append_sheet(book, sheet, '工程量与产品清单');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['功能测试评分表（虚构要求，仅用于软件功能验证）'],
    ['评审内容', '具体标准和要求', '分值', '证明材料'],
    ['技术响应', '演示项满足测试要求得6分，否则不得分。', 6, '测试响应说明'],
    ['产品政策证明', '提供匹配型号的演示材料得4分；仅测试用途。', 4, '虚构证书样本（不得作为真实投标材料）'],
  ]), '评分表');
  const bytes = XLSX.write(book, { type: 'buffer', bookType: format, bookSST: true });
  return format === 'xls' ? addBiffFormula(bytes, { address: 'H3', left: 'F3', right: 'G3', value: 2400 }) : bytes;
}

if (process.argv.includes('--write-qa')) {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../../演示输入');
  await mkdir(directory, { recursive: true });
  for (const format of ['xlsx', 'xls']) {
    const path = join(directory, `测试工程量与产品清单.${format}`);
    await writeFile(path, qaWorkbookBytes(format));
    console.log(path);
  }
}
