import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { createRequire } from 'node:module';
import { crc32 } from 'node:zlib';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const JSZip = createRequire(require.resolve('mammoth'))('jszip');
const sax = require('sax');
const CFB_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const LIMITS = { bytes: 20 * 1024 * 1024, unpacked: 64 * 1024 * 1024, entry: 16 * 1024 * 1024, entries: 5000, sheets: 100, rows: 100000, columns: 1024, cells: 200000, tableSlots: 2000000, headerReferences: 2000000, headerDepth: 16, merges: 10000 };

function abort(signal) {
  if (signal?.aborted) throw new DOMException('分析已取消', 'AbortError');
}

function fail(code, message) { throw Object.assign(new Error(message), { code }); }

function warning(result, code, message, source = {}, incomplete = false) {
  result.warnings.push({ code, message, ...source });
  if (incomplete) result.complete = false;
}

function checkRange(range) {
  if (!range || !Number.isInteger(range.s.r) || !Number.isInteger(range.e.r) || !Number.isInteger(range.s.c) || !Number.isInteger(range.e.c) || range.s.r < 0 || range.s.c < 0 || range.e.r < range.s.r || range.e.c < range.s.c || range.e.r >= LIMITS.rows || range.e.c >= LIMITS.columns) fail('SPREADSHEET_LIMIT', '工作表行列范围超出安全读取上限（100000 行、1024 列），请拆分后重新上传');
}

function validateXML(bytes, part) {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  const xml = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const parser = sax.parser(true);
  const worksheet = part.startsWith('xl/worksheets/');
  let cell = null; let value = null;
  parser.onerror = error => fail('SPREADSHEET_READ_FAILED', `${part} XML 结构损坏：${error.message}`);
  parser.ondoctype = () => fail('SPREADSHEET_READ_FAILED', `${part} 包含不允许的 XML DTD 声明`);
  parser.onopentag = tag => {
    const name = tag.name.split(':').at(-1);
    if (worksheet && name === 'c') cell = { address: tag.attributes.r || '未知单元格', type: tag.attributes.t || 'n' };
    if (cell && name === 'v') value = '';
  };
  const text = content => { if (value !== null) value += content; };
  parser.ontext = text; parser.oncdata = text;
  parser.onclosetag = tag => {
    const name = tag.split(':').at(-1);
    if (cell && name === 'v') {
      if (cell.type === 'n' && (value.trim() === '' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value)))) fail('SPREADSHEET_READ_FAILED', `${part}!${cell.address} 包含无效或非有限数值：${value.slice(0, 80)}`);
      value = null;
    }
    if (name === 'c') cell = null;
  };
  parser.write(xml).close();
}

async function validateArchiveEntries(entries, signal) {
  let total = 0;
  for (const entry of entries) {
    abort(signal);
    let size = 0; let checksum = 0;
    const isXML = /\.(?:xml|rels)$/i.test(entry.name);
    const xmlChunks = [];
    // Bound actual decompression too, so forged declared sizes cannot bypass caps.
    for await (const chunk of new Readable().wrap(entry.nodeStream())) {
      abort(signal);
      size += chunk.length; total += chunk.length;
      if (size > LIMITS.entry || total > LIMITS.unpacked || size > Number(entry._data.uncompressedSize)) fail('SPREADSHEET_LIMIT', 'Excel 实际解压内容超过安全读取上限或声明大小');
      checksum = crc32(chunk, checksum);
      if (isXML) xmlChunks.push(chunk);
    }
    if (size !== Number(entry._data.uncompressedSize) || checksum !== (entry._data.crc32 >>> 0)) fail('SPREADSHEET_READ_FAILED', `${entry.name} ZIP 内容损坏：CRC32 或大小不匹配`);
    if (isXML) validateXML(Buffer.concat(xmlChunks, size), entry.name);
  }
}

async function preflight(buffer, result, signal) {
  if (buffer.length > LIMITS.bytes) fail('SPREADSHEET_LIMIT', 'Excel 文件超过 20 MiB 读取上限，请拆分后上传');
  if (buffer.subarray(0, 8).equals(CFB_SIGNATURE)) {
    const cfb = XLSX.CFB.read(buffer, { type: 'buffer' });
    if (cfb.FullPaths.some(path => /(?:^|\/)(?:EncryptedPackage|EncryptionInfo)(?:\/|$)/i.test(path))) fail('SPREADSHEET_ENCRYPTED', 'Excel 文件已加密，请先解除密码保护后上传');
    if (!cfb.FullPaths.some(path => /(?:^|\/)(?:Workbook|Book)(?:\/|$)/i.test(path))) fail('SPREADSHEET_READ_FAILED', '文件不是可读取的 XLS 工作簿');
    if (cfb.FullPaths.some(path => /(?:^|\/)(?:VBA|_VBA_PROJECT_CUR)(?:\/|$)/i.test(path))) warning(result, 'SPREADSHEET_MACROS_NOT_EXECUTED', '检测到宏；只提取工作表单元格，不执行或分析宏');
    return;
  }
  if (buffer.readUInt16LE(0) !== 0x4b50) fail('SPREADSHEET_READ_FAILED', '文件不是有效的 XLSX/XLS 工作簿（不将文本文件冒充 Excel 读取）');
  const zip = await JSZip.loadAsync(buffer);
  abort(signal);
  const entries = Object.values(zip.files).filter(entry => !entry.dir);
  const sizes = entries.map(entry => Number(entry._data?.uncompressedSize || 0));
  if (entries.length > LIMITS.entries || sizes.some(size => size > LIMITS.entry) || sizes.reduce((total, size) => total + size, 0) > LIMITS.unpacked) fail('SPREADSHEET_LIMIT', 'Excel 解压内容超过安全读取上限（单项 16 MiB、总计 64 MiB），请拆分后上传');
  if (!zip.file('[Content_Types].xml') || !zip.file('xl/workbook.xml')) fail('SPREADSHEET_READ_FAILED', '压缩文件缺少 Excel 工作簿结构');
  await validateArchiveEntries(entries, signal);
  if (entries.some(entry => /vbaProject\.bin$/i.test(entry.name))) warning(result, 'SPREADSHEET_MACROS_NOT_EXECUTED', '检测到宏；只提取工作表单元格，不执行或分析宏');
  if (entries.some(entry => /^xl\/externalLinks\//.test(entry.name))) warning(result, 'SPREADSHEET_EXTERNAL_LINK', '检测到外部工作簿引用；不访问外部文件，仅保留公式和已有缓存');
}

function normalized(text) { return text.normalize('NFKC').replace(/[ \t]+/g, ' ').trim(); }

function headerLike(cells) {
  if (cells.some(cell => /^\d+(?:\.\d+)?$/.test(cell.trim()))) return false;
  return cells.filter(cell => cell.length < 55 && /序号|名称|型号|规格|单位|工程量|数量|金额|单价|合价|评审内容|评分项|标准|分值|证明材料|分类|主客观|参数|事项/.test(cell) && !/必须|须提供|不得分|得\d+分/.test(cell)).length >= 2;
}

function cellRecord(cell, address, sheet, input, result) {
  const position = XLSX.utils.decode_cell(address);
  const source = { documentId: input.id, fileName: input.fileName, sheet, row: position.r + 1, column: position.c + 1, cell: address };
  const formula = cell.f ?? null;
  if (cell.t === 'n' && cell.v !== undefined && (typeof cell.v !== 'number' || !Number.isFinite(cell.v))) fail('SPREADSHEET_READ_FAILED', `${sheet}!${address} 包含无效或非有限数值`);
  const hasCachedValue = formula !== null && cell.t !== 'z' && cell.v !== undefined && cell.v !== null;
  const displayValue = hasCachedValue || formula === null ? String(cell.w ?? (cell.v === undefined || cell.v === null ? '' : XLSX.utils.format_cell(cell))) : `=${formula}`;
  const record = { address, row: source.row, column: source.column, type: cell.t, rawValue: cell.v ?? null, displayValue, formula, cachedValue: hasCachedValue ? cell.v : null, hasCachedValue, numberFormat: cell.z ?? null, source };
  if (cell.F) record.arrayFormulaRange = cell.F;
  if (cell.l) record.hyperlink = { target: cell.l.Target ?? '', tooltip: cell.l.Tooltip ?? '' };
  if (cell.c?.length) record.comments = cell.c.map(comment => ({ author: comment.a ?? '', text: comment.t ?? '' }));
  if (formula !== null && !hasCachedValue) warning(result, 'SPREADSHEET_FORMULA_CACHE_MISSING', `${sheet}!${address} 的公式缺少缓存结果；未计算，金额/评分待核验`, source, true);
  if (formula !== null && cell.t === 'e') warning(result, 'SPREADSHEET_FORMULA_ERROR', `${sheet}!${address} 的公式缓存为错误值，待核验`, source, true);
  if ((formula !== null && /\[[^\]]+\]|\b(?:WEBSERVICE|DDE)\s*\(/i.test(formula)) || (cell.l?.Target && !cell.l.Target.startsWith('#'))) warning(result, 'SPREADSHEET_EXTERNAL_LINK', `${sheet}!${address} 含外部引用；未访问、执行或刷新`, source);
  return record;
}

function extractSheet(workbook, name, index, input, result, count, signal) {
  abort(signal);
  const worksheet = workbook.Sheets[name];
  if (!worksheet) fail('SPREADSHEET_READ_FAILED', `工作表 ${name} 内容缺失`);
  const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
  if (range) checkRange(range);
  const mergeRanges = worksheet['!merges'] || [];
  if (mergeRanges.length > LIMITS.merges) fail('SPREADSHEET_LIMIT', '合并单元格数量超过安全读取上限');
  const merges = mergeRanges.map(merge => { checkRange(merge); return { range: XLSX.utils.encode_range(merge), anchor: XLSX.utils.encode_cell(merge.s), rowStart: merge.s.r + 1, rowEnd: merge.e.r + 1, columnStart: merge.s.c + 1, columnEnd: merge.e.c + 1 }; });
  const addresses = Object.keys(worksheet).filter(key => /^[A-Z]+[1-9]\d*$/.test(key));
  count.cells += addresses.length;
  if (count.cells > LIMITS.cells) fail('SPREADSHEET_LIMIT', '工作簿原始单元格数量超过 200000 个读取上限，请拆分后上传');
  const cells = addresses.map(address => {
    const position = XLSX.utils.decode_cell(address);
    checkRange({ s: position, e: position });
    return cellRecord(worksheet[address], address, name, input, result);
  }).sort((left, right) => left.row - right.row || left.column - right.column);
  const sheet = { name, index, documentId: input.id, fileName: input.fileName, hidden: (workbook.Workbook?.Sheets?.[index]?.Hidden || 0) > 0, visibility: workbook.Workbook?.Sheets?.[index]?.Hidden || 0, range: worksheet['!ref'] || null, merges, cells, rowCount: range ? range.e.r + 1 : 0, columnCount: range ? range.e.c + 1 : 0 };
  result.sheets.push(sheet);
  const meaningful = cells.filter(cell => cell.displayValue !== '' || cell.formula !== null || cell.comments?.length);
  if (!meaningful.length) return;
  let columnCount = 0;
  for (const cell of meaningful) if (cell.column > columnCount) columnCount = cell.column;
  const byAddress = new Map(cells.map(cell => [cell.address, cell]));
  const rowMap = new Map();
  for (const cell of meaningful) {
    if (!rowMap.has(cell.row)) rowMap.set(cell.row, []);
    rowMap.get(cell.row).push(cell);
  }
  count.tableSlots += rowMap.size * columnCount;
  if (count.tableSlots > LIMITS.tableSlots) fail('SPREADSHEET_LIMIT', '稀疏表格展开超过 2000000 个单元格位置上限，请缩小无内容的列间隔或拆分工作簿');
  let headers = []; let headerSources = Array.from({ length: columnCount }, () => []);
  let previousHeaderRow = null; let previousHeaderHasMerge = false;
  const rows = [];
  for (const [row, sourceCells] of rowMap) {
    abort(signal);
    const values = Array(columnCount).fill('');
    for (const cell of sourceCells) values[cell.column - 1] = cell.displayValue;
    if (headerLike(values)) {
      const related = row === previousHeaderRow + 1 && previousHeaderHasMerge;
      const next = [...values]; const sources = related ? headerSources.map(items => [...items]) : Array.from({ length: columnCount }, () => []);
      for (let column = 1; column <= columnCount; column++) {
        const merge = merges.find(item => item.rowStart <= row && item.rowEnd >= row && item.columnStart <= column && item.columnEnd >= column);
        const anchor = merge ? byAddress.get(merge.anchor) : null;
        const own = sourceCells.find(cell => cell.column === column);
        if (!next[column - 1] && anchor) next[column - 1] = anchor.displayValue;
        if (!next[column - 1] && related) next[column - 1] = headers[column - 1] || '';
        const reference = own?.displayValue ? own : anchor;
        if (reference && !sources[column - 1].some(source => source.cell === reference.address)) sources[column - 1].push(Object.freeze(reference.source));
        if (sources[column - 1].length > LIMITS.headerDepth) fail('SPREADSHEET_LIMIT', '合并表头层级超过 16 层读取上限');
      }
      headers = Object.freeze(next); headerSources = Object.freeze(sources.map(items => Object.freeze(items)));
      previousHeaderRow = row;
      previousHeaderHasMerge = merges.some(merge => merge.rowStart <= row && merge.rowEnd >= row && (merge.rowEnd > row || merge.columnEnd > merge.columnStart));
    }
    count.headerReferences += headerSources.reduce((total, items) => total + items.length, 0);
    if (count.headerReferences > LIMITS.headerReferences) fail('SPREADSHEET_LIMIT', '表头来源引用超过 2000000 个输出上限');
    rows.push({ row, rowStart: row, rowEnd: row, sheet: name, page: null, cells: values, text: values.join(' | '), sourceCells, ...(headers.length ? { headers, headerSources } : {}) });
  }
  // Short blocks make sheet/row references useful while tableId preserves table semantics.
  for (let offset = 0; offset < rows.length; offset += 200) {
    const tableRows = rows.slice(offset, offset + 200);
    const rowStart = tableRows[0].row; const rowEnd = tableRows.at(-1).row;
    const text = tableRows.map(row => row.text).join('\n');
    result.blocks.push({ id: `${input.id}:b${result.blocks.length + 1}`, documentId: input.id, fileName: input.fileName, text, normalizedText: normalized(text), page: null, section: `工作表 ${name} / 第 ${rowStart}–${rowEnd} 行`, kind: 'table', heading: false, sheet: name, rowStart, rowEnd, cells: tableRows.flatMap(row => row.sourceCells), tableRows, tableHeaders: tableRows.find(row => row.headers)?.headers || [], tableId: `${input.id}:sheet${index + 1}`, continued: offset > 0 });
  }
}

/** Read values and cached formulas only. SheetJS does not evaluate formulas/macros. */
export async function extractSpreadsheet(input, { onProgress, signal } = {}) {
  abort(signal);
  const format = extname(input.fileName || '').slice(1).toLowerCase() || (input.mimeType === 'application/vnd.ms-excel' ? 'xls' : 'xlsx');
  const result = { id: input.id, fileName: input.fileName, format, pages: [], blocks: [], warnings: [], complete: true, sheets: [] };
  const progress = (phase, value, message) => { abort(signal); onProgress?.({ phase, progress: value, message }); abort(signal); };
  try {
    progress('reading', 0, `正在读取 ${input.fileName}`);
    if (!input.buffer && (await stat(input.path)).size > LIMITS.bytes) fail('SPREADSHEET_LIMIT', 'Excel 文件超过 20 MiB 读取上限，请拆分后上传');
    const buffer = input.buffer ? Buffer.from(input.buffer) : await readFile(input.path);
    abort(signal);
    if (buffer.length < 8) fail('SPREADSHEET_READ_FAILED', 'Excel 文件为空或已截断');
    await preflight(buffer, result, signal);
    abort(signal);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellText: true, cellNF: true, cellDates: false, sheetStubs: true, bookVBA: false, bookDeps: false, WTF: true });
    if (!workbook.SheetNames?.length) fail('SPREADSHEET_READ_FAILED', '工作簿缺少可读取工作表');
    if (workbook.SheetNames.length > LIMITS.sheets) fail('SPREADSHEET_LIMIT', '工作表超过 100 张读取上限，请拆分后上传');
    const count = { cells: 0, tableSlots: 0, headerReferences: 0 };
    for (let index = 0; index < workbook.SheetNames.length; index++) {
      extractSheet(workbook, workbook.SheetNames[index], index, input, result, count, signal);
      progress('spreadsheet', (index + 1) / workbook.SheetNames.length, `已读取工作表 ${workbook.SheetNames[index]}`);
    }
    if (!result.blocks.length) warning(result, 'NO_TEXT', '工作簿未提取到可分析内容，请核对原件', {}, true);
    progress('complete', 1, result.complete ? 'Excel 工作表提取完成' : 'Excel 部分内容需要核验');
  } catch (error) {
    abort(signal);
    // Preserve any already extracted sheets while explicitly marking coverage incomplete.
    warning(result, error.code?.startsWith('SPREADSHEET_') ? error.code : /password|encrypt/i.test(error.message) ? 'SPREADSHEET_ENCRYPTED' : 'SPREADSHEET_READ_FAILED', `Excel 读取失败：${error.message}。请核对是否损坏、加密或超限`, {}, true);
  }
  return result;
}
