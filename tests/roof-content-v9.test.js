import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/core/analyzer.js';

const collusion='（六）不同供应商的响应保证金从同一单位或者个人的账户转出。';
const domestic='6.对于采购标的适用本国产品标准的采购项目，供应商对其提供的产品出具符合要求的《关于符合本国产品标准的声明函》，该产品视为本国产品。当采购项目或采购包的采购标的仅包含单一产品时，政府采购活动中既有本国产品又有非本国产品参与竞争的，依法对本国产品给予价格评审优惠，对本国产品的报价给予20%的价格扣除，用扣除后的价格参与评审。当采购项目或者采购包的采购标的中含有多种产品，供应商为该采购项目或者采购包提供的符合本国产品标准的产品成本之和占该供应商提供的全部产品成本之和的比例达到80%以上时，供应商应在投标（响应）文件中出具符合要求的《关于本国产品成本占比的承诺函》，则依法对其提供的全部产品给予价格评审优惠，即对该供应商提供的全部产品的总报价给予20%的价格扣除，用扣除后的价格参与评审。全部产品是指货物或服务采购项目或采购包中包含的全部货物、服务产品。';
const discipline='四、评审过程中，不得干预或者影响正常评审工作，不得发表倾向性、引导性意见，不得修改或细化磋商文件确定的评审程序、评审方法、评审因素和评审标准，不得接受供应商主动提出的澄清和解释，不得征询采购人代表的意见，不得违反规定的评审格式和撰写评审意见，不得拒绝对自己的评审意见签字确认。';
function document(rows){return {id:'roof-v9',fileName:'屋面原文内容回归.txt',complete:true,warnings:[],blocks:rows.map((row,index)=>({id:'roof-v9-b'+(index+1),page:row.page||1,section:row.section||'正文',text:row.text,...(row.scope?{scope:row.scope}:{})}))};}
const all=report=>report.categories.flatMap(category=>category.items);
const matches=(report,text)=>all(report).filter(item=>item.quote.includes(text));

test('roof deposit collusion template remains a conditional review item and cannot impose payment on an exempt package',()=>{
 const report=analyzeDocument(document([
  {page:4,section:'供应商须知附表',text:'投标（响应）保证金：采购包1不收取保证金。履约保证金：采购包1不缴纳。'},
  {page:9,section:'供应商不得具有的情形',text:'采购包1：供应商有下列情形之一的，视为串通响应：'},
  {page:9,section:'供应商不得具有的情形',text:collusion}
 ]));
 const item=report.categories.find(category=>category.id==='deposit').items.find(item=>item.quote.includes('从同一'));
 assert.ok(item);assert.equal(item.applicability,'conditional');assert.equal(item.fields['适用性'],'按条件或例外适用');
 assert.match(item.title,/串通/);assert.match(item.interpretation,/不.*新增.*缴纳|不.*缴款要求/);
 assert.match(item.fields['用途'],/串通/);assert.match(item.stage,/审查|评审/);
 assert.ok(item.references.some(ref=>ref.page===9&&ref.quote.includes(collusion)));
 assert.ok(item.references.some(ref=>ref.page===4&&ref.quote.includes('不收取')));
 assert.equal(report.categories.length,14);assert.equal(Object.keys(report.outputs).length,4);
});

test('a real deposit obligation is retained when a generic collusion condition is also present',()=>{
 const report=analyzeDocument(document([{text:'投标保证金为5000元，供应商须在响应截止前转账缴纳，否则响应无效。'},{text:collusion}]));
 const actual=report.categories.find(category=>category.id==='deposit').items.find(item=>item.quote.includes('5000元'));
 assert.ok(actual);assert.equal(actual.applicability,'required');assert.equal(actual.hard,true);
 assert.ok(report.outputs.risks.some(item=>item.quote.includes('5000元')));
 const generic=report.categories.find(category=>category.id==='deposit').items.find(item=>item.quote.includes('从同一'));
 assert.equal(generic.applicability,'conditional');assert.match(generic.interpretation,/串通/);
});

test('deposit collusion does not borrow the exemption of a different procurement package',()=>{
 const report=analyzeDocument(document([
  {text:'采购包1：投标保证金不收取。',scope:{package:'1'}},
  {text:'采购包2：供应商须缴纳投标保证金3000元。',scope:{package:'2'}},
  {text:collusion,scope:{package:'2'}}
 ]));
 const generic=report.categories.find(category=>category.id==='deposit').items.find(item=>item.quote.includes('从同一'));
 assert.ok(generic);assert.ok(!generic.references.some(ref=>ref.quote.includes('采购包1')));
 assert.ok(!/本包.*不收|本包.*不缴/.test(generic.interpretation));
});

test('roof domestic product deduction separates the 20 percent discount from the 80 percent cost share',()=>{
 const report=analyzeDocument(document([{page:39,section:'评审细则及标准',text:domestic}]));
 const item=report.outputs.commitments.find(item=>item.quote.includes('本国产品成本占比'));
 assert.ok(item);assert.deepEqual(item.fields['扣除比例'],['20%']);
 assert.deepEqual(item.fields['本国产品成本占比阈值'],['80%']);
 assert.match(item.interpretation,/成本.*80%.*条件|80%.*成本.*条件/);
 assert.ok(item.actions.some(action=>/本国产品/.test(action)));
 assert.ok(item.actions.some(action=>/声明|承诺/.test(action)));
 assert.ok(!item.actions.some(action=>/小微|监狱|残疾人/.test(action)));
 assert.equal(item.applicability,'conditional');assert.equal(item.hard,false);
 assert.ok(item.references.some(ref=>ref.page===39&&ref.quote.includes('达到80%以上')));
});

test('domestic product percentages are read from their own semantic role rather than hardcoded for the roof project',()=>{
 const changed=domestic.replaceAll('20%','15%').replaceAll('80%','75%');
 const item=analyzeDocument(document([{text:changed}])).outputs.commitments.find(item=>item.quote.includes('本国产品成本占比'));
 assert.deepEqual(item.fields['扣除比例'],['15%']);assert.deepEqual(item.fields['本国产品成本占比阈值'],['75%']);
 assert.ok(!item.fields['扣除比例'].includes('75%'));
});

test('small micro prison and disability policy clauses retain their own subject and five percent deduction',()=>{
 const report=analyzeDocument(document([{text:'对小型、微型企业产品的报价给予5%的价格扣除。监狱企业和残疾人福利性单位按规定视同小微企业，供应商须提交对应声明函。'}]));
 const item=all(report).find(item=>item.fields['政策属性']==='评审价格扣除');
 assert.ok(item);assert.deepEqual(item.fields['扣除比例'],['5%']);
 assert.ok(item.actions.some(action=>/小微.*监狱.*残疾人/.test(action)));
 assert.equal(item.fields['本国产品成本占比阈值'],undefined);
});

test('roof review discipline governs the panel and review phase even when the clause mentions a supplier',()=>{
 const report=analyzeDocument(document([{page:40,section:'5.8.磋商小组成员工作纪律 / 第40页',text:discipline}]));
 const items=matches(report,'不得接受供应商主动');assert.ok(items.length);
 for(const item of items){assert.equal(item.subject,'磋商小组成员');assert.equal(item.fields['适用主体'],'磋商小组成员');assert.equal(item.stage,'采购组织与评审');assert.equal(item.hard,false);assert.match(item.interpretation,/评审.*工作纪律|工作纪律.*评审/);}
 assert.ok(!report.outputs.risks.some(item=>item.quote.includes('不得接受供应商主动')));
});

test('an explicit supplier obligation in or after a panel section is not reassigned to the panel',()=>{
 for(const wording of ['供应商须按','供应商应按','供应商需按']){
  const report=analyzeDocument(document([{section:'磋商小组成员工作纪律',text:wording+'磋商小组要求提交澄清材料，否则响应无效。'}]));
  const items=matches(report,wording);assert.ok(items.length);
  for(const item of items){assert.equal(item.subject,'供应商',wording);assert.equal(item.hard,true);}
  assert.ok(report.outputs.risks.some(item=>item.quote.includes(wording)));
 }
});

test('supplier failure consequences and modified obligations cannot be overridden by a panel section heading',()=>{
 const cases=[
  '供应商未按磋商小组要求提交澄清材料的，响应无效。',
  '供应商均须按磋商小组要求提交澄清材料，否则响应无效。',
  '投标人均应按评审委员会要求提交澄清材料，否则响应无效。',
  '评审过程中，供应商在规定时间内未提交澄清材料的，响应无效。',
  '四、供应商未提供要求的证明材料，响应无效。'
 ];
 for(const text of cases){
  const report=analyzeDocument(document([{section:'磋商小组成员工作纪律',text}]));
  const items=all(report).filter(item=>item.quote.includes(text));assert.ok(items.length,text);
  for(const item of items){assert.equal(item.subject,'供应商',text);assert.equal(item.hard,true,text);assert.ok(item.stage!=='采购组织与评审',text);}
  assert.ok(report.outputs.risks.some(item=>item.quote.includes(text)),text);
 }
});

test('the roof quotation header alone is not a rejection clause while the actual limit and consequence remain',()=>{
 const headers=['序号','报价内容','计量单位','报价单位','最高限价','价款形式','报价说明'];
 const actual=['1','屋面工程','项','元','500000元','总价','报价不得超过最高限价，否则响应无效。'];
 const rows=[headers,actual].map(cells=>({cells,text:cells.join(' | ')}));
 const report=analyzeDocument({id:'header-v9',fileName:'屋面报价表.txt',complete:true,blocks:[{id:'quotation-table',page:13,section:'采购内容',kind:'table',tableId:'quotation',tableRows:rows,text:rows.map(row=>row.text).join('\n')}]});
 assert.ok(!all(report).some(item=>item.quote===rows[0].text));
 assert.ok(report.outputs.risks.some(item=>item.quote.includes('500000元')&&item.quote.includes('响应无效')));
});
