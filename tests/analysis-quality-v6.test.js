import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeDocument} from '../src/core/analyzer.js';
import {analysisUnits, documentAnalysis} from '../src/core/analysis.js';

function document(rows, id='anonymous-quality') {
  return {id,fileName:`${id}.pdf`,complete:true,warnings:[],pages:[],blocks:rows.map((row,index)=>({
    id:`${id}:b${index}`,documentId:id,fileName:`${id}.pdf`,page:index+1,section:'技术要求',kind:'paragraph',...row
  }))};
}
const qualityItems=report=>report.analysis.technical.filter(item=>item.fields?.['质量标准']||item.fields?.['一次验收通过率数值']!==undefined);
function assertLiteralReferences(items,documents) {
  const blocks=new Map(documents.flatMap(doc=>doc.blocks.map(block=>[`${doc.id}:${block.id}`,block])));
  for(const item of items)for(const ref of item.references){
    const block=blocks.get(`${ref.documentId}:${ref.blockId}`);
    assert.ok(block?.text.includes(ref.quote),'引用必须是对应文件块中的真实片段');
    assert.equal(ref.page,block.page);
  }
}

test('匿名质量行提取99%而非默认100%，保留质量标准、范围、阶段及原始引用',()=>{
  const text='供应商施工应达到合格标准，所有分项工程一次验收通过率不低于９９ %。';
  const input=document([{text,page:7}]);
  const report=analyzeDocument(input),items=qualityItems(report);
  assert.equal(items.length,1);
  const item=items[0];
  assert.equal(item.fields['质量标准'],'合格');
  assert.equal(item.fields['一次验收通过率数值'],99);
  assert.equal(item.fields['一次验收通过率比较关系'],'>=');
  assert.equal(item.fields['验收范围'],'所有分项工程');
  assert.equal(item.subject,'供应商');
  assert.equal(item.stage,'履约验收');
  assert.equal(item.scope.phase,'fulfillment');
  assert.equal(item.applicability,'required');
  assert.equal(item.hard,false);
  assert.equal(item.matchStatus,'pending');
  assert.match(item.interpretation,/合格/);
  assert.match(item.interpretation,/不低于99%/);
  assert.doesNotMatch(item.interpretation,/100%|已(?:达到|通过|保证)/);
  assert.equal(item.fields['要求正文'],text);
  assertLiteralReferences(items,[input]);
});

test('百分比及比较关系来自条款，支持小数和达到',()=>{
  const input=document([{text:'承包人工程质量达到合格标准，分项工程一次验收通过率达到98.5%。'}]);
  const [item]=qualityItems(analyzeDocument(input));
  assert.ok(item);
  assert.equal(item.fields['一次验收通过率数值'],98.5);
  assert.equal(item.fields['一次验收通过率比较关系'],'达到');
  assert.equal(item.subject,'承包人');
  assert.match(item.interpretation,/达到98\.5%/);
  assertLiteralReferences([item],[input]);
});

test('只有合格标准不补百分比，只有分项验收比例不补合格标准',()=>{
  const main=document([{text:'工程质量须达到合格标准。'}],'standard-only');
  const attachment=document([{text:'分项工程一次验收通过率99%。'}],'rate-only');
  const items=qualityItems(analyzeDocument(main,{attachments:[attachment]}));
  assert.equal(items.length,2);
  const standard=items.find(item=>item.references[0].documentId==='standard-only');
  const rate=items.find(item=>item.references[0].documentId==='rate-only');
  assert.equal(standard.fields['质量标准'],'合格');
  assert.equal(standard.fields['一次验收通过率数值'],undefined);
  assert.equal(rate.fields['质量标准'],undefined);
  assert.equal(rate.fields['一次验收通过率数值'],99);
  assert.ok(items.every(item=>new Set(item.references.map(ref=>ref.documentId)).size===1));
});

test('明确不适用的质量条款保留免除，不生成履约保证或硬门槛',()=>{
  const input=document([{text:'采购包2：本包不适用“工程质量达到合格标准、分项工程一次验收通过率100%”要求。'}]);
  const items=qualityItems(analyzeDocument(input));
  assert.equal(items.length,1);
  assert.equal(items[0].applicability,'not-required');
  assert.equal(items[0].hard,false);
  assert.match(items[0].interpretation,/不适用|免除/);
  assert.doesNotMatch(items[0].interpretation,/必须达到|须达到|应达到|履约保证/);
});

test('投标提交既往质量材料属于响应阶段，不冒充本项目履约结果',()=>{
  const input=document([{section:'响应文件材料要求',text:'投标人须在响应文件中提交既往工程质量达到合格标准、所有分项工程一次验收通过率99%的验收报告扫描件。'}]);
  const [item]=qualityItems(analyzeDocument(input));
  assert.ok(item);
  assert.equal(item.stage,'投标准备与资格审查');
  assert.equal(item.scope.phase,'response');
  assert.equal(item.fields['质量条款用途'],'投标提交材料');
  assert.ok(item.fields['证明材料'].includes('验收报告扫描件'));
  assert.match(item.interpretation,/既往|投标提交/);
  assert.doesNotMatch(item.interpretation,/本项目(?:须|应|必须).*99%|履约验收要求为/);
  assert.equal(item.hard,false);
});

test('免交质量材料不变成质量不适用或必须履约承诺',()=>{
  const input=document([{text:'投标人无需提交“工程质量达到合格标准、分项工程一次验收通过率99%”的验收报告扫描件。'}]);
  const [item]=qualityItems(analyzeDocument(input));
  assert.ok(item);
  assert.equal(item.applicability,'not-required');
  assert.equal(item.scope.phase,'response');
  assert.equal(item.fields['质量条款用途'],'投标提交材料');
  assert.match(item.interpretation,/免交|无需提交/);
  assert.doesNotMatch(item.interpretation,/本项目质量不适用|必须提交|履约验收要求为/);
});

test('不同主体的质量条款独立保留，不拼接主体与比例',()=>{
  const input=document([
    {text:'施工单位甲工程质量达到合格标准。'},
    {text:'施工单位乙所有分项工程一次验收通过率不低于97%。'}
  ]);
  const items=qualityItems(analyzeDocument(input));
  assert.equal(items.length,2);
  assert.equal(items.find(item=>item.subject==='施工单位甲')?.fields['一次验收通过率数值'],undefined);
  const second=items.find(item=>item.subject==='施工单位乙');
  assert.ok(second);
  assert.equal(second.fields['质量标准'],undefined);
  assert.equal(second.fields['一次验收通过率数值'],97);
  assert.ok(items.every(item=>item.references.length===1));
});

test('同段不同公司主体不把一方合格标准与另一方比例拼为共同目标',()=>{
  const input=document([{text:'甲建设有限公司工程质量达到合格标准；乙建设有限公司所有分项工程一次验收通过率97%。'}]);
  const items=qualityItems(analyzeDocument(input));
  assert.equal(items.length,2);
  const first=items.find(item=>item.subject==='甲建设有限公司'),second=items.find(item=>item.subject==='乙建设有限公司');
  assert.ok(first&&second);
  assert.equal(first.fields['一次验收通过率数值'],undefined);
  assert.equal(second.fields['质量标准'],undefined);
  assert.equal(second.fields['一次验收通过率数值'],97);
  assertLiteralReferences(items,[input]);
});

test('同段材料免交仅作用于提交事项，另一条履约质量目标仍独立保留',()=>{
  const input=document([{text:'投标人无需提交既往工程质量达到合格标准、所有分项工程一次验收通过率99%的验收报告扫描件；供应商工程质量达到合格标准，所有分项工程一次验收通过率98%。'}]);
  const items=qualityItems(analyzeDocument(input));
  assert.equal(items.length,2);
  const waived=items.find(item=>item.scope.phase==='response'),required=items.find(item=>item.scope.phase==='fulfillment');
  assert.equal(waived?.applicability,'not-required');
  assert.equal(waived?.fields['一次验收通过率数值'],99);
  assert.equal(required?.applicability,'required');
  assert.equal(required?.fields['一次验收通过率数值'],98);
  assertLiteralReferences(items,[input]);
});

test('不同采购包与来源的完整质量条款不合并或互相覆盖',()=>{
  const main=document([
    {text:'采购包1：供应商工程质量达到合格标准，所有分项工程一次验收通过率99%。'},
    {text:'采购包2：供应商工程质量达到合格标准，所有分项工程一次验收通过率96%。'}
  ],'quality-main');
  const attachment=document([{text:'采购包1：供应商工程质量达到合格标准，所有分项工程一次验收通过率98%。'}],'quality-other-source');
  const items=qualityItems(analyzeDocument(main,{attachments:[attachment]}));
  assert.equal(items.length,3);
  assert.deepEqual(items.map(item=>[item.scope.documentId,item.scope.package,item.fields['一次验收通过率数值']]),[
    ['quality-main','1',99],['quality-main','2',96],['quality-other-source','1',98]
  ]);
  assert.ok(items.every(item=>item.references.length===1));
  assertLiteralReferences(items,[main,attachment]);
});

test('目录与评分质量示例不生成额外履约质量事项或改变评分',()=>{
  const cells=['技术评审','质量方案','方案保证工程质量合格及所有分项工程一次验收通过率99%，完整得6分。','6','主观','质量方案'];
  const input=document([
    {role:'toc',text:'工程质量达到合格标准，所有分项工程一次验收通过率100% …… 12'},
    {kind:'table',tableId:'score-only',tableHeaders:['评审因素分类','评审内容','具体标准和要求','分值','客观/主观','关联投标文件'],tableRows:[{cells,text:cells.join(' | ')}],text:cells.join(' | ')}
  ]);
  const report=analyzeDocument(input);
  assert.equal(qualityItems(report).length,0);
  assert.equal(report.analysis.scoring.total,6);
  assert.equal(report.analysis.scoring.items.length,1);
});

test('本项目质量基准独立成项且只引用P15质量行，现有评分不变',()=>{
  const input=JSON.parse(readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url)));
  const original=JSON.stringify(input),report=analyzeDocument(input),items=qualityItems(report);
  assert.equal(items.length,1);
  const [item]=items;
  assert.equal(item.fields['质量标准'],'合格');
  assert.equal(item.fields['一次验收通过率数值'],100);
  assert.equal(item.fields['验收范围'],'所有分项工程');
  assert.equal(item.stage,'履约验收');
  assert.match(item.interpretation,/合格/);
  assert.match(item.interpretation,/100%/);
  assert.equal(item.references.length,1);
  assert.equal(item.references[0].blockId,'roof-v2:b283');
  assert.equal(item.references[0].page,15);
  assert.doesNotMatch(item.references[0].quote,/安全要求|技术及施|保险/);
  assert.equal(report.analysis.scoring.total,100);
  assert.equal(report.analysis.scoring.items.length,13);
  assert.deepEqual(report.analysis.scoring.groups.map(group=>[group.name,group.maxScore]),[['技术',82],['商务',8],['价格',10]]);
  assert.equal(JSON.stringify(input),original);
  assertLiteralReferences(items,[input]);
});

test('未复核AI额外社保证明不污染technical或派生，原始候选保留',()=>{
  const input=document([{text:'供应商施工期间须具备履行合同所必需的施工能力。'}]);
  const block=input.blocks[0],candidate={id:'ai-extra-proof',source:'ai',reviewed:false,categoryId:'personnel',title:'额外人员证明',quote:block.text,interpretation:'施工期间必须提交本单位社保证明。',stage:'合同履约',hard:true,fields:{'证明材料':['本单位社保证明']},actions:['提交本单位社保证明。'],references:[{documentId:input.id,blockId:block.id,fileName:input.fileName,page:1,section:block.section,quote:block.text}]};
  const report={documentId:input.id,categories:[{id:'personnel',items:[candidate]}],warnings:[]};
  const analysis=documentAnalysis(report,analysisUnits(input));
  assert.ok(!JSON.stringify([...analysis.technical,...analysis.businessRequirements,...analysis.keyRequirements]).includes('本单位社保证明'));
  assert.equal(report.categories[0].items[0],candidate);
  const reviewed=documentAnalysis({...report,categories:[{id:'personnel',items:[{...candidate,reviewed:true}]}]},analysisUnits(input));
  assert.ok(JSON.stringify(reviewed.technical).includes('本单位社保证明'),'已人工核验候选仍走现有分析路径');
});
