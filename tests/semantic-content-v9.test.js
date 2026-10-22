import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/core/analyzer.js';
import {buildSourceChecklist,reviewWebContent} from '../src/core/semantic-review.js';

const lines=[
 '项目名称：匿名测试项目',
 '供应商须提供有效营业执照，否则无效响应。',
 '付款方式：验收合格并收到发票后30日内支付合同金额100%。',
 '投标保证金1000元，须在投标截止前转账缴纳。',
 '供应商必须提交无重大违法记录承诺函。',
 '评分细则：商务业绩每份合同2分，最多6分；须提供合同及验收证明。技术方案满分64分。报价分满分30分。'
];
function fixture(texts=lines){
 const extraction={id:'test-tender',fileName:'测试文件.txt',format:'txt',complete:true,pages:[],warnings:[],blocks:texts.map((text,i)=>({id:'block-'+i,text,page:null,section:'段'+(i+1)}))};
 const report=analyzeDocument(extraction);
 return {report,documents:[{id:extraction.id,role:'tender',extraction}]};
}

test('普通营业执照、保证金、承诺和否决要求进入原文核对清单，不限于经理及业绩',()=>{
 const f=fixture(),before=structuredClone(f),list=buildSourceChecklist(f);
 for(const id of ['entity','rejection','payment','deposit','commitment'])assert.ok(list.some(item=>item.categoryId===id),id+' requirement must be checked');
 const deposit=list.find(item=>item.categoryId==='deposit');
 assert.ok(deposit.references.some(ref=>ref.quote.includes('1000元')));
 const commitment=list.find(item=>item.categoryId==='commitment');
 assert.ok(commitment.references.some(ref=>ref.quote.includes('无重大违法记录承诺函')));
 assert.deepEqual(f,before);
});

test('模型塞入无效finding不能绕过原文明示付款保证金承诺的不存在误判',()=>{
 const f=fixture(),categories=['payment','deposit','commitment'].map(id=>({id,status:'not-found',summary:'原文无本类要求，待复核',findings:[{docId:'test-tender',text:'未检索到本类要求'}]}));
 const result=reviewWebContent({...f,categories});
 for(const id of ['payment','deposit','commitment']){
  const issue=result.checks.find(check=>check.issue==='source-absence-contradicted'&&check.categoryId===id);
  assert.ok(issue,id+' false absence must be reported');
  assert.ok(issue.references.every(ref=>ref.documentId==='test-tender'));
 }
 assert.equal(result.status,'needs-review');
});

test('项目名称中的保证金字样、企业证照及另一个项目不能制造保证金要求反证',()=>{
 const f=fixture(['项目名称：没有保证金要求的测试文件']);
 f.documents.push({id:'company-license',role:'evidence',extraction:{blocks:[{id:'e1',page:1,text:'投标保证金1000元，须缴纳。'}]}},{id:'other-tender',role:'tender',extraction:{blocks:[{id:'x1',page:1,text:'投标保证金2000元，须缴纳。'}]}});
 const result=reviewWebContent({...f,categories:[{id:'deposit',status:'not-found',summary:'本次已读采购原文未定位保证金条款',findings:[]}]});
 assert.ok(!result.checks.some(check=>check.issue==='source-absence-contradicted'));
});

test('表格及制表符项目名称中的主题词不是采购要求',()=>{
 for(const [text,id] of [['项目名称 | 投标保证金专项测试项目','deposit'],['采购项目名称\t节能环保设备采购项目','eco']]){
  const f=fixture([text]);
  const result=reviewWebContent({...f,categories:[{id,status:'not-found',summary:'未定位本类采购要求',findings:[]}]});
  assert.ok(!result.checks.some(check=>check.issue==='source-absence-contradicted'),text);
 }
});

test('企业资料和得分待核验的阅读状态不是新增资质或评分条款',()=>{
 const f=fixture(['本样例未提供真实企业资料，企业资格与得分仍待核验。']);
 const result=reviewWebContent({...f,categories:['qualification','scoring'].map(id=>({id,status:'not-found',summary:'未定位本类具体采购要求',findings:[]}))});
 assert.ok(!result.checks.some(check=>check.issue==='source-absence-contradicted'));
});

test('营业执照解读不必复述同块项目编号数字才能被认定覆盖',()=>{
 const quote='供应商须提供有效营业执照，否则无效响应。';
 const f=fixture(['项目编号：BIAXI-20261018\n'+quote]);
 const target=buildSourceChecklist(f).find(item=>item.categoryId==='entity');assert.ok(target);
 const result=reviewWebContent({...f,findings:[{categoryId:'entity',documentId:'test-tender',blockId:'block-0',page:null,quote,interpretation:'供应商须提供有效营业执照，未提供或无效时响应无效；经营范围未明示。'}]});
 assert.ok(!result.checks.some(check=>check.id===target.id&&check.issue==='source-not-covered'));
});

test('普通技术负责人、团队人数及供货业绩的漏读也需原文核对',()=>{
 for(const [text,id] of [
  ['拟派技术负责人须具备中级及以上职称，须提供职称证书。','personnel'],
  ['项目组须配备2名技术人员和1名售后人员。','personnel'],
  ['投标人须提供近三年供货业绩2份，须同时提交合同和验收证明。','performance']
 ]){
  const f=fixture([text]);
  const result=reviewWebContent({...f,categories:[{id,status:'not-found',summary:'未找到本类要求',findings:[]}]});
  assert.ok(result.checks.some(check=>check.issue==='source-absence-contradicted'&&check.categoryId===id),text);
 }
});

test('网页模型不存在误判提示保留原文免缴及有条件适用，不改成必须缴纳',()=>{
 const f=fixture(['本项目不缴纳投标保证金；如转为其他采购包，按相应文件另行核对。']);
 const result=reviewWebContent({...f,categories:[{id:'deposit',status:'not-found',summary:'原文没有保证金条款',findings:[]}]});
 const issue=result.checks.find(check=>check.issue==='source-absence-contradicted');
 assert.ok(issue);assert.ok(issue.references[0].quote.includes('不缴纳'));
 assert.ok(!/必须缴纳|应当缴纳/.test(issue.message));
});

test('错页及显式无效段落定位不能抑制内容漏项检查',()=>{
 const f=fixture();for(const block of f.documents[0].extraction.blocks)block.page=2;
 f.report=analyzeDocument(f.documents[0].extraction);
 const target=buildSourceChecklist(f).find(item=>item.categoryId==='payment');
 const base={categoryId:'payment',documentId:'test-tender',blockId:'block-2',page:2,quote:lines[2],interpretation:lines[2]+'付款条件和比例以此为准。'};
 for(const invalid of [{page:null},{page:1},{page:'2'},{blockId:null},{blockId:''}]){
  const result=reviewWebContent({...f,findings:[{...base,...invalid}]});
  assert.ok(result.checks.some(check=>check.id===target.id&&check.issue==='source-not-covered'),JSON.stringify(invalid));
 }
 const valid=reviewWebContent({...f,findings:[base]});
 assert.ok(!valid.checks.some(check=>check.id===target.id&&check.issue==='source-not-covered'));
});

test('保证金必须缴纳不等于原文明示未缴即废标，新增硬性后果需被指出',()=>{
 const f=fixture(),source=f.documents[0].extraction.blocks[3];
 const finding={categoryId:'deposit',title:'投标保证金',documentId:'test-tender',blockId:source.id,page:null,quote:source.text,interpretation:'截止前转账缴纳1000元。',fields:{不满足后果:'投标无效（废标）'}};
 const result=reviewWebContent({...f,findings:[finding]});
 assert.ok(result.checks.some(check=>check.issue==='hard-consequence-added'&&check.categoryId==='deposit'));
 for(const text of ['未缴可能存在无效风险，须核对完整否决条款。','不据本段直接认定未缴即废标，后果待核验。']){
  assert.ok(!reviewWebContent({...f,findings:[{...finding,fields:{不满足后果:text}}]}).checks.some(check=>check.issue==='hard-consequence-added'));
 }
 source.text+='未按时缴纳的响应无效。';f.report=analyzeDocument(f.documents[0].extraction);
 assert.ok(!reviewWebContent({...f,findings:[{...finding,quote:source.text}]}).checks.some(check=>check.issue==='hard-consequence-added'));
});

test('原文明示不作为废标条件不能被关键词匹配当成直接废标依据',()=>{
 const text='投标保证金1000元，应在投标截止前转账缴纳；未缴纳不作为废标条件。',f=fixture([text]);
 const result=reviewWebContent({...f,findings:[{categoryId:'deposit',title:'保证金',documentId:'test-tender',blockId:'block-0',page:null,quote:text,interpretation:'截止前缴纳1000元。',fields:{不满足后果:'未缴纳即响应无效'}}]});
 assert.ok(result.checks.some(check=>check.issue==='hard-consequence-added'));
});

test('模型注明本段不作为废标条件不应误报为新增确定废标后果',()=>{
 const text='投标保证金1000元，应在投标截止前转账缴纳。',f=fixture([text]);
 const result=reviewWebContent({...f,findings:[{categoryId:'deposit',title:'保证金',documentId:'test-tender',blockId:'block-0',page:null,quote:text,interpretation:'截止前缴纳1000元，具体后果另核。',fields:{不满足后果:'本段不作为废标条件'}}]});
 assert.ok(!result.checks.some(check=>check.issue==='hard-consequence-added'));
});

test('简单验收及发票付款不应套用审计、审定价、保险和长期保修事实',()=>{
 const {report}=fixture();
 const payment=report.analysis.commercialRisks.find(item=>item.title==='付款触发与履约资金占用');
 assert.ok(payment);
 const explanation=[payment.interpretation,payment.impact,...(payment.actions||[])].join('；');
 assert.ok(explanation.includes('30日'));assert.ok(explanation.includes('100%'));
 assert.ok(!/审计|审定价|保险|长期保修/.test(explanation),explanation);
 assert.equal(report.categories.length,14);
 assert.deepEqual(Object.keys(report.outputs).sort(),['commitments','conclusion','risks','scoreItems']);
});

test('大量普通覆盖缺口不能淹没明确未找到误判，上限遗漏计数和同级顺序保持稳定',()=>{
 const f=fixture(Array.from({length:95},(_,i)=>'投标保证金'+(1000+i)+'元，须在截止前转账缴纳。'));
 const input={...f,categories:[{id:'deposit',status:'not-found',summary:'没有保证金要求',findings:[]}]},before=structuredClone(input);
 const result=reviewWebContent(input),second=reviewWebContent(input);
 assert.ok(result.sourceChecklist.length>80);
 assert.equal(result.checks[0].issue,'source-absence-contradicted');
 assert.equal(result.checks.length,80);
 assert.equal(result.omittedCount,result.sourceChecklist.length+1-80);
 assert.deepEqual(result,second);assert.deepEqual(input,before);
 const ordinary=result.checks.filter(check=>check.issue==='source-not-covered');
 assert.deepEqual(ordinary.map(check=>check.id),result.sourceChecklist.slice(0,ordinary.length).map(item=>item.id));
});

test('明确新增废标后果也排在普通覆盖缺口之前，语义差异之间保留生成顺序',()=>{
 const f=fixture(Array.from({length:95},(_,i)=>'投标保证金'+(1000+i)+'元，须在截止前转账缴纳。'));
 const source=f.documents[0].extraction.blocks[0],finding={categoryId:'deposit',documentId:'test-tender',blockId:source.id,page:null,quote:source.text,interpretation:'投标保证金1000元在截止前缴纳。',fields:{不满足后果:'未缴纳投标无效'}};
 const result=reviewWebContent({...f,categories:[{id:'deposit',status:'not-found',summary:'没有保证金要求',findings:[]}],findings:[finding]});
 assert.deepEqual(result.checks.slice(0,2).map(check=>check.issue),['source-absence-contradicted','hard-consequence-added']);
 assert.equal(result.checks.length,80);assert.ok(result.omittedCount>0);
});

function priceFixture(maxScore=10){
 const quote='价格评审 | 投标价格得分 | 报价得分=(评审基准价∕评审报价)×100×价格权重。满足采购文件要求且评审报价最低的为基准价。 | '+maxScore.toFixed(4)+' | 客观 | 报价表';
 const f=fixture([quote]),block=f.documents[0].extraction.blocks[0];block.page=5;block.scope={package:'1'};
 f.report=analyzeDocument(f.documents[0].extraction);
 const ref={documentId:'test-tender',blockId:block.id,page:5,quote};
 f.report.analysis.scoring={total:100,items:[{id:'price-rule',group:'价格',maxScore,scope:{documentId:'test-tender',package:'1'},references:[ref]}]};
 return {...f,ref};
}
const priceClaim=(f,formula,extra={})=>({categoryId:'scoring',title:'报价得分规则',...f.ref,interpretation:'最低评审报价为基准价，其他报价按比例折算。',fields:{计算方式:formula},...extra});
const formulaIssues=result=>result.checks.filter(check=>check.issue==='price-formula-mismatch');

test('真实公式及满分共同证明模型额外重复乘权重，数学差异先于一般漏项显示',()=>{
 const f=priceFixture(),input={report:f.report,documents:f.documents,findings:[priceClaim(f,'基准价 / 评审报价 ×10×价格权重')]},before=structuredClone(input);
 const result=reviewWebContent(input),issues=formulaIssues(result);
 assert.equal(issues.length,1);assert.equal(result.checks[0].issue,'price-formula-mismatch');
 assert.match(issues[0].message,/1分/);assert.match(issues[0].message,/10分/);
 assert.ok(issues[0].references.every(ref=>ref.blockId===f.ref.blockId&&ref.page===5&&f.ref.quote.includes(ref.quote)));
 assert.deepEqual(input,before);
});

test('正确的带权重公式和等价满分公式、显式百分比公式均不误报，满分不写死10',()=>{
 for(const maxScore of [10,25]){
  const f=priceFixture(maxScore);
  for(const formula of ['基准价/评审报价×100×价格权重','基准价/评审报价×'+maxScore,'基准价/评审报价×100×'+maxScore+'%']){
   assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,formula)]})).length,0,formula);
  }
  assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,'基准价/评审报价×'+maxScore+'×价格权重')]})).length,1);
 }
});

test('网页错引仍不被接纳，但可使用唯一同页真实评分原文独立提示其公式差异',()=>{
 const f=priceFixture(),claim=priceClaim(f,'基准价/评审报价×10×价格权重',{blockId:'wrong-web-block',quote:'网页自行拼接的引用，不能成为真实评分依据'});
 const result=reviewWebContent({...f,findings:[claim]}),issues=formulaIssues(result);
 assert.equal(issues.length,1);assert.ok(issues[0].references.every(ref=>ref.blockId===f.ref.blockId));
 assert.match(issues[0].message,/不.*修复.*引用|引用.*仍.*核验/);
 assert.ok(issues[0].references.every(ref=>ref.quote!==claim.quote&&ref.blockId!==claim.blockId));
 assert.equal(claim.blockId,'wrong-web-block');assert.equal(claim.quote,'网页自行拼接的引用，不能成为真实评分依据');
});

test('没有唯一有效评分来源或完整公式语法时不猜数学错误，也不借企业材料评分',()=>{
 const f=priceFixture(),bad='基准价/评审报价×10×价格权重';
 for(const change of [{documentId:'other-project'},{page:99}])assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,bad,change)]})).length,0);
 const missing=structuredClone(f);missing.report.analysis.scoring.items[0].references[0].quote='不在源文中的满分及公式';
 assert.equal(formulaIssues(reviewWebContent({...missing,findings:[priceClaim(f,bad)]})).length,0);
 const wrongMax=structuredClone(f);wrongMax.report.analysis.scoring.items[0].maxScore=20;
 assert.equal(formulaIssues(reviewWebContent({...wrongMax,findings:[priceClaim(f,bad)]})).length,0);
 for(const formula of ['基准价/评审报价×100×0.1','基准价/评审报价×10×价格权重+调整分'])assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,formula)]})).length,0,formula);
 const ambiguous=structuredClone(f),otherBlock={...ambiguous.documents[0].extraction.blocks[0],id:'other-price-block',scope:{package:'2'}};ambiguous.documents[0].extraction.blocks.push(otherBlock);
 ambiguous.report.analysis.scoring.items.push({...ambiguous.report.analysis.scoring.items[0],id:'other-price',scope:{documentId:'test-tender',package:'2'},references:[{...f.ref,blockId:otherBlock.id}]});
 assert.equal(formulaIssues(reviewWebContent({...ambiguous,findings:[priceClaim(f,bad,{blockId:'unknown-price-block',quote:'网页错误引用'})]})).length,0);
});

test('有效原文定位按实际采购包消歧，不借同页其他包唯一识别的价格规则',()=>{
 const f=priceFixture(),second={id:'package-two-source',page:5,scope:{package:'2'},text:'采购包2报价得分为基准价/评审报价×25。'};
 f.documents[0].extraction.blocks.push(second);
 const claim=priceClaim(f,'基准价/评审报价×25',{blockId:second.id,quote:second.text});
 assert.equal(formulaIssues(reviewWebContent({...f,findings:[claim]})).length,0);
 const unknown=priceClaim(f,'基准价/评审报价×10×价格权重',{blockId:'unknown-price-block',quote:'网页错误引用'});
 assert.equal(formulaIssues(reviewWebContent({...f,findings:[unknown]})).length,0,'unknown location cannot borrow a rule from a page with multiple packages');
 const other={...f.documents[0].extraction.blocks[0],id:'package-two-rule',scope:{package:'2'}};
 f.documents[0].extraction.blocks.push(other);
 f.report.analysis.scoring.items.push({...f.report.analysis.scoring.items[0],id:'other-price',scope:{documentId:'test-tender',package:'2'},references:[{...f.ref,blockId:other.id}]});
 const issue=formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,'基准价/评审报价×10×价格权重')]}));
 assert.equal(issue.length,1,'an exact package-one reference disambiguates same-page rules');
 assert.ok(issue[0].references.every(ref=>ref.blockId===f.ref.blockId));
});

test('已知混包和与实际原文相矛盾的包声明不能选用价格规则',()=>{
 const f=priceFixture(),other={...f.documents[0].extraction.blocks[0],id:'other-package',scope:{package:'2'}};
 f.documents[0].extraction.blocks.push(other);
 const base=priceClaim(f,'基准价/评审报价×10×价格权重');
 assert.equal(formulaIssues(reviewWebContent({...f,findings:[{...base,scope:{package:'2'}}]})).length,0);
 assert.equal(formulaIssues(reviewWebContent({...f,findings:[{...base,references:[f.ref,{...f.ref,blockId:other.id}],scope:{package:'1'}}]})).length,0);
 f.documents[0].extraction.blocks[0].scope={package:'mixed:source'};
 assert.equal(formulaIssues(reviewWebContent({...f,findings:[base]})).length,0);
});

test('原文明确权重与满分自身矛盾时不靠推导权重给模型定错',()=>{
 const f=priceFixture();
 f.documents[0].extraction.blocks[0].text+='价格权重20%。';
 f.report.analysis.scoring.items[0].references[0].quote=f.documents[0].extraction.blocks[0].text;
 assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,'基准价/评审报价×100×20%')]})).length,0);
});

test('小数权重与百分数等价，原文明示小数冲突或不明权重时不推导定错',()=>{
 for(const declaration of ['价格权重为0.2。','价格权重是0.2。','价格权重=0.2。','价格权重为百分之十。','价格权重为0.1+0.1。','价格权重另行确定。']){
  const f=priceFixture();f.documents[0].extraction.blocks[0].text+=declaration;
  f.report.analysis.scoring.items[0].references[0].quote=f.documents[0].extraction.blocks[0].text;
  assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,'基准价/评审报价×100×20%')]})).length,0,declaration);
 }
 for(const declaration of ['价格权重为0.1。','价格权重为10%。','价格权重 | 0.1。']){
  const f=priceFixture();f.documents[0].extraction.blocks[0].text+=declaration;
  f.report.analysis.scoring.items[0].references[0].quote=f.documents[0].extraction.blocks[0].text;
  for(const formula of ['基准价/评审报价×100×价格权重','基准价/评审报价×100×10%','基准价/评审报价×10'])assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,formula)]})).length,0,formula);
  assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,'基准价/评审报价×10×价格权重')]})).length,1,declaration);
 }
});

test('模型明确否定错误写法或采用不同括号运算时不当作已断言的简单公式',()=>{
 const f=priceFixture();
 for(const formula of ['不要使用基准价/评审报价×10×价格权重','错误写法：基准价/评审报价×10×价格权重；正确写法：基准价/评审报价×100×价格权重','基准价/(评审报价×100)×价格权重','(基准价/评审报价×10)×价格权重']){
  assert.equal(formulaIssues(reviewWebContent({...f,findings:[priceClaim(f,formula)]})).length,0,formula);
 }
});
