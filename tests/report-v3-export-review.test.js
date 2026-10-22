import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import mammoth from 'mammoth';
import {analyzeDocument} from '../src/core/analyzer.js';
import {createDuplicateManagerFixture} from './helpers/public-report-fixtures.js';
import {buildReportSections,exportReport} from '../src/server/export.js';

const formatRule='响应文件pdf格式与word格式内容不一致时，以pdf格式内容为准。';
const feedbackRule='供应商应按磋商小组要求先澄清，再于指定期限内书面反馈，保留可补正事项的补正机会。';
const finding=(id,body,options={})=>({id,title:id,interpretation:body,quote:body,hard:false,fields:{},actions:[],references:[{documentId:'export-review',fileName:'导出审阅.txt',blockId:id,page:1,section:'响应文件格式',quote:body}],...options});
const report=(categories,outputs={})=>({documentId:'export-review',fileName:'导出审阅.txt',createdAt:'2026-10-13T00:00:00Z',categories,analysis:{clarifications:[]},outputs:{risks:[],scoreItems:[],commitments:[],conclusion:{label:'待核验',reasons:[],conditions:[]},...outputs},coverage:{},warnings:[]});
const detailTables=sections=>sections.find(section=>section.title==='14类详细分析').blocks.filter(block=>block.kind==='table');
const detailRow=(sections,title)=>detailTables(sections).flatMap(table=>table.rows).find(row=>row[0]===title);
const proceduralReport=()=>{
 const hard=finding('报价上限','供应商报价不得超过最高限价，否则响应无效。',{hard:true});
 const procedure=finding('澄清反馈程序',feedbackRule);
 return report([{id:'consistency',items:[finding('响应格式适用顺序',formatRule)]},{id:'rejection',items:[hard,procedure]}],{risks:[hard]});
};

test('未生成澄清缺口的一致性实际条款进入默认共享导出表',()=>{
 const r=analyzeDocument({id:'format-review',fileName:'响应格式.txt',complete:true,warnings:[],blocks:[{id:'format-review-1',text:formatRule,page:1,section:'响应文件格式'}]});
 assert.equal(r.analysis.clarifications.length,0);
 assert.ok(r.presentation.categories.find(category=>category.id==='consistency').items.some(item=>item.interpretation.includes('以pdf格式内容为准')));
 assert.ok(detailTables(buildReportSections(r)).some(table=>table.rows.some(row=>row[1].includes('以pdf格式内容为准'))),'真实格式优先条款应有默认表格正文');
});

test('非hard澄清反馈程序保留正文，仅已完整输出的具体红线跳转',()=>{
 const sections=buildReportSections(proceduralReport());
 assert.match(detailRow(sections,'澄清反馈程序')?.[1]||'',/先澄清.*指定期限内书面反馈.*补正机会/);
 assert.match(detailRow(sections,'报价唯一与预算限价')?.[1]||'',/详见废标项清单/);
 assert.ok(!sections.some(section=>section.title==='原文证据'),'默认报告保持精炼，不靠raw附录恢复漏项');
});

test('相同解读下独立证明材料不得被其他清单中的材料误覆盖',()=>{
 const body='供应商须提交有效证明材料供核验。';
 const first=finding('材料一',body,{materials:['营业执照原件']});
 const second=finding('材料二',body,{materials:['资质证书原件']});
 const sections=buildReportSections(report([{id:'qualification',items:[second]}],{risks:[first]}));
 const row=detailRow(sections,'材料二');
 assert.match(row?.[1]||'',/资质证书原件/);
 assert.doesNotMatch(row[1],/详见废标项清单/);
});

test('相同解读下另一采购包事项不得误跳转至第一包清单',()=>{
 const body='供应商须按本采购包要求先澄清，再书面反馈。';
 const first=finding('包一程序',body,{scope:{documentId:'export-review',package:'1',phase:'response'}});
 const second=finding('包二程序',body,{scope:{documentId:'export-review',package:'2',phase:'response'}});
 const sections=buildReportSections(report([{id:'consistency',items:[second]}],{risks:[first]}));
 assert.match(detailRow(sections,'包二程序')?.[1]||'',/本采购包要求先澄清.*书面反馈/);
 assert.doesNotMatch(detailRow(sections,'包二程序')[1],/详见废标项清单/);
});

test('AI同引文与相同解读仍保留独立候选正文',()=>{
 const local=finding('本地格式适用顺序',formatRule),r=report([{id:'consistency',items:[local]}]);
 r.synthesis={items:[{...local,id:'ai-format-1',title:'AI格式适用顺序',source:'ai'}]};
 const rows=buildReportSections(r).find(section=>section.title==='AI辅助综合解读待复核').blocks.find(block=>block.kind==='table').rows;
 assert.match(rows[0][1],/AI候选解读.*待核验/);
 assert.match(rows[0][1],/以pdf格式内容为准/);
 assert.doesNotMatch(rows[0][1],/详见/);
});

test('评分表已完整呈现的同一标准及材料仍逐事项跳转',()=>{
 const item=finding('评分证明','提交有效环境认证证书可得2分。',{fields:{'满分':'2'},materials:['有效环境认证证书']});
 const sections=buildReportSections(report([{id:'qualification',items:[item]}],{scoreItems:[item]}));
 assert.match(detailRow(sections,'评分证明')?.[1]||'',/详见必须加分项评分表/);
});

test('评分表仅呈现不同standard时不得跳过类别里的独立要求正文',()=>{
 const item=finding('认证证明细节','证书须覆盖本次响应产品型号，并在递交截止日有效。',{fields:{'满分':'2'},standard:'提供有效环境认证证书可得2分。'});
 const sections=buildReportSections(report([{id:'qualification',items:[item]}],{scoreItems:[item]}));
 assert.match(detailRow(sections,'认证证明细节')?.[1]||'',/覆盖本次响应产品型号.*递交截止日有效/);
 assert.doesNotMatch(detailRow(sections,'认证证明细节')[1],/详见必须加分项评分表/);
});

test('评分类别有满分字段也保留主评分表未完整呈现的具体要求',()=>{
 const item=finding('评分认证适用型号','认证证书须覆盖本次响应产品型号。',{fields:{'满分':'2'},standard:'提供有效环境认证证书可得2分。'});
 const sections=buildReportSections(report([{id:'scoring',items:[item]}],{scoreItems:[item]}));
 assert.match(detailRow(sections,'评分认证适用型号')?.[1]||'',/证书须覆盖本次响应产品型号/);
});

for(const format of ['docx','pdf'])test(`默认${format}真实文件保留格式优先顺序与非hard反馈程序`,async()=>{
 const buffer=await exportReport(proceduralReport(),format);
 let output='';
 if(format==='docx'){
  output=(await mammoth.extractRawText({buffer})).value;
  const dir=mkdtempSync(join(tmpdir(),'export-review-'));
  try{
   const file=join(dir,'report.docx');writeFileSync(file,buffer);
   const xml=execFileSync('unzip',['-p',file,'word/document.xml'],{encoding:'utf8',maxBuffer:3000000});
   assert.match(xml,/<w:tbl>/);assert.match(xml,/<w:tblHeader/);
   assert.match(xml,/<w:sz w:val="22"/);assert.match(xml,/<w:sz w:val="20"/);
  }finally{rmSync(dir,{recursive:true,force:true});}
 }else{
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
  try{const doc=await task.promise;for(let page=1;page<=doc.numPages;page++)output+=(await(await doc.getPage(page)).getTextContent()).items.map(item=>item.str).join('');}finally{await task.destroy();}
 }
 for(const clause of ['以pdf格式内容为准','先澄清','指定期限内书面反馈','补正机会'])assert.ok(output.replace(/\s+/g,'').includes(clause),`${format}遗漏${clause}`);
 assert.ok(!output.includes('原文证据'),'默认报告不回退到全文证据附录');
});

test('合成Word短出处行不拆页 长行可跨页 工程数量列容纳原数量单位',async()=>{
 const actual=analyzeDocument(createDuplicateManagerFixture()),sections=buildReportSections(actual),quantity=sections.find(s=>s.title==='工程与履约资金风险').blocks.find(b=>b.kind==='table'&&b.headers[1]==='数量');assert.ok(quantity);assert.equal(quantity.widths[1],.14,'数量列应给小数与单位留足宽度');for(const original of ['30.24m2','73.02m3'])assert.ok(quantity.rows.some(row=>row[1]===original),'原数量单位不能改写 '+original);
 const buffer=await exportReport(actual,'docx'),dir=mkdtempSync(join(tmpdir(),'short-row-review-'));
 try{const file=join(dir,'report.docx');writeFileSync(file,buffer);const xml=execFileSync('unzip',['-p',file,'word/document.xml'],{encoding:'utf8',maxBuffer:5000000}),rows=xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g)||[],method=rows.find(row=>/<w:t[^>]*>评审方法<\/w:t>/.test(row));assert.ok(method);assert.match(method,/<w:cantSplit\b/,'短行出处不可孤立跨页');const long=rows.find(row=>row.includes('企业资质及项目经理全组资格')&&row.includes('本条完整条件一并核对'));assert.ok(long);assert.doesNotMatch(long,/<w:cantSplit\b/,'长条件行继续正常跨页');assert.match(xml,/<w:tblHeader/);assert.match(xml,/<w:sz w:val="22"/);assert.match(xml,/<w:sz w:val="20"/);assert.ok(rows.some(row=>row.includes('30.24m2')&&row.includes('<w:gridSpan')===false));}
 finally{rmSync(dir,{recursive:true,force:true});}
});

test('真实PDF表格短数字 小数及贴合单位原子换行 超宽数字保留逐字回退',async()=>{
 const r=report([]),tokens=['31','26','30.24m2','73.02m3','31.25mm','65%'],prefix='中'.repeat(32)+'.',longToken='1234567890'.repeat(15);
 r.analysis.overview=[...tokens,longToken].map((token,index)=>({label:'数字核对',value:prefix+token,references:(index===0?[1,2,12,31]:[1,2,12,26]).map(page=>({documentId:r.documentId,fileName:r.fileName,page}))}));
 const buffer=await exportReport(r,'pdf'),{getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
 try{
  const doc=await task.promise,items=[];
  for(let page=1;page<=doc.numPages;page++)items.push(...(await(await doc.getPage(page)).getTextContent()).items);
  const valueX=items.find(item=>item.str==='文件信息').transform[4],sourceX=items.find(item=>item.str==='出处').transform[4];
  const valueLines=items.filter(item=>Math.abs(item.transform[4]-valueX)<.01&&item.str!=='文件信息').map(item=>item.str),sourceLines=items.filter(item=>Math.abs(item.transform[4]-sourceX)<.01).map(item=>item.str);
  for(const token of tokens)assert.ok(valueLines.some(line=>line.includes(token)),`短数字及单位须同一文本行保留 ${token}`);
  assert.ok(sourceLines.some(line=>line.includes('31页')),'出处31页数字和单位不得拆开');
  assert.ok(sourceLines.some(line=>line.includes('26页')),'出处26页数字和单位不得拆开');
  assert.equal(valueLines.join(''),r.analysis.overview.map(item=>item.value).join(''),'换行不改写任何原字符串，超宽数字不丢失');
  assert.ok(!valueLines.some(line=>line.includes(longToken)),'超宽数字应逐字回退，不能超出表格列宽');
 }finally{await task.destroy();}
});
