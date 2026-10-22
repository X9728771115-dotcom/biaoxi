import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicRoofFixture,createRoofContinuationFixture,createSiteArrangementFixture,createDuplicateManagerFixture} from './helpers/public-report-fixtures.js';
import mammoth from 'mammoth';
import {analyzeDocument} from '../src/core/analyzer.js';
import {exportReport} from '../src/server/export.js';
import {createWebChatRequest} from '../src/server/web-chat.js';
import {enhanceAnalysis} from '../src/server/ai.js';
import {createService} from '../src/server/service.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const fixture=createPublicRoofFixture();
const cat=(r,id)=>r.categories.find(c=>c.id===id).items;
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
const report=()=>analyzeDocument(structuredClone(fixture));
const contentModule=await import('../src/core/report-content.js').catch(()=>({}));
const document=(texts,id='generic-v3')=>({id,fileName:id+'.txt',complete:true,warnings:[],blocks:texts.map((text,i)=>({id:id+'-'+i,text,page:i+1,section:'资格要求'}))});

test('完整一般资格不能被其中税社保词替换为税社保专条',()=>{
 const r=report(),f=cat(r,'qualification').find(i=>normalize(i.quote).includes('政府采购供应商资格承诺函')&&normalize(i.quote).includes('独立承担'));
 assert.match(f.interpretation,/独立承担.*商业信誉.*财务.*税.*近三年.*设备.*专业技术.*控股.*前期/);
 assert.ok(!f.fields['材料适用分支']);
 assert.doesNotMatch(f.fields['证明材料']?.join('')||'',/^合同$/);
});
test('税社保四分支与信用四名单形成具体解释和准备材料',()=>{
 const r=report(),tax=cat(r,'qualification').find(i=>normalize(i.quote).includes('2026年1月1日')&&normalize(i.quote).includes('免税'));
 for(const word of ['山东省','提前查询','免税','任意一个月','其他不适用','加盖公章'])assert.ok(tax.interpretation.includes(word),word);
 assert.equal(tax.fields['税社保材料分支'].length,4);
 const credit=cat(r,'qualification').find(i=>normalize(i.quote).includes('提供无不良信用记录承诺函'));
 for(const name of ['严重失信主体名单','失信被执行人','重大税收违法失信主体','政府采购严重违法失信行为记录名单'])assert.ok(credit.interpretation.includes(name),name);
 assert.match(credit.interpretation,/承诺函.*截图.*公章/);
});
test('经理和业绩解释给完整资格组与AND证据而不新增最低数量金额',()=>{
 const r=report(),manager=cat(r,'personnel').find(i=>normalize(i.quote).includes('建筑工程专业')&&normalize(i.quote).includes('预中标'));
 for(const word of ['建筑工程','二级','B','本单位','在建','在施','中标','预中标','一级','电子'])assert.ok(manager.interpretation.includes(word),word);
 const performance=cat(r,'performance').find(i=>normalize(i.quote).includes('2023年1月1日'));
 assert.match(performance.interpretation,/2023年1月1日.*合同签订.*每.*1分.*3分/);
 assert.match(performance.interpretation,/合同扫描件.*以及.*验收报告扫描件.*同时/);
 assert.match(performance.interpretation,/通知书.*截图.*替代/);
});
test('项目不涉及产品与不缴保证金仍保留材料性能和赔偿义务',()=>{
 const r=report();
 for(const kind of ['强制采购','优先采购节能','环境标志']){
  const f=cat(r,'eco').find(i=>normalize(i.quote).includes(kind)&&i.applicability==='not-required');
  assert.ok(f);assert.match(f.interpretation,/不涉及/);assert.doesNotMatch(f.interpretation,/保证金/);
 }
 const liability=cat(r,'deposit').find(i=>normalize(i.quote).includes('没有提交履约保证金'));
 assert.match(liability.interpretation,/本包.*不缴纳.*赔偿/);assert.equal(liability.hard,false);
 assert.ok(!r.outputs.risks.some(i=>i.id===liability.id));
});
test('低价解释保留三个严格65%基数和先说明后无效',()=>{
 const r=report(),f=r.outputs.risks.find(i=>i.fields['低价审查触发']?.length===3);
 for(const word of ['平均值','次低','最高限价','严格低于','书面说明','必要证明','不能证明'])assert.ok(f.interpretation.includes(word),word);
 assert.match(f.interpretation,/等于.*不触发/);assert.match(f.interpretation,/数量报价.*条件/);
 assert.match(f.fields['低价阈值示例'],/729365\.00/);
});
test('付款验收链和收费依据具体，不凭空添加发票条件',()=>{
 const r=report(),payment=r.analysis.commercialRisks.find(i=>i.title==='付款触发与履约资金占用');
 assert.match(payment.interpretation,/验收合格.*审计完成.*一次.*100%/);
 assert.doesNotMatch(payment.interpretation,/发票等条件/);
 assert.match(payment.interpretation,/无明示预付款.*进度款/);
 const acceptance=r.analysis.commercialRisks.find(i=>i.title==='履约验收程序与交付资料');assert.ok(acceptance);
 for(const word of ['代理','一次性','初验','复核','四方','技术经济资料','保修书','验收报告'])assert.ok(acceptance.interpretation.includes(word),word);
 const fees=r.analysis.commercialRisks.find(i=>i.title.includes('服务费用'));
 for(const word of ['1.7%','5000','1‰','1000','20197.80'])assert.ok(fees.interpretation.includes(word),word);
});
test('源叠印、不同锚固节点、定标主体及首次最后报价分开澄清',()=>{
 const r=report(),cs=r.analysis.clarifications;
 const overlap=cs.find(i=>i.title.includes('叠印'));assert.ok(overlap);assert.ok(overlap.references.some(ref=>ref.page===23));assert.match(overlap.interpretation,/源PDF.*清晰正式/);
 const anchors=cs.find(i=>i.title.includes('锚固'));assert.ok(anchors);for(const n of ['40','80','250'])assert.ok(anchors.interpretation.includes(n));assert.match(anchors.interpretation,/节点.*图/);assert.doesNotMatch(anchors.interpretation,/无法施工/);
 const decision=cs.find(i=>i.title.includes('定标主体'));assert.ok(decision);assert.ok(decision.references.every(ref=>ref.page===40));
 assert.ok(cs.some(i=>i.title.includes('首次报价')&&i.references.some(ref=>ref.page===6)&&i.references.some(ref=>ref.page===29)));
});
test('千分位金额保留整个阈值，履约合同名词不自动成为提交材料',()=>{
 const r=analyzeDocument(document(['预算及最高限价为1,122,100.00元，供应商报价不得超过最高限价。','供应商须具有履行合同所必需的设备和专业技术能力。','工程必须按合同验收。','供应商应提交合同扫描件以及验收报告扫描件。']));
 const f=cat(r,'rejection').find(i=>i.quote.includes('1,122,100'));
 assert.ok(f.fields['阈值与数量'].includes('1,122,100.00元'));
 const capability=cat(r,'qualification').find(i=>i.quote.includes('履行合同'));assert.ok(!capability.fields['证明材料']?.includes('合同'));
});
test('共享报告聚合真实语义、保留14类四输出和所有引用，旧报告可用且不递归',()=>{
 assert.equal(typeof contentModule.buildReportContent,'function','应实现共享报告内容');
 const r=report();r.presentation={stale:true};const before=JSON.stringify(r.categories);const p=contentModule.buildReportContent(r);
 assert.deepEqual(Object.keys(p.outputs).sort(),['commitments','conclusion','risks','scoreItems']);assert.equal(p.categories.length,14);assert.deepEqual(p.overview,r.analysis.overview);assert.equal(JSON.stringify(r.categories),before);
 assert.deepEqual(p.companyAnalysis,r.companyAnalysis);assert.equal(p.outputs.scoreItems.length,13);
 assert.ok(p.categories.reduce((n,c)=>n+c.items.length,0)<r.categories.reduce((n,c)=>n+c.items.length,0));
 for(const c of p.categories){assert.ok(c.summary);for(const i of c.items){assert.ok(i.references.length);assert.ok(i.sourceFindingIds.length);}}
 assert.ok(!('presentation' in p));assert.ok(p.preparation.every(i=>i.title&&i.references.length));
});
test('同名跨来源跨包不得通过presentation合并遗漏要求',()=>{
 assert.equal(typeof contentModule.buildReportContent,'function');
 const refs=(id,page,quote)=>[{documentId:id,blockId:id+'-b',fileName:id+'.pdf',page,quote}];
 const r={categories:[{id:'qualification',title:'资质要求',items:[{id:'a',title:'资格',quote:'包1三级',scope:{documentId:'a',package:'1'},references:refs('a',1,'包1三级'),fields:{},actions:[]},{id:'b',title:'资格',quote:'包2二级',scope:{documentId:'a',package:'2'},references:refs('a',2,'包2二级'),fields:{},actions:[]},{id:'c',title:'资格',quote:'另一版本一级',scope:{documentId:'c',package:'1'},references:refs('c',3,'另一版本一级'),fields:{},actions:[]}]}],outputs:{risks:[],scoreItems:[],commitments:[],conclusion:{label:'待核验'}},analysis:{}};
 assert.equal(contentModule.buildReportContent(r).categories.find(c=>c.id==='qualification').items.length,3);
});
test('Word/PDF共享表格数据并避免整卷证据和AI原回答重复导出',async()=>{
 const r=report();r.webChat={rawText:'RAW_AI_SENTINEL_NOT_DEFAULT',categories:[],warnings:[]};
 const b=await exportReport(r,'docx'),text=(await mammoth.extractRawText({buffer:b})).value;
 for(const s of ['项目概况','废标项清单','必须加分项','必须承诺内容','投标可行性结论','14类详细分析','同类业绩','建筑工程','税社保','729365.00','企业匹配','待澄清','7.60'])assert.ok(text.includes(s),s);
 assert.ok(!text.includes('RAW_AI_SENTINEL_NOT_DEFAULT'));assert.ok(text.length<46000,`默认报告${text.length}字过长`);
 const {execFileSync}=await import('node:child_process'),{mkdtempSync,writeFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'report-v3-'));
 try{const p=join(dir,'report.docx');writeFileSync(p,b);const xml=execFileSync('unzip',['-p',p,'word/document.xml'],{encoding:'utf8',maxBuffer:3000000});assert.ok((xml.match(/<w:tbl>/g)||[]).length>=8);assert.match(xml,/<w:tblHeader/);assert.doesNotMatch(xml,/<w:trHeight[^>]*w:hRule="exact"/);assert.doesNotMatch(xml,/w:color w:val="B91C1C"/);}finally{rmSync(dir,{recursive:true,force:true});}
 const pdf=await exportReport(r,'pdf');const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:true});try{const d=await task.promise;let t='';for(let i=1;i<=d.numPages;i++)t+=(await(await d.getPage(i)).getTextContent()).items.map(i=>i.str).join('');assert.ok(d.numPages<=30,`默认PDF${d.numPages}页仍过长`);for(const s of ['同类业绩','税社保','729365.00','四方','定标主体'])assert.ok(t.includes(s),s);}finally{await task.destroy();}
});
test('AI提示允许基于证据辅助解释，禁止模型确认资格或覆盖本地预计和95%口径',async()=>{
 const input=document(['资质要求：供应商须具备有效施工资质。'],'ai-v3');const r=analyzeDocument(input);
 const req=createWebChatRequest({report:r,documents:[{id:input.id,fileName:input.fileName,path:'/tmp/ai-v3.txt',role:'tender',extraction:input}],provider:'deepseek'});
 for(const phrase of ['候选匹配','本地','人工参考','95%','合同及验收','低价'])assert.ok(req.prompt.includes(phrase),phrase);
 const prompts=[];await enhanceAnalysis(input,{enabled:true,provider:'custom',baseUrl:'https://example.test',model:'test-only',apiKey:'test-only'}, {fetchImpl:async(_,init)=>{prompts.push(JSON.parse(init.body).messages[0].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({findings:[],items:[]})},finish_reason:'stop'}]}));}});
 assert.ok(prompts.every(prompt=>prompt.includes('候选匹配')&&prompt.includes('本地')&&prompt.includes('人工参考')));
});
test('默认导出为精炼报告，details=1路由才附完整原文及AI原答复',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'biaoxi-report-v3-api-'));let service;
 try{
  service=await createService({dataDir});const r=report();r.id='report-v3-details';r.webChat={provider:'deepseek',requestId:'local-details-test',rawText:'DETAILS_ONLY_RAW_SENTINEL',warnings:[]};await service.store.saveReport(r);
  const {token}=await(await fetch(service.url+'/api/bootstrap')).json(),headers={'X-Biaoxi-Token':token};
  for(const details of ['', '&details=1']){const response=await fetch(service.url+'/api/reports/'+r.id+'/export?format=docx'+details,{headers});assert.equal(response.status,200);const output=(await mammoth.extractRawText({buffer:Buffer.from(await response.arrayBuffer())})).value;assert.equal(output.includes('DETAILS_ONLY_RAW_SENTINEL'),Boolean(details));assert.ok(output.includes('729365.00'));assert.ok(output.includes('第23页'));}
 }finally{await service?.close();await rm(dataDir,{recursive:true,force:true});}
});
test('项目三种产品政策不涉及分别限制同范围模板，不抹去另包或履约材料性能',()=>{
 const source=document(['采购包1：本项目涉及优先采购节能产品：不涉及。','注：响应产品属于节能产品政府采购品目清单中优先采购产品的，供应商提供有效节能认证证书，可以享受优先采购政策。','采购包1：本项目涉及优先采购环境标志产品：不涉及。','注：响应产品属于环境标志产品政府采购品目清单的，供应商提供有效认证截图，可以享受优先采购政策。','采购包2：环保设备属于强制采购产品，必须提供有效认证证书，否则无效响应。','采购包1：施工期间主要材料必须符合国家环保要求，进场前经采购人确认。']);const r=analyzeDocument(source);
 for(const term of ['节能产品政府采购品目清单','环境标志产品政府采购品目清单']){const f=cat(r,'eco').find(item=>item.quote.includes(term));assert.equal(f.applicability,'not-required');assert.match(f.interpretation,/不涉及/);}
 assert.ok(cat(r,'eco').some(item=>item.quote.includes('采购包2')&&item.hard));assert.ok(cat(r,'eco').some(item=>item.quote.includes('施工期间')&&item.applicability!=='not-required'));
});
test('报价限价示例使用实际最高限价，不把预算或别包数字代入65%',()=>{
 const r=analyzeDocument(document(['采购包1：预算金额1200000元，最高限价1000000元。','采购包1：响应报价低于最高限价65%时启动异常低价审查，供应商先提供书面说明及必要证明，不能证明合理性才按无效响应处理。','采购包2：最高限价2000000元。']));
 const f=r.categories.flatMap(category=>category.items).find(item=>item.fields['低价审查触发']);assert.ok(f,'应定位低价审查');assert.match(f.fields['低价阈值示例'],/650000\.00/);assert.doesNotMatch(f.fields['低价阈值示例'],/780000|1300000/);
});
test('共享评分已有结构表时仍保留另段真实附加规则及未知封顶',()=>{
 const input=document(['技术评分：技术方案满足要求满分40分。','提供有效环境认证的产品每项额外加2分；此段未说明累计上限。']);const r=analyzeDocument(input),p=contentModule.buildReportContent(r);
 assert.ok(r.analysis.scoring.items.length);assert.ok(r.outputs.scoreItems.some(item=>item.quote.includes('每项额外加2分')));assert.ok(p.outputs.scoreItems.some(item=>item.quote.includes('每项额外加2分')));assert.equal(p.scoring.total,40);assert.ok(p.clarifications.some(item=>/封顶/.test(item.title)));
});
test('合成屋面概况与工程解读直接展示项目编号、原文数量单位和防水层次',()=>{
 const r=report();assert.ok(r.analysis.overview.some(item=>item.label==='项目编号'&&item.value==='SYNTH-ROOF-2026-01'));
 assert.equal(r.analysis.overview.find(item=>item.label==='采购人').value,'示例公共设施管理中心(虚构)');assert.equal(r.analysis.overview.find(item=>item.label==='代理机构')?.value,'示例采购服务机构(虚构)');
 const engineering=r.analysis.technical.find(item=>item.quantities?.length);
 for(const [name,quantity,unit] of [['坡屋面持钉层','1200','m2'],['屋面防水工程','1250','m2'],['排水水嘴安装','12','组'],['雨水口','8','组'],['屋面锚固构造','100','m']])assert.ok(engineering.quantities.some(row=>row.name===name&&row.quantity===quantity&&row.unit===unit),name);
 for(const text of ['40厚C20','双向钢筋网','3','2'])assert.ok(engineering.interpretation.includes(text),text);
 assert.match(engineering.interpretation,/上层.*卷材.*下层.*涂料.*防水试验/);
});
test('报告重算在当前企业输出之后构建presentation，保留快照与人工参考估计',()=>{
 const r=report();assert.ok(r.presentation,'summarizeReport应挂共享内容');assert.deepEqual(r.presentation.companyAnalysis,r.companyAnalysis);assert.equal(r.presentation.outputs.conclusion.label,r.outputs.conclusion.label);assert.equal(r.presentation.categories.length,14);
});
test('默认报告保留首次与最后报价各自纠错顺序及三名候选依据',()=>{
 const r=report(),p=contentModule.buildReportContent(r);
 const first=p.outputs.risks.find(item=>/首次清单/.test(item.title));assert.ok(first);for(const phrase of ['大写','先澄清','单价','费率','小数点','书面','授权代表','电子'])assert.ok(first.interpretation.includes(phrase),phrase);
 const final=p.outputs.risks.find(item=>/最后报价纠错/.test(item.title));assert.ok(final);for(const phrase of ['大写','错位','总价','单价汇总','顺序','电子'])assert.ok(final.interpretation.includes(phrase),phrase);
 assert.ok(p.categories.find(c=>c.id==='method').items.some(item=>/推荐3名/.test(item.interpretation)));
});
test('其他文件明确经营范围条件不会被屋面主体摘要误免除',()=>{
 const r=analyzeDocument(document(['供应商营业执照经营范围必须包含建筑施工，未满足按无效响应处理。'])),p=contentModule.buildReportContent(r);
 assert.match(p.categories.find(c=>c.id==='entity').items[0].interpretation,/经营范围.*必须包含建筑施工/);assert.doesNotMatch(p.categories.find(c=>c.id==='entity').items[0].interpretation,/未单列/);
});
test('默认presentation不传重复requirement段落，不同解释条件仍完整保留',()=>{
 const p=report().presentation;for(const item of [...p.categories.flatMap(category=>category.items),...p.outputs.risks,...p.outputs.commitments,...p.outputs.scoreItems])assert.ok(!item.requirement||normalize(item.requirement)!==normalize(item.interpretation));
 const item={id:'different-fields',title:'设备与证书',requirement:'须提供主要设备清单。',interpretation:'设备对应认证证书须在有效期内。',fields:{},references:[{documentId:'different',blockId:'b',page:1,quote:'须提供主要设备清单，并提交有效认证证书。'}]};
 const content=contentModule.buildReportContent({categories:[{id:'qualification',items:[item]}]});const value=content.categories.find(c=>c.id==='qualification').items[0];assert.ok(value.interpretation.includes('主要设备清单'));assert.ok(value.interpretation.includes('有效期内'));
});

// R1–R5 independent-review counterexamples. Each assertion concerns a visible business rule.
const reviewProbe=(texts,{section='资格要求',id='review-v3',attachments=[]}={})=>analyzeDocument({...document(texts,id),blocks:document(texts,id).blocks.map(block=>({...block,section}))},{attachments});
const matching=(r,id,needle)=>cat(r,id).find(item=>normalize(item.quote).includes(needle));
test('R1 信用材料OR不能强改AND或新增盖章',()=>{
 const r=reviewProbe(['供应商须提供无不良信用记录承诺函或信用中国失信被执行人查询截图，任一即可。']),f=matching(r,'qualification','无不良信用');
 assert.match(f.fields['信用材料关系'],/OR|任选|任一/);assert.doesNotMatch(f.fields['信用材料关系'],/AND|公章/);assert.match(f.interpretation,/或|任选|任一/);assert.doesNotMatch(f.interpretation,/以及.*截图.*公章/);
});
test('R1 信用截图免除不反转成必交',()=>{
 const r=reviewProbe(['供应商须提供无不良信用记录承诺函，无需提交失信被执行人查询截图。']),f=matching(r,'qualification','无不良信用');
 assert.match(f.interpretation,/无需提交.*截图|截图.*免除/);assert.doesNotMatch(f.interpretation,/需要.*以及.*截图/);
});
test('R1 同类业绩合同或验收证明保留任选路径',()=>{
 const r=reviewProbe(['同类业绩以合同签订时间为准：2023年1月1日至今，每提供1个合同得1分，最多3分；提交合同扫描件或验收报告扫描件，任选其一即可。']),f=matching(r,'performance','合同扫描件');
 assert.match(f.fields['材料关系'],/OR|任选/);assert.match(f.interpretation,/或.*验收报告|任选/);assert.doesNotMatch(f.interpretation,/须同时具备/);
});
test('R1 业绩实际100万元门槛不得说无金额下限',()=>{
 const r=reviewProbe(['同类业绩以合同签订时间为准：2023年1月1日至今，每提供1个合同得1分，最多3分；合同金额不得低于100万元；提交合同扫描件以及验收报告扫描件。']),f=matching(r,'performance','合同扫描件');
 assert.match(f.interpretation,/不得低于100万元|100万元.*门槛/);assert.doesNotMatch(f.interpretation,/未设合同金额下限/);assert.match(f.fields['材料关系'],/AND|同时/);assert.doesNotMatch(f.interpretation,/加盖公章/);
});
test('R1 经理免B且未列兼职时不得补出准入条件',()=>{
 const r=reviewProbe(['项目经理须为建筑工程专业注册二级及以上建造师，在本单位注册，不要求安全生产考核B类证书。']),f=matching(r,'personnel','不要求安全生产考核B');
 assert.match(f.interpretation,/不要求.*B|B.*无需/);assert.doesNotMatch(f.interpretation,/有效安全生产考核B类证书|并且不兼职/);assert.ok(!f.actions.some(action=>/核对.*B证.*不兼职事实/.test(action)));
});
test('R2 有效期补正例外必须显示，不自动新增无效后果',()=>{
 const r=reviewProbe(['供应商须承诺响应有效期90日历日，未明确有效期可按磋商小组要求补正。']),f=r.presentation.categories.find(c=>c.id==='commitment').items[0];
 assert.match(f.interpretation,/90日历日.*未明确.*补正/);assert.doesNotMatch(f.interpretation,/未明确或不足.*无效/);
});
test('R2 不统一组织不能免除强制自主踏勘证明',()=>{
 const r=reviewProbe(['不组织统一现场考察。供应商必须自行踏勘并提交采购人确认的踏勘证明，否则响应无效。']),f=r.presentation.categories.find(c=>c.id==='survey').items[0];
 assert.match(f.interpretation,/必须自行踏勘.*踏勘证明.*无效/);assert.doesNotMatch(f.interpretation,/未定位到强制|为准备建议/);
});
test('R2 响应免保证金与履约5%正向要求分别留在可见正文',()=>{
 const r=reviewProbe(['响应保证金不收取。','履约保证金必须按成交额5%提交。'],{section:'保证金要求'}),items=r.presentation.categories.find(c=>c.id==='deposit').items;
 assert.ok(items.some(item=>/响应保证金.*不收取/.test(item.interpretation)));assert.ok(items.some(item=>/履约保证金.*5%.*提交/.test(item.interpretation)));assert.ok(items.length>=2);
});
test('R3 合同内容不得实质变动不变成允许或新增通知程序',()=>{
 const r=reviewProbe(['磋商过程中不得实质性变动合同内容，采购人代表应当确认最终磋商文件。']);const f=r.analysis.methodDetails.find(item=>/实质/.test(item.title));
 assert.match(f.interpretation,/不得实质性变动合同内容/);assert.doesNotMatch(f.interpretation,/合同内容可|通知.*全体|工程量清单不属/);
});
test('R3 允许分包与禁止转包独立，且不同包来源阶段不并成一结论',()=>{
 const r=reviewProbe(['采购包1：不允许分包。','采购包2：允许分包，但严禁成交供应商将合同转包。'],{section:'合同要求'}),items=r.analysis.technical.filter(item=>/分包.*转包/.test(item.title));
 const p2=items.find(item=>item.references.some(ref=>ref.quote.includes('采购包2')));assert.ok(p2);assert.match(p2.interpretation,/允许分包.*严禁.*转包/);assert.doesNotMatch(p2.interpretation,/本包不允许分包/);assert.ok(!p2.references.some(ref=>ref.quote.includes('采购包1')));
 const other={...document(['采购包1：履行合同期间允许分包。'],'other-source'),blocks:document(['采购包1：履行合同期间允许分包。'],'other-source').blocks.map(block=>({...block,section:'合同要求'}))};
 const scoped=reviewProbe(['采购包1：不允许分包。'],{section:'响应要求',attachments:[other]});assert.ok(scoped.analysis.technical.filter(item=>/分包.*转包/.test(item.title)).every(item=>new Set(item.references.map(ref=>ref.documentId)).size===1));
});
test('R5 预算和限价分别提取，费用示例以真实限价18000计算',()=>{
 const r=reviewProbe(['预算金额1200000元，最高限价1000000元。','代理服务费按成交金额的1.7%计取，不足5000元按5000元计取。','公证费按成交金额的1‰计取，不足1000元按1000元计取。']);
 assert.ok(r.analysis.overview.some(item=>/预算/.test(item.label)&&item.value.includes('1200000')));assert.ok(r.analysis.overview.some(item=>item.label==='最高限价'&&item.value.includes('1000000')));
 const fees=r.analysis.commercialRisks.find(item=>/服务费用/.test(item.title));assert.match(fees.interpretation,/最高限价1000000\.00元.*合计18000\.00元/);assert.doesNotMatch(fees.interpretation,/最高限价1200000|21600\.00/);
});
test('R5 没有同包明确限价仅列收费公式，不套别包或别来源示例',()=>{
 const attachment=document(['采购包2：最高限价2000000元。'],'fee-other');
 const r=reviewProbe(['采购包1：预算金额1200000元。','采购包1：代理服务费按成交金额的1.7%计取，不足5000元按5000元计取。','采购包1：公证费按成交金额的1‰计取，不足1000元按1000元计取。'],{attachments:[attachment]});const fees=r.analysis.commercialRisks.find(item=>/服务费用/.test(item.title));
 assert.match(fees.interpretation,/max\(成交金额/);assert.doesNotMatch(fees.interpretation,/最高限价.*作示例/);assert.match(fees.interpretation,/限价.*待核验|未明示.*限价/);assert.ok(fees.references.every(ref=>ref.documentId===r.documentId));
});

const visibleItems=r=>[...r.presentation.categories.flatMap(c=>c.items),...r.presentation.outputs.risks,...r.presentation.outputs.commitments,...r.presentation.outputs.scoreItems,...r.presentation.technical,...r.presentation.commercialRisks];
test('R2 屋面采购方开启后信用查验独立显示渠道名单与截止前记录',()=>{
 const r=report(),f=visibleItems(r).find(i=>/采购方信用/.test(i.title));assert.ok(f);
 for(const word of ['开启结束后','采购人','代理机构','信用中国','中国政府采购网','信用山东','提交响应文件截止时间前','网页截图','失信被执行人','重大税收违法','政府采购严重违法','严重违法失信企业名单'])assert.ok(f.interpretation.includes(word),word);
 assert.ok(f.references.some(ref=>ref.page===7));assert.match(f.interpretation,/供应商.*自交.*不能互替/);
});
test('R2 屋面5%评审价优惠主体行业与材料默认可见不当5分',()=>{
 const r=report(),f=visibleItems(r).find(i=>/评审价格扣除/.test(i.title));assert.ok(f);
 for(const word of ['5%','小型','微型','监狱','残疾人福利性','建筑业','中型','中小企业声明函','监狱企业','残疾人福利性单位声明函','不接受联合体'])assert.ok(f.interpretation.includes(word),word);
 assert.doesNotMatch(f.interpretation,/标的所属行业、/);assert.ok(f.references.some(ref=>ref.page===38));assert.ok(f.references.some(ref=>ref.page===13));assert.ok(f.references.some(ref=>ref.page===4));assert.doesNotMatch(f.interpretation,/加5分/);
});
test('R2 屋面承诺清单回链90天四★和按身份磋商响应的条件材料',()=>{
 const items=report().presentation.outputs.commitments;
 assert.ok(items.some(i=>/有效期/.test(i.title)&&/90日历日/.test(i.interpretation)&&i.references.some(ref=>ref.page===31)));
 assert.equal(items.filter(i=>i.fields?.['实质性要求']).length,4);
 const conditional=items.find(i=>/条件性声明|条件材料/.test(i.title));assert.ok(conditional);
 for(const word of ['中小企业声明函','监狱企业的证明文件','残疾人福利性单位声明函','磋商响应','供应商响应表','其他服务承诺','如有','法定名称','电子印章'])assert.ok(conditional.interpretation.includes(word),word);
 assert.ok(conditional.references.some(ref=>ref.page===38));assert.ok(conditional.references.some(ref=>ref.page===31));assert.ok(conditional.references.some(ref=>ref.page===41));
});
test('R2 屋面知识产权完整三款从真实上下文呈入默认承诺',()=>{
 const f=report().presentation.outputs.commitments.find(i=>/知识成果|知识产权/.test(i.title));assert.ok(f);
 for(const word of ['不侵权','责任','赔偿','采购人','开发接口','开发手册','无限期支持','合法使用','费用','报价'])assert.ok(f.interpretation.includes(word),word);
 assert.ok(f.references.some(ref=>ref.page===6&&normalize(ref.quote).includes('专利权')));assert.ok(f.references.some(ref=>ref.page===6&&normalize(ref.quote).includes('合法使用')));
});
test('R2 屋面保险和两处有条件恢复责任在默认正文且源叠印保留',()=>{
 const r=report(),f=r.presentation.technical.find(i=>/施工保险.*恢复责任/.test(i.title));assert.ok(f);
 for(const word of ['工程一切','第三方责任险','自行投保','保险费','不单独报价','非施工部位','免费恢复','施工原因','既有设施','承担'])assert.ok(f.interpretation.includes(word),word);
 assert.ok(f.references.some(ref=>ref.page===15));assert.ok(f.references.some(ref=>ref.page===23));assert.doesNotMatch(f.interpretation,/任何原因.*损坏.*承担|全部.*原有损坏/);assert.ok(r.presentation.clarifications.some(i=>/叠印/.test(i.title)));
});
test('R2 屋面四★默认后果真正显示负偏离无效并保留共同来源',()=>{
 const r=report(),stars=r.presentation.outputs.risks.filter(i=>i.fields?.['实质性要求']);assert.equal(stars.length,4);
 for(const i of stars){assert.match(i.interpretation,/负偏离.*无效报价/);assert.match(i.consequence,/负偏离.*无效报价/);assert.ok(i.references.some(ref=>ref.page===24&&normalize(ref.quote).includes('如负偏离')));assert.doesNotMatch(i.consequence,/未明确直接否决/);}
 const other=reviewProbe(['采购包1：★付款方式：工程验收后支付。','采购包2：标注★的条款负偏离按无效报价处理。'],{section:'商务要求'});const star=cat(other,'payment').find(i=>i.fields?.['实质性要求'])||other.categories.flatMap(c=>c.items).find(i=>i.fields?.['实质性要求']);assert.ok(star);assert.doesNotMatch(star.interpretation,/负偏离.*无效报价/);assert.ok(!star.references.some(ref=>ref.quote.includes('采购包2')));
});
test('R2 屋面核心进口不涉及与禁止进口响应默认可见，不套本国产品20%模板',()=>{
 const r=report();assert.ok(r.presentation.overview.some(i=>/核心产品/.test(i.label)&&/不涉及/.test(i.value)));assert.ok(r.presentation.overview.some(i=>/进口产品/.test(i.label)&&/不涉及/.test(i.value)));
 const f=visibleItems(r).find(i=>/进口产品适用/.test(i.title));assert.ok(f);assert.match(f.interpretation,/本范围.*不涉及.*不得提供进口产品/);assert.match(f.interpretation,/涉及.*国产产品满足.*也可/);assert.ok(f.references.some(ref=>ref.page===14));assert.doesNotMatch(f.interpretation,/20%|80%/);
});
test('R2 最后报价提交规则与修正确认不同事项各保留电子章和不可撤回',()=>{
 const r=report(),f=r.presentation.categories.find(c=>c.id==='method').items.find(i=>/最后报价提交与不可撤回/.test(i.title));assert.ok(f);
 for(const word of ['规定的时间','法定名称','电子印章','提交后','不得以任何理由撤回','唯一','最高限价'])assert.ok(f.interpretation.includes(word),word);assert.ok(f.references.some(ref=>ref.page===32&&normalize(ref.quote).includes('法定名称')));
 assert.ok(r.presentation.outputs.risks.some(i=>/最后报价纠错/.test(i.title)&&/修正/.test(i.interpretation)));
});
test('R2 真实屋面新增义务同源默认Word和PDF sections可见且不靠全文附录',async()=>{
 const r=report(),out=(await mammoth.extractRawText({buffer:await exportReport(r,'docx')})).value;
 for(const word of ['信用山东','严重违法失信企业名单','5%','建筑业','不侵权','合法使用','第三方责任险','施工原因','不得以任何理由撤回','法定名称'])assert.ok(out.includes(word),word);
 assert.ok(!out.includes('完整原文证据附录'));
});
test('R2 屋面主材响应及进场要求有真实15和35页引用，与无样品分别说明',()=>{
 const r=report(),f=r.presentation.categories.find(c=>c.id==='sample').items.find(i=>/主要材料响应/.test(i.title)&&/品牌/.test(i.interpretation));assert.ok(f);
 for(const word of ['进场前','采购人确认','响应文件','品牌','产地','可溯源','10分','0.5分','缺项不得分'])assert.ok(f.interpretation.includes(word),word);
 assert.ok(f.references.some(ref=>ref.page===15));assert.ok(f.references.some(ref=>ref.page===35));assert.ok(r.presentation.categories.find(c=>c.id==='sample').items.some(i=>/无需提交样品/.test(i.interpretation)));
 const score=r.presentation.outputs.scoreItems.find(i=>/主要材料/.test(i.title));assert.match(score.interpretation,/品牌.*产地.*可溯源/);assert.ok(score.references.some(ref=>ref.page===15));assert.equal(score.maxScore,10);
});
test('R2 屋面模板名称占位空白与四★参数边界有可见澄清',()=>{
 const r=report(),text=r.presentation.clarifications.map(i=>i.interpretation+' '+i.actions.join(' ')).join(' ');
 for(const word of ['供应商承诺函','投标人承诺函','未填写','第45页','空白','附件','合同'])assert.ok(text.includes(word),word);
 assert.ok(r.presentation.clarifications.some(i=>i.references.some(ref=>ref.page===45)));assert.ok(visibleItems(r).some(i=>/相当于或优于/.test(i.interpretation)&&/★/.test(i.interpretation)));
});
test('R2 屋面内部预测明确批注来源及原文不设独立附加5分',()=>{
 const r=report(),text=r.presentation.overview.map(i=>i.label+' '+i.value).join(' ');
 for(const word of ['用户批注','企业内部','技术82','报价10','人员10','主材10','独立附加5分','未设'])assert.ok(text.includes(word),word);
 assert.equal(r.presentation.outputs.scoreItems.length,13);assert.equal(r.presentation.scoring.total,100);assert.equal(r.companyAnalysis.companyId,null);
});
test('R2 屋面默认工程摘要不采用泛提示或叠印断片，现场误解不获批准带23页',()=>{
 const r=report();for(const item of r.presentation.technical){assert.doesNotMatch(item.interpretation,/^依原文整理|^提取评分标准|\|\||第17.*页-/);}
 const engineering=r.presentation.technical.find(i=>i.quantities);assert.match(engineering.interpretation,/40厚C20.*双向钢筋网/);
 const survey=r.presentation.categories.find(c=>c.id==='survey').items.find(i=>/不获批准/.test(i.interpretation));assert.ok(survey);assert.ok(survey.references.some(ref=>ref.page===23));assert.doesNotMatch(survey.interpretation,/必须.*踏勘证明/);
});
test('R2 已可靠识别评分列使用可读标准，原standard和引用整行保留供计算',async()=>{
 const r=report();assert.equal(r.analysis.scoring.items.length,13);
 for(const score of r.analysis.scoring.items){assert.ok(score.readableStandard,score.title);assert.ok(!score.readableStandard.includes('|'),score.title);assert.ok(score.standard.includes('|'),score.title);assert.ok(score.references.some(ref=>ref.quote.includes('|')));const presented=r.presentation.outputs.scoreItems.find(i=>i.id===score.id);assert.equal(presented.standard,score.readableStandard);assert.equal(presented.rawStandard,score.standard);assert.ok(presented.fields['评分性质']);}
 const {buildReportSections}=await import('../src/server/export.js');const rows=buildReportSections(r).find(section=>section.title==='必须加分项').blocks.find(block=>block.kind==='table').rows;
 assert.ok(rows.length===13);assert.ok(rows.every(row=>!row[2].includes('|')));assert.ok(rows.find(row=>row[0].includes('主要材料'))[2].includes('0.5分'));assert.ok(rows.find(row=>row[0].includes('同类业绩'))[2].includes('验收报告扫描件'));
});

test('R2 评分表不能可靠确定标准列时保留完整标准不强截',()=>{
 const cells=['复杂说明','方案一','适用A或B材料，满足方案每项得2分，最高4分。','4','材料甲或材料乙'];const quote=cells.join(' | ');
 const r=analyzeDocument({id:'unknown-columns',fileName:'unknown.txt',complete:true,warnings:[],blocks:[{id:'unknown-row',text:quote,page:1,section:'评分标准',kind:'table',tableRows:[{cells,text:quote}],tableHeaders:[]}]});
 assert.equal(r.analysis.scoring.items.length,1);assert.equal(r.analysis.scoring.items[0].readableStandard,undefined);assert.equal(r.presentation.outputs.scoreItems[0].standard,r.analysis.scoring.items[0].standard);assert.ok(r.presentation.outputs.scoreItems[0].standard.includes('适用A或B材料'));
});
test('R4 完整评分表已同源呈现的常规评分事项精确回链，独立新增解释不被吞',async()=>{
 const {buildReportSections}=await import('../src/server/export.js'),r=report();
 const sections=buildReportSections(r),details=sections.find(s=>s.title==='14类详细分析').blocks.filter(b=>b.kind==='table').flatMap(b=>b.rows);
 const standard=r.analysis.scoring.items.find(i=>i.title==='施工组织整体设想');const rows=details.filter(row=>row[0]===standard.title);assert.ok(rows.length);assert.ok(rows.every(row=>/详见.*评分表/.test(row[1])));
 const independent='该项还须提供供应商提交的特别设备清单。';const f=cat(r,'scoring').find(i=>i.id===standard.id);f.interpretation+='\n'+independent;
 const changed=buildReportSections(r).find(s=>s.title==='14类详细分析').blocks.filter(b=>b.kind==='table').flatMap(b=>b.rows);assert.ok(changed.some(row=>row[0]===standard.title&&row[1].includes(independent)));
});
test('R1 未列完整经理和税制前提时保留具体原文，不补B证兼职或任意一月',()=>{
 const manager=matching(reviewProbe(['项目经理须具有工程高级职称，提供职称证明材料。']),'personnel','高级职称');assert.match(manager.interpretation,/高级职称/);assert.doesNotMatch(manager.interpretation,/须.*B类|须.*不兼职|在本单位注册/);assert.ok(!manager.actions.some(a=>/B类|在建|预中标/.test(a)));
 const tax=matching(reviewProbe(['供应商须提交最近连续三个月社会保障资金缴纳证明，无需税收证明。']),'qualification','连续三个月');assert.match(tax.interpretation,/连续三个月/);assert.doesNotMatch(tax.interpretation,/任意一月|注册地.*实际缴纳地/);
});
test('R4 默认无企业资料采用短说明保留内部假设，不重复空预计评分表',async()=>{
 const {buildReportSections}=await import('../src/server/export.js');const section=buildReportSections(report()).find(s=>s.title==='企业匹配与得分测算');assert.ok(section.blocks.every(b=>b.kind!=='table'));assert.ok(section.blocks.length<=4);
 const text=section.blocks.map(b=>b.text).join(' ');for(const phrase of ['真实原件','待核验','95%','7.60','用户批注','82','10','主材','附加5分'])assert.ok(text.includes(phrase),phrase);
});
test('R3 项目禁分包与通用拟分包分支同包回链，不反向开放项目',()=>{
 const r=report(),f=r.presentation.technical.find(i=>/分包与转包/.test(i.title)&&/拟在成交后/.test(i.interpretation));assert.ok(f);assert.match(f.interpretation,/同来源同采购包.*明确不允许分包.*不能作为.*开放/);assert.ok(f.references.some(ref=>normalize(ref.quote).includes('不允许分包')));
});
test('R2 清晰来源保险责任摘要不虚构叠印缺陷或他方责任主体',()=>{
 const r=reviewProbe(['工程一切风险和第三方责任险由供应商自行投保，保险费由供应商承担并支付，不单独报价。'],{section:'施工保险要求'}),f=r.presentation.technical.find(i=>/施工保险/.test(i.title));assert.ok(f);assert.doesNotMatch(f.interpretation,/叠印|清晰正式版/);
 const other=reviewProbe(['工程一切风险和第三方责任险由采购人自行投保。'],{section:'施工保险要求'});assert.ok(!other.presentation.technical.some(i=>/供应商自行投保/.test(i.interpretation)));
});

const uploadedRoof=createRoofContinuationFixture;
test('N1 经理摘要及默认sections保留连续6个月本单位社保与10年经验',async()=>{
 const r=reviewProbe(['项目经理须为建筑工程专业注册二级及以上建造师，在本单位注册，并须提供最近连续6个月本单位社保证明，且具有10年施工管理经验。']);
 for(const id of ['qualification','personnel']){const item=r.presentation.categories.find(c=>c.id===id).items.find(i=>/项目经理/.test(i.interpretation));assert.ok(item);assert.match(item.interpretation,/最近连续6个月本单位社保证明/);assert.match(item.interpretation,/10年施工管理经验/);}
 const {buildReportSections}=await import('../src/server/export.js');const text=JSON.stringify(buildReportSections(r));assert.ok(text.includes('最近连续6个月本单位社保证明'));assert.ok(text.includes('10年施工管理经验'));assert.equal(r.outputs.conclusion.label,'待核验');
});
test('N1 业绩默认摘要保留实际山东省地域限定且不改变计分standard',async()=>{
 const source='同类业绩以合同签订时间为准：2023年1月1日至今，每提供1个合同得1分，最多3分；项目地点须在山东省，提交合同扫描件以及验收报告扫描件。',r=reviewProbe([source]);
 const item=r.presentation.categories.find(c=>c.id==='performance').items.find(i=>i.quote.includes('合同签订'));assert.ok(item);assert.match(item.interpretation,/项目地点须在山东省/);
 assert.equal(r.analysis.scoring.items[0].standard,source);assert.equal(r.analysis.scoring.items[0].maxScore,3);const {buildReportSections}=await import('../src/server/export.js');const details=buildReportSections(r).find(section=>section.title==='14类详细分析');assert.ok(JSON.stringify(details).includes('项目地点须在山东省'));
});
test('N2 合成屋面续行只在完整同源工程数量与锚固项呈现 默认不输出断片',async()=>{
 const source=uploadedRoof(),before=JSON.stringify(source),r=analyzeDocument(structuredClone(source));const continuation=source.blocks.find(b=>b.page===18&&normalize(b.text).includes('防水试验3:1:3'));assert.ok(continuation);
 const fragment=r.presentation.technical.filter(i=>i.title==='施工与履约实施要求'&&i.references.some(ref=>ref.blockId===continuation.id));assert.equal(fragment.length,0);
 const engineering=r.presentation.technical.find(i=>i.quantities),waterproof=engineering.quantities.find(row=>normalize(row.name).includes('屋面防水工程'));assert.ok(waterproof);assert.match(waterproof.description,/3\.0厚弹性体/);assert.match(waterproof.description,/1\.5厚/);assert.match(waterproof.description,/防水试验；/);assert.match(waterproof.description,/1:3水泥砂浆找平层.*厚15；/);
 for(const word of ['∅10','@900x900','檐口100','80mm','250mm','焊接绑牢','局部找平','拆除后清理修补'])assert.ok(waterproof.description.includes(word),word);assert.ok(waterproof.references.some(ref=>ref.page===17));assert.ok(waterproof.references.some(ref=>ref.page===18));assert.ok(r.presentation.clarifications.some(i=>/锚固/.test(i.title)&&i.references.some(ref=>ref.blockId===continuation.id)));
 const {buildReportSections}=await import('../src/server/export.js');assert.doesNotMatch(normalize(JSON.stringify(buildReportSections(r))),/防水试验3:1:3|厚154:板内植筋/);assert.ok(normalize(JSON.stringify(buildReportSections(r,{includeRaw:true}))).includes('防水试验3:1:3'));assert.equal(JSON.stringify(source),before);assert.ok(r.categories.flatMap(c=>c.items).some(i=>i.references.some(ref=>ref.blockId===continuation.id)));
});
test('N2 同一续行存在未覆盖独立备注时不得省略该实施事项',()=>{
 const source=uploadedRoof(),block=source.blocks.find(b=>b.page===18&&normalize(b.text).includes('防水试验3:1:3')),extra='独立节点还须提供监理复核记录。';const row=block.tableRows[0];row.cells[6]=extra;row.text=row.cells.join(' | ');block.text=row.text;const r=analyzeDocument(source);
 assert.ok(r.presentation.technical.some(i=>i.title==='施工与履约实施要求'&&i.interpretation.includes(extra)&&i.references.some(ref=>ref.blockId===block.id)));
});
test('合成报告必须承诺主清单补足反贿赂 供应商承诺及法代或授权并回链合成原条',async()=>{
 const r=analyzeDocument(createPublicRoofFixture()),before=JSON.stringify(r.categories),original=contentModule.buildReportContent(r).categories.find(c=>c.id==='commitment').items.find(i=>/反商业贿赂/.test(i.title));assert.ok(original);
 const p=contentModule.buildReportContent(r),items=p.outputs.commitments.filter(i=>/反商业贿赂/.test(i.title));assert.equal(items.length,1,'必须承诺主清单须单列已有的三组材料');const item=items[0];
 for(const phrase of ['自觉抵制政府采购领域商业贿赂行为承诺书','供应商承诺函','法定代表人资格证明书','或法定代表人授权委托书'])assert.ok(normalize(item.interpretation).includes(phrase),phrase);
 assert.deepEqual(item.sourceFindingIds,original.sourceFindingIds);assert.ok(item.references.some(ref=>ref.documentId===r.documentId&&ref.page===30));assert.equal(new Set(p.outputs.commitments.map(i=>i.id)).size,p.outputs.commitments.length);assert.equal(p.outputs.scoreItems.length,13);assert.equal(p.scoring.total,100);assert.equal(p.companyAnalysis.companyId,null);assert.equal(p.outputs.conclusion.label,'待核验');assert.equal(JSON.stringify(r.categories),before);
 const {buildReportSections}=await import('../src/server/export.js');const rows=buildReportSections(r).find(section=>section.title==='必须承诺内容').blocks.find(block=>block.kind==='table').rows,entry=rows.find(row=>/反商业贿赂/.test(row[0]));assert.ok(entry);assert.match(entry[0],/供应商承诺.*法代证明或授权/);assert.match(entry[1],/详见废标项清单|自觉抵制政府采购领域商业贿赂/);assert.match(entry[2],/30/);
});
test('合成屋面现场考察与标前答疑免组织安排都有具体名称和4 5 23页依据',async()=>{
 const finalSource=createSiteArrangementFixture(),r=analyzeDocument(finalSource),survey=r.presentation.categories.find(c=>c.id==='survey'),arrangement=survey.items.find(i=>/不组织/.test(i.interpretation)&&/标前答疑/.test(i.interpretation));assert.ok(arrangement,'免组织安排必须明确标前答疑');assert.match(arrangement.interpretation,/不组织.*现场考察.*标前答疑|不组织.*标前答疑.*现场考察/);
 assert.ok(arrangement.references.some(ref=>ref.page===4));assert.ok(arrangement.references.some(ref=>ref.page===5&&normalize(ref.quote).includes('不组织标前答疑')));const responsibility=survey.items.find(i=>/不获批准/.test(i.interpretation));assert.ok(responsibility);assert.ok(responsibility.references.some(ref=>ref.page===23));assert.doesNotMatch(arrangement.interpretation,/必须.*踏勘证明/);
 const {buildReportSections}=await import('../src/server/export.js');const details=buildReportSections(r).find(section=>section.title==='14类详细分析'),text=JSON.stringify(details);assert.ok(text.includes('不组织统一现场考察、标前答疑'));assert.ok(text.includes('不获批准'));assert.equal(r.outputs.conclusion.label,'待核验');assert.equal(r.presentation.scoring.total,100);
});

test('合成默认报告经理整段和法律条件只精确显示一次且完整来源及独立条件不丢',async()=>{
 const actual=analyzeDocument(createDuplicateManagerFixture()),before=JSON.stringify(actual),p=contentModule.buildReportContent(actual);
 const intro='企业须具备建筑工程施工总承包二级及以上资质和有效安全生产许可证。';
 const manager=p.outputs.risks.find(i=>i.title==='企业资质及项目经理全组资格');assert.ok(manager);assert.equal(manager.interpretation.split(intro).length-1,1,'同范围解读整段不能重复');assert.equal(manager.interpretation.split('本条完整条件一并核对：').length-1,1,'仅列表前序号与标题分隔符不同的完整原条件不重复');
 for(const page of [2,3,29])assert.ok(manager.references.some(ref=>ref.page===page));assert.ok(manager.sourceFindingIds.length>=2);assert.equal(JSON.stringify(actual),before,'原始条款和来源不得改写');
 const legal=p.outputs.risks.find(i=>/符合法律/.test(i.title));assert.equal(normalize(legal.interpretation).split('符合法律、行政法规规定的其他条件').length-1,1);assert.ok(legal.references.some(ref=>ref.page===28));
 const {buildReportSections}=await import('../src/server/export.js'),row=buildReportSections(actual).find(s=>s.title==='废标项清单').blocks.find(b=>b.kind==='table').rows.find(row=>row[0]===manager.title);assert.equal(row[1].split(intro).length-1,1);assert.match(row[2],/2.*3.*29页/);
 const source=cat(actual,'qualification').filter(i=>i.title==='拟派项目经理完整资格条件'),sourceOutput=actual.outputs.risks.filter(i=>i.title==='拟派项目经理完整资格条件');assert.equal(source.length,2);assert.deepEqual(manager.references,[...new Map(source.flatMap(i=>i.references).map(ref=>[`${ref.documentId}:${ref.blockId}:${ref.quote}`,ref])).values()]);assert.deepEqual([...manager.sourceFindingIds].sort(),[...new Set(sourceOutput.flatMap(i=>i.relatedFindingIds||[i.id]))].sort());const changed=structuredClone(actual),additional='另须最近连续6个月本单位社保证明及10年施工管理经验。';cat(changed,'qualification').find(i=>i.id===source[1].id).interpretation+='\n'+additional;const changedManager=contentModule.buildReportContent(changed).categories.find(c=>c.id==='qualification').items.find(i=>i.title===manager.title);assert.ok(changedManager.interpretation.includes(additional),'不相同的独立约束必须保留');
 const probe=scope=>({...structuredClone(source[0]),id:JSON.stringify(scope),scope,references:source[0].references.map(ref=>({...ref,documentId:scope.documentId}))});
 const protectedItems=contentModule.buildReportContent({categories:[],outputs:{risks:[probe({documentId:'a',package:'1',phase:'response'}),probe({documentId:'a',package:'2',phase:'response'}),probe({documentId:'b',package:'1',phase:'response'}),probe({documentId:'a',package:'1',phase:'fulfillment'})]},analysis:{}}).outputs.risks;assert.equal(protectedItems.length,4,'跨文件 采购包 阶段不合并');for(const item of protectedItems)assert.ok(item.interpretation.includes(intro));
});

test('默认原句资格汇总仅在每条同源完整条件已显示时去重，新增条件与证据保留',async()=>{
 const {buildReportSections}=await import('../src/server/export.js'),r=report(),before=JSON.stringify(r.categories);
 const summary=r.analysis.businessRequirements.find(item=>item.title==='项目主体、资质与信用资格');assert.ok(summary);
 const details=value=>buildReportSections(value).find(s=>s.title==='14类详细分析').blocks.filter(b=>b.kind==='table').flatMap(b=>b.rows);
 assert.ok(!details(r).some(row=>row[0]===summary.title),'前文已完整显示的原句汇总无需另占一行');
 assert.equal(r.presentation.categories.length,14);assert.deepEqual(Object.keys(r.presentation.outputs).sort(),['commitments','conclusion','risks','scoreItems']);
 assert.ok(summary.references.some(ref=>ref.blockId==='roof-v2:b21'));assert.ok(summary.references.some(ref=>ref.blockId==='roof-v2:b370'));assert.equal(JSON.stringify(r.categories),before);
 const independent='供应商还须提交最近连续六个月社保证明。';summary.interpretation+='；'+independent;summary.quote+='\n'+independent;summary.references.push({...summary.references[0],blockId:'independent-condition',quote:independent});
 assert.ok(details(r).find(row=>row[0]===summary.title)[1].includes(independent),'独立来源条件不得因重叠引用被回指隐藏');
 const changed=report(),s=changed.analysis.businessRequirements.find(item=>item.title===summary.title);s.references=s.references.map(ref=>({...ref,documentId:'other-version'}));
 assert.ok(details(changed).find(row=>row[0]===s.title)[1].includes('注册建造师证书'),'另一来源同文不得当成本来源已显示');
});
