import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as app from '../public/app.js';
import * as view from '../public/analysis-view.js';
import {load} from 'cheerio';
import {exportReport} from '../src/server/export.js';
import mammoth from 'mammoth';
import * as webChatView from '../public/web-chat.js';

const feature = name => {assert.equal(typeof app[name], 'function', `缺少网页聊天界面行为：${name}`);return app[name];};
const localItem={id:'local-1',title:'必须提交有效资质',quote:'供应商须提交有效资质证书。',hard:true,matchStatus:'pending',references:[{documentId:'doc-1',blockId:'b1',fileName:'招标.pdf',page:3,quote:'供应商须提交有效资质证书。'}]};
const report={id:'r1',documentId:'doc-1',fileName:'招标.pdf',createdAt:'2026-10-11T00:00:00Z',mode:'web-chat',categories:[{id:'qualification',title:'资质要求',items:[localItem]}],outputs:{risks:[localItem],scoreItems:[],commitments:[],conclusion:{label:'待核验',reasons:['尚未取得企业资质证据']}},coverage:{},warnings:[],webChat:{provider:'deepseek',requestId:'req-1',status:'partial',capturedAt:'2026-10-11T01:00:00Z',rawText:'{"结论":"可以投标","原始说明":"<script>window.bad=true</script>"}',categories:[{id:'qualification',title:'资质要求',status:'pending',summary:'核验有效资质，<img src=x onerror=alert(1)>'}],modelOutputs:{conclusion:'可以投标'},coverage:{categoryCount:1,outputCount:1,missingCategories:['personnel'],missingOutputs:['commitments'],unverifiedReferences:[{quote:'不存在的引文',page:99}]},warnings:[{code:'QUOTE_UNVERIFIED',message:'1处引用未通过校验'}]}};

test('网页诊断说明失败阶段并只展示安全计数，不回显平台内容或账号信息',()=>{
 assert.equal(typeof webChatView.webChatDiagnosticText,'function');
 const {webChatDiagnosticText}=webChatView,text=webChatDiagnosticText({failedAt:'uploading',blockingStage:'captcha',diagnostics:{editorCount:1,uploadCount:0,sendCount:1,attachmentCount:2,documentReady:'complete',authentication:'unconfirmed',cookie:'private-cookie',accountName:'private-account'}});
 assert.match(text,/上传/);assert.match(text,/验证/);assert.match(text,/输入框.*1/);assert.match(text,/附件.*2/);
 assert.ok(!text.includes('private'));assert.ok(!webChatDiagnosticText({diagnostics:{editorCount:'secret-account'}}).includes('secret-account'));
});

test('浏览器缺少桌面桥时说明限制，绝不打开外部网页',async()=>{
 await assert.rejects(feature('openWebChat')(undefined,{provider:'deepseek',reportId:'r1'}),/桌面版/);
});
test('网页入口绑定所选报告，也允许仅打开平台先登录；拒绝任意网址',async()=>{
 const calls=[];const bridge={async open(options){calls.push(options);return {ok:true};}};
 const open=feature('openWebChat');
 assert.deepEqual(await open(bridge,{provider:'deepseek',reportId:'r1'}),{ok:true});
 assert.deepEqual(await open(bridge,{provider:'doubao'}),{ok:true});
 assert.deepEqual(calls,[{provider:'deepseek',reportId:'r1'},{provider:'doubao'}]);
 await assert.rejects(open(bridge,{provider:'https://malicious.example/'}),/平台/);
 assert.equal(calls.length,2);
});
test('无报告不能发送，运行时不能重复开始或重新加载',()=>{
 const controls=feature('webChatControls');
 assert.equal(controls({provider:'deepseek'},{running:false}).startDisabled,true);
 assert.equal(controls({provider:'deepseek',reportId:'r1'},{stage:'ready',running:false}).startDisabled,false);
 const running=controls({provider:'deepseek',reportId:'r1'},{running:true});
 assert.equal(running.startDisabled,true);assert.equal(running.reloadDisabled,true);assert.equal(running.cancelDisabled,false);
});
test('开始操作必须有报告，重复启动门禁不因界面事件绕过',async()=>{
 let starts=0;const bridge={async start(){starts++;return {stage:'uploading',running:true};}};
 const action=feature('performWebChatAction');
 await assert.rejects(action(bridge,'start',{},{}),/报告/);
 await assert.rejects(action(bridge,'start',{reportId:'r1'},{running:true}),/正在/);
 assert.equal(starts,0);
 assert.deepEqual(await action(bridge,'start',{reportId:'r1'},{stage:'ready',running:false}),{stage:'uploading',running:true});
 assert.equal(starts,1);
});
test('取回或取消后的窗口即使检查登录返回ready，也必须重新打开才能发送新任务',async()=>{
 const state={stage:'ready',running:false,taskEnded:true};
 assert.equal(feature('webChatControls')({reportId:'r1'},state).startDisabled,true);
 let starts=0;const bridge={async start(){starts++;}};
 await assert.rejects(feature('performWebChatAction')(bridge,'start',{reportId:'r1'},state),/关闭此窗口/);
 assert.equal(starts,0);
});
test('回答进入校验保存阶段后禁止取消，事件调用也不能撤销已接收保存',async()=>{
 const state={stage:'saving',running:true,message:'正在校验保存平台回答。'};
 assert.equal(feature('webChatControls')({reportId:'r1'},state).cancelDisabled,true);
 let cancelled=0;const bridge={async cancel(){cancelled++;}};
 await assert.rejects(feature('performWebChatAction')(bridge,'cancel',{reportId:'r1'},state),/保存.*不能取消/);
 assert.equal(cancelled,0);
});
test('远程视图只接收有限矩形坐标，不发送上下文或文件路径',()=>{
 const bounds=feature('webChatViewportBounds');
 assert.deepEqual(bounds({left:10.8,top:218.2,width:809.7,height:581.9,secret:'/private/file.pdf'}),{x:11,y:218,width:810,height:582});
 assert.equal(bounds({left:0,top:0,width:NaN,height:50}),null);
 assert.deepEqual(bounds({left:-4,top:-2,width:0,height:0}),{x:0,y:0,width:0,height:0});
});
test('网页AI候选、缺口和原始回答安全呈现，不替代本地待核结论',()=>{
 assert.equal(typeof view.webChatHTML,'function','缺少网页AI报告展示');
 const html=view.webChatHTML(report);const $=load(html);
 assert.equal($('script,img').length,0);
 assert.ok($.text().includes('DeepSeek'));assert.ok($.text().includes('1 / 14'));assert.ok($.text().includes('1 / 4'));
 for(const value of ['人员要求','必须承诺内容','99','尚未取得企业资质证据'])assert.ok($.text().includes(value),value);
 assert.equal($('.web-chat-raw').text().includes(report.webChat.rawText),true);
 assert.equal(report.outputs.conclusion.label,'待核验');
 assert.ok($.text().includes('AI 候选'));
});
test('结构失败仍显示完整原始回答，取回状态不宣称解读完整',()=>{
 assert.equal(typeof view.webChatHTML,'function','缺少网页AI报告展示');
 const failed={...report,webChat:{...report.webChat,status:'captured',categories:[],modelOutputs:null,rawText:'仅一段无法归类的完整回答。',warnings:[{code:'WEB_CHAT_FORMAT',message:'格式未识别'}]}};
 const $=load(view.webChatHTML(failed));
 assert.ok($.text().includes('已取回，待复核'));
 assert.equal($('.web-chat-raw').is('[open]'),true);
 assert.ok($.text().includes('仅一段无法归类的完整回答。'));
});
const narrativeReport=()=>({...report,synthesis:{status:'completed',items:[{title:'跨章节材料与付款风险',interpretation:'本地综合解读保持独立。',references:localItem.references}]},webChat:{...report.webChat,synthesis:[{id:'web-synthesis-1',title:'跨章节材料与付款风险',interpretation:'资格证书与合同付款条件须分别落实，<img src=x onerror=alert(1)>。',impact:'首笔款须验收后支付，投标前确认垫资安排。',actions:['核验资质证书有效期。','确认验收与支付时点。'],references:[...localItem.references,{documentId:'doc-1',blockId:'b8',fileName:'招标.pdf',page:8,quote:'工程验收合格后支付首笔款。'}]}]}});
test('网页跨章节解释完整可读并保留真实出处，同名解读不覆盖本地综合解读',()=>{
 const value=narrativeReport(),before=structuredClone(value);
 const $=load(view.webChatHTML(value)+view.projectOverviewHTML(value));
 assert.equal($('script,img').length,0);
 const section=$('.web-chat-synthesis');
 for(const text of ['跨章节材料与付款风险','资格证书与合同付款条件须分别落实','首笔款须验收后支付','核验资质证书有效期','确认验收与支付时点'])assert.ok(section.text().includes(text),text);
 const refs=section.find('[data-source-reference]').toArray().map(button=>JSON.parse($(button).attr('data-source-reference')));
 assert.deepEqual(refs,value.webChat.synthesis[0].references);
 assert.ok($('.model-synthesis').text().includes('本地综合解读保持独立'));
 assert.deepEqual(value,before);
});
test('Word完整核查版保留平台来源、缺口与整份原始回答，同时保留本地四项和14类',async()=>{
 const result=(await mammoth.extractRawText({buffer:await exportReport(report,'docx',{includeRaw:true})})).value;
 for(const value of ['网页 AI 试验','DeepSeek','req-1','网页 AI 原始回答','1 / 14','1 / 4','人员要求','必须承诺内容','未通过校验','可以投标','window.bad=true','废标项清单','必须加分项','投标可行性结论','14类详细分析','尚未取得企业资质证据'])assert.ok(result.includes(value),value);
 assert.ok(result.includes(report.webChat.rawText));
 const concise=(await mammoth.extractRawText({buffer:await exportReport(report,'docx')})).value;
 assert.ok(!concise.includes(report.webChat.rawText));assert.ok(concise.includes('DeepSeek'));assert.ok(concise.includes('尚未取得企业资质证据'));assert.ok(concise.includes('第3页'));
});
test('Word导出网页跨章节解释、影响、动作及引文，仍保留同名本地解读',async()=>{
 const value=narrativeReport();
 const result=(await mammoth.extractRawText({buffer:await exportReport(value,'docx')})).value;
 for(const text of ['AI辅助综合解读待复核','资格证书与合同付款条件须分别落实','首笔款须验收后支付','核验资质证书有效期','确认验收与支付时点','本地综合解读保持独立。','第3、8页'])assert.ok(result.includes(text),text);
 assert.ok(!result.includes(report.webChat.rawText));
 const detail=(await mammoth.extractRawText({buffer:await exportReport(value,'docx',{includeRaw:true})})).value;
 assert.ok(detail.includes('工程验收合格后支付首笔款。'));assert.ok(detail.includes(report.webChat.rawText));assert.ok(detail.includes('主文件 第8页'));
 assert.equal(value.outputs.conclusion.label,'待核验');
});
test('PDF完整核查版保留网页跨章节解读及真实来源，完整原始回答仍可提取',async()=>{
 const buffer=await exportReport(narrativeReport(),'pdf',{includeRaw:true});
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
 try{
  const doc=await task.promise;let result='';
  for(let page=1;page<=doc.numPages;page++)result+=(await(await doc.getPage(page)).getTextContent()).items.map(item=>item.str).join('');
  for(const text of ['AI辅助综合解读待复核','首笔款须验收后支付','确认验收与支付时点','主文件 第8页','工程验收合格后支付首笔款。','本地综合解读保持独立。','网页 AI 原始回答','window.bad=true'])assert.ok(result.includes(text),text);
 }finally{await task.destroy();}
});
const duplicateQuoteReport=()=>{
 const old={...localItem,title:'已核验本地资质要求',source:'offline',reviewed:true,matchStatus:'met',interpretation:'已单独核对本次企业证书。'};
 const firstCandidate={...localItem,id:'ai-first-1',title:'首轮网页AI有效期提示',source:'ai',reviewed:false,matchStatus:'pending',interpretation:'原文含硬性审查条件；须结合企业实际资料核验，不以加分抵消。',fields:{'补充解读（待核验）':'首轮要求逐项登记证书适用范围与发证主体。'}};
 const candidate={...localItem,id:'ai-new-1',title:'网页AI补充证书核验',source:'ai',reviewed:false,matchStatus:'pending',interpretation:'补充核验主体对应关系与证书有效期，原人工确认不覆盖新解读。',fields:{'补充解读（待核验）':'证书名称不能代替对适用等级和有效期的核验。','AI候选·准备材料（待核验）':['证书主体对应记录','有效期核验记录']}};
 return {...report,categories:[{id:'qualification',title:'资质要求',items:[old,firstCandidate,candidate]}],outputs:{...report.outputs,risks:[old]},webChat:{...report.webChat,rawText:'{"round":2,"title":"网页AI补充证书核验"}',categories:[],modelOutputs:null}};
};
for(const format of ['docx','pdf'])test(`${format.toUpperCase()}同引文新AI候选仍导出独立解释及字段，原人工满足状态不套用`,async()=>{
 const value=duplicateQuoteReport(),before=structuredClone(value),buffer=await exportReport(value,format);
 let result;
 if(format==='docx')result=(await mammoth.extractRawText({buffer})).value;
 else{
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
  try{const doc=await task.promise;result='';for(let page=1;page<=doc.numPages;page++)result+=(await(await doc.getPage(page)).getTextContent()).items.map(item=>item.str).join('');}finally{await task.destroy();}
 }
 const details=result.split('14类详细分析')[1].split('读取覆盖与待核验')[0],candidate=details.slice(details.indexOf('网页AI补充证书核验'));
 for(const text of ['补充核验主体对应关系与证书有效期','证书名称不能代替对适用等级和有效期的核验','AI候选·准备材料（待核验）','证书主体对应记录','有效期核验记录','企业条件待核验','AI候选解读'])assert.ok(candidate.includes(text),text);
 const first=details.split('首轮网页AI有效期提示')[1].split('网页AI补充证书核验')[0];
 assert.ok(first.includes('首轮要求逐项登记证书适用范围与发证主体。'),'首轮补充字段应独立保留，不依赖第二轮原始回答');
 assert.ok(first.includes('企业条件待核验'));
 assert.equal(value.webChat.rawText.includes('首轮要求逐项登记'),false);
 assert.equal(candidate.includes('已满足（已复核）'),false);
 assert.equal((details.match(/已满足（已复核）/g)||[]).length,1);
 assert.ok(candidate.includes('第3页'),'默认同引文候选保留真实页码');
 const detailed=await exportReport(value,format,{includeRaw:true});let detailedText;
 if(format==='docx')detailedText=(await mammoth.extractRawText({buffer:detailed})).value;
 else{const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(detailed),useSystemFonts:true});try{const doc=await task.promise;detailedText='';for(let page=1;page<=doc.numPages;page++)detailedText+=(await(await doc.getPage(page)).getTextContent()).items.map(item=>item.str).join('');}finally{await task.destroy();}}
 assert.equal((detailedText.match(/供应商须提交有效资质证书。/g)||[]).length,1,'完整核查版同原文附录仅保留一次');assert.ok(detailedText.includes('E1'));
 assert.deepEqual(value,before);
});
