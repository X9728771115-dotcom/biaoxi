import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import * as ui from '../public/app.js';
import * as view from '../public/analysis-view.js';
const feature=name=>{assert.equal(typeof ui[name],'function',`缺少企业界面行为 ${name}`);return ui[name];};
const company={id:'company-1',name:'演示测试资料企业',records:[{id:'record-1',type:'performance',name:'屋面修缮项目',fields:{projectType:'屋面工程',contractDate:'2024-04-20',amount:1200000,evidence:[{kind:'contract',documentId:'contract-1',verified:false}]},documentIds:['contract-1'],verified:false,sources:[]}]};
const docs=[{id:'contract-1',fileName:'合同原件.txt',role:'evidence'},{id:'acceptance-1',fileName:'验收原件.txt',role:'evidence'}];
const report={id:'report-1',companySnapshot:company,evidenceIds:['acceptance-1'],outputs:{risks:[],scoreItems:[],commitments:[],conclusion:{label:'可投',reasons:['原条款已检查']}},categories:[],analysis:{scoring:{items:[{id:'score-1',title:'企业业绩',maxScore:3}]}},companyAnalysis:{companyId:'company-1',companyName:company.name,matches:[{findingId:'finding-1',title:'企业业绩要求',type:'performance',status:'candidate',records:[{...company.records[0],status:'candidate',missing:['验收报告未核对']}],missing:['验收报告未核对'],reasons:['合同及验收报告均须提供'],references:[]}],scoreRows:[{scoreId:'score-1',title:'企业业绩',group:'商务',maxScore:3,expectedScore:null,referenceScore:2,status:'reference',objective:false,reasons:['已核验合同，验收资料待补齐'],missing:['验收报告未核对'],records:company.records,evidenceIds:['contract-1'],materials:['合同扫描件','验收报告'],references:[]}],forecast:{status:'pending',evidenceSupportedScore:0,referenceScore:2,pendingMaxScore:1,scenario:{technicalMax:82,priceMax:10,total:100,assumptions:['人员10分已含技术82分，不重复计算','报价5%扣除不是附加分']}},screening:{threshold:.95,internalRule:true,numerator:8,denominator:8,ratio:1,status:'pending',scoreStatus:'passed',reason:'资格证明待核验',hardGate:'pending'},assumptions:[]}};

test('候选资料表单不会自动确认单份合同或条目，允许同一业绩增加验收证明',()=>{
 const html=feature('recordFormHTML')(company.records[0],'performance',docs),$=load(html);
 assert.equal($('input[name="verified"]').is(':checked'),false);
 assert.equal($('[name="evidenceVerified"]').is(':checked'),false);
 assert.equal($('input[name="field:amount"]').val(),'1200000');
 assert.equal($('textarea[name*="JSON"]').length,0);
 assert.ok($('[data-add-evidence]').length);
 assert.ok($('select[name="evidenceDocumentId"] option[value="acceptance-1"]').length);
 assert.ok($('select[name="evidenceKind"] option[value="acceptanceReport"]').length);
});
test('五类表单使用具体常用字段，所有候选文字和原件名称安全呈现',()=>{
 const render=feature('recordFormHTML');
 const wants={entity:['registeredName','creditCode'],qualification:['specialty','grade','validUntil'],performance:['contractDate','amount'],personnel:['employer','bCertificateNumber','registeredHere','noConcurrentProject'],product:['brand','model','energyPolicy','environmentPolicy','environmentalPerformance']};
 for(const [type,fields] of Object.entries(wants)){
  const $=load(render({name:'<img src=x onerror=1>',fields:{notes:'<script>bad</script>'}},type,[{...docs[0],fileName:'<img src=x>'}]));
  assert.equal($('script,img').length,0);
  for(const field of fields)assert.equal($(`[name="field:${field}"]`).length,1,`${type} ${field}`);
  assert.equal($('[name="name"]').val(),'<img src=x onerror=1>');
 }
});
test('表单转换保留合同且验收证据、金额数值和明确核对，未勾选一律false',()=>{
 const result=feature('recordFromValues')({type:'performance',name:'已核对演示业绩',verified:true,fields:{projectType:'屋面工程',contractDate:'2024-04-20',amount:'1200000',notes:'人工核对记录'},evidence:[{kind:'contract',documentId:'contract-1',verified:true},{kind:'acceptanceReport',documentId:'acceptance-1',verified:false}]},company.records[0],docs);
 assert.equal(result.fields.amount,1200000);
 assert.deepEqual(result.documentIds,['contract-1','acceptance-1']);
 assert.equal(result.fields.evidence[1].verified,false);
 assert.equal(result.verified,true);
 const candidate=feature('recordFromValues')({type:'personnel',name:'候选人员',fields:{registeredHere:false},evidence:[]},null,[]);
 assert.equal(candidate.verified,false);
 assert.equal(candidate.fields.registeredHere,false);
});
test('表单拒绝空名、负金额和其他企业原件，不用自由文字伪造证据',()=>{
 const build=feature('recordFromValues');
 assert.throws(()=>build({type:'performance',name:' ',fields:{},evidence:[]},null,docs),/名称/);
 assert.throws(()=>build({type:'performance',name:'项目',fields:{amount:'-1'},evidence:[]},null,docs),/金额/);
 assert.throws(()=>build({type:'performance',name:'项目',fields:{},evidence:[{kind:'contract',documentId:'foreign-1'}]},null,docs),/原件/);
});
test('编辑和删除资料是不可变本地整表更新，撤销可恢复原记录',()=>{
 const before=structuredClone(company),change=feature('companyWithRecord');
 const updated=change(company,{...company.records[0],name:'新项目名'});
 assert.equal(updated.records.length,1);assert.equal(updated.records[0].name,'新项目名');assert.deepEqual(company,before);
 const removed=feature('companyWithoutRecord')(updated,'record-1');
 assert.equal(removed.records.length,0);assert.deepEqual(updated.records,change(removed,updated.records[0]).records);
});
test('企业选择可省略，选择后分析请求传companyId并保留一次性证照',()=>{
 const payload=feature('analysisRequestBody')({files:{tender:[{id:'main-1'}],attachment:[],evidence:[{id:'single-1'}]},mode:'offline',companyId:'company-1'});
 assert.deepEqual(payload,{documentIds:['main-1'],attachmentIds:[],evidenceIds:['single-1'],mode:'offline',companyId:'company-1'});
 assert.equal(feature('analysisRequestBody')({files:{tender:[{id:'main-1'}]},mode:'offline'}).companyId,undefined);
});
test('参考估分需要八字理由与合法分值，只能使用报告快照或本次证据',()=>{
 const build=feature('scoreAssessmentBody');
 assert.throws(()=>build(report,{scoreId:'score-1',estimatedScore:4,reason:'已核对合同及验收材料'}),/分值/);
 assert.throws(()=>build(report,{scoreId:'score-1',estimatedScore:2,reason:'待查'}),/8/);
 assert.throws(()=>build(report,{scoreId:'score-1',estimatedScore:2,reason:'已核对合同及验收材料',evidenceIds:['foreign-1']}),/证据/);
 assert.deepEqual(build(report,{scoreId:'score-1',estimatedScore:'2',reason:' 已核对合同及验收材料 ',evidenceIds:['contract-1']}),{scoreId:'score-1',estimatedScore:2,reason:'已核对合同及验收材料',evidenceIds:['contract-1']});
 assert.deepEqual(build(report,{scoreId:'score-1',estimatedScore:null}),{scoreId:'score-1',estimatedScore:null,reason:'',evidenceIds:[]});
});
test('匹配和估分表直接列出真实名称、缺项及边界，硬门槛待核不宣布可投',()=>{
 const $=load(feature('companyAnalysisHTML')(report));
 for(const value of ['屋面修缮项目','验收报告未核对','规则预计','人工参考','82','10','95%','人员10分已含技术82分','不是附加分','待核验'])assert.ok($.text().includes(value),value);
 assert.equal($('form[data-score-assessment="score-1"]').length,1);
 assert.ok($('[name="evidenceIds"][value="contract-1"]').length);
 assert.equal($.text().includes('实际得分'),false);
 const blocked=structuredClone(report);blocked.companyAnalysis.screening.status='blocked';blocked.companyAnalysis.screening.hardGate='unmet';
 assert.ok(load(feature('companyAnalysisHTML')(blocked)).text().includes('硬门槛不满足'));
 const zero=structuredClone(report);zero.companyAnalysis.screening={...zero.companyAnalysis.screening,denominator:0,ratio:null,status:'not-applicable'};
 assert.ok(load(feature('companyAnalysisHTML')(zero)).text().includes('不适用'));
});
test('旧报告无企业仍能呈现完整文件分析；共享presentation有值时优先使用',()=>{
 const legacy={analysis:{overview:[{label:'项目名称',value:'旧项目',references:[]}],scoring:{items:[]}}};
 assert.ok(load(view.projectOverviewHTML(legacy)).text().includes('旧项目'));
 const modern={...legacy,presentation:{overview:[{label:'项目名称',value:'共享报告项目',references:[]}],commercialRisks:[{title:'审计后付款',interpretation:'全部验收审计完成后一次支付。',references:[]}],technical:[],clarifications:[]}};
 const $=load(view.projectOverviewHTML(modern));assert.ok($.text().includes('共享报告项目'));assert.ok($.text().includes('全部验收审计完成后一次支付'));
});
test('四输出先呈现资格结论，待核硬门槛会覆盖陈旧可投标签且不改报告数据',()=>{
 const before=structuredClone(report),$=load(view.prioritySummaryHTML(report));
 assert.ok($('.priority-entry').first().hasClass('conclusion'));
 assert.equal($('.conclusion strong').text(),'待核验');
 assert.equal($('[data-section-id="risks"]').length,2);
 assert.deepEqual(report,before);
});

test('企业保存和导入通过本地API提交完整资料，重新读取可取得已保存候选',async()=>{
 const calls=[],db=new Map();let seq=0;
 const api=ui.makeApiClient(async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method||'GET',body,token:options.headers?.['X-Biaoxi-Token']});
  if(path==='/api/bootstrap')return Response.json({token:'local-session'});
  assert.equal(options.headers['X-Biaoxi-Token'],'local-session');
  if(path==='/api/companies'&&options.method==='POST'){const value={id:`company-${++seq}`,name:body.name,records:body.records||[]};db.set(value.id,value);return Response.json(value,{status:201});}
  if(path==='/api/companies')return Response.json({companies:[...db.values()]});
  const id=path.split('/')[3],current=db.get(id);
  if(path.endsWith('/import')){assert.deepEqual(body,{type:'performance',documentIds:['contract-1']});const imported={...current,records:[...current.records,company.records[0]]};db.set(id,imported);return Response.json({company:imported,candidates:[company.records[0]],warnings:['合同候选待核对']});}
  if(options.method==='PUT'){const saved={...current,...body};db.set(id,saved);return Response.json(saved);}
  return Response.json(current);
 });
 await api.bootstrap();const client=feature('makeCompanyClient')(api);
 const created=await client.create(' 本地演示测试企业 ');
 const imported=await client.importDocuments(created.id,'performance',['contract-1']);
 assert.equal(imported.company.records[0].verified,false);
 const changed=feature('companyWithRecord')(imported.company,{...imported.company.records[0],name:'编辑后项目'});
 await client.save(changed);
 const reloaded=await client.get(created.id),all=await client.list();
 assert.equal(reloaded.records[0].name,'编辑后项目');assert.equal(all[0].name,'本地演示测试企业');
 assert.deepEqual(calls.find(call=>call.method==='PUT').body,{name:'本地演示测试企业',records:changed.records});
});

test('盖章和材料有效性均须单独人工确认，候选默认不勾选且保存原值',()=>{
 const html=feature('recordFormHTML')(company.records[0],'performance',docs),$=load(html);
 assert.equal($('[name="evidenceStamped"]').length,1);assert.equal($('[name="evidenceValid"]').length,1);
 assert.equal($('[name="evidenceStamped"]').is(':checked'),false);assert.equal($('[name="evidenceValid"]').is(':checked'),false);
 const saved=feature('recordFromValues')({type:'performance',name:'盖章有效演示合同',fields:{subjectName:'演示测试资料企业'},evidence:[{kind:'contract',documentId:'contract-1',verified:true,stamped:true,valid:true}]},null,docs);
 assert.deepEqual(saved.fields.evidence,[{kind:'contract',documentId:'contract-1',verified:true,stamped:true,valid:true}]);
});

test('分类结果表保留且/或条件、项目化准备及出处，上传HTML不能成为页面元素',()=>{
 assert.equal(typeof view.categoryResultHTML,'function');
 const $=load(view.categoryResultHTML([{id:'f1',title:'业绩材料<script>bad</script>',requirement:'2023-01-01起，合同与验收报告均要',interpretation:'按合同签订日判断日期，主体须为本企业。',impact:'缺少验收报告待核验，不计确定预计分。',actions:['补齐盖章合同及验收报告'],fields:{证明材料:['合同','验收报告']},references:[{documentId:'doc-1',page:9,quote:'合同与验收报告均要'}]}]));
 assert.equal($('tbody tr').length,1);assert.equal($('script').length,0);
 for(const value of ['合同与验收报告均要','合同签订日','缺少验收报告','补齐盖章合同','第9页'])assert.ok($.text().includes(value),value);
 assert.equal($('[data-source-reference]').length,1);
});
test('网页候选附带的本地结论也遵守硬门槛待核边界',()=>{
 const value={...report,webChat:{provider:'deepseek',status:'captured',rawText:'待核验',categories:[],coverage:{}}};
 const $=load(view.webChatHTML(value));
 assert.ok($('.web-chat-local').text().includes('待核验'));
 assert.equal($('.web-chat-local').text().includes('可投'),false);
});
test('保存的参考理由和选中证据回显，候选字段缺口直接可见',()=>{
 const value={...report,scoreAssessments:[{scoreId:'score-1',estimatedScore:2,reason:'已核对合同但验收待补',evidenceIds:['contract-1']}]};
 const $=load(feature('companyAnalysisHTML')(value));
 assert.equal($('[name="evidenceIds"][value="contract-1"]').is(':checked'),true);
 assert.equal($('[name="reason"]').val(),'已核对合同但验收待补');
 const form=load(feature('recordFormHTML')({type:'performance',name:'仅名称导入候选',fields:{},verified:false},'performance',docs));
 assert.ok(form('.record-field-gaps').text().includes('合同签订日期'));
 assert.ok(form('.record-field-gaps').text().includes('材料主体名称'));
});

test('后端对象式hardGate与below-threshold状态转为明确中文且不展示可投',()=>{
 const value=structuredClone(report);value.companyAnalysis.screening.hardGate={status:'pending',findingIds:['f1']};value.companyAnalysis.screening.status='below-threshold';value.companyAnalysis.screening.scoreStatus='below-threshold';
 const $=load(feature('companyAnalysisHTML')(value));assert.ok($.text().includes('未达到内部阈值'));
 assert.equal(feature('safeReportConclusion')(value).label,'不建议投');
 assert.deepEqual(value.companyAnalysis.screening.hardGate,{status:'pending',findingIds:['f1']});
});

test('企业原件查看不借用当前招标文件的名称，无报告时也可定位企业文档',()=>{
 const build=feature('sourceDocumentReference');
 assert.deepEqual(build({id:'contract-1',fileName:'企业合同.txt'},{documentId:'tender-1',fileName:'招标.pdf'}),{documentId:'contract-1',fileName:'企业合同.txt',page:null,quote:''});
 assert.deepEqual(build({id:'license-1',fileName:'营业执照.txt'},null),{documentId:'license-1',fileName:'营业执照.txt',page:null,quote:''});
});

test('证明组合可明确选择中标通知书、网络截图和业主证明，并保存后端接受的kind',()=>{
 const $=load(feature('recordFormHTML')({},'performance',docs));
 const types=[['awardNotice','中标通知书'],['webScreenshot','网络截图'],['ownerProof','业主证明']];
 for(const [kind,label] of types){assert.equal($(`select[name="evidenceKind"] option[value="${kind}"]`).text(),label);const value=feature('recordFromValues')({type:'performance',name:'组合材料演示业绩',fields:{},evidence:[{kind,documentId:'contract-1',verified:false}]},null,docs);assert.equal(value.fields.evidence[0].kind,kind);assert.equal(value.fields.evidence[0].verified,false);}
});
test('企业库在桌面和窄屏均使用可见原件抽屉，初始报告静默加载保留左侧原文',()=>{
 const target=feature('sourcePreviewMode');
 assert.equal(target({view:'companies',narrow:false}),'dialog');assert.equal(target({view:'companies',narrow:true}),'dialog');
 assert.equal(target({view:'analysis',narrow:false}),'pane');assert.equal(target({view:'analysis',narrow:true}),'dialog');
 assert.equal(target({view:'analysis',narrow:true,quiet:true}),'pane');
});
test('原件预览通过会话认证读取选定文档，拒绝错配元数据而不缓存另一份文件',async()=>{
 const seen=[];const api=ui.makeApiClient(async(path,options)=>{
  seen.push({path,token:options.headers['X-Biaoxi-Token']});
  return Response.json(path==='/api/bootstrap'?{token:'local-session'}:path.endsWith('/wrong')?{id:'other',fileName:'另一企业证书.txt'}:{id:'contract-1',fileName:'合同原件.txt',extraction:{format:'txt',blocks:[{id:'b1',page:null,text:'甲方与乙方合同'}],pages:[]}});
 });
 await api.bootstrap();const cache=new Map(),read=feature('readSourceDocument');
 const doc=await read(api,'contract-1',cache);assert.equal(doc.extraction.blocks[0].text,'甲方与乙方合同');
 assert.deepEqual(seen[1],{path:'/api/documents/contract-1',token:'local-session'});
 await assert.rejects(read(api,'wrong',cache),/不一致/);assert.equal(cache.has('wrong'),false);
});

test('U1 更换已确认原件或证明种类清空证明和条目确认，重新核对才恢复',()=>{
 const prior={...company.records[0],verified:true,fields:{...company.records[0].fields,evidence:[{kind:'contract',documentId:'contract-1',verified:true,stamped:true,valid:true}]}};
 const unchanged={type:'performance',name:prior.name,fields:{...prior.fields},verified:true,evidence:[{...prior.fields.evidence[0]}]};
 assert.equal(feature('recordFromValues')(unchanged,prior,docs).verified,true);
 for(const replacement of [{kind:'contract',documentId:'acceptance-1'},{kind:'ownerProof',documentId:'contract-1'}]){
  const changed={...unchanged,evidence:[{...prior.fields.evidence[0],...replacement}]};
  const saved=feature('recordFromValues')(changed,prior,docs);assert.equal(saved.verified,false);assert.equal(saved.fields.evidence[0].verified,false);assert.equal(saved.fields.evidence[0].stamped,false);assert.equal(saved.fields.evidence[0].valid,false);
  const reconfirmed=feature('recordFromValues')({...changed,confirmationAcknowledged:true,evidence:changed.evidence.map(proof=>({...proof,confirmationAcknowledged:true}))},prior,docs);
  assert.equal(reconfirmed.verified,true);assert.equal(reconfirmed.fields.evidence[0].verified,true);assert.equal(reconfirmed.fields.evidence[0].stamped,true);assert.equal(reconfirmed.fields.evidence[0].valid,true);
 }
 const changedFact=feature('recordFromValues')({...unchanged,fields:{...prior.fields,amount:500000}},prior,docs);assert.equal(changedFact.verified,false);assert.equal(changedFact.fields.evidence[0].verified,true);
});
test('U2 陈旧共享可投不能盖过当前拒绝、待核或明确低95，资格状态保持原样',()=>{
 for(const row of [{label:'不建议投',scoreStatus:'below-threshold',gate:'met',want:'不建议投'},{label:'待核验',scoreStatus:'pending',gate:'met',want:'待核验'},{label:'不建议投',scoreStatus:'below-threshold',gate:'pending',want:'不建议投'}]){
  const value=structuredClone(report);value.outputs.conclusion={label:row.label,reasons:['当前后端判断']};value.presentation={outputs:{conclusion:{label:'可投',reasons:['陈旧共享文字']}}};value.companyAnalysis.screening={...value.companyAnalysis.screening,scoreStatus:row.scoreStatus,status:row.scoreStatus,hardGate:{status:row.gate,findingIds:['f1']}};
  const before=structuredClone(value),result=feature('safeReportConclusion')(value);assert.equal(result.label,row.want);assert.deepEqual(value,before);
 }
 const unmet=structuredClone(report);unmet.companyAnalysis.screening={scoreStatus:'pass',status:'pass',hardGate:{status:'unmet'},reason:'资质已确认不满足'};assert.equal(feature('safeReportConclusion')(unmet).label,'不建议投');
});
test('U3 共享分类或输出为空仍显示原始复核入口，筛选无结果提供清除路径',()=>{
 assert.equal(typeof view.presentationSectionHTML,'function');
 const raw=[{id:'q1',title:'真实资质条件'}],rawHTML='<article class="finding" data-finding="q1"><h3>真实资质条件</h3><form class="review-form" data-review-finding="q1"><button>提交复核</button></form></article>';
 for(const hasFilter of [false,true]){
  const $=load(view.presentationSectionHTML({items:[],rawItems:raw,rawHTML,hasFilter,documentId:'main-1'}));
  assert.equal($('.report-raw-details .review-form').length,1);assert.equal($('.report-raw-details [data-finding="q1"]').length,1);assert.equal($.text().includes('尚未定位到这类条款'),false);
  if(hasFilter)assert.equal($('[data-clear-filter]').length,1);
 }
});
test('U4 多页PDF分页可到末页并钳制越界，纯文字原件不伪造分页',()=>{
 const state=feature('sourcePaginationState'),doc={id:'multi-pdf',extraction:{format:'pdf',pages:[{number:1},{number:2},{number:3}]}};
 assert.deepEqual(state(doc,3),{isPdf:true,total:3,page:3,previousDisabled:false,nextDisabled:true});
 assert.equal(state(doc,0).page,1);assert.equal(state(doc,99).page,3);assert.equal(state(doc,2,6).total,6);assert.equal(state(doc,99,2).page,2);
 assert.equal(state({extraction:{format:'txt',pages:[]}},2).isPdf,false);
});
test('U4 当前模态抽屉内有带label的页码与翻页，不依赖隐藏的报告pane',async()=>{
 const {readFile}=await import('node:fs/promises'),$=load(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
 assert.equal($('#source-dialog #source-page-controls').length,1);assert.equal($('#source-dialog #source-prev').length,1);assert.equal($('#source-dialog #source-next').length,1);assert.equal($('#source-dialog input#source-page[type="number"]').attr('aria-label'),'原件预览页码');
 assert.equal($('#source-pane #reader-prev').length,1);
});

test('完整核查版仅主动勾选后发送details=1，默认导出精炼报告',async()=>{
 const path=feature('reportExportPath');
 assert.equal(path('report-1','pdf'),'/api/reports/report-1/export?format=pdf');
 assert.equal(path('report-1','docx',{details:false}),'/api/reports/report-1/export?format=docx');
 assert.equal(path('report-1','pdf',{details:true}),'/api/reports/report-1/export?format=pdf&details=1');
 const {readFile}=await import('node:fs/promises'),$=load(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
 assert.equal($('#export-dialog #export-details[type="checkbox"]').length,1);assert.equal($('#export-details').is(':checked'),false);
});

test('技术工程表保留任意原数量、原单位及做法，危险文字仅作为文字呈现',()=>{
 const $=load(view.narrativeHTML({title:'任意工程清单',quantities:[{name:'测试面层<script>bad</script>',quantity:'001.250',unit:'m2',description:'按原做法核对<img src=x onerror=1>',references:[]},{name:'零数量原条目',quantity:0,unit:'组',description:'原值保留',references:[]}]}));
 assert.equal($('.engineering-quantities tbody tr').length,2);assert.equal($('script,img').length,0);
 assert.equal($('.engineering-quantities tbody tr').first().find('td').eq(1).text(),'001.250 m2');
 assert.equal($('.engineering-quantities tbody tr').last().find('td').eq(1).text(),'0 组');
 assert.ok($('.engineering-quantities').text().includes('按原做法核对<img src=x onerror=1>'));
});
test('共享技术工程清单出现在总览，逐行出处按钮保留真实页码和引用对象',()=>{
 const ref={documentId:'arbitrary-doc',blockId:'b4',page:27,quote:'测试清单原文'};
 const $=load(view.projectOverviewHTML({analysis:{overview:[],scoring:{items:[]}},presentation:{overview:[],technical:[{title:'工程内容与核对事项',interpretation:'按采购清单核对。',quantities:[{name:'任意数量测试工程',quantity:'987.654',unit:'延米',description:'合同约定做法',references:[ref]}]}],commercialRisks:[],clarifications:[]}}));
 assert.ok($('.engineering-quantities').text().includes('987.654 延米'));
 const button=$('.engineering-quantities [data-source-reference]');assert.equal(button.text(),'第27页');assert.deepEqual(JSON.parse(button.attr('data-source-reference')),ref);
});

test('无企业报告默认只显示简短入口，测算表和参考表单完整保留在闭合展开项',()=>{
 const value=structuredClone(report);value.companyAnalysis.companyId=null;value.companyAnalysis.companyName='';value.companyAnalysis.matches=[];value.companySnapshot=null;
 const $=load(feature('companyAnalysisHTML')(value)),details=$('.company-estimate-details');
 assert.equal(details.length,1);assert.equal(details.is('[open]'),false);
 assert.equal(details.find('.company-score-table').length,1);assert.equal(details.find('[data-score-assessment="score-1"]').length,1);assert.equal(details.find('.forecast-summary').length,1);
 assert.equal($('.company-score-table').not(details.find('.company-score-table')).length,0);
 assert.ok($('.company-report').first().children('p').text().includes('未选择企业，文件照常分析，企业匹配与预计分待核验'));
 assert.equal($('.company-report').first().children('[data-view="companies"]').length,1);
});
test('已选企业继续直接显示完整匹配与测算，不额外折叠企业主表',()=>{
 const $=load(feature('companyAnalysisHTML')(report));assert.equal($('.company-estimate-details').length,0);assert.equal($('.company-score-table').length,1);assert.ok($('.matched-record').text().includes('屋面修缮项目'));
});
test('无企业已知总分报告保留后端具体待核理由，筛选未知说明不覆盖主结论',()=>{
 const value=structuredClone(report);value.companyAnalysis.companyId=null;value.companyAnalysis.screening={status:'pending',scoreStatus:'pending',reason:'存在未知分值，不能判定是否达到95%',hardGate:{status:'pending'}};value.outputs.conclusion={label:'待核验',reasons:['文件满分已知为100分，未选择企业，企业预计分待核验。','企业事实尚未核对']};
 const before=structuredClone(value),conclusion=feature('safeReportConclusion')(value);assert.equal(conclusion.label,'待核验');assert.deepEqual(conclusion.reasons,value.outputs.conclusion.reasons);assert.deepEqual(value,before);
 const $=load(view.prioritySummaryHTML(value));assert.equal($('.priority-entry.conclusion p').text(),'文件满分已知为100分，未选择企业，企业预计分待核验。');
});

test('评分表有清理正文时优先显示readableStandard，标准数据不变且危险文字转义',()=>{
 const value={analysis:{overview:[],scoring:{items:[{id:'s1',title:'任意评分项',group:'技术',maxScore:12,standard:'评分项 | 12分 | 整行旧标题重复',readableStandard:'达到明确标准得12分。<script>bad</script>',materials:['施工方案'],references:[{documentId:'d1',page:19,quote:'原标准'}]}]}}};
 const before=structuredClone(value),$=load(view.projectOverviewHTML(value)),table=$('.score-table');
 assert.ok(table.text().includes('达到明确标准得12分。<script>bad</script>'));assert.equal(table.text().includes('整行旧标题重复'),false);assert.equal($('script').length,0);
 assert.ok(table.text().includes('施工方案'));assert.equal(table.find('[data-source-reference]').text(),'第19页');assert.equal(table.find('tbody td').eq(1).text(),'12');assert.deepEqual(value,before);
});
test('旧评分报告没有readableStandard时仍显示原standard及材料',()=>{
 const $=load(view.projectOverviewHTML({analysis:{overview:[],scoring:{items:[{id:'s-old',title:'旧标准项',group:'商务',maxScore:4,standard:'提交有效证明得4分。',materials:['原认证材料'],references:[]}]}}}));
 assert.ok($('.score-table').text().includes('提交有效证明得4分。'));assert.ok($('.score-table').text().includes('原认证材料'));assert.equal($('.score-table tbody td').eq(1).text(),'4');
});
