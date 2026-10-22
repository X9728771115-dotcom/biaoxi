import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let semantic;
try{semantic=await import('../src/core/semantic-review.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const api=()=>{assert.equal(typeof semantic?.buildSourceChecklist,'function');assert.equal(typeof semantic?.reviewWebContent,'function');return semantic;};
const benchmark=JSON.parse(fs.readFileSync(new URL('./fixtures/semantic-acceptance-v6.json',import.meta.url),'utf8'));
const ref=block=>({documentId:'procurement',blockId:block.id,page:block.page,quote:block.text});
function fixture(){
 const blocks=[
  {id:'quality',page:3,text:'工程质量达到合格标准，所有分项工程一次验收通过率98%。'},
  {id:'tax',page:4,text:'甲省境内注册且适用承诺制的供应商提供承诺函；依法免税或不需要缴纳社会保障资金的提供相应证明；未在甲省缴纳税收和社会保障资金的提供任意一个月缴纳证明。'},
  {id:'authority-a',page:5,text:'采购单位授权评标委员会按照采购文件规定的方式确定中标（成交）供应商。'},
  {id:'authority-b',page:5,text:'采购人应当自收到磋商报告之日起7个工作日内，在成交候选人名单中按顺序确定成交人。'},
  {id:'performance',page:6,text:'供应商提供同类项目合同案例，每份得2分，最高4分。须提供合同以及验收报告。'},
  {id:'manager',page:7,text:'拟派项目经理具备注册建造师证书和安全生产考核证书，在本单位注册且不兼任其他在建项目经理。'},
  {id:'fee',page:8,text:'代理服务费按成交金额的2%计取，不足3000元按3000元收取，由成交供应商承担。'},
  {id:'annex',page:9,text:'完整采购合同及施工图纸详见附件。'}
 ];
 const documents=[{id:'procurement',role:'tender',path:'/private/DO_NOT_EXPOSE.pdf',extraction:{complete:false,blocks}},{id:'certificate',role:'evidence',path:'/private/LICENSE.png',extraction:{blocks:[{id:'license',page:1,text:'企业营业执照及已确认资格。'}]}}];
 const item=(id,title,group,text)=>({id,title,interpretation:text||title,references:[ref(blocks.find(block=>block.id===id))],...(group?{categoryId:group}:{})});
 const report={id:'report',documentId:'procurement',attachmentIds:[],evidenceIds:['certificate'],analysis:{overview:[{label:'质量标准',value:blocks[0].text,references:[ref(blocks[0])]}],technical:[item('manager','项目经理注册与证书','personnel')],commercialRisks:[item('fee','代理服务费用','payment')],clarifications:[{title:'定标主体并列表述待确认',interpretation:'两处确定主体的适用关系待澄清。',references:[ref(blocks[2]),ref(blocks[3])] },item('annex','完整合同和图纸缺口','consistency')],businessRequirements:[item('tax','企业税收社保条件分支','qualification'),item('performance','同类业绩材料与评分','performance')]},companySnapshot:{records:[{id:'cert',confirmed:true}]},companyAnalysis:{forecast:{totalRange:{min:90,max:94}}}};
 return {report,documents,blocks};
}
function finding(f,id,interpretation,extra={}){return {categoryId:id==='tax'?'qualification':id==='manager'?'personnel':id==='performance'?'performance':id==='fee'?'payment':'method',quote:f.blocks.find(b=>b.id===id).text,documentId:'procurement',page:f.blocks.find(b=>b.id===id).page,interpretation,...extra};}
const review=(f,extra={})=>api().reviewWebContent({...f,...extra});
const issues=result=>result.checks.map(check=>check.issue);

test('source checklist contains only uniquely located selected procurement facts, conditions and gaps without rewriting quotes',()=>{
 const f=fixture(),original=structuredClone(f),bad={title:'无依据的事实',interpretation:'不能加入',references:[{documentId:'certificate',blockId:'license',page:1,quote:'企业营业执照及已确认资格。'}]};
 f.report.analysis.technical.push(bad,{...bad,references:[{documentId:'procurement',blockId:'missing',quote:'不存在'}]});
 f.report.analysis.overview.push({label:'企业预计分数',value:'预计90至94分',origin:'user-rule',references:[ref(f.blocks[0])]});
 f.documents.push({id:'unselected',role:'tender',path:'/private/OTHER.pdf',extraction:{blocks:[{id:'other',page:1,text:'不应进入本次材料。'}]}});
 f.report.analysis.technical.push({title:'其他项目',interpretation:'不应进入',references:[{documentId:'unselected',blockId:'other',page:1,quote:'不应进入本次材料。'}]});
 const snapshot=structuredClone(f),checklist=api().buildSourceChecklist(f);
 assert.ok(Array.isArray(checklist)&&checklist.length>=7);assert.ok(checklist.some(item=>item.kind==='gap'));
 assert.ok(!JSON.stringify(checklist).includes('/private/'));assert.ok(!JSON.stringify(checklist).includes('预计90'));assert.ok(!checklist.some(item=>/无依据|其他项目/.test(item.title)));
 for(const item of checklist){assert.ok(item.id&&item.title&&item.text&&item.references.length);for(const citation of item.references){const matches=f.blocks.filter(block=>block.id===citation.blockId&&block.text.includes(citation.quote));assert.equal(matches.length,1);assert.equal(citation.page,matches[0].page);assert.equal(citation.documentId,'procurement');}}
 assert.deepEqual(f,snapshot);assert.deepEqual(f.report.companySnapshot,original.report.companySnapshot);
});

test('source checklist includes local tax alternatives, cross-block manager conditions and dated same-project proof requirements',()=>{
 const f=fixture();f.report.analysis={};
 f.blocks.find(b=>b.id==='tax').text+='其他不适用承诺制情形提供相关证明。';
 f.blocks.find(b=>b.id==='manager').text='采购包1：拟派项目经理具备建筑工程专业二级及以上注册建造师证书，在本单位注册。';
 f.blocks.push({id:'manager-continuation',page:8,text:'采购包1：一级建造师须提供电子证书；项目经理应持有效B类安全考核证，不兼职在建、在施、中标、预中标项目经理。'});
 f.blocks.find(b=>b.id==='performance').text='采购包1：供应商提供2028年2月1日至今的同类项目合同案例，每份得2分，最高4分，合同签订时间为准。须提供加盖公章合同以及验收报告。';
 const branches=['甲省注册且适用承诺制：承诺函。','依法免税或无需缴社保：对应免税或免缴证明。','未在甲省缴纳：任意一个月普通缴纳证明。','其他不适用承诺制：相关证明。'];
 const tax={id:'local-tax',source:'offline',title:'税社保完整分支',interpretation:'依据实际适用条件选择，不能将注册地等同实际缴纳地。',fields:{税社保材料分支:branches},references:[ref(f.blocks.find(b=>b.id==='tax'))]};
 const manager={id:'local-manager',source:'offline',title:'拟派经理完整条件',interpretation:'经理须持注册证和B类证，在本单位注册；一级适用电子证，且不兼职在建、在施、中标、预中标经理。',fields:{经理完整条件:'建筑工程专业二级及以上注册建造师；一级电子证；有效B类安全考核证；本单位注册；不兼职。'},scope:{documentId:'procurement',package:'1'},references:[ref(f.blocks.find(b=>b.id==='manager')),ref(f.blocks.find(b=>b.id==='manager-continuation'))]};
 const performance={id:'local-performance',source:'offline',title:'同类项目业绩',interpretation:'同类项目范围未明确定义，不得自行收窄具体工程类型；证明材料是且关系，日期按合同签订时间。',fields:{证明材料:['加盖公章合同','验收报告'],逻辑关系:['且／同时'],时间口径:'2028年2月1日至今，以合同签订时间为准'},references:[ref(f.blocks.find(b=>b.id==='performance'))]};
 f.report.categories=[{id:'qualification',items:[tax]},{id:'personnel',items:[manager]},{id:'performance',items:[performance]}];
 const before=structuredClone(f),checklist=api().buildSourceChecklist(f);
 assert.equal(checklist.length,3);const t=checklist.find(i=>i.categoryId==='qualification'),m=checklist.find(i=>i.categoryId==='personnel'),p=checklist.find(i=>i.categoryId==='performance');
 assert.deepEqual(t.fields.税社保材料分支,branches);for(const branch of branches)assert.ok(t.text.includes(branch));assert.ok(t.text.includes(tax.interpretation));
 assert.equal(m.references.length,2);assert.equal(m.scope.package,'1');for(const token of ['B类','一级','电子证','在建','在施','中标','预中标'])assert.ok(m.text.includes(token));
 assert.deepEqual(p.fields.证明材料,['加盖公章合同','验收报告']);assert.ok(p.text.includes('且／同时'));assert.ok(p.text.includes('2028年2月1日'));assert.ok(p.text.includes('不得自行收窄'));
 assert.deepEqual(f,before);for(const item of checklist)for(const citation of item.references)assert.equal(citation.quote,f.blocks.find(b=>b.id===citation.blockId).text);
});

test('category checklist excludes unreviewed AI, evidence, mixed packages and absent requirements',()=>{
 const f=fixture();f.report.analysis={};const manager={id:'manager-local',source:'offline',title:'项目经理注册条件',interpretation:'按原文核对项目经理注册证书。',references:[ref(f.blocks.find(b=>b.id==='manager'))]};
 const ai={...manager,id:'ai-pending',source:'ai',title:'未审AI不得进入',reviewed:false};
 const approved={...ai,id:'ai-reviewed',title:'人工已核原文条件',reviewed:true};
 const evidence={...manager,id:'evidence',title:'证照不能变采购要求',references:[{documentId:'certificate',blockId:'license',page:1,quote:'企业营业执照及已确认资格。'}]};
 const absent={...manager,id:'not-required',title:'未列经理要求不得新增',references:[ref(f.blocks.find(b=>b.id==='annex'))]};
 const other={id:'other-manager',page:11,text:'采购包2：拟派项目经理具备一级注册建造师证书。'};f.blocks.push(other);f.blocks.find(b=>b.id==='manager').scope={package:'1'};
 const mixed={...manager,id:'mixed',title:'不同包条件不能拼接',references:[...manager.references,ref(other)]};
 const wrongScope={...manager,id:'wrong-scope',title:'不能借包2条件',scope:{documentId:'procurement',package:'1'},references:[ref(other)]};
 f.report.categories=[{id:'personnel',items:[manager,ai,approved,evidence,absent,mixed,wrongScope]}];
 const checklist=api().buildSourceChecklist(f);assert.deepEqual(checklist.map(i=>i.title),['项目经理注册条件','人工已核原文条件']);
 f.report.categories=[];assert.deepEqual(api().buildSourceChecklist(f),[]);
});

test('coverage needs an actual verified finding and quality explanation, never a heading, output mention or quotation alone',()=>{
 const f=fixture(),quality=api().buildSourceChecklist(f).find(item=>item.title==='质量标准');
 for(const extra of [{categories:[{id:'consistency',summary:f.blocks[0].text,findings:[]}]},{modelOutputs:{risks:[f.blocks[0].text]}},{findings:[{...finding(f,'quality',''),categoryId:'consistency'}]},{findings:[{...finding(f,'quality','付款比例为98%，质量方案另查。'),categoryId:'consistency'}]}])assert.ok(review(f,extra).checks.some(check=>check.id===quality.id&&check.issue==='source-not-covered'));
 const covered=review(f,{categories:[{id:'consistency',findings:[finding(f,'quality','工程质量为合格，所有分项工程一次验收通过率98%。')]}]});
 assert.ok(!covered.checks.some(check=>check.id===quality.id&&check.issue==='source-not-covered'));assert.ok(!['passed','accurate'].includes(covered.status));
});

test('quality percentage coverage compares the entire numeric ratio rather than a digit suffix',()=>{
 const f=fixture(),quality=api().buildSourceChecklist(f).find(item=>item.title==='质量标准');
 for(const ratio of ['198%','0.98%','98万元','98']){
  const result=review(f,{findings:[{...finding(f,'quality','工程质量合格，所有分项工程一次验收通过率'+ratio+'。'),categoryId:'consistency'}]});
  assert.ok(result.checks.some(check=>check.id===quality.id&&check.issue==='source-not-covered'),ratio+' cannot establish the original percentage');
 }
 for(const ratio of ['98.0％','百分之98'])assert.ok(!review(f,{findings:[finding(f,'quality','工程质量合格，所有分项工程一次验收通过率'+ratio+'。')]}).checks.some(check=>check.id===quality.id&&check.issue==='source-not-covered'));
});

test('numeric coverage distinguishes complete integer and decimal tokens including 8/18 and 0.98/98',()=>{
 for(const [source,model] of [['要求8分','要求18分'],['要求98分','要求198分'],['参考值98','参考值0.98'],['参考值0.98','参考值98']]){
  const f=fixture();f.blocks[0].text=source;f.report.analysis={overview:[{label:'精确数值条件',value:source,references:[ref(f.blocks[0])]}]};f.report.categories=[];
  const target=api().buildSourceChecklist(f)[0],result=review(f,{findings:[finding(f,'quality','本事项的'+model+'，仍需原文复核。')]});
  assert.ok(result.checks.some(check=>check.id===target.id&&check.issue==='source-not-covered'),source+' differs from '+model);
 }
});

test('numeric coverage retains explicit percentage and monetary units instead of equating bare numbers',()=>{
 for(const [source,model] of [['最高限价8万元','最高限价8元'],['最高限价8万元','最高限价8%'],['付款比例98%','付款比例98万元'],['付款比例98%','付款比例0.98'],['最高限价8万元','最高限价8']]){
  const f=fixture();f.blocks[0].text=source;f.report.analysis={overview:[{label:'带单位数值条件',value:source,references:[ref(f.blocks[0])]}]};f.report.categories=[];
  const target=api().buildSourceChecklist(f)[0];assert.ok(review(f,{findings:[finding(f,'quality','本事项的'+model+'，仍需核验。')]}).checks.some(check=>check.id===target.id&&check.issue==='source-not-covered'));
 }
 const f=fixture();f.blocks[0].text='最高限价1,234.50万元';f.report.analysis={overview:[{label:'金额条件',value:f.blocks[0].text,references:[ref(f.blocks[0])]}]};f.report.categories=[];const target=api().buildSourceChecklist(f)[0];
 assert.ok(!review(f,{findings:[finding(f,'quality','本事项最高限价1234.500万元，金额按原文核验。')]}).checks.some(check=>check.id===target.id&&check.issue==='source-not-covered'));
});

test('foreign, ambiguous and evidence quotations cannot establish semantic coverage',()=>{
 const f=fixture(),quality=api().buildSourceChecklist(f).find(item=>item.title==='质量标准');f.documents[1].extraction.blocks.push({...f.blocks[0],id:'copy'});
 for(const item of [{...finding(f,'quality',f.blocks[0].text),documentId:'certificate'},{...finding(f,'quality',f.blocks[0].text),documentId:'foreign'},{...finding(f,'quality',f.blocks[0].text),quote:'这不是采购原文'}])assert.ok(review(f,{findings:[item]}).checks.some(check=>check.id===quality.id&&check.issue==='source-not-covered'));
 f.blocks.push({...f.blocks[0],id:'duplicate'});const ambiguous=finding(f,'quality',f.blocks[0].text);assert.ok(review(f,{findings:[ambiguous]}).checks.some(check=>check.id===quality.id&&check.issue==='source-not-covered'));
});

test('tax branch review identifies registration-to-payment overgeneralization but preserves exemptions and unresolved advice',()=>{
 const f=fixture();assert.ok(issues(review(f,{findings:[finding(f,'tax','省外注册供应商一律须提供普通纳税社保缴纳证明。')]})).includes('tax-branch-scope'));
 for(const text of ['省外注册不能直接等同未在甲省缴纳，先核实免税免缴及实际缴纳地，按适用分支补证。','省外注册且未在甲省缴纳的供应商提供缴纳证明，依法免税或无需缴社保的按相应例外证明。'])assert.ok(!issues(review(f,{findings:[finding(f,'tax',text)]})).includes('tax-branch-scope'));
 assert.ok(!issues(review(f,{findings:[{...finding(f,'tax','省外注册供应商一律须提供普通纳税社保缴纳证明。'),documentId:'foreign-procurement'}]})).includes('tax-branch-scope'));
});

test('parallel determination review requires two same-scope determining actors and does not invent a resolved authority',()=>{
 const f=fixture();assert.ok(issues(review(f,{categories:[{id:'method',summary:'采购单位授权磋商小组确定成交供应商。',findings:[]}]})).includes('determination-scope'));
 assert.ok(!issues(review(f,{modelOutputs:{conclusion:{reasons:['采购单位授权评标委员会确定，同时采购人按顺序确定，两处主体关系待澄清。']}}})).includes('determination-scope'));
 f.blocks.find(b=>b.id==='authority-a').scope={package:'1'};f.blocks.find(b=>b.id==='authority-b').scope={package:'2'};
 assert.ok(!issues(review(f,{modelOutputs:{conclusion:{reasons:['由磋商小组直接确定成交供应商。']}}})).includes('determination-scope'));
 delete f.blocks.find(b=>b.id==='authority-a').scope;delete f.blocks.find(b=>b.id==='authority-b').scope;
 f.blocks.find(b=>b.id==='authority-a').text='采购包1：'+f.blocks.find(b=>b.id==='authority-a').text;f.blocks.find(b=>b.id==='authority-b').text='采购包2：'+f.blocks.find(b=>b.id==='authority-b').text;
 assert.ok(!issues(review(f,{modelOutputs:{conclusion:{reasons:['由磋商小组直接确定成交供应商。']}}})).includes('determination-scope'));
});

test('same-project review detects an added specific project type without treating examples and scope questions as restrictions',()=>{
 const f=fixture();assert.ok(issues(review(f,{modelOutputs:{conclusion:{reasons:['需补充同类桥梁修缮项目合同及验收报告才能取得业绩分。']}}})).includes('performance-scope'));
 for(const text of ['同类项目范围未定义，可优先检索桥梁修缮案例，不排除其他同类，待澄清。','需要核验同类项目合同及验收报告。'])assert.ok(!issues(review(f,{findings:[finding(f,'performance',text)]})).includes('performance-scope'));
 f.blocks.find(b=>b.id==='performance').text+='本项同类项目指桥梁修缮项目。';
 assert.ok(!issues(review(f,{modelOutputs:{risks:['需补充同类桥梁修缮项目合同及验收报告。']}})).includes('performance-scope'));
});

test('a manager material gap beside enterprise tax proof does not create a personal social-proof obligation',()=>{
 const f=fixture(),result=review(f,{unverifiedItems:[{title:'综合风险提示',interpretation:'项目经理及业绩材料缺失，省外企业必须提供税收和社保证明材料。',references:[ref(f.blocks.find(b=>b.id==='manager')),ref(f.blocks.find(b=>b.id==='tax'))]}]});
 assert.ok(!issues(result).includes('personnel-proof-added'));
 assert.ok(issues(result).includes('tax-branch-scope'));
});
test('manager social proof needs a personnel obligation context and honors another explicit same-scope source',()=>{
 const f=fixture(),required=finding(f,'manager','须提交项目经理资格材料。',{fields:{证明材料:['注册证书','本单位社保证明']}});
 assert.ok(issues(review(f,{findings:[required]})).includes('personnel-proof-added'));
 assert.ok(!issues(review(f,{findings:[finding(f,'manager','当前原文未明示本单位社保证明，另核附件是否要求，不当必交。')]})).includes('personnel-proof-added'));
 assert.ok(!issues(review(f,{findings:[finding(f,'tax','企业税收社保按适用分支提供证明。')]})).includes('personnel-proof-added'));
 assert.ok(!issues(review(f,{findings:[finding(f,'tax','企业税社保不是项目经理个人社保。未在甲省缴纳的按适用分支提供缴纳证明。',{fields:{证明材料:['企业纳税社保证明']}})]})).includes('personnel-proof-added'));
 f.blocks.push({id:'manager-extra',page:10,text:'项目经理须提交本单位近一月社保证明。'});
 assert.ok(!issues(review(f,{findings:[required]})).includes('personnel-proof-added'));
});

test('fee review binds the added consequence to that fee and honors an actual fee-specific sanction',()=>{
 const f=fixture();for(const text of ['代理服务费成交后拒不缴纳将承担合同及政府采购法律责任。','须缴清代理服务费后方可领取成交通知书。'])assert.ok(issues(review(f,{findings:[finding(f,'fee',text)]})).includes('fee-consequence-added'));
 for(const text of ['代理服务费由成交方承担，缴费时点和后果需核对其他约定。','未交履约保证金可能影响合同签署，需另核原文。'])assert.ok(!issues(review(f,{modelOutputs:{risks:[text]}})).includes('fee-consequence-added'));
 f.blocks.push({id:'fee-extra',page:10,text:'代理服务费须在领取成交通知书前缴清，拒不缴纳不发放成交通知书。'});
 assert.ok(!issues(review(f,{findings:[finding(f,'fee','代理服务费拒不缴纳不发放成交通知书。')]})).includes('fee-consequence-added'));
});

test('synthetic v6 source/model differences produce source-grounded review issues without project constants in the implementation',()=>{
 const cases=[['tax-social-security-branches','expert','tax-branch-scope'],['determination-parallel-authorities','quick','determination-scope'],['performance-scope-date-proof-and-score','expert','performance-scope'],['personnel-conditions-no-added-social-proof','expert','personnel-proof-added'],['fee-rates-minima-and-no-invented-sanction','quick','fee-consequence-added']];
 for(const [id,mode,issue] of cases){const c=benchmark.cases.find(item=>item.id===id),source=c.sourceReferences,blocks=source.map((r,i)=>({id:r.blockId||'b'+i,page:r.page,text:r.quote})),documentId=source[0].documentId,categoryId=issue==='personnel-proof-added'?'personnel':issue==='fee-consequence-added'?'payment':issue==='tax-branch-scope'?'qualification':issue==='performance-scope'?'performance':'method';
  const report={documentId,analysis:{commercialRisks:[{title:c.title,interpretation:c.title,references:source}]}};const documents=[{id:documentId,role:'tender',extraction:{blocks}}],evidence=c.modelObservations[mode].evidence[0],model={categoryId,documentId,quote:source[0].quote,page:source[0].page,interpretation:evidence.jsonPointer.includes('/fields/')?'':evidence.excerpt,...(evidence.jsonPointer.endsWith('/证明材料')?{fields:{证明材料:JSON.parse(evidence.excerpt)}}:{})};
  if(issue==='fee-consequence-added'){model.interpretation=evidence.excerpt;model.title='成交后代理服务费';}
  const result=api().reviewWebContent({report,documents,findings:[model],modelOutputs:issue==='performance-scope'?{conclusion:{reasons:[evidence.excerpt]}}:{}});
  assert.ok(issues(result).includes(issue),id+' must preserve its demonstrated difference');for(const check of result.checks)assert.ok(check.references.length&&check.references.every(r=>source.some(s=>s.blockId===r.blockId&&s.quote.includes(r.quote))));
 }
});

test('review functions keep inputs immutable and expose any check cap instead of truncating original citations',()=>{
 const f=fixture();f.report.analysis.technical=Array.from({length:100},(_,i)=>({title:'不同待核事项'+i,interpretation:'不同原文事项'+i,references:[ref(f.blocks[0])]}));const before=structuredClone(f),result=review(f);
 assert.deepEqual(f,before);assert.ok(result.checks.length<=80);assert.equal(typeof result.omittedCount,'number');assert.ok(result.omittedCount>0);assert.ok(result.sourceChecklist.length>80);
 for(const item of result.sourceChecklist)for(const citation of item.references)assert.equal(citation.quote,f.blocks.find(b=>b.id===citation.blockId).text);
});
