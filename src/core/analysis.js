import {createHash} from 'node:crypto';
import {buildDocumentBrief,referenceTemplateBlockIds} from './document-brief.js';

// Recognition text is deliberately separate from the immutable citation text.
export const readText = value => String(value || '').normalize('NFKC').replace(/[\s\u200b]+/g, '').replace(/⺠/g,'民').replace(/⻔/g,'门').replace(/⻚/g,'页').replace(/⻓/g,'长').replace(/⻅/g,'见').replace(/⻘/g,'青').replace(/⻛/g,'风').replace(/⻬/g,'齐');
const distinct = values => [...new Set(values.filter(Boolean))];
const hash = text => createHash('sha256').update(text).digest('hex').slice(0,16);
const groupName = text => /价格|报价(?:得分|评分|分)|^报价$/.test(text) ? '价格' : /商务/.test(text) ? '商务' : /技术/.test(text) ? '技术' : /附加/.test(text) ? '附加' : null;
export const nonContentBlock = block => ['toc','page-header','page-footer','page-number'].includes(block?.role);
const materialNames = text => distinct(readText(text).match(/(?:有效)?合同(?:扫描件|复印件)|验收(?:报告|证明|资料|材料)(?:扫描件|复印件)?|业主证明|(?:检测|检验)报告|(?:资格|资质|认证)证书|(?:承诺|声明)(?:函|书)|许可证|授权委托书/g)||[]).map(value=>value.replace(/^有效(?=合同)/,''));
// A contractual noun is not itself a demand for an attachment.
function submissionMaterials(text) {
  const segments=readText(text).split(/[。；;|]/).filter(value=>/提供|提交|出具|扫描件|复印件|证明材料|证明书|情况表|响应表|应答表|承诺函|承诺书|声明函|声明书/.test(value));
  return distinct(segments.flatMap(value=>value.match(/营业执照|主体资格证明|(?:资质|资格|认证)证书|许可证|合同(?:扫描件|复印件)|验收(?:报告|证明|材料)(?:扫描件|复印件)?|业主证明|(?:纳税|社保)(?:证明|材料)|劳动关系证明|劳动合同|检测报告|法定代表人资格证明书|(?:法定代表人)?授权委托书|[\u4e00-\u9fff]{0,25}(?:承诺函|承诺书|声明函|声明书)|(?:技术参数)?响应表|商务应答表|保函|发票|履历|服务方案|实施方案/g)||[]));
}
export const numericAmount=value=>{const match=String(value||'').normalize('NFKC').match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/);return match?Number(match[0].replace(/,/g,''))*(/万元/.test(value)?10000:/亿元/.test(value)?100000000:1):null;};

function proofPath(text,first,second){
  const firstAt=text.indexOf(first),secondAt=text.indexOf(second,firstAt+first.length);
  const waiver=new RegExp('(?:无需|无须|不要求|不需要|不必|免除)(?:提供|提交)?[^，,；;。|]{0,60}(?:'+first+'|'+second+')');
  if(waiver.test(text))return 'conditional';
  if(firstAt<0||secondAt<0)return 'unknown';
  const connector=text.slice(firstAt+first.length,secondAt);
  if(/或|任选|任一|二选一/.test(connector)||/任选其一|任一即可/.test(text))return 'OR';
  if(/以及|及|并且|且|和|同时/.test(connector))return 'AND';
  return 'unknown';
}
function clauseBody(text){return String(text||'').split('|').filter(value=>value&&!/^\d+(?:\.\d+)?$|^\{\{/.test(value)).join('；');}
// A generated finite summary is not proof that every source condition has been represented.
function preserveClauseConditions(interpretation,source){
  const body=clauseBody(source);
  return readText(interpretation).includes(readText(body))?interpretation:interpretation+'\n本条完整条件一并核对：'+body;
}
function specificClause(text, title, score, fields) {
  if(/政府采购供应商资格承诺函/.test(text)&&/独立承担/.test(text)&&/财务会计/.test(text)) {
    const complete=/近三年/.test(text)&&/依法缴纳税收和社会保障资金/.test(text)&&/履行合同所必需的设备和专业技术能力/.test(text);
    if(!complete)return {title:'一般资格与供应商资格承诺',interpretation:'一般资格按完整条款逐项承诺：'+clauseBody(text),actions:['逐项核对主体、财务信誉、适用税社保及实际履约能力，按原文限定及签署形式准备。']};
    const duties=['独立承担民事责任能力','良好商业信誉和健全财务会计制度','依法缴纳税收和社会保障资金的良好记录','截止日前近三年无重大违法记录','履约所必需设备和专业技术能力'];
    if(/控股|管理关系/.test(text))duties.push('同负责人或直接控股、管理关系限制');
    if(/整体设计|规范编制|项目管理、?监理/.test(text))duties.push('规定前期服务供应商及附属机构回避限制');
    return {title:'一般资格与供应商资格承诺',interpretation:'需要逐项核对'+duties.join('；')+'，按资格承诺函作完整承诺。税社保专条另按实际分支提交，不能仅以税社保替代这一整组资格。',actions:['核对主体、财务信誉、近三年违法记录、设备和专业技术能力。','审查同负责人、控股管理关系及前期服务限制，按指定资格承诺模板及签署要求准备。']};
  }
  if(/依法缴纳税收和社会保障资金承诺函或其他证明/.test(text)&&/不适用承诺制/.test(text)&&/免税/.test(text)&&/境内注册/.test(text)&&/任意一个月/.test(text)&&/其他不适用/.test(text)&&/提前.*查询/.test(text)) {
    const province=text.match(/在([^，。；;|]{2,10}省)境内注册/)?.[1]||'原文规定地区';
    const date=text.match(/\d{4}年\d{1,2}月\d{1,2}日至今任意一个月/)?.[0]||'原文指定期间任意一个月';
    const stamp=/加盖公章/.test(text)?'加盖公章':'按原文签署要求';
    const branches=['在'+province+'境内注册且适用承诺制：提供税社保承诺函'+stamp+'，并提前查询本单位缴纳情况。','依法免税或不需要缴纳社会保障资金：提供相应证明材料'+stamp+'。','未在'+province+'内缴纳税收和社会保障资金：提供'+date+'税收及社保证明，'+stamp+'。','其他不适用承诺制情形：提供相关证明材料'+stamp+'。'];
    fields['税社保材料分支']=branches;fields['材料适用分支']=branches;
    return {title:'税收与社会保障资金四条材料分支',interpretation:'按企业实际情况选择四条分支：'+branches.join('')+'任意一个月不等于连续每月，企业税社保不是项目经理个人社保。',actions:['确定注册地、缴纳地以及免税／无需缴纳等事实，再选择适用分支。','查询并保存税社保资料，按相应承诺或证明路径及原文签署要求准备。']};
  }
  if(/无不良信用记录/.test(text)&&/截图/.test(text)) {
    const names=['严重失信主体名单','失信被执行人','重大税收违法失信主体','政府采购严重违法失信行为记录名单'].filter(name=>text.includes(name));
    const path=proofPath(text,'无不良信用记录承诺函','截图'),stamp=/加盖公章|盖公章/.test(text),channels=['信用中国','中国政府采购网'].filter(name=>text.includes(name));
    fields['信用名单']=names;
    fields['信用材料关系']=path==='AND'?'AND：无不良信用记录承诺函及适用名单截图'+(stamp?'（加盖公章）':''):path==='OR'?'OR：承诺函或所列查询截图，按原文任选路径':path==='conditional'?'按原文材料免除及适用分支，不强制AND':'材料连接关系未完整明确，按原文核验';
    if(path!=='AND'||!names.length)return {title:'供应商信用材料路径与免除',interpretation:'信用材料按本条路径落实：'+clauseBody(text)+'不将任选或免除改成全部必交，未明示的盖章要求不增补。',actions:['按实际承诺、截图或免除路径准备；只按原文核对查询范围及签署要求。']};
    return {title:'供应商信用承诺与名单截图',interpretation:'需要无不良信用记录承诺函以及未列入'+names.join('、')+'的截图'+(stamp?'并加盖公章':'')+'；按原文所列'+(channels.join('、')||'查询')+'渠道核验。供应商自交材料和采购方另行查询各自按适用原文落实，不能互替。',actions:['逐个核对适用名单并保存与供应商名称一致的查询截图。','承诺函和截图按本条AND关系备齐，按原文核对查询时点与签署。']};
  }
  if(/项目经理|建造师/.test(text)&&!score) {
    const profession=text.match(/建造师证书\(([^)]+专业)\)/)?.[1]||text.match(/(?:建筑工程|市政公用工程|机电工程)专业/)?.[0];
    const grade=text.match(/注册([一二三四\d]+级)及以上(?:注册)?建造师/)?.[1];
    if(profession&&grade&&/本单位注册/.test(text)) {
      if(/不要求|无需|无须|不必|可不(?:提交|提供)|或者|任选/.test(text))return {title:'拟派项目经理完整资格条件',interpretation:'经理准入按本条完整条件与免除落实：'+clauseBody(text)+'未列明的B证或兼职限制不从通用经验补入；没有实际人员原件时保持待核验。',actions:['逐项核对原文专业、等级、注册单位及明确材料路径／免除，不增加未列准入要求。']};
      const occupied=['在建','在施','中标','预中标'].filter(value=>value==='中标'?/(?<!预)中标/.test(text):text.includes(value));
      const enterprise=text.match(/供应商具备([^；;。]{0,45}施工总承包[^；;。]{0,25}资质)/)?.[1],license=/有效的?安全生产许可证/.test(text);
      const hasB=/安全生产考核[^，,；;。]{0,30}(?:\(B\)|B类|B证)/.test(text),concurrent=/不兼职|不得兼职/.test(text);
      const conditions=[profession+grade+'及以上注册建造师证书','在本单位注册'];
      if(hasB)conditions.splice(1,0,(/有效.{0,25}安全生产考核/.test(text)?'有效':'')+'安全生产考核B类证书');
      if(concurrent)conditions.push('不兼职其他'+occupied.join('、')+'建设项目经理');
      return {title:'拟派项目经理完整资格条件',interpretation:preserveClauseConditions((enterprise?'企业须具备'+enterprise+(license?'和有效安全生产许可证':'')+'。':'')+'拟派经理需要'+conditions.join('，')+'。'+(/一级.*电子证书/.test(text)?'使用一级注册证时须为电子证书并符合原文引用通知；该形式分支不能无条件扩为二级要求。':'')+'没有拟派人员和证件原件时保持待核验。',text),actions:['核对原文要求的经理专业、等级、本单位注册'+(hasB?'、B证':'')+(concurrent?'和不兼职事实':'')+'。',concurrent?'逐项检查'+occupied.join('、')+'项目占用，按原文核对证书形式分支。':'按原文核对证书形式及任职要求，不增加未列兼职限制。']};
    }
  }
  if(/同类|类似/.test(text)&&/合同签订/.test(text)&&/合同扫描件/.test(text)&&/验收报告扫描件/.test(text)) {
    const standard=score?readText(score.standard):text,start=standard.match(/\d{4}年\d{1,2}月\d{1,2}日至今/)?.[0]||'原文日期范围';
    const each=standard.match(/每提供\d+个合同得(\d+(?:\.\d+)?)分/)?.[1],maximum=score?.maxScore||standard.match(/最多(?:得)?(\d+(?:\.\d+)?)分/)?.[1];
    const path=proofPath(standard,'合同扫描件','验收报告扫描件'),stamp=/加盖公章|盖公章/.test(standard);
    fields['材料关系']=path==='AND'?'AND：合同扫描件以及验收报告扫描件，须同时具备'+(stamp?'并按条款加盖公章':''):path==='OR'?'OR：合同扫描件或验收报告扫描件，按原文任选':'按原文条件及免除核验材料路径';
    fields['业绩日期依据']='合同签订时间';
    const amount=standard.match(/(?:合同)?金额(?:不得低于|不低于|不少于|至少|达到|≥)[：:]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:万元|亿元|元)/);
    const proof=path==='AND'?'合同扫描件以及对应验收报告扫描件须同时具备':path==='OR'?'合同扫描件或验收报告扫描件按原文任选其一':clauseBody(standard);
    const amountClauses=standard.split(/[。；;|]/).filter(value=>/金额/.test(value));
    const money=amount?'本条金额门槛：'+amount[0]+'。':amountClauses.length?'本条实际金额条件：'+amountClauses.join('；')+'。':'已读取本条未明示合同金额下限。';
    const failure=/否则不得分|否则.*不得分|未提供.*不得分/.test(standard)?'否则该案例不得分。':'';
    return {title:score?.title||'同类业绩条件与证明',interpretation:preserveClauseConditions(start+'的同类项目以合同签订时间为准，'+(each?'每个有效合同'+each+'分，':'')+(maximum?'最多'+maximum+'分。':'')+proof+(stamp?'并按条款加盖公章':'')+'。'+failure+money+(!/中标通知书|网络截图/.test(standard)?'中标通知书或网络截图未被列为替代材料。':'其他证明路径按原文限定，不能任意替代。')+'缺证候选待核验；评分封顶与资格数量要求分别核对。',standard),actions:['列真实业绩名称、合同主体、签订日期及同类理由，按实际AND／OR路径关联合同和验收原件。','核对本条实际金额门槛、签署及重复合同；候选案例不得混入已确认预计分。']};
  }
  return null;
}
function scoreMaterials(cell, standard) {
  const labels=String(cell||'').split(/[、，,；;\n]|以及|及(?=证明材料)/).map(value=>readText(value)).filter(value=>value&&!/^无|^不适用|^\{\{/.test(value));
  const result=[];const keys=new Set();
  for(const value of [...labels,...materialNames(standard)]){const key=readText(value);if(!keys.has(key)){keys.add(key);result.push(value);}}
  return result;
}
const sentenceEnd = /[。；;！？!?]$/;
export function headingOnly(text) {
  const t=readText(text);
  if(/^(?:标段[\d一二三四五六七八九十]+|第[\d一二三四五六七八九十]+标段)[:：]?$/.test(t)||/^\d+[.、](?:竞标人|投标人|供应商|企业)?(?:资质)?资格(?:要求|条件|审查)[:：]?$/.test(t))return true;
  return t.length<95 && (/^(?:第[一二三四五六七八九十百\d]+[章节]|[一二三四五六七八九十]+、|\d+(?:\.\d+){1,4}\.?)/.test(t)) && !/须|必须|应当|不得|不收|无需|不涉及|不缴|提供|提交|具有|具备|有效|拒收|行贿|谋取|拒绝|无效|否决|得\d+(?:\.\d+)?分|\d+(?:\.\d+)?%/.test(t);
}
export function procurementProcedure(text) {
  const t=readText(text);
  if(/(?:磋商小组|评审委员会|评标委员会).{0,150}(?:共同认定|存在争议|少数服从多数)/.test(t))return true;
  return !/供应商(?:须|应当|必须)|投标人(?:须|应当|必须)|响应文件.{0,15}(?:作为|按|作)无效|无效响应处理/.test(t) && /采购人|代理机构|磋商小组|评审委员会|评标委员会|评审专家/.test(t) && /组织重新评审|停止评审|终止采购|不得泄露|工作纪律|回避|评审结果|抽取|出具磋商报告|告知参加采购|根据.{0,20}(?:实际)?要求合理设定/.test(t);
}

// A paragraph may contain several independent rules. Split only at printed
// clause boundaries; inherited group names belong to metadata, never quotes.
function paragraphScoreValue(value){
  const text=readText(value),cap=text.match(/(?:最高|满分|最多|上限)(?:得)?(\d+(?:\.\d+)?)分/);
  if(cap)return{maxScore:Number(cap[1]),index:cap.index,kind:'cap'};
  const formula=text.match(/(?:价格|报价)得分=[(]基准价\/(?:投标报价|最后报价|响应报价|评审报价)[)][×*](\d+(?:\.\d+)?)(?=$|[。；;，,])/);
  if(formula)return{maxScore:Number(formula[1]),index:formula.index,kind:'formula'};
  const fixed=text.match(/(?<![不未扣])得(\d+(?:\.\d+)?)分/);
  if(fixed&&/认证|证书/.test(text)&&!/每|逐|各项|优秀|良好|一般|[ABC]级|等级|档次/.test(text))return{maxScore:Number(fixed[1]),index:fixed.index,kind:'fixed'};
  return null;
}
const qualificationClauseBoundary=value=>/资格(?:要求|条件)|(?:供应商|投标人|竞标人|企业)(?:应当|应|须|必须)(?:具备|具有|持有)|(?:须|必须)(?:具备|具有|持有)/.test(readText(value));
function paragraphScoringUnits(unit){
  if(unit.score||unit.cells||unit.fragments.length!==1)return[unit];
  const parts=[];
  for(const clause of unit.text.match(/[^；;。]+[；;。]?/g)||[]){
    let pending='';
    for(const atom of clause.match(/[^，,]+[，,]?/g)||[]){
      if(pending&&paragraphScoreValue(pending)&&paragraphScoreValue(atom)&&!/^\s*(?:最高|满分|最多|上限|每|扣|并|该|对应)/.test(atom)){parts.push(pending);pending='';}
      pending+=atom;
    }
    if(pending)parts.push(pending);
  }
  const candidates=parts.filter(part=>paragraphScoreValue(part));
  const mixedGate=parts.some(part=>!paragraphScoreValue(part)&&qualificationClauseBoundary(part));
  if(!candidates.length||candidates.length===1&&!mixedGate&&paragraphScoreValue(candidates[0]).kind==='cap')return[unit];
  const split=[];let inherited=null,currentPackage=null;
  for(const part of parts){
    const text=readText(part),value=paragraphScoreValue(part);
    const packageHeader=text.match(/^(?:采购包[:：]?([\d一二三四五六七八九十]+)|第([\d一二三四五六七八九十]+)包)[:：]/),nextPackage=packageHeader&&(packageHeader[1]||packageHeader[2]);
    if(nextPackage&&nextPackage!==currentPackage){inherited=null;currentPackage=nextPackage;}
    const prefix=text.replace(/^(?:采购包[:：]?[\d一二三四五六七八九十]+|第[\d一二三四五六七八九十]+包)[:：]/,'');
    const header=prefix.match(/^(技术|商务|价格|报价|附加)(?:部分|评分|得分|分)?[:：]/);
    if(header)inherited=groupName(header[1]);
    const explicitSharedCap=/^(?:(?:以上|上述)(?:证书|认证)(?:合计|总计|累计)|(?:证书|认证)(?:合计|总计|累计))/.test(prefix);
    const sharedCertificateCap=value?.kind==='cap'&&!header&&(explicitSharedCap||/^(?:本项|此项|该项)/.test(prefix));
    if(sharedCertificateCap){
      let start=split.length;
      while(start>0){const previous=split[start-1];if(!previous.score||previous.paragraphPackage!==currentPackage||previous.score.group!==inherited||!/认证|证书/.test(previous.score.title)||!explicitSharedCap&&paragraphScoreValue(previous.score.standard)?.kind!=='fixed')break;start--;}
      const related=split.slice(start);
      if(related.length){
        const body=related.map(item=>item.text).join('')+part,first=related[0],sum=related.reduce((total,item)=>total+item.score.maxScore,0);
        const scopeWarning=!explicitSharedCap&&related.length>1?`连续认证各列固定得分，后文“本项”最高${value.maxScore}分未明确共同适用范围；当前暂按封顶保守列示，是否为分别计分须核对原评分表或正式澄清。`:null;
        split.splice(start,related.length,{...first,text:body,fragments:[{text:body,block:unit.block}],score:{...first.score,title:related.length>1?'认证证书合计评分':first.score.title,maxScore:Math.min(sum,value.maxScore),standard:body,materials:materialNames(body),...(scopeWarning?{scopeWarning}:{})}});
        continue;
      }
    }
    const prior=split.at(-1),repeatedCap=value?.kind==='cap'&&prior?.score&&!header&&/^(?:本项|此项|该项|最高|满分|最多|上限)/.test(prefix);
    if(!value||repeatedCap){
      if(prior?.score&&!qualificationClauseBoundary(text)&&!/^采购包|^第[\d一二三四五六七八九十]+包/.test(text)){
        prior.text+=part;prior.fragments[0].text+=part;prior.score.standard+=part;prior.score.materials=materialNames(prior.score.standard);
      }else split.push({...unit,text:part,fragments:[{text:part,block:unit.block}],paragraphPackage:currentPackage});
      continue;
    }
    const body=prefix.replace(/^(?:技术|商务|价格|报价|附加)(?:部分|评分|得分|分)?[:：]/,'');
    const maximum=paragraphScoreValue(body),before=body.slice(0,maximum.index);
    const dateEnd=before.match(/\d{4}年\d{1,2}月\d{1,2}日(?:起|至今)?/);
    const title=(maximum.kind==='formula'?'报价得分':(dateEnd?before.slice(dateEnd.index+dateEnd[0].length):before).split(/每|[:：；;]/)[0].replace(/(?:得分)?$/,''))||'文件计分项';
    const group=header?inherited:groupName(before)||inherited||(/业绩|合同/.test(body)?'商务':'技术');
    inherited=group;
    split.push({...unit,text:part,fragments:[{text:part,block:unit.block}],paragraphPackage:currentPackage,score:{title,group,maxScore:value.maxScore,standard:part,materials:materialNames(part)}});
  }
  return split;
}

/** Join actual fragments, never invent inherited heading/group words in quotes. */
export function analysisUnits(doc) {
  const raw=[]; const tableGroups=new Map(); const tableHeaders=new Map();
  for (const block of doc.blocks) {
    if(nonContentBlock(block))continue;
    if (block.tableRows?.length) {
      let group=tableGroups.get(block.tableId)||null;
      let headers=tableHeaders.get(block.tableId)||(block.tableHeaders||[]).map(readText);
      for (const row of block.tableRows) {
        if(row.headers?.length)headers=row.headers.map(readText);
        const text=row.text || row.cells?.join(' | ') || '';
        if (!text.trim() || !readText(block.text).includes(readText(text))) continue;
        const cells=(row.cells||[]).map(value=>String(value||''));
        // These quotation-table labels describe columns, not a limit or a
        // rejection condition. Actual numeric rows and obligation text remain.
        if(cells.length>=4&&readText(cells[0])==='序号'&&cells.some(cell=>readText(cell)==='最高限价')&&cells.every(cell=>/^(?:序号|报价内容|报价明细内容|报价要求|计量单位|报价单位|最高限价|价款形式|报价说明)$/.test(readText(cell)))){headers=cells.map(readText);if(block.tableId)tableHeaders.set(block.tableId,headers);continue;}
        if (cells.some(cell=>/^(?:分值|分数|满分)$/.test(readText(cell))) && cells.some(cell=>/要求|标准/.test(readText(cell)))) {headers=cells.map(readText);if(block.tableId)tableHeaders.set(block.tableId,headers);continue;}
        const groupCell=[...cells,...(row.cellSpans||[]).map(span=>span.text)].find(cell=>/^(?:技术|商务|价格|报价|附加)(?:评审|部分|评分)$/.test(readText(cell)));
        if (groupCell) group=groupName(readText(groupCell));
        const unit={text, block, document:doc, cells, tableId:block.tableId, continued:row.continued, group, fragments:[]};
        unit.fragments=[{text,block}];
        let scoreIndex=headers.findIndex(header=>/^(?:分值|分数|满分)$/.test(header));
        if (scoreIndex<0) scoreIndex=cells.findIndex((cell,index)=>index>0 && /^\d+(?:\.\d+)?$/.test(readText(cell)) && cells.some(value=>/得\d|分|计分|评分|扣|基准价|价格权重/.test(readText(value))));
        const score=scoreIndex>=0 && /^\d+(?:\.\d+)?$/.test(readText(cells[scoreIndex])) ? Number(readText(cells[scoreIndex])) : null;
        let standardIndex=headers.findIndex(header=>/具体标准|评分标准|标准和要求|评分细则/.test(header));
        if (standardIndex<0) standardIndex=cells.findIndex(cell=>/得\d|扣\d|不得分|基准价|价格权重|满分|计分/.test(readText(cell)));
        const titleIndex=headers.findIndex(header=>/^(?:评审内容|评审项目|评分项|项目名称|项名)$/.test(header));
        const title=cells[titleIndex>=0?titleIndex:Math.max(0,standardIndex-1)] || '';
        const materialIndex=headers.findIndex(header=>/关联.*(?:文件|材料)|证明材料/.test(header));
        unit.semanticText=cells.filter((_,index)=>index!==materialIndex).join(' | ');
        const reviewIndex=headers.findIndex(header=>/^(?:审查内容|审查事项)$/.test(header));
        if(reviewIndex>=0 && readText(cells[reviewIndex]) && /资格审查|符合性审查/.test(readText(block.section)) && !/审查内容|具体标准和要求/.test(readText(cells[reviewIndex])))unit.review={type:/符合性审查/.test(readText(block.section))?'conformity':'qualification',title:readText(cells[reviewIndex]),standard:cells[standardIndex>=0?standardIndex:reviewIndex+1]||''};
        if (score!==null && score>0 && standardIndex>=0 && title && !/分值构成|技术部分|商务部分/.test(readText(title))) {
          unit.score={title:readText(title), group:group || groupName(readText(title)) || null, maxScore:score, standard:cells[standardIndex], readableStandard:(/具体标准|评分标准|标准和要求|评分细则/.test(headers[standardIndex]||'')||cells.length===6&&standardIndex===2&&scoreIndex===3&&/^(?:主观|客观)$/.test(readText(cells[4]))&&readText(title)===readText(cells[1]))?readText(cells[standardIndex]):undefined, materials:scoreMaterials(materialIndex>=0?cells[materialIndex]:null,cells[standardIndex])};
        }
        const typeIndex=headers.findIndex(header=>/^(?:类型|应知事项|事项|参数名称|技术要求名称)$/.test(header));
        unit.title=readText(cells[typeIndex>=0?typeIndex:0]);
        raw.push(unit);
      }
      if (block.tableId) tableGroups.set(block.tableId,group);
    } else {
      // New extraction blocks are logical paragraphs. Old PDF blocks can be physical lines.
      for (const text of block.kind==='table'?[block.text]:block.text.split(/\n+/).flatMap(text=>text.split(/(?=详[见⻅]附件[:：])/u)).map(text=>text.trim()).filter(Boolean)) raw.push({text,block,document:doc,fragments:[{text,block}]});
    }
  }
  const joined=[];
  for (const unit of raw) {
    const prev=joined.at(-1); const t=readText(unit.text); const p=readText(prev?.text);
    if(/^-?第\d+页-?$/.test(t))continue;
    const nextHeading=headingOnly(unit.text) || /^(?:详见附件|序号|评审内容|采购包\d|关联投标|(?:采购)?项目(?:名称|编号)[:：]|采购人[:：]|采购代理机构[:：])/.test(t);
    const policyValue=/^(?:不涉及|无|不收取|不缴纳|不组织)(?:[|。]|$)/.test(t);
    const policyHeading=prev && /(?:本项目涉及|投标.*保证金|履约保证金|质量保证金|现场考察|样品)/.test(p) && !sentenceEnd.test(p) && !prev.score;
    const continuation=prev && !prev.score && !unit.score && !headingOnly(prev.text) && !sentenceEnd.test(p) && !nextHeading && !/^\d+[、.]|^[一二三四五六七八九十]+、/.test(t) && !/^[^|]{0,30}\|/.test(p) && !prev.cells && !unit.cells;
    const rowContinuation=prev?.tableId && prev.tableId===unit.tableId && unit.continued && (!unit.score || (prev.score && unit.score.title===prev.score.title));
    if (prev && ((policyValue && policyHeading) || continuation || rowContinuation)) {
      prev.text+='\n'+unit.text; prev.fragments.push(...unit.fragments);
      if (rowContinuation && prev.score) {prev.score.standard+='\n'+unit.text;if(prev.score.readableStandard&&unit.score?.readableStandard)prev.score.readableStandard+='\n'+unit.score.readableStandard;else prev.score.readableStandard=undefined; prev.score.materials=scoreMaterials(prev.score.materials.join('、'),prev.score.standard);}
    } else joined.push(unit);
  }
  // A policy heading followed by header cells and a standalone negative table value.
  for (let i=0;i<joined.length;i++) {
    const unit=joined[i]; if (!/本项目涉及(?:强制采购|优先采购|采购进口|核心|.*环境标志)|^本国产品采购包|^优先采购产品评审细则采购包/.test(readText(unit.text))) continue;
    for(let j=i+1;j<Math.min(i+5,joined.length);j++) {
      const next=joined[j]; if (next.block.page>unit.block.page+1 || /^注[:：]/.test(readText(next.text))) break;
      if (/^(?:不涉及|无)(?:[|。]|$)/.test(readText(next.text))) {unit.text+='\n'+next.text;unit.fragments.push(...next.fragments);next.consumed=true;break;}
    }
  }
  const scoringUnits=joined.flatMap(paragraphScoringUnits);
  for(const unit of scoringUnits){
    if(unit.score || unit.cells)continue;
    const t=readText(unit.text);
    const max=t.match(/(?:最高|满分|最多|上限)(?:得)?(\d+(?:\.\d+)?)分/);
    if(!max || !/评分|得分|每.{0,30}分|扣.{0,15}分|不得分|方案/.test(t))continue;
    const prefix=t.slice(0,max.index).replace(/^(?:技术|商务|价格|报价)评分[:：]/,'');
    const dateEnd=prefix.match(/\d{4}年\d{1,2}月\d{1,2}日(?:起|至今)?/);
    const title=(dateEnd?prefix.slice(dateEnd.index+dateEnd[0].length):prefix).split(/每|[:：；;]/)[0].replace(/(?:得分)?$/,'')||'文件计分项';
    unit.score={title,group:groupName(t)||(/业绩|合同/.test(t)?'商务':'技术'),maxScore:Number(max[1]),standard:unit.text,materials:materialNames(t)};
  }
  let currentPackage=null,currentLot=null,qualificationHeading=null,previousSection=null;
  const result=scoringUnits.filter(unit=>!unit.consumed);
  for(const unit of result){
    const text=readText(`${unit.text} ${unit.block.section}`);
    const body=readText(unit.text),section=readText(unit.block.section);
    const numeric=body.match(/^(\d+(?:\.\d+)*)(?=[.、\u4e00-\u9fff])/),lotHeading=body.match(/^(?:标段([\d一二三四五六七八九十]+)|第([\d一二三四五六七八九十]+)标段)[:：]?$/);
    const structuralHeading=!/[。；;]/.test(body)&&!/\d+#/.test(body)&&(headingOnly(body)||/^\d+[.、][^\d]/.test(body));
    // Lot headings govern their own following clauses, never the next numbered
    // procurement section. A project-wide qualification section resets the lot.
    if(previousSection!==null&&previousSection!==section)currentLot=null;
    if(lotHeading)currentLot=lotHeading[1]||lotHeading[2];
    else if(structuralHeading)currentLot=null;
    if(previousSection!==null&&previousSection!==section)qualificationHeading=null;
    if(qualificationHeading&&numeric&&qualificationHeading.number&&!numeric[1].startsWith(qualificationHeading.number+'.')&&numeric[1]!==qualificationHeading.number)qualificationHeading=null;
    if(structuralHeading&&!(/资格(?:条件|要求|审查)|资质资格要求/.test(body)))qualificationHeading=null;
    if(/^(?:\d+(?:\.\d+)*[.、]?|[一二三四五六七八九十]+、)?(?:竞标人|投标人|供应商|企业)?(?:资质)?资格(?:条件|要求|审查)/.test(body)&&structuralHeading)qualificationHeading={number:numeric?.[1]||null};
    unit.qualificationContext=Boolean(qualificationHeading);
    const packages=distinct([...text.matchAll(/(?:采购包[:：]?([\d一二三四五六七八九十]+)|第([\d一二三四五六七八九十]+)包)/g)].map(match=>match[1]||match[2]));
    if(packages.length===1)currentPackage=packages[0];
    else if(packages.length>1)currentPackage=null;
    unit.scope={documentId:doc.id,package:packages.length===1?packages[0]:currentPackage,lot:currentLot,mixedPackages:packages.length>1,phase:(/施工期间|施工过程中|安装阶段|履行合同|进场|交付|验收时|签订合同|成交后|中标后/.test(readText(unit.text))||fulfillmentMaterialSampling(readText(unit.text)))?'fulfillment':'response'};
    previousSection=section;
  }
  // A generic quantity/cap paragraph in the performance chapter can restate a
  // previously scored item. Merge only a unique same-scope match; ambiguity
  // remains an unbounded candidate instead of adding another cap to the total.
  for(const [index,unit] of result.entries()){
    if(!unit.score||!/^数量上限|^份数上限|^对应每份/.test(readText(unit.text))||!/业绩/.test(readText(unit.block.section+' '+unit.text)))continue;
    const candidates=result.slice(0,index).filter(other=>other.score&&!other.scoreRepeatOf&&other.score.group==='商务'&&other.score.maxScore===unit.score.maxScore&&/业绩/.test(other.score.standard)&&other.scope.documentId===unit.scope.documentId&&other.scope.package===unit.scope.package&&other.scope.phase===unit.scope.phase&&!other.scope.mixedPackages&&!unit.scope.mixedPackages);
    if(candidates.length===1){
      const prior=result[index-1],context=prior&&!prior.score&&prior.block.section===unit.block.section&&/业绩/.test(prior.text)?[prior,unit]:[unit],target=candidates[0];
      const description=readText(context.length>1?prior.text:''),type=description.match(/业绩类型为([^，,。；;]+)/)?.[1]?.replace(/项目$/,'')||description.match(/^([^，,。；;:：]{2,40})业绩/)?.[1]?.replace(/^(?:同类|类似)/,'');
      if(!type||!readText(target.score.standard).includes(type)){delete unit.score;continue;}
      target.text+='\n'+context.map(item=>item.text).join('\n');target.fragments.push(...context.flatMap(item=>item.fragments));
      target.score.standard+='\n'+context.map(item=>item.text).join('\n');target.score.materials=distinct([...target.score.materials,...context.flatMap(item=>materialNames(item.text))]);
      unit.scoreRepeatOf=true;delete unit.score;
    }else if(candidates.length>1)delete unit.score;
  }
  return result;
}

// Equal package numbers in separate sources do not establish amendment precedence.
export function scopeRelation(first,second){
  if(!first||!second||first.mixedPackages||second.mixedPackages)return 'unknown';
  if(first.package&&second.package&&first.package!==second.package)return 'different';
  if(first.phase!==second.phase)return 'different';
  if(first.documentId!==second.documentId)return 'unknown';
  if(Boolean(first.package)!==Boolean(second.package))return 'unknown';
  return 'same';
}

export function linkedStarConsequences(units,candidates=[]){
  const own=units[0],scope=own?.scope;if(!scope||scope.mixedPackages)return [];
  const chapter=value=>readText(value).match(/^(\d+)\./)?.[1]||readText(value).match(/^第([一二三四五六七八九十]+)章/)?.[1];
  const section=readText(own.block.section).replace(/\/第\d+页$/,'');
  return candidates.filter(other=>{
    if(other.scope?.documentId!==scope.documentId||other.scope?.package!==scope.package||other.scope?.mixedPackages)return false;
    const a=chapter(own.block.section),b=chapter(other.block.section),sameChapter=a&&b&&a===b;
    if(a&&b&&a!==b)return false;
    const sameSection=section===readText(other.block.section).replace(/\/第\d+页$/,'');
    return Boolean(sameChapter||sameSection&&(other.scope?.phase===scope.phase)||other.block.page===own.block.page&&(own.cells||other.scope?.phase===scope.phase));
  });
}
function obligationParts(text) {
  const negative=[];const positive=[];
  const atoms=readText(text).split(/[，,；;。|]|但是|不过|然而|但|且|同时|(?=(?:采购人|代理机构|磋商小组|评审委员会)(?:或者代理机构)?(?:应当|必须|须|需))/).filter(Boolean);
  const negation=/无需|无须|不需要(?:提供|提交|缴纳|参加)|不(?:收取|缴纳|涉及|组织|要求(?:提供|提交)?)|不属于专门面向/;
  const obligation=/必须|须|应当|应(?:提供|提交|缴纳|具备)|具备|具有|(?:提交|提供).{0,25}(?:证书|报告|材料|认证|样品)|不得|不接受|至少|不少于|不低于/;
  let buyer=false;
  for(const atom of atoms){if(/^(?:采购人|代理机构|磋商小组|评审委员会|样品评审)/.test(atom))buyer=true;if(/^(?:供应商|投标人|响应文件)/.test(atom)||/要求(?:供应商|投标人)/.test(atom))buyer=false;const at=atom.search(negation);if(at>=0){negative.push(atom.slice(at));const before=atom.slice(0,at);if(!buyer&&obligation.test(before))positive.push(before);}else if(!buyer&&obligation.test(atom))positive.push(atom);}
  return {negative:distinct(negative),positive:distinct(positive)};
}

function applicability(text, obligations=obligationParts(text)) {
  const t=readText(text);
  // Negation applies to an obligation, not a negated failure or a numeric lower bound.
  if(obligations.negative.length){if(/如(?:为|属|有|需|适用|采用|提供|所投)|若|仅当|如果/.test(t))return 'conditional';return obligations.positive.length?'required':'not-required';}
  if (/如果|如(?:由|为|属|有|需|适用|采用|提供|参加)|若|仅当|除外|除.{1,40}外|免税|不需要缴纳/.test(t)) return 'conditional';
  return /须|必须|应当|应提供|具备|不少于|不得|★|资格要求|得分|扣分|不得分|保证金|付款|质保/.test(t)?'required':'not-stated';
}

function collusionDepositCondition(text){
  return /不同(?:供应商|投标人)的(?:投标(?:\(响应\))?|响应)?保证金从同一(?:单位|个人|自然人|企业).{0,20}账[户戶]转出/.test(readText(text));
}
function priceDeductionDetails(text){
  // Percentages have distinct jobs: a cost-share threshold is not a deduction
  // rate merely because both occur in one policy paragraph.
  const rates=distinct([...text.matchAll(/(\d+(?:\.\d+)?%)的?(?:价格|报价)?扣除|(?:价格|报价)?扣除(?:比例)?(?:为|是|:)?(\d+(?:\.\d+)?%)/g)].map(match=>match[1]||match[2]));
  const costShares=distinct([...text.matchAll(/成本(?:之和)?的?(?:占比|比例)(?:须|应|必须)?(?:达到|不低于|不少于|至少|为|>=|≥)?(\d+(?:\.\d+)?%)/g)].map(match=>match[1]));
  return {rates,costShares,domestic:/本国产品/.test(text)};
}

function fulfillmentMaterialSampling(text){
 return !/投标时|随投标|递交|开标前|样品评审|样品评分/.test(text)&&/(?:施工单位.{0,40}(?:制作样板|选样)|(?:制作样板|选样).{0,60}封样)/.test(text)&&/验收|施工单位/.test(text);
}
export function describeFinding(finding, units, {starConsequences=[], policyExclusions=[], reviewConsequences=[]}={}) {
  const text=readText(finding.quote); const section=readText(units.map(unit=>unit.block.section).join(' '));
  const panelDiscipline=section.match(/(磋商小组|评审委员会|评标委员会|评审专家)(成员)?工作纪律/);
  // An inherited heading cannot replace the actor of an actual source clause.
  // Supplier predicates may start with 未/均/在... rather than an adjacent 须.
  const supplierClauseSubject=/(?:^|[，,。；;:|])(?:(?:[一二三四五六七八九十百\d]+[、.]|\([一二三四五六七八九十百\d]+\))[、.]?)?(?:供应商|投标人|响应文件|投标文件)/.test(text);
  const supplierConsequence=finding.hard&&/供应商|投标人|响应文件|投标文件/.test(text);
  const panelOnly=Boolean(panelDiscipline)&&!supplierClauseSubject&&!supplierConsequence&&!/(?:供应商|投标人)(?:须|应|必须|不得|需)/.test(text);
  const score=units.find(unit=>unit.score)?.score;
  const review=units.find(unit=>unit.review)?.review;
  const qualificationContext=!score&&(units.some(unit=>unit.qualificationContext)||review?.type==='qualification'||/资格(?:审查|条件|要求)|供应商参加条件/.test(section)||/供应商资格承诺函|(?:具有|具备)履行合同所必需/.test(text));
  const contractSafety=!qualificationContext&&!score&&!review&&!/投标时|随投标|资格(?:条件|要求|审查)/.test(text)&&/施工现场|施工期间|施工过程中|安全生产责任制|安全生产的第一责任人/.test(text)&&/安全|施工/.test(text);
  let subject=/项目经理|建造师/.test(text)?'供应商／拟派项目经理':procurementProcedure(text)?'采购人／代理机构／磋商小组':/供应商|投标人|响应文件|须|★/.test(text)?'供应商':'按条款涉及主体核验';
  let stage=procurementProcedure(text)?'采购组织与评审':qualificationContext?'投标准备与资格审查':contractSafety||/施工期间|施工过程中|安装阶段|履行合同|进场前|自行投保|购买.{0,15}保险|专项安全施工方案/.test(text)?'合同履约':/验收时|交付竣工验收|工程保修书/.test(text)?'履约验收':/最后报价|磋商过程中|修正.{0,15}报价|异常低价|低于.{0,60}%/.test(text)?'评审与磋商':/付款|支付|审计|质保|保修/.test(text)?'合同履约与付款':'投标准备与资格审查';
  if(panelOnly){subject=panelDiscipline[1]+(panelDiscipline[2]||'');stage='采购组织与评审';}
  const obligations=obligationParts(text);
  let applies=applicability(text,obligations); let hard=finding.hard;
  const referenceOnly=/^(?:详见附件|见附件|另附)[:：]/.test(text);
  if (headingOnly(text) || procurementProcedure(text) || applies==='not-required') hard=false;
  const gate=qualificationContext||/企业资质|项目经理.{0,40}(?:具备|须)|(?:供应商|投标人|竞标人)(?:须|必须)?具备|资格(?:要求|条件|审查)|供应商参加.*条件|特定资格/.test(text+section);
  if(gate && ['entity','qualification','personnel','performance'].includes(finding.categoryId) && /具备|有效|至少|须|必须|不接受/.test(text) && applies!=='not-required' && !score) hard=true;
  if(contractSafety)hard=false;
  if(score && !/资格条件[:：].{0,80}(?:至少|须)/.test(text)) hard=false;
  const emptyReview=review && /^(?:无认定为.{0,15}(?:响应无效|无效响应)的其他情形[。.]?|\{\{未填写\}\})$/.test(readText(review.standard).replace(/[“”‘’"']/g,''));
  if(emptyReview)hard=false;
  else if(review && !score && applies!=='not-required' && readText(review.standard))hard=true;
  const starred=/★/.test(text) && !procurementProcedure(text) && !/标注.*★.*条款/.test(text) && !/品目清单/.test(text) && Boolean(units.some(unit=>unit.cells) || /★.{0,30}(?:时间|地点|付款|质保|参数|要求)/.test(text));
  const linkedStars=linkedStarConsequences(units,starConsequences);
  if(starred && linkedStars.length) hard=true;
  const currentScope=units.find(unit=>unit.scope)?.scope;
  const policyKind=value=>/环境标志/.test(value)?'environmental':/强制(?:采购|节能产品)/.test(value)?'mandatory':/优先采购(?:的产品|节能产品)|节能产品.*优先采购/.test(value)?'preferred':null;
  const kind=policyKind(text);
  const excluded=kind&&policyExclusions.some(exclusion=>policyKind(readText(exclusion.text))===kind&&scopeRelation(exclusion.scope,currentScope)==='same');
  if(excluded && /^注|响应产品属于|未按.{0,20}强制(?:采购|节能产品)|品目清单|不涉及/.test(text)) {hard=false;applies='not-required';}
  const fields={...finding.fields,'适用主体':subject,'适用阶段':stage,'适用性':({'required':'文件明确要求','not-required':'明确无需／不涉及','conditional':'按条件或例外适用','not-stated':'本段未明示，待核验'})[applies]};
  const thresholds=distinct(text.match(/(?:不低于|不少于|不超过|至少|至多|最高|最低|不得高于|不早于|不晚于|超过)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:万|亿|千)?(?:万元|亿元|元|%|分|天|日|年|个月|月|项|个|把|人|份|kg|mm|厘米|毫米|级)/gi)||[]);
  if(thresholds.length)fields['阈值与数量']=thresholds;
  // Standard cells determine obligations; associated format cells supply material names only.
  const semantic=readText(units.map(unit=>unit.semanticText||unit.text).join('\n'));
  fields['要求正文']=semantic;
  fields['证明材料']=submissionMaterials(semantic);
  if(currentScope?.package)fields['采购包范围']=`采购包${currentScope.package}`;
  if(currentScope?.lot)fields['标段范围']=`仅标段${currentScope.lot}；所投标段尚未确认，不能扩展为全项目资格`;
  if(obligations.negative.length)fields['免除事项']=obligations.negative;
  if(obligations.negative.length&&obligations.positive.length)fields['仍须落实的正向要求']=obligations.positive;
  let title=units.find(unit=>unit.title && !/^\d+$/.test(unit.title))?.title||finding.title;
  if(review && review.title)title=review.title;
  if(title==='其他')title=/付款方式/.test(text)?'付款方式':/质保期/.test(text)?'质保期':title;
  let interpretation=finding.interpretation; let impact='按本次文件与企业事实核验适用范围。'; let actions=[];
  if(applies==='not-required') {const exempt=finding.categoryId==='eco'?'本范围的产品政策不涉及':/不涉及/.test(text)?'该事项不涉及':/不组织/.test(text)?'不组织统一现场活动':/无需/.test(text)?'无需提交所述材料':/不缴/.test(text)?'不缴纳所述保证金':/不收/.test(text)?'不收取所述保证金':'无需适用本范围通用模板要求';interpretation=`文件明确${exempt}；保留其他独立条件，不反推为未识别。`;impact='该明确免除项不作为企业失败条件。';actions=['确认是否有有效补充文件改变这一适用范围。'];}
  if(/保证金/.test(text) && finding.categoryId==='deposit') {const type=text.match(/投标(?:\(响应\))?保证金|响应保证金|履约保证金|质量保证金/);if(type){title=type[0];fields['保证金类型']=type[0];interpretation='保证金条款按本类要求执行：'+clauseBody(semantic||text);}}
  if(finding.categoryId==='deposit'&&collusionDepositCondition(text)){
    title='保证金同源转出的串通审查条件';stage='评审与串通审查';applies='conditional';
    fields['用途']='串通响应审查条件（非保证金缴纳要求）';fields['证明材料']=[];
    fields['缴纳义务']='本条不新增保证金缴纳义务；是否收取、金额和方式按同范围项目选项核验。';
    interpretation='本段属于不同供应商保证金同源转出的串通审查条件，仅在存在相应保证金及所述行为时核验，不从本段新增保证金缴纳要求。项目是否收取保证金另按项目选项；通用串通条款仍保留。';
    impact='识别串通响应行为，不能据此推定本项目要求缴款。';
    actions=['分别核对本项目保证金选项与串通审查条件，不把通用行为定义当作缴款通知。'];
  }
  if(score){title=score.title;fields['用途']=hard?'资格要求；另含评分用途，须分别核验':'评分要求（仅资料支持预计／参考，不保证实际得分）';fields['满分']=String(score.maxScore);fields['证明材料']=score.materials;fields['计分标准']=finding.quote;fields['评分性质']=units.some(unit=>unit.cells?.some(cell=>readText(cell)==='主观'))?'主观':units.some(unit=>unit.cells?.some(cell=>readText(cell)==='客观'))?'客观':'待核验';interpretation=`${score.title}满分${score.maxScore}分。${readText(score.standard)}资料完整后可作规则预计或有理由的人工参考估计，主观评审不保证满分。`;impact='影响该评分项及竞争力，不能抵消资格或实质性要求。';actions=[`准备并检查${fields['证明材料'].join('、')||score.title}。`,'逐项对照计分、扣分、缺项及封顶规则；预计／参考不代表实际专家得分。'];stage='投标编制与评分';}
  if(/项目经理|建造师/.test(text) && !score&&!contractSafety){title='拟派项目经理完整资格条件';fields['经理完整条件']=finding.quote;interpretation='拟派经理按本条具体条件核对：'+clauseBody(semantic)+'。所列证书、任职及材料要求逐项落实；未列B证或兼职限制不增补。';impact='涉及资格准入；没有企业证据只待核验，不判不满足。';actions=['按原文经理资格条件与材料路径核对实际拟派人员，不从通用经验增加门槛。'];}
  if(/缴纳.{0,25}(?:税收|税款|社会保障资金|社保)|(?:税收|社会保障资金|纳税|社保)(?:证明|资料|凭证)|免税|无需缴纳/.test(semantic)&&!score&&!/项目经理|建造师|劳动关系|个人社保|政府采购供应商资格承诺函|法定代表人资格证明|反商业贿赂|抵制.{0,20}商业贿赂/.test(semantic)){fields['材料适用分支']=finding.quote;interpretation='企业税社保按本条时间与证明路径落实：'+clauseBody(semantic)+'。不把企业税社保证明混为经理个人社保，不扩写未列月份或免除。';actions=['核对本条明确的税社保期间、材料关系与免除范围。','按原文签署与查询要求准备真实材料。'];}
  if(/(?:报价|价格).{0,20}(?:扣除|优惠)|(?:小|微)企业.{0,30}扣除/.test(text)&&/%/.test(text)){
    const deduction=priceDeductionDetails(text);fields['政策属性']='评审价格扣除';fields['扣除比例']=deduction.rates;
    interpretation='明确关联扣除的比例用于评审价格调整，不是直接加分或合同款减价；按真实政策身份及证明条件适用。';
    impact='影响价格比较与计分基准，不改变实际合同报价。';
    actions=['核对小微、监狱或残疾人福利单位等适用主体及声明证明。','将扣除后评审价格用于文件规定的价格计算。'];
    if(deduction.domestic){
      fields['政策类别']='本国产品价格评审优惠';
      if(deduction.costShares.length)fields['本国产品成本占比阈值']=deduction.costShares;
      interpretation='本段为本国产品价格评审优惠；'+(deduction.rates.length?'明确价格扣除率为'+deduction.rates.join('／')+'，':'具体价格扣除率仍须核验，')+'用于评审价，不是加分或合同折价。'+(deduction.costShares.length?'本国产品成本占比'+deduction.costShares.join('／')+'属于多种产品享受优惠的条件，不能当作扣除率。':'')+'按本国产品标准、所含产品及原文声明或承诺条件核验适用范围。';
      actions=['核对本采购标的是否适用本国产品标准，分别核对单一产品与多种产品条件。','按原文准备本国产品声明及适用的成本占比承诺，核验真实产品成本；未明示材料不增补。'];
      if(/小型|微型|小微|监狱|残疾人福利/.test(text))actions.push('本段另涉小微、监狱或残疾人福利单位时，分别核对各政策主体和证明，不能与本国产品条件互换。');
      actions.push('仅将适用且明确的扣除率用于评审价格，不把成本占比计作扣除率或得分。');
    }
    hard=false;applies='conditional';
  }
  if(/低于/.test(text)&&/%/.test(text)&&/报价|低价/.test(text)){const triggers=distinct(text.match(/低于[^；;。()]{0,100}?\d+(?:\.\d+)?%/g)||[]);fields['低价审查触发']=triggers;fields['不满足后果']='触发低价审查先解释并提交必要证明；不能证明报价合理性才按原文否决。';const bases=[];if(/全部通过符合性.*平均值/.test(text))bases.push('全部通过符合性审查供应商响应报价平均值');if(/符合性.*次低/.test(text))bases.push('通过符合性审查且报价次低供应商响应报价');if(/最高限价/.test(text))bases.push('最高限价');const percent=distinct(triggers.flatMap(value=>value.match(/\d+(?:\.\d+)?%/g)||[]));interpretation=`异常低价审查分别比较${bases.join('、')||'原文列明的各比较基数'}，均按原文${percent.join('／')}严格低于触发，等于对应阈值不触发该分支，其他分支仍须核对。${/数量报价/.test(text)?'另有评委认为明显偏低且可能影响质量或诚信履约的分支；括号中的明显偏高仅在数量报价条件下适用，不无条件扩为总价高报价。':''}启动后须在合理时间内提供书面说明与必要证明，不能证明报价合理性才按原文作无效处理。使用原文响应报价基数，不自行替换为政策扣除后的评审价。`;impact='影响报价解释和诚信履约判断；不是最低有效报价限制。';actions=['分别核对通过符合性审查的平均价、次低价、最高限价及其他异常分支。','准备书面说明、成本明细及必要证明，按规定时间响应。'];applies='conditional';}
  if(starred){const consequences=linkedStars.map(unit=>clauseBody(readText(unit.text)));fields['实质性要求']=consequences.length?'★标记与同来源同包要求及后果已关联':'★标记要求已保留，共同后果尚未完整关联，待核验';if(consequences.length)fields['不满足后果']=consequences.join('；');interpretation=`本项为文件标记的★要求：${clauseBody(text)}。`+(consequences.length?'共同实质性后果：'+consequences.join('；'):'共同否决后果须继续核对适用原文。')+'不能用加分抵消实质性要求。';impact=consequences.length?consequences.join('；'):'不满足的具体后果待核验。';actions=[`在响应表完整响应${title}，检查数值、触发条件及例外。`,'确认企业能履行，不以仅签承诺代替实际能力核验。'];}
  if(stage==='合同履约'&&!score&&!starred){interpretation=`履约阶段义务：${clauseBody(semantic||text)}。投标时核对能否履行及是否须作响应，不凭本段推定已经完成履约或必须提前取得审批。`;impact='影响实施责任、保险、安全或交付成本。';actions=['明确实施时点、责任主体及费用承担。','核对是否另有投标时承诺或证明要求。'];}
  if(contractSafety){title='施工安全管理与人员责任';subject='承包人／施工现场人员';fields['用途']='施工履约安全管理责任';}
  if(!referenceOnly&&applies!=='not-required'&&!contractSafety) {const precise=specificClause(semantic,title,score,fields);if(precise){title=precise.title;interpretation=precise.interpretation;actions=precise.actions;if(/政府采购供应商资格承诺函/.test(semantic)&&/独立承担/.test(semantic))delete fields['材料适用分支'];}}
  if(referenceOnly){hard=false;applies='not-stated';fields['附件目录属性']='仅格式名称，正文待核验';interpretation='本段仅为附件或格式目录，具体正文是否已取得仍待核验；不能凭目录名称推定完整提交条件。';impact='附件内容未核实前保留阅读缺口。';actions=['取得对应附件正文，核对格式、字段、签署及适用条件。'];}
  if(panelOnly){
    title=subject+'评审工作纪律';hard=false;fields['用途']='评审组织程序与工作纪律';fields['证明材料']=[];
    interpretation='本条为'+subject+'在评审阶段应遵守的工作纪律：'+clauseBody(semantic||text)+'。不能因文中提及供应商，就转为供应商资格门槛或必交材料要求。';
    impact='约束评审程序和评审成员行为；供应商另有明确义务的，仍按其自身条款执行。';
    actions=['核对评审工作纪律及正式澄清程序，不把评审成员职责转嫁为供应商资格或材料要求。'];
  }
  if(obligations.negative.length&&obligations.positive.length&&!referenceOnly){interpretation+='同条免除仅适用于所列材料或事项，不取消其他正向要求。';actions.push('分别核对正向义务与免除事项，不能把局部免除扩大为整条无需响应。');}
  if(!actions.length)actions=[hard?'核对全部适用条件及企业证据，未核实前保持待核验。':'对照完整原文落实材料、条件和时点，保留未明确事项。'];
  if(review){fields['审查属性']=review.type==='qualification'?'资格准入审查':'响应文件符合性审查';if(reviewConsequences.some(unit=>unit.reviewConsequenceType===review.type))fields['关联审查后果']='已关联相应审查不合格后果原文；企业是否触发仍待核验';}
  if(finding.categoryId==='sample'&&!score&&fulfillmentMaterialSampling(text)){
    title='施工材料样板、选样与封样';subject='施工单位';stage='施工履约与验收';hard=false;
    fields['用途']='履约材料确认与验收';fields['是否投标送样']='本段为施工材料样板和封样，不据此要求投标时送样或增加样品评分。';
    interpretation=`施工单位按原文进行材料样板、选样、确认及封样，并作为验收依据：${clauseBody(text)}。本段不作为投标时送样或样品评分要求；如有另列投标送样条款，须单独核对。`;
    impact='影响材料采购、施工质量确认与验收。';actions=['按施工材料确认流程准备样板、选样和封样，明确确认主体及验收依据。'];
  }
  if(finding.categoryId==='eco'&&!score&&!starred&&units.some(unit=>/技术标准和要求|施工图|设计说明/.test(unit.document?.fileName||unit.block.fileName||''))&&!/投标|响应文件|强制采购|优先采购|政府采购|认证证书|环境标志产品/.test(text)){
    stage='技术选型与履约验收';fields['用途']='材料设备节能环保技术性能要求';
    interpretation=`本段为材料设备的节能环保技术要求：${clauseBody(text)}。按原文落实技术性能及验收，不凭“节能”字样增加政府强制采购认证或投标加分。`;
    impact='影响材料设备选型、施工和验收；采购政策适用性另行核对。';
  }
  fields['适用主体']=subject;fields['适用阶段']=stage;fields['适用性']=({'required':'文件明确要求','not-required':'明确无需／不涉及','conditional':'按条件或例外适用','not-stated':'本段未明示，待核验'})[applies];
  const scopePending=Boolean(currentScope?.lot),scopedHard=scopePending&&hard;
  if(scopePending){hard=false;applies='conditional';interpretation+=`本条限标段${currentScope.lot}，须先确认所投标段，不作为全项目确定性不符合。`;fields['适用性']='所投标段待确认；仅在本标段内核验';}
  return {title,subject,stage,applicability:applies,impact,actions,fields,interpretation,hard,scope:currentScope?{...currentScope}:undefined,scopePending,scopedHard,conditional:scopePending||applies==='conditional'||finding.conditional};
}

const refsOf=items=>{const map=new Map();for(const item of items)for(const ref of item.references||[])map.set(`${ref.documentId}:${ref.blockId}:${ref.quote}`,ref);return [...map.values()];};
function synthesis(title,interpretation,impact,actions,items){return{id:`analysis-${hash(title+items.map(item=>item.id).join(':'))}`,title,interpretation,impact,actions,references:refsOf(items)};}
function unitEvidence(unit){return{id:`unit-${hash(unit.text)}`,references:unit.fragments.map(fragment=>({blockId:fragment.block.id,documentId:fragment.block.documentId,fileName:fragment.block.fileName,page:fragment.block.page,section:fragment.block.section,quote:fragment.text}))};}

function groupUnits(units){
  const groups=new Map();for(const unit of units){const scope=unit.scope||{},key=JSON.stringify([scope.documentId,scope.package||null,scope.phase||'response',scope.mixedPackages?unit.block.id:null]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(unit);}return [...groups.values()];
}
function moneyFacts(unit){
  const text=readText(unit.text),facts=[];
  for(const match of text.matchAll(/(预算及(?:控制价|最高限价)|(?:采购包)?预算金额|采购预算|预算|(?:采购包)?最高限价|控制价)(?:\((万元|亿元|元)\))?[为是:：|]*(?:人民币)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(万元|亿元|元)?/g)){
    const currency=match[4]||match[2];if(!currency)continue;const value=match[3]+currency,amount=numericAmount(value);if(amount===null)continue;
    const labels=/预算及/.test(match[1])?['预算金额','最高限价']:/最高限价|控制价/.test(match[1])?['最高限价']:['预算金额'];
    for(const label of labels)facts.push({label,value,amount,scope:unit.scope,unit});
  }return facts;
}
function mergeWaterproofContinuation(unit,units){
  if(!unit.cells||unit.cells.length<6||unit.cells.slice(6).some(value=>readText(value))||!/屋面防水/.test(readText(unit.cells[2])))return null;
  const body=readText(unit.cells[3]);if(!/^厚弹性体改性沥青防水卷材/.test(body))return null;
  const section=value=>readText(value).replace(/\/第\d+页$/,'');
  const prefixes=units.slice(0,units.indexOf(unit)).filter(other=>other.document.id===unit.document.id&&other.scope?.package===unit.scope?.package&&!other.scope?.mixedPackages&&!unit.scope?.mixedPackages&&other.block.page+1===unit.block.page&&section(other.block.section)===section(unit.block.section)&&/上层防水层[^|]{0,90}[:：]\d+(?:\.\d+)?/.test(readText(other.text)));
  if(prefixes.length!==1)return null;
  const upper=prefixes[0],thickness=readText(upper.text).match(/上层防水层[^|]{0,90}[:：](\d+(?:\.\d+)?)/)?.[1];
  const level=body.match(/3[:：]\d+[:：]\d+水泥砂浆找平层[,，]厚\d+(?=4[:：]板内植筋)/),anchor=body.match(/4[:：]板内植筋预埋锚筋/),clear=body.match(/5[.、:：]原屋面拆除后清理修补/);
  if(!thickness||!level||!anchor||!clear||!(level.index<anchor.index&&anchor.index<clear.index)||!/下层防水层.*\d+(?:\.\d+)?厚.*做完后需做防水试验$/.test(body.slice(0,level.index)))return null;
  const description='上层防水层：'+thickness+body.slice(0,level.index)+'；找平层：'+body.slice(level.index+2,anchor.index)+'；板内植筋节点：'+body.slice(anchor.index+2,clear.index)+'；原屋面处理：'+body.slice(clear.index+2);
  return {description,rawDescription:unit.cells[3],references:refsOf([unitEvidence(upper),unitEvidence(unit)]),coveredReference:unitEvidence(unit).references[0]};
}
const exactReferenceKey=ref=>JSON.stringify([ref.documentId,ref.blockId,readText(ref.quote)]);
// Quality targets belong to their actual clause, not a neighbouring source, actor or package.
function qualityRequirements(units,warnings=[]) {
  const result=[];
  for(const unit of units){
    if(unit.score||nonContentBlock(unit.block)||warnings.some(w=>w.code==='PDF_OVERLAPPING_TEXT'&&w.page===unit.block.page&&(!w.documentId||w.documentId===unit.document.id)))continue;
    for(const fragment of unit.fragments){
      const clauses=fragment.text.split(/(?=(?:采购包[:：]?[\d一二三四五六七八九十]+[:：]|第[\d一二三四五六七八九十]+包[:：]))|(?<=[。；;])(?=\s*(?:施工单位|供应商|投标人|承包人|工程质量|施工质量|[^，。；;|]{1,40}(?:公司|单位)(?:工程质量|施工质量|所有分项工程|分项工程)))/);
      for(const quote of clauses){
        const text=readText(quote);
        if(!text||/^(?:详见附件|见附件|另附)[:：]/.test(text))continue;
        const standard=/(?:工程质量|施工质量|质量标准|质量要求)[:：]?(?:须|应当|应|必须)?(?:达到|符合|为)?合格(?:标准)?|施工(?:质量)?(?:须|应当|应|必须)?(?:达到|符合)合格标准/.test(text);
        const rate=text.match(/((?:所有|各)?(?:分部分项工程|分项工程))(?:的)?(?:一次|首次)验收(?:通过|合格)率(?:须|应当|应|必须)?[:：]?(不低于|不少于|不小于|至少|>=|≥|达到|为)?(\d+(?:\.\d+)?)%/);
        const percent=rate&&Number(rate[3])>=0&&Number(rate[3])<=100?Number(rate[3]):null;
        if(!standard&&percent===null)continue;
        const packages=distinct([...text.matchAll(/(?:采购包[:：]?([\d一二三四五六七八九十]+)|第([\d一二三四五六七八九十]+)包)/g)].map(match=>match[1]||match[2]));
        if(packages.length>1||!packages.length&&unit.scope?.mixedPackages)continue;
        const body=text.replace(/^(?:采购包[:：]?[\d一二三四五六七八九十]+|第[\d一二三四五六七八九十]+包)[:：]/,'');
        const subject=body.match(/^([^，。；;|]{1,45}(?:公司|单位))(?=工程质量|施工质量|所有分项工程|分项工程)/)?.[1]||text.match(/(?:施工单位|供应商|投标人|承包人)[甲乙丙丁A-Z]?/)?.[0]||'按条款涉及主体核验';
        const submission=/提交|提供|附具/.test(text)&&/响应文件|投标文件|投标时|投标阶段|投标人.{0,12}(?:提交|提供)|既往|历史|已完工/.test(text)&&!/竣工后|竣工时|履约时|验收时|交付时/.test(text);
        const exempt=submission?/(?:无需|无须|不必|不要求|免于)(?:.{0,12})(?:提交|提供)|免交/.test(text):/不适用|不涉及|无需满足|不要求(?:达到|满足)|不(?:承诺|保证)/.test(text);
        const conditional=!exempt&&/如(?:为|属|有|需|适用)|如果|仅当|适用时|若/.test(text);
        const stage=submission?'投标准备与资格审查':'履约验收',scope={...unit.scope,documentId:unit.document.id,package:packages[0]||unit.scope?.package||null,mixedPackages:false,phase:submission?'response':'fulfillment'};
        const comparison=percent===null?null:/不低于|不少于|不小于|至少|>=|≥/.test(rate[2]||'')?'>=':rate[2]==='达到'?'达到':'=';
        const fields={'要求正文':quote,'适用主体':subject,'适用阶段':stage,'质量条款用途':submission?'投标提交材料':'履约质量与验收','适用性':exempt?'明确无需／不涉及':conditional?'按条件或例外适用':'文件明确要求','证明材料':submission?submissionMaterials(text):[]};
        if(standard)fields['质量标准']='合格';
        if(percent!==null){fields['一次验收通过率数值']=percent;fields['一次验收通过率比较关系']=comparison;fields['验收范围']=rate[1];}
        if(scope.package)fields['采购包范围']=`采购包${scope.package}`;
        const targets=[standard?'工程质量合格':'',percent!==null?`${rate[1]}一次验收通过率${comparison==='>='?'不低于':comparison==='达到'?'达到':''}${percent}%`:''].filter(Boolean).join('；');
        const interpretation=exempt?(submission?'本条明确免交／无需提交所述质量材料；该免除不推定本项目履约质量不适用。':'本条明确不适用或免除所述质量要求；适用范围以本条原文为准。'):submission?`本条是投标提交质量证明材料要求，材料涉及${targets}；所述记录不直接证明本项目已经达到履约质量目标。`:`${conditional?'按原文条件适用：':''}本条履约验收要求为${targets}。这是质量目标，企业能否履行及实际验收结果仍待核验。`;
        const source={...unit,text:quote,fragments:[{text:quote,block:fragment.block}]};
        const item=synthesis(`${subject==='按条款涉及主体核验'?'':subject}质量标准与分项工程一次验收要求`,interpretation+'\n本条原文：'+clauseBody(quote),'按对应主体、采购包和阶段核验质量条件；不新增未列明的否决后果。',[submission?'按本条提交或免交路径核验真实材料及签署要求，勿将既往记录当作本项目履约结果。':'将质量标准和分项验收比例纳入实施与验收计划，核对适用条件及真实验收记录。'],[unitEvidence(source)]);
        result.push({...item,id:`analysis-quality-${hash(unit.document.id+':'+fragment.block.id+':'+quote)}`,quote,fields,subject,stage,scope,source:'derived',hard:false,conditional,applicability:exempt?'not-required':conditional?'conditional':'required',matchStatus:'pending',reviewed:false});
      }
    }
  }
  return result;
}
export function documentAnalysis(report,units) {
  const all=report.categories.flatMap(category=>category.items).filter(item=>item.source!=='ai'||item.reviewed===true);const overview=[],monetaryFacts=units.flatMap(moneyFacts);
  const briefDocuments=[...new Map(units.map(unit=>[unit.document.id,unit.document])).values()];
  const templateBlocks=new Set(briefDocuments.flatMap(doc=>[...referenceTemplateBlockIds(doc)].map(id=>`${doc.id}:${id}`)));
  const fromTemplate=item=>(item.references||[]).some(ref=>templateBlocks.has(`${ref.documentId}:${ref.blockId}`));
  const policySelections=units.filter(unit=>/本项目涉及(?:强制采购|优先采购|采购进口|核心|.*环境标志)|^本国产品采购包|^优先采购产品评审细则采购包/.test(readText(unit.text))&&/不涉及|\n无$/.test(readText(unit.text))).map(unit=>({...unitEvidence(unit),title:readText(unit.text).split(/采购包|不涉及|:|：/)[0],value:/不涉及/.test(readText(unit.text))?'不涉及':'无',scope:unit.scope}));
  const depositExclusions=units.filter(unit=>/履约保证金/.test(readText(unit.text))&&/不缴纳/.test(readText(unit.text)));
  const responseDepositExclusions=units.filter(unit=>/(?:投标(?:\(响应\))?|响应)保证金/.test(readText(unit.text))&&/不收取|不缴纳/.test(readText(unit.text)));
  for(const finding of all.filter(item=>item.categoryId==='deposit'&&collusionDepositCondition(item.quote))){
    const source=units.find(unit=>unit.fragments.some(fragment=>finding.references.some(ref=>ref.documentId===fragment.block.documentId&&ref.blockId===fragment.block.id&&(readText(fragment.text).includes(readText(ref.quote))||readText(ref.quote).includes(readText(fragment.text))))));
    const exemption=source&&responseDepositExclusions.find(unit=>scopeRelation(unit.scope,source.scope)==='same');
    if(!exemption)continue;
    finding.fields['保证金项目选项']=clauseBody(readText(exemption.text));
    finding.references=refsOf([finding,unitEvidence(exemption)]);
    finding.interpretation='同范围项目选项明确：'+clauseBody(readText(exemption.text))+'。'+finding.interpretation;
  }
  for(const finding of all.filter(item=>item.categoryId==='deposit'&&/没有提交履约保证金.*赔偿/.test(readText(item.quote)))){
    const source=units.find(unit=>unit.fragments.some(fragment=>finding.references.some(ref=>ref.documentId===fragment.block.documentId&&ref.blockId===fragment.block.id)));
    const exemption=depositExclusions.find(unit=>unit.scope?.documentId===source?.scope?.documentId&&unit.scope?.package===source?.scope?.package);
    if(!exemption)continue;
    finding.title='未缴履约保证金的损失赔偿责任';finding.interpretation='本包明确不缴纳履约保证金；验收通用条款仍规定未提交履约保证金时对采购人损失承担赔偿责任。不收保证金不能免除质量、维修和损失赔偿责任，不从通用退还条款新增缴款要求。';finding.hard=false;finding.stage='履约验收与赔偿';finding.applicability='conditional';finding.fields['适用阶段']=finding.stage;finding.fields['保证金项目选项']='履约保证金不缴纳';finding.fields['证明材料']=[];finding.references=refsOf([finding,unitEvidence(exemption)]);finding.actions=['报价和履约安排中考虑质量、维修及损失赔偿责任。'];
  }
  const initialConfirmation=units.filter(unit=>/修正后的报价/.test(readText(unit.text))&&/授权代表签字/.test(readText(unit.text)));
  const finalConfirmation=units.filter(unit=>/修正后的最后报价/.test(readText(unit.text))&&/电子印章/.test(readText(unit.text)));
  for(const finding of all){const t=readText(finding.quote);const isLast=/修正后的最后报价/.test(t),isInitial=/修正后的报价/.test(t)&&!isLast;if(!isLast&&!isInitial)continue;const confirmation=(isLast?finalConfirmation:initialConfirmation).find(unit=>unit.document.id===finding.references[0]?.documentId);if(!confirmation)continue;
    const rules=units.filter(unit=>unit.document.id===confirmation.document.id&&unit.block.page===confirmation.block.page&&/大写金额|小数点|单价汇总|依据单价/.test(readText(unit.text)));
    if(rules.length<2)continue;
    finding.fields['报价纠错阶段']=isLast?'last':'initial';
    finding.title=isLast?'最后报价纠错与电子确认':'首次清单纠错与确认';
    finding.interpretation=isLast?'最后报价按原文顺序修正：大小写不一致以大写为准，但大写文字错致金额无法判断除外；单价小数点或百分比明显错位，以总价为准修改单价；总价与单价汇总不一致，以单价汇总结果修正总价。多项同时不一致依次处理，交易系统加盖电子印章确认后有约束力，不确认则无效。':'首次已标价清单：大小写不一致以大写为准，大写文字错误应先澄清、说明或更正；总价与单价或费率计算不一致，以单价或费率修正总价，明显小数点错误除外。先书面要求供应商确认并由授权代表签字，再按另一处电子章执行口径核验；不确认才无效，不能省略书面反馈程序。';
    finding.references=refsOf([finding,unitEvidence(confirmation),...rules.map(unitEvidence)]);finding.actions=[isLast?'按最后报价独立顺序纠错，通过交易系统电子签章确认。':'对照首次清单修正，响应书面要求并授权代表签字；核对电子章执行口径。'];
  }
  const addOverview=(label,value,items)=>{if(value&&!overview.some(item=>item.label===label))overview.push({label,value,references:refsOf(items)});};
  for(const unit of units)for(const fragment of unit.fragments){const text=readText(fragment.text);const evidence={references:[{blockId:fragment.block.id,documentId:fragment.block.documentId,fileName:fragment.block.fileName,page:fragment.block.page,section:fragment.block.section,quote:fragment.text}]};
    const name=text.match(/(?:采购项目名称|项目名称)[:：]([^，。；;|]+?)(?=(?:采购)?项目编号|采购人[:：]|采购代理机构[:：]|$)/);if(name)addOverview('项目名称',name[1],[evidence]);
    const code=text.match(/(?:采购项目编号|项目编号)[:：]([A-Z\d-]{5,})/);if(code)addOverview('项目编号',code[1],[evidence]);
    const buyer=text.match(/采购人[:：]([^，。；;|]+?)(?=(?:采购)?代理机构[:：]|地址[:：]|邮编[:：]|联系人[:：]|联系电话[:：]|\d{4}年\d{1,2}月|$)/);if(buyer)addOverview('采购人',buyer[1],[evidence]);
    const agency=text.match(/(?:采购)?代理机构[:：]([^，。；;|]+?)(?=地址[:：]|邮编[:：]|联系人[:：]|联系电话[:：]|\d{4}年\d{1,2}月|$)/);if(agency)addOverview('代理机构',agency[1],[evidence]);
  }
  for(const finding of all){const text=readText(finding.quote);
    const name=text.match(/(?:采购项目名称|项目名称)[:：]([^，。；;|]{2,90})/);if(name)addOverview('项目名称',name[1],[finding]);

    if(finding.fields['采购方式'])addOverview('采购方式',finding.fields['采购方式'],[finding]);if(finding.fields['评审方法'])addOverview('评审方法',finding.fields['评审方法'],[finding]);
    if(/(?:开工令|工期|交货时间|交付期限).{0,45}\d+(?:日历)?(?:天|日)/.test(text))addOverview('工期／交付',text.replace(/^\d+\|★\|/,''),[finding]);
    if(finding.categoryId==='payment'&&/付款方式|验收.*支付|审计.*付/.test(text))addOverview('付款条件',text.replace(/^\d+\|★\|/,''),[finding]);
    if(/质保期|保修期/.test(text)&&/\d+年/.test(text))addOverview('质保／保修',text.replace(/^\d+\|★\|/,''),[finding]);
  }
  for(const fact of monetaryFacts)addOverview(fact.label,fact.value,[unitEvidence(fact.unit)]);
  // Compatibility alias is valid only when a single amount is evidenced, never when budget and cap differ.
  const amounts=distinct(monetaryFacts.map(fact=>fact.amount));if(amounts.length===1)addOverview('预算／最高限价',amounts[0].toFixed(2)+'元',monetaryFacts.map(fact=>unitEvidence(fact.unit)));

  for(const finding of all.filter(item=>item.fields['低价审查触发']?.some(value=>/最高限价65%/.test(value)))){
    const figure=unit=>{const t=readText(unit.text),match=t.match(/(?:最高限价|预算及控制价|预算及最高限价|控制价)(?:\((万元|亿元|元)\))?[为是:：|]*(?:人民币)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(万元|亿元|元)?/);return match&&(match[1]||match[3])?numericAmount(match[2]+(match[3]||match[1])):null;};
    const ownLimit=units.find(unit=>unit.scope?.documentId===finding.references[0]?.documentId&&(!finding.fields['采购包范围']||`采购包${unit.scope?.package}`===finding.fields['采购包范围'])&&figure(unit)!==null);
    const amount=ownLimit?figure(ownLimit):null;
    if(amount){finding.fields['低价阈值示例']=`仅最高限价分支：响应报价 < ${(amount*.65).toFixed(2)}元（${amount.toFixed(2)}×65%）；等于不触发此分支。`;finding.references=refsOf([finding,unitEvidence(ownLimit)]);}
  }
  const scoreFindings=all.filter(item=>item.categoryId==='scoring' && item.fields['满分'] && Number(item.fields['满分'])>0);
  const scoreMap=new Map();
  const unitForFinding=finding=>units.find(unit=>unit.fragments.some(fragment=>finding.references.some(ref=>ref.documentId===fragment.block.documentId&&ref.blockId===fragment.block.id&&ref.quote===fragment.text)));
  const scopeKey=scope=>JSON.stringify([scope.documentId,scope.package||null,scope.phase||'response',Boolean(scope.mixedPackages)]);
  const scopeOfFinding=finding=>unitForFinding(finding)?.scope||{documentId:finding.references[0]?.documentId,package:null,phase:'response'};
  for(const item of scoreFindings){
    const source=units.find(unit=>unit.score?.title===item.title&&unit.fragments.some(fragment=>item.references.some(ref=>ref.documentId===fragment.block.documentId&&ref.blockId===fragment.block.id&&ref.quote===fragment.text)));
    const score=source?.score;const scope=source?.scope||scopeOfFinding(item);const maxScore=Number(item.fields['满分']);const group=score?.group||groupName(item.title)||(/业绩|组价|资信/.test(item.title)?'商务':'技术');
    const standard=item.fields['计分标准']||item.quote;const key=JSON.stringify([scopeKey(scope),group,item.title,maxScore,readText(score?.standard||standard)]);
    if(!scoreMap.has(key))scoreMap.set(key,{id:item.id,title:item.title,group,maxScore,standard,readableStandard:score?.readableStandard,materials:item.fields['证明材料']||[],references:item.references,scope:{...scope},package:scope.package||null,...(score?.scopeWarning?{scopeWarning:score.scopeWarning}:{})});
    else {const previous=scoreMap.get(key);previous.references=refsOf([previous,item]);previous.materials=distinct([...previous.materials,...(item.fields['证明材料']||[])]);}
  }
  const items=[...scoreMap.values()];const expectedByScope=new Map();const expectedEvidence=new Map();
  const scopes=new Map();for(const item of items)scopes.set(scopeKey(item.scope),item.scope);
  for(const unit of units){const text=readText(unit.text);for(const match of text.matchAll(/(技术|商务|价格|报价|附加)(?:部分|评分|得分|分)?[：:|]*(\d+(?:\.\d+)?)分/g)){const name=groupName(match[1]);if(!name)continue;const key=scopeKey(unit.scope);scopes.set(key,unit.scope);if(!expectedByScope.has(key))expectedByScope.set(key,new Map());const expected=expectedByScope.get(key);if(!expected.has(name))expected.set(name,new Set());expected.get(name).add(Number(match[2]));if(!expectedEvidence.has(key))expectedEvidence.set(key,[]);expectedEvidence.get(key).push(unitEvidence(unit));}}
  const unboundedScores=all.filter(item=>item.categoryId==='scoring'&&!item.fields['满分']&&/(?:加\d+(?:\.\d+)?分|每[^。；;]{0,50}\d+(?:\.\d+)?分)/.test(readText(item.quote))&&!/分值构成/.test(readText(item.quote)));
  const mismatches=[];
  const packages=[...scopes].map(([key,scope])=>{
    const ownItems=items.filter(item=>scopeKey(item.scope)===key);const expected=expectedByScope.get(key)||new Map();
    const fileName=ownItems[0]?.references[0]?.fileName||expectedEvidence.get(key)?.[0]?.references[0]?.fileName||'当前来源';const label=`${scope.package?`采购包${scope.package}`:'未明示分包'} · ${fileName}`;
    const ownGroups=['技术','商务','价格','附加'].filter(name=>ownItems.some(item=>item.group===name)||expected.has(name)).map(name=>({name,maxScore:ownItems.filter(item=>item.group===name).reduce((sum,item)=>sum+item.maxScore,0)}));
    const ownMismatches=ownGroups.filter(group=>expected.has(group.name)&&([...expected.get(group.name)].some(value=>Math.abs(value-group.maxScore)>0.0001)||expected.get(group.name).size>1));
    mismatches.push(...ownMismatches.map(group=>({...group,scope,label,expected:[...expected.get(group.name)]})));
    const unbounded=unboundedScores.filter(item=>scopeKey(scopeOfFinding(item))===key);
    const ownStatus=!ownItems.length?'仅有分组总分声明，未识别完整计分项，待核验':ownMismatches.length?'分项合计与文件分组声明不一致，可能有缺口，待核验':ownItems.some(item=>item.scopeWarning)?'评分封顶适用范围待澄清，当前按封顶保守列示，待核验':unbounded.length?'另有计分条款未绑定完整分值或封顶，合计仅为已确认分项，待核验':scope.mixedPackages?'本段涉及多个包，适用范围未明确，待核验':expected.size?'计分项与分组总分校验通过':'已提取计分项；文件未明确分组总分，待核验';
    return{package:scope.package||null,scope:{...scope},label,items:ownItems,groups:ownGroups,total:ownItems.length?ownItems.reduce((sum,item)=>sum+item.maxScore,0):null,status:ownStatus};
  });
  const multipleScopes=packages.length>1;
  const groups=packages.flatMap(pack=>pack.groups.map(group=>multipleScopes?{...group,package:pack.package,scope:pack.scope,label:pack.label}:group));
  const total=packages.length===1?packages[0].total:null;
  const status=!items.length?'未识别完整计分项，待核验':multipleScopes?`已按${packages.length}个采购包／来源分别整理，不跨包或来源合计；${packages.some(pack=>/待核验/.test(pack.status))?'部分范围仍待核验':'各自分组总分校验通过'}`:packages[0].status;
  if(items.length)addOverview('评分构成',multipleScopes?packages.map(pack=>`${pack.label}：${pack.groups.map(group=>`${group.name}已识别${group.maxScore}分`).join('／')}；${pack.total===null?'分项缺口待核验':`该范围合计${pack.total}分`}`).join('；'): `${groups.map(group=>`${group.name}${group.maxScore}分`).join('／')}；合计${total}分`,[...scoreFindings,...[...expectedEvidence.values()].flat()]);
  if(items.length&&packages.length===1){
    const tech=groups.find(group=>group.name==='技术')?.maxScore,price=groups.find(group=>group.name==='价格')?.maxScore,inside=items.filter(item=>item.group==='技术'&&/人员|主要材料/.test(item.title)).map(item=>`${/主要材料/.test(item.title)?'主材':'人员'}${item.maxScore}分已在技术组内部计入`);
    const extra=items.some(item=>item.group==='附加'),completeScore=/校验通过/.test(status)&&!unboundedScores.length;
    addOverview('预计分数口径（企业内部）',`技术${tech??'待核'}与报价${price??'待核'}、清单对应评分项满分仅为用户批注提出的内部预测假设，不是本企业实际得分；${inside.join('；')}。${extra?'独立附加只按本采购已列项核算。':completeScore?'本采购评分表未设独立附加5分；批注中的附加5分不适用于本包，不加入采购总分。':'当前未识别独立附加5分，完整评分范围待核验；不凭批注添加采购分值。'}商务及独立附加95%仅为单独的企业内部筛选提示，不单独否决投标，企业材料与人工估分仍须核验。`,scoreFindings);
    overview.at(-1).origin='user-rule';
  }
  const keyRequirements=distinct(all.filter(item=>item.hard&&(item.categoryId!=='rejection'||item.fields['实质性要求'])).map(item=>item.id)).map(id=>all.find(item=>item.id===id));
  const commercialRisks=[];const clarifications=[];const technical=[];const businessRequirements=[],commitmentDetails=[];
  const ambiguousScoreCaps=items.filter(item=>item.scopeWarning);
  if(ambiguousScoreCaps.length)clarifications.push(synthesis('认证子项与“本项”封顶范围待澄清',distinct(ambiguousScoreCaps.map(item=>item.scopeWarning)).join('；'),'封顶覆盖范围未确认，不据暂列分值确认企业得分或评分范围。',['核对正式评分表的共同父项、分别计分说明及有效澄清。'],ambiguousScoreCaps));
  for(const finding of all.filter(item=>item.categoryId==='consistency'&&item.fields['差异事项']))clarifications.push(synthesis(finding.title,finding.interpretation,'来源与适用范围尚未确定；不能把不同范围的数值差异作为已确认的企业否决条件。',['核对采购包、适用阶段、文件版本与有效更正关系；确认后再比较同一事项。'],[finding]));
  const excludedPolicy=all.filter(item=>item.categoryId==='eco'&&item.applicability==='not-required'&&/强制采购/.test(readText(item.quote)));
  const explicitPolicy=all.filter(item=>item.categoryId==='eco'&&item.applicability!=='not-required'&&item.fields['强制采购']?.startsWith('原文明确'));
  const findingScope=finding=>units.find(unit=>unit.fragments.some(fragment=>finding.references.some(ref=>ref.documentId===fragment.block.documentId&&ref.blockId===fragment.block.id&&ref.quote===fragment.text)))?.scope;
  const differences=[];const unknownScopes=[];
  for(const excluded of excludedPolicy)for(const explicit of explicitPolicy){const relation=scopeRelation(findingScope(excluded),findingScope(explicit));if(relation==='same')differences.push(excluded,explicit);else if(relation==='unknown')unknownScopes.push(excluded,explicit);}
  if(differences.length)clarifications.push(synthesis('强制采购适用范围表述差异','同一来源与采购包范围一处声明不涉及，另一处明确列有适用产品或要求。须核对产品范围、有效版本及澄清依据，不能用一处文字抹掉另一处。','强制采购是否适用尚有来源冲突；保留原要求，未澄清前不确定企业满足。',['核对两处原文及采购标的，取得有效澄清文件。'],differences));
  if(unknownScopes.length)clarifications.push(synthesis('强制采购来源与适用范围待核验','不同来源或未明确关联的范围分别出现不涉及和正向强采要求。没有适用包或有效版本关系，不能用主文免除附件要求，也不能认定两处必然冲突。','保留各处要求，适用范围或优先顺序待核验。',['确认各来源对应采购包、阶段及有效澄清关系。'],unknownScopes));
  const brief=buildDocumentBrief(briefDocuments,{scoringItems:items});
  const payment=[...all.filter(item=>item.categoryId==='payment'&&/验收|审计|支付|付款/.test(readText(item.quote))&&!fromTemplate(item)),...brief.paymentEvidence];
  const delivery=all.filter(item=>/开工令|工期|交货时间|交付期限/.test(readText(item.quote))&&!procurementProcedure(item.quote)&&!fromTemplate(item));
  const warranty=all.filter(item=>/质保期|保修期/.test(readText(item.quote))&&!procurementProcedure(item.quote)&&!fromTemplate(item));
  if(payment.length){
    const actualPayment=[...new Map(payment.filter(item=>/付款方式|验收.{0,40}(?:审计|付)|审计完成|审计.*验收.*(?:结算|支付)/.test(readText(item.quote))).map(item=>[`${item.references?.[0]?.documentId}:${readText(item.quote)}`,item])).values()];
    const paymentText=readText(actualPayment.map(item=>item.quote).join(' '));
    const once=paymentText.match(/一次性付审定金额的?(\d+(?:\.\d+)?%)/);
    const triggers=distinct(['验收合格','审计完成','发票'].filter(value=>paymentText.includes(value)));
    const exact=once&&triggers.includes('验收合格')&&triggers.includes('审计完成')?`工程竣工验收合格并且审计完成后，一次性支付审定金额${once[1]}；两条件同时满足。`:`文件列明：${paymentText}须按该原文保留付款条件、比例及期限。`;
    const progress=once&&!/预付款|进度款/.test(paymentText)?'当前付款正文无明示预付款和进度款；先支出施工成本并等待验收、审计及办理付款。':'';
    const hasAudit=/审计/.test(paymentText);
    const timing=/审计期限、付款周期执行国家相关标准/.test(paymentText)?'审计期限、付款周期按原文执行国家相关标准，本段无可计算的固定完成或到款天数。':hasAudit?'未明示的审计或到账天数不能推算。':'付款时点及条件按所引原文执行，不额外增加未列明的前置条件。';
    commercialRisks.push(synthesis('付款触发与履约资金占用',`${exact}${progress}${timing}${delivery.length?`工期与付款期限分别核对，不能直接将工期当成付款${hasAudit?'或审计':''}期限。`:''}履约支出与约定付款节点之间可能形成资金占用；没有真实成本和授信证据，不给确定垫资额。`,'履约支出与约定付款节点之间可能形成资金占用，企业资金能力待核验。',[`核对完整合同中的${hasAudit?'审计启动、完成、':''}付款期限${/发票|票据/.test(paymentText)?'及票据':''}条款。`,'结合真实成本、付款安排和授信测算现金流，确认能接受文件约定的付款条件。'],[...actualPayment,...delivery,...warranty]));
    if(payment.some(item=>/审计/.test(readText(item.quote))))clarifications.push(synthesis('审计与付款具体期限待确认','文件列有审计／验收等付款前提，不能据交付天数推定审计和付款必须同期完成；完整合同及补充约定仍需核对。当前未以没有原文依据的发票要求新增付款前提。','影响资金安排，不凭信息不足断言违法。',['获取完整合同，确认审计与付款期限、票据条款及责任。'],actualPayment));
  }
  const acceptance=units.filter(unit=>/委托采购代理机构验收|一次性验收|初验合格后提交复核|验收小组、监理单位、审计单位、供应商|完整的工程技术经济资料|工程保修书|出具履约验收报告/.test(readText(unit.text)));
  if(acceptance.length){const t=readText(acceptance.map(unit=>unit.text).join(' '));const chain=[];if(/委托采购代理机构/.test(t))chain.push('委托采购代理机构组织');if(/一次性验收/.test(t))chain.push('一次性验收');if(/初验合格后提交复核/.test(t))chain.push('项目部门初验合格后提交复核申请，达到条件后验收合同总金额100%');if(/验收小组、监理单位、审计单位、供应商/.test(t))chain.push('验收小组、监理、审计、供应商四方对照采购文件、响应、合同及承诺查验');if(/完整的工程技术经济资料/.test(t))chain.push('准备完整工程技术经济资料');if(/工程保修书/.test(t))chain.push('签署工程保修书');if(/出具履约验收报告/.test(t))chain.push('合格后采购人出具履约验收报告');commercialRisks.push(synthesis('履约验收程序与交付资料',`履约验收按以下链条执行：${chain.join('；')}。工程竣工验收合格后方可交付使用，投标时接受并计入工期成本，履约资料不一律当成投标当期已完成附件。`,'影响交付、回款前置条件及保修责任。',['编排验收与交付计划，安排技术经济资料、保修书和验收报告留档。'],acceptance.map(unitEvidence)));}
  const fees=units.filter(unit=>/代理服务费|公证费|律师见证费/.test(readText(unit.text))&&/计取|收取/.test(readText(unit.text)));
  for(const group of groupUnits(fees)){
    const feeText=readText(group.map(unit=>unit.text).join(' ')),service=feeText.match(/按成交金额的?(\d+(?:\.\d+)?)%计取[^。；;]{0,20}?不足(\d+)元/),witness=feeText.match(/(?:公证费|律师见证费)[^。；;]{0,50}?按成交金额的?(\d+(?:\.\d+)?)‰计取[^。；;]{0,20}?不足(\d+)元/);
    let description='成交供应商承担服务费用，按各自原文基数、比例和最低收费分别核算：'+group.map(unit=>clauseBody(readText(unit.semanticText||unit.text))).join('；'),evidence=group.map(unitEvidence);
    if(service&&witness){
      description=`代理服务费=max(成交金额×${service[1]}%,${service[2]}元)；公证／律师见证费=max(成交金额×${witness[1]}‰,${witness[2]}元)，成交供应商承担。`;
      const ownLimits=monetaryFacts.filter(fact=>fact.label==='最高限价'&&fact.scope?.documentId===group[0].scope?.documentId&&fact.scope?.package===group[0].scope?.package&&!fact.scope?.mixedPackages),caps=distinct(ownLimits.map(fact=>fact.amount));
      if(caps.length===1){const cap=caps[0],a=Math.max(cap*Number(service[1])/100,Number(service[2])),b=Math.max(cap*Number(witness[1])/1000,Number(witness[2]));description+=`仅以最高限价${cap.toFixed(2)}元作示例：分别${a.toFixed(2)}元和${b.toFixed(2)}元，合计${(a+b).toFixed(2)}元；实际以成交金额计算，不能当固定实际费用。`;evidence.push(...ownLimits.map(fact=>unitEvidence(fact.unit)));}
      else description+='本来源本采购包未明示唯一可用最高限价，限价基数待核验，暂只保留收费公式。';
    }
    commercialRisks.push({...synthesis('成交后服务费用与最低收费',description,'成交后成本应计入资金安排，服务费不是保证金。',['按真实成交金额核算各项最低收费和比例收费。','确认收取对象、支付时点及报价包含范围。'],evidence),scope:group[0].scope});
  }
  const site=units.filter(unit=>/现场/.test(readText(unit.text))&&/索赔|工期延长/.test(readText(unit.text)));
  if(site.length)commercialRisks.push(synthesis('现场条件与索赔／工期责任','所引条款要求了解现场情况，并限制因忽视、误解等原因产生的索赔或工期延长。未组织统一勘查不能等同无需了解现场。','报价和工期应覆盖适用现场责任；这里提出核对建议，不新增强制勘查证明。',['核对现场通行、施工组织及既有设施风险。','把文件规定的保险、恢复及现场费用计入相应报价责任。'],site.map(unitEvidence)));
  const submission=units.filter(unit=>/解密|数字证书|加密|电子印章/.test(readText(unit.text))&&/截止|规定时间|拒绝接收|无效/.test(readText(unit.text)));
  if(submission.length)commercialRisks.push(synthesis('电子递交与解密时限','按所引条款准备数字证书、客户端、签章、提交与解密；平台故障等例外按原文适用，不以提交成功替代解密完成。','未按适用流程或时限操作可能导致拒绝接收或响应无效。',['核对公告截止时间与平台解密时限。','核对证书一致性、电子签章和成功提交回执。'],submission.map(unitEvidence)));
  const engineering=units.some(unit=>/(?:工程类|采购工程|承担的工程|建筑业)/.test(readText(unit.text)));
  const domestic=units.filter(unit=>/本国产品/.test(readText(unit.text))&&/货物或服务|货物、服务/.test(readText(unit.text)));
  if(engineering&&domestic.length)clarifications.push(synthesis('本国产品政策适用范围待核验','项目正文存在工程属性，而所引本国产品条款写有货物或服务等适用范围。须核对本采购标的是否适用，不能直接将通用模板的优惠比例用于本工程报价。','政策适用有条件；不把价格扣除当成额外评分或确定优惠。',['结合采购标的、完整政策条款与有效澄清核对适用范围。'],domestic.map(unitEvidence)));
  for(const finding of all.filter(item=>!/^依原文整理|^提取评分标准/.test(item.interpretation)&&!report.warnings?.some(w=>w.code==='PDF_OVERLAPPING_TEXT'&&w.page===item.references?.[0]?.page)&& (item.stage==='合同履约'||!['entity','qualification','personnel','performance'].includes(item.categoryId)&&/技术及施工要求|荷载|锚固|结构|防水|施工保险/.test(readText(item.quote))))){if(technical.some(item=>item.references.some(ref=>ref.blockId===finding.references[0]?.blockId)))continue;technical.push(synthesis(finding.title,finding.interpretation,'工程实施、质量、安全或费用责任；分析建议不新增投标硬条件。',finding.actions,[finding]));}
  for(const unit of units){const text=readText(unit.text);if(report.warnings?.some(w=>w.code==='PDF_OVERLAPPING_TEXT'&&w.page===unit.block.page&&(!w.documentId||w.documentId===unit.document.id))||unit.score||unit.review||/资格(?:审查|条件|要求)|履行合同所必需|得\d+(?:\.\d+)?分|扣\d+(?:\.\d+)?分/.test(text+readText(unit.block.section))||!/施工|安装|工程|进场/.test(text)||!/保险|投保|保修书|安全方案|荷载|锚固|结构|植筋|免费恢复/.test(text)||technical.some(item=>item.references.some(ref=>ref.blockId===unit.block.id)))continue;technical.push(synthesis('施工与履约实施要求',`实施要求：${clauseBody(text)}。按原文核对实施责任与时点，不推定为投标时必须提交的承诺函。`,'影响工程实施、质量、安全或费用责任。',['核对责任主体、实施时点和费用承担；投标提交材料以文件另列要求为准。'],[unitEvidence(unit)]));}
  if(mismatches.length)clarifications.push(synthesis('评分分组与分项合计不一致',mismatches.map(group=>`${multipleScopes?`${group.label}：`:''}${group.name}已识别${group.maxScore}分，文件声明${group.expected.join('／')}分`).join('；'),'可能有未读取评分行或文件差异，禁止自动配平。',['按相应采购包与来源核对原评分表、续页及有效澄清文件。'],[...scoreFindings,...[...expectedEvidence.values()].flat()]));
  const sourceScoreDifferences=items.filter(item=>items.some(other=>other.id!==item.id&&other.package===item.package&&other.group===item.group&&other.title===item.title&&other.scope.documentId!==item.scope.documentId&&(other.maxScore!==item.maxScore||readText(other.standard)!==readText(item.standard))));
  if(sourceScoreDifferences.length)clarifications.push(synthesis('同包评分来源与适用版本待核验','不同来源列有同包同名计分项，分值或标准有差异。已分别保留各自标准、材料和出处，尚不能认定主文或附件自动覆盖另一方。','适用版本与评分范围未澄清前，不跨来源相加或选取有利标准。',['核对各评分表的有效版本、采购包与补充更正关系。'],sourceScoreDifferences));
  if(unboundedScores.length)clarifications.push(synthesis('额外计分的完整分值与封顶待核验','所引条款有明确每项计分或附加计分，但未绑定完整满分或累计封顶。保留加分落实事项，合计不把单项奖励当作总分。','可能影响评分完整性；未知上限不自动配平或预测企业得分。',['核对完整评分表及附加计分的范围、累计和封顶规则。'],unboundedScores));
  const attachmentPresent=name=>units.some(other=>{
    const base=name.replace(/\.(?:docx?|pdf|xlsx?|txt)$/i,'');const text=readText(other.text);if(/详见附件|另附|见附件/.test(text))return false;
    if(other.document.id!==report.documentId&&readText(other.block.fileName).includes(base))return true;
    const body=text.replace(/^附件(?:[A-Za-z\d一二三四五六七八九十]+)?[:：、.]?/,'');return body.startsWith(base)&&body.length>base.length+12&&/供应商名称|单位名称|法定代表|甲方|乙方|签字|盖章|委托人|授权代表/.test(body.slice(base.length));
  });
  const attachmentGaps=new Map();
  for(const unit of units){const text=readText(unit.text);for(const match of text.matchAll(/(?:详见附件|见附件|另附|图纸详见)[:：]?([^。；;\n]{2,130})/g)){const name=match[1].replace(/(?:-?第\d+页-?)$/,'');if(attachmentPresent(name))continue;if(!attachmentGaps.has(name))attachmentGaps.set(name,[]);attachmentGaps.get(name).push(unitEvidence(unit));}}
  if(attachmentGaps.size){const names=[...attachmentGaps.keys()];clarifications.push(synthesis('附件或格式正文待取得','正文引用下列附件或格式，但当前未找到可明确对应的完整附件正文。此处列的是完整附件／格式核验缺口；主文件已经读取的工程项目、参数及表格仍保留，不推定工程量清单全部缺失。','未取得的完整模板、图纸或合同不能默认已经核验。',[`待核对完整正文或格式：${names.join('；')}。`,'确认完整采购下载包及所选关联附件；逐项对照主文件已有内容，补足确实缺少的格式、参数和合同约定。'],[...attachmentGaps.values()].flat()));}
  const drawingRefs=units.filter(unit=>/详见[^。；;]{0,35}图纸|图纸另附/.test(readText(unit.text)));
  if(drawingRefs.length&&!units.some(unit=>unit.block.role==='drawing'||unit.document.id!==report.documentId&&/图纸|施工图/.test(readText(unit.block.fileName)))&&![...attachmentGaps.keys()].some(name=>/图纸/.test(name)))clarifications.push(synthesis('施工图纸实际内容待核验','正文引用了图纸，当前文本未找到可明确对应的图纸内容；文字清单不能替代图纸，PDF图形是否已随原件提供需人工确认。','细部做法、尺寸与施工范围可能需要图纸才能核实。',['检查完整下载包及原PDF图形，补充实际图纸后核对工程量与做法。'],drawingRefs.map(unitEvidence)));
  for(const warning of report.warnings||[]){if(warning.code!=='PDF_OVERLAPPING_TEXT')continue;const affected=units.filter(unit=>unit.block.page===warning.page&&(!warning.documentId||unit.document.id===warning.documentId));if(affected.length)clarifications.push(synthesis('源PDF文字叠印与表格可读性缺口',`第${warning.page}页提取器检测到文字叠印或交叠表格，当前源PDF清晰正式版待取得；保留可读取文字不能证明清单、服务条款及数值行列对应已可靠恢复。不能仅修提取文本宣称源缺陷已解决。`,'影响报价完整性及条款对应，须对照原件和正式清晰版本。',['取得清晰正式PDF／独立清单并核对叠印处，保留提取warning与原页证据。'],affected.map(unitEvidence)));}
  const layer=units.filter(unit=>/\d+厚C\d+.*持钉层/.test(readText(unit.text)));
  const anchoring=units.filter(unit=>/钢筋头深入.*持钉层\d+mm|屋脊梁.*植筋深度/.test(readText(unit.text)));
  for(const first of layer){const linked=anchoring.filter(unit=>unit.document.id===first.document.id&&unit.scope?.package===first.scope?.package);if(!linked.length)continue;const t=readText([first,...linked].map(unit=>unit.text).join(' '));const thickness=t.match(/(\d+厚C\d+)[^。；;]{0,25}?持钉层/)?.[1];const plate=t.match(/钢筋头深入[^。；;]{0,25}?持钉层(\d+)mm/)?.[1];const ridge=t.match(/屋脊梁[^。；;]{0,20}?植筋深度为?(\d+)mm/)?.[1];clarifications.push(synthesis('持钉层与植筋锚固节点待澄清',`原文列${thickness||'所述'}持钉层${plate?`，楼板处钢筋头深入持钉层${plate}mm`:''}${ridge?`，屋脊梁处植筋深度${ridge}mm`:''}。这些尺寸涉及不同位置和节点，应取得节点施工图与设计说明核对锚入位置、厚度及连接做法，当前不能仅凭数字差异直接认定矛盾或擅自改尺寸。`,'关系结构连接、荷载、安全和施工报价，必须按节点图及设计澄清落实。',['取得节点图及设计说明，确认楼板与屋脊梁位置、植筋和网片连接。'],[first,...linked].map(unitEvidence)));}
  const decisionAuth=units.filter(unit=>/采购单位授权评标委员会.*确定.*供应商/.test(readText(unit.text)));
  for(const unit of decisionAuth){const buyer=units.filter(other=>other.document.id===unit.document.id&&other.block.page===unit.block.page&&/采购人应当.*候选人名单中按顺序确定/.test(readText(other.text)));if(buyer.length)clarifications.push(synthesis('定标主体并列表述待确认','同页既有采购单位授权评标委员会确定中标／成交供应商，又有采购人按磋商报告候选顺序确定成交人的表述；应正式确认本项目实际确定主体和授权范围。当前不直接认定评定分离或自行选择一条覆盖另一条。','影响结果确定及授权理解，不作为企业已经触发的废标事实。',['核对有效采购澄清、授权与定标流程。'],[unit,...buyer].map(unitEvidence)));}
  const initial=units.filter(unit=>/授权代表签字/.test(readText(unit.text))&&/修正|报价/.test(readText(unit.text)));
  const electronic=units.filter(unit=>/修正后的报价.*电子印章|修正后的报价.*电子章/.test(readText(unit.text)));
  for(const first of initial){const linked=electronic.filter(unit=>unit.document.id===first.document.id);if(linked.length)clarifications.push(synthesis('首次报价修正确认形式待确认','首次已标价清单纠错须先书面要求确认，并由授权代表签字确认；另处要求交易系统电子章。两处形式应按正式执行口径核验，不能省略反馈程序直接判无效。最后报价采用独立的顺序纠错与交易系统电子签章规则，不与首次顺序混用。','影响报价修正有效性及响应操作。',['确认首次修正书面签字与电子章的并行／具体提交口径。','最后报价按其独立顺序纠错后电子签章确认。'],[first,...linked].map(unitEvidence)));}
  const preparation=[];
  for(const finding of all.filter(item=>item.fields?.['投标提交要求']))preparation.push({...finding,title:/装订/.test(finding.quote)?'纸本正本、合订与装订要求':/拒收/.test(finding.quote)?'投标文件密封标记与拒收条件':'投标文件封套内容与密封章'});
  const acquisition=units.filter(unit=>/未按规定获取磋商文件.*不得参与/.test(readText(unit.text)));
  if(acquisition.length)preparation.push({...synthesis('文件获取与公告时限','需要按规定通过交易系统获取磋商文件并留获取回执；未按规定获取不得参与。获取、递交截止、开启具体时间指向采购公告，当前文件不能确认项目状态和日时。','可能影响参与资格与递交。',['核对正式公告、下载包及有效澄清，保存获取回执与递交回执。'],acquisition.map(unitEvidence)),categoryId:'rejection',hard:true,stage:'投标准备与资格审查',applicability:'required',matchStatus:'pending'});
  const methodDetails=[];
  const evaluated=units.filter(unit=>/综合评分法|推荐3名|推荐成交候选供应商|得分相同|最后报价相同|技术指标/.test(readText(unit.text))&&!unit.score&&/综合评分|候选|推荐/.test(readText(unit.text)));
  if(evaluated.length){const candidateCounts=units.filter((unit,index)=>/采购包[\d一二三]+[:：]\d+名/.test(readText(unit.text))&&units.slice(Math.max(0,index-2),index).some(previous=>previous.document.id===unit.document.id&&/推荐成交候选供应商/.test(readText(previous.text))));evaluated.push(...candidateCounts);const t=readText(evaluated.map(unit=>unit.text).join(' '));const conditions=['资格与符合性先审查，再按最终响应和最后报价评分'];if(/综合评分法/.test(t))conditions.push('采用综合评分法');if(/推荐3名|推荐三名|推荐.*3.*候选|采购包[\d一二三]+[:：]3名/.test(t))conditions.push('按得分推荐3名候选');if(/得分相同.*最后报价|评审得分相同.*报价/.test(t))conditions.push('同分按最后报价低者优先');if(/技术指标/.test(t))conditions.push('最后报价仍同按技术指标得分排序');methodDetails.push({...synthesis('评审方法 候选推荐及同分顺序',conditions.join('；')+'。实际确定成交主体与授权另核原文并列表述，不能直接认定最低价成交或评定分离。','资格前置且最终评审不等于本地测算。',['按最终需求与最后报价准备响应，并核对推荐和定标口径。'],evaluated.map(unitEvidence)),categoryId:'method'});}
  const finalCounts=units.filter(unit=>/提交最后报价的供应商不得少于3家|提交最后报价的供应商可以为2家/.test(readText(unit.text)));
  if(finalCounts.length)methodDetails.push({...synthesis('最后报价家数与采购整体规则','通常最后报价供应商不少于3家；原文特定情形可为2家，不预设本项目适用该例外。提交、解密或有效最后报价不足规定家数以及其他终止情形属于采购活动整体规则，不混为某一家供应商已废标。','影响磋商是否能继续及结果，企业操作后果仍单独判断。',['核对本项目是否有正式适用两家条件及具体报价限时。'],finalCounts.map(unitEvidence)),categoryId:'method'});
  const substantive=units.filter(unit=>/实质性变动/.test(readText(unit.text))&&/技术|合同|工程量清单|采购人代表|通知所有/.test(readText(unit.text)));
  for(const group of groupUnits(substantive))methodDetails.push({...synthesis('磋商实质变动与工程量清单边界','本范围的变动条件：'+group.map(unit=>clauseBody(readText(unit.semanticText||unit.text))).join('；')+'。允许与禁止内容各按本条限定，不以其他来源或采购包补入变动权限。','影响最终需求和响应版本。',['按本范围的允许、禁止和确认程序核对最终有效响应；未列通知程序不增补。'],group.map(unitEvidence)),categoryId:'method',scope:group[0].scope});
  const restricted=units.filter(unit=>/(?:不允许|允许|禁止|不得|严禁)[^。；;]{0,35}(?<!划)分包|(?:严禁|禁止|不得)[^。；;]{0,45}转包/.test(readText(unit.text)));
  for(const group of groupUnits(restricted)){
    const t=readText(group.map(unit=>unit.text).join(' ')),projectBan=/根据磋商文件.*拟在成交后/.test(t)?restricted.filter(unit=>unit.scope?.documentId===group[0].scope?.documentId&&unit.scope?.package===group[0].scope?.package&&!unit.scope?.mixedPackages&&/采购包[^。；;]{0,10}不允许分包/.test(readText(unit.text))):[];
    technical.push({...synthesis('分包与转包限制','本范围履约组织条款：'+group.map(unit=>clauseBody(readText(unit.semanticText||unit.text))).join('；')+'。分包与转包分别按原文判断，允许分包不解除禁止转包，其他采购包或阶段不能互替。'+(projectBan.length?'同来源同采购包另有明确不允许分包选项，该通用条件不能作为本包开放分包的依据。':''),'关系履约组织和责任，按对应采购包及阶段核验。',['分别核对分包条件与转包限制，按本范围编制施工组织及责任安排。'],[...group,...projectBan].map(unitEvidence)),scope:group[0].scope});
  }
  const mergedEngineeringRows=new Map();
  const engineer=units.filter(unit=>/工程概况|标高|新做瓦屋面|屋面防水工程|檐口|天窗|接闪带|接地母线|雨水口|垃圾|新做坡屋面荷载|抗风搭扣/.test(readText(unit.text))&&/m2|m3|平方米|标高|荷载|抗风搭扣|天窗|雨水口|接闪带|接地母线/.test(readText(unit.text)));
  if(engineer.length){
    const t=readText([...engineer,...layer,...anchoring].map(unit=>unit.text).join(' ')),notices=[];
    const roofArea=t.match(/改造屋面面积约(\d+(?:\.\d+)?)平方米/)?.[1],eavesArea=t.match(/改造檐口面积约(\d+(?:\.\d+)?)平方米/)?.[1];
    if(roofArea||eavesArea)notices.push([roofArea?'屋面改造约'+roofArea+'平方米':'',eavesArea?'檐口改造约'+eavesArea+'平方米':''].filter(Boolean).join('，'));
    const altitude=t.match(/标高范围为?([\d.]+[~～至-][\d.]+)/)?.[1];
    if(altitude)notices.push('标高'+altitude+'是标高表述，不能直接当已核离地作业高度');
    const slope=t.match(/坡度超过(\d+(?:\.\d+)?)[°度]/)?.[1];
    if(slope)notices.push('坡度超过'+slope+'度，瓦件机械固定并增设抗风搭扣');
    if(/新做坡屋面荷载不得超过原做法/.test(t))notices.push('新坡屋面荷载不得超过原做法');
    const nail=t.match(/(\d+厚C\d+)[^。；;|]{0,20}持钉层/);if(nail&&/双向钢筋网片/.test(t))notices.push(nail[1]+'细石混凝土持钉层、双向钢筋网片与屋面板植筋钢筋头可靠绑扎连接，节点位置和锚固尺寸仍核图纸');
    const upper=t.match(/上层防水层[^|]{0,90}?[:：](\d+(?:\.\d+)?)/)?.[1],lower=t.match(/下层防水层[^|]{0,90}?[:：](\d+(?:\.\d+)?)厚/)?.[1];
    if(upper&&lower&&/改性沥青防水卷材/.test(t)&&/水性橡胶沥青防水涂料/.test(t))notices.push('屋面防水上层'+upper+'厚弹性体改性沥青卷材，下层'+lower+'厚水性橡胶沥青涂料，按先后层次施工并完成防水试验；跨页做法以原文及图纸共同核对');
    const quantityUnits=units.filter(unit=>unit.cells?.length>=6&&/^\d{9,}$/.test(readText(unit.cells[1]))&&/^\d+(?:\.\d+)?$/.test(readText(unit.cells[5]))&&/^(?:m2|m3|m|座|组|系统)$/.test(readText(unit.cells[4])));
    const quantities=quantityUnits.map(unit=>{const merged=mergeWaterproofContinuation(unit,units);if(merged)mergedEngineeringRows.set(exactReferenceKey(merged.coveredReference),merged);return{name:readText(unit.cells[2]),quantity:readText(unit.cells[5]),unit:readText(unit.cells[4]),description:merged?.description||readText(unit.cells[3]),...(merged?{rawDescription:merged.rawDescription}:{}),references:merged?.references||unitEvidence(unit).references};});
    const item=synthesis('工程范围 数量与关键施工约束','按已有清单逐行复核本项目分项工程、材料及设备的数量和做法。'+(notices.length?notices.join('；')+'。':'')+'文字清单与图纸、清晰正式版的对应关系仍待核验。','数量和做法影响施工方案、成本、交付验收及安全责任。',['将清单数量与方案、主材明细和报价逐一对应；专项工艺、连接及检测要求按对应原文落实。'],[...engineer,...layer,...anchoring,...quantityUnits].map(unitEvidence));
    technical.unshift({...item,quantities});
  }
  const sameRange=(a,b)=>a?.documentId===b?.documentId&&a?.package===b?.package&&!a?.mixedPackages&&!b?.mixedPackages;
  const derived=(title,interpretation,actions,source,categoryId,fields={})=>{
    const evidence=source.map(unitEvidence),related=all.filter(item=>item.categoryId===categoryId&&item.references.some(ref=>evidence.some(other=>other.references.some(r=>r.documentId===ref.documentId&&r.blockId===ref.blockId&&readText(r.quote)===readText(ref.quote)))));
    return {...synthesis(title,interpretation,'按适用身份、阶段与完整原件核验；未取得企业证据时保持待核验。',actions,evidence),quote:source.map(unit=>unit.text).join('\n'),categoryId,scope:source[0]?.scope,source:'derived',hard:false,conditional:true,applicability:'conditional',matchStatus:'pending',reviewed:false,fields,sourceFindingIds:related.length?related.map(item=>item.id):evidence.map(item=>item.id),coversFindingIds:related.map(item=>item.id)};
  };
  const creditChecks=units.filter(unit=>/开启结束后/.test(readText(unit.text))&&/采购人|代理机构/.test(readText(unit.text))&&/信用记录/.test(readText(unit.text)));
  for(const group of groupUnits(creditChecks))businessRequirements.push(derived('采购方信用查验渠道 名单与时点','采购方独立查验：'+group.map(unit=>clauseBody(readText(unit.text))).join('；')+'供应商自交承诺及截图另按资格材料条款准备，两者不能互替。',['在递交前核对所列名单及记录时点，保存供应商自交资料；采购方开启后的查询不替代自交材料。'],group,'qualification'));
  const discounts=units.filter(unit=>/小型|小、微|小微|微型/.test(readText(unit.text))&&/扣除/.test(readText(unit.text))&&/\d+(?:\.\d+)?%/.test(readText(unit.text))&&!unit.score&&!/本国产品/.test(readText(unit.text)));
  for(const group of groupUnits(discounts)){
    const t=readText(group.map(unit=>unit.semanticText||unit.text).join(' ')),rates=distinct((t.match(/\d+(?:\.\d+)?%/g)||[]).map(value=>Number(value.replace('%',''))+'%'));
    const industry=units.filter(unit=>sameRange(unit.scope,group[0].scope)&&unit.cells&&(unit.block.tableHeaders||[]).some(header=>/所属行业/.test(readText(header))));
    const industries=distinct(industry.map(unit=>readText(unit.cells[(unit.block.tableHeaders||[]).findIndex(header=>/所属行业/.test(readText(header)))]))).filter(value=>value!=='所属行业'&&!/^(?:序号|标的名称|\{\{)/.test(value));
    const reserved=units.filter(unit=>sameRange(unit.scope,group[0].scope)&&/不属于专门面向中小企业/.test(readText(unit.text)));
    const noJoint=units.filter(unit=>sameRange(unit.scope,group[0].scope)&&/是否接受联合体/.test(readText(unit.text))&&/采购包[^。；;]{0,10}不接受/.test(readText(unit.text)));
    let explanation='本范围评审价格扣除：'+clauseBody(t)+`。扣除比例${rates.join('／')}用于评审价，非加分、非合同折价。`;
    if(industries.length)explanation+='声明所属行业按标的'+industries.join('、')+'填写。';if(reserved.length)explanation+='本包非专门面向中小企业采购，仍按所列政策身份与证明核对优惠。';if(!/中型/.test(t))explanation+='中型企业不因仅属中小企业自动享受本条小微扣除。';if(noJoint.length)explanation+='本包不接受联合体，优惠表中的联合体通用情形不能开放本包。';
    const materials=distinct(group.flatMap(unit=>readText(unit.text).match(/中小企业声明函|残疾人福利性单位声明函|监狱企业的证明文件|供应商应提交的相关证明材料/g)||[]));
    if(materials.length)explanation+='材料按真实身份准备：'+materials.join('、')+'，模板正文与证明真伪待核验。';
    const item=derived('评审价格扣除主体 比例与声明材料',explanation,['核对实际小微、监狱或残疾人福利性身份及声明证明；按文件行业口径填写，未核验不得确定企业优惠。'],[...group,...industry,...reserved,...noJoint],'qualification',{'政策属性':'评审价格扣除','扣除比例':rates,'证明材料':materials});businessRequirements.push(item);
    for(const price of all.filter(finding=>finding.fields?.['满分']&&/基准价|报价得分/.test(readText(finding.quote))&&sameRange(scopeOfFinding(finding),group[0].scope))){price.additionalRequirements=explanation;price.interpretation+='\n'+explanation;price.references=refsOf([price,item]);}
  }
  const ip=units.filter(unit=>!headingOnly(unit.text)&&/知识产权|知识成果|开发接口|开发手册/.test(readText(unit.text))&&!/详见附件/.test(readText(unit.text)));
  for(const group of groupUnits(ip)){
    const t=readText(group.map(unit=>unit.text).join(' ')),parts=[];
    if(/不会产生.*侵犯.*知识产权/.test(t))parts.push('使用的技术、产品和服务须保证不侵权；'+(/供应商承担所有相关责任/.test(t)?'供应商承担因此产生的法律和经济纠纷责任':'责任按本条限定')+(/赔偿/.test(t)?'，并赔偿由此给采购人带来的损失':'')+'。');
    if(/采购人享有.*知识成果及知识产权/.test(t))parts.push('采购人享有项目实施过程中产生的知识成果及知识产权。');
    const adopted=group.filter(unit=>/采用.*知识成果/.test(readText(unit.text)));if(adopted.length)parts.push('采用自有或第三方知识成果时：'+adopted.map(unit=>clauseBody(readText(unit.text))).join('；'));
    const legal=group.filter(unit=>/合法使用.*知识产权.*费用/.test(readText(unit.text)));if(legal.length)parts.push('使用不属于供应商的知识产权时：'+legal.map(unit=>clauseBody(readText(unit.text))).join('；'));
    if(parts.length){const item=derived('知识产权 不侵权责任及采用成果的条件承诺',parts.join(''),'核对实际采用的知识成果、权属和合法授权费用；满足触发条件时落实接口、手册与支持承诺，取得实际模板。'.split('；'),group,'commitment');businessRequirements.push(item);commitmentDetails.push(item);}
  }
  // Recover readable obligations from a table's actual full block; retain the source warning separately.
  const cleanBlock=block=>readText(block.text).replace(/\|/g,'').replace(/--|-第\d+页-/g,'');
  const constructionContexts=[...new Map(units.filter(unit=>/工程一切.*第三方责任险|非施工部位.*免费恢复|施工原因造成既有设施/.test(cleanBlock(unit.block))).map(unit=>[unit.document.id+':'+unit.block.id,{...unit,text:unit.block.text,fragments:[{text:unit.block.text,block:unit.block}],scope:{...unit.scope,phase:'fulfillment'}}])).values()];
  for(const group of groupUnits(constructionContexts)){
    const t=readText(group.map(unit=>cleanBlock(unit.block)).join(' ')),parts=[];
    if(/工程一切.*第三方责任险/.test(t)&&/供应商自行投保/.test(t))parts.push('工程一切风险和第三方责任险由供应商自行投保'+(/保险费由供应商承担并支付/.test(t)?'，保险费由供应商承担并支付':'')+(/不单独报价/.test(t)?'，不单独报价':'')+'。');
    if(/非施工部位.*免费恢复/.test(t))parts.push('对非施工部位造成的破坏应免费恢复原状，按施工造成的破坏核对恢复范围。');
    if(/施工原因造成既有设施损坏及恢复的费用由成交供应商承担/.test(t))parts.push('由于施工原因造成既有设施损坏及恢复的费用由成交供应商承担，不扩大为所有原因或全部已有损坏。');
    if(parts.length){const overlap=report.warnings?.some(w=>w.code==='PDF_OVERLAPPING_TEXT'&&group.some(unit=>unit.block.page===w.page&&(!w.documentId||unit.document.id===w.documentId)));const item=derived('施工保险与有条件恢复责任',parts.join('')+(overlap?'涉及叠印表格的行列与报价范围仍需清晰正式版核对，已读条款不代表整页可靠恢复。':'按所引责任及保险范围核验真实履约安排，不视为已完成。'),['将所列保险及施工导致的恢复费用纳入报价与实施安排；核对真实责任边界和保险保障。'],group,'payment');technical.push(item);businessRequirements.push(item);}
  }
  const materials=units.filter(unit=>/主要材料进场前/.test(readText(unit.text))&&/品牌产地|可溯源/.test(readText(unit.text)));
  for(const group of groupUnits(materials)){
    const scored=units.filter(unit=>sameRange(unit.scope,group[0].scope)&&unit.score&&/主要材料/.test(unit.score.title));
    let explanation='材料分两阶段落实：'+group.map(unit=>clauseBody(readText(unit.semanticText||unit.text))).join('；')+'；进场确认不能代替响应文件中品牌、产地及可溯源证明。';
    for(const unit of scored)explanation+=`主材属于${unit.score.group?unit.score.group+'组':'已识别评分项'}${unit.score.maxScore}分：`+clauseBody(readText(unit.score.standard))+'；在所属组内计一次，不另加到该组满分上。';
    const item=derived('主要材料响应信息与进场确认',explanation,['按实际拟用材料填品牌、产地、技术环保性能及可溯源证明；核对主材明细和进场确认，未提供企业产品材料时不虚构产品或确定得分。'],[...group,...scored],'sample');businessRequirements.push(item);technical.push(item);
    for(const source of scored){const finding=all.find(item=>item.id===scoreFindings.find(item=>item.title===source.score.title&&item.references.some(ref=>ref.blockId===source.block.id))?.id);if(finding){finding.additionalRequirements=explanation;finding.interpretation+='\n'+explanation;finding.references=refsOf([finding,item]);}}
  }
  for(const policy of policySelections.filter(item=>/核心产品|进口产品/.test(item.title)))addOverview(/核心/.test(policy.title)?'核心产品范围':'进口产品范围',policy.value,[policy]);
  const imports=units.filter(unit=>/不涉及采购进口产品时/.test(readText(unit.text))&&/不得提供进口产品/.test(readText(unit.text)));
  for(const group of groupUnits(imports)){
    const excluded=policySelections.filter(item=>sameRange(item.scope,group[0].scope)&&/进口产品/.test(item.title)&&item.value==='不涉及');
    const item=derived('进口产品适用范围与响应限制',(excluded.length?'本范围明确不涉及采购进口产品，供应商不得提供进口产品响应。':'按进口产品项目选项条件执行：')+group.map(unit=>clauseBody(readText(unit.text))).join('；'),['按采购包和产品真实产地核对进口响应边界；不自动套用本国产品优惠模板。'],group,'eco');item.references=refsOf([item,...excluded]);businessRequirements.push(item);
  }
  const last=units.filter(unit=>/最后报价/.test(readText(unit.block.section))&&!/修正|大写|小数点|单价汇总/.test(readText(unit.text))&&/提交后.*不得.*撤回|规定的时间内提交|法定名称.*电子印章|最后报价唯一.*最高限价|最后报价应符合磋商文件/.test(readText(unit.text)));
  for(const group of groupUnits(last))methodDetails.push({...derived('最后报价提交与不可撤回',group.map(unit=>clauseBody(readText(unit.text))).join('；')+'。提交电子签章与报价纠错后的电子确认分别落实，不能相互替代。',['在规定时间提交唯一且不高于限价的最后报价，以供应商法定名称电子印章签章；提交后按本条不得撤回。'],group,'method'),categoryId:'method'});
  // Keep validity and every star response as explicit commitment checklist entries with their existing citations.
  commitmentDetails.push(...all.filter(item=>!item.fields?.['附件目录属性']&&(/响应有效期/.test(readText(item.fields?.['要求正文']||item.quote))||item.fields?.['实质性要求'])));
  const conditionalFormats=units.filter(unit=>/中小企业声明函|监狱企业的证明文件|残疾人福利性单位声明函|其他服务承诺\(如有\)|磋商响应情况\(如有\)|供应商响应表/.test(readText(unit.text))&&(/详见附件/.test(readText(unit.text))||/评审|符合性|磋商/.test(readText(unit.block.section))));
  for(const group of groupUnits(conditionalFormats)){
    const t=readText(group.map(unit=>unit.text).join(' ')),routes=[];
    if(/中小企业声明函/.test(t))routes.push('中小企业声明函按实际企业规模、行业及申请政策身份填写，不因本包非专门面向中小企业就免去适用优惠证明');
    if(/监狱企业的证明文件/.test(t))routes.push('按监狱企业身份申请视同小微政策时，准备监狱企业的证明文件');
    if(/残疾人福利性单位声明函/.test(t))routes.push('按残疾人福利性单位身份申请政策时，准备残疾人福利性单位声明函及相关证明');
    if(/供应商响应表/.test(t))routes.push('磋商中变更响应内容时在线提交供应商响应表，作为响应文件一部分，加盖供应商（法定名称）电子印章，否则无效');
    if(/磋商响应情况\(如有\)/.test(t))routes.push('磋商响应情况按“如有”在实际发生磋商响应时准备');
    if(/其他服务承诺\(如有\)/.test(t))routes.push('其他服务承诺按“如有”及实际服务承诺准备，不变成每家无条件必交');
    if(routes.length)commitmentDetails.push(derived('条件性声明及磋商响应材料路径',routes.join('；')+'。目录仅确认名称，完整模板、签署落款及证明真伪待取得原件核验。',['按实际主体身份和阶段选择材料路径；取得对应模板正文，核对签章与提交要求。'],group,'commitment',{'条件材料路径':routes}));
  }
  const activitySelections=units.filter(unit=>unit.cells&&/是否(?:组织.*现场考察|召开.*答疑)/.test(readText(unit.title||''))&&/不组织/.test(readText(unit.semanticText||unit.text))&&!obligationParts(unit.semanticText||unit.text).positive.length);
  for(const group of groupUnits(activitySelections)){
    const t=readText(group.map(unit=>unit.semanticText||unit.text).join(' ')),names=[];
    if(/现场考察/.test(t))names.push('统一现场考察');if(/标前答疑/.test(t))names.push('标前答疑');if(!names.length)continue;
    const item=derived('现场考察与标前答疑安排','本范围不组织'+names.join('、')+'。活动安排不替代独立的现场了解与索赔延期责任，按所引现场条款分别核对。',['核对有效补充文件是否改变活动安排；现场了解责任另见真实现场条款。'],group,'survey');
    businessRequirements.push({...item,applicability:'not-required',conditional:false});
  }
  const onsite=[...new Map(units.filter(unit=>/施工现场/.test(cleanBlock(unit.block))&&/索赔或工期延长.*不获批准/.test(cleanBlock(unit.block))).map(unit=>[unit.document.id+':'+unit.block.id,{...unit,text:unit.block.text,fragments:[{text:unit.block.text,block:unit.block}],scope:{...unit.scope,phase:'fulfillment'}}])).values()];
  for(const group of groupUnits(onsite))businessRequirements.push(derived('自主了解现场与索赔延期后果','应充分了解施工现场具体位置、道路及其他足以影响报价的情况；任何忽视或误解施工现场情况而导致的索赔或工期延长申请将不获批准。自行了解现场属于报价准备，未在本条列强制踏勘证明，不新增该证明或无效门槛。',['核对现场条件并计入报价和工期；自主踏勘是否另有强制材料要求应独立查原文。'],group,'survey'));
  const names=units.filter(unit=>/供应商承诺函|投标人承诺函/.test(readText(unit.text))),placeholders=units.filter(unit=>/\{\{未填写\}\}/.test(readText(unit.text)));
  if(names.some(unit=>/供应商承诺函/.test(readText(unit.text)))&&names.some(unit=>/投标人承诺函/.test(readText(unit.text))))for(const group of groupUnits(names))clarifications.push(synthesis('承诺函名称与真实模板待核验','文件要求含“供应商承诺函”，另有目录或格式名称“投标人承诺函”；是否对应同一模板及签署主体须核实际下载格式，不能只凭名称相似宣布满足。',['按实际模板核验承诺事项、主体名称和签署落款。'].join(''),['取得并核对对应承诺模板及有效说明。'],group.map(unitEvidence)));
  if(placeholders.length)for(const group of groupUnits(placeholders))clarifications.push(synthesis('未填写占位与响应格式待核验','原文存在“{{未填写}}”占位，应取得实际格式和有效说明；占位本身不能推定另有未列明否决条件，也不能证明格式正文已经取得。','可能影响格式完整性和提交口径。',['核对占位所在审查行及实际下载格式，按真实明确要求提交。'],group.map(unitEvidence)));
  const documents=[...new Map(units.map(unit=>[unit.document.id,unit.document])).values()];
  for(const doc of documents){const pageGroups=new Map();for(const block of doc.blocks){if(!block.page)continue;if(!pageGroups.has(block.page))pageGroups.set(block.page,[]);pageGroups.get(block.page).push(block);}const blanks=[...pageGroups].filter(([,blocks])=>blocks.every(nonContentBlock));for(const [page,blocks] of blanks){const source={id:'blank-'+blocks[0].id,references:blocks.map(block=>({blockId:block.id,documentId:block.documentId,fileName:block.fileName,page:block.page,section:block.section,quote:block.text}))};clarifications.push(synthesis('仅页码页面与附件正文范围',`第${page}页仅有页码等非正文块，当前未定位正文，空白页不能当作已经取得附件或合同内容；其余附件指引、已读取部分清单和拟合同仍按实际来源范围核验。`,'保留附件与合同正文阅读边界。',['检查原PDF该页及完整下载包，核对是否为空白或另有内容。'],[source]));}}
  technical.push(...qualityRequirements(units,report.warnings));
  const readableTechnical=technical.filter(item=>{
    if(/^依原文整理|^提取评分标准/.test(item.interpretation)||/^实施要求:.*(?:-第\d+.*页-|\d{9,})/.test(readText(item.interpretation)))return false;
    if(item.title!=='施工与履约实施要求'||item.references.length!==1)return true;
    const merged=mergedEngineeringRows.get(exactReferenceKey(item.references[0]));if(!merged)return true;
    const keys=merged.references.map(exactReferenceKey);
    const completeEngineering=technical.some(other=>other.quantities?.some(row=>row.description===merged.description)&&keys.every(key=>other.references.some(ref=>exactReferenceKey(ref)===key)));
    const completeNodeReview=clarifications.some(other=>other.title==='持钉层与植筋锚固节点待澄清'&&keys.every(key=>other.references.some(ref=>exactReferenceKey(ref)===key)));
    return !(completeEngineering&&completeNodeReview);
  });
  const preferredLabels=new Set(brief.overview.map(fact=>fact.label));
  return {overview:[...brief.overview,...overview.filter(fact=>!preferredLabels.has(fact.label))],scoring:{items,groups,total,status,packages,...(brief.lowestPrice||{})},keyRequirements,commercialRisks,clarifications:[...brief.clarifications,...clarifications],technical:readableTechnical,preparation:[...brief.preparation,...preparation],policySelections,methodDetails:brief.lowestPrice?brief.methodDetails:methodDetails,businessRequirements:[...brief.businessRequirements,...businessRequirements],commitmentDetails};
}
