import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/core/analyzer.js';import {buildReportSections} from '../src/server/export.js';
test('lowest-price report export keeps four outputs while explaining qualification and final-price assessment without score assumptions',()=>{
 const document={id:'price-doc',fileName:'匿名最低价.doc',complete:true,warnings:[],blocks:[{id:'price-doc:b1',text:'本项目采用经评审的最低投标价法，通过资格评审后进行二次报价（最终报价）。',section:'竞标人须知',page:null}]};
 for(const companySnapshot of [null,{id:'company',name:'测试企业',records:[]}]){
  const report=analyzeDocument(document,{companySnapshot}),sections=buildReportSections(report),text=JSON.stringify(sections);
  for(const name of ['废标项清单','必须加分项','必须承诺内容','投标可行性结论'])assert.ok(sections.some(s=>s.title===name));
  assert.match(text,/得分预测不适用/);assert.doesNotMatch(text,/技术满分假设|清单满分假设|报价满分假设|测算总分待核验|商务满分待核验/);
  assert.match(text,/资格|实质性/);assert.match(text,/最终报价|二次报价/);
 }
});
