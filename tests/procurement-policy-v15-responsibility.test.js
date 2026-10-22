import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProcurementPolicy} from '../src/core/procurement-policy.js';
const context={governmentProcurement:false,projectDate:'2026-10-22'};
const doc=(texts,id='technical')=>({id,role:'attachment',fileName:'7.附件5包件1、2、3：技术标准和要求.doc',extraction:{complete:true,blocks:texts.map((text,index)=>({id:`${id}:b${196+index}`,page:null,section:'二、施工内容',text}))}});
const real='1.4 据建设单位提供及要求，本工程卫生间热水由电热水器供水；由电气专业预留电量及插座，土建专业预留安装条件。电热水器均由建设单位自理，本工程仅预留给水安装条件。';
const analyze=documents=>analyzeProcurementPolicy({documents,projectContext:context,asOf:'2026-10-22'});

test('249 owner supplied electric heaters preserve exclusion evidence without enterprise certificate gaps',()=>{
 const r=analyze([doc([real,'1.5 热水系统应符合下列要求：电热水器（宝）必须运行安全、保证水质，产品的构造及热工性能应符合安全及节能的要求。'])]);
 assert.ok(r.products.every(p=>!/热水器/.test(p.name)));assert.ok(r.exclusions.some(x=>/电热水器/.test(x.name)&&/建设单位自理/.test(x.reason)));
 assert.ok(r.exclusions.some(x=>x.sources.some(s=>s.blockId==='technical:b196'&&s.quote===real)));
});
test('mixed paragraph owner supplied heater does not suppress bidder purchased LED products',()=>{
 const r=analyze([doc(['电热水器由建设单位自理，仅预留安装条件；本项目由投标人采购LED筒灯，型号：L-1；制造商：测试灯具厂。'])]);
 assert.ok(r.products.some(p=>p.name==='LED筒灯'&&p.policyType==='energy'));assert.ok(r.products.every(p=>!/热水器/.test(p.name)));
});
test('existing window opening does not become a purchased window but still permits fan procurement',()=>{
 const quote='本项目采购排风机。设置在外墙上排风机，应根据现场及实际购买的排风机产品对外窗进行开洞；安装时，应注意对外墙等的保护。';
 const r=analyze([doc([quote])]);assert.ok(r.products.every(p=>p.name!=='窗'&&p.name!=='门窗'));assert.ok(r.exclusions.some(x=>/窗/.test(x.name)&&/开洞/.test(x.reason)&&x.sources[0].quote===quote));
});
test('owner responsibility exclusion is scoped to the document section and never hides another package purchase',()=>{
 const other=doc(['本标段由投标人采购电热水器，型号：WH-1；制造商：测试厂。'],'other-package');
 const r=analyze([doc([real]),other]);assert.ok(r.products.some(p=>p.name==='电热水器'&&p.sources[0].documentId==='other-package'));
});
test('negated owner supply and bidder purchase stays a product requirement',()=>{
 const r=analyze([doc(['电热水器不由建设单位自理，本项目由投标人采购电热水器并安装，型号：WH-1；制造商：测试厂。'])]);
 assert.ok(r.products.some(p=>p.name==='电热水器'));assert.equal(r.exclusions.length,0);
});
test('only reserving installation conditions does not claim unknown new equipment is purchased',()=>{
 const r=analyze([doc(['电热水器仅预留给水安装条件，不采购电热水器。'])]);assert.ok(r.products.every(p=>!/热水器/.test(p.name)));assert.ok(r.exclusions.length);
});
test('heater socket accessories never imply procurement of a whole heater',()=>{
 const r=analyze([doc(['本工程安装明插座15A以下三相带接地（防水五孔插座）（含移位热水器插座）。'])]);
 assert.ok(r.products.every(p=>!/热水器/.test(p.name)));
});
test('owner supplied inventory in an aggregated table does not exclude another table in the same chapter',()=>{
 const d=doc(['1 | 电热水器（主材甲供） | 台 | 1','2 | 电热水器，投标人采购安装 | 台 | 2']);
 const r=analyze([d]);assert.ok(r.products.some(p=>p.name==='电热水器'&&p.sources[0].blockId==='technical:b197'));
});
test('owner provided technical parameters do not transfer a bidder purchase to the owner',()=>{
 const r=analyze([doc(['本工程水嘴应按采购人提供的技术参数采购安装，型号：WT-1；制造商：测试厂。'])]);
 assert.ok(r.products.some(p=>p.name==='水嘴'));assert.equal(r.exclusions.length,0);
});
