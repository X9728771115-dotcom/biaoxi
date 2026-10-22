import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enhanceAnalysis} from '../src/server/ai.js';

const settings={enabled:true,provider:'custom',baseUrl:'https://example.test/v1',model:'fixture-model',apiKey:'test-only-key'};
const block=(id,text,extra={})=>({id,documentId:'tender-1',fileName:'采购.txt',page:1,section:'商务要求',role:'tender',text,...extra});
const document=blocks=>({id:'tender-1',fileName:'采购.txt',complete:true,blocks});
const reply=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]}));
const finding=(b,extra={})=>({categoryId:'payment',blockId:b.id,documentId:b.documentId,title:'付款要求',quote:b.text,interpretation:'按原文核验付款条件',...extra});
const combined=(refs,extra={})=>({title:'工期与回款应分别安排',interpretation:'验收交付期限与审计后付款为不同节点',impact:'须核验资金占用',actions:['确认审计和付款期限'],references:refs,...extra});

test('whole-document synthesis connects verified findings from separate chapters with real References',async()=>{
 const a=block('delivery','开工令后45日完成交付验收。',{section:'工期',page:2});
 const b=block('pay','竣工验收且审计完成后支付审定金额100%。',{section:'付款',page:8});
 let synthesisInput;
 const result=await enhanceAnalysis(document([a,b]),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(!input.phase||input.phase==='extraction')return reply({findings:[finding(a),finding(b)]});
  synthesisInput=input;
  return reply({items:[combined([{documentId:'tender-1',blockId:'delivery',quote:a.text,page:999,fileName:'伪页码'}, {documentId:'tender-1',blockId:'pay',quote:b.text}])]});
 }});
 assert.equal(result.synthesis?.status,'completed');
 assert.equal(result.synthesis.items.length,1);
 assert.deepEqual(result.synthesis.items[0].references.map(r=>[r.documentId,r.blockId,r.page,r.fileName]),[['tender-1','delivery',2,'采购.txt'],['tender-1','pay',8,'采购.txt']]);
 assert.equal(result.synthesis.items[0].impact,'须核验资金占用');
 const input=JSON.stringify(synthesisInput);
 assert.ok(input.includes('开工令后45日完成交付验收。'));
 assert.ok(input.includes('竣工验收且审计完成后支付审定金额100%。'));
 assert.ok(input.includes('付款要求'));
 assert.ok(input.includes('chapter-coverage'));
});

test('long input has no missing text fragments and receives bounded batch review followed by synthesis',async()=>{
 const source=Array.from({length:9},(_,i)=>block('b'+i,`第${i}章。`+'普通工程内容。'.repeat(950),{section:'章节'+i,page:i+1}));
 const sent=new Map(),phases=[],requests=[];
 const result=await enhanceAnalysis(document(source),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);phases.push(input.phase);requests.push(input);
  if(!input.phase||input.phase==='extraction'){
   for(const b of input.blocks){const pieces=sent.get(b.blockId)||[];pieces.push({offset:b.offset,text:b.text});sent.set(b.blockId,pieces);}
   return reply({findings:[]});
  }
  return reply({items:[]});
 }});
 for(const b of source)assert.equal(sent.get(b.id).sort((a,c)=>a.offset-c.offset).map(p=>p.text).join(''),b.text);
 assert.ok(phases.includes('synthesis-review'));
 assert.equal(phases.at(-1),'synthesis');
 assert.ok(requests.every(r=>JSON.stringify(r).length<26000));
 assert.equal(result.synthesis?.status,'completed');
 const reviewText=JSON.stringify(requests.filter(r=>r.phase!=='extraction'));
 for(const b of source)assert.ok(reviewText.includes(b.section));
});

test('one failed extraction chunk preserves earlier and later findings and marks synthesis partial',async()=>{
 const source=Array.from({length:3},(_,i)=>block('b'+i,`付款条件${i}。`+'支付说明。'.repeat(1400),{section:'付款'+i,page:i+1}));
 let extractionCalls=0;
 const result=await enhanceAnalysis(document(source),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(!input.phase||input.phase==='extraction'){
   extractionCalls++;
   if(extractionCalls===2)return new Response('',{status:503});
   const b=input.blocks[0];return reply({findings:[{categoryId:'payment',blockId:b.blockId,documentId:b.documentId,title:'付款条款',quote:b.text.slice(0,8)}]});
  }
  return reply({items:[]});
 }});
 assert.ok(result.findings.length>=2);
 assert.equal(result.synthesis?.status,'partial');
 assert.ok(result.warnings.some(w=>w.code==='AI_CHUNK_FAILED'));
 assert.ok(extractionCalls>=3);
});

test('failed whole-document synthesis does not discard valid extracted findings',async()=>{
 const b=block('pay','验收后支付合同价款。');
 const result=await enhanceAnalysis(document([b]),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  return !input.phase||input.phase==='extraction'?reply({findings:[finding(b)]}):new Response('',{status:429});
 }});
 assert.equal(result.findings.length,1);
 assert.equal(result.synthesis?.status,'failed');
 assert.ok(result.warnings.some(w=>w.code==='AI_SYNTHESIS_FAILED'));
});

test('synthesis rejects invented and company-evidence citations and never adopts AI review status',async()=>{
 const b=block('same','验收合格后支付合同价款。');
 const attachment=block('same','图纸要求节点进行防水处理。',{documentId:'attachment-1',fileName:'附件.txt',role:'attachment',page:4});
 const evidence=block('company','企业现有高级工程师一名。',{documentId:'evidence-1',role:'evidence'});
 const result=await enhanceAnalysis(document([b,attachment,evidence]),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(!input.phase||input.phase==='extraction')return reply({findings:[finding(b,{reviewed:true,matchStatus:'met'})]});
  return reply({items:[
   combined([{documentId:'tender-1',blockId:'same',quote:b.text},{documentId:'attachment-1',blockId:'same',quote:attachment.text}],{reviewed:true,matchStatus:'met'}),
   combined([{documentId:'tender-1',blockId:'same',quote:'采购人必须预付50%'}]),
   combined([{documentId:'evidence-1',blockId:'company',quote:evidence.text}])
  ]});
 }});
 assert.equal(result.findings.length,1);
 assert.equal(result.findings[0].matchStatus,'pending');assert.equal(result.findings[0].reviewed,false);
 assert.equal(result.synthesis?.items.length,1);
 assert.equal(result.synthesis.items[0].references[1].documentId,'attachment-1');
 assert.equal(result.synthesis.items[0].matchStatus,undefined);
 assert.equal(result.synthesis.items[0].reviewed,undefined);
 assert.ok(result.warnings.some(w=>w.code==='AI_SYNTHESIS_SOURCE_UNVERIFIED'));
});

test('quoted condition is restored when a model clips the exception out of a genuine substring',async()=>{
 const b=block('policy','如产品不属于强制采购目录，无需提交节能认证证书。',{section:'政策要求'});
 const result=await enhanceAnalysis(document([b]),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(!input.phase||input.phase==='extraction')return reply({findings:[{categoryId:'eco',blockId:b.id,quote:'提交节能认证证书',hard:true,conditional:false}]});
  return reply({items:[combined([{documentId:b.documentId,blockId:b.id,quote:'提交节能认证证书'}])]});
 }});
 assert.equal(result.findings[0].quote,b.text);
 assert.equal(result.findings[0].conditional,true);
 assert.equal(result.synthesis.items[0].references[0].quote,b.text);
 assert.ok(result.warnings.some(w=>w.code==='AI_CONDITION_SCOPE'));
});

test('cancellation exposes verified partial results and sends no further requests',async()=>{
 const controller=new AbortController();
 const source=Array.from({length:4},(_,i)=>block('b'+i,`付款条件${i}。`+'支付说明。'.repeat(1400)));
 let calls=0;
 await assert.rejects(enhanceAnalysis(document(source),settings,{signal:controller.signal,fetchImpl:async(_,init)=>{
  calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(calls===2){controller.abort();throw new DOMException('cancelled','AbortError');}
  const b=input.blocks[0];return reply({findings:[{categoryId:'payment',blockId:b.blockId,documentId:b.documentId,quote:b.text.slice(0,8)}]});
 }}),error=>{
  assert.match(error.message,/取消/);
  assert.equal(error.partialResult?.findings.length,1);
  assert.equal(error.partialResult?.synthesis.status,'cancelled');
  return true;
 });
 assert.equal(calls,2);
});

test('response contains more than 200 valid clauses without silently dropping the remainder',async()=>{
 const b=block('clauses','付款节点按合同明确的验收条件执行。');
 const result=await enhanceAnalysis(document([b]),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(!input.phase||input.phase==='extraction')return reply({findings:Array.from({length:205},(_,i)=>finding(b,{title:'核验要点'+i}))});
  return reply({items:[]});
 }});
 assert.equal(result.findings.length,205);
 assert.notEqual(result.synthesis?.status,'completed','the entire candidate context must not be silently discarded to fit the final review');
 assert.ok(result.warnings.some(w=>w.code==='AI_SYNTHESIS_CONTEXT_LIMIT'));
});

test('synthesis receives source-checked offline clauses and explicit attachment or reading gaps',async()=>{
 const b=block('pay','验收合格后支付合同价款。');let received;
 await enhanceAnalysis(document([b]),settings,{
  reportContext:{findings:[{id:'offline-1',categoryId:'payment',title:'已提取审定付款',quote:b.text,fields:{付款节点:'验收合格'},references:[{documentId:b.documentId,blockId:b.id,quote:b.text}],reviewed:true,matchStatus:'met'}],coverage:{missingAttachments:['工程合同.docx'],unrecognizedBlocks:[{blockId:b.id}]},warnings:[{code:'READING_GAP',message:'完整工程合同正文未取得'}]},
  fetchImpl:async(_,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.phase==='synthesis')received=input;return reply(!input.phase||input.phase==='extraction'?{findings:[]}:{items:[]});}
 });
 assert.ok(received);
 const text=JSON.stringify(received);
 assert.ok(text.includes('已提取审定付款'));
 assert.ok(text.includes('工程合同.docx'));
 assert.ok(text.includes('完整工程合同正文未取得'));
 assert.ok(!text.includes('"matchStatus":"met"'));
});

test('provider length limit is reported even if its returned JSON happens to be parseable',async()=>{
 const b=block('pay','验收合格后支付合同价款。');
 const result=await enhanceAnalysis(document([b]),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(!input.phase||input.phase==='extraction')return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({findings:[finding(b)]})},finish_reason:'length'}]}));
  return reply({items:[]});
 }});
 assert.equal(result.findings.length,1);
 assert.equal(result.synthesis?.status,'partial');
 assert.ok(result.warnings.some(w=>w.code==='AI_RESPONSE_TRUNCATED'));
});

test('bounded reviews carry named reading gaps and chapter coverage into the final review',async()=>{
 const source=Array.from({length:5},(_,i)=>block('b'+i,'工程节点说明。'.repeat(900),{section:'施工章节'+i}));let finalInput;
 const result=await enhanceAnalysis(document(source),settings,{
  reportContext:{coverage:{missingAttachments:['完整合同.docx']},warnings:[{code:'MISSING_CONTRACT',message:'合同调价规则未取得'}]},
  fetchImpl:async(_,init)=>{
   const input=JSON.parse(JSON.parse(init.body).messages[1].content);
   if(input.phase==='synthesis')finalInput=input;
   return reply(!input.phase||input.phase==='extraction'?{findings:[]}:{items:[]});
  }
 });
 assert.equal(result.synthesis?.status,'completed');
 const text=JSON.stringify(finalInput);
 assert.ok(text.includes('完整合同.docx'));
 assert.ok(text.includes('合同调价规则未取得'));
 for(const b of source)assert.ok(text.includes(b.section));
});

test('oversized extracted fields remain saved and their omitted review context is explicit to synthesis',async()=>{
 const b=block('pay','验收合格后支付合同价款。');const large='详细解释。'.repeat(5000);let finalInput;
 const result=await enhanceAnalysis(document([b]),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(input.phase==='extraction')return reply({findings:[finding(b,{fields:{解析:large}})]});
  if(input.phase==='synthesis')finalInput=input;
  return reply({items:[]});
 }});
 assert.equal(result.findings[0].fields.解析,large);
 assert.equal(result.synthesis?.status,'partial');
 assert.ok(result.warnings.some(w=>w.code==='AI_SYNTHESIS_CONTEXT_LIMIT'));
 assert.ok(finalInput.entries.some(e=>e.reviewStatus==='oversized'));
});

test('hundreds of small blocks are bounded by metadata as well as text without losing any source',async()=>{
 const source=Array.from({length:240},(_,i)=>block('small-'+i,'需提供合同扫描件。',{section:'施工准备与技术要求'.repeat(20)}));
 const lengths=[],ids=new Set();
 await enhanceAnalysis(document(source),settings,{fetchImpl:async(_,init)=>{
  const text=JSON.parse(init.body).messages[1].content;lengths.push(text.length);const input=JSON.parse(text);
  if(input.phase==='extraction')for(const b of input.blocks)ids.add(b.blockId);
  return reply(input.phase==='extraction'?{findings:[]}:{items:[]});
 }});
 assert.equal(ids.size,240);
 assert.ok(lengths.every(length=>length<26000),`oversized request: ${Math.max(...lengths)}`);
});

test('offline certificate associations do not remove their underlying tender clause from synthesis',async()=>{
 const b=block('qualification','供应商须具有有效的安全生产许可证。',{section:'资格要求'});
 const evidence=block('license','本企业安全生产许可证扫描件。',{documentId:'evidence-1',role:'evidence'});
 let finalInput;
 await enhanceAnalysis(document([b,evidence]),settings,{
  reportContext:{findings:[{id:'offline-license',categoryId:'qualification',title:'企业安全许可要求',quote:b.text,references:[{documentId:b.documentId,blockId:b.id,quote:b.text},{documentId:evidence.documentId,blockId:evidence.id,quote:evidence.text}]}]},
  fetchImpl:async(_,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.phase==='synthesis')finalInput=input;return reply(input.phase==='extraction'?{findings:[]}:{items:[]});}
 });
 const fact=finalInput.entries.find(e=>e.type==='finding'&&e.finding.title==='企业安全许可要求');
 assert.ok(fact);
 assert.deepEqual(fact.finding.references.map(ref=>ref.documentId),['tender-1']);
});

test('empty batch reviews cannot hide conflicting source facts from the final cross-batch review',async()=>{
 const source=Array.from({length:6},(_,i)=>block('cross-'+i,
  (i===0?'验收合格后30日内付款。':i===5?'验收合格后60日内付款。':`第${i}章施工说明。`)+
  '一般施工说明。'.repeat(620),{section:'章节'+i,page:i+1}));
 let finalInput;const requests=[];
 const result=await enhanceAnalysis(document(source),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);requests.push(input);
  if(input.phase==='extraction')return reply({findings:[]});
  if(input.phase==='synthesis-review')return reply({items:[]});
  finalInput=input;
  return reply({items:[combined([
   {documentId:'tender-1',blockId:source[0].id,quote:'验收合格后30日内付款。'},
   {documentId:'tender-1',blockId:source[5].id,quote:'验收合格后60日内付款。'}
  ],{title:'付款期限存在前后差异',interpretation:'同一验收后的付款期限分别为30日和60日，需澄清适用条款。'})]});
 }});
 assert.ok(requests.some(input=>input.phase==='synthesis-review'));
 assert.ok(finalInput,'compact but complete source context should reach the final review');
 const text=JSON.stringify(finalInput);
 assert.ok(text.includes('验收合格后30日内付款。'));
 assert.ok(text.includes('验收合格后60日内付款。'));
 assert.equal(result.synthesis.items.length,1,'the final cross-batch references remain visible and valid');
 assert.deepEqual(result.synthesis.items[0].references.map(ref=>ref.page),[1,6]);
 assert.equal(result.synthesis.status,'completed');
 assert.ok(requests.every(input=>JSON.stringify(input).length<=16000));
});

test('noncompressible facts beyond the bound cannot turn empty batch outputs into completed whole-document review',async()=>{
 const source=Array.from({length:6},(_,i)=>block('distinct-'+i,
  `本章付款条件${i}应核验。`+Array.from({length:150},(_,j)=>`第${i}章第${j}项施工工序及材料数量依现场条件逐项核验。`).join(''),
  {section:'不同章节'+i,page:i+1}));
 const requests=[];
 const result=await enhanceAnalysis(document(source),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);requests.push(input);
  if(input.phase!=='extraction')return reply({items:[]});
  const b=input.blocks[0];
  return reply({findings:[{categoryId:'payment',blockId:b.blockId,documentId:b.documentId,quote:b.text.slice(0,11),title:'本章付款条件'}]});
 }});
 assert.ok(result.findings.length>0,'valid extraction remains available when cross-batch review is incomplete');
 assert.notEqual(result.synthesis.status,'completed');
 assert.ok(result.warnings.some(w=>w.code==='AI_SYNTHESIS_CONTEXT_LIMIT'));
 assert.ok(requests.every(input=>JSON.stringify(input).length<=16000));
});

test('source compression preserves every character, order and repetition count for citation verification',async()=>{
 const source=Array.from({length:5},(_,i)=>block('lossless-'+i,
  `如采用第${i}方案，须先核验条件。\n`+'重复工序不得省略！'.repeat(700)+'末项不要求额外材料。',
  {section:'原文章节'+i}));
 const encoded=[];
 const result=await enhanceAnalysis(document(source),settings,{fetchImpl:async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(input.phase==='synthesis')encoded.push(...input.entries.filter(entry=>['source','source-facts'].includes(entry.type)));
  return reply(input.phase==='extraction'?{findings:[]}:{items:[]});
 }});
 assert.equal(result.synthesis.status,'completed');
 assert.ok(encoded.some(entry=>entry.type==='source-facts'));
 for(const b of source){
  const restored=encoded.filter(entry=>entry.block.blockId===b.id).sort((a,c)=>a.block.offset-c.block.offset)
   .map(entry=>entry.type==='source'?entry.block.text:entry.spans.map(span=>span.quote.repeat(span.count)).join('')).join('');
  assert.equal(restored,b.text);
 }
});
