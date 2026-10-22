import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import * as ui from '../public/app.js';
import {validateProjectContext} from '../src/core/project-context.js';
const feature=name=>{assert.equal(typeof ui[name],'function',`缺少AI入口行为 ${name}`);return ui[name];};

test('未启用、无密钥、无模型分别列明配置缺项',()=>{
  const readiness=feature('apiAnalysisReadiness');
  assert.deepEqual(readiness({enabled:false,hasKey:false,model:''}),{ready:false,missing:['启用 API 联网分析','API 密钥','模型或接入点'],focusId:'ai-enabled'});
  assert.deepEqual(readiness({enabled:true,hasKey:false,model:'test-model'}),{ready:false,missing:['API 密钥'],focusId:'ai-key'});
  assert.equal(readiness({enabled:true,hasKey:true,model:'   '}).ready,false);
  assert.equal(readiness({enabled:true,hasKey:true,model:'test-model'}).ready,true);
});

test('报告AI重分析只使用该报告的主文件、附件、证照和原企业，不取上传区或默认企业',()=>{
  const body=feature('reportOnlineAnalysisBody');
  const report={id:'report-a',documentId:'doc-a',attachmentIds:['attachment-a'],evidenceIds:['evidence-a'],companyAnalysis:{companyId:'company-a'}};
  const before=structuredClone(report),result=body(report);
  assert.deepEqual(result,{documentIds:['doc-a'],attachmentIds:['attachment-a'],evidenceIds:['evidence-a'],companyId:'company-a',mode:'online'});
  result.attachmentIds.push('mutated');assert.deepEqual(report,before);
  assert.deepEqual(body({documentId:'doc-b',companyAnalysis:{companyId:null},companySnapshot:{id:'stale-company'}}),{documentIds:['doc-b'],attachmentIds:[],evidenceIds:[],mode:'online'});
  assert.deepEqual(body({documentId:'doc-c'}),{documentIds:['doc-c'],attachmentIds:[],evidenceIds:[],mode:'online'});
  assert.throws(()=>body({}),/报告/);
});

test('报告AI重分析保留七项明确人工项目条件，过滤derived元数据并通过后端schema',()=>{
  const body=feature('reportOnlineAnalysisBody');
  const manual={governmentProcurement:false,projectDate:'2026-10-20',region:'成都市',province:'四川省',projectType:'办公楼',buildingStructure:'框架结构',localImplementationConfirmed:false};
  const report={documentId:'doc-context',companyAnalysis:{companyId:null},projectContext:{...manual,provenance:Object.fromEntries(Object.entries(manual).map(([key,value])=>[key,[{kind:'manual',value,quote:'分析前人工提供的项目适用条件'}]])),gaps:[],conflictFields:[],derivedTag:'不可提交'}};
  const before=structuredClone(report),result=body(report);
  assert.deepEqual(result.projectContext,manual);
  assert.deepEqual(validateProjectContext(result.projectContext),manual);
  assert.equal('companyId' in result,false);assert.deepEqual(report,before);
});

test('报告原文推断条件不自动提升为人工确认，陈旧或无值manual来源不能覆盖当前条件',()=>{
  const report={documentId:'doc-derived',projectContext:{governmentProcurement:false,province:'四川省',region:'成都市',projectDate:'2026-10-20',projectType:'办公楼',localImplementationConfirmed:true,provenance:{
    governmentProcurement:[{kind:'manual',value:false}],province:[{documentId:'doc-derived',quote:'项目所在省份：四川省'}],region:[{kind:'manual',value:'泸州市'}],projectDate:[{kind:'manual'}],projectType:[{kind:'manual',value:'办公楼'}],localImplementationConfirmed:[{kind:'derived',value:true}]
  },confirmed:true,gaps:['待核验']}};
  const before=structuredClone(report),result=ui.reportOnlineAnalysisBody(report);
  assert.deepEqual(result.projectContext,{governmentProcurement:false,projectType:'办公楼'});
  assert.deepEqual(report,before);
  assert.equal('projectContext' in ui.reportOnlineAnalysisBody({documentId:'doc-empty',projectContext:{province:'四川省',provenance:{province:[{documentId:'doc-empty'}]}}}),false);
});

test('配置不足直接导航设置，不向分析接口发送任何文件',async()=>{
  const request=feature('requestOnlineAnalysis'),seen=[];let location='report',notice;
  const api={request:async(path,options)=>{seen.push({path,options});return {enabled:false,hasKey:false,model:''};}};
  const result=await request(api,{documentIds:['sensitive-document'],mode:'online'},{openSettings:readiness=>{location='settings';notice=readiness.missing;}});
  assert.equal(result.action,'settings');assert.equal(location,'settings');
  assert.deepEqual(notice,['启用 API 联网分析','API 密钥','模型或接入点']);
  assert.deepEqual(seen,[{path:'/api/settings',options:undefined}]);
});

test('配置具备后才提交当前报告并取得正常轮询所需jobId，不传密钥',async()=>{
  const request=feature('requestOnlineAnalysis'),seen=[];
  const api={request:async(path,options)=>{seen.push({path,options});return path==='/api/settings'?{enabled:true,hasKey:true,model:'test-model'}:{jobId:'job-current'};}};
  const body=ui.reportOnlineAnalysisBody({documentId:'doc-current',companyAnalysis:{companyId:null}});
  const result=await request(api,body,{openSettings:()=>assert.fail('配置具备时不应跳转设置')});
  assert.equal(result.action,'submitted');assert.equal(result.jobId,'job-current');
  assert.deepEqual(seen[1],{path:'/api/analyses',options:{method:'POST',body:{documentIds:['doc-current'],attachmentIds:[],evidenceIds:[],mode:'online'}}});
  assert.equal(JSON.stringify(seen).includes('apiKey'),false);
});

test('报告有可点击的API深度分析入口，免费网页明确限定桌面，上传区可直接去配置',async()=>{
  const $=load(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
  assert.equal($('#analysis-view #report-ai-analysis').length,1);
  assert.ok($('#report-ai-analysis').text().includes('AI 深度分析'));
  assert.equal($('#report-ai-analysis').is('[disabled]'),false);
  assert.equal($('#report-ai-analysis').attr('aria-describedby'),'report-ai-status');
  assert.equal($('#report-ai-status[role="status"]').length,1);
  assert.ok($('#open-web-chat').text().includes('桌面版免费网页'));
  assert.equal($('#upload-view [data-configure-ai]').length,1);
  assert.equal($('#settings-view #ai-configuration-notice[role="status"]').length,1);
});
