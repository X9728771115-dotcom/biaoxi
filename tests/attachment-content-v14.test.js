import test from 'node:test';import assert from 'node:assert/strict';import {analyzeDocument} from '../src/core/analyzer.js';
const doc=(id,fileName,text)=>({id,fileName,complete:true,warnings:[],blocks:[{id:id+':b1',text,section:'施工内容及技术标准',page:null}]});
test('construction material sampling in the technical original stays a fulfillment obligation rather than bidding sample delivery or scoring',()=>{
 const main=doc('main','项目.doc','采购项目：匿名维修工程。'),tech=doc('tech','技术标准和要求.doc','本施工内外装修选用的各项材料，应符合室内环境污染控制标准。均由施工单位制作样板和选样，经确认后进行封样，并据此进行验收。');
 const report=analyzeDocument(main,{attachments:[tech]}),sample=report.categories.find(c=>c.id==='sample').items[0];
 assert.ok(sample);assert.match(sample.stage,/履约/);assert.doesNotMatch(sample.title,/评分|提交/);assert.equal(sample.hard,false);
 assert.match(sample.interpretation,/封样/);assert.match(sample.interpretation,/不.*投标.*送样|不.*投标.*样品/);
 assert.equal(sample.references[0].documentId,'tech');assert.equal(sample.references[0].quote,tech.blocks[0].text);
});
test('explicit bidding sample submission keeps its bidding requirement',()=>{
 const report=analyzeDocument(doc('main','项目.doc','投标时必须提交样品2套，供评审使用；未提交样品的响应无效。'));
 const sample=report.categories.find(c=>c.id==='sample').items[0];assert.ok(sample);assert.doesNotMatch(sample.stage,/施工履约/);assert.match(sample.quote,/投标时必须提交/);
});
test('energy performance in the technical standard is not described as a qualification review or mandatory procurement certification',()=>{
 const report=analyzeDocument(doc('main','项目.doc','采购项目：匿名维修工程。'),{attachments:[doc('tech','技术标准和要求.doc','室内照明采用高效节能LED灯具，卫生间采用防潮型LED灯具，按设计照度标准安装及验收。')]});
 const eco=report.categories.find(c=>c.id==='eco').items[0];assert.ok(eco);assert.match(eco.stage,/技术|履约/);assert.doesNotMatch(eco.stage,/资格审查/);assert.equal(eco.hard,false);
 assert.match(eco.fields['强制采购'],/未明确/);assert.match(eco.interpretation,/技术性能|技术要求/);
});
