import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument,summarizeReport} from '../src/core/analyzer.js';

const rows=[
 ['b144','标段1：','第一章 采购公告'],['b146','2.3#公寓消防控制室与相邻房间合并，新做监控显示器。','第一章 采购公告'],['b152','8.招标中应注明施工方具备消防资质。','第一章 采购公告'],
 ['b153','标段2：','第一章 采购公告'],['b163','标段3：','第一章 采购公告'],['b164','不含消防工程等其他设计。','第一章 采购公告'],
 ['b166','2.4采购范围：','第一章 采购公告'],['b167','工程划分为3个标段。','第一章 采购公告'],
 ['b168','3.竞标人资格要求','第一章 采购公告'],['b169','3.1企业资质资格要求：','第一章 采购公告'],
 ['b170','3.1.3.没有因信用评价被管理机构限制竞标。','第一章 采购公告'],
 ['b171','3.1.4.没有处于停业，财产未处于被接管、冻结、破产状态。','第一章 采购公告'],
 ['b172','3.1.5.安全生产许可证在有效期内。','第一章 采购公告'],
 ['b173','3.1.6.竞标人必须具备建筑装修装饰工程专业承包贰级及以上资质。','第一章 采购公告'],
 ['b174','3.1.7.竞标人必须具有良好的企业信誉，具备近三年（2023年9月至今）类似方面的业绩。','第一章 采购公告'],
 ['b175','3.1.8.项目经理：竞标人拟派项目经理须具备有效的安全生产考核合格证书，与竞标人具有有效的劳动和社保关系。','第一章 采购公告'],
 ['b257','3.7.5 | 装订要求 | 正本1本，包含技术、商务、报价部分装订成册，采用胶订、平订或线订，不得采用活页方式。 |','第二章 竞标人须知'],
 ['b258','4.1.2 | 封套需写明的内容 | 采购项目名称、采购编号/标段号和竞标人全称，注明“在2026年XX月XX日XX：XX前不得开启”字样，密封处应有密封章。 |','第二章 竞标人须知'],
 ['b414','4.1.3 未按本章第4.1.1项或第4.1.2项要求密封和加写标记的投标文件，采购人应予拒收。','4.1 投标文件的密封和标记'],
 ['b517','本项目采用经评审的最低投标价法，未列计分表。','第三章 评审办法（经评审的最低投标价法）'],
 ['b529','3.1.2竞标人有以下情形之一的，其投标作无效投标处理：','3.1 初步评审'],
 ['b530','（1）第二章“竞标人须知”规定的任何一种情形的；','3.1 初步评审'],
 ['b531','（2）串通投标或弄虚作假或有其他违法行为的；','3.1 初步评审'],
 ['b532','（3）不按评审小组要求澄清、说明或补正的。','3.1 初步评审'],
 ['b533','3.1.3评审小组可以要求竞标人就投标文件作必要的澄清、说明或补正。','3.1 初步评审'],
 ['b1191','二、乙方职责','二、乙方职责'],
 ['b1194','3．建立健全安全生产责任制。从项目经理到生产工人（包括临时雇工）的安全管理系统必须做到纵向到底，一环不漏；各职能部门和人员的安全生产责任制横向到边，人人有责。项目经理是安全生产的第一责任人。在施工现场配备与其生产规模相适应、具有工程系列技术职称的专职安全生产管理人员，负责对安全生产进行现场监督检查，督促作业人员遵守安全操作规程和技术标准。','二、乙方职责']
];
const company={id:'demo',name:'演示企业',records:[
 {id:'manager',type:'personnel',name:'人员',verified:true,documentIds:['reg','b'],fields:{role:'项目经理',employer:'演示企业',specialty:'建筑工程',grade:'二级',validUntil:'2028-01-01',bCertificateNumber:'B-1',evidence:[{kind:'registration',documentId:'reg',verified:true},{kind:'bCertificate',documentId:'b',verified:true}]}},
 {id:'performance',type:'performance',name:'合同',verified:true,documentIds:['contract'],fields:{subjectName:'演示企业',projectType:'装饰装修',contractDate:'2022-08-01',contractNumber:'P-1',evidence:[{kind:'contract',documentId:'contract',verified:true}]}}
]};
const build=(source=rows,snapshot=company)=>analyzeDocument({id:'tender',fileName:'真实条款节选.doc',complete:true,warnings:[],blocks:source.map(([id,text,section])=>({id,text,section,kind:'paragraph'}))},{companySnapshot:snapshot});
const all=r=>r.categories.flatMap(c=>c.items);
const ref=(item,id)=>item.references.some(reference=>reference.blockId===id);

test('V15 announcement safety, construction rank and history are actual qualification requirements',()=>{
 const r=build();for(const [id,block] of [['safety-license','b172'],['construction-qualification','b173'],['performance','b174']]){
  const g=r.companyAnalysis.qualification.groups.find(group=>group.id===id);assert.equal(g.required,true,id);assert.ok(g.requirements.some(item=>ref(item,block)),id);assert.equal(g.status,'pending');
 }
 assert.equal(r.categories.length,14);assert.deepEqual(Object.keys(r.outputs).sort(),['commitments','conclusion','risks','scoreItems']);
});

test('V15 construction safety duties remain contract duties rather than manager entrance',()=>{
 const r=build(),items=all(r).filter(item=>ref(item,'b1194'));assert.ok(items.length);for(const item of items){assert.equal(item.hard,false);assert.equal(item.stage,'合同履约');assert.doesNotMatch(item.title,/资格条件/);assert.doesNotMatch(item.impact,/资格准入/);}
 assert.ok(!r.companyAnalysis.qualification.groups.find(group=>group.id==='personnel').requirements.some(item=>ref(item,'b1194')));
 assert.ok(!r.companyAnalysis.matches.some(item=>ref(item,'b1194')));
});

test('V15 invalid-bid parent carries all three enumerated grounds but ordinary clarification stays nonfatal',()=>{
 const r=build(),risk=r.outputs.risks.find(item=>ref(item,'b529'));assert.ok(risk);for(const id of ['b530','b531','b532'])assert.ok(ref(risk,id),id);assert.equal(risk.hard,true);
 assert.ok(all(r).filter(item=>ref(item,'b533')).every(item=>!item.hard));
});

test('V15 paper binding, envelope and rejection clauses reach preparation and risks without invented fatality',()=>{
 const r=build();for(const id of ['b257','b258','b414']){assert.ok(r.analysis.preparation.some(item=>ref(item,id)),id);assert.ok(r.outputs.risks.some(item=>ref(item,id)),id);}
 assert.equal(r.outputs.risks.find(item=>ref(item,'b257')).hard,false);assert.equal(r.outputs.risks.find(item=>ref(item,'b414')).hard,true);
});

test('V15 labor and insurance relationships are explicit pending gaps even without submission wording',()=>{
 const r=build(),m=r.companyAnalysis.matches.find(item=>ref(item,'b175'));assert.ok(m);assert.ok(m.records[0].missing.some(text=>/劳动关系/.test(text)));assert.ok(m.records[0].missing.some(text=>/社保关系/.test(text)));
 const item=all(r).find(item=>ref(item,'b175'));item.reviewed=true;item.matchStatus='met';summarizeReport(r);assert.equal(r.companyAnalysis.qualification.groups.find(group=>group.id==='personnel').status,'pending');
});

test('V15 lot-specific fire qualification remains visibly scoped and cannot reject an unselected whole project',()=>{
 const r=build(),fire=all(r).find(item=>ref(item,'b152'));assert.equal(fire.scope?.lot,'1');assert.match(fire.fields['标段范围'],/标段1/);assert.ok(fire.scopePending);fire.reviewed=true;fire.matchStatus='unmet';summarizeReport(r);assert.notEqual(r.companyAnalysis.qualification.hardGate.status,'unmet');assert.notEqual(r.outputs.conclusion.label,'不建议投');
 const safety=all(r).find(item=>ref(item,'b172'));assert.equal(safety.scope?.lot,null);
});

test('V15 non-scoring eligibility history keeps month start and avoids scoring gaps or inferred contract date',()=>{
 const r=build(),m=r.companyAnalysis.matches.find(item=>ref(item,'b174'));assert.equal(r.companyAnalysis.forecast.status,'not-applicable');assert.ok(!m.missing.some(text=>/计分/.test(text)));assert.ok(m.missing.some(text=>/2023年9月|2023-09/.test(text)));assert.ok(m.missing.some(text=>/日期.*口径|时间.*口径/.test(text)));
 const item=all(r).find(item=>ref(item,'b174'));assert.ok(item.fields['时间口径'].some(value=>value==='2023年9月'));
});

test('V15 qualification inheritance is generic and stops at a different section',()=>{
 const r=build([['q','二、供应商资格条件','公告'],['a','安全生产许可证在有效期内。','公告'],['end','三、合同安全责任','公告'],['b','项目经理应监督施工现场安全生产。','三、合同安全责任']]);
 assert.ok(all(r).some(item=>ref(item,'a')&&item.hard));assert.ok(all(r).filter(item=>ref(item,'b')).every(item=>!item.hard));
});

test('V15 standalone lot headings retain scope for unnumbered qualification and exclude the next lot',()=>{
 const r=build([
  ['lot-one','标段1：','公告'],
  ['fire','供应商须具备消防设施工程专业承包二级及以上资质。','公告'],
  ['building','2.3#公寓消防控制室整改。','公告'],
  ['fire-more','施工方须具备有效消防设施工程专业承包资质。','公告'],
  ['lot-two','标段2：','公告'],
  ['no-fire','本标段不含消防工程，无需消防资质。','公告'],
  ['project-gates','3.供应商资格要求','公告'],
  ['safety','安全生产许可证在有效期内。','公告']
 ]);
 const fire=all(r).find(item=>ref(item,'fire'));assert.equal(fire.scope?.lot,'1');assert.equal(fire.scopedHard,true);assert.equal(fire.hard,false);assert.equal(fire.scopePending,true);assert.ok(!ref(fire,'lot-two'));
 assert.equal(all(r).find(item=>ref(item,'fire-more')).scope?.lot,'1');
 const second=all(r).find(item=>ref(item,'no-fire'));assert.equal(second.scope?.lot,'2');assert.equal(second.hard,false);
 const safety=all(r).find(item=>ref(item,'safety'));assert.equal(safety.scope?.lot,null);assert.equal(safety.hard,true);
});
