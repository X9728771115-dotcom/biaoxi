import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractSpreadsheet} from '../src/core/spreadsheet.js';
import {analyzeProcurementPolicy} from '../src/core/procurement-policy.js';

const asOf='2026-10-15';
for(const format of ['xlsx','xls'])test(`actual ${format} project-name goods table preserves products, sheet rows, original quotes and cached formulas`,async()=>{
 const fileName=`测试工程量与产品清单.${format}`,path=new URL(`./fixtures/policy-spreadsheet-v4/${fileName}`,import.meta.url);
 const bytes=fs.readFileSync(path),extraction=await extractSpreadsheet({id:'actual-goods-'+format,fileName,buffer:bytes});
 assert.equal(extraction.complete,true);assert.deepEqual(extraction.sheets.map(s=>s.name),['工程量与产品清单','评分表']);
 const block=extraction.blocks.find(b=>b.sheet==='工程量与产品清单'),before=JSON.stringify(extraction);
 assert.ok(block.tableHeaders.includes('项目名称'));assert.ok(!block.tableHeaders.includes('项目特征描述'));assert.ok(!block.tableHeaders.includes('项目编码'));
 const result=analyzeProcurementPolicy({documents:[extraction],asOf});assert.equal(result.summary.totalProducts,4);assert.equal(result.summary.pending,4);assert.equal(result.summary.met,0);
 assert.deepEqual(result.products.map(p=>[p.name,p.policyType,p.categoryCode,p.policyKind]),[['激光打印机','energy','A0201060102','requirement'],['激光打印机','environment','A0201060102','preference'],['自粘防水卷材','environment','A10030903','preference'],['雨水口','unknown',null,'preference']]);
 for(const p of result.products){assert.equal(p.status,'pending');assert.deepEqual(p.matchedRecordIds,[]);const row=block.tableRows.find(r=>r.row===p.sources[0].rowStart);assert.ok(row);assert.equal(p.sources[0].sheet,'工程量与产品清单');assert.equal(p.sources[0].quote,row.text);assert.equal(p.sources[0].page,null);assert.ok([3,4,5].includes(p.sources[0].rowStart));}
 assert.equal(result.products[0].model,'TEST-LP100');assert.equal(result.products[0].manufacturer,'演示制造有限公司（测试）');assert.equal(result.products[2].model,'TEST-WP3');assert.equal(result.products[3].name,'雨水口');
 const sum=extraction.sheets[0].cells.find(c=>c.address==='H3');assert.equal(sum.cachedValue,2400);assert.ok(sum.formula);assert.equal(JSON.stringify(extraction),before);
});

const table=(section,headers,cells)=>({id:'negative-table',extraction:{blocks:[{id:'negative-b',kind:'table',section,sheet:section,tableHeaders:headers,tableRows:[{row:3,rowStart:3,rowEnd:3,cells,text:cells.join(' | ')}]}]}});
for(const section of ['资格审查材料清单','评分表产品清单'])test(`project-name column never bypasses ${section} exclusion`,()=>{
 const r=analyzeProcurementPolicy({documents:[table(section,['项目名称','规格型号','制造商','单位','数量'],['激光打印机','TEST-LP100','演示制造有限公司（测试）','台','2'])],asOf});assert.equal(r.products.length,0);
});
test('project overview without product attributes does not establish inventory even under a material-list heading',()=>{
 const r=analyzeProcurementPolicy({documents:[table('材料清单',['项目名称','单位','工程量'],['项目概况','宗','1'])],asOf});assert.equal(r.products.length,0);
});
test('generic project overview is not a goods context despite product-looking columns',()=>{
 const r=analyzeProcurementPolicy({documents:[table('项目概况',['项目名称','规格型号','制造商','单位','数量'],['项目概况','TEST-LP100','演示制造有限公司（测试）','台','2'])],asOf});assert.equal(r.products.length,0);
});
