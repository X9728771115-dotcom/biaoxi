import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeDocument} from '../src/core/analyzer.js';
import {buildReportSections} from '../src/server/export.js';

test('已核静态资料大量入库后，默认报告不展开所有候选人员，拟派和业绩保留完整明细',()=>{
 const extraction=JSON.parse(readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url)));
 const report=analyzeDocument(extraction),source={documentId:extraction.id,blockId:extraction.blocks[0].id,page:1,quote:'原文依据'};
 const people=Array.from({length:100},(_,i)=>({id:'p-'+i,type:'personnel',name:'已核候选'+i,verified:true,status:'candidate',fields:{subjectName:'人员'+i,notes:'细节不能在默认版重复展开_'+i,evidence:[{kind:'registration',documentId:'doc-'+i,verified:true}],...(i===99?{role:'项目经理（本项目拟派，用户确认）'}:{})},documentIds:['doc-'+i],sources:[],missing:['拟派关系待核'],reasons:[],evidenceIds:['doc-'+i]}));
 const performance={id:'perf',type:'performance',name:'合同与验收已核的屋面业绩',verified:true,status:'candidate',fields:{projectType:'屋面防水',notes:'完整业绩说明不得省略',evidence:[]},documentIds:[],sources:[],missing:['响应文件盖章待落实'],reasons:[],evidenceIds:[]};
 const audit={id:'audit',type:'qualification',name:'2025财审',verified:true,status:'candidate',fields:{notes:'2025历史财审不代表2026可用资金',evidence:[{kind:'auditReport',documentId:'audit-doc',verified:true}]},documentIds:['audit-doc'],sources:[],missing:[],reasons:[],evidenceIds:['audit-doc']};
 report.companyAnalysis={...report.companyAnalysis,companyId:'company',companyName:'当前企业',matches:[{type:'personnel',references:[source],records:people},{type:'performance',references:[source],records:[performance]},{type:'qualification',references:[source],records:[audit]}],scoreRows:[]};
 const original=structuredClone(report),section=buildReportSections(report).find(s=>s.title==='企业匹配与得分测算');
 const detail=section.blocks.find(b=>b.kind==='table'&&b.headers[0]==='企业记录');
 assert.ok(detail.rows.length<=12,detail.rows.length);assert.match(JSON.stringify(detail),/已核候选99/);assert.match(JSON.stringify(detail),/完整业绩说明不得省略/);
 assert.match(JSON.stringify(detail),/2025历史财审不代表2026可用资金/);
 const text=JSON.stringify(section);assert.match(text,/候选.*汇总|汇总.*候选/);assert.match(text,/完整核查版/);assert.ok(text.includes('已核候选50'));assert.ok(!text.includes('细节不能在默认版重复展开_50'));
 const full=JSON.stringify(buildReportSections(report,{includeRaw:true}));for(let i=0;i<100;i++)assert.ok(full.includes('细节不能在默认版重复展开_'+i));assert.deepEqual(report,original);
});
