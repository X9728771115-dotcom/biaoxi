import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/core/analyzer.js';
import * as webChat from '../src/server/web-chat.js';

function fixture(){
 const extraction={id:'tender-selected',fileName:'本次采购.txt',complete:true,blocks:[{id:'requirement',page:1,text:'供应商须提供有效营业执照，具备建筑工程施工总承包三级及以上资质。否则响应无效。'}]};
 const record=(id,type,documentId)=>({id,type,name:id,verified:false,documentIds:[documentId],fields:type==='entity'?{evidence:[{kind:'license',documentId,verified:false}]}:type==='qualification'?{category:'建筑工程施工总承包二级'}:{},sources:[]});
 const companySnapshot={id:'selected-company',name:'本次测试企业',records:[record('license-record','entity','license-original'),record('qualification-record','qualification','qualification-original'),record('unrelated-contract','performance','unrelated-contract-original'),record('unrelated-product','product','unrelated-product-original')]};
 const report=analyzeDocument(extraction,{companySnapshot});report.id='selected-report';report.evidenceIds=[];report.attachmentIds=[];
 const original=(id,fileName)=>({id,fileName,role:'evidence',companyId:'selected-company',path:'/tmp/'+fileName,byteSize:10,extraction:{id,fileName,complete:true,blocks:[{id:id+'-b1',page:1,text:'企业对照原件；不能成为采购要求。'}]}});
 const documents=[{id:extraction.id,fileName:extraction.fileName,role:'tender',path:'/tmp/本次采购.txt',byteSize:100,extraction},original('license-original','营业执照.png'),original('qualification-original','资质证书.pdf'),original('unrelated-contract-original','其他合同.pdf'),original('unrelated-product-original','无关产品.pdf')];
 return {report,documents};
}
function selections(report){assert.equal(typeof webChat.webChatDocumentSelections,'function','the desktop and service must share the selected-document contract');return webChat.webChatDocumentSelections(report);}
const request=f=>webChat.createWebChatRequest({...f,provider:'doubao'});

test('only originals from this report matched snapshot records join the tender, not unrelated company library files',()=>{
 const f=fixture();
 assert.deepEqual(selections(f.report),[{id:'tender-selected',role:'tender'},{id:'license-original',role:'evidence',companyId:'selected-company'},{id:'qualification-original',role:'evidence',companyId:'selected-company'}]);
 assert.deepEqual(request(f).files.map(file=>file.documentId),['tender-selected','license-original','qualification-original']);
 assert.ok(!request(f).prompt.includes('其他合同.pdf'));assert.ok(!request(f).prompt.includes('无关产品.pdf'));
});

test('an already selected evidence original is listed only once and still enforces snapshot ownership',()=>{
 const f=fixture();f.report.evidenceIds=['license-original','license-original'];
 assert.deepEqual(request(f).files.map(file=>file.documentId),['tender-selected','license-original','qualification-original']);
 assert.equal(selections(f.report).find(row=>row.id==='license-original').companyId,'selected-company');
 f.documents.find(doc=>doc.id==='license-original').companyId='different-company';
 assert.throws(()=>request(f),/企业|归属/);
});

test('matched originals must be evidence owned by the exact snapshot company',()=>{
 for(const change of [{companyId:'different-company'},{companyId:undefined},{role:'tender'}]){
  const f=fixture();Object.assign(f.documents.find(doc=>doc.id==='qualification-original'),change);
  assert.throws(()=>request(f),/企业|归属|用途/);
 }
});

test('matched record IDs resolve against the snapshot and cannot smuggle original IDs through match clones',()=>{
 const f=fixture(),match=f.report.companyAnalysis.matches.find(row=>row.records.some(record=>record.id==='license-record'));
 match.records.find(record=>record.id==='license-record').documentIds=['unrelated-product-original'];
 assert.ok(request(f).files.some(file=>file.documentId==='license-original'));assert.ok(!request(f).files.some(file=>file.documentId==='unrelated-product-original'));
 match.records.push({id:'unknown-record',documentIds:['unrelated-product-original']});
 assert.throws(()=>request(f),/快照|记录/);
});

test('a qualification group without an applicable report requirement cannot upload all records in that class',()=>{
 const f=fixture();f.report.companyAnalysis.matches=[];
 f.report.companyAnalysis.qualification.groups=[{id:'performance',required:false,requirements:[],recordIds:['unrelated-contract']}];
 assert.deepEqual(selections(f.report),[{id:'tender-selected',role:'tender'}]);
 f.report.companyAnalysis.qualification.groups[0]={id:'performance',required:true,requirements:[{findingId:'not-in-this-report'}],recordIds:['unrelated-contract']};
 assert.deepEqual(selections(f.report),[{id:'tender-selected',role:'tender'}]);
});

test('not-applicable and excluded matches do not select originals merely because the snapshot contains them',()=>{
 const f=fixture();
 for(const match of f.report.companyAnalysis.matches)match.status='not-applicable';
 assert.deepEqual(selections(f.report),[{id:'tender-selected',role:'tender'}]);
 for(const match of f.report.companyAnalysis.matches){match.status='candidate';for(const record of match.records)record.status='excluded';}
 assert.deepEqual(selections(f.report),[{id:'tender-selected',role:'tender'}]);
});

function actualSelection(text,records){
 const extraction={id:'strict-tender',fileName:'严格范围测试.txt',complete:true,blocks:[{id:'strict-requirement',page:1,text}]};
 const report=analyzeDocument(extraction,{companySnapshot:{id:'strict-company',name:'范围测试企业',records:records.map(record=>({verified:false,sources:[],documentIds:[record.id+'-original'],...record}))}});
 report.id='strict-report';report.evidenceIds=[];report.attachmentIds=[];
 return selections(report).map(item=>item.id);
}

test('actual analyzer construction requirement does not authorize ISO safety other-specialty or unknown qualification originals',()=>{
 const records=[
  {id:'construction',type:'qualification',name:'建筑业企业资质证书',fields:{category:'建筑工程施工总承包二级'}},
  {id:'iso',type:'qualification',name:'ISO9001认证证书',fields:{category:'ISO9001质量管理体系认证'}},
  {id:'iso-environment',type:'qualification',name:'ISO14001认证证书',fields:{category:'ISO14001环境管理体系认证'}},
  {id:'safety',type:'qualification',name:'安全生产许可证',fields:{category:'安全生产许可证'}},
  {id:'wrong-specialty',type:'qualification',name:'建筑业企业资质证书',fields:{category:'市政公用工程施工总承包二级'}},
  {id:'unknown',type:'qualification',name:'待核资料',fields:{}},
 ];
 assert.deepEqual(actualSelection('供应商须具备建筑工程施工总承包三级及以上资质，否则响应无效。',records),['strict-tender','construction-original']);
 assert.deepEqual(actualSelection('供应商须具有有效的安全生产许可证，否则响应无效。',records),['strict-tender','safety-original']);
 assert.deepEqual(actualSelection('供应商须提供ISO9001认证证书。',records),['strict-tender','iso-original']);
 assert.deepEqual(actualSelection('供应商须提供ISO90010认证证书。',records),['strict-tender']);
 assert.deepEqual(actualSelection('供应商须具备建筑工程施工总承包三级及以上资质；不要求安全生产许可证或ISO9001认证证书。',records),['strict-tender','construction-original']);
});

test('actual analyzer personnel requirement only authorizes the stated role and specialty',()=>{
 const records=[
  {id:'manager-building',type:'personnel',name:'测试经理甲',fields:{role:'项目经理',specialty:'建筑工程',grade:'二级'}},
  {id:'manager-city',type:'personnel',name:'测试经理乙',fields:{role:'项目经理',specialty:'市政公用工程',grade:'二级'}},
  {id:'technician',type:'personnel',name:'测试人员丙',fields:{role:'技术负责人',specialty:'建筑工程',grade:'二级'}},
  {id:'unknown-person',type:'personnel',name:'测试人员丁',fields:{}},
 ];
 assert.deepEqual(actualSelection('拟派项目经理须具备二级及以上注册建造师证书（建筑工程专业）。',records),['strict-tender','manager-building-original']);
 assert.deepEqual(actualSelection('拟派项目经理须具备建筑工程二级及以上注册建造师资格。',records),['strict-tender','manager-building-original']);
});

test('unknown automatic candidates remain available only through explicit current evidence selection',()=>{
 const f=fixture();f.report.companySnapshot.records.find(record=>record.id==='qualification-record').fields={};
 assert.ok(!request(f).files.some(file=>file.documentId==='qualification-original'));
 f.report.evidenceIds=['qualification-original'];assert.ok(request(f).files.some(file=>file.documentId==='qualification-original'));
});

test('a stale company-analysis identity and a match of the wrong snapshot record type fail closed',()=>{
 const f=fixture();f.report.companyAnalysis.companyId='different-company';assert.throws(()=>request(f),/企业|快照/);
 const g=fixture(),match=g.report.companyAnalysis.matches.find(row=>row.type==='entity');
 match.records=[{id:'unrelated-product'}];assert.throws(()=>request(g),/类型|记录|快照/);
});

test('the explicitly selected supplement cannot belong to another company',()=>{
 const f=fixture();f.report.evidenceIds=['unrelated-product-original'];f.documents.find(doc=>doc.id==='unrelated-product-original').companyId='different-company';
 assert.throws(()=>request(f),/企业|归属/);
});
