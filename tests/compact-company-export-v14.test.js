import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import mammoth from 'mammoth';
import {analyzeDocument} from '../src/core/analyzer.js';
import {buildReportSections,exportReport} from '../src/server/export.js';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url)));
const source={documentId:'roof-v2',blockId:'roof-v2:b370',fileName:fixture.fileName,page:29,quote:'供应商应核对拟派人员证明。'};
const candidate=index=>({id:`pending-person-${index}`,type:'personnel',name:`未选候选_${String(index).padStart(3,'0')}`,status:'candidate',verified:false,documentIds:[`person-proof-${index}`],fields:{specialty:'建筑工程',notes:`候选核对备注_${index}，证书类别不表示已经拟派。`,evidence:[{kind:'registration',documentId:`person-proof-${index}`,verified:false}]},sources:[{documentId:`person-proof-${index}`,fileName:`候选原件_${index}.pdf`}],missing:['企业条目尚未人工确认','缺拟派岗位','注册状态及无兼职情况仍待核验'],reasons:[],evidenceIds:[]});
const makeReport=()=>{
 const report=analyzeDocument(structuredClone(fixture)),people=Array.from({length:166},(_,index)=>candidate(index));
 const performance={id:'performance-record',type:'performance',name:'真实维修合同项目',status:'candidate',verified:false,documentIds:['actual-contract','actual-acceptance'],fields:{contractNumber:'HT-2025-008',contractDate:'2025-04-12',amount:320000,clientName:'合同所列采购人',evidence:[{kind:'contract',documentId:'actual-contract',verified:false},{kind:'acceptanceReport',documentId:'actual-acceptance',verified:true}]},sources:[{documentId:'actual-contract',fileName:'维修合同原件.pdf'},{documentId:'actual-acceptance',fileName:'验收报告原件.pdf'}],missing:['合同主体及盖章待核验'],reasons:[],evidenceIds:['actual-acceptance']};
 const company=structuredClone(report.companyAnalysis);company.companyId='selected-company';company.companyName='当前分析企业';
 company.qualification={status:'pending',groups:[['business-license','营业执照'],['construction-qualification','企业资质'],['safety-license','安全生产许可'],['personnel','人员'],['performance','业绩']].map(([id,label])=>({id,label,status:'pending',recordIds:id==='personnel'?people.map(record=>record.id):id==='performance'?[performance.id]:[],missing:['本类原件与采购要求待核验'],reasons:[]}))};
 company.matches=[{type:'personnel',references:[source],records:people},{type:'performance',references:[source],records:[performance]}];
 company.scoreRows=company.scoreRows.map(row=>({...row,records:row.title==='项目部人员配备'?people:row.title==='同类业绩'?[performance]:[],reasons:['评分依据必须保留'],missing:['评分证明缺口必须保留']}));
 report.companyAnalysis=company;return report;
};
const companySection=(report,options)=>buildReportSections(report,options).find(section=>section.title==='企业匹配与得分测算');

test('default company export summarizes pending candidates without dumping names while full review keeps every record',async()=>{
 const report=makeReport(),before=JSON.stringify(report),sections=buildReportSections(report),company=companySection(report),body=JSON.stringify(company);
 assert.match(body,/候选记录数/);assert.match(body,/166/);assert.match(body,/缺拟派岗位/);assert.match(body,/完整核查版/);assert.match(body,/资料库/);
 assert.doesNotMatch(body,/未选候选_000|未选候选_165|候选核对备注_0/);assert.doesNotMatch(body,/166人/);
 const overview=company.blocks.find(block=>block.kind==='table'&&block.headers.includes('候选记录数'));assert.equal(overview.rows.length,5);
 const scores=company.blocks.find(block=>block.kind==='table'&&block.headers[0]==='评分项');assert.equal(scores.rows.length,13);assert.ok(scores.rows.every(row=>row[2].includes('评分依据必须保留')&&row[2].includes('评分证明缺口必须保留')));
 const full=JSON.stringify(companySection(report,{includeRaw:true}));for(let index=0;index<166;index++){assert.ok(full.includes(candidate(index).name));assert.ok(full.includes(`候选核对备注_${index}`));}
 assert.equal(JSON.stringify(report),before);assert.equal(sections.find(section=>section.title==='14类详细分析').blocks.filter(block=>block.level===3).length,14);
 const text=(await mammoth.extractRawText({buffer:await exportReport(report,'docx')})).value;assert.ok(text.includes('166'));assert.ok(!text.includes('未选候选_165'));
});

test('supported, confirmed and reference-linked records remain specific in the compact report',()=>{
 const report=makeReport(),people=report.companyAnalysis.matches[0].records;
 people[0].status='supported';people[0].name='资料支持具体记录';
 people[1].verified=true;people[1].name='已确认具体记录';
 people[2].status='reference';people[2].name='人工参考具体记录';
 people[3].name='参考原件关联记录';
 const row=report.companyAnalysis.scoreRows.find(row=>row.title==='项目部人员配备');row.status='reference';row.referenceScore=7;row.evidenceIds=people[3].documentIds;
 const body=JSON.stringify(companySection(report));for(const name of people.slice(0,4).map(record=>record.name))assert.ok(body.includes(name),name);
 assert.ok(!body.includes('未选候选_165'));assert.ok(body.includes('注册证'));assert.ok(body.includes('待确认'));
});

test('actual performance summary and original proof types keep confirmation states in default export',()=>{
 const body=JSON.stringify(companySection(makeReport()));for(const text of ['真实维修合同项目','HT-2025-008','2025-04-12','320000','维修合同原件.pdf','验收报告原件.pdf','合同','验收报告','已确认','待确认','合同主体及盖章待核验'])assert.ok(body.includes(text),text);
});

for(const referenceScore of [1,0])test(`assumed-full row retains records linked by a valid ${referenceScore}-point manual reference without changing scoring`,()=>{
 const report=makeReport(),row=report.companyAnalysis.scoreRows.find(row=>row.title==='项目部人员配备'),record=row.records[0];
 row.status='assumed-full';row.calculationKind='assumed-full';row.referenceScore=referenceScore;row.evidenceIds=record.documentIds.slice(0,1);row.reasons.push('人工参考估计：已对照关联人员原件记录参考依据。');
 const before=JSON.stringify(report),body=JSON.stringify(companySection(report));
 assert.ok(body.includes(record.name),'有人工参考分及关联原件的具体记录必须可见');assert.ok(!body.includes('未选候选_165'));
 assert.ok(body.includes('已对照关联人员原件记录参考依据'));assert.equal(JSON.stringify(report),before);assert.equal(row.status,'assumed-full');assert.equal(row.referenceScore,referenceScore);
});
