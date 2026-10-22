import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import {Document, Packer, Paragraph} from 'docx';
import XLSX from 'xlsx';
import {createService} from '../src/server/service.js';

// Generated, valid test files only: this test never reads a company original,
// starts extraction, or connects to a running production service.
async function originalFixtures() {
  const canvas = createCanvas(16, 12), context = canvas.getContext('2d');
  context.fillStyle = '#1652a0';context.fillRect(0, 0, 16, 12);
  context.fillStyle = '#ffffff';context.fillRect(2, 2, 5, 5);
  const pdf = await new Promise((resolve, reject) => {
    const document = new PDFDocument({size:'A4'}), chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.text('Original file API test: no OCR or extraction.');document.end();
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['原件核对', '数值'], ['未启动识别', 123.45]
  ]), '原始表格');
  return [
    {name:'待识别证件原图.png', type:'image/png', bytes:canvas.toBuffer('image/png')},
    {name:'待识别证件原图.jpg', type:'image/jpeg', bytes:canvas.toBuffer('image/jpeg')},
    {name:'待识别合同原件.pdf', type:'application/pdf', bytes:pdf},
    {name:'待识别合同原件.docx', type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes:await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('原始Word内容，尚未进行识别。')]}]}))},
    {name:'待识别清单原件.xlsx', type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes:XLSX.write(workbook, {type:'buffer', bookType:'xlsx'})}
  ];
}

test('无识别结果时仍能经本机会话获取五种格式的完整原件，且未认证不可读取', async t => {
  const root = await mkdtemp(join(tmpdir(), 'biaoxi-original-api-v12-'));
  let service, serviceUrl;
  try {
    const inputDirectory = join(root, 'generated-test-originals');
    await mkdir(inputDirectory);
    service = await createService({dataDir:join(root, 'isolated-data'), port:0});
    serviceUrl = service.url;
    const bootstrap = await fetch(serviceUrl+'/api/bootstrap');
    assert.equal(bootstrap.status, 200);
    const {token} = await bootstrap.json(), headers = {'X-Biaoxi-Token':token};
    for (const fixture of await originalFixtures()) {
      await t.test(fixture.name, async () => {
        const originalPath = join(inputDirectory, fixture.name);
        await writeFile(originalPath, fixture.bytes);
        const originalBytes = await readFile(originalPath);
        const form = new FormData();form.append('role', 'evidence');
        form.append('files', new Blob([originalBytes], {type:fixture.type}), fixture.name);
        const upload = await fetch(serviceUrl+'/api/documents', {method:'POST', headers, body:form});
        assert.equal(upload.status, 200);
        const uploaded = await upload.json();assert.equal(uploaded.documents.length, 1);
        const document = uploaded.documents[0];
        assert.equal(document.fileName, fixture.name);
        assert.equal(document.byteSize, originalBytes.length);
        assert.equal(document.status, 'queued');
        assert.equal(document.extraction, undefined, '上传原件不能依赖识别结果');
        assert.equal(document.path, undefined, '本地存储路径不应暴露给前端');
        const fileUrl = serviceUrl+'/api/documents/'+encodeURIComponent(document.id)+'/file';
        const unauthorized = await fetch(fileUrl);assert.equal(unauthorized.status, 401);
        await unauthorized.arrayBuffer();
        const raw = await fetch(fileUrl, {headers});assert.equal(raw.status, 200);
        assert.equal(raw.headers.get('content-type').split(';')[0], fixture.type);
        assert.ok(raw.headers.get('content-disposition').includes(encodeURIComponent(fixture.name)));
        assert.deepEqual(Buffer.from(await raw.arrayBuffer()), originalBytes, '原件接口须逐字节返回上传文件');
        const metadata = await fetch(serviceUrl+'/api/documents/'+encodeURIComponent(document.id), {headers});
        assert.equal(metadata.status, 200);
        const saved = await metadata.json();
        assert.equal(saved.extraction, undefined, '获取原文件不会隐式生成识别内容');
        assert.equal(saved.status, 'queued');
        assert.deepEqual(await readFile(originalPath), originalBytes, '本地测试原件未被修改');
      });
    }
    await t.test('未知原件编号经认证返回404', async () => {
      const response = await fetch(serviceUrl+'/api/documents/nonexistent-original-v12/file', {headers});
      assert.equal(response.status, 404);await response.arrayBuffer();
    });
  } finally {
    try {await service?.close();}
    finally {await rm(root, {recursive:true, force:true});}
  }
  await assert.rejects(stat(root), {code:'ENOENT'}, '临时测试目录已移除');
  await assert.rejects(fetch(serviceUrl+'/api/bootstrap', {signal:AbortSignal.timeout(1000)}), '临时服务已关闭');
});
