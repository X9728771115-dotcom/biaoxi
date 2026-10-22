import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument,summarizeReport} from '../src/core/analyzer.js';
import {CATEGORIES,OUTPUTS} from '../src/core/contracts.js';

let protocol;
try {protocol=await import('../src/server/web-chat.js');} catch(error) {if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const api=()=>{assert.equal(typeof protocol?.createWebChatRequest,'function','web chat request protocol must exist');assert.equal(typeof protocol?.mergeWebChatReply,'function','web chat reply merger must exist');return protocol;};
const block=(id,text,page=1)=>({id,text,page,section:'商务要求',documentId:'main-1',fileName:'招标.txt'});
function fixture(extraBlocks=[]){
 const extraction={id:'main-1',fileName:'招标.txt',complete:true,blocks:[block('gate','供应商须提供营业执照，否则响应无效。'),block('pay','如未提交验收资料，不得申请付款。验收合格后30日内付款。',2),...extraBlocks]};
 const attachment={id:'attachment-1',fileName:'补充.txt',path:'/tmp/补充.txt',role:'attachment',extraction:{id:'attachment-1',fileName:'补充.txt',complete:true,blocks:[{id:'a1',text:'验收时应提供检测记录。',page:3}]}};
 const evidence={id:'evidence-1',fileName:'证照.txt',path:'/tmp/证照.txt',role:'evidence',extraction:{id:'evidence-1',fileName:'证照.txt',complete:true,blocks:[{id:'e1',text:'企业已经具备全部履约能力。',page:1}]}};
 const documents=[{id:'main-1',fileName:'招标.txt',path:'/tmp/招标.txt',role:'tender',extraction},attachment,evidence];
 const report=analyzeDocument(extraction,{attachments:[attachment.extraction],evidence:[evidence.extraction]});
 report.id='report-1';report.attachmentIds=['attachment-1'];report.evidenceIds=['evidence-1'];
 return {report,documents};
}
function reply(request,extra={}){
 return {requestId:request.requestId,categories:CATEGORIES.map(c=>({id:c.id,status:'identified',summary:'本类仍须对照原文复核',findings:[]})),outputs:{risks:[],scoreItems:[],commitments:[],conclusion:{label:'可投',reasons:['模型称企业已满足']}},synthesis:[],...extra};
}
function merge(f,request,value){return api().mergeWebChatReply({...f,request,rawText:typeof value==='string'?value:JSON.stringify(value)});}
function records(request){
 const value=reply(request);
 return [...value.categories.map(card=>({requestId:request.requestId,type:'category',...card})),...Object.entries(value.outputs).map(([id,item])=>({requestId:request.requestId,type:'output',id,value:item}))];
}
const lines=value=>value.map(item=>typeof item==='string'?item:JSON.stringify(item)).join('\n');

test('NDJSON accepts the complete 18 current-request records while retaining raw and local facts',()=>{
 const f=fixture(),original=structuredClone(f.report),request=api().createWebChatRequest({...f,provider:'doubao'}),items=records(request),raw=lines(items),merged=merge(f,request,raw);
 assert.equal(items.length,18);assert.equal(merged.webChat.status,'partial');assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_CONTENT_REVIEW'));assert.equal(merged.webChat.rawText,raw);
 assert.equal(merged.webChat.coverage.categoryCount,14);assert.equal(merged.webChat.coverage.outputCount,4);assert.deepEqual(merged.webChat.coverage.missingCategories,[]);assert.deepEqual(merged.webChat.coverage.missingOutputs,[]);
 assert.deepEqual(merged.categories,original.categories);assert.deepEqual(f.report,original);
});

test('NDJSON keeps independently valid current records after a bad line and reports missing records without guessing',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),items=records(request);
 const extraBad=merge(f,request,lines([...items.slice(0,5),'{"broken":',...items.slice(5)]));
 assert.equal(extraBad.webChat.status,'partial');assert.equal(extraBad.webChat.coverage.categoryCount,14);assert.equal(extraBad.webChat.coverage.outputCount,4);assert.ok(extraBad.webChat.warnings.some(w=>w.code==='WEB_CHAT_FORMAT_INVALID'&&w.line===6));
 items[0]='{"broken":';const raw=lines(items),missing=merge(f,request,raw);
 assert.equal(missing.webChat.rawText,raw);assert.equal(missing.webChat.coverage.categoryCount,13);assert.deepEqual(missing.webChat.coverage.missingCategories,['entity']);assert.ok(missing.webChat.warnings.some(w=>w.code==='WEB_CHAT_COVERAGE_GAP'));
});

test('NDJSON rejects foreign request records before they can occupy a current category or output',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'deepseek'}),items=records(request),foreign={...items[0],requestId:'foreign-request',findings:[{title:'异请求候选',quote:'供应商须提供营业执照，否则响应无效。',documentId:'main-1'}]};
 const merged=merge(f,request,lines([foreign,{requestId:'foreign-request',type:'output',id:'risks',value:['foreign-only']},...items]));
 assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.coverage.categoryCount,14);assert.equal(merged.webChat.coverage.outputCount,4);assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_REQUEST_MISMATCH'));
 assert.ok(!merged.categories.flatMap(c=>c.items).some(i=>i.title==='异请求候选'));assert.deepEqual(merged.webChat.modelOutputs.risks,[]);
});

test('NDJSON duplicates warn and preserve the first verified current category and output',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),items=records(request),duplicate={...items[0],summary:'重复记录不得覆盖',findings:[{title:'重复候选不得合并',quote:'供应商须提供营业执照，否则响应无效。',documentId:'main-1'}]};
 const merged=merge(f,request,lines([...items,duplicate,{...items[14],value:['duplicate-only']}]));
 assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.coverage.categoryCount,14);assert.equal(merged.webChat.coverage.outputCount,4);assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_RECORD_DUPLICATE'));
 assert.notEqual(merged.webChat.categories[0].summary,'重复记录不得覆盖');assert.ok(!merged.categories.flatMap(c=>c.items).some(i=>i.title==='重复候选不得合并'));assert.deepEqual(merged.webChat.modelOutputs.risks,[]);
});

test('NDJSON optional synthesis and category candidates still require real procurement quotations',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),items=records(request),quote='如未提交验收资料，不得申请付款。验收合格后30日内付款。';
 items.find(item=>item.id==='payment').findings=[{title:'本次付款候选',quote,documentId:'main-1',page:2}];
 items.find(item=>item.id==='entity').findings=[{title:'证照冒充采购要求',quote:'企业已经具备全部履约能力。',documentId:'evidence-1',page:1}];
 const merged=merge(f,request,lines([...items,{requestId:request.requestId,type:'synthesis',items:[{title:'资料与付款',interpretation:'核对付款资料和起算条件',references:[{documentId:'main-1',quote,page:2}]}]}]));
 assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.synthesis.length,1);assert.equal(merged.webChat.coverage.unverifiedReferences,1);
 const candidate=merged.categories.flatMap(c=>c.items).find(i=>i.title==='本次付款候选');assert.ok(candidate);assert.equal(candidate.reviewed,false);assert.equal(candidate.matchStatus,'pending');assert.ok(!merged.categories.flatMap(c=>c.items).some(i=>i.title==='证照冒充采购要求'));
});

test('request NDJSON examples show a populated category and conclusion without claiming source-backed coverage',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),example=request.prompt.split('逐行记录格式示例：\n')[1];assert.ok(example);
 const items=example.split('\n').map(line=>JSON.parse(line));assert.equal(items.length,2);assert.equal(items.filter(item=>item.type==='category').length,1);assert.equal(items.filter(item=>item.type==='output').length,1);assert.ok(items.every(item=>item.requestId===request.requestId));
 assert.ok(items.find(item=>item.type==='category').findings.length);
 const merged=merge(f,request,example);assert.equal(merged.webChat.coverage.categoryCount,1);assert.equal(merged.webChat.coverage.outputCount,1);assert.equal(merged.webChat.status,'partial');assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_REFERENCE_UNVERIFIED'));
});

test('request binds only the report main/associated files and its prompt never exposes disk paths',()=>{
 const f=fixture();f.documents.push({id:'unused',fileName:'其他项目.txt',path:'/private/other.txt',role:'tender',extraction:{complete:true,blocks:[{id:'u',text:'其他项目'}]}});
 const request=api().createWebChatRequest({...f,provider:'deepseek'});
 assert.equal(request.reportId,f.report.id);assert.match(request.requestId,/^[a-f\d-]{36}$/);
 assert.deepEqual(request.files.map(file=>[file.documentId,file.role]),[['main-1','tender'],['attachment-1','attachment'],['evidence-1','evidence']]);
 assert.ok(request.prompt.includes(request.requestId));assert.ok(request.prompt.includes('不预测企业得分'));
 for(const c of CATEGORIES)assert.ok(request.prompt.includes(c.id));for(const o of OUTPUTS)assert.ok(request.prompt.includes(o.id));
 assert.ok(!request.prompt.includes('/tmp/'));assert.ok(!request.prompt.includes('其他项目'));
 assert.throws(()=>api().createWebChatRequest({...f,provider:'custom'}),/平台/);
});

test('request includes every selected extracted paragraph unchanged with file identity once and real page locations',()=>{
 const extra=block('3b1731d8-95fd-4d30-b78f-82225da6de9b','  不含关键词的完整原文\n\n第二行\tA  B\u00a0末尾  ',7),f=fixture([extra,block('page-footer','第 8 页',8)]);
 f.documents[0].extraction.complete=false;
 f.documents.push({id:'unselected-1',fileName:'未选择资料.txt',path:'/private/unused',role:'evidence',extraction:{complete:true,blocks:[{text:'UNSELECTED_SOURCE_MUST_STAY_LOCAL',page:1}]}});
 const original=structuredClone(f),request=api().createWebChatRequest({...f,provider:'doubao'});
 const dataStart=request.prompt.indexOf('【本次已选材料数据开始】'),dataEnd=request.prompt.indexOf('【本次已选材料数据结束】');
 assert.ok(dataStart>=0&&dataEnd>dataStart,'source data must have an explicit boundary before returning to the analysis task');
 for(const doc of f.documents.slice(0,3)){
  assert.equal(request.prompt.split(doc.id).length-1,1,'each selected document identity appears once, not once per paragraph');
  for(const item of doc.extraction.blocks){const at=request.prompt.indexOf(item.text,dataStart);assert.ok(at>dataStart&&at<dataEnd,'all extracted source text must stay inside the selected-material data boundary');}
 }
 assert.ok(request.prompt.includes('[页7 段3]\n'+extra.text));assert.ok(request.prompt.includes('[页8 段4]\n第 8 页'));
 assert.ok(request.prompt.includes(JSON.stringify({blockId:extra.id,page:7})),'each paragraph exposes its immutable block identity for exact references');
 assert.ok(!request.prompt.includes('UNSELECTED_SOURCE_MUST_STAY_LOCAL'));assert.ok(!request.prompt.includes('/private/unused'));
 assert.equal(request.localCoverage.complete,false);assert.ok(request.prompt.includes('本地读取存在缺口不等于全部原件不可读'));
 assert.ok(request.prompt.includes('documentId仅用于报告引用'));assert.ok(request.prompt.includes('role=evidence'));
 assert.ok(request.prompt.slice(dataEnd).includes('14类及四项输出'));
 assert.deepEqual(f,original,'request preparation must not rewrite extraction or the report');
});

test('request uses an explicit unknown page instead of inventing a PDF page number',()=>{
 const f=fixture([block('unknown-page','无页码来源原文',null)]),request=api().createWebChatRequest({...f,provider:'deepseek'});
 assert.ok(request.prompt.includes('[页未标明 段3]\n无页码来源原文'));
});

test('request checks the complete prompt against 150000 characters without truncating source text',()=>{
 const f=fixture();f.documents[0].extraction.blocks.push(block('padding','X',4));
 const baseline=api().createWebChatRequest({...f,provider:'doubao'}).prompt.length,source=f.documents[0].extraction.blocks.at(-1);
 source.text='X'.repeat(1+150000-baseline);
 const atLimit=api().createWebChatRequest({...f,provider:'doubao'});
 assert.equal(atLimit.prompt.length,150000);assert.ok(atLimit.prompt.includes(source.text));
 source.text+='Y';
 assert.throws(()=>api().createWebChatRequest({...f,provider:'doubao'}),error=>error.code==='WEB_CHAT_PROMPT_TOO_LONG'&&/150001/.test(error.message)&&/150000/.test(error.message)&&/未.*上传/.test(error.message));
 assert.ok(source.text.endsWith('Y'),'oversized source text must remain untouched');
});

test('request rejects absent and wrong-role associated inputs rather than silently omitting them',()=>{
 const f=fixture();f.documents[1].extraction.complete=false;
 assert.equal(api().createWebChatRequest({...f,provider:'doubao'}).files.length,3);
 f.documents[1].extraction.complete=true;f.documents[2].role='attachment';
 assert.throws(()=>api().createWebChatRequest({...f,provider:'doubao'}),/用途/);
 f.documents=f.documents.filter(d=>d.id!=='main-1');
 assert.throws(()=>api().createWebChatRequest({...f,provider:'doubao'}),/文件/);
});

test('selected scanned originals can be sent with local reading gaps retained as partial after capture',()=>{
 const f=fixture();f.documents[0].extraction.complete=false;f.documents[0].extraction.blocks=[];
 const request=api().createWebChatRequest({...f,provider:'deepseek'});
 assert.equal(request.files.length,3);assert.equal(request.localCoverage.complete,false);
 assert.deepEqual(request.localCoverage.incompleteDocuments.map(doc=>doc.documentId),['main-1']);
 assert.match(request.prompt,/本地读取.*缺口/);
 const merged=merge(f,request,reply(request));
 assert.equal(merged.webChat.status,'partial');assert.equal(merged.categories.length,14);assert.equal(Object.keys(merged.outputs).length,4);
 assert.ok(merged.webChat.warnings.some(item=>item.code==='WEB_CHAT_LOCAL_EXTRACTION_INCOMPLETE'));
 assert.equal(merged.outputs.conclusion.label,'待核验');
});

test('an empty original is rejected even when a stale extraction contains text',()=>{
 const f=fixture();f.documents[0].byteSize=0;
 assert.throws(()=>api().createWebChatRequest({...f,provider:'deepseek'}),/空|原文件|无效/);
});

test('request strips traversal, control characters and Windows-reserved names from upload filenames',()=>{
 const f=fixture();f.documents[0].fileName='../../屋面\n改造.pdf';f.documents[1].fileName='C:\\folder\\CON.txt';
 const request=api().createWebChatRequest({...f,provider:'doubao'});
 assert.equal(request.files[0].fileName,'屋面改造.pdf');assert.ok(!/^CON(?:\.|$)/i.test(request.files[1].fileName));
 assert.ok(request.files.every(file=>!/[\\/\u0000-\u001f]/.test(file.fileName)));
});

test('upload aliases are unique ignoring case and reserve real prefixed filenames before resolving duplicates',()=>{
 const f=fixture();f.documents[0].fileName='清单.pdf';f.documents[1].fileName='清单.pdf';f.documents[2].fileName='2-清单.pdf';
 const request=api().createWebChatRequest({...f,provider:'doubao'});
 assert.equal(request.files[0].fileName,'清单.pdf');assert.equal(request.files[2].fileName,'2-清单.pdf');assert.notEqual(request.files[1].fileName,'2-清单.pdf');
 assert.equal(new Set(request.files.map(file=>file.fileName.toLowerCase())).size,3);
 assert.deepEqual(request.files.map(file=>file.originalFileName),['清单.pdf','清单.pdf','2-清单.pdf']);
 for(const file of request.files){assert.ok(request.prompt.includes(JSON.stringify(file.fileName)));assert.ok(request.prompt.includes(file.documentId));}
 f.documents[0].fileName='../PLAN.pdf';f.documents[1].fileName='folder/plan.PDF';f.documents[2].fileName='其他.pdf';
 const caseRequest=api().createWebChatRequest({...f,provider:'deepseek'});
 assert.equal(caseRequest.files[0].fileName,'PLAN.pdf');assert.equal(caseRequest.files[2].fileName,'其他.pdf');assert.notEqual(caseRequest.files[1].fileName.toLowerCase(),'plan.pdf');
 assert.equal(new Set(caseRequest.files.map(file=>file.fileName.toLowerCase())).size,3);
});

test('source checking restores the governing condition at the real page while ignoring hard and company-verification claims',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),value=reply(request);
 value.categories.find(c=>c.id==='payment').findings=[{title:'网页付款候选',quote:'不得申请付款',documentId:'main-1',page:2,interpretation:'应核对资料前置条件',fields:{要求:'资料不足不能申请'},hard:true,reviewed:true,matchStatus:'met'}];
 value.synthesis=[{title:'资料与回款',interpretation:'核对验收资料',impact:'影响回款',actions:['核对原件'],references:[{quote:'验收合格后30日内付款。',documentId:'main-1',page:2}],reviewed:true}];
 const merged=merge(f,request,value),item=merged.categories.flatMap(c=>c.items).find(i=>i.title==='网页付款候选');
 assert.ok(item);assert.equal(item.quote,'如未提交验收资料，不得申请付款。');assert.equal(item.references[0].page,2);
 assert.equal(item.matchStatus,'pending');assert.equal(item.reviewed,false);assert.equal(item.hard,false,'model hard=true cannot create a source-unsupported gate');assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_CONDITION_SCOPE'));
 assert.equal(merged.webChat.synthesis[0].references[0].page,2);assert.equal(merged.webChat.synthesis[0].reviewed,undefined);
 assert.equal(merged.outputs.conclusion.label,'待核验');assert.equal(merged.webChat.modelOutputs.conclusion.label,'可投');
 assert.equal(merged.id,f.report.id);assert.equal(merged.mode,'web-chat');assert.equal(merged.categories.length,14);assert.equal(Object.keys(merged.outputs).length,4);
});

test('fake, ambiguous and enterprise-evidence references remain raw candidates but never become tender requirements',()=>{
 const f=fixture([block('duplicate-1','同一条款重复出现。',4),block('duplicate-2','同一条款重复出现。',5)]),request=api().createWebChatRequest({...f,provider:'deepseek'}),value=reply(request);
 value.categories[0].findings=[
  {title:'伪造要求',documentId:'main-1',quote:'招标原文没有这一要求。'},
  {title:'证照冒充要求',documentId:'evidence-1',quote:'企业已经具备全部履约能力。'},
  {title:'歧义引用',documentId:'main-1',quote:'同一条款重复出现。'}
 ];
 value.synthesis=[{title:'假综合',interpretation:'无依据',references:[{documentId:'evidence-1',quote:'企业已经具备全部履约能力。'}]}];
 const raw=JSON.stringify(value),merged=merge(f,request,raw);
 assert.equal(merged.webChat.rawText,raw);assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.coverage.unverifiedReferences,4);
 assert.equal(merged.webChat.synthesis.length,0);assert.ok(!merged.categories.flatMap(c=>c.items).some(i=>['伪造要求','证照冒充要求','歧义引用'].includes(i.title)));
 assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_REFERENCE_UNVERIFIED'));
});

test('missing category/output and malformed replies are saved with explicit coverage gaps',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'deepseek'}),value=reply(request);
 value.categories=value.categories.slice(0,2);delete value.outputs.commitments;delete value.outputs.conclusion;
 const merged=merge(f,request,value);
 assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.coverage.categoryCount,2);assert.equal(merged.webChat.coverage.outputCount,2);
 assert.equal(merged.webChat.coverage.missingCategories.length,12);assert.deepEqual(merged.webChat.coverage.missingOutputs,['commitments','conclusion']);
 const malformed=merge(f,request,'<script>任意文本</script>');assert.equal(malformed.webChat.rawText,'<script>任意文本</script>');assert.equal(malformed.webChat.status,'partial');assert.equal(malformed.webChat.coverage.categoryCount,0);
 assert.ok(malformed.webChat.warnings.some(w=>w.code==='WEB_CHAT_FORMAT_INVALID'));
});

test('another request reply cannot merge findings even with genuine quotes',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),value=reply(request,{requestId:'other-request'});
 value.categories[0].findings=[{title:'旧消息要求',documentId:'main-1',quote:'供应商须提供营业执照，否则响应无效。'}];
 const merged=merge(f,request,value);assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.coverage.categoryCount,0);
 assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_REQUEST_MISMATCH'));assert.ok(!merged.categories.flatMap(c=>c.items).some(i=>i.title==='旧消息要求'));
});

test('not-found with no findings warns about source-backed local differences without changing either result or coverage',()=>{
 const f=fixture(),first=f.report.categories.find(c=>c.id==='entity').items[0];first.reviewed=true;first.matchStatus='met';first.reviewNote='已对照原件核验主体要求';
 const original=structuredClone(f.report),request=api().createWebChatRequest({...f,provider:'doubao'}),value=reply(request);
 for(const card of value.categories)card.status='not-found';
 const raw=JSON.stringify(value),merged=merge(f,request,raw),warning=merged.webChat.warnings.find(w=>w.code==='WEB_CHAT_LOCAL_MODEL_DISAGREEMENT');
 assert.ok(warning,'explicit model absence must surface a source-backed local difference for review');
 assert.ok(warning.categoryIds.includes('entity'));assert.ok(warning.categoryIds.includes('payment'));assert.ok(!warning.categoryIds.includes('scoring'));
 assert.ok(warning.findingIds.includes(first.id));assert.match(warning.message,/差异|不一致/);assert.match(warning.message,/复核/);assert.doesNotMatch(warning.message,/模型错误|本地正确/);
 assert.equal(merged.webChat.status,'partial');assert.equal(merged.webChat.rawText,raw);
 assert.ok(merged.webChat.categories.every(card=>card.status==='not-found'));
 assert.deepEqual(merged.webChat.coverage,{categoryCount:14,outputCount:4,missingCategories:[],missingOutputs:[],unverifiedReferences:0,note:'这里仅统计回答结构和引文匹配；不等于全文理解、条件适用或企业事实已人工验收。'});
 for(const category of original.categories)for(const item of category.items)assert.deepEqual(merged.categories.find(c=>c.id===category.id).items.find(i=>i.id===item.id),item);
 assert.deepEqual(f.report,original);assert.deepEqual(merged.coverage,original.coverage);
});

test('not-found without a local scoring fact does not create a scoring disagreement while other content gaps remain',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),value=reply(request);
 value.categories.find(c=>c.id==='scoring').status='not-found';
 const merged=merge(f,request,value);
 assert.equal(merged.webChat.status,'partial');assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_CONTENT_REVIEW'));assert.ok(!merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_LOCAL_MODEL_DISAGREEMENT'));
});

test('not-found differences do not use retained AI candidates or enterprise evidence as local procurement facts',()=>{
 const f=fixture(),category=f.report.categories.find(c=>c.id==='scoring');
 category.items.push({id:'previous-ai',title:'旧网页候选',quote:'供应商须提供营业执照，否则响应无效。',source:'ai',references:[{blockId:'gate',documentId:'main-1',quote:'供应商须提供营业执照，否则响应无效。'}],matchStatus:'pending'});
 category.items.push({id:'company-only',title:'企业材料候选',quote:'企业已经具备全部履约能力。',source:'offline',references:[{blockId:'e1',documentId:'evidence-1',quote:'企业已经具备全部履约能力。'}],matchStatus:'pending'});
 const request=api().createWebChatRequest({...f,provider:'deepseek'}),value=reply(request);value.categories.find(c=>c.id==='scoring').status='not-found';
 const merged=merge(f,request,value);
 assert.equal(merged.webChat.status,'partial');assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_CONTENT_REVIEW'));assert.ok(!merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_LOCAL_MODEL_DISAGREEMENT'));
 assert.ok(merged.categories.find(c=>c.id==='scoring').items.some(item=>item.id==='previous-ai'));
 assert.ok(merged.categories.find(c=>c.id==='scoring').items.some(item=>item.id==='company-only'));
});

test('not-found with a returned finding is not treated as an empty model category',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),value=reply(request),card=value.categories.find(c=>c.id==='payment');
 card.status='not-found';card.findings=[{title:'原文付款候选',quote:'如未提交验收资料，不得申请付款。验收合格后30日内付款。',documentId:'main-1',interpretation:'仍须核验资料条件'}];
 const merged=merge(f,request,value);
 assert.ok(!merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_LOCAL_MODEL_DISAGREEMENT'));
 assert.ok(merged.categories.find(c=>c.id==='payment').items.some(item=>item.title==='原文付款候选'));
});

test('valid capture preserves every existing finding/review and does not treat transport coverage as human acceptance',()=>{
 const f=fixture(),first=f.report.categories.flatMap(c=>c.items)[0];first.reviewed=true;first.matchStatus='met';first.reviewNote='原件人工核验记录';first.notes=['人工复核：原件人工核验记录'];
 f.report.coverageReview={reviewed:true,note:'已对照原件核对全部读取提示',reviewedAt:'2026-10-11T00:00:00Z'};f.report=summarizeReport(f.report);
 const request=api().createWebChatRequest({...f,provider:'deepseek'}),merged=merge(f,request,reply(request));
 assert.equal(merged.webChat.status,'partial');assert.ok(merged.webChat.warnings.some(w=>w.code==='WEB_CHAT_CONTENT_REVIEW'));assert.equal(merged.webChat.coverage.categoryCount,14);assert.equal(merged.webChat.coverage.outputCount,4);
 assert.deepEqual(merged.categories.flatMap(c=>c.items).find(i=>i.id===first.id),first);assert.deepEqual(merged.coverageReview,f.report.coverageReview);assert.deepEqual(merged.coverage,f.report.coverage);
 assert.match(merged.webChat.coverage.note,/不等于/);assert.ok(merged.webChat.capturedAt);
 assert.throws(()=>merge(f,request,'a'.repeat(1024*1024+1)),/1MB/);
});

test('later web interpretations of the same quote remain new pending candidates without erasing earlier reviewed facts',()=>{
 const f=fixture(),firstRequest=api().createWebChatRequest({...f,provider:'doubao'}),firstValue=reply(firstRequest);
 const quote='验收合格后30日内付款。';
 firstValue.categories.find(c=>c.id==='payment').findings=[{title:'第一次付款解释',quote,documentId:'main-1',interpretation:'核验付款期限',fields:{付款前提:'验收合格'}}];
 f.report=merge(f,firstRequest,firstValue);
 const previous=f.report.categories.flatMap(c=>c.items).find(i=>i.title==='第一次付款解释');previous.reviewed=true;previous.matchStatus='met';previous.reviewNote='仅此原事实已人工核验';
 const secondRequest=api().createWebChatRequest({...f,provider:'deepseek'}),secondValue=reply(secondRequest);
 secondValue.categories.find(c=>c.id==='payment').findings=[{title:'第二次资金深入解释',quote,documentId:'main-1',interpretation:'交付、资料、回款应分别安排',fields:{资金风险:'应核对资金占用及验收资料交接'},reviewed:true,matchStatus:'met'}];
 const merged=merge(f,secondRequest,secondValue),items=merged.categories.flatMap(c=>c.items),fresh=items.find(i=>i.title==='第二次资金深入解释');
 assert.ok(fresh,'stable source identity must not silently discard a newer interpretation');assert.notEqual(fresh.id,previous.id);assert.ok(fresh.id.includes(secondRequest.requestId));
 assert.equal(fresh.matchStatus,'pending');assert.equal(fresh.reviewed,false);assert.match(fresh.fields['补充解读（待核验）'],/交付、资料、回款/);assert.match(fresh.fields['AI候选·资金风险（待核验）'],/资金占用/);
 assert.deepEqual(items.find(i=>i.id===previous.id),previous);
 for(const original of fixture().report.categories.flatMap(c=>c.items))assert.equal(items.filter(i=>i.id===original.id).length,1,'base rule findings must not be copied on each web run');
});

test('multiple explanations of one quote in the same reply retain both interpretations and material fields',()=>{
 const f=fixture(),request=api().createWebChatRequest({...f,provider:'doubao'}),value=reply(request),quote='验收合格后30日内付款。';
 value.categories.find(c=>c.id==='payment').findings=[
  {title:'付款时点',quote,documentId:'main-1',interpretation:'明确验收后起算',fields:{关注:'起算条件'}},
  {title:'回款安排',quote,documentId:'main-1',interpretation:'考虑实际支出与回款衔接',fields:{关注:'资金安排',证明材料:['验收资料']}}
 ];
 const merged=merge(f,request,value),candidates=merged.categories.find(c=>c.id==='payment').items.filter(i=>i.source==='ai');
 assert.equal(candidates.length,1,'one original fact should carry its combined candidate explanations');
 assert.match(candidates[0].fields['补充解读（待核验）'],/明确验收后起算/);assert.match(candidates[0].fields['补充解读（待核验）'],/实际支出与回款/);
 assert.deepEqual(candidates[0].fields['AI候选·关注（待核验）'],['起算条件','资金安排']);assert.deepEqual(candidates[0].fields['AI候选·证明材料（待核验）'],['验收资料']);
});
