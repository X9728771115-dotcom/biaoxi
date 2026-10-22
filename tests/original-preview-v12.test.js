import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import * as ui from '../public/app.js';

test('图片即使OCR为空或误标文字格式，仍按实际文件显示原图',()=>{
 assert.equal(typeof ui.originalPreviewKind,'function');
 for(const fileName of ['营业执照.png','证书.JPG','身份证.jpeg','照片.webp','扫描.bmp']){
  assert.equal(ui.originalPreviewKind({fileName,extraction:{format:'image',blocks:[]}}),'image');
  assert.equal(ui.originalPreviewKind({fileName}),'image');
 }
 assert.equal(ui.originalPreviewKind({fileName:'证书.tiff'}),'download');
 assert.equal(ui.originalPreviewKind({fileName:'内容.svg'}),'download');
 assert.equal(ui.originalPreviewKind({fileName:'文件.docx',extraction:{format:'pdf'}}),'download');
});

test('PDF尚未提取文字也可显示原页并使用实际页码导航',()=>{
 assert.equal(typeof ui.originalPreviewKind,'function');
 assert.equal(ui.originalPreviewKind({fileName:'合同.PDF'}),'pdf');
 assert.equal(ui.sourcePaginationState({fileName:'合同.PDF'},3,5).isPdf,true);
 assert.equal(ui.sourcePaginationState({fileName:'合同.PDF'},3,5).page,3);
});

test('PDF内嵌Excel定位时关闭PDF翻页，避免翻页丢失工作表出处',()=>{
 const pagination=ui.sourcePaginationState({fileName:'带清单附件.pdf',extraction:{format:'pdf',pages:[{number:1},{number:2}]}},1,2,{mode:'spreadsheet'});
 assert.equal(pagination.isPdf,false);
 assert.equal(pagination.nextDisabled,true);
});

test('所有格式包括未完成识别文件都有真实原件下载，文件名不插入HTML',()=>{
 assert.equal(typeof ui.originalFileActionsHTML,'function');
 for(const fileName of ['营业执照.png','合同.pdf','文档.doc','文档.docx','清单.xls','清单.xlsx']){
  const $=load(ui.originalFileActionsHTML({id:'owned-1',fileName}));
  assert.equal($('button[data-download-original="owned-1"]').text(),'下载原件');
  assert.ok($.text().includes(fileName));
  assert.equal($('a[href*="/file"]').length,0,'原字节需要鉴权，不能裸链绕开会话');
 }
 const $=load(ui.originalFileActionsHTML({id:'owned-1',fileName:'<img src=x onerror=alert(1)>.png'}));
 assert.equal($('img,script').length,0);
 assert.ok($.text().includes('<img src=x onerror=alert(1)>.png'));
});
