import { readFile, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { extname, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import mammoth from 'mammoth';
import { load } from 'cheerio';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { extractSpreadsheet } from './spreadsheet.js';
import { extractLegacyDoc } from './legacy-doc.js';

const require = createRequire(import.meta.url);
const mammothRequire = createRequire(require.resolve('mammoth'));
const JSZip = mammothRequire('jszip');
const IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif']);
const MAX_EMBEDDED_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 28_000_000;
// These CJK supplement radicals, unlike Kangxi radicals, do not have NFKC mappings.
const SUPPLEMENT_RADICALS = { '⻄': '西', '⻅': '见', '⻈': '讠', '⻉': '贝', '⻋': '车', '⻓': '长', '⻔': '门', '⻘': '青', '⻚': '页', '⻛': '风', '⻜': '飞', '⻝': '食', '⻟': '饣', '⻢': '马', '⻤': '鬼', '⻥': '鱼', '⻦': '鸟', '⻨': '麦', '⻩': '黄', '⻬': '齐', '⻮': '齿', '⻰': '龙', '⻳': '龟' };

function abortIfRequested(signal) {
  if (signal?.aborted) throw new DOMException('分析已取消', 'AbortError');
}

async function awaitAbortable(operation, signal) {
  abortIfRequested(signal);
  if (!signal) return operation;
  let listener;
  const aborted = new Promise((_, reject) => {
    listener = () => reject(new DOMException('分析已取消', 'AbortError'));
    signal.addEventListener('abort', listener, { once: true });
  });
  try { return await Promise.race([operation, aborted]); }
  finally { signal.removeEventListener('abort', listener); }
}

function cleanText(text) {
  return String(text || '').replace(/\uFEFF/g, '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function recognitionText(text) {
  return cleanText(String(text || '').normalize('NFKC').replace(/[⻄⻅⻈⻉⻋⻓⻔⻘⻚⻛⻜⻝⻟⻢⻤⻥⻦⻨⻩⻬⻮⻰⻳]/g, character => SUPPLEMENT_RADICALS[character]))
    .replace(/(?<=[\u3400-\u9fff\d])[ \t\n]+(?=[\u3400-\u9fff\d，。；：！？、%])/gu, '');
}

function guessFormat(fileName, mimeType) {
  const extension = extname(fileName || '').slice(1).toLowerCase();
  if (extension) return extension;
  const types = { 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls', 'text/plain': 'txt', 'text/markdown': 'md', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  return types[mimeType] || 'unknown';
}

function isHeading(text) {
  const value = recognitionText(text);
  if (value.length > 75 || /[|。；;!?！？]/.test(value)) return false;
  if (/^#{1,6}\s+/.test(value) || /^第[一二三四五六七八九十百\d]+[章节部分]/.test(value)) return true;
  if (/^本项目涉及[^。；]{2,45}[：:]$/.test(value)) return true;
  // Numeric list entries containing obligations are clauses, not section headings.
  if (/(?:须(?!知)|必须|不得|应当|供应商应|提供|具备|提交|支付|收取|缴纳)/.test(value)) return false;
  return /^(?:[一二三四五六七八九十]+[、．.]|\d+(?:\.\d+){1,3}\.?\s*)[^，,：:]{2,40}$/.test(value);
}

function addBlock(context, text, { page = null, section = context.section, kind = 'paragraph', fileName = context.result.fileName, heading = false, tableRows, tableHeaders, tableId, continued, role, sheet, rowStart, rowEnd, cells } = {}) {
  text = cleanText(text);
  if (!text) return;
  context.blockCounter = (context.blockCounter || 0) + 1;
  const block = { id: `${context.result.id}:b${context.blockCounter}`, documentId: context.result.id, fileName, text, normalizedText: recognitionText(text), page, section: section || '正文', kind, heading };
  if (tableRows) block.tableRows = tableRows;
  if (tableHeaders) block.tableHeaders = tableHeaders;
  if (tableId) block.tableId = tableId;
  if (continued) block.continued = true;
  if (role) block.role = role;
  if (sheet !== undefined) Object.assign(block, { sheet, rowStart, rowEnd, cells });
  context.result.blocks.push(block);
  return block;
}

function warn(context, code, message, page, incomplete = false) {
  context.result.warnings.push({ code, message, ...(page ? { page } : {}) });
  if (incomplete) context.result.complete = false;
}

function progress(context, phase, fraction, message) {
  abortIfRequested(context.signal);
  context.onProgress?.({ phase, progress: Math.max(0, Math.min(1, fraction)), message });
}

function addTextParagraphs(context, text, source = 'text', page = null, defaultSection = '正文') {
  let section = defaultSection;
  let pending = [];
  const flush = () => { if (pending.length) addBlock(context, pending.join('\n'), { page, section, kind: source === 'ocr' ? 'ocr' : 'paragraph' }); pending = []; };
  for (const line of cleanText(text).split('\n')) {
    if (!line.trim()) { flush(); continue; }
    if (isHeading(line.trim())) { flush(); section = line.trim().replace(/^#+\s*/, ''); addBlock(context, line, { page, section, kind: source === 'ocr' ? 'ocr' : 'paragraph', heading: true }); continue; }
    pending.push(line);
    if (pending.join('\n').length > 1600 || /[。；;!?！？]$/.test(line)) flush();
  }
  flush();
}

async function prepareOCR(context) {
  if (context.worker) return context.worker;
  progress(context, 'ocr', 0.05, '正在加载随软件提供的离线中英文文字识别组件');
  context.ocrDirectory = await mkdtemp(join(tmpdir(), 'biaoxi-ocr-'));
  for (const language of ['chi_sim', 'eng']) {
    const languageRoot = dirname(require.resolve(`@tesseract.js-data/${language}`));
    await copyFile(join(languageRoot, '4.0.0', `${language}.traineddata.gz`), join(context.ocrDirectory, `${language}.traineddata.gz`));
  }
  abortIfRequested(context.signal);
  context.worker = await createWorker(['chi_sim', 'eng'], 1, {
    langPath: context.ocrDirectory,
    cachePath: context.ocrDirectory,
    cacheMethod: 'none',
    gzip: true,
    // Tesseract otherwise throws from its asynchronous message handler after rejection.
    errorHandler: () => {},
    logger: event => {
      if (event.status === 'recognizing text') context.onProgress?.({ phase: 'ocr', progress: event.progress, message: '正在离线识别扫描内容' });
    }
  });
  if (context.signal?.aborted) {
    await context.worker.terminate();
    context.worker = null;
    abortIfRequested(context.signal);
  }
  const abort = () => { context.worker?.terminate().catch(() => {}); };
  context.signal?.addEventListener('abort', abort, { once: true });
  context.removeAbort = () => context.signal?.removeEventListener('abort', abort);
  return context.worker;
}

function ocrFieldSignal(text, confidence) {
  const compact = text.normalize('NFKC').replace(/\s/g, '');
  const labels = ['统一社会信用代码', '注册资本', '法定代表人', '经营范围', '企业名称', '公司名称', '名称', '资质类别', '证书编号', '有效期', '合同编号', '合同金额', '姓名', '注册单位', '制造商', '规格型号', '产品名称'];
  const count = labels.filter(label => compact.includes(label)).length;
  const chinese = (compact.match(/[\u3400-\u9fff]/g) || []).length;
  return count * 4 + chinese / Math.max(1, compact.length) * 20 + confidence / 10;
}

export function isCertificateOCR(fileName, text) {
  const compact = `${fileName || ''}\n${text || ''}`.normalize('NFKC').replace(/\s/g, '');
  return /营业执照|资质|证照|证书|许可证|认证|合同|验收|注册资本|法定代表人|统一社会|制造商|证书编号/.test(compact);
}

function ocrCriticalTokens(text) {
  const tokens = new Set();
  // Protect usable field anchors, not arbitrary page digits or watermark text.
  // Preserve line boundaries and leave both OCR transcripts untouched.
  const compact = String(text || '').normalize('NFKC').replace(/[ \t\u3000]/g, '');
  const dateField = /(?:有效期(?:自|至|起始|截止)?|使用期|注册期|签发日期|发证日期|初次领证日期|签订日期|成立日期|出生日期|出生年月)[：:至到自\d年月日/.,()（）~～—–-]*$/;
  for (const match of compact.matchAll(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?(?!\d)/g)) {
    const [, year, month, day] = match;
    const before = compact.slice(0, match.index), lineStart = before.lastIndexOf('\n') + 1, prefix = before.slice(lineStart);
    const context = /^[|｜:：()（）—–-]*$/.test(prefix) ? before.slice(0, lineStart).trimEnd().split('\n').at(-1) || '' : prefix;
    if (!dateField.test(context)) continue;
    const value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(value)) continue;
    tokens.add(`date:${value}`);
  }
  const currency = '人民币|CNY|RMB|CN¥|¥|美元|USD|US\\$|欧元|EUR|€|港币|HKD|HK\\$|英镑|GBP|£|日元|JPY|\\$|元';
  const money = new RegExp(`(?:合同金额|合同价款|价税合计)(?:\\((?:含税|不含税)\\))?(?:\\((?<headerUnit>元|万元|亿元)\\))?(?:\\((?:含税|不含税)\\))?[：:]?(?<prefix>${currency})?(?<amount>(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)(?<unit>亿|万)?(?<suffix>${currency})?`, 'gi');
  const currencyCode = value => /^(?:美元|USD|US\$|\$)$/i.test(value) ? 'USD' : /^(?:欧元|EUR|€)$/i.test(value) ? 'EUR' : /^(?:港币|HKD|HK\$)$/i.test(value) ? 'HKD' : /^(?:英镑|GBP|£)$/i.test(value) ? 'GBP' : /^(?:日元|JPY)$/i.test(value) ? 'JPY' : 'CNY';
  for (const match of compact.matchAll(money)) {
    const fields = match.groups, unit = fields.unit || fields.headerUnit?.replace(/元$/, '');
    const [integer, fraction = ''] = fields.amount.replace(/,/g, '').split('.');
    const point = integer.length + (unit === '亿' ? 8 : unit === '万' ? 4 : 0);
    const digits = (integer + fraction).padEnd(point, '0'), whole = digits.slice(0, point).replace(/^0+(?=\d)/, ''), decimal = digits.slice(point).replace(/0+$/, '');
    tokens.add(`amount:${currencyCode(fields.prefix || fields.suffix || 'CNY')}:${whole}${decimal ? '.' + decimal : ''}`);
  }
  const knownPatterns = [/D(?:\d{3}T\d{5}|\d{6,12})(?!\d)/gi];
  if (/建造师|注册证书/.test(compact)) knownPatterns.push(/[\p{Script=Han}][12]\d{12,17}(?!\d)/gu);
  if (/安全生产考核|建安|交安|水安/.test(compact)) knownPatterns.push(
    /[\p{Script=Han}]交安[ABC][123]?(?:\(\d{2}\)|\d{2})G\d{5}(?!\d)/gu,
    /[\p{Script=Han}](?:建安|交安|水安)[ABC][123]?\(\d{4}\)\d{4,10}(?!\d)/gu,
    /[\p{Script=Han}]水安[ABC]\d{11}(?!\d)/gu);
  const known = value => knownPatterns.flatMap(pattern => [...value.matchAll(pattern)].map(match => match[0]));
  for (const value of known(compact)) tokens.add(`number:${value.toUpperCase()}`);
  const codingLabel = /职业培训合格证|岗位培训考核合格证/.test(compact) ? '|编码' : '';
  const numberLabels = new RegExp(`(证书编号|证书号码|证书编码|注册编号|注册证号|报告编号|合同编号|统一社会信用代码|身份证号码|身份证号|公民身份号码${codingLabel})[：:]?\\s*([^\\n；;，,]+)`, 'g');
  for (const match of compact.matchAll(numberLabels)) {
    // Reports, contracts and identity identifiers can have meaningful suffixes.
    const title = [...compact.slice(0, match.index).matchAll(/建造师(?:注册)?证书|安全生产考核合格证书|检验报告|检测报告/g)].at(-1)?.[0] || '';
    const credential = /^(?:证书|注册)/.test(match[1]) && /建造师|安全生产考核/.test(title);
    const value = (credential && known(match[2])[0]) || match[2].match(/^[\p{Script=Han}]{0,3}[A-Za-z0-9][A-Za-z0-9()./-]*/u)?.[0];
    if (value && value.length >= 6 && (value.match(/\d/g) || []).length >= 4) tokens.add(`number:${value.toUpperCase()}`);
  }
  return tokens;
}

export function chooseOCRAttempt(original, enhanced) {
  const retained = ocrCriticalTokens(enhanced.text);
  // Extra printed labels do not compensate for losing a legible number/date.
  // A conflicting or damaged alternative remains available as an unselected pass.
  if ([...ocrCriticalTokens(original.text)].some(token => !retained.has(token))) return original;
  return ocrFieldSignal(enhanced.text, enhanced.confidence) > ocrFieldSignal(original.text, original.confidence) ? enhanced : original;
}

function highContrastOCR(image) {
  const scale = Math.min(2.5, 2600 / Math.max(image.width, image.height));
  const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const drawing = canvas.getContext('2d');
  drawing.fillStyle = 'white'; drawing.fillRect(0, 0, canvas.width, canvas.height);
  drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height);
  // Faint certificate watermarks otherwise become competing OCR characters.
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = (pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2]) / 3 < 125 ? 0 : 255;
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
  }
  drawing.putImageData(pixels, 0, 0);
  return canvas.toBuffer('image/png');
}

async function recognizeImage(context, input, { page = null, section = '扫描内容', fileName = context.result.fileName, includePage = true } = {}) {
  abortIfRequested(context.signal);
  try {
    let image = await loadImage(input);
    if (image.width * image.height > MAX_IMAGE_PIXELS) {
      const ratio = Math.sqrt(MAX_IMAGE_PIXELS / (image.width * image.height));
      const scaled = createCanvas(Math.round(image.width * ratio), Math.round(image.height * ratio));
      scaled.getContext('2d').drawImage(image, 0, 0, scaled.width, scaled.height);
      input = scaled.toBuffer('image/png');
      warn(context, 'IMAGE_DOWNSAMPLED', `${section}尺寸较大，已缩放识别，细小文字需要核验。`, page);
    } else if (image.width < 1800 && image.height < 1800) {
      const scale = Math.min(2.5, 1800 / Math.max(image.width, image.height));
      const scaled = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
      const drawing = scaled.getContext('2d');
      drawing.fillStyle = 'white';
      drawing.fillRect(0, 0, scaled.width, scaled.height);
      drawing.drawImage(image, 0, 0, scaled.width, scaled.height);
      input = scaled.toBuffer('image/png');
    }
    const worker = await prepareOCR(context);
    let recognized = await awaitAbortable(worker.recognize(input), context.signal);
    const attempts = [{ mode: 'original', text: recognized.data.text || '', confidence: Number(recognized.data.confidence || 0), selected: true }];
    const certificate = isCertificateOCR(fileName, attempts[0].text);
    if (certificate && attempts[0].confidence < 90) {
      progress(context, 'ocr', 0.1, '正在对比证照去水印识别结果');
      try {
        await worker.setParameters({ tessedit_pageseg_mode: '11' });
        const enhanced = await awaitAbortable(worker.recognize(highContrastOCR(image)), context.signal);
        const attempt = { mode: 'high-contrast-sparse', text: enhanced.data.text || '', confidence: Number(enhanced.data.confidence || 0), selected: false };
        attempts.push(attempt);
        if (chooseOCRAttempt(attempts[0], attempt) === attempt) {
          attempts[0].selected = false; attempt.selected = true; recognized = enhanced;
        }
      } catch (error) {
        abortIfRequested(context.signal);
        warn(context, 'OCR_ENHANCEMENT_FAILED', `${section}补充识别未完成，保留首轮结果并需核对原件。`, page);
      } finally { if (!context.signal?.aborted) await worker.setParameters({ tessedit_pageseg_mode: '3' }); }
    }
    image = null;
    abortIfRequested(context.signal);
    // Tesseract separates Chinese characters with ASCII spaces; restore words for rules.
    let text = cleanText(recognized.data.text).replace(/(?<=[\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/gu, '').replace(/(?<=[\u3400-\u9fff])[ \t]+(?=[，。；：！？、])/gu, '');
    if (attempts.some(attempt => attempt.selected && attempt.mode === 'high-contrast-sparse')) text = text.replace(/\n{2,}/g, '\n');
    context.result.ocrPasses ||= [];
    context.result.ocrPasses.push(...attempts.map(attempt => ({ ...attempt, page, section, fileName })));
    const confidence = Number(recognized.data.confidence || 0);
    warn(context, 'OCR_REVIEW_REQUIRED', `${section}使用离线 OCR，置信度 ${Math.round(confidence)}%；金额、日期、否定词及表格对应关系需核对原件。`, page, Boolean(text) && confidence < 65);
    if (includePage) context.result.pages.push({ number: page || 1, text, source: 'ocr' });
    if (!text) { warn(context, 'OCR_NO_TEXT', `${section}未识别出可用文字；可能为空白、装饰图或识别失败，请查看原件。`, page, true); return ''; }
    addTextParagraphs(context, text, 'ocr', page, section);
    // Ensure embedded-image references use their parent document and actual source file.
    for (const block of context.result.blocks) if (block.section === section && block.kind === 'ocr') block.fileName = fileName;
    return text;
  } catch (error) {
    abortIfRequested(context.signal);
    warn(context, 'OCR_FAILED', `${section}离线文字识别失败：${error?.message || String(error)}。请核对原件或上传可复制文本版本。`, page, true);
    if (includePage) context.result.pages.push({ number: page || 1, text: '', source: 'ocr' });
    return '';
  }
}

async function extractText(context, buffer) {
  let text;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) text = new TextDecoder('utf-16le', { fatal: true }).decode(buffer);
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) text = new TextDecoder('utf-16be', { fatal: true }).decode(buffer);
  else {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { text = new TextDecoder('gb18030', { fatal: true }).decode(buffer); warn(context, 'LEGACY_TEXT_ENCODING', '文本使用 GB18030 解码，请核验特殊字符。'); }
  }
  addTextParagraphs(context, text);
  context.result.pages.push({ number: 1, text: cleanText(text), source: 'text' });
}

function docxXmlParagraphs(context, xml, section) {
  const $ = load(xml, { xmlMode: true });
  $('w\\:p').each((_, element) => {
    const paragraph = $(element);
    const parts = paragraph.find('w\\:t, w\\:tab, w\\:br').toArray().map(part => part.name === 'w:t' ? $(part).text() : part.name === 'w:tab' ? ' | ' : '\n');
    addBlock(context, parts.join(''), { section, kind: paragraph.parents('w\\:tbl').length ? 'table' : 'paragraph' });
  });
}

async function extractEmbedded(context, fileName, buffer, section, depth) {
  if (buffer.length > MAX_EMBEDDED_BYTES || depth >= 2) { warn(context, 'EMBEDDED_LIMIT', `${section}超出内嵌附件读取范围，请另行上传 ${fileName}。`, null, true); return; }
  let format = guessFormat(fileName);
  if (buffer.subarray(0, 5).toString() === '%PDF-') format = 'pdf';
  else if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const archive = await JSZip.loadAsync(buffer);
    if (archive.file('word/document.xml')) format = 'docx';
  }
  if (!['pdf', 'doc', 'docx', 'xlsx', 'xls', 'txt', 'md', ...IMAGE_FORMATS].includes(format)) { warn(context, 'EMBEDDED_UNSUPPORTED', `${section}包含内嵌文件 ${fileName}（${format}），请另行上传可读取格式。`, null, true); return; }
  const nested = { ...context, result: { ...context.result, fileName, format, pages: [], blocks: [], warnings: [], ocrPasses: [], complete: true }, section, worker: null, ocrDirectory: null, removeAbort: null };
  try {
    await extractBuffer(nested, buffer, depth + 1);
    for (const block of nested.result.blocks) addBlock(context, block.text, { ...block, section: `${section} / ${block.section}`, fileName: `${context.result.fileName} / ${fileName}` });
    if (nested.result.ocrPasses?.length) (context.result.ocrPasses ||= []).push(...nested.result.ocrPasses.map(attempt => ({ ...attempt, section: `${section} / ${attempt.section}`, fileName: `${context.result.fileName} / ${fileName}` })));
    if (nested.result.sheets?.length) {
      context.result.sheets ||= [];
      context.result.sheets.push(...nested.result.sheets.map(sheet => ({ ...sheet, containerFileName: context.result.fileName })));
    }
    for (const warning of nested.result.warnings) warn(context, warning.code, `${section}：${warning.message}`, warning.page, !nested.result.complete);
    if (!nested.result.complete) context.result.complete = false;
  } finally { await closeOCR(nested); }
}

async function extractWord(context, buffer, depth) {
  const declared = context.result.format;
  const compound = buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
  if (compound || (declared === 'doc' && !(buffer[0] === 0x50 && buffer[1] === 0x4b))) {
    progress(context, 'doc', 0.1, '正在读取旧版 Word 正文和附属内容');
    // Validate the actual compound/Word streams before accepting a mislabeled
    // DOCX. XLS containers and encrypted Office files must not become text.
    const legacy = await extractLegacyDoc(buffer, { signal: context.signal });
    context.result.format = 'doc';
    context.result.legacyWord = { method: legacy.method, metadata: legacy.metadata, sections: legacy.sections, attachments: legacy.attachments, macros: legacy.macros, images: legacy.images };
    let section = '正文';
    for (const source of legacy.blocks) {
      abortIfRequested(context.signal);
      const text = source.text.replace(/\t/g, ' | ');
      const heading = source.kind !== 'table-text' && isHeading(text);
      if (heading) section = text;
      const block = addBlock(context, text, { page: null, section: source.section === '正文' ? section : source.section, kind: source.kind, heading });
      if (block) Object.assign(block, { lineStart: source.lineStart, lineEnd: source.lineEnd });
    }
    for (const warning of legacy.warnings) warn(context, warning.code, warning.message, null, !legacy.complete);
    if (!legacy.complete) context.result.complete = false;
  } else {
    if (declared === 'doc') {
      const archive = await JSZip.loadAsync(buffer);
      if (!archive.file('word/document.xml')) throw new Error('文件是压缩容器，但不包含 Word 正文；请核对原件格式');
    }
    await extractDocx(context, buffer, depth);
    context.result.format = 'docx';
  }
  if (declared !== context.result.format) {
    context.result.declaredFormat = declared;
    warn(context, 'WORD_FORMAT_MISMATCH', `文件后缀为 ${declared.toUpperCase()}，实际为 ${context.result.format === 'doc' ? '旧版 Word（DOC）' : 'DOCX'}，已按实际格式读取。修改后缀不等于格式转换；原件未改动。`);
  }
}

async function extractDocx(context, buffer, depth) {
  const zip = await JSZip.loadAsync(buffer);
  const zipFiles = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  const unpackedSizes = zipFiles.map(name => Number(zip.files[name]._data?.uncompressedSize || 0));
  if (unpackedSizes.some(size => size > 100 * 1024 * 1024) || unpackedSizes.reduce((total, size) => total + size, 0) > 300 * 1024 * 1024) throw new Error('Word 解压内容过大，无法安全读取');
  const media = [];
  const conversion = await mammoth.convertToHtml({ buffer }, {
    externalFileAccess: false,
    convertImage: mammoth.images.imgElement(async image => {
      const data = await image.read();
      const index = media.push({ buffer: Buffer.from(data), contentType: image.contentType, section: '正文插图' }) - 1;
      return { src: `biaoxi-image-${index}` };
    })
  });
  for (const message of conversion.messages || []) warn(context, 'DOCX_CONVERSION_WARNING', message.message, null, message.type === 'error');
  const $ = load(conversion.value);
  let section = '正文';
  let tableNumber = 0;
  $('body').children().each((_, element) => {
    const node = $(element);
    if (/^h[1-6]$/.test(element.name)) section = cleanText(node.text());
    if (element.name === 'table') {
      tableNumber += 1;
      const tableRows = node.find('tr').toArray().map(row => {
        const cells = $(row).children('th,td').toArray().map(cell => cleanText($(cell).text()));
        return { cells, text: cleanText(cells.join(' | ')), page: null };
      });
      addBlock(context, tableRows.map(row => row.text).join('\n'), { section: `${section} / 表格 ${tableNumber}`, kind: 'table', tableRows, tableHeaders: isTableHeader(tableRows[0]?.cells || []) ? tableRows[0].cells : [], tableId: newTableId(context) });
    } else if (['ol', 'ul'].includes(element.name)) {
      node.children('li').each((index, item) => addBlock(context, `${index + 1}. ${$(item).text()}`, { section }));
    } else addBlock(context, node.text(), { section, heading: /^h[1-6]$/.test(element.name) });
    node.find('img').each((__, image) => {
      const index = Number(($(image).attr('src') || '').replace('biaoxi-image-', ''));
      if (media[index]) media[index].section = `${section} / 插图 ${index + 1}`;
    });
  });
  for (const file of zipFiles.filter(name => /^word\/(?:header\d+|footer\d+|comments|endnotes|footnotes)\.xml$/.test(name))) {
    const label = /header/.test(file) ? '页眉' : /footer/.test(file) ? '页脚' : /comments/.test(file) ? '批注' : /endnotes/.test(file) ? '尾注' : '脚注';
    docxXmlParagraphs(context, await zip.file(file).async('string'), `${label} / ${file.split('/').pop()}`);
  }
  const hashes = new Set(media.map(item => createHash('sha256').update(item.buffer).digest('hex')));
  for (const file of zipFiles.filter(name => /^word\/media\//.test(name))) {
    const image = await zip.file(file).async('nodebuffer');
    const hash = createHash('sha256').update(image).digest('hex');
    if (!hashes.has(hash)) { hashes.add(hash); media.push({ buffer: image, contentType: file.split('.').pop(), section: `附属插图 / ${file.split('/').pop()}` }); }
  }
  for (let index = 0; index < media.length; index++) {
    progress(context, 'docx-images', 0.5 + index / Math.max(1, media.length) * 0.35, `正在读取 Word 插图 ${index + 1}/${media.length}`);
    await recognizeImage(context, media[index].buffer, { section: media[index].section, includePage: false });
  }
  // Text boxes or unsupported drawing text must not disappear behind a successful status.
  const bodyXml = await zip.file('word/document.xml')?.async('string');
  if (bodyXml) {
    const xml = load(bodyXml, { xmlMode: true });
    const extracted = context.result.blocks.map(block => block.text.replace(/\s/g, '')).join('');
    xml('w\\:txbxContent').each((_, node) => {
      const text = xml(node).find('w\\:t').toArray().map(part => xml(part).text()).join('');
      if (text && !extracted.includes(text.replace(/\s/g, ''))) addBlock(context, text, { section: '正文 / 文本框' });
    });
    if (xml('w\\:altChunk').length) warn(context, 'DOCX_ALTCHUNK_UNSUPPORTED', 'Word 包含外接或嵌入的 HTML/RTF 内容段，当前不能可靠读取。请将该内容转为正文或单独上传。', null, true);
  }
  for (const file of zipFiles.filter(name => /^word\/embeddings\//.test(name))) {
    await extractEmbedded(context, file.split('/').pop(), await zip.file(file).async('nodebuffer'), `内嵌附件 / ${file.split('/').pop()}`, depth);
  }
  for (const file of zipFiles.filter(name => /^word\/diagrams\/.*\.xml$/.test(name))) {
    const xml = load(await zip.file(file).async('string'), { xmlMode: true });
    const text = xml('a\\:t').toArray().map(part => xml(part).text()).join('\n');
    if (text) addBlock(context, text, { section: `图形文字 / ${file.split('/').pop()}` });
  }
  for (const file of zipFiles.filter(name => /^word\/charts\/[^/]+\.xml$/.test(name))) {
    const xml = load(await zip.file(file).async('string'), { xmlMode: true });
    const text = xml('a\\:t, c\\:v').toArray().map(part => xml(part).text()).join('\n');
    if (text) addBlock(context, text, { section: `图表文字 / ${file.split('/').pop()}` });
    warn(context, 'DOCX_CHART_REVIEW', '图表文字与数值已补充提取，系列、坐标和数值对应关系需核对原件。');
  }
  warn(context, 'DOCX_SECTION_REFERENCES', 'Word 不包含可靠的排版页码，出处按章节、表格和附注定位；请在原件中复核页面。');
  context.result.pages.push({ number: 1, text: context.result.blocks.map(block => block.text).join('\n\n'), source: media.length ? 'mixed' : 'text' });
}

function pdfTextItems(items) {
  const unique = [];
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const current = { ...item, y: item.transform[5], x: item.transform[4], fontHeight: Math.abs(item.height || item.transform[3] || 10) };
    // PDF synthetic bold often repeats the same glyphs at a sub-point displacement.
    if (!unique.some(other => other.str === current.str && Math.abs(other.x - current.x) < 0.8 && Math.abs(other.y - current.y) < 0.4 && Math.abs(other.width - current.width) < 1)) unique.push(current);
  }
  return unique.sort((a, b) => b.y - a.y || a.x - b.x);
}

function pdfLines(items) {
  const rows = [];
  const textItems = items.length && 'x' in items[0] ? items : pdfTextItems(items);
  for (const item of textItems) {
    let row = rows.find(line => Math.abs(line.y - item.y) < Math.max(2, Math.min(line.height, item.fontHeight) * 0.35));
    if (!row) { row = { y: item.y, height: item.fontHeight, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    row.items.sort((a, b) => a.x - b.x);
    let text = '';
    let previous;
    let table = false;
    for (const item of row.items) {
      if (previous) {
        const gap = item.x - (previous.x + previous.width);
        if (gap > Math.max(15, row.height * 1.7)) { text += ' | '; table = true; }
        else if (gap > row.height * 0.12 && !/[\u3400-\u9fff]$/.test(previous.str) && !/^[\u3400-\u9fff]/.test(item.str)) text += ' ';
      }
      text += item.str;
      previous = item;
    }
    return { ...row, text: cleanText(text), table };
  });
}

function newTableId(context) {
  context.tableCounter = (context.tableCounter || 0) + 1;
  const file = createHash('sha256').update(context.result.fileName).digest('hex').slice(0, 8);
  return `${context.result.id}:${file}:table${context.tableCounter}`;
}

function isTableHeader(cells) {
  // A score/sequence/value cell identifies a data row even when neighboring
  // cells mention words such as materials, objective or standards.
  if (cells.some(cell => /^\d+(?:\.\d+)?\.?$/.test(recognitionText(cell)) || cell.includes('★'))) return false;
  return cells.filter(cell => {
    const text = recognitionText(cell);
    return text.length < 55 && /评审因素|分类|评审内容|标准|分值|主客观|客观|材料|序号|名称|事项|说明|参数性质|完整要求|具体要求|要求名称/.test(text) && !/必须|须提供|不收取|不缴纳|不得分/.test(text);
  }).length >= 2;
}

function joinedPdfLines(lines) {
  let text = '';
  for (const line of lines) {
    const value = typeof line === 'string' ? line : line.text;
    if (text) text += /[\u2e80-\u9fff，、（：\d%]$/.test(text) && /^[\u2e80-\u9fff\d，。；：！？]/.test(value) ? '' : ' ';
    text += value;
  }
  return cleanText(text);
}

function pdfRuleSegments(operatorList, pdfjs) {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const segments = [];
  const point = (x, y) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
  const edge = (a, b) => {
    if (Math.abs(a[1] - b[1]) < 0.8 && Math.abs(a[0] - b[0]) > 10) segments.push({ axis: 'h', x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]), y1: (a[1] + b[1]) / 2, y2: (a[1] + b[1]) / 2 });
    if (Math.abs(a[0] - b[0]) < 0.8 && Math.abs(a[1] - b[1]) > 8) segments.push({ axis: 'v', x1: (a[0] + b[0]) / 2, x2: (a[0] + b[0]) / 2, y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]) });
  };
  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const operation = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];
    if (operation === pdfjs.OPS.save) stack.push([...matrix]);
    else if (operation === pdfjs.OPS.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (operation === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
    else if (operation === pdfjs.OPS.constructPath) {
      const [paint, paths, bounds] = args;
      const strokes = [pdfjs.OPS.stroke, pdfjs.OPS.closeStroke, pdfjs.OPS.fillStroke, pdfjs.OPS.eoFillStroke, pdfjs.OPS.closeFillStroke, pdfjs.OPS.closeEOFillStroke].includes(paint);
      if (!strokes && bounds && [pdfjs.OPS.fill, pdfjs.OPS.eoFill].includes(paint)) {
        const a = point(bounds[0], bounds[1]); const b = point(bounds[2], bounds[3]);
        if (Math.abs(a[1] - b[1]) < 2) edge([a[0], (a[1] + b[1]) / 2], [b[0], (a[1] + b[1]) / 2]);
        else if (Math.abs(a[0] - b[0]) < 2) edge([(a[0] + b[0]) / 2, a[1]], [(a[0] + b[0]) / 2, b[1]]);
      }
      if (!strokes) continue;
      for (const path of paths || []) {
        let previous; let start;
        for (let offset = 0; offset < path.length;) {
          const command = path[offset++];
          if (command === 0 || command === 1) {
            const next = point(path[offset++], path[offset++]);
            if (command === 0) start = next;
            else if (previous) edge(previous, next);
            previous = next;
          } else if (command === 4) { if (previous && start) edge(previous, start); previous = start; }
          else if (command === 2) { offset += 6; previous = undefined; }
          else if (command === 3) { offset += 4; previous = undefined; }
          else break;
        }
      }
    }
  }
  return segments.filter((segment, index) => !segments.slice(0, index).some(other => segment.axis === other.axis && Math.abs(segment.x1 - other.x1) < 0.9 && Math.abs(segment.x2 - other.x2) < 0.9 && Math.abs(segment.y1 - other.y1) < 0.9 && Math.abs(segment.y2 - other.y2) < 0.9));
}

function nearbyCoordinates(values) {
  const groups = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = groups.at(-1);
    if (last && Math.abs(last.at(-1) - value) < 1.3) last.push(value);
    else groups.push([value]);
  }
  return groups.map(group => group.reduce((sum, value) => sum + value, 0) / group.length);
}

function pdfTableRegions(items, operatorList, pdfjs, page) {
  const segments = pdfRuleSegments(operatorList, pdfjs);
  const parents = segments.map((_, index) => index);
  const root = index => { while (parents[index] !== index) index = parents[index]; return index; };
  for (let a = 0; a < segments.length; a++) {
    for (let b = a + 1; b < segments.length; b++) {
      const one = segments[a]; const two = segments[b];
      if (one.x1 <= two.x2 + 1.5 && two.x1 <= one.x2 + 1.5 && one.y1 <= two.y2 + 1.5 && two.y1 <= one.y2 + 1.5) parents[root(b)] = root(a);
    }
  }
  const groups = new Map();
  for (let index = 0; index < segments.length; index++) {
    const key = root(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(segments[index]);
  }
  const regions = [];
  for (const edges of groups.values()) {
    const horizontal = edges.filter(edge => edge.axis === 'h'); const vertical = edges.filter(edge => edge.axis === 'v');
    if (horizontal.length < 2 || vertical.length < 2) continue;
    const left = Math.min(...edges.map(edge => edge.x1)); const right = Math.max(...edges.map(edge => edge.x2));
    const top = Math.max(...edges.map(edge => edge.y2)); const bottom = Math.min(...edges.map(edge => edge.y1));
    if (right - left < 35 || top - bottom < 12) continue;
    regions.push({ horizontal, vertical, left, right, top, bottom, area: (right - left) * (top - bottom) });
  }
  const owner = item => regions.filter(region => item.x >= region.left - 1.5 && item.x < region.right && item.y + item.fontHeight * 0.35 >= region.bottom - 1 && item.y + item.fontHeight * 0.35 < region.top + 1).sort((one, two) => one.area - two.area)[0];
  const tables = [];
  for (const region of regions) {
    const { horizontal, vertical, left, right, top, bottom } = region;
    // A Word-exported PDF may draw a separate grid inside an outer table cell.
    // Its characters belong to the innermost grid, rather than both parent and child.
    const contained = items.filter(item => owner(item) === region);
    if (!contained.length) continue;
    const boundaries = nearbyCoordinates(horizontal.map(edge => edge.y1)).sort((a, b) => b - a);
    const tableRows = [];
    const cellCache = new Map();
    const assignedItems = new Set();
    for (let row = 0; row < boundaries.length - 1; row++) {
      const high = boundaries[row]; const low = boundaries[row + 1]; const middle = (high + low) / 2;
      const columns = nearbyCoordinates(vertical.filter(edge => edge.y1 <= middle + 1 && edge.y2 >= middle - 1).map(edge => edge.x1));
      if (columns.length < 2) continue;
      const spans = [];
      const cells = columns.slice(0, -1).map((x, column) => {
        const right = columns[column + 1];
        const middleX = (x + right) / 2;
        const cuts = nearbyCoordinates(horizontal.filter(edge => edge.x1 <= middleX + 1 && edge.x2 >= middleX - 1).map(edge => edge.y1));
        const cellHigh = Math.min(...cuts.filter(y => y > middle + 0.5), top);
        const cellLow = Math.max(...cuts.filter(y => y < middle - 0.5), bottom);
        const key = [x, right, cellHigh, cellLow].map(value => value.toFixed(2)).join(':');
        let cell = cellCache.get(key);
        if (!cell) {
          const selected = contained.filter(item => {
          const position = item.x + Math.min(item.width / 2, item.fontHeight / 2);
            const verticalPosition = item.y + item.fontHeight * 0.35;
            return position >= x - 1 && position < right - 1 && verticalPosition <= cellHigh + 0.5 && verticalPosition > cellLow + 0.5;
          });
          cell = { text: joinedPdfLines(pdfLines(selected)), firstRow: row, rowSpan: boundaries.filter((y, index) => index < boundaries.length - 1 && y <= cellHigh + 1 && boundaries[index + 1] >= cellLow - 1).length };
          selected.forEach(item => assignedItems.add(item));
          cellCache.set(key, cell);
        }
        if (cell.rowSpan > 1 && cell.text) spans.push({ column, text: cell.text, rowSpan: cell.rowSpan });
        // Keep the merged-cell text once, at the top of its actual bordered region.
        // Other rows refer to it via metadata rather than fabricated raw quotes.
        return cell.firstRow === row ? cell.text : '';
      });
      if (cells.some(Boolean)) tableRows.push({ cells, text: cleanText(cells.join(' | ')), page, ...(spans.length ? { cellSpans: spans } : {}) });
    }
    // A merged classification can start above the first full-width row on a
    // continuation page. Associate its single raw value with the first row
    // actually sharing that cell, rather than emitting a phantom requirement.
    for (let index = 0; index < tableRows.length; index++) {
      const row = tableRows[index];
      if (row.cells.filter(Boolean).length !== 1 || !row.cellSpans?.length) continue;
      const span = row.cellSpans.find(span => row.cells[span.column] === span.text);
      if (!span) continue;
      const target = tableRows.slice(index + 1).find(candidate => candidate.cells.length > row.cells.length && !candidate.cells[span.column] && candidate.cellSpans?.some(other => other.column === span.column && other.text === span.text));
      if (target) {
        target.cells[span.column] = span.text;
        target.text = cleanText(target.cells.join(' | '));
        row.cells[span.column] = '';
      }
    }
    const nonemptyRows = tableRows.filter(row => row.cells.some(Boolean));
    if (nonemptyRows.length) tables.push({ left, right, top, bottom, items: [...assignedItems], tableRows: nonemptyRows });
  }
  return tables.sort((a, b) => b.top - a.top);
}

function addPdfPageBlocks(context, items, operatorList, pdfjs, number, pageHeight) {
  const textItems = pdfTextItems(items);
  const overlapping = textItems.some((item, index) => textItems.slice(index + 1).some(other => {
    if (Math.abs(other.y - item.y) > Math.min(item.fontHeight, other.fontHeight) * 0.25 || item.str.trim().length < 3 || other.str.trim().length < 3) return false;
    const intersection = Math.min(item.x + item.width, other.x + other.width) - Math.max(item.x, other.x);
    return intersection > Math.min(item.width, other.width) * 0.6;
  }));
  if (overlapping) warn(context, 'PDF_OVERLAPPING_TEXT', `第 ${number} 页存在重叠文字或交叠表格；已保留可读取文字，但条款、行列与数值对应关系不能可靠恢复，请核验原件。`, number, true);
  const tables = pdfTableRegions(textItems, operatorList, pdfjs, number);
  const tableItems = new Set(tables.flatMap(table => table.items));
  const outside = pdfLines(textItems.filter(item => !tableItems.has(item)));
  const events = [...outside.map(line => ({ top: line.y, line })), ...tables.map(table => ({ top: table.top, table }))].sort((a, b) => b.top - a.top);
  const contentsPage = outside.some(line => /^(?:目\s*录|目次|CONTENTS)$/i.test(recognitionText(line.text)));
  const firstBlock = context.result.blocks.length;
  let section = context.pdfSection || '正文';
  let pending = [];
  const flush = () => { if (pending.length) addBlock(context, joinedPdfLines(pending), { page: number, section: `${section} / 第 ${number} 页` }); pending = []; };
  let previousTable = context.previousPdfTable;
  for (const event of events) {
    if (event.table) {
      flush();
      const table = event.table;
      const headerRows = table.tableRows.filter(row => isTableHeader(row.cells));
      const ownHeader = headerRows.at(-1)?.cells || [];
      const follows = previousTable && previousTable.page === number - 1 && previousTable.bottom < pageHeight * 0.18 && table.top > pageHeight * 0.8 && Math.abs(previousTable.left - table.left) < 3 && Math.abs(previousTable.right - table.right) < 3;
      const sameHeaders = ownHeader.length && previousTable?.headers?.length === ownHeader.length && ownHeader.every((header, index) => recognitionText(header) === recognitionText(previousTable.headers[index]));
      const continued = Boolean(follows && (!ownHeader.length || sameHeaders));
      const headers = ownHeader.length ? ownHeader : continued ? previousTable.headers : [];
      const tableId = continued ? previousTable.tableId : newTableId(context);
      const titleColumn = headers.findIndex(header => /评审内容|要求名称|事项|项目名称/.test(recognitionText(header)));
      if (continued && !ownHeader.length && titleColumn >= 0 && table.tableRows[0].cells.length === headers.length && !table.tableRows[0].cells[titleColumn]) table.tableRows[0].continued = true;
      let rowHeaders = continued ? previousTable.headers : [];
      for (const row of table.tableRows) {
        if (isTableHeader(row.cells)) rowHeaders = row.cells;
        if (rowHeaders.length && row.cells.length === rowHeaders.length) row.headers = [...rowHeaders];
      }
      addBlock(context, table.tableRows.map(row => row.text).join('\n'), { page: number, section: `${section} / 第 ${number} 页`, kind: 'table', tableRows: table.tableRows, tableHeaders: headers, tableId, continued });
      previousTable = { ...table, tableId, headers, page: number };
      continue;
    }
    const line = event.line;
    const value = recognitionText(line.text);
    const margin = line.y > pageHeight * 0.94 ? 'page-header' : line.y < pageHeight * 0.06 ? 'page-footer' : null;
    if (margin && /^(?:[-—–]?\s*第\s*\d+\s*页\s*[-—–]?|[-—–]?\s*\d+\s*[-—–]?)$/.test(value)) {
      flush(); addBlock(context, line.text, { page: number, section: `${section} / 第 ${number} 页`, heading: true, role: 'page-number' }); continue;
    }
    if (isHeading(line.text)) {
      flush(); section = line.text;
      const block = addBlock(context, line.text, { page: number, section: `${section} / 第 ${number} 页`, heading: true });
      if (margin && block) context.pdfMarginBlocks.push({ block, margin });
      continue;
    }
    if (margin && value.length < 45 && !/[。；;!?！？，,]/.test(value)) {
      flush();
      const block = addBlock(context, line.text, { page: number, section: `${section} / 第 ${number} 页` });
      if (block) context.pdfMarginBlocks.push({ block, margin });
      continue;
    }
    const previous = pending.at(-1);
    if (previous && (previous.y - line.y > Math.max(previous.height, line.height) * 2.9 || pending.map(item => item.text).join('').length > 2500 || /^(?:\d+[、.)]|[一二三四五六七八九十]+[、])/.test(value))) flush();
    pending.push(line);
    if (/[。；;!?！？]$/.test(line.text)) flush();
  }
  flush();
  if (contentsPage) {
    for (const block of context.result.blocks.slice(firstBlock)) {
      // Attachment references still signal missing material, including on a contents page.
      if (/详见附件|见附件|附件[：:]/.test(block.normalizedText) || block.role === 'page-number') continue;
      block.heading = true;
      block.role = 'toc';
    }
  }
  context.pdfSection = section;
  context.previousPdfTable = previousTable;
}

async function extractPdf(context, buffer, depth) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfDirectory = dirname(require.resolve('pdfjs-dist/package.json'));
  const documentTask = pdfjs.getDocument({ data: new Uint8Array(buffer), cMapUrl: `${join(pdfDirectory, 'cmaps')}/`, cMapPacked: true, standardFontDataUrl: `${join(pdfDirectory, 'standard_fonts')}/`, wasmUrl: `${join(pdfDirectory, 'wasm')}/`, isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  const abort = () => documentTask.destroy().catch(() => {});
  context.signal?.addEventListener('abort', abort, { once: true });
  let document;
  context.pdfMarginBlocks = [];
  try {
    document = await documentTask.promise;
    for (let number = 1; number <= document.numPages; number++) {
      progress(context, 'pdf', (number - 1) / document.numPages, `正在读取 PDF 第 ${number}/${document.numPages} 页`);
      try {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        const lines = pdfLines(content.items);
        const text = lines.map(line => line.text).join('\n');
        const operatorList = await page.getOperatorList();
        const hasImage = operatorList.fnArray.some(operator => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject, pdfjs.OPS.paintImageXObjectRepeat].includes(operator));
        // Read picture text even when the same page also has a substantial text layer.
        const needsOCR = !text.trim() || hasImage;
        if (needsOCR) {
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(3, 2600 / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const before = context.result.blocks.length;
          const recognized = await recognizeImage(context, canvas.toBuffer('image/png'), { page: number, section: `第 ${number} 页 / 扫描内容` });
          // Keep exact machine-readable clauses; OCR is a supplement, never its replacement.
          if (text) {
            const normalizedText = text.replace(/\s/g, '');
            context.result.blocks = context.result.blocks.filter((block, index) => index < before || !normalizedText.includes(block.text.replace(/\s/g, '')));
            addPdfPageBlocks(context, content.items, operatorList, pdfjs, number, page.view[3] - page.view[1]);
            const sourcePage = context.result.pages.find(source => source.number === number);
            if (sourcePage) { sourcePage.text = `${text}\n\n${recognized}`.trim(); sourcePage.source = 'mixed'; }
          }
        } else {
          context.result.pages.push({ number, text, source: 'text' });
          addPdfPageBlocks(context, content.items, operatorList, pdfjs, number, page.view[3] - page.view[1]);
          if (hasImage) warn(context, 'PDF_IMAGES_REVIEW', `第 ${number} 页含图形或图片。正文文本层已提取，图片内的细小文字、图纸和表格对应关系需要查看原件。`, number);
        }
        page.cleanup();
      } catch (error) {
        abortIfRequested(context.signal);
        warn(context, 'PDF_PAGE_FAILED', `PDF 第 ${number} 页读取失败：${error.message}。`, number, true);
        if (!context.result.pages.some(page => page.number === number)) context.result.pages.push({ number, text: '', source: 'text' });
      }
    }
    const marginGroups = new Map();
    for (const entry of context.pdfMarginBlocks) {
      const key = `${entry.margin}:${entry.block.normalizedText}`;
      if (!marginGroups.has(key)) marginGroups.set(key, []);
      marginGroups.get(key).push(entry);
    }
    for (const entries of marginGroups.values()) {
      if (new Set(entries.map(entry => entry.block.page)).size < 2) continue;
      for (const { block, margin } of entries) {
        block.heading = true;
        block.role = margin;
      }
    }
    const attachments = await document.getAttachments();
    const entries = attachments instanceof Map ? [...attachments.entries()] : Object.entries(attachments || {});
    for (const [attachmentId, attachment] of entries) {
      try {
        const bytes = attachment.content || await document.getAttachmentContent(attachmentId);
        if (!bytes) { warn(context, 'PDF_ATTACHMENT_FAILED', `PDF 内嵌附件 ${attachment.filename || '未命名'}未能读取，请另行上传。`, null, true); continue; }
        await extractEmbedded(context, attachment.filename || '内嵌附件', Buffer.from(bytes), `PDF 内嵌附件 / ${attachment.filename || '未命名'}`, depth);
      } catch (error) { abortIfRequested(context.signal); warn(context, 'PDF_ATTACHMENT_FAILED', `PDF 内嵌附件 ${attachment.filename || '未命名'}读取失败：${error.message}。`, null, true); }
    }
  } finally {
    context.signal?.removeEventListener('abort', abort);
    await documentTask.destroy();
  }
}

async function extractBuffer(context, buffer, depth = 0) {
  const { format } = context.result;
  if (['txt', 'md', 'markdown', 'csv'].includes(format)) await extractText(context, buffer);
  else if (['xlsx', 'xls'].includes(format)) {
    const extracted = await extractSpreadsheet({ ...context.result, buffer }, { onProgress: context.onProgress, signal: context.signal });
    context.result.sheets = extracted.sheets;
    for (const block of extracted.blocks) addBlock(context, block.text, block);
    context.result.warnings.push(...extracted.warnings);
    if (!extracted.complete) context.result.complete = false;
  }
  else if (format === 'doc' || format === 'docx') await extractWord(context, buffer, depth);
  else if (format === 'pdf') await extractPdf(context, buffer, depth);
  else if (IMAGE_FORMATS.has(format)) await recognizeImage(context, buffer, { section: '图片 / 扫描内容' });
  else warn(context, 'UNSUPPORTED_FORMAT', `暂不支持 ${format} 格式，请转为 PDF、DOCX、TXT 或图片后上传。`, null, true);
}

async function closeOCR(context) {
  context.removeAbort?.();
  if (context.worker) await context.worker.terminate().catch(() => {});
  if (context.ocrDirectory) await rm(context.ocrDirectory, { recursive: true, force: true }).catch(() => {});
}

export async function extractDocument(input, { onProgress, signal } = {}) {
  abortIfRequested(signal);
  if (['xlsx', 'xls'].includes(guessFormat(input.fileName, input.mimeType))) return extractSpreadsheet(input, { onProgress, signal });
  const context = { signal, onProgress, section: '正文', worker: null, ocrDirectory: null, result: { id: input.id, fileName: input.fileName, format: guessFormat(input.fileName, input.mimeType), pages: [], blocks: [], warnings: [], complete: true } };
  try {
    progress(context, 'reading', 0, `正在读取 ${input.fileName}`);
    const buffer = await readFile(input.path);
    abortIfRequested(signal);
    await extractBuffer(context, buffer);
    if (!context.result.blocks.length && !context.result.warnings.some(warning => warning.code === 'UNSUPPORTED_FORMAT')) warn(context, 'NO_TEXT', '未提取到可分析文字，请核对原件或上传可复制文本版本。', null, true);
    progress(context, 'complete', 1, context.result.complete ? '全文提取完成' : '部分内容需要核验');
  } catch (error) {
    abortIfRequested(signal);
    warn(context, 'READ_FAILED', `文件读取失败：${error.message}。请核对文件是否损坏、加密或格式不符。`, null, true);
  } finally { await closeOCR(context); }
  return context.result;
}
