import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/core/analyzer.js';
import {buildReportContent} from '../src/core/report-content.js';
import {buildReportSections} from '../src/server/export.js';

test('ordinary renovation with waste quantities does not inherit roof-specific scope or starred payment terms',()=>{
 const input={id:'renovation',fileName:'卫生间维修.txt',complete:true,warnings:[],blocks:[
  {id:'scope',documentId:'renovation',fileName:'卫生间维修.txt',page:null,section:'工程量清单',text:'工程量清单：卫生间地砖拆除 20 m2；建筑垃圾清运 3 m3。'},
  {id:'pay',documentId:'renovation',fileName:'卫生间维修.txt',page:null,section:'合同付款方式',text:'付款方式：收到合格增值税专用发票后30日内支付价款的97%，其余款项按合同约定。'}
 ]};
 const original=JSON.stringify(input),report=analyzeDocument(input),view=buildReportContent(report);
 const engineering=view.technical.find(item=>item.title==='工程范围 数量与关键施工约束');
 assert.ok(engineering,'keep the actual engineering review entry');
 for(const content of [engineering,view.commercialRisks,buildReportSections(report)])assert.doesNotMatch(JSON.stringify(content),/新瓦|利旧瓦|檐沟|天窗|植筋连接|防雷检测|四★付款/);
 assert.ok(engineering.references.some(ref=>ref.blockId==='scope'));
 assert.equal(view.categories.length,14);assert.equal(Object.keys(view.outputs).length,4);
 assert.equal(JSON.stringify(input),original);
});
