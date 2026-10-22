import {syntheticRoofFixture} from '../fixtures/create-roof-fixture.js';

// These inputs are authored test cases, not extracted procurement documents or
// saved reports. Stable pages and ids make citation and export checks repeatable.
const finish=source=>{
  source.blocks.sort((a,b)=>a.page-b.page||(a.readingOrder||0)-(b.readingOrder||0));
  for(const block of source.blocks)block.normalizedText=block.text.normalize('NFKC');
  source.pages=Array.from({length:46},(_,i)=>({number:i+1,text:source.blocks.filter(block=>block.page===i+1).map(block=>block.text).join('\n'),source:'synthetic-fixture'}));
  return source;
};
const paragraph=(source,key,page,section,text,extra={})=>{
  const block={id:`${source.id}:public-${key}`,documentId:source.id,fileName:source.fileName,page,section,text,normalizedText:text.normalize('NFKC'),kind:'paragraph',...extra};
  source.blocks.push(block);return block;
};
const table=(source,key,page,section,headers,rows)=>paragraph(source,key,page,section,[headers.join(' | '),...rows.map(cells=>cells.join(' | '))].join('\n'),{
  kind:'table',tableId:`public-${key}`,tableHeaders:headers,
  tableRows:rows.map(cells=>({cells,text:cells.join(' | '),page,headers}))
});

export function createPublicRoofFixture(){
  const source=structuredClone(syntheticRoofFixture);
  const budget=source.blocks.find(block=>block.id==='roof-v2:b2');budget.text='采购包1：'+budget.text;
  const payment=source.blocks.find(block=>block.id==='roof-v2:b351');
  payment.text='付款方式：工程竣工验收合格且审计完成后，一次性付审定金额的100%。';
  const validity=source.blocks.find(block=>block.id==='roof-v2:b41');validity.page=31;
  source.blocks.find(block=>block.id==='roof-v2:b40').text+='供应商不确认修正后的报价则响应无效。';
  const star=source.blocks.find(block=>block.id==='roof-v2:b271');star.page=24;
  star.section='3.项目技术要求';
  star.text='标注★的条款均为实质性要求，如负偏离按无效报价处理。';
  const technicalParameters=source.blocks.find(block=>block.id==='roof-v2:b270');
  technicalParameters.section='3.项目技术要求';
  const starMaterial=technicalParameters.tableRows.find(row=>row.cells[2]==='材料要求');
  starMaterial.cells[3]='新进防水材料须相当于或优于本文件约定，提交合格证明并接受复检。';
  starMaterial.text=starMaterial.cells.join(' | ');
  technicalParameters.text=[technicalParameters.tableHeaders.join(' | '),...technicalParameters.tableRows.map(row=>row.text)].join('\n');
  const materials=source.blocks.find(block=>block.id==='roof-v2:b440');
  const materialRow=materials.tableRows.find(row=>row.cells[1]==='拟投入本项目主要材料');
  materialRow.cells[2]='评价主要材料品牌、产地、性能及可溯源资料，满分10分；每一缺项扣0.5分，缺项不得分。';
  materialRow.text=materialRow.cells.join(' | ');
  materials.text=[materials.tableHeaders.join(' | '),...materials.tableRows.map(row=>row.text)].join('\n');materials.page=35;
  const consortium=source.blocks.find(block=>block.id==='roof-v2:b25');
  consortium.text='是否接受联合体：采购包1：不接受。';
  source.blocks.find(block=>block.id==='roof-v2:b27').text='本项目不组织统一现场踏勘，不要求提供踏勘证明；本采购包无需提交样品。';
  const roofQuantities=source.blocks.find(block=>block.id==='roof-v2:b290');
  const waterproofRow=roofQuantities.tableRows.find(row=>row.cells[2]==='屋面防水层');
  waterproofRow.cells[2]='屋面防水工程';waterproofRow.text=waterproofRow.cells.join(' | ');
  roofQuantities.text=[roofQuantities.tableHeaders.join(' | '),...roofQuantities.tableRows.map(row=>row.text)].join('\n');
  const cloneFormat=(key,page,text)=>paragraph(source,key,page,'响应文件格式',text);
  paragraph(source,'credit-check',7,'信用查验','开启结束后，采购人、代理机构查询信用记录，渠道为信用中国、中国政府采购网、信用山东；核对提交响应文件截止时间前的记录并保存网页截图，包括失信被执行人、重大税收违法失信主体、政府采购严重违法失信行为记录名单、严重违法失信企业名单。');
  table(source,'industry',4,'标的所属行业',['标的名称','所属行业'],[['屋面工程','建筑业']]);
  paragraph(source,'reserved',13,'评审价格扣除','本项目不属于专门面向中小企业采购。供应商按身份准备中小企业声明函、监狱企业的证明文件、残疾人福利性单位声明函。');
  paragraph(source,'discount',38,'评审价格扣除','小型、微型企业的评审价格扣除5%；监狱企业和残疾人福利性单位按本条视同小微企业，提供中小企业声明函、监狱企业的证明文件或残疾人福利性单位声明函。');
  cloneFormat('conditional',31,'磋商响应时，供应商响应表须以供应商法定名称加盖电子印章；详见附件：中小企业声明函、监狱企业的证明文件、残疾人福利性单位声明函、磋商响应情况(如有)、其他服务承诺(如有)。');
  cloneFormat('conditional-index',41,'详见附件：中小企业声明函、监狱企业的证明文件、残疾人福利性单位声明函、磋商响应情况(如有)、供应商响应表、其他服务承诺(如有)。');
  paragraph(source,'ip-liability',6,'知识产权','供应商承诺采用的技术、产品和服务不会产生侵犯专利权等知识产权的行为；供应商承担所有相关责任并赔偿由此给采购人带来的损失。采购人享有项目实施产生的知识成果及知识产权。');
  paragraph(source,'ip-adopt',6,'知识产权','采用自有或第三方知识成果时，供应商须提供开发接口、开发手册及无限期支持。');
  paragraph(source,'ip-use',6,'知识产权','供应商须保证合法使用第三方知识产权，相关授权费用计入报价。');
  paragraph(source,'insurance',15,'施工保险要求','工程一切风险和第三方责任险由供应商自行投保，保险费由供应商承担并支付，不单独报价。对非施工部位造成的破坏应免费恢复原状。');
  paragraph(source,'restore',23,'施工与恢复责任','由于施工原因造成既有设施损坏及恢复的费用由成交供应商承担。');
  paragraph(source,'site-responsibility',23,'现场要求','供应商应充分了解施工现场具体位置、道路及影响报价的情况；任何忽视或误解施工现场情况而导致的索赔或工期延长申请将不获批准。');
  paragraph(source,'material-entry',15,'主要材料要求','主要材料进场前经采购人确认，响应文件须写明品牌产地及可溯源资料，按主要材料评分标准核对。');
  paragraph(source,'core-selection',14,'产品政策','本项目涉及核心产品：不涉及。');
  paragraph(source,'import-selection',14,'产品政策','本项目涉及采购进口产品：不涉及。');
  paragraph(source,'import-limit',14,'产品政策','不涉及采购进口产品时，供应商不得提供进口产品；涉及采购进口产品时，国产产品满足要求的也可以参与。');
  paragraph(source,'last-submission',32,'最后报价','供应商须在规定的时间内提交最后报价，并以法定名称加盖电子印章；提交后不得以任何理由撤回。最后报价唯一且不高于最高限价。');
  paragraph(source,'initial-capital',6,'首次报价','大写金额与小写金额不一致以大写金额为准；大写文字有误先澄清。');
  paragraph(source,'initial-unit',6,'首次报价','单价或费率与总价不一致时依据单价修正，小数点明显错误除外。');
  paragraph(source,'final-confirm',32,'最后报价纠错','供应商对修正后的最后报价须在交易系统加盖电子印章确认，不确认按无效响应处理。');
  paragraph(source,'final-capital',32,'最后报价纠错','大写金额文字不能判断时按例外处理；单价小数点错位时以总价为准。');
  paragraph(source,'final-unit',32,'最后报价纠错','总价与单价汇总不一致时以单价汇总修正总价，多项依原文顺序处理。');
  paragraph(source,'candidate-count',33,'综合评分办法','采用综合评分法，按得分推荐3名成交候选供应商。');
  cloneFormat('mandatory-documents',30,'供应商须按要求提供供应商自觉抵制政府采购领域商业贿赂行为承诺书、供应商承诺函、法定代表人资格证明书或法定代表人授权委托书，未提供的响应无效。');
  cloneFormat('template-name',44,'详见附件：投标人承诺函；供应商承诺函名称应核对实际下载格式。项目名称：{{未填写}}。');
  source.blocks=source.blocks.filter(block=>block.page!==45);
  paragraph(source,'blank-page',45,'测试空白页','-第45页-',{role:'page-number'});
  paragraph(source,'subcontract-ban',14,'分包与转包','采购包1：不允许分包。严禁转包。');
  paragraph(source,'subcontract-template',14,'分包与转包','根据磋商文件及合同规定，允许供应商拟在成交后分包非主体工作时，应依法核对前提和责任；本通用条件不能替代项目选项。');
  // The duplicate manager's certificate requirement is an independent source for
  // the qualification summary and citation coverage checks.
  const confirmation=source.blocks.find(block=>block.id==='roof-v2:b370');
  paragraph(source,'initial-electronic',29,'报价规则',confirmation.text);
  confirmation.text='拟派项目经理须提供注册建造师证书供核验。';
  return finish(source);
}

export function createRoofContinuationFixture(){
  const source=createPublicRoofFixture();
  source.blocks=source.blocks.filter(block=>block.section!=='工程量清单');
  const headers=['序号','项目编码','项目名称','项目特征描述','计量单位','工程量','金额（元）'];
  paragraph(source,'waterproof-prefix',17,'合成工程量清单','工程概况：屋面防水工程采用40厚C20细石混凝土持钉层，双向钢筋网片与屋面板植筋钢筋头可靠绑扎；清单单位m2。上层防水层：3.0');
  table(source,'waterproof-continuation',18,'合成工程量清单',headers,[['1','010901000001','屋面防水工程','厚弹性体改性沥青防水卷材；下层防水层：1.5厚水性橡胶沥青防水涂料，做完后需做防水试验3:1:3水泥砂浆找平层，厚154:板内植筋预埋锚筋∅10@900x900，檐口100，钢筋头深入细石混凝土持钉层80mm，屋脊梁处植筋深度为250mm，焊接绑牢，施工人员按节点安装并局部找平5.原屋面拆除后清理修补','m2','30.24','']]);
  table(source,'decimal-volume',19,'合成工程量清单',headers,[['2','010902000002','旧屋面拆除','原屋面基层清理，测试数量保持小数。','m3','73.02','']]);
  return finish(source);
}

export function createSiteArrangementFixture(){
  const source=createPublicRoofFixture();
  table(source,'site-selection',4,'现场与答疑安排',['序号','事项','安排'],[['1','是否组织现场考察','不组织统一现场考察。']]);
  table(source,'qa-selection',5,'现场与答疑安排',['序号','事项','安排'],[['2','是否召开标前答疑','不组织标前答疑。']]);
  return finish(source);
}

export function createDuplicateManagerFixture(){
  const source=createRoofContinuationFixture();
  source.blocks=source.blocks.filter(block=>!['roof-v2:b21','roof-v2:b22'].includes(block.id));
  const confirmation=source.blocks.find(block=>block.id==='roof-v2:b370');
  confirmation.text='首次报价修正后，供应商应使用交易系统对修正后的报价加盖电子印章。';
  const first='特定资格要求：(1)供应商具备建筑工程施工总承包二级及以上资质，并具有有效安全生产许可证；(2)拟派项目经理须具备建筑工程专业注册二级及以上建造师证书、安全生产考核合格证书(B)，并在本单位注册';
  const second='，不得兼职其他在建、在施、中标、预中标建设项目经理；使用一级建造师证书须提供电子证书。';
  paragraph(source,'manager-first',2,'资格要求',`1、${first}`);
  paragraph(source,'manager-continuation',3,'资格要求',second,{readingOrder:-1});
  paragraph(source,'manager-duplicate',29,'资格要求',first.replace('要求：','要求；')+second);
  table(source,'legal-conditions',28,'资格审查',['序号','审查内容','具体标准和要求'],[['1','符合法律、行政法规规定的其他条件','符合法律、行政法规规定的其他条件']]);
  return finish(source);
}
