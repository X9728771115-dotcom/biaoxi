import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {companyImportFeedbackHTML} from '../public/import-feedback.js';
import {companyLibraryHTML} from '../public/company-view.js';

test('导入结果简短中文汇总，重复OCR和英文技术警告折叠，技术原文安全转义',()=>{
 const warnings=Array.from({length:39},(_,i)=>({code:'OCR_USED',message:`正文 / 插图${i}使用离线 OCR，置信度 77%：核对原件。`}));
 warnings.push({message:"Unrecognised paragraph style: 'Body Text 2'"},{message:'An unrecognised element was ignored: w:bliprEx'},{message:'<img src=x onerror=alert(1)>'});
 const $=load(companyImportFeedbackHTML({importSummary:{added:3,pending:3},warnings}));
 assert.match($('.import-feedback-summary').text(),/已录入 3 条/);
 assert.ok($('.import-feedback-summary').text().length<120);
 assert.doesNotMatch($('.import-feedback-summary').text(),/OCR|Unrecognised|w:blip/);
 assert.equal($('.import-feedback-details > ul > li').length,3);
 assert.equal($('.import-technical-log').length,1);
 assert.equal($('img').length,0);
 assert.equal($('details[open]').length,0);
});

test('企业资料缺失字段和冲突字段都显示中文标签',()=>{
 const record={id:'r1',type:'entity',name:'待核验营业执照',fields:{},documentIds:[],recognition:{status:'pending',missingFields:['creditCode','legalRepresentative'],conflicts:[{field:'registeredName',existingValue:'甲',incomingValue:'乙',sources:[]}]}};
 const $=load(companyLibraryHTML({id:'c1',name:'企业',records:[record]},'entity'));
 assert.match($.text(),/统一社会信用代码/);
 assert.match($.text(),/法定代表人/);
 assert.doesNotMatch($.text(),/creditCode|legalRepresentative|registeredName/);
});

test('多项资质列表保留简短摘要，编辑页仍含完整资质类别',()=>{
 const category=Array.from({length:20},(_,i)=>`第${i+1}类施工总承包二级`).join('；');
 const company={id:'c1',name:'测试企业',records:[{id:'r1',type:'qualification',name:'建筑业企业资质证书',fields:{category,certificateNumber:'D123'},documentIds:[]}]};
 const $=load(companyLibraryHTML(company,'qualification'));
 assert.ok($('.company-record-table small').first().text().length<140);
});
