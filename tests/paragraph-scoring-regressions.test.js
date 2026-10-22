import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {analyzeDocument} from '../src/core/analyzer.js';
import {extractDocument} from '../src/core/extractor.js';

const document=(texts,sections=[])=>({id:'paragraph-scores',fileName:'合成段落评分.txt',complete:true,warnings:[],blocks:texts.map((text,index)=>({id:`paragraph-${index}`,text,page:index+1,section:sections[index]||'评分标准',kind:'paragraph'}))});
const scoring=input=>analyzeDocument(input).analysis.scoring;

test('综合公开样例逐项识别100分，跨章业绩重述不重复计分且保留全部来源',async()=>{
  const input=await extractDocument({id:'public-comprehensive',fileName:'综合招标-测试用途.txt',path:fileURLToPath(new URL('./fixtures/综合招标-测试用途.txt',import.meta.url))});
  assert.equal(input.complete,true);const before=JSON.stringify(input),report=analyzeDocument(input),scores=report.analysis.scoring;
  assert.equal(scores.total,100);
  assert.deepEqual(scores.groups.map(item=>[item.name,item.maxScore]),[['技术',40],['商务',20],['价格',30],['附加',10]]);
  assert.equal(scores.items.length,10);assert.match(scores.status,/校验通过/);
  const experience=scores.items.find(item=>/供货业绩/.test(item.title));assert.ok(experience);
  assert.equal(experience.maxScore,6);assert.ok(experience.references.some(ref=>ref.quote.includes('数量上限3份')));assert.ok(experience.standard.includes('单份合同金额不少于20万元'));
  for(const item of scores.items)for(const ref of item.references){const block=input.blocks.find(block=>block.id===ref.blockId);assert.ok(block.text.includes(ref.quote),ref.quote);}
  assert.equal(JSON.stringify(input),before);assert.equal(report.outputs.conclusion.label,'待核验');
});

test('同段各独立封顶和固定认证得分分别形成评分项',()=>{
  const input=document(['商务评分：售后服务方案最高8分；质量管理体系认证在有效期内得3分，环境管理体系认证在有效期内得3分。']);
  const scores=scoring(input);assert.equal(scores.total,14);assert.equal(scores.items.length,3);
  assert.deepEqual(scores.items.map(item=>item.maxScore),[8,3,3]);assert.ok(scores.items.every(item=>item.group==='商务'));
  assert.ok(scores.items.every(item=>item.references.every(ref=>input.blocks[0].text.includes(ref.quote))));
});

for(const suffix of ['；本项最高3分。','，以上证书合计最高3分。'])test(`认证子项共享封顶约束相关证书${suffix}`,()=>{
  const text='附加评分：质量管理体系认证有效得3分，环境管理体系认证有效得3分'+suffix,scores=scoring(document([text]));
  assert.equal(scores.total,3);assert.equal(scores.items.length,1);assert.equal(scores.items[0].group,'附加');
  assert.ok(scores.items[0].standard.includes('质量管理体系'));assert.ok(scores.items[0].standard.includes('环境管理体系'));assert.ok(scores.items[0].standard.includes('最高3分'));
  assert.ok(scores.items[0].references.every(ref=>text.includes(ref.quote)));
});

test('共享封顶不能凭空增加固定子项分数，也不影响前一独立评分',()=>{
  const scores=scoring(document(['商务评分：服务方案最高8分；质量管理体系认证有效得3分，环境管理体系认证有效得3分，以上证书合计最高10分。']));
  assert.equal(scores.total,14);assert.equal(scores.items.length,2);assert.deepEqual(scores.items.map(item=>item.maxScore),[8,6]);
});

for(const [name,text] of [
  ['两个独立封顶','附加评分：质量管理体系认证为独立项最高3分；环境管理体系认证为另一独立项最高3分，本项最高3分；两项分别计分。'],
  ['固定分在前封顶项在后','附加评分：质量管理体系认证有效得3分；环境管理体系认证为独立项最高3分，本项最高3分。'],
  ['封顶项在前固定分在后','附加评分：质量管理体系认证为独立项最高3分；环境管理体系认证有效得3分，本项最高3分。']
])test(`本项仅约束最近认证项，不跨过已有独立封顶：${name}`,()=>{
  const scores=scoring(document([text]));assert.equal(scores.total,6);assert.equal(scores.items.length,2);
  assert.deepEqual(scores.items.map(item=>item.maxScore),[3,3]);
});

test('两项已有封顶的证书只有明确合计文字才受共享上限约束',()=>{
  const scores=scoring(document(['附加评分：质量管理体系认证最高3分；环境管理体系认证最高3分，以上证书合计最高3分。']));
  assert.equal(scores.total,3);assert.equal(scores.items.length,1);
});

test('连续固定认证得分后的本项封顶暂按上限列示并明确待澄清范围',()=>{
  const report=analyzeDocument(document(['附加评分：质量管理体系认证有效得3分，环境管理体系认证有效得3分；本项最高3分。']));
  assert.equal(report.analysis.scoring.total,3);assert.match(report.analysis.scoring.status,/待核验|待澄清/);
  assert.ok(report.analysis.clarifications.some(item=>/本项|封顶/.test(item.title)&&/范围/.test(item.interpretation)));
});

test('同项重复封顶和扣分条款只计一次且扣分标准完整保留',()=>{
  const scores=scoring(document(['技术评分：技术方案满分20分，最高20分；每处不合理扣0.5分，缺项不得分。']));
  assert.equal(scores.total,20);assert.equal(scores.items.length,1);assert.match(scores.items[0].standard,/扣0.5分.*缺项不得分/);
});

test('分号后的本项重复封顶不增加第二个评分项',()=>{
  const scores=scoring(document(['技术评分：技术方案满分20分；本项最高20分；每处不合理扣0.5分。']));
  assert.equal(scores.total,20);assert.equal(scores.items.length,1);assert.match(scores.items[0].standard,/本项最高20分.*扣0.5分/);
});

test('优秀良好等评分档位不累加成独立满分',()=>{
  const scores=scoring(document(['技术评分：技术方案优秀得5分；良好得3分；一般得1分。']));
  assert.notEqual(scores.total,9);assert.ok(scores.items.length<=1);
});

test('资格与独立评分共段时不把许可证硬门槛变成评分材料',()=>{
  const report=analyzeDocument(document(['资格要求：投标人须具备有效许可证，未具备的响应无效；技术评分：技术方案满分20分。']));
  assert.equal(report.analysis.scoring.total,20);
  const gate=report.categories.find(category=>category.id==='qualification').items.find(item=>item.quote.includes('有效许可证'));
  assert.ok(gate?.hard);assert.equal(gate.fields['满分'],undefined);assert.ok(report.outputs.risks.some(item=>item.id===gate.id));
  assert.ok(!report.analysis.scoring.items[0].standard.includes('有效许可证'));
});

for(const verb of ['应具备','应具有','必须持有'])test(`尾随${verb}的许可证义务独立于前一评分`,()=>{
  const text=`资格要求：供应商须具备有效许可证，未提供响应无效；技术评分：技术方案最高20分；供应商${verb}有效安全生产许可证，否则响应无效。`,report=analyzeDocument(document([text]));
  assert.equal(report.analysis.scoring.total,20);
  const gate=report.categories.find(category=>category.id==='qualification').items.find(item=>item.quote.includes('安全生产许可证'));
  assert.ok(gate?.hard);assert.equal(gate.fields['满分'],undefined);assert.ok(report.outputs.risks.some(item=>item.id===gate.id));
  assert.ok(!report.analysis.scoring.items[0].standard.includes('安全生产许可证'));
});

test('总分与分组声明只作核对，不配平缺少的评分项',()=>{
  const declaration='总分100分：商务分20分、技术分50分、报价分30分。';
  assert.equal(scoring(document([declaration])).items.length,0);
  const scores=scoring(document([declaration,'技术评分：技术方案最高12分。']));
  assert.equal(scores.total,12);assert.equal(scores.items.length,1);assert.match(scores.status,/不一致|待核验/);
});

for(const [text,expected] of [
  ['报价评分：报价满分25分，最低有效报价为基准价。',25],
  ['报价分：报价得分=(基准价/投标报价)×30。',30]
])test(`报价满分或明确比值公式识别价格组${expected}分`,()=>{
  const scores=scoring(document([text]));assert.equal(scores.total,expected);assert.equal(scores.items.length,1);assert.equal(scores.items[0].group,'价格');assert.equal(scores.items[0].standard,text);
});

test('含额外权重的报价公式不猜封顶，未知每项加分不当作满分',()=>{
  for(const text of ['报价分：报价得分=(基准价/投标报价)×30×0.8。','附加评分：每提供一项认证加2分，未写明累计上限。','评分扣分说明：每缺一项扣3分，最多扣6分。']){
    const scores=scoring(document([text]));assert.equal(scores.items.length,0,text);assert.equal(scores.total,null,text);
  }
});

test('同段明确两个采购包分别计分，不跨包求和或合并同名项',()=>{
  const scores=scoring(document(['采购包1：技术评分：技术方案满分20分；采购包2：技术评分：技术方案满分20分。']));
  assert.equal(scores.total,null);assert.equal(scores.items.length,2);assert.deepEqual(scores.packages.map(pack=>[pack.package,pack.total]),[['1',20],['2',20]]);
});

test('新采购包不继承上包商务组，实施方案依自身内容进入技术组',()=>{
  const scores=scoring(document(['采购包1：商务评分：业绩最高6分；采购包2：实施方案最高20分。']));
  assert.equal(scores.total,null);assert.deepEqual(scores.items.map(item=>[item.package,item.group,item.maxScore]),[['1','商务',6],['2','技术',20]]);
});

test('相同评分重印归并来源，不同认证项目相同分数仍独立',()=>{
  const scores=scoring(document(['附加评分：节能认证最高5分。','附加评分：节能认证最高5分。','附加评分：质量体系认证有效得3分，环境体系认证有效得3分。']));
  assert.equal(scores.total,11);assert.equal(scores.items.length,3);assert.equal(scores.items.find(item=>item.maxScore===5).references.length,2);
});

test('业绩数量重述只关联同包唯一原项，歧义重述不重复增加分值',()=>{
  const unique=scoring(document(['商务评分：同类供货业绩每份合同得2分，最高6分。','同类供货业绩须提供合同及验收证明。','数量上限3份，对应每份2分、最高6分。本章业绩仅为评分条件。'],['商务评分标准','业绩要求','业绩要求']));
  assert.equal(unique.total,6);assert.equal(unique.items.length,1);assert.ok(unique.items[0].references.some(ref=>ref.quote.includes('数量上限')));
  const ambiguous=scoring(document(['商务评分：甲类业绩最高6分；乙类业绩最高6分。','数量上限3份，对应每份2分、最高6分。本章业绩仅为评分条件。'],['商务评分标准','业绩要求']));
  assert.equal(ambiguous.total,12);assert.equal(ambiguous.items.length,2);assert.match(ambiguous.status,/待核验/);
});

test('业绩数量重述的实际项目类型不匹配时不并入已有业绩规则',()=>{
  const scores=scoring(document(['商务评分：办公家具供货业绩每份合同得2分，最高6分。','评分要求的业绩类型为道路维修项目，须提供合同及验收报告。','数量上限3份，对应每份2分、最高6分。本章业绩仅为评分条件。'],['商务评分标准','业绩要求','业绩要求']));
  assert.equal(scores.total,6);assert.match(scores.status,/待核验/);assert.ok(!scores.items[0].standard.includes('道路维修'));
});
