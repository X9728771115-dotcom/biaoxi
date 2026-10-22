import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enhanceAnalysis,validateSettings} from '../src/server/ai.js';
const extraction={id:'d1',fileName:'招标.txt',blocks:[{id:'b1',documentId:'d1',fileName:'招标.txt',text:'必须在投标截止前缴纳保证金人民币2万元，否则投标无效。',page:1,section:'保证金'}]};
test('disabled AI never sends a request',async()=>{
 let calls=0; await assert.rejects(enhanceAnalysis(extraction,{enabled:false},{fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
});
test('AI keeps only source-verifiable findings and never accepts invented rejection',async()=>{
 const reply={findings:[{categoryId:'deposit',title:'保证金',quote:'缴纳保证金人民币2万元',blockId:'b1',hard:true,fields:{金额:'2万元'}},{categoryId:'rejection',title:'虚构要求',quote:'必须具有ISO认证',blockId:'b1',hard:true}]};
 const result=await enhanceAnalysis(extraction,{enabled:true,provider:'custom',baseUrl:'https://example.test/v1',model:'test',apiKey:'secret'},{fetchImpl:async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer secret');assert.equal(init.redirect,'error');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(reply)}}]}));}});
 assert.equal(result.findings.length,1);assert.equal(result.findings[0].matchStatus,'pending');assert.equal(result.findings[0].references[0].blockId,'b1');assert.ok(result.warnings.length);
});
test('provider URL cannot transmit secrets using insecure external HTTP',()=>{
 assert.throws(()=>validateSettings({enabled:true,provider:'custom',baseUrl:'http://example.com/v1',model:'m'}),/HTTPS/);
 assert.throws(()=>validateSettings({enabled:true,provider:'custom',baseUrl:'https://user:password@example.com',model:'m'}));
});
test('long document is processed in every chunk',async()=>{
 const doc={...extraction,blocks:Array.from({length:8},(_,i)=>({...extraction.blocks[0],id:'b'+i,text:'评分材料要求。'.repeat(650)}))};let calls=0;
 await enhanceAnalysis(doc,{enabled:true,provider:'custom',baseUrl:'https://example.test',model:'m',apiKey:'s'},{fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'{"findings":[]}'}}]}));}});assert.ok(calls>1);
});
