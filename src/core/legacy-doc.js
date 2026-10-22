import XLSX from 'xlsx';
import WordExtractor from 'word-extractor';

const { CFB } = XLSX;
const SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const MAX_BYTES = 100 * 1024 * 1024;
const SECTION_NAMES = {
  body: '正文', headers: '页眉', footers: '页脚', footnotes: '脚注', endnotes: '尾注',
  annotations: '批注', bodyTextboxes: '正文文本框', headerTextboxes: '页眉页脚文本框',
};

function failure(code, message) { return Object.assign(new Error(message), { code }); }
function corrupt(message = '文件结构损坏或不完整') { return failure('DOC_CORRUPT', `旧版 Word 文件${message}，请用 Word/WPS 另存为 DOCX 后重试。`); }
function checkAbort(signal) { if (signal?.aborted) throw new DOMException('分析已取消', 'AbortError'); }

// The upstream OLE reader does not bound multi-node FAT or directory cycles.
// Validate those graphs before CFB.read, then give the text reader a newly built,
// two-stream compound file. Original bytes, VBA and embedded objects stay inert.
function preflightCompound(buffer) {
  const major = buffer.readUInt16LE(26), shift = buffer.readUInt16LE(30);
  if (buffer.readUInt16LE(28) !== 0xfffe || !((major === 3 && shift === 9) || (major === 4 && shift === 12)) || buffer.readUInt16LE(32) !== 6 || buffer.readUInt32LE(56) !== 4096) throw corrupt('的复合文档头无效');
  // Some WPS writers omit only the unused padding of the final sector. Its
  // existing bytes remain usable; stream-size checks below still reject loss.
  const sectorSize = 2 ** shift, sectorCount = Math.ceil(buffer.length / sectorSize) - 1;
  if (sectorCount < 1) throw corrupt();
  const sector = id => {
    if (!Number.isInteger(id) || id < 0 || id >= sectorCount) throw corrupt('的扇区指针越界');
    return buffer.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);
  };
  const fatCount = buffer.readUInt32LE(44), miniFatCount = buffer.readUInt32LE(64), difatCount = buffer.readUInt32LE(72);
  if (!fatCount || fatCount > sectorCount || miniFatCount > sectorCount || difatCount > sectorCount) throw corrupt('的分配表长度无效');
  const fatIds = [], difatSeen = new Set();
  for (let offset = 76; offset < 512; offset += 4) { const id = buffer.readInt32LE(offset); if (id >= 0) fatIds.push(id); else if (id !== -1) throw corrupt('的分配表目录无效'); }
  let difatId = buffer.readInt32LE(68);
  for (let i = 0; i < difatCount; i++) {
    if (difatSeen.has(difatId)) throw corrupt('的分配表存在循环');
    difatSeen.add(difatId);
    const part = sector(difatId);
    for (let offset = 0; offset < sectorSize - 4; offset += 4) { const id = part.readInt32LE(offset); if (id >= 0) fatIds.push(id); else if (id !== -1) throw corrupt('的分配表目录无效'); }
    difatId = part.readInt32LE(sectorSize - 4);
  }
  if (difatId !== -2 && !(difatCount === 0 && difatId === -1)) throw corrupt('的分配表链未正常结束');
  if (fatIds.length !== fatCount || new Set(fatIds).size !== fatIds.length) throw corrupt('的分配表数量不一致');
  const fat = Buffer.concat(fatIds.map(sector));
  if (fat.length < sectorCount * 4) throw corrupt('的分配表被截断');
  const colors = new Uint8Array(sectorCount), tailBytes = new Float64Array(sectorCount);
  for (let start = 0; start < sectorCount; start++) {
    if (colors[start]) continue;
    const walk = []; let id = start;
    while (id >= 0) {
      if (id >= sectorCount) throw corrupt('的扇区链越界');
      if (colors[id] === 1) throw corrupt('的扇区链存在循环');
      if (colors[id] === 2) break;
      colors[id] = 1; walk.push(id); id = fat.readInt32LE(id * 4);
      if (id < -4) throw corrupt('的扇区链终止标志无效');
    }
    let tail = id >= 0 ? tailBytes[id] : 0;
    for (let index = walk.length - 1; index >= 0; index--) {
      const visited = walk[index]; tail += sector(visited).length;
      tailBytes[visited] = tail; colors[visited] = 2;
    }
  }
  // Match CFB.read's physical start order, without expanding any chain. Its
  // materializer follows a full tail even when an earlier start visited it.
  const directoryStart = buffer.readInt32LE(48); sector(directoryStart);
  const cfbVisited = new Uint8Array(sectorCount), materialized = new Set(); let traversalBytes = 0;
  const charge = id => {
    if (id < 0 || id >= sectorCount) throw corrupt('的流起点越界');
    traversalBytes += tailBytes[id]; materialized.add(id);
    if (traversalBytes > buffer.length * 8) throw failure('DOC_TOO_LARGE', '此 DOC 的内部扇区链重复展开量过大，请另存为 DOCX 后上传。');
  };
  for (let index = 0; index < sectorCount; index++) {
    let id = (index + directoryStart) % sectorCount;
    if (cfbVisited[id]) continue;
    charge(id);
    while (id >= 0 && !cfbVisited[id]) { cfbVisited[id] = 1; id = fat.readInt32LE(id * 4); }
  }
  const chain = (start, size = null, materialize = true) => {
    if (size === 0) return Buffer.alloc(0);
    const parts = []; const seen = new Set(); let id = start, bytes = 0;
    while (id >= 0) {
      if (seen.has(id) || seen.size >= sectorCount) throw corrupt('的扇区链存在循环');
      seen.add(id); const part = sector(id); bytes += part.length;
      if (materialize) parts.push(part);
      id = fat.readInt32LE(id * 4);
    }
    if (id !== -2 || (size !== null && bytes < size)) throw corrupt('的正文或附件流被截断');
    if (!materialize) return null;
    const joined = Buffer.concat(parts); return size === null ? joined : joined.subarray(0, size);
  };
  const directory = chain(buffer.readInt32LE(48));
  if (!directory.length || directory.length % 128 || directory.length / 128 > 100000) throw corrupt('的目录长度无效');
  const entries = [];
  for (let offset = 0; offset < directory.length; offset += 128) {
    const type = directory[offset + 66], nameBytes = directory.readUInt16LE(offset + 64);
    if (![0, 1, 2, 5].includes(type) || (type && (nameBytes < 2 || nameBytes > 64 || nameBytes % 2))) throw corrupt('的目录项无效');
    const size = Number(directory.readBigUInt64LE(offset + 120));
    if (type && (!Number.isSafeInteger(size) || size > buffer.length)) throw corrupt('的文件流长度无效');
    entries.push({ type, size, start: directory.readInt32LE(offset + 116), links: [68, 72, 76].map(delta => directory.readInt32LE(offset + delta)) });
  }
  if (entries[0]?.type !== 5) throw corrupt('缺少根目录');
  if (entries.reduce((sum, entry) => sum + (entry.type === 2 ? entry.size : 0), 0) > buffer.length * 3) throw corrupt('的重复文件流超出读取限额');
  const parents = new Uint8Array(entries.length);
  for (const entry of entries) if (entry.type) for (const link of entry.links) {
    if (link === -1) continue;
    if (link <= 0 || link >= entries.length || !entries[link].type || ++parents[link] > 1) throw corrupt('的目录指针无效或重复');
  }
  const visited = new Uint8Array(entries.length);
  for (let start = 0; start < entries.length; start++) {
    if (!entries[start].type || visited[start]) continue;
    const tasks = [[start, false]];
    while (tasks.length) {
      const [id, exiting] = tasks.pop();
      if (exiting) { visited[id] = 2; continue; }
      if (visited[id] === 1) throw corrupt('的目录存在循环');
      if (visited[id] === 2) continue;
      visited[id] = 1; tasks.push([id, true]);
      for (const link of entries[id].links) if (link >= 0) tasks.push([link, false]);
    }
  }
  const miniRoot = entries[0].size ? chain(entries[0].start, entries[0].size) : Buffer.alloc(0);
  const miniFat = miniFatCount ? chain(buffer.readInt32LE(60), miniFatCount * sectorSize) : Buffer.alloc(0);
  for (const entry of entries) {
    if (entry.type !== 2 || !entry.size) continue;
    if (entry.size >= 4096) {
      if (!materialized.has(entry.start)) charge(entry.start);
      chain(entry.start, entry.size, false); continue;
    }
    let id = entry.start, remaining = entry.size; const seen = new Set();
    while (remaining > 0) {
      if (id < 0 || id * 4 + 4 > miniFat.length || id * 64 + Math.min(remaining, 64) > miniRoot.length || seen.has(id)) throw corrupt('的小型文件流损坏或循环');
      seen.add(id); remaining -= 64; id = miniFat.readInt32LE(id * 4);
    }
    if (id !== -2) throw corrupt('的小型文件流未正常结束');
  }
}

function validateWord(word, table, maxCharacters) {
  if (word.length < 0x1aa || word.readUInt16LE(0) !== 0xa5ec) throw corrupt('的 Word 正文头无效');
  const nFib = word.readUInt16LE(2), flags = word.readUInt16LE(10);
  if (flags & 0x0100) throw failure('DOC_ENCRYPTED', '此 Word 文件已加密或混淆，请先在本机解密并另存后上传。');
  if (![0x00c1, 0x00d9, 0x0101, 0x010c, 0x0112].includes(nFib)) throw failure('DOC_VERSION_UNSUPPORTED', '此 DOC 的 Word 格式版本暂不能可靠读取，请另存为 DOCX 后上传。');
  if (word.readUInt16LE(0x20) !== 14 || word.readUInt16LE(0x3e) !== 22 || word.readUInt16LE(0x98) < 34) throw corrupt('的 Word 头布局不受支持');
  if (!table?.length) throw corrupt('缺少正文字符分配表');
  const start = word.readUInt32LE(0x1a2), length = word.readUInt32LE(0x1a6), end = start + length;
  if (!length || end > table.length) throw corrupt('的字符表指针越界');
  let position = start;
  while (position < end && table[position] === 1) {
    if (position + 3 > end) throw corrupt('的字符属性段被截断');
    position += 3 + table.readUInt16LE(position + 1);
  }
  if (position + 5 > end || table[position] !== 2) throw corrupt('缺少有效字符表');
  const pieceSize = table.readUInt32LE(position + 1); position += 5;
  const count = (pieceSize - 4) / 12;
  if (!Number.isInteger(count) || count <= 0 || position + pieceSize > end) throw corrupt('的字符表长度无效');
  if (table.readUInt32LE(position) !== 0) throw corrupt('的字符表起点无效');
  if (table.readUInt32LE(position + count * 4) > maxCharacters) throw failure('DOC_TOO_LARGE', '此 DOC 的解码文字量超出读取限额，请拆分或另存为 DOCX 后上传。');
  for (let index = 0; index < count; index++) {
    const from = table.readUInt32LE(position + index * 4), to = table.readUInt32LE(position + (index + 1) * 4);
    const encodedOffset = table.readUInt32LE(position + (count + 1) * 4 + index * 8 + 2);
    const compressed = !!(encodedOffset & 0x40000000);
    if (to <= from || encodedOffset & 0x80000000) throw corrupt('的字符位置顺序无效');
    const offset = compressed ? (encodedOffset & 0x3fffffff) / 2 : encodedOffset;
    if (!Number.isInteger(offset) || offset < 0x20 || offset + (to - from) * (compressed ? 1 : 2) > word.length) throw corrupt('的正文字符段越界');
  }
  const storyLength = [0x4c, 0x50, 0x54, 0x5c, 0x60, 0x64, 0x68].reduce((sum, offset) => sum + word.readUInt32LE(offset), 0);
  if (storyLength > maxCharacters) throw failure('DOC_TOO_LARGE', '此 DOC 的解码文字量超出读取限额，请拆分或另存为 DOCX 后上传。');
  if (storyLength > table.readUInt32LE(position + count * 4)) throw corrupt('的正文字符被截断');
  // The parser also follows these non-empty table structures. Bound their data
  // before it receives them; detailed unsupported formatting stays unverified.
  for (const offset of [0xf2, 0xfa, 0x102, 0x142, 0x14a, 0x152]) {
    const from = word.readUInt32LE(offset), size = word.readUInt32LE(offset + 4);
    if (size && from + size > table.length) throw corrupt('的附属文本或格式表越界');
    if ([0xfa, 0x102].includes(offset) && size) {
      const runs = (size - 4) / 8;
      if (!Number.isInteger(runs) || runs < 0) throw corrupt('的格式表长度无效');
      for (let index = 0; index < runs; index++) {
        const block = table.readUInt32LE(from + (runs + 1) * 4 + index * 4);
        if ((block + 1) * 512 > word.length) throw corrupt('的格式页指针越界');
      }
    }
  }
  return { nFib, flags };
}

function decodedName(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('gb18030').decode(buffer); }
}
function displayName(value, fallback) { return String(value || fallback).split(/[\\/]/).pop().replace(/[\x00-\x1f]/g, '').slice(0, 255) || fallback; }

function nativeMetadata(buffer, fallback, includePayload = false) {
  let position = 6;
  const zeroString = () => { const end = buffer.indexOf(0, position); if (end < position || end - position > 4096) throw new Error('invalid string'); const text = decodedName(buffer.subarray(position, end)); position = end + 1; return text; };
  if (buffer.length < 12 || buffer.readUInt32LE(0) + 4 > buffer.length || buffer.readUInt16LE(4) !== 2) throw new Error('invalid native record');
  let name = zeroString(); zeroString(); position += 4;
  if (position + 4 > buffer.length) throw new Error('truncated command');
  const commandLength = buffer.readUInt32LE(position); position += 4 + commandLength;
  if (commandLength > 16384 || position + 4 > buffer.length) throw new Error('invalid command');
  const bytes = buffer.readUInt32LE(position); position += 4;
  if (position + bytes > buffer.length) throw new Error('truncated payload');
  const payload = buffer.subarray(position, position + bytes); position += bytes;
  // Unicode extension: command2, label2, fileName2. Prefer the true Unicode label.
  const unicode = [];
  for (let i = 0; i < 3 && position + 4 <= buffer.length; i++) {
    const characters = buffer.readUInt32LE(position); position += 4;
    if (!characters || characters > 4096 || position + characters * 2 > buffer.length) break;
    unicode.push(buffer.subarray(position, position + characters * 2).toString('utf16le')); position += characters * 2;
  }
  if (unicode[1]) name = unicode[1];
  name = displayName(name, fallback);
  let format = name.includes('.') ? name.split('.').pop().toLowerCase() : 'unknown';
  if (payload.subarray(0, 5).toString('ascii') === '%PDF-') format = 'pdf';
  else if (payload.subarray(0, 4).toString('ascii') === 'Rar!') format = 'rar';
  return { name, format, bytes, parsed: false, ...(includePayload ? {payload: Buffer.from(payload)} : {}) };
}

export async function extractLegacyDoc(buffer, { maxBytes = MAX_BYTES, signal, includeAttachmentPayloads = false } = {}) {
  checkAbort(signal);
  if (!Buffer.isBuffer(buffer)) throw failure('DOC_INVALID_INPUT', '旧版 Word 读取需要文件二进制内容。');
  if (buffer.length > Math.min(Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : MAX_BYTES, MAX_BYTES)) throw failure('DOC_TOO_LARGE', '旧版 Word 文件过大，暂不能安全读取，请拆分后上传。');
  if (buffer.length < 512 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw failure('DOC_INVALID_FORMAT', '文件不是可识别的旧版二进制 Word DOC，请检查格式或另存为 DOCX。');
  let cfb;
  try { preflightCompound(buffer); cfb = CFB.read(buffer, { type: 'buffer' }); }
  catch (error) { if (['DOC_CORRUPT', 'DOC_TOO_LARGE'].includes(error.code)) throw error; throw corrupt(); }
  const root = cfb.FullPaths[0];
  const streams = cfb.FullPaths.map((path, index) => ({ path, ...cfb.FileIndex[index] })).filter(entry => entry.type === 2);
  const rootStream = name => streams.find(entry => entry.path.toLowerCase() === `${root}${name}`.toLowerCase());
  if (rootStream('EncryptedPackage') || rootStream('EncryptionInfo')) throw failure('DOC_ENCRYPTED', '此 Office 文件已加密，请先在本机解密并另存后上传。');
  const wordEntry = rootStream('WordDocument');
  if (!wordEntry) throw failure('DOC_NOT_WORD', '此复合文件没有 Word 正文，可能是 Excel 或其他 OLE 文件，请检查实际格式。');
  const word = Buffer.from(wordEntry.content || []);
  if (word.length < 12) throw corrupt('的 Word 正文头被截断');
  if (word.readUInt16LE(10) & 0x0100) throw failure('DOC_ENCRYPTED', '此 Word 文件已加密或混淆，请先在本机解密并另存后上传。');
  const tableStream = word.readUInt16LE(10) & 0x0200 ? '1Table' : '0Table';
  const table = Buffer.from(rootStream(tableStream)?.content || []);
  const { nFib } = validateWord(word, table, Math.min(16000000, buffer.length * 8));
  const cleanCompound = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cleanCompound, 'WordDocument', word);
  CFB.utils.cfb_add(cleanCompound, tableStream, table);
  let document;
  try { document = await new WordExtractor().extract(Buffer.from(CFB.write(cleanCompound, { type: 'buffer' }))); }
  catch { throw corrupt('的文本或格式无法可靠解码'); }
  checkAbort(signal);
  const values = {
    body: document.getBody({ filterUnicode: false }), headers: document.getHeaders({ includeFooters: false, filterUnicode: false }), footers: document.getFooters({ filterUnicode: false }),
    footnotes: document.getFootnotes({ filterUnicode: false }), endnotes: document.getEndnotes({ filterUnicode: false }), annotations: document.getAnnotations({ filterUnicode: false }),
    bodyTextboxes: document.getTextboxes({ includeHeadersAndFooters: false, filterUnicode: false }), headerTextboxes: document.getTextboxes({ includeBody: false, filterUnicode: false }),
  };
  const sections = Object.entries(values).map(([key, text]) => ({ key, section: SECTION_NAMES[key], text, page: null }));
  const blocks = sections.flatMap(({ key, section, text }) => text.replace(/\r\n?/g, '\n').replace(/\x07/g, '\t').split('\n').flatMap((line, index) => line.trim() ? [{ text: line, section, kind: line.includes('\t') ? 'table-text' : 'paragraph', page: null, lineStart: index + 1, lineEnd: index + 1, sourceSection: key }] : []));
  const warnings = [{ code: 'DOC_LAYOUT_UNVERIFIED', message: '已读取旧版 DOC 可识别文字；原始分页、合并表格及图片/图形尚未可靠恢复，请按原件复核。可另存为 DOCX/PDF 以改善完整性。' }];
  const attachments = [], objectGroups = new Map();
  for (const entry of streams) {
    const relative = entry.path.slice(root.length);
    const match = /^ObjectPool\/([^/]+)\//i.exec(relative);
    if (match) { if (!objectGroups.has(match[1])) objectGroups.set(match[1], []); objectGroups.get(match[1]).push(entry); }
  }
  for (const [group, entries] of objectGroups) {
    const native = entries.find(entry => entry.name === '\x01Ole10Native');
    const fallback = `内嵌对象 ${attachments.length + 1}`;
    try {
      const metadata = native ? nativeMetadata(Buffer.from(native.content || []), fallback, includeAttachmentPayloads) : { name: fallback, format: 'unknown', bytes: entries.reduce((sum, entry) => sum + entry.size, 0), parsed: false };
      attachments.push({ ...metadata, sourceStream: `ObjectPool/${group}${native ? '/Ole10Native' : ''}` });
    } catch {
      attachments.push({ name: fallback, format: 'unknown', bytes: native?.size || 0, parsed: false, sourceStream: `ObjectPool/${group}/Ole10Native` });
      warnings.push({ code: 'DOC_EMBEDDED_INVALID', message: `${fallback}的封装损坏，尚未解析，请从原件中单独取出后上传。` });
    }
  }
  if (attachments.length) warnings.push({ code: 'DOC_EMBEDDED_UNPARSED', message: `发现 ${attachments.length} 个内嵌附件，均未展开分析：${attachments.map(item => item.name).join('；')}。请将技术标准、图纸等附件单独上传后再作完整结论。` });
  const macroStreams = streams.filter(entry => /(?:^|\/)(?:Macros|VBA)(?:\/|$)/i.test(entry.path.slice(root.length)));
  if (macroStreams.length) warnings.push({ code: 'DOC_MACROS_SKIPPED', message: '文件包含宏/VBA 内容，仅读取文字，不运行宏。' });
  const imageStreams = streams.filter(entry => /^(?:Data|Pictures)(?:\/|$)|(?:^|\/)\x02OlePres/i.test(entry.path.slice(root.length)));
  return {
    format: 'doc', method: 'word-extractor', sections, blocks, attachments,
    macros: { present: macroStreams.length > 0, streamCount: macroStreams.length },
    images: { status: 'not-extracted', containerStreams: imageStreams.map(entry => ({ name: entry.name, bytes: entry.size })) },
    warnings, complete: false, metadata: { nFib, tableStream, sourceBytes: buffer.length },
  };
}
