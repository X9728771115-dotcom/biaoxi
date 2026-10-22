import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyzeDocument, summarizeReport} from '../src/core/analyzer.js';
import {extractDocument} from '../src/core/extractor.js';
import {textLayoutPdf} from './fixtures/content-structure-fixture.js';
import {confirmedCompanyFixture} from './fixtures/company-facts-fixture.js';

const all = report => report.categories.flatMap(category => category.items);
const cat = (report, id) => report.categories.find(category => category.id === id).items;
function doc(rows, id = 'business-v2') {
  return {id, fileName: `${id}.pdf`, complete: true, warnings: [], pages: [], blocks: rows.map((row, i) => ({id: `${id}-b${i}`, page: row.page || i + 1, section: row.section || '正文', kind: 'paragraph', ...row, documentId: id, fileName: `${id}.pdf`}))};
}
function table(cells, {page, section, tableId, headers} = {}) {
  const tableRows = cells.map(row => ({cells: row, text: row.join(' | '), page}));
  return {kind: 'table', page, section, tableId, tableHeaders: headers, tableRows, text: tableRows.map(row => row.text).join('\n')};
}
const scoringHeaders = ['评审因素分类', '评审内容', '具体标准和要求', '分值', '客观/主观', '关联投标文件'];
const standards = [
  ['技术评审', '施工组织整体设想', '合理且满足要求得7分；每处不全面或不合理扣0.5分，缺项不得分。', '7.0000', '主观', '施工组织整体设想'],
  ['', '施工现场平面布置和临时设施布置', '平面布置、水电用量合理得5分；每处扣0.5分，缺项不得分。', '5.0000', '主观', '平面布置图'],
  ['', '主要分部分项工程施工方案和技术措施', '施工顺序、重点难点方法合理得12分；每处扣0.5分，缺项不得分。', '12.0000', '主观', '分部分项方案'],
  ['', '施工进度计划和保证措施，劳动力投入计划', '进度和劳动力合理得12分；每处扣0.5分，缺项不得分。', '12.0000', '主观', '进度计划'],
  ['', '施工质量保证措施、工作方案', '质量措施可行得10分；每处扣0.5分，缺项不得分。', '10.0000', '主观', '质量工作方案'],
  ['', '项目部人员配备', '人员齐全且经验丰富得10分；每处扣0.5分，缺项不得分。', '10.0000', '主观', '项目管理人员情况表'],
  ['', '拟投入本项目主要材料', '材料指标、环保要求和主材明细完整得10分；每处扣0.5分，缺项不得分。', '10.0000', '主观', '主材明细表'],
  ['', '拟投入本项目施工机械设备', '型号数量满足工程需要得5分；每处扣0.5分，缺项不得分。', '5.0000', '主观', '设备投入表'],
  ['', '安全文明施工防护措施、机械设备安全管理措施', '措施可行得6分；每处扣0.5分，缺项不得分。', '6.0000', '主观', '安全管理措施'],
  ['', '周边关系协调等措施', '协调措施可行得5分；每处扣0.5分，缺项不得分。', '5.0000', '主观', '周边关系协调措施'],
  ['商务评审', '组价合理性', '组价合理得5分；不均衡或单项总额不吻合每处扣0.5分。', '5.0000', '主观', '已标价工程量清单'],
  ['', '同类业绩', '2023年1月1日至今同类项目每提供1个合同得1分，最多3分；以合同签订时间为准，提供加盖公章的有效合同扫描件以及验收报告扫描件，否则不得分。', '3.0000', '客观', '案例一览表及证明材料'],
  ['价格评审', '投标价格得分', '报价得分=(评审基准价／评审报价)×100×价格权重，最低合格评审价为基准。', '10.0000', '客观', '报价一览表']
];
function roofExcerpt() {
  return doc([
    {page: 2, text: '本项目为房屋屋面维修改造，预算及控制价为1122100.00元，采用竞争性磋商。'},
    {page: 2, section: '供应商参加条件', text: '企业资质：供应商具备建筑工程施工总承包三级及以上资质；具有有效的安全生产许可证；拟派项目经理具备注册二级及以上注册建造师证书（建筑工程专业），'},
    {page: 3, section: '供应商参加条件', text: '如果一级建造师注册证书必须为电子证书并符合建办市〔2021〕40号规定，具备有效的安全生产考核合格证书（B）类，在本单位注册且不兼职其他在建、在施、中标、预中标等建设项目的项目经理。'},
    table([['投标（响应）保证金', '不收取保证金'], ['履约保证金', '采购包1：不缴纳'], ['质量保证金', '采购包1：不收取'], ['是否组织现场考察', '采购包1：不组织']], {page: 4, section: '供应商须知附表', headers: ['应知事项','说明和要求']}),
    {page: 12, text: '本采购包无需提交样品。'},
    {page: 14, text: '本项目涉及强制采购节能产品：'},
    table([['采购品目名称', '标的名称', '产品名称'], ['不涉及']], {page: 14}),
    {page: 14, text: '注：响应产品属于政府强制采购的产品，供应商应提供有效节能认证，否则作无效响应处理。'},
    table([['1','★','交货时间','接到甲方开工令后40日历天竣工交付验收完成。'], ['2','★','交货地点','济南市历下区经十路18262号'], ['3','★','付款方式','工程竣工验收合格并经审计完成后一次性付审定金额的100%，审计期限、付款周期执行国家相关标准。'], ['4','★','质保期','自工程竣工验收合格之日起5年，防水8年。']], {page: 24, section: '商务要求', headers: ['序号','参数性质','类型','要求']}),
    {page: 24, text: '标注“★”的条款是实质性要求，如负偏离将按无效报价处理。'},
    {page: 34, text: '本次评审采用综合评分法。分值构成：技术部分82.00分，商务部分8.00分，报价得分10.00分。'},
    table(standards, {page: 34, section: '评审细则及标准', tableId: 'score-table', headers: scoringHeaders}),
    {page: 38, text: '对小、微企业报价给予5%的扣除，监狱企业视同小微企业；按要求提供中小企业声明函或监狱企业证明文件。'},
    {page: 39, text: '响应报价低于全部通过符合性审查供应商响应报价平均值65%，或低于通过符合性审查且报价次低供应商响应报价65%，或低于最高限价65%，应启动异常低价审查；须在合理时间内提供书面说明及必要证明，不能证明报价合理性的才作无效投标处理。'},
    {page: 41, text: '详见附件：供应商应提交的相关证明材料。详见附件：施工图纸。'},
    {page: 46, text: '拟签订采购合同文本，详见附件：山东省政府采购合同（工程）.docx。'}
  ]);
}

test('结构化条款保留明确不收、无需和政策不涉及，而非未命中或模板强门槛', () => {
  const input = roofExcerpt(); const report = analyzeDocument(input);
  for (const name of ['投标', '履约', '质量']) {
    const item = cat(report, 'deposit').find(item => item.title.includes(name));
    assert.ok(item, `${name}保证金应形成单独完整结果`);
    assert.equal(item.applicability, 'not-required');
    assert.equal(item.hard, false);
    assert.match(item.interpretation, /不收|不缴|免交|无需/);
  }
  assert.ok(cat(report, 'sample').some(item => item.applicability === 'not-required'));
  assert.ok(cat(report, 'eco').some(item => item.applicability === 'not-required' && item.references.some(ref => ref.quote.includes('不涉及'))));
  assert.ok(!report.outputs.risks.some(item => item.categoryId === 'eco' && item.hard));
});

test('局部材料免除不能取消样品无效后果或资质硬门槛', () => {
  for(const text of ['供应商必须提交样品，未提交样品作无效响应处理；无需提交样品检测报告。','无需提交样品检测报告，但供应商必须提交样品，未提交样品作无效响应处理。']){
    const report=analyzeDocument(doc([{text}]));
    for(const category of ['sample','rejection'])assert.ok(cat(report,category).some(item=>item.hard&&item.applicability!=='not-required'),`${category}不得被检测报告免除取消`);
    assert.ok(report.outputs.risks.some(item=>item.quote.includes('必须提交样品')));
    assert.ok(cat(report,'sample').some(item=>item.fields['免除事项']?.some(value=>value.includes('检测报告'))));
    assert.ok(!cat(report,'sample').some(item=>/^文件明确无需提交所述材料/.test(item.interpretation)));
  }
  const qualification=analyzeDocument(doc([{section:'资格要求',text:'供应商资质必须达到三级且提供有效资质证书，无需提交ISO9001认证。'}]));
  assert.ok(cat(qualification,'qualification').some(item=>item.hard&&item.applicability!=='not-required'));
  assert.ok(qualification.outputs.risks.length);
  assert.equal(qualification.outputs.conclusion.label,'待核验');
});

test('不同采购包与来源的强采不涉及不能跨范围取消附件正向条件', () => {
  const main=doc([{text:'采购包1：本项目涉及强制采购节能产品：不涉及。'}],'scope-main');
  const attachment=doc([{text:'采购包2：响应产品属于政府强制采购的空调，必须提供有效节能认证，否则作无效响应处理。'}],'scope-attachment');
  const report=analyzeDocument(main,{attachments:[attachment]});
  const positive=cat(report,'eco').find(item=>item.references.some(ref=>ref.documentId===attachment.id));
  assert.equal(positive.hard,true);assert.notEqual(positive.applicability,'not-required');
  assert.ok(report.outputs.risks.some(item=>item.references.some(ref=>ref.documentId===attachment.id)));
  assert.ok(cat(report,'eco').some(item=>item.references.some(ref=>ref.documentId===main.id)&&item.applicability==='not-required'));
  assert.ok(!report.analysis.clarifications.some(item=>item.title==='强制采购适用范围表述差异'));
});

test('同文不同包的强采声明分别适用，未关联来源与履约阶段不得套用投标准入免除', () => {
  const same=analyzeDocument(doc([
    {text:'采购包1：本项目涉及强制采购节能产品：不涉及。'},
    {text:'采购包2：响应产品属于政府强制采购产品，必须提供有效节能认证，否则作无效响应处理。'}
  ]));
  assert.ok(same.outputs.risks.some(item=>item.quote.includes('采购包2')));
  assert.ok(!same.analysis.clarifications.some(item=>item.title==='强制采购适用范围表述差异'));
  const main=doc([{text:'本项目涉及强制采购节能产品：不涉及。'}],'main-scope');
  const other=analyzeDocument(main,{attachments:[doc([{text:'响应产品属于政府强制采购产品，必须提供节能认证，否则作无效响应处理。'}],'unknown-scope')]});
  assert.ok(other.outputs.risks.some(item=>item.references.some(ref=>ref.documentId==='unknown-scope')));
  assert.ok(other.analysis.clarifications.some(item=>/来源|范围/.test(item.title)));
  const stage=analyzeDocument(doc([{text:'采购包1：本项目涉及强制采购节能产品：不涉及。'},{text:'采购包1：施工期间如使用强制采购产品，供应商必须提供认证，未提供将不允许进场。'}]));
  assert.ok(cat(stage,'eco').some(item=>item.quote.includes('施工期间')&&item.applicability!=='not-required'));
});

test('经理跨页整组条件形成完整可执行要求，且企业事实不因未上传而失败', () => {
  const report = analyzeDocument(roofExcerpt());
  const manager = cat(report, 'personnel').find(item => item.quote.includes('注册二级') && item.quote.includes('预中标'));
  assert.ok(manager, '二级、B、本单位和全部兼职条件应联接');
  assert.equal(manager.subject, '供应商／拟派项目经理');
  assert.equal(manager.stage, '投标准备与资格审查');
  assert.ok(manager.references.some(ref => ref.page === 2));
  assert.ok(manager.references.some(ref => ref.page === 3));
  assert.ok(manager.actions.some(action => /本单位|兼职/.test(action)));
  assert.equal(manager.matchStatus, 'pending');
  assert.equal(report.outputs.conclusion.label, '待核验');
  assert.equal(all(report).some(item => item.matchStatus === 'unmet'), false);
});

test('13项评分绑定标准材料和原文，82/8/10校验，政策扣除不是额外5分', () => {
  const report = analyzeDocument(roofExcerpt());
  assert.ok(report.analysis?.scoring, '缺少完整评分报告');
  const scoring = report.analysis.scoring;
  assert.equal(scoring.items.length, 13);
  assert.deepEqual(scoring.groups.map(group => [group.name, group.maxScore]), [['技术',82],['商务',8],['价格',10]]);
  assert.equal(scoring.total, 100);
  assert.match(scoring.status, /校验通过/);
  const performance = scoring.items.find(item => item.title === '同类业绩');
  assert.equal(performance.maxScore, 3);
  assert.match(performance.standard, /2023年1月1日.*合同签订时间/);
  assert.ok(performance.materials.some(item => /验收/.test(item)));
  assert.ok(report.outputs.scoreItems.some(item => item.id === performance.id));
  assert.ok(!cat(report, 'performance').filter(item => item.quote.includes('每提供1个合同')).some(item => item.hard));
  assert.ok(all(report).some(item => item.fields['政策属性'] === '评审价格扣除' && JSON.stringify(item.fields).includes('5%')));
});

test('四项★正文与后果关联，40天含验收和付款不是同一时限', () => {
  const report = analyzeDocument(roofExcerpt());
  const starred = report.analysis?.keyRequirements.filter(item => item.quote.includes('★'));
  assert.equal(starred?.length, 4);
  for (const item of starred) { assert.equal(item.hard,true); assert.ok(item.actions.length); assert.ok(report.outputs.risks.some(risk => risk.id === item.id)); assert.ok(item.references.some(ref => /实质性要求.*负偏离/.test(ref.quote)), '每项★应关联真实后果的原文引用'); }
  assert.ok(starred.some(item => /40日历天竣工交付验收/.test(item.quote)));
  assert.ok(starred.some(item => /5年.*8年/.test(item.quote)));
  assert.ok(report.analysis.commercialRisks.some(risk => risk.references.some(ref => ref.quote.includes('40日历天')) && risk.references.some(ref => ref.quote.includes('审计完成'))));
  assert.ok(report.analysis.clarifications.some(item => /审计|付款/.test(item.title)));
  assert.ok(!report.analysis.overview.some(item => item.label.includes('付款') && /40天/.test(item.value)));
});

test('不涉及声明不能抹掉另一处明确适用产品，应保留来源矛盾待澄清', () => {
  const report = analyzeDocument(doc([
    {page:1,text:'本项目涉及强制采购节能产品：不涉及。'},
    {page:2,text:'空调属于政府强制采购产品，必须提供有效节能认证，未提供按无效响应处理。'}
  ]));
  const explicit = cat(report,'eco').find(item=>item.quote.includes('空调'));
  assert.equal(explicit.applicability,'required');
  assert.equal(explicit.hard,true);
  assert.ok(report.analysis.clarifications.some(item=>item.references.some(ref=>ref.page===1)&&item.references.some(ref=>ref.page===2)&&/强制采购/.test(item.title)));
});

test('数值总分不一致与评分行缺失报告真实校验缺口，不能悄悄配平', () => {
  const input = doc([{text:'技术部分40分、商务部分20分、价格40分。'},table([
    ['技术评审','技术方案','满足要求得30分，缺项不得分。','30','主观','技术方案'],
    ['商务评审','服务业绩','每合同5分，最多20分。','20','客观','合同'],
    ['价格评审','价格得分','最低合格报价为基准计算，满分40分。','40','客观','报价表']
  ], {headers:scoringHeaders, section:'评分标准'})]);
  const report = analyzeDocument(input);
  assert.equal(report.analysis?.scoring.total,90);
  assert.match(report.analysis.scoring.status,/不一致|缺口|待核验/);
  assert.ok(report.analysis.clarifications.some(item=>/评分|分值/.test(item.title)));
});

test('结构化评分之外明确附加计分仍进入加分输出，不把未明封顶的每项分值当总分', () => {
  const report=analyzeDocument(doc([
    table([['技术评审','技术方案','技术方案满足要求得40分。','40','主观','技术方案']],{headers:scoringHeaders}),
    {text:'提供有效环境认证的产品每项额外加2分；此段未说明累计上限。'}
  ]));
  assert.ok(report.outputs.scoreItems.some(item=>item.quote.includes('每项额外加2分')));
  assert.equal(report.analysis.scoring.total,40);
  assert.ok(report.analysis.clarifications.some(item=>/封顶|完整分值/.test(item.title)));
});

test('外层摘要表内嵌评分表头更新列含义并跨页继承，分类合并单元格不会变成项名', () => {
  const input=doc([
    table([['评审内容','评审标准'],['分值构成','技术部分20分商务部分3分价格10分'],scoringHeaders,['','设备实施方案','满足要求得10分，缺项不得分。','10','主观','实施方案']],{page:1,tableId:'nested',headers:['评审内容','评审标准']}),
    table([['技术评审','技术人员配备','齐全得10分，缺项不得分。','10','主观','人员表'],['商务评审','同类业绩','每合同1分，最多3分。','3','客观','合同及验收报告'],['价格评审','价格得分','按基准价公式计分。','10','客观','报价表']],{page:2,tableId:'nested',headers:['评审内容','评审标准']})
  ]);
  const scoring=analyzeDocument(input).analysis.scoring;
  assert.deepEqual(scoring.items.map(item=>item.title),['设备实施方案','技术人员配备','同类业绩','价格得分']);
  assert.equal(scoring.total,33);
  assert.ok(scoring.items.find(item=>item.title==='技术人员配备').materials.includes('人员表'));
});

test('采购方重评程序和目录不是供应商资格或废标，评分缺项不能直接否决', () => {
  const report = analyzeDocument(doc([
    {text:'二、供应商须知；'},
    {text:'除资格审查认定错误和价格计算错误外，采购人或者代理机构不得以任何理由组织重新评审。'},
    {text:'磋商文件未依法体现强制采购相关规定时，磋商小组应当停止评审。'},
    {section:'技术评分',text:'工作方案满分18分，每处不合理扣1分；缺项不得分，不作为直接废标理由。'}
  ]));
  assert.equal(report.outputs.risks.length,0);
  assert.ok(!cat(report,'qualification').some(item=>/重新评审/.test(item.quote)));
  assert.ok(all(report).filter(item=>/停止评审/.test(item.quote)).every(item=>item.subject.includes('采购')||item.subject.includes('磋商')));
});

test('已标记目录页眉页脚页号保留来源与未归类覆盖，但不生成业务条款', () => {
  const input=doc([
    {page:1,text:'资格审查不合格处理 .................................. 6',heading:true,role:'toc',section:'目录'},
    {page:2,text:'废标风险识别 .................................. 7',heading:true,role:'toc',section:'目录'},
    {page:2,text:'必须承诺内容 .................................. 12',heading:true,role:'toc',section:'目录'},
    {page:3,text:'供应商资格要求和废标风险',role:'page-header'},
    {page:4,text:'无效响应及必须承诺',role:'page-footer'},
    {page:5,text:'废标要求 第5页',role:'page-number'}
  ]);
  const original=JSON.stringify(input);const report=analyzeDocument(input);
  assert.equal(all(report).length,0);assert.equal(report.outputs.risks.length,0);assert.equal(report.outputs.commitments.length,0);
  assert.equal(report.coverage.unrecognizedBlocks.length,6);assert.equal(JSON.stringify(input),original);
  const candidate={categoryId:'rejection',quote:input.blocks[0].text,references:[{documentId:input.id,blockId:input.blocks[0].id,quote:input.blocks[0].text}],fields:{'后果':'响应无效'}};
  const supplemented=analyzeDocument(input,{additionalFindings:[candidate]});
  assert.equal(all(supplemented).length,0);assert.ok(supplemented.warnings.some(item=>item.code==='FINDING_NON_CONTENT_SOURCE'));
});

test('真实PDF目录与重复页眉页脚不会进入条款，但正文授权证明保持原文',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'biaoxi-analysis-role-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'目录正文.pdf');await writeFile(path,await textLayoutPdf());
  const input=await extractDocument({id:'layout-business',fileName:'目录正文.pdf',path});const report=analyzeDocument(input);
  const ignored=input.blocks.filter(block=>['toc','page-header','page-footer','page-number'].includes(block.role));
  assert.ok(ignored.some(block=>/废标风险/.test(block.text)));
  for(const block of ignored){assert.ok(!all(report).some(item=>item.references.some(ref=>ref.blockId===block.id)));assert.ok(report.coverage.unrecognizedBlocks.some(item=>item.blockId===block.id));}
  assert.ok(all(report).some(item=>item.quote.includes('有效施工资质')&&item.references.some(ref=>ref.page===2)));
  assert.ok(input.blocks.some(block=>block.text.includes('授权证明')&&block.page===2));
});

test('供应商资格能力承诺属于资格审查，信用承诺不套缴纳税社保分支',()=>{
  const input=doc([
    table([['1','供应商资格条件','具有履行合同所必需的设备和专业技术能力。','政府采购供应商资格承诺函'],['2','无不良信用记录','未列入重大税收违法失信主体等名单，提供无不良信用记录承诺函。','无不良信用记录承诺函']],{section:'一般资格审查',headers:['序号','审查内容','具体标准和要求','关联投标文件']}),
    {section:'资格要求',text:'省内供应商提供依法缴纳税收和社会保障资金承诺函；省外供应商提供2025年1月起任意一个月缴纳税收和社保的证明。'},
    {section:'技术要求',text:'施工期间供应商应自行投保施工保险，保险费用由供应商承担。'}
  ]);
  const report=analyzeDocument(input);const capability=cat(report,'qualification').find(item=>item.quote.includes('履行合同所必需'));
  assert.equal(capability.stage,'投标准备与资格审查');assert.doesNotMatch(capability.interpretation,/履约阶段义务/);
  assert.ok(!report.analysis.technical.some(item=>item.references.some(ref=>ref.quote.includes('履行合同所必需'))));
  const credit=cat(report,'qualification').find(item=>item.quote.includes('重大税收违法'));
  assert.ok(!credit.fields['材料适用分支']);assert.doesNotMatch(credit.interpretation,/任意一月|实际缴纳地|免税/);
  assert.ok(cat(report,'qualification').some(item=>item.quote.includes('省内')&&item.fields['材料适用分支']));
  assert.ok(report.analysis.technical.some(item=>item.references.some(ref=>ref.quote.includes('自行投保'))));
});

test('必须承诺输出只收真实声明承诺义务，不把通用签字免费恢复和报价确认当函',()=>{
  const report=analyzeDocument(doc([
    {text:'外文响应文件法定代表人须签字并提供护照复印件。'},
    {text:'结构植筋施工造成损坏的，供应商应免费恢复原状。'},
    {text:'修正后的报价由授权代表签字确认，拒绝确认的响应文件按无效处理。'},
    {text:'供应商须提交无不良信用记录承诺函，并由法定代表人签字盖章。'},
    {text:'供应商须提交真实性声明函，承诺全部材料真实有效。'}
  ]));
  assert.ok(report.outputs.commitments.some(item=>item.quote.includes('信用记录承诺函')));
  assert.ok(report.outputs.commitments.some(item=>item.quote.includes('真实性声明函')));
  for(const word of ['护照','植筋','修正后的报价'])assert.ok(!cat(report,'commitment').some(item=>item.quote.includes(word)));
  assert.ok(report.outputs.risks.some(item=>item.quote.includes('拒绝确认')));
  assert.ok(report.analysis.technical.some(item=>item.references.some(ref=>ref.quote.includes('免费恢复'))));
});

test('单独格式目录不冒充已明确承诺义务，缺口列出完整名称与已有项目内容边界',()=>{
  const input=doc([{page:5,section:'工程量清单',text:'工程量清单：防水材料工程项目，单位平方米，数量100，按技术要求施工。'},{page:8,text:'详见附件：响应有效期承诺函（不少于60日历日）。详见附件：工程量清单。详见附件：采购合同.docx。'}]);
  const report=analyzeDocument(input);
  assert.ok(!report.outputs.commitments.some(item=>/^详见附件/.test(item.quote)));
  const gaps=report.analysis.clarifications.filter(item=>/附件.*待取得/.test(item.title));assert.equal(gaps.length,1);
  for(const name of ['响应有效期承诺函','工程量清单','采购合同'])assert.ok(gaps[0].actions.some(action=>action.includes(name)));
  assert.match(gaps[0].interpretation,/已有|已经读取/);assert.match(gaps[0].interpretation,/不推定.*全部缺失/);
  assert.ok(gaps[0].references.some(ref=>ref.page===8));
  assert.ok(input.blocks.some(block=>block.page===5&&block.text.includes('数量100')));
  assert.ok(report.coverage.unrecognizedBlocks.some(block=>block.page===5));
});

test('评分材料优先原材料单元格与明确资料名称，不能截取任意标准语句作材料',()=>{
  const rows=[
    ['技术评审','施工安排','布置：平面布置图安排合理水电计划满足要求得5分；用量符合工程需要劳力安排保证措施完善，否则扣分。','5','主观','施工现场平面布置图、劳动力投入计划'],
    ['商务评审','同类业绩','2024年至今，每个合同得1分，最高3分；须提供加盖公章的有效合同扫描件以及验收报告扫描件。','3','客观','案例一览表及证明材料']
  ];
  const report=analyzeDocument(doc([table(rows,{headers:scoringHeaders})]));
  const materials=report.analysis.scoring.items[0].materials;
  assert.ok(materials.includes('施工现场平面布置图'));assert.ok(materials.includes('劳动力投入计划'));
  assert.ok(!materials.some(item=>/安排合理|用量符合|否则扣|布置[:：]/.test(item)));
  const performance=report.analysis.scoring.items[1].materials;
  assert.ok(performance.includes('合同扫描件'));assert.ok(performance.includes('验收报告扫描件'));
  assert.equal(new Set(performance.map(value=>value.normalize('NFKC').replace(/\s/g,''))).size,performance.length);
});

test('总览从独立正文事实读取名称金额，页脚不混入经理且采购方★设置说明不是硬门槛', () => {
  const report=analyzeDocument(doc([
    {page:1,text:'采购项目名称：中心设备采购'},
    {page:1,text:'采购项目编号：TEST001'},
    {page:1,text:'采购人：公共服务中心'},
    {page:2,text:'本项目预算及控制价为258000.00元，详细内容见采购清单。'},
    {page:3,section:'资格要求',text:'拟派项目经理具备建筑专业二级注册建造师证书，'},
    {page:3,text:'-第3页-'},
    {page:4,section:'资格要求',text:'具备有效B类证书，在本单位注册且不兼职其他在建项目。'},
    {page:5,text:'本章带“★”的要求为实质性要求，采购人、代理机构应当根据实际要求合理设定，并在符合性审查中明确响应要求。'}
  ]));
  assert.equal(report.analysis.overview.find(item=>item.label==='项目名称')?.value,'中心设备采购');
  assert.equal(report.analysis.overview.find(item=>item.label==='预算／最高限价')?.value,'258000.00元');
  const manager=cat(report,'personnel').find(item=>item.quote.includes('建造师'));
  assert.ok(!manager.quote.includes('第3页'));
  assert.ok(manager.references.some(ref=>ref.page===4));
  assert.ok(!report.outputs.risks.some(item=>item.quote.includes('合理设定')));
});

test('资格及符合性审查标准联接相应不合格后果，不把仅有格式目录当企业资质', () => {
  const headers=['序号','审查内容','具体标准和要求','关联投标文件格式文件'];
  const report=analyzeDocument(doc([
    table([['1','供应商信用记录','未被列入严重失信主体、失信被执行人等名单，提供截图加盖公章。','无不良信用记录承诺函'],['2','税收社保资料','省内供应商提供承诺函；省外提供2025年1月起任意一个月缴纳证明。','依法缴纳税收和社会保障资金承诺函']],{page:2,section:'一般资格审查',headers}),
    {page:2,text:'以上资格审查要求如有任意一项未满足，应按无效响应处理。'},
    table([['1','响应文件完整性','须符合文件式样、签署和盖章要求且内容完整。','案例一览表、特定资格、技术方案'],['2','响应有效期','有效期须满足须知附表要求。','响应有效期承诺函（不少于60日历日）'],['3','无认定为“响应无效”的其他情形','无认定为“响应无效”的其他情形。','{{未填写}}']],{page:3,section:'符合性审查',headers}),
    {page:3,text:'响应文件如有任意一项未满足以上符合性审查要求的，按无效响应处理。'},
    {page:4,text:'供应商有串通情形之一的作无效响应处理，恶意串通可吊销营业执照。'},
    {page:5,text:'修正后的报价经供应商确认后产生约束力，供应商不确认的，其响应文件作为无效处理。'},
    {page:5,text:'未按操作规范编制、确认、加密、盖章和提交的响应文件，将被拒绝接收。'}
  ]));
  for(const word of ['严重失信','省外','完整','有效期'])assert.ok(report.outputs.risks.some(item=>item.quote.includes(word)&&item.references.some(ref=>/任意一项未满足/.test(ref.quote))),`${word}应关联其审查后果`);
  assert.ok(!cat(report,'entity').some(item=>item.quote.includes('吊销')));
  assert.ok(!cat(report,'qualification').some(item=>item.quote.includes('案例一览表')));
  assert.ok(!report.outputs.risks.some(item=>/^3 \|/.test(item.quote)));
  assert.ok(report.outputs.risks.some(item=>item.quote.includes('供应商不确认')));
  assert.ok(report.outputs.risks.some(item=>item.quote.includes('拒绝接收')));
});

test('强制节能审查模板服从明确不涉及，采购评审争议规则与★指导不当企业红线', () => {
  const report=analyzeDocument(doc([
    {text:'本项目涉及强制采购节能产品：不涉及。'},
    table([['1','未按规定提供强制节能产品','未按文件规定提供强制节能产品的','其他材料']],{section:'符合性审查',headers:['序号','审查内容','具体标准和要求','关联投标文件']}),
    {text:'本章带“★”的要求为实质性要求，采购人、代理机构应当根据实际要求合理设定，并在符合性审查中明确响应要求。'},
    {text:'标注“★”的条款是实质性要求，如负偏离将按无效报价处理。'},
    {text:'磋商小组对资格审查、符合性审查和对供应商响应文件作无效处理等共同认定事项存在争议的，应当以少数服从多数原则作出结论。'}
  ]));
  assert.equal(report.outputs.risks.length,0);
  assert.ok(cat(report,'eco').some(item=>item.quote.includes('未按规定')&&item.applicability==='not-required'));
});

test('不同采购项目的强采优采样品资格评分可共存，条件不同不得错误互相覆盖', () => {
  const report = analyzeDocument(doc([
    {text:'投标人须具备有效医疗器械经营许可证，资格要求须满足。'},
    {text:'显示器明确列为政府强制采购产品，必须提供有效节能认证；耗材属于优先采购，提供认证可享受政策优惠。'},
    {text:'投标时须提交设备样品1台，未提供样品投标无效。'},
    {text:'安装阶段须购买施工保险，验收时提交保修书。'},
    {text:'须提交真实性承诺函，由授权代表签字并加盖公章。'},
    {text:'商务评分：2024年1月1日起相似供货合同每项3分，最多12分，未提供不得分。'},
    {text:'技术方案最高18分。'},
    {text:'价格得分满分70分，最低合格报价为基准。'}
  ],'other-project'));
  assert.ok(report.outputs.risks.some(item=>item.categoryId==='sample'));
  assert.ok(cat(report,'eco').some(item=>item.applicability!=='not-required'));
  assert.ok(report.outputs.commitments.every(item=>!item.quote.includes('安装阶段')));
  assert.ok(report.analysis.technical.some(item=>/保险|保修/.test(item.interpretation)));
  assert.ok(report.analysis.scoring.items.some(item=>item.maxScore===12 && /2024/.test(item.standard)));
});

test('低价规则保留三个比较群体与先解释后否决，附件阅读缺口具体列出', () => {
  const report = analyzeDocument(roofExcerpt());
  const low = all(report).find(item=>item.fields['低价审查触发']?.length===3);
  assert.ok(low);
  assert.match(low.interpretation,/审查|解释/);
  assert.match(low.fields['不满足后果'],/不能证明|解释/);
  assert.ok(low.actions.some(action=>/书面说明|成本/.test(action)));
  assert.ok(report.analysis.clarifications.some(item=>item.references.some(ref=>ref.page===46) && item.actions.some(action=>/合同/.test(action))));
  assert.ok(report.analysis.clarifications.some(item=>/图纸/.test(item.title)||item.actions.some(action=>/图纸/.test(action))));
});

test('费用、保险、现场索赔和图纸合同缺口进入全文风险，已内嵌模板不重复判缺', () => {
  const report=analyzeDocument(doc([
    {text:'本项目为工程类采购。'},
    table([['代理服务费','成交供应商承担代理服务费，按成交金额2%收取，不足3000元按3000元收取；见证费按成交金额1‰收取。']],{headers:['应知事项','说明和要求']}),
    {text:'供应商自行投保工程一切风险及第三方责任险，保险费由供应商承担，不单独报价。'},
    {text:'供应商应充分了解施工现场；忽视或误解现场情况导致的索赔或工期延长申请不获批准。'},
    {text:'施工内容详见工程量清单及图纸。'},
    {text:'详见附件：采购合同.docx。详见附件：真实性声明模板。'},
    {text:'真实性声明模板\n供应商名称：____；法定代表人签字：____；加盖公章。'},
    {text:'如所投产品在境内生产，应如实填写声明函；如不在境内生产，无需填写声明函。'},
    {text:'适用本国产品标准时，货物或服务采购项目对符合条件的产品报价给予20%的价格扣除。'}
  ]));
  assert.ok(report.analysis.commercialRisks.some(item=>/费用|服务费/.test(item.title)&&item.references.some(ref=>ref.quote.includes('2%'))));
  assert.ok(report.analysis.technical.some(item=>/保险|投保/.test(item.interpretation)));
  assert.ok(report.analysis.commercialRisks.some(item=>/现场/.test(item.title)&&item.references.some(ref=>ref.quote.includes('索赔'))));
  assert.ok(report.analysis.clarifications.some(item=>/图纸/.test(item.title)));
  assert.ok(report.analysis.clarifications.some(item=>item.actions.some(action=>/采购合同/.test(action))));
  assert.ok(!report.analysis.clarifications.some(item=>item.actions.some(action=>/真实性声明模板/.test(action))));
  const conditional=cat(report,'commitment').find(item=>item.quote.includes('境内生产'));
  assert.equal(conditional.applicability,'conditional');
  assert.match(conditional.fields['适用性'],/条件/);
  assert.ok(report.analysis.clarifications.some(item=>/本国产品|政策适用/.test(item.title)));
});

test('连续附件目录按各名称列缺口且不当资格，前述无效后果保留具体条件', () => {
  const report=analyzeDocument(doc([
    {page:1,section:'串通行为',text:'（一）不同供应商的响应文件由同一人编制。'},
    {page:1,section:'串通行为',text:'（二）不同供应商的响应文件相互混装。'},
    {page:2,section:'串通行为',text:'供应商有前述一至二条情形之一的，作无效响应处理。'},
    {page:3,section:'响应文件格式',text:'详⻅附件：特定资格详⻅附件：响应有效期承诺函（不少于70日历日）详⻅附件：采购合同.docx'},
    table([['','', '-第4页-','资格证明、承诺函、技术方案']],{page:4,section:'符合性审查',headers:['序号','审查内容','具体标准和要求','关联投标文件格式文件']})
  ]));
  assert.ok(!report.outputs.risks.some(item=>item.references.some(ref=>ref.page===3||ref.page===4)));
  const attachmentGaps=report.analysis.clarifications.filter(item=>/附件.*待取得/.test(item.title));
  assert.equal(attachmentGaps.length,1);
  for(const name of ['特定资格','响应有效期承诺函','采购合同'])assert.ok(attachmentGaps[0].actions.some(action=>action.includes(name)));
  assert.ok(attachmentGaps[0].references.some(ref=>ref.page===3));
  const collusion=report.outputs.risks.find(item=>item.quote.includes('前述一至二'));
  assert.ok(collusion.references.some(ref=>ref.quote.includes('同一人编制')));
  assert.ok(collusion.references.some(ref=>ref.quote.includes('相互混装')));
});

test('前述编号范围完整关联无主体关键词的主项、跨页与子项上下文，不扫固定窗口',()=>{
  const section=page=>`供应商不得具有的情形 / 第 ${page} 页`;
  const input=doc([
    {page:1,section:section(1),text:'一、提供虚假材料谋取成交；'},
    {page:1,section:section(1),text:'二、供应商串通报价，有下列情形之一的：'},
    ...Array.from({length:17},(_,i)=>({page:i<8?1:2,section:section(i<8?1:2),text:`（${i+1}）串通行为定义${i+1}，具体事项按该主项核验；`})),
    {page:2,section:section(2),text:'三、向采购人行贿；'},
    {page:2,section:section(2),text:'四、成交后无正当理由拒绝签订合同；'},
    {page:3,section:section(3),text:'供应商有前述一至三条情形之一的，作无效响应处理。'}
  ]);
  const report=analyzeDocument(input);const linked=report.outputs.risks.find(item=>item.quote.includes('前述一至三条'));
  assert.ok(linked);for(const word of ['提供虚假材料','供应商串通报价','向采购人行贿'])assert.ok(linked.references.some(ref=>ref.quote.includes(word)),word);
  assert.ok(linked.references.some(ref=>ref.page===1));assert.ok(linked.references.some(ref=>ref.page===3));
  assert.ok(!linked.references.some(ref=>ref.quote.startsWith('四、')));
  assert.deepEqual(linked.fields['关联主项编号'],['1','2','3']);
  assert.ok(linked.fields['枚举子项说明']);
  const minimal=analyzeDocument(doc([{section:'纪律要求',text:'一、提供虚假材料谋取成交。'},{section:'纪律要求',text:'二、供应商串通报价。'},{section:'纪律要求',text:'三、向采购人行贿。'},{section:'纪律要求',text:'供应商有前述一至三条情形之一的，作无效响应处理。'}]));
  for(const word of ['虚假材料','行贿'])assert.ok(minimal.outputs.risks.some(item=>item.quote.includes(word)&&item.quote.includes('前述一至三')));
});

test('编号关联止于所属枚举段落，不把同节前一组或其他文件的同号条款带入',()=>{
  const input=doc([{section:'纪律要求',text:'一、旧组文件必须保密。'},{section:'纪律要求',text:'二、旧组文件不得外传。'},{section:'纪律要求',text:'以下为新的响应禁止情形：'},{section:'纪律要求',text:'一、提供虚假材料谋取成交。'},{section:'纪律要求',text:'二、向采购人行贿。'},{section:'纪律要求',text:'三、拒绝履行已签合同。'},{section:'纪律要求',text:'有上述第1至第2条任一情形的，响应文件作无效处理。'}],'enum-main');
  const report=analyzeDocument(input,{attachments:[doc([{section:'纪律要求',text:'一、另一文件的同号条件。'}],'enum-other')]});
  const linked=report.outputs.risks.find(item=>item.quote.includes('上述第1至第2'));
  assert.ok(linked.references.some(ref=>ref.quote.includes('虚假材料')));assert.ok(linked.references.some(ref=>ref.quote.includes('行贿')));
  assert.ok(!linked.references.some(ref=>/旧组|另一文件|拒绝履行/.test(ref.quote)));
});

test('多采购包同名评分保留各自标准材料来源，分包统计不得混加或丢失',()=>{
  const input=doc([
    {section:'采购包1评分标准',text:'技术部分10分。'},
    table([['技术评审','实施方案','满足包1实施要求得10分，缺项不得分。','10','主观','包1实施方案']],{page:2,section:'采购包1评分标准',headers:scoringHeaders}),
    {section:'采购包2评分标准',text:'技术部分20分。'},
    table([['技术评审','实施方案','满足包2实施要求得20分，缺项不得分。','20','主观','包2实施方案']],{page:4,section:'采购包2评分标准',headers:scoringHeaders})
  ]);
  const report=analyzeDocument(input);const scoring=report.analysis.scoring;
  assert.equal(scoring.items.length,2);assert.equal(report.outputs.scoreItems.length,2);assert.equal(scoring.total,null);
  assert.deepEqual(scoring.packages.map(group=>[group.package,group.total]),[['1',10],['2',20]]);
  for(const [packageId,score] of [['1',10],['2',20]]){const item=scoring.items.find(item=>item.package===packageId);assert.ok(item);assert.equal(item.maxScore,score);assert.ok(item.materials.includes(`包${packageId}实施方案`));assert.ok(item.references.some(ref=>ref.section.includes(`采购包${packageId}`)));assert.equal(item.scope.documentId,input.id);assert.match(scoring.packages.find(group=>group.package===packageId).status,/校验通过/);}
});

test('某采购包仅有评分总分声明但无分项时保留该包缺口，不能因另一包有表而忽略',()=>{
  const report=analyzeDocument(doc([{section:'采购包1评分标准',text:'技术部分10分。'},table([['技术评审','实施方案','符合要求得10分。','10','主观','实施方案']],{section:'采购包1评分标准',headers:scoringHeaders}),{section:'采购包2评分标准',text:'技术部分20分。'}]));
  const missing=report.analysis.scoring.packages.find(pack=>pack.package==='2');assert.ok(missing);assert.equal(missing.items.length,0);assert.equal(missing.total,null);assert.match(missing.status,/缺口|未识别|待核验/);
  assert.equal(report.analysis.scoring.total,null);assert.ok(report.analysis.clarifications.some(item=>/评分/.test(item.title)&&item.references.some(ref=>ref.section.includes('采购包2'))));
});

test('同包同名不同来源的评分保留版本依据且独立统计，不能默认主文覆盖附件',()=>{
  const main=doc([table([['技术评审','实施方案','满足主文件要求得10分。','10','主观','主文件方案']],{section:'采购包1评分标准',headers:scoringHeaders})],'score-main');
  const attachment=doc([table([['技术评审','实施方案','满足附件要求得20分。','20','主观','附件方案']],{section:'采购包1评分标准',headers:scoringHeaders})],'score-attachment');
  const scoring=analyzeDocument(main,{attachments:[attachment]}).analysis.scoring;
  assert.equal(scoring.items.length,2);assert.equal(scoring.packages.length,2);assert.equal(scoring.total,null);
  assert.deepEqual(new Set(scoring.items.map(item=>item.scope.documentId)),new Set([main.id,attachment.id]));
});

test('不同包或明确不同阶段的日期质保差异不产生冲突废标风险，同范围差异仍保留',()=>{
  const report=analyzeDocument(doc([
    {text:'采购包1：投标截止时间为2026-10-20 09:00，质保期为1年。'},
    {text:'采购包2：投标截止时间为2026-10-21 09:00，质保期为2年。'},
    {text:'采购包3：投标准备阶段样品质保期为1年。'},
    {text:'采购包3：履行合同安装阶段产品质保期为2年。'}
  ]));
  assert.equal(cat(report,'consistency').filter(item=>item.fields['冲突事项']).length,0);
  assert.ok(!report.outputs.risks.some(item=>item.categoryId==='consistency'));
  const same=analyzeDocument(doc([{text:'采购包1：投标截止时间为2026-10-20 09:00。'},{text:'采购包1：投标截止时间为2026-10-21 09:00。'}]));
  assert.ok(same.outputs.risks.some(item=>item.categoryId==='consistency'&&item.references.length===2));
});

test('不同来源同包数值差异先澄清来源适用关系，不能先确认为冲突或采用一方',()=>{
  const report=analyzeDocument(doc([{text:'采购包1：投标截止时间为2026-10-20 09:00。'}],'deadline-main'),{attachments:[doc([{text:'采购包1：投标截止时间为2026-10-21 09:00。'}],'deadline-attachment')]});
  const item=cat(report,'consistency').find(item=>item.fields['差异事项']);assert.ok(item);assert.ok(!item.fields['冲突事项']);assert.equal(item.hard,false);assert.equal(item.matchStatus,'pending');
  assert.ok(item.references.some(ref=>ref.documentId==='deadline-main'));assert.ok(item.references.some(ref=>ref.documentId==='deadline-attachment'));
  assert.ok(report.analysis.clarifications.some(item=>/来源.*范围|范围.*来源/.test(item.title)));
  assert.ok(!report.outputs.risks.some(item=>item.categoryId==='consistency'));assert.equal(report.outputs.conclusion.label,'待核验');
});

test('完整事实与分析意见仍经过原有人工覆盖和企业复核门禁，重算不丢分析', () => {
  const report = analyzeDocument(roofExcerpt());
  const copy = summarizeReport(report);
  assert.ok(copy.analysis?.overview.length, '重算应保留真实项目分析');
  assert.deepEqual(copy.analysis,report.analysis);
  assert.equal(copy.outputs.conclusion.label,'待核验');
  for (const finding of all(copy)) {assert.ok(finding.references.length); assert.equal(finding.reviewed,false); assert.equal(finding.matchStatus,'pending');}
});

test('在线失败或取消后的人工重算保留partial状态，仍只按人工事实形成企业结论',()=>{
  for(const status of ['failed','cancelled']){
    const report=analyzeDocument(doc([{section:'资格要求',text:'供应商须具备有效施工资质证书。'}]));
    report.onlineFailed=true;report.analysisStatus='partial';report.aiSynthesis={status};
    const pending=summarizeReport(report);assert.equal(pending.analysisStatus,'partial');assert.equal(pending.outputs.conclusion.label,'待核验');
    report.companySnapshot=confirmedCompanyFixture();
    for(const item of all(report)){item.matchStatus='met';item.reviewed=true;}
    report.coverageReview={reviewed:true,note:'人工对照原件确认完整覆盖和企业事实'};
    const licenseOnly=summarizeReport(report);assert.equal(licenseOnly.analysisStatus,'partial');assert.equal(licenseOnly.outputs.conclusion.label,'待核验');assert.equal(licenseOnly.companyAnalysis.qualification.status,'pending');
    report.companySnapshot.records.push({id:'demo-construction-qualification',type:'qualification',name:'演示测试施工资质证书',verified:true,documentIds:['demo-qualification-original'],fields:{subjectName:'演示测试企业',category:'施工资质',certificateNumber:'DEMONSTRATION-QUALIFICATION-ONLY',validFrom:'2024-01-01',validUntil:'2028-01-01',evidence:[{kind:'certificate',documentId:'demo-qualification-original',verified:true}]},sources:[{documentId:'demo-qualification-original',blockId:'demo-qualification-original-b1',page:1,fileName:'演示测试施工资质证书.txt',quote:'持证企业：演示测试企业；施工资质证书：仅供测试；有效期2024-01-01至2028-01-01。'}]});
    const reviewed=summarizeReport(report);assert.equal(reviewed.analysisStatus,'partial');assert.equal(reviewed.outputs.conclusion.label,'可投');
    assert.equal(reviewed.companyAnalysis.qualification.status,'met');
  }
});

test('人工更新同一硬事实后重点要求和四项输出同步当前状态，综合建议保留', () => {
  const report=analyzeDocument(roofExcerpt());
  const item=report.categories.flatMap(category=>category.items).find(item=>item.fields['实质性要求']&&item.categoryId==='payment');
  item.reviewed=true;item.matchStatus='unmet';item.notes=['人工确认不能响应付款条件'];
  const copy=summarizeReport(report);
  assert.equal(copy.outputs.conclusion.label,'不建议投');
  assert.equal(copy.analysis.keyRequirements.find(finding=>finding.relatedFindingIds.includes(item.id)).matchStatus,'unmet');
  assert.deepEqual(copy.analysis.commercialRisks,report.analysis.commercialRisks);
});

test('合成46页屋面结构回归保留业务条件、13评分、四★、否定事项及读取缺口', () => {
  const input=JSON.parse(readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url)));
  const report=analyzeDocument(input);
  const normalized=value=>value.normalize('NFKC').replace(/\s/g,'');
  assert.equal(input.pages.length,46);
  assert.equal(report.analysis.overview.find(item=>item.label==='项目名称').value,'示例办公楼屋面改造');
  assert.equal(report.analysis.overview.find(item=>item.label==='预算／最高限价').value,'1122100.00元');
  assert.deepEqual(report.analysis.scoring.groups.map(item=>[item.name,item.maxScore]),[['技术',82],['商务',8],['价格',10]]);
  assert.equal(report.analysis.scoring.items.length,13);assert.equal(report.outputs.scoreItems.length,13);assert.equal(report.analysis.scoring.total,100);
  const performance=report.analysis.scoring.items.find(item=>item.title==='同类业绩');
  assert.match(performance.standard.normalize('NFKC'),/2023年1月1日/);assert.match(performance.standard.normalize('NFKC'),/合同签订时间/);assert.ok(performance.materials.some(item=>/验收/.test(item)));
  const manager=cat(report,'personnel').find(item=>item.references.some(ref=>ref.page===2)&&item.references.some(ref=>ref.page===3));
  for(const word of ['注册二级','建筑工程专业','(B)','本单位注册','在建','在施','中标','预中标','电子证书'])assert.ok(manager.quote.normalize('NFKC').replace(/\s/g,'').includes(word),word);
  const starred=report.analysis.keyRequirements.filter(item=>item.fields['实质性要求']);assert.equal(starred.length,4);
  assert.ok(starred.every(item=>item.references.some(ref=>ref.quote.normalize('NFKC').includes('负偏离'))));
  assert.ok(starred.some(item=>item.quote.normalize('NFKC').includes('40日历天竣工交付验收完成')));
  assert.ok(starred.some(item=>/5年.*防水8年/.test(item.quote.normalize('NFKC'))));
  assert.equal(cat(report,'deposit').filter(item=>item.applicability==='not-required').length,3);
  assert.ok(cat(report,'survey').some(item=>item.applicability==='not-required'));
  assert.ok(cat(report,'sample').some(item=>item.applicability==='not-required'));
  assert.ok(cat(report,'eco').some(item=>item.quote.normalize('NFKC').includes('强制采购')&&item.applicability==='not-required'));
  assert.ok(!report.outputs.risks.some(item=>item.categoryId==='eco'||/目录|重新评审|合理设定|共同认定/.test(item.quote.normalize('NFKC'))));
  assert.ok(report.outputs.risks.some(item=>item.quote.normalize('NFKC').includes('90日历日')));
  assert.ok(report.outputs.risks.some(item=>item.fields['低价审查触发']?.length===3));
  const enumerated=report.outputs.risks.find(item=>normalized(item.quote).includes('前述一至六条'));
  assert.ok(enumerated);assert.deepEqual(enumerated.fields['关联主项编号'],['1','2','3','4','5','6']);
  for(const word of ['提供虚假材料谋取成交','向采购人或者代理机构、磋商小组成员行贿','一、有下列情形之一','二、有下列情形之一'])assert.ok(enumerated.references.some(ref=>normalized(ref.quote).includes(word)),word);
  assert.ok(enumerated.references.some(ref=>ref.page===9));assert.ok(enumerated.references.some(ref=>ref.page===10));
  assert.ok(!enumerated.references.some(ref=>/^七、成交后|^八、未按照|^九、将政府/.test(normalized(ref.quote))));
  assert.ok(enumerated.fields['枚举子项说明']);
  assert.ok(report.analysis.clarifications.some(item=>item.actions.some(action=>/合同/.test(action))));assert.ok(report.analysis.clarifications.some(item=>/图纸/.test(item.title)||item.actions.some(action=>/图纸/.test(action))));
  assert.ok(report.analysis.commercialRisks.some(item=>item.title.includes('服务费用')));
  const capability=cat(report,'qualification').find(item=>normalized(item.quote).includes('履行合同所必需'));
  assert.equal(capability.stage,'投标准备与资格审查');assert.doesNotMatch(capability.interpretation,/履约阶段义务/);
  assert.ok(!report.analysis.technical.some(item=>item.references.some(ref=>normalized(ref.quote).includes('履行合同所必需'))));
  const credit=cat(report,'qualification').find(item=>normalized(item.quote).includes('重大税收违法'));
  assert.ok(credit);assert.ok(!credit.fields['材料适用分支']);assert.doesNotMatch(credit.interpretation,/实际缴纳地|任意一月|免税/);
  for(const item of report.outputs.commitments){assert.ok(!/护照|植筋|修正后的报价/.test(normalized(item.quote)));assert.ok(!item.fields['附件目录属性']);}
  for(const item of report.analysis.scoring.items){assert.ok(!item.materials.some(material=>/置[:：]|用量符合|安排合理|工程需要劳力/.test(material)));assert.equal(new Set(item.materials.map(normalized)).size,item.materials.length);}
  assert.ok(performance.materials.includes('合同扫描件'));assert.ok(performance.materials.includes('验收报告扫描件'));
  const gaps=report.analysis.clarifications.filter(item=>/附件.*待取得/.test(item.title));assert.equal(gaps.length,1);
  assert.ok(gaps[0].actions.some(action=>/工程量清单.*山东省政府采购合同/.test(action)));assert.match(gaps[0].interpretation,/不推定.*全部缺失/);
  assert.equal(report.outputs.conclusion.label,'待核验');assert.equal(report.coverage.complete,false);assert.ok(report.warnings.some(item=>item.code==='PDF_OVERLAPPING_TEXT'&&item.page===23));
  const blocks=new Map(input.blocks.map(block=>[block.id,block]));
  for(const finding of all(report))for(const ref of finding.references)assert.ok(blocks.get(ref.blockId).text.includes(ref.quote),`${ref.page}页引用必须是真实原段片段`);
});
