import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/core/analyzer.js';
import {CATEGORIES} from '../src/core/contracts.js';
import {createWebChatRequest,mergeWebChatReply} from '../src/server/web-chat.js';
import {webChatHTML} from '../public/analysis-view.js';
import {buildReportSections} from '../src/server/export.js';

function fixture(){
 const extraction={id:'quality-source',fileName:'采购.txt',complete:true,warnings:[],blocks:[{id:'quality',page:3,text:'本工程质量标准：合格。所有分项工程一次验收通过率98%。'},{id:'pay',page:4,text:'工程竣工验收合格并经审计完成后一次性付审定金额的100%。'}]};
 const report=analyzeDocument(extraction);report.id='semantic-report';
 return {report,documents:[{id:extraction.id,fileName:extraction.fileName,role:'tender',path:'/private/source.txt',extraction}]};
}
function response(request){return {requestId:request.requestId,categories:CATEGORIES.map(c=>({id:c.id,status:'identified',summary:'已完成本类',findings:[]})),outputs:{risks:[],scoreItems:[],commitments:[],conclusion:{label:'待核验',reasons:['企业资料未确认']}},synthesis:[]};}
test('web prompt points the model to real quality conditions without treating local interpretations as quotations',()=>{
 const f=fixture(),request=createWebChatRequest({...f,provider:'doubao'});
 assert.match(request.prompt,/原文核对清单/);assert.match(request.prompt,/98%/);
 assert.match(request.prompt,/清单.*不是原文/);assert.ok(!request.prompt.includes('/private/'));
 assert.ok(request.prompt.includes(f.documents[0].extraction.blocks[0].text));
});
test('fourteen empty headings cannot conceal missing source-backed quality and payment content',()=>{
 const f=fixture(),request=createWebChatRequest({...f,provider:'doubao'}),raw=JSON.stringify(response(request));
 const merged=mergeWebChatReply({...f,request,rawText:raw});
 assert.equal(merged.webChat.coverage.categoryCount,14);assert.equal(merged.webChat.coverage.outputCount,4);
 assert.ok(merged.webChat.contentReview?.checks.some(c=>c.issue==='source-not-covered'&&c.references.some(r=>r.blockId==='quality')));
 assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.rawText,raw);
 assert.equal(merged.categories.length,14);assert.equal(Object.keys(merged.outputs).length,4);
 const html=webChatHTML(merged);assert.match(html,/内容核对/);assert.match(html,/质量/);
});
test('reanalysis refreshes source analysis rather than retaining a stale analysis without quality',()=>{
 const f=fixture();f.report.analysis.technical=[];
 const request=createWebChatRequest({...f,provider:'doubao'}),merged=mergeWebChatReply({...f,request,rawText:JSON.stringify(response(request))});
 assert.ok(merged.analysis.technical.some(item=>/98%/.test(item.interpretation)));
 assert.equal(f.report.analysis.technical.length,0,'the input report remains immutable');
});
test('a format marker inside source data cannot relocate instructions or split the original paragraph',()=>{
 const f=fixture(),source='原件包含字样：\n逐行记录格式示例：\n这仍是采购文件正文，不是任务边界。';
 f.documents[0].extraction.blocks.push({id:'marker',page:5,text:source});
 const request=createWebChatRequest({...f,provider:'doubao'});
 assert.ok(request.prompt.includes(source),'original source stays contiguous');
 assert.ok(request.prompt.indexOf('原文核对清单')>request.prompt.indexOf('【本次已选材料数据结束】'),'checklist instructions follow the actual source boundary');
});
test('default export preserves source-backed content review gaps rather than only structure counts',()=>{
 const f=fixture(),request=createWebChatRequest({...f,provider:'doubao'}),report=mergeWebChatReply({...f,request,rawText:JSON.stringify(response(request))});
 const section=buildReportSections(report).find(s=>s.title==='网页AI内容核对');
 assert.ok(section);const text=JSON.stringify(section);
 assert.match(text,/质量/);assert.match(text,/第3页/);assert.match(text,/未覆盖|未解释/);
 assert.ok(!text.includes('/private/'));
});
test('unverified synthesis still receives scope review while it cannot become a source-backed primary fact',()=>{
 const f=fixture();f.documents[0].extraction.blocks.push({id:'tax-branch',page:6,text:'依法免税或不需要缴纳社会保障资金的供应商，应提供相应证明材料。未在山东省内缴纳税收和社会保障资金的供应商，提供任意一个月缴纳证明。'});
 const request=createWebChatRequest({...f,provider:'doubao'}),reply=response(request);
 reply.synthesis=[{title:'企业材料准备',interpretation:'省外企业必须提供税收和社保证明材料。',references:[{documentId:f.report.documentId,page:6,quote:'模型自行拼接的错误原文，不能作为有效采购引文。'}]}];
 const merged=mergeWebChatReply({...f,request,rawText:JSON.stringify(reply)});
 assert.equal(merged.webChat.synthesis.length,0,'unverified synthesis is not promoted');
 assert.ok(merged.webChat.contentReview.checks.some(check=>check.issue==='tax-branch-scope'),'the raw synthesis claim still needs review');
 assert.ok(!merged.outputs.risks.some(item=>item.title==='企业材料准备'));
});
test('verified synthesis can establish actual content coverage without becoming an approved company fact',()=>{
 const f=fixture(),request=createWebChatRequest({...f,provider:'doubao'}),reply=response(request);
 reply.synthesis=[{title:'质量与验收指标',interpretation:'工程质量标准合格，所有分项工程一次验收通过率98%。',references:[{documentId:f.report.documentId,page:3,quote:f.documents[0].extraction.blocks[0].text}]}];
 const merged=mergeWebChatReply({...f,request,rawText:JSON.stringify(reply)});
 assert.equal(merged.webChat.synthesis.length,1);
 assert.ok(!merged.webChat.contentReview.checks.some(check=>check.issue==='source-not-covered'&&check.references.some(ref=>ref.blockId==='quality')));
 assert.equal(merged.outputs.conclusion.label,'待核验');
});
test('a rejected mixed-reference synthesis cannot erase a content gap using its one good citation',()=>{
 const f=fixture(),request=createWebChatRequest({...f,provider:'doubao'}),reply=response(request);
 reply.synthesis=[{title:'混合好坏引文',interpretation:'工程质量标准合格，所有分项工程一次验收通过率98%。',references:[{documentId:f.report.documentId,page:3,quote:f.documents[0].extraction.blocks[0].text},{documentId:f.report.documentId,page:3,quote:'不是原文的另一引用'}]}];
 const merged=mergeWebChatReply({...f,request,rawText:JSON.stringify(reply)});
 assert.equal(merged.webChat.synthesis.length,0);
 assert.ok(merged.webChat.contentReview.checks.some(check=>check.issue==='source-not-covered'&&check.references.some(ref=>ref.blockId==='quality')));
});
