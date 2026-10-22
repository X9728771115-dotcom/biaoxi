import test from 'node:test';import assert from 'node:assert/strict';import {load} from 'cheerio';
import {embeddedAttachmentsHTML} from '../public/analysis-view.js';
import {reportOnlineAnalysisBody,reportSelectedAttachmentIds} from '../public/app.js';
test('embedded attachment inventory opens each actual original and distinguishes text reading from drawing verification',()=>{
 const html=embeddedAttachmentsHTML({embeddedAttachments:[{name:'技术标准.rar',documentId:'archive-a',status:'ready',format:'rar'},{name:'技术标准.doc',documentId:'doc-a',containerDocumentId:'archive-a',status:'read',blocks:28,complete:false},{name:'图纸.pdf',documentId:'pdf-a',status:'read',pages:28,blocks:100},{name:'图面.dwg',containerDocumentId:'archive-b',status:'unsupported',reason:'CAD未解析'}]});
 const $=load(html);assert.equal($('tr').length,5);
 assert.equal($('[data-open-document="doc-a"]').length,1);assert.equal($('[data-open-document="pdf-a"]').length,1);assert.equal($('[data-open-document="archive-b"]').length,1);
 assert.match($.text(),/28页/);assert.match($.text(),/未解析/);assert.match($.text(),/文字.*不代表.*图面|图面.*待.*核验/);
});
test('a historical report without an embedded inventory does not invent attachment status',()=>assert.equal(embeddedAttachmentsHTML({}),''));
test('online replay sends only selected attachments and lets generated children be rediscovered for the same source',()=>{
 const generated=Array.from({length:21},(_,i)=>({documentId:`child-${i}`,rootDocumentId:'root',parentDocumentId:'root'}));
 const report={documentId:'root',attachmentIds:['manual',...generated.map(item=>item.documentId)],embeddedAttachments:generated};
 assert.deepEqual(reportOnlineAnalysisBody(report).attachmentIds,['manual']);
 assert.deepEqual(reportSelectedAttachmentIds(report),['manual']);
 assert.deepEqual(reportOnlineAnalysisBody({...report,selectedAttachmentIds:['manual']}).attachmentIds,['manual']);
});
