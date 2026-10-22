import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_POLICY_PACKAGE,validatePolicyPackage,analyzeProcurementPolicy} from '../src/core/procurement-policy.js';
const context={governmentProcurement:true,projectDate:'2026-10-14',projectType:'学校',region:'山东省济宁市',localImplementationConfirmed:true};
const tender=(text='本项目采购水嘴；型号：WT-1；制造商：测试水具厂')=>({id:'tender',role:'tender',fileName:'测试招标.txt',extraction:{complete:true,blocks:[{id:'tb1',page:3,section:'采购需求',text}]}});
const boq=(rows)=>({id:'boq',role:'tender',fileName:'测试清单.xlsx',extraction:{complete:true,blocks:[{id:'boq-b',kind:'table',page:null,sheet:'材料表',rowStart:5,section:'材料清单',text:'工程量清单',tableHeaders:['序号','材料名称','规格型号','制造商','数量'],tableRows:rows.map((cells,i)=>({cells,text:cells.join(' | '),rowStart:i+6,rowEnd:i+6,page:null}))}]}});
const record=(overrides={},fields={})=>{const quote='测试用水嘴；产品型号：WT-1；覆盖型号：WT-1；制造商：测试水具厂；节能产品认证证书；证书编号：E-TEST-1；认证机构：测试认证机构；有效期自：2025-01-01；有效期至：2028-12-31；证书状态：有效';return{id:'e1',type:'product',name:'测试水嘴节能认证',verified:true,documentIds:['cert-original'],sources:[{documentId:'cert-original',blockId:'c1',page:1,fileName:'测试证书.txt',quote}],fields:{model:'WT-1',manufacturer:'测试水具厂',category:'水嘴',certificateType:'energy',coveredModels:['WT-1'],certificateNumber:'E-TEST-1',issuer:'测试认证机构',validFrom:'2025-01-01',validUntil:'2028-12-31',certificateStatus:'valid',evidence:[{kind:'certificate',documentId:'cert-original',verified:true,valid:true}],...fields},...overrides};};
const analyze=(documents,records=[],projectContext=context)=>analyzeProcurementPolicy({documents,companySnapshot:{id:'dealer',name:'测试经销商',records},projectContext,asOf:'2026-10-14'});
const energy=result=>result.products.find(p=>p.policyType==='energy'&&p.categoryCode==='A060806');

test('official catalog preserves all leaves, inherited stars, standards and source hashes',()=>{
 const p=validatePolicyPackage(DEFAULT_POLICY_PACKAGE);
 assert.equal(p.catalog.filter(c=>c.policyType==='energy').length,43);
 assert.equal(p.catalog.filter(c=>c.policyType==='environment').length,92);
 assert.equal(p.catalog.filter(c=>c.policyType==='greenMaterial').length,109);
 assert.equal(p.greenMaterial.cities.length,101);
 assert.equal(p.catalog.find(c=>c.policyType==='energy'&&c.name==='电热水器').policyKind,'requirement');
 assert.equal(p.catalog.find(c=>c.policyType==='energy'&&c.name==='燃气热水器').policyKind,'preference');
 assert.equal(p.catalog.find(c=>c.policyType==='energy'&&c.name==='LED筒灯').policyKind,'preference');
 assert.equal(p.catalog.find(c=>c.policyType==='energy'&&c.name==='水嘴').sourcePage,4);
 assert.ok(p.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)));
});
test('model + manufacturer + valid verified certification can support a dealer without requiring manufacturer company',()=>{
 const result=analyze([tender()],[record()]);
 assert.equal(energy(result).status,'met');assert.deepEqual(energy(result).matchedRecordIds,['e1']);
 assert.equal(result.version,DEFAULT_POLICY_PACKAGE.version);assert.equal(result.asOf,'2026-10-14');
 assert.equal(energy(result).sources[0].page,3);assert.ok(energy(result).policySources.some(s=>s.id==='energy-2019'));
});
for(const [name,overrides,fields] of [
 ['unreviewed OCR',{verified:false},{}],['unverified proof',{}, {evidence:[{kind:'certificate',documentId:'cert-original',verified:false}]}],
 ['unknown status',{}, {certificateStatus:'unknown'}],['revoked',{}, {certificateStatus:'revoked'}],['suspended',{}, {certificateStatus:'suspended'}],
 ['expired',{}, {validUntil:'2020-01-01'}],['future',{}, {validFrom:'2027-01-01'}],['wrong manufacturer',{}, {manufacturer:'同名测试工厂'}],
 ['wrong model coverage',{}, {coveredModels:['WT-2']}],['missing coverage',{}, {coveredModels:[]}],['unbound source',{sources:[]},{}],
 ['proof references different original',{}, {evidence:[{kind:'certificate',documentId:'other-original',verified:true}]}],
 ['wrong original quote',{sources:[{documentId:'cert-original',blockId:'c1',page:1,quote:'其它型号、其它制造商的证书'}]},{}]
]) test(`never marks ${name} certificate met`,()=>assert.notEqual(energy(analyze([tender()],[record(overrides,fields)])).status,'met'));
for(const type of ['ccc','iso','testReport','environment'])test(`${type} cannot replace energy certification`,()=>{
 const p=energy(analyze([tender()],[record({}, {certificateType:type})]));assert.notEqual(p.status,'met');assert.ok(p.gaps.some(g=>/类型/.test(g)));
});
test('missing certificate and unknown product specification stay pending or missing, never rejected',()=>{
 const p=energy(analyze([tender('本项目采购水嘴。')]));assert.ok(['missing','pending'].includes(p.status));assert.ok(p.gaps.some(g=>/型号/.test(g)));
 assert.ok(!('rejected' in p));
});
test('BOQ table rows retain worksheet row and quote provenance even block text omits inventory',()=>{
 const result=analyze([boq([['1','水嘴','WT-1','测试水具厂','10'],['2','雨水口','DN100','','12'],['3','新型屋面材料','R-UNKNOWN','','100']])]);
 const p=energy(result);assert.equal(p.name,'水嘴');assert.equal(p.sources[0].sheet,'材料表');assert.equal(p.sources[0].rowStart,6);assert.equal(p.sources[0].quote,'1 | 水嘴 | WT-1 | 测试水具厂 | 10');
 const rain=result.products.filter(p=>p.name==='雨水口');assert.ok(rain.length);assert.ok(rain.every(p=>p.categoryCode!=='A060806'));
 assert.ok(result.products.some(p=>p.name==='新型屋面材料'&&p.status==='pending'));
});
test('original not involved statement stays separate and requests clarification on policy conflict',()=>{
 const result=analyze([tender('本项目不涉及强制采购节能产品。'),boq([['1','水嘴','WT-1','测试水具厂','10']])],[record()]);
 const p=energy(result);assert.equal(p.status,'pending');assert.ok(p.originalStatements.some(s=>s.quote.includes('不涉及')));assert.ok(result.warnings.some(w=>w.code==='POLICY_TENDER_CONFLICT'));
});
test('missing region/date/type and absent local application evidence do not make every construction material mandatory',()=>{
 const r=analyze([boq([['1','预拌混凝土','C30','','100']])],[],{governmentProcurement:true,projectType:'工程'});
 assert.equal(r.applicability.greenMaterial.status,'pending');assert.ok(r.products.filter(p=>p.policyType==='greenMaterial').every(p=>p.status==='pending'));
 const outside=analyze([],[],{...context,region:'山东省济南市',projectType:'公路'});assert.equal(outside.applicability.greenMaterial.status,'pending');
 const no=analyze([],[],{...context,governmentProcurement:false});assert.equal(no.applicability.energyMandatory.status,'notApplicable');
});
test('project date is not silently replaced by analysis date and pre-effective date stays pending',()=>{
 const r=analyze([],[],{...context,projectDate:'2024-12-31'});assert.equal(r.applicability.greenMaterial.status,'pending');assert.ok(r.applicability.greenMaterial.reason.includes('既往'));
 const unknown=analyze([],[],{...context,projectDate:undefined});assert.equal(unknown.applicability.energyMandatory.status,'pending');
 assert.throws(()=>analyzeProcurementPolicy({asOf:'2026-02-30'}),/日期/);
});
test('green compliant test report is an alternative and optional threshold counts categories, not amounts',()=>{
 const docs=[boq([['1','改性沥青防水卷材','SBS-1','测试防水厂','999999'],['2','水性防水涂料','WC-1','测试防水厂','1']])];
 const cert=record({id:'green1',name:'测试检测报告',sources:[{documentId:'cert-original',blockId:'c1',page:1,quote:'改性沥青防水卷材；SBS-1；制造商：测试防水厂；有效检测报告；编号：G-1；测试认证机构；2025-01-01；2028-12-31；符合绿色建筑和绿色建材政府采购需求标准（2025年版）第5.1.3条全部适用指标；有效'}]}, {model:'SBS-1',coveredModels:['SBS-1'],manufacturer:'测试防水厂',category:'改性沥青防水卷材',certificateType:'testReport',certificateNumber:'G-1',policyVersion:DEFAULT_POLICY_PACKAGE.version,evidence:[{kind:'testReport',documentId:'cert-original',verified:true,valid:true}]});
 const r=analyze(docs,[cert]);const green=r.products.find(p=>p.policyType==='greenMaterial'&&p.name==='改性沥青防水卷材');assert.equal(green.status,'met');
 assert.equal(r.summary.greenMaterial.optionalCategories,2);assert.equal(r.summary.greenMaterial.minimumSelectedCategories,1);assert.equal(r.summary.greenMaterial.ratioBasis,'涉及的可选建材小类数量');assert.equal(r.summary.greenMaterial.withinCategoryRatio,0.8);
});
test('a generic test report lacking complete standard compliance cannot prove green demand',()=>{
 const docs=[boq([['1','改性沥青防水卷材','SBS-1','测试防水厂','100']])];const r=analyze(docs,[record({}, {model:'SBS-1',manufacturer:'测试防水厂',certificateType:'testReport',coveredModels:['SBS-1']})]);
 assert.notEqual(r.products.find(p=>p.policyType==='greenMaterial').status,'met');
});
test('air conditioner cooling capacity selects proper leaf and unspecified capacity stays pending',()=>{
 const r=analyze([boq([['1','多联式空调（热泵）机组','制冷量16000W','','1']])]);assert.ok(r.products.some(p=>p.policyType==='energy'&&p.categoryCode==='A02052305'));assert.ok(!r.products.some(p=>p.policyType==='energy'&&p.categoryCode==='A0206180203'));
 const unknown=analyze([boq([['1','多联式空调（热泵）机组','','','1']])]);assert.ok(unknown.products.some(p=>p.policyType==='energy'&&p.status==='pending'&&p.gaps.some(g=>/制冷量/.test(g))));
});
test('validator rejects executable rules, duplicate IDs, oversized arrays, invalid source and date links',()=>{
 for(const mutate of [p=>{p.rules={regex:'.*'};},p=>{p.catalog[0].regex='.*';},p=>{p.catalog[1].id=p.catalog[0].id;},p=>{p.catalog[0].sourceId='unknown';},p=>{p.checkedAt='2026-02-30';},p=>{p.sources[0].url='javascript:alert(1)';},p=>{p.catalog[0].aliases=Array(101).fill('x');},p=>{p.greenMaterial.optionalCategoryRatio=0.99;}]){
  const p=structuredClone(DEFAULT_POLICY_PACKAGE);mutate(p);assert.throws(()=>validatePolicyPackage(p));
 }
 const p=validatePolicyPackage(DEFAULT_POLICY_PACKAGE);p.version='mutated';assert.notEqual(DEFAULT_POLICY_PACKAGE.version,'mutated');
});
test('a package snapshot drives analysis version instead of current default and inputs remain untouched',()=>{
 const pkg=structuredClone(DEFAULT_POLICY_PACKAGE);pkg.version='reviewed-local-package';const input={documents:[tender()],companySnapshot:{records:[record()]},projectContext:context,policyPackage:pkg,asOf:'2026-10-14'};const before=JSON.stringify(input);
 const r=analyzeProcurementPolicy(input);assert.equal(r.version,'reviewed-local-package');assert.equal(JSON.stringify(input),before);
});

test('editing validity dates without matching original evidence cannot renew a product certificate',()=>{
 const p=energy(analyze([tender()],[record({}, {validUntil:'2029-12-31'})]));assert.notEqual(p.status,'met');assert.ok(p.gaps.some(g=>/日期|有效期/.test(g)));
});
test('fields mixed from a different unverified original cannot form a confirmed certificate chain',()=>{
 const r=record();r.sources=[{...r.sources[0],quote:r.sources[0].quote.replace('测试水具厂','其它制造商')},{documentId:'manufacturer-sheet',blockId:'m1',page:1,quote:'制造商：测试水具厂'}];r.documentIds.push('manufacturer-sheet');
 assert.notEqual(energy(analyze([tender()],[r])).status,'met');
});
test('one original says suspended even when manual field says valid remains a conflict',()=>{
 const r=record();r.sources[0].quote=r.sources[0].quote.replace('证书状态：有效','证书状态：暂停');assert.notEqual(energy(analyze([tender()],[r])).status,'met');
});
test('recognition conflicts cannot become met merely because record is checked',()=>{
 const r=record({recognition:{status:'conflict',sourceComplete:true,missingFields:[],conflicts:[{field:'coveredModels',existingValue:['WT-1'],incomingValue:['WT-2'],sources:[]}]}});assert.notEqual(energy(analyze([tender()],[r])).status,'met');
});
test('generic not involved mandatory energy statement does not erase energy preference inventory',()=>{
 const r=analyze([tender('本项目不涉及强制采购节能产品。'),boq([['1','LED筒灯','L-1','测试灯具厂','20']])]);
 const p=r.products.find(p=>p.policyType==='energy');assert.equal(p.policyKind,'preference');assert.deepEqual(p.originalStatements,[]);
});
test('headers in spreadsheet cells and actual row numbers do not create phantom products',()=>{
 const d=boq([['序号','材料名称','规格型号','制造商','数量'],['1','水嘴','WT-1','测试水具厂','10']]);d.extraction.blocks[0].tableRows[1].rowStart=16;d.extraction.blocks[0].tableRows[1].rowEnd=16;
 const r=analyze([d]);assert.ok(r.products.every(p=>p.name!=='材料名称'));assert.equal(energy(r).sources[0].rowStart,16);
});
test('original company document text must agree with stored quote when it is provided',()=>{
 const cert={id:'cert-original',role:'evidence',fileName:'测试证书.txt',extraction:{blocks:[{id:'c1',page:2,text:'不同原件'}]}};assert.notEqual(energy(analyze([tender(),cert],[record()])).status,'met');
});

test('aggregated table text does not duplicate row inventory or detach quotes from their rows',()=>{
 const d=boq([['1','水嘴','WT-1','测试水具厂','10']]);d.extraction.blocks[0].text=d.extraction.blocks[0].tableRows[0].text;
 const r=analyze([d]);assert.equal(r.products.filter(p=>p.policyType==='energy').length,1);assert.ok(r.products.every(p=>p.sources[0].rowStart===6));
 const two=boq([['1','水嘴','WT-1','测试水具厂','10'],['2','LED筒灯','L-1','测试工厂','10']]);two.extraction.blocks[0].text=two.extraction.blocks[0].tableRows.map(r=>r.text).join('\n');assert.equal(analyze([two]).products.filter(p=>p.policyType==='energy').length,2);
});
test('specific official leaves take precedence over substring parents so optional kinds are not double counted',()=>{
 const r=analyze([boq([['1','智能坐便器','T-1','测试工厂','1']])]);assert.equal(r.products.filter(p=>p.policyType==='greenMaterial').length,1);assert.equal(r.summary.greenMaterial.optionalCategories,1);
 const chiller=analyze([boq([['1','溴化锂吸收式冷水机组','CH-1','测试工厂','1']])]);assert.equal(chiller.products.filter(p=>p.policyType==='energy').length,1);assert.ok(chiller.products.find(p=>p.policyType==='energy').policySources.some(s=>s.standard?.includes('GB 29540')));
});

test('same model and manufacturer on a different certified product category does not prove policy coverage',()=>{
 const r=record({}, {category:'工业阀门'});assert.notEqual(energy(analyze([tender()],[r])).status,'met');
});
test('government catalog boilerplate conditional examples do not establish project inventory',()=>{
 const r=analyze([tender('如涉及水嘴，应提供节能产品认证证书。凡属于政府采购品目清单范围的产品，须按政策执行。')]);assert.equal(r.products.length,0);assert.ok(r.warnings.some(w=>w.code==='POLICY_INVENTORY_PENDING'));
});
test('construction accessory name similarity never proves an entire certified device is purchased',()=>{
 const r=analyze([boq([['1','液晶显示器支架','BRACKET-1','测试厂','10']])]);assert.ok(r.products.some(p=>p.name==='液晶显示器支架'&&p.status==='pending'));assert.ok(r.products.every(p=>p.policyKind!=='requirement'));
});

test('forms and qualification tables never become product inventories from generic name headers',()=>{
 const documents=['资格审查证明材料','供应商基本情况','评分表'].map((section,i)=>({id:'form'+i,role:'tender',extraction:{blocks:[{id:'form-b'+i,kind:'table',section,tableHeaders:['序号','名称','要求'],tableRows:[{cells:['1','营业执照','提供原件'],text:'1 | 营业执照 | 提供原件'}],text:'1 | 营业执照 | 提供原件'}]}}));
 assert.equal(analyze(documents).products.length,0);
});
test('synthetic roof BOQ recognizes materials in continued feature columns and excludes measures and demolition',async()=>{
 const fs=await import('node:fs');const extraction=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url),'utf8'));
 const r=analyze([{id:'roof',role:'tender',fileName:extraction.fileName,extraction}]);
 assert.ok(r.products.some(p=>p.categoryCode==='A10030901'&&p.sources[0].page===18));
 assert.ok(r.products.some(p=>p.policyType==='greenMaterial'&&p.name.includes('挤塑聚苯乙烯')&&p.sources[0].page===19));
 assert.ok(r.products.some(p=>p.policyType==='unknown'&&p.name==='雨水口'));
 assert.ok(r.products.every(p=>!/(?:措施|文明|施工费|搬运费|拆除|项目概况|质量要求|技术及施工要求|^无$)/.test(p.name.normalize('NFKC'))));
 assert.ok(r.products.length<30);assert.ok(r.products.some(p=>p.policyType==='environment'&&p.originalStatements.length));
});
test('row-specific repeated headers supersede initial block headers for later sheets tables',()=>{
 const d=boq([['1','水嘴','WT-1','测试水具厂','10']]);d.extraction.blocks[0].tableRows[0].headers=['序号','材料名称','数量','制造商','规格型号'];d.extraction.blocks[0].tableRows[0].cells=['1','水嘴','10','测试水具厂','WT-1'];d.extraction.blocks[0].tableRows[0].text='1 | 水嘴 | 10 | 测试水具厂 | WT-1';assert.equal(energy(analyze([d])).model,'WT-1');
});

test('a mortar mixture does not claim standalone cement certification merely by name substring',()=>{
 const d=boq([['1','水泥砂浆','1:3','','10']]);assert.ok(analyze([d]).products.every(p=>p.categoryCode!=='A10030102'));
});
test('offline policy provenance matches the pinned non-bundled source manifest',async()=>{
 const fs=await import('node:fs');const manifest=JSON.parse(fs.readFileSync(new URL('../third_party/policy-source-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.originalsBundled,false);
 for(const source of DEFAULT_POLICY_PACKAGE.sources){const entry=manifest.sources.find(row=>row.id===source.id);assert.ok(entry);assert.equal(entry.url,source.url);assert.equal(entry.sha256,source.sha256);assert.equal(entry.distribution,'not-bundled');}
});

test('BOQ testing and inspection services are not unknown physical products',()=>{
 const d={id:'service-boq',extraction:{blocks:[{id:'service-b',section:'工程量清单',kind:'table',tableHeaders:['序号','项目编码','项目名称','项目特征描述','计量单位','工程量'],tableRows:[{cells:['1','030416027001','接地装置','1.名称:防雷检测','系统','1'],text:'1 | 030416027001 | 接地装置 | 1.名称:防雷检测 | 系统 | 1'}]}]}};
 assert.equal(analyze([d]).products.length,0);
});
