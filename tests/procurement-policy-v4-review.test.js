import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProcurementPolicy,DEFAULT_POLICY_PACKAGE} from '../src/core/procurement-policy.js';
const context={governmentProcurement:true,projectDate:'2026-10-14',projectType:'学校',region:'山东省济宁市',localImplementationConfirmed:true};
const tender=text=>({id:'review-t',extraction:{blocks:[{id:'review-t1',section:'采购需求',text}]}});
const row=(name,feature)=>({id:'review-boq',extraction:{blocks:[{id:'review-b',page:8,kind:'table',section:'工程量清单',tableHeaders:['序号','项目编码','项目名称','项目特征描述','计量单位','工程量'],tableRows:[{cells:['1','030404001001',name,feature,'个','1'],text:['1','030404001001',name,feature,'个','1'].join(' | ')}]}]}});
const cert=()=>({id:'review-cert',type:'product',name:'测试水嘴证书',verified:true,documentIds:['original'],sources:[{documentId:'original',blockId:'o1',page:1,quote:'水嘴；产品型号：WT-1；覆盖型号：WT-1；制造商：测试水具厂；节能产品认证证书；证书编号：E-TEST-1；认证机构：测试认证机构；有效期自2025-01-01至2028-12-31；状态有效'}],fields:{model:'WT-1',manufacturer:'测试水具厂',category:'水嘴',coveredModels:['WT-1'],certificateType:'energy',certificateNumber:'E-TEST-1',issuer:'测试认证机构',validFrom:'2025-01-01',validUntil:'2028-12-31',certificateStatus:'valid',evidence:[{kind:'certificate',documentId:'original',verified:true,valid:true}]}});
const green=conclusion=>{const r=cert();Object.assign(r.fields,{model:'SBS-1',coveredModels:['SBS-1'],category:'改性沥青防水卷材',certificateType:'testReport',policyVersion:DEFAULT_POLICY_PACKAGE.version,evidence:[{kind:'testReport',documentId:'original',verified:true,valid:true}]});r.sources[0].quote=`改性沥青防水卷材；产品型号：SBS-1；制造商：测试水具厂；有效检测报告；编号：E-TEST-1；测试认证机构；2025-01-01；2028-12-31；${conclusion}；状态有效`;return r;};
const run=(documents,records=[])=>analyzeProcurementPolicy({documents,companySnapshot:{records},projectContext:context,asOf:'2026-10-14'});
const energy=result=>result.products.find(p=>p.policyType==='energy'&&p.categoryCode==='A060806');
const water=()=>tender('采购水嘴；型号：WT-1；制造商：测试水具厂');
const greenTender=()=>tender('采购改性沥青防水卷材；型号：SBS-1；制造商：测试水具厂');
const standard='绿色建筑和绿色建材政府采购需求标准（2025年版）第5.1.3条全部适用指标';
for(const conclusion of [`不符合${standard}`,`未符合${standard}`,`符合${standard}，但本型号检测不合格`,`符合${standard}；本产品未通过全部适用指标检测`])test(`C1 explicit negative green conclusion never supports met: ${conclusion.slice(0,8)}`,()=>{
 const p=run([greenTender()],[green(conclusion)]).products.find(p=>p.policyType==='greenMaterial');assert.equal(p.status,'pending');assert.deepEqual(p.matchedRecordIds,[]);assert.ok(p.gaps.some(g=>/符合|不合格|未通过|否定/.test(g)));
});
test('C1 positive conclusion for a different labeled model cannot be borrowed for this model',()=>{
 const r=green(`型号：SBS-2；符合${standard}`);const p=run([greenTender()],[r]).products.find(p=>p.policyType==='greenMaterial');assert.equal(p.status,'pending');
});
for(const [field,from,to]of [['model','WT-1','WT-10'],['manufacturer','测试水具厂','测试水具厂分厂'],['certificateNumber','E-TEST-1','E-TEST-10'],['issuer','测试认证机构','测试认证机构分支']])test(`C2 original ${field} prefix cannot prove an exact structured identifier`,()=>{
 const r=cert();r.sources[0].quote=r.sources[0].quote.replaceAll(from,to);const p=energy(run([water()],[r]));assert.equal(p.status,'pending');assert.deepEqual(p.matchedRecordIds,[]);
});
test('C2 exact listed model among delimited models remains supported without accepting a prefix',()=>{
 const r=cert();r.sources[0].quote=r.sources[0].quote.replace('覆盖型号：WT-1','覆盖型号：WT-10、WT-1、WT-2');assert.equal(energy(run([water()],[r])).status,'met');
});
test('C3 coded BOQ display bracket remains an unknown accessory and creates no display requirement',()=>{
 const d=row('液晶显示器支架','规格型号：B-1；生产厂家：甲厂');const r=run([d]);assert.equal(r.products.length,1);assert.equal(r.products[0].name,'液晶显示器支架');assert.equal(r.products[0].policyType,'unknown');assert.equal(r.products[0].status,'pending');assert.equal(r.products[0].sources[0].quote,d.extraction.blocks[0].tableRows[0].text);
});
test('C3 accessory mentioned in a feature is not an entire device, while separately supplied device remains recognized',()=>{
 const r=run([row('设备配件安装','采购液晶显示器支架；规格型号：B-1')]);assert.ok(r.products.every(p=>p.categoryCode!=='A0201060401'));
 const real=run([row('液晶显示器安装','采购液晶显示器及支架；型号：D-1；制造商：甲厂')]);assert.ok(real.products.some(p=>p.categoryCode==='A0201060401'));
});
test('C4 mixed demolition and new installation keeps the newly procured plastic window with original quote',()=>{
 const d=row('拆除旧窗及安装新窗','新装塑料窗');const r=run([d]);assert.ok(r.products.some(p=>p.categoryCode==='A100702'));assert.ok(r.products.some(p=>p.policyType==='greenMaterial'&&p.name==='门窗'));assert.ok(r.products.every(p=>p.sources[0].quote===d.extraction.blocks[0].tableRows[0].text));
});
test('C4 removed faucet cannot establish purchase policy while new industrial valve stays unknown and traceable',()=>{
 const d=row('设备更换','拆除原水嘴，安装工业阀门');const r=run([d]);assert.ok(r.products.every(p=>p.categoryCode!=='A060806'));assert.ok(r.products.some(p=>p.name==='工业阀门'&&p.policyType==='unknown'&&p.status==='pending'));assert.ok(r.products.every(p=>p.sources[0].quote===d.extraction.blocks[0].tableRows[0].text));
});
test('C4 pure old-product removal stays outside the purchase inventory',()=>assert.equal(run([row('水嘴拆除','拆除原水嘴')]).products.length,0));
test('resolved conflict history allows coherent verified evidence but never changes source requirements',()=>{
 const r=cert();r.recognition={status:'conflict',sourceComplete:true,missingFields:[],conflicts:[{field:'coveredModels',existingValue:['WT-1'],incomingValue:['WT-10'],sources:[],resolved:true}]};assert.equal(energy(run([water()],[r])).status,'met');
 r.sources[0].quote=r.sources[0].quote.replaceAll('WT-1','WT-10');assert.equal(energy(run([water()],[r])).status,'pending');
 r.sources[0].quote=cert().sources[0].quote;r.recognition.conflicts[0].resolved=false;assert.equal(energy(run([water()],[r])).status,'pending');
});

test('C2 mention in a note cannot replace a different explicitly listed original model',()=>{
 const r=cert();r.sources[0].quote=r.sources[0].quote.replaceAll('WT-1','WT-10')+'；备注示例：WT-1';assert.equal(energy(run([water()],[r])).status,'pending');
});
test('C2 truncated original date token cannot prove a valid structured date',()=>{
 const r=cert();r.sources[0].quote=r.sources[0].quote.replace('2028-12-31','2028-12-310');assert.equal(energy(run([water()],[r])).status,'pending');
});
test('C4 removed device model is not assigned to the newly installed device',()=>{
 const r=run([row('水嘴更换','拆除原水嘴，产品型号：OLD-1；新装水嘴，型号：NEW-1；制造商：测试水具厂')]);assert.equal(energy(r).model,'NEW-1');
});

for(const phrase of ['不能满足','无法符合','不完全符合','难以满足'])test(`C1 round2 modal or qualified conclusion is not affirmative: ${phrase}`,()=>{
 const p=run([greenTender()],[green(phrase+standard)]).products.find(p=>p.policyType==='greenMaterial');assert.equal(p.status,'pending');assert.deepEqual(p.matchedRecordIds,[]);
});
for(const phrase of ['符合','满足','检测结论：本产品符合','本型号完全符合'])test(`C1 round2 unambiguous same-model conclusion remains supported: ${phrase}`,()=>{
 const p=run([greenTender()],[green(phrase+standard)]).products.find(p=>p.policyType==='greenMaterial');assert.equal(p.status,'met');assert.deepEqual(p.matchedRecordIds,['review-cert']);
});
test('C1 round2 green certificate alternative does not require a report conclusion',()=>{
 const r=green('国家统一推行的绿色建材产品认证证书');r.fields.certificateType='greenMaterial';r.fields.evidence=[{kind:'certificate',documentId:'original',verified:true,valid:true}];r.sources[0].quote=r.sources[0].quote.replace('有效检测报告','绿色建材产品认证证书');assert.equal(run([greenTender()],[r]).products.find(p=>p.policyType==='greenMaterial').status,'met');
});
test('C2 round2 excluded model is not parsed as positive covered-model label',()=>{
 const r=cert();r.sources[0].quote=r.sources[0].quote.replaceAll('WT-1','WT-10')+'；覆盖型号：WT-10；不覆盖型号：WT-1';const p=energy(run([water()],[r]));assert.equal(p.status,'pending');assert.deepEqual(p.matchedRecordIds,[]);
});
test('C2 round2 explicit exclusion contradicts a positive coverage field for this model',()=>{
 const r=cert();r.sources[0].quote+='；不覆盖型号：WT-1';assert.equal(energy(run([water()],[r])).status,'pending');
});
test('C2 round2 exclusion of another model does not erase an exact positive coverage list',()=>{
 const r=cert();r.sources[0].quote+='；不覆盖型号：WT-2';assert.equal(energy(run([water()],[r])).status,'met');
});
test('C2 round2 unrecognized coverage label cannot establish positive coverage',()=>{
 const r=cert();r.sources[0].quote=r.sources[0].quote.replaceAll('覆盖型号：WT-1','待确认覆盖型号：WT-1').replace('产品型号：WT-1','产品型号：WT-10');assert.equal(energy(run([water()],[r])).status,'pending');
});

test('default analysis uses the local calendar after midnight and explicit asOf still governs certificate expiry',async()=>{
 const {spawnSync}=await import('node:child_process');
 const moduleUrl=new URL('../src/core/procurement-policy.js',import.meta.url).href;
 const r=cert();r.fields.validUntil='2026-10-14';r.sources[0].quote=r.sources[0].quote.replace('2028-12-31','2026-10-14');
 const script=`const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-14T16:01:00.000Z']));}static now(){return RealDate.parse('2026-10-14T16:01:00.000Z');}};const{analyzeProcurementPolicy}=await import(${JSON.stringify(moduleUrl)});const input=${JSON.stringify({documents:[water()],companySnapshot:{records:[r]},projectContext:context})};const defaultResult=analyzeProcurementPolicy(input);const explicitResult=analyzeProcurementPolicy({...input,asOf:'2026-10-14'});console.log(JSON.stringify({defaultAsOf:defaultResult.asOf,defaultProduct:defaultResult.products.find(p=>p.policyType==='energy'),explicitAsOf:explicitResult.asOf,explicitStatus:explicitResult.products.find(p=>p.policyType==='energy').status}));`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:'Asia/Shanghai'},encoding:'utf8'});assert.equal(child.status,0,child.stderr);
 const result=JSON.parse(child.stdout);assert.equal(result.defaultAsOf,'2026-10-15');assert.equal(result.defaultProduct.status,'pending');assert.ok(result.defaultProduct.gaps.some(g=>g.includes('过有效期')));assert.deepEqual(result.defaultProduct.matchedRecordIds,[]);assert.equal(result.explicitAsOf,'2026-10-14');assert.equal(result.explicitStatus,'met');
});
