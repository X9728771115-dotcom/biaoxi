import {buildSuitabilityAssessment} from './suitability.js';
import {buildPricingAnalysis} from './pricing.js';
import { createHash, randomUUID } from 'node:crypto';
import { CATEGORIES } from './contracts.js';
import {buildCompanyAnalysis,hasConfirmedCompanyFacts} from './company-analysis.js';
import {DEFAULT_POLICY_PACKAGE,analyzeProcurementPolicy} from './procurement-policy.js';
import {inferProjectContext} from './project-context.js';
import {buildReportContent} from './report-content.js';
import {hasNonScoringMethod} from '../../public/score-summary.js';
import {analysisUnits, describeFinding, documentAnalysis, headingOnly, nonContentBlock, procurementProcedure, readText, scopeRelation, linkedStarConsequences} from './analysis.js';

// Local, deterministic clause candidates. No network client or language model is used.
const RULES = {
  entity: /营业执照|经营范围|主体资格|统一社会信用代码|法人登记|独立承担民事责任/,
  qualification: /资质|资格|许可|联合体|信用记录|纳税|质量管理体系|ISO\s*9001|制造商授权|代理商授权/i,
  scoring: /评分|得分|计分|加分|扣分|每[^，,；;。\n]{0,30}\d+(?:\.\d+)?\s*分(?!钟)|加\s*\d+(?:\.\d+)?\s*分|扣\s*\d+(?:\.\d+)?\s*分|不得分|(?:商务|技术|价格|报价|附加)\s*\d+\s*分|(?:商务|技术|报价|价格|附加)分|评审分值/,
  rejection: /否决|投标无效|无效投标|响应无效|无效响应|响应文件.{0,20}无效|废标|不予受理|拒绝接收|拒收|资格审查不合格|实质性|最高限价|装订要求|封套(?:需|应|上|的)|投标文件.{0,15}(?:装订|密封|封口)/,
  payment: /付款|支付|预付款|进度款|验收款|尾款|质保金|票据|发票|结算|代理服务费|公证费|见证费/,
  method: /采购方式|评审方式|评审方法|定标|公开招标|邀请招标|竞争性磋商|竞争性谈判|询价|综合评分法|最低评标价|评定分离|中标候选|推荐顺序/,
  survey: /踏勘|勘查|勘察|现场考察|现场查看/,
  sample: /样品|送样|封样|样本演示|现场演示/,
  performance: /业绩|类似项目|同类项目|同类.{0,8}(?:供货|交付)|合同金额|验收证明|业主证明/,
  personnel: /人员|负责人|项目经理|建造师|关键岗位|社保|职称|劳动关系|劳动合同|职业证书|资格证书|交付经验/,
  deposit: /投标保证金|履约保证金|保证金|保函|递交账户|到账/,
  eco: /节能|环保|环境标志|强制采购|优先采购|品目清单/,
  consistency: /前后.{0,4}(?:不一致|冲突)|条款冲突|参数矛盾|时间冲突|金额不一致|表述模糊|以.{0,30}为准|更正|澄清|补充通知/,
  commitment: /承诺|声明函|声明书|资格声明|无重大违法|真实性声明/
};
const SCORE = /评分|得分|计分|加分|扣分|每[^，,；;。\n]{0,30}\d+(?:\.\d+)?\s*分(?!钟)|加\s*\d+(?:\.\d+)?\s*分|扣\s*\d+(?:\.\d+)?\s*分|不得分|[商务技术报价价格附加]{2,4}\s*\d+\s*分|(?:商务|技术|报价|价格|附加)分/;
const CONDITIONS = /如果|如(?:由|为|属|有|需|适用|采用|提供|参加)|若|当.{1,35}时|除外|除.{1,35}外|否则|仅限|以.{1,40}为准/;
const STATUSES = new Set(['pending', 'met', 'unmet', 'not-applicable']);
const MAT = /营业执照|主体资格证明|资质证书|资格证书|认证证书|许可证|合同(?:复印件)?|验收(?:证明|报告|材料)|业主证明|纳税(?:证明|材料)|社保(?:证明|材料)|劳动(?:关系证明|合同)|检测报告|授权(?:委托书|书)|承诺(?:函|书)|声明(?:函|书)|响应表|保函|发票|履历|服务方案|实施方案/g;
const TITLE = {
  entity: '主体与经营信息要求', qualification: '资格与资质条款', scoring: '评分标准与材料',
  rejection: '否决条件与审查要求', payment: '付款节点与条件', method: '采购评审与定标规则',
  survey: '现场勘查安排', sample: '样品提交与评分要求', performance: '业绩条件与证明',
  personnel: '人员配置与证明', deposit: '保证金提交与退还', eco: '节能环保适用要求',
  consistency: '版本与条款适用待核验', commitment: '承诺内容与签署要求'
};
const unique = values => [...new Set(values.filter(Boolean))];
const compact = value => String(value || '').replace(/\s+/g, '');
const stable = parts => createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 20);
const matches = (text, regex) => unique([...text.matchAll(regex)].map(match => match[0]));

function procurementPolicy(quote) {
  const clauses = quote.split(/[；;。\n]/).filter(clause => /强制采购/.test(clause));
  const negatives = clauses.filter(clause => /非强制|不(?:属于|是|要求|实行|执行).{0,15}强制采购|不强制采购/.test(clause));
  const positives = clauses.filter(clause => !negatives.includes(clause) &&
    !/应分别标注|不得混淆|(?:应|须)区分|是否|目录版本|关键词/.test(clause) &&
    !/(?:如|若|当|仅当)[^。；]{0,35}强制采购/.test(clause) &&
    /(?:属于|列为|实行|执行|采用).{0,12}强制采购|强制采购.{0,25}(?:须|必须|应提供|要求)|标[注明].{0,15}强制采购/.test(clause));
  return {explicit: positives.length > 0, negative: negatives.length > 0, mentioned: clauses.length > 0, positives};
}

function normalizeDocument(value, fallback) {
  const extraction = value?.extraction || value || {};
  const id = extraction.id || value?.id || fallback;
  const fileName = extraction.fileName || value?.fileName || '未命名文件';
  let blocks = Array.isArray(extraction.blocks) ? extraction.blocks : [];
  if (!blocks.length && Array.isArray(extraction.pages)) {
    blocks = extraction.pages.map((page, i) => ({ id: `${id}-page-${i + 1}`, text: page.text, page: page.number, section: '正文', kind: 'paragraph' }));
  }
  return {
    id, fileName, complete: extraction.complete !== false,
    warnings: Array.isArray(extraction.warnings) ? extraction.warnings : [],
    blocks: blocks.filter(block => typeof block.text === 'string' && block.text.trim()).map((block, i) => ({
      ...block, id: block.id || `${id}-block-${i + 1}`, documentId: id, fileName,
      page: Number.isInteger(block.page) && block.page > 0 ? block.page : null,
      section: block.section || (block.kind === 'table' ? `表格${i + 1}` : `段落${i + 1}`)
    }))
  };
}

function unitsFor(doc) {
  return analysisUnits(doc);
}

function classify(text, section = '') {
  text=readText(text); section=readText(section);
  if(headingOnly(text)) return [];
  if(procurementProcedure(text)) return ['method'];
  const ids = Object.entries(RULES).filter(([, regex]) => regex.test(text)).map(([id]) => id);
  if(/吊销营业执照/.test(text)&&!/提交.{0,30}营业执照|提供.{0,30}营业执照|营业执照.{0,15}(?:有效|复印件|扫描件)/.test(text)){const index=ids.indexOf('entity');if(index>=0)ids.splice(index,1);}
  const sectionText = section.replace(/第\d+段|段落\d+|正文/g, '');
  // A scoring heading supplies scope to its material/threshold rows.
  if (SCORE.test(sectionText) && /分|合同|证明|材料|每项|最高|标准|方案/.test(text)) ids.push('scoring');
  if (/资格/.test(sectionText) && /须|必须|应当|证明|证书|至少|不少于/.test(text)) ids.push('qualification');
  // Non-scoring technical tables are kept as parameter candidates, labelled explicitly.
  if (!ids.length && /采购需求|技术要求|技术参数/.test(section) && /参数|报告|不少于|不低于|规格|型号|\d+(?:kg|mm|厘米)/i.test(text)) ids.push('scoring');
  return unique(ids);
}

function consequence(text) {
  const withoutNegatedConsequences = text.replace(/(?:不作为|不构成|不导致|不视为|不属于|不会|不得|不能|不予)[^，,；;。\n]{0,25}(?:否决(?:投标)?|废标|投标无效|无效响应|响应无效|拒收)(?:条件|情形|理由|依据|要求)?/g, '');
  return /投标(?:将)?(?:被)?否决|予以否决|否决投标|投标无效|无效投标|响应无效|无效响应|响应文件.{0,20}(?:作为|作|按|视为).{0,6}无效|不予受理|拒绝接收|拒收|资格审查不合格|(?:导致|作|按|视为|予以)废标/.test(withoutNegatedConsequences);
}

function useFor(categoryId, quote, section) {
  const score = SCORE.test(quote) || SCORE.test(section);
  if (/资格(?:条件|要求)[：:]/.test(quote) && ['entity', 'qualification', 'performance', 'personnel'].includes(categoryId)) return score ? '资格要求；另含评分用途，须分别核验' : '资格要求';
  if (score && categoryId !== 'rejection') return '评分要求（不预测实际得分）';
  if (/资格(?:要求|条件|审查)|供应商须具备|投标人须具备/.test(`${section} ${quote}`) && ['entity', 'qualification', 'performance', 'personnel'].includes(categoryId)) return '资格要求';
  return ({entity: '主体证明要求', qualification: '资格与证明要求', scoring: '技术或商务要求（评分属性未明确）', rejection: '审查与否决条件', payment: '合同付款条件', method: '采购评审定标规则', survey: '现场安排', sample: '样品要求', performance: '业绩要求（用途需核验）', personnel: '人员与履约要求', deposit: '保证金要求', eco: '产品政策要求', consistency: '待澄清事项', commitment: '投标承诺与履约义务'})[categoryId];
}

function fieldsFor(categoryId, quote, section) {
  const fields = { '完整要求': quote, '用途': useFor(categoryId, quote, section) };
  const thresholds = matches(quote, /(?:不低于|不少于|不超过|至少|至多|最高|最低|不得高于|不早于|不晚于|超过)?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:万|亿|千)?(?:万元|亿元|元|%|％|分|天|日|年|个月|月|项|个|把|人|份|kg|mm|厘米|毫米|级)/gi);
  const materials = matches(quote, MAT);
  if (thresholds.length) fields['阈值与数量'] = thresholds;
  if (materials.length) fields['证明材料'] = materials;
  const logic = [];
  if (/且|同时|以及|及|全部|均须/.test(quote)) logic.push('且／同时：保留原文中并列条件的适用范围');
  if (/或|任一|任选|二选一/.test(quote)) logic.push('或／任选：不得改成全部必需');
  if (/除外|除.{1,35}外|无需|不要求/.test(quote)) logic.push('例外或免除：按原文核验适用条件');
  if (logic.length) fields['逻辑关系'] = logic;
  const negative = matches(quote, /(?:不接受|不得|无需|不要求|不作为|未提供|未提交|不低于|不少于|不超过|不早于|不晚于)[^，,；;。\n]{0,60}/g);
  if (negative.length) fields['否定与限定'] = negative;
  if (CONDITIONS.test(quote)) fields['条件与例外'] = quote;
  const dates = matches(quote, /\d{4}年\d{1,2}月(?:\d{1,2}日)?|\d{4}[-/]\d{1,2}[-/]\d{1,2}|近\s*(?:\d+|[一二三四五六七八九十]+)\s*年|最近(?:连续)?\s*\d+\s*个月/g);
  if (dates.length) fields['时间口径'] = dates;
  if (consequence(quote)) fields['不满足后果'] = '原文明示否决或审查失败；企业是否触发仍需事实核验';
  else if (/不得分|零分|0分|扣分/.test(quote)) fields['不满足后果'] = '按原文影响评分，不自动等同直接否决';
  else fields['不满足后果'] = '本段未明确直接否决后果，需结合审查表及引用条款核验';

  if (categoryId === 'scoring') {
    const scores = matches(quote, /(?:商务|技术|报价|价格|政策附加|附加)(?:分|评分)?\s*[：:]?\s*\d+(?:\.\d+)?\s*分/g);
    if (scores.length) fields['评分构成'] = scores;
    const max = quote.match(/(?:最高|最多|满分|上限|总分)[^，；。\n]{0,15}\d+(?:\.\d+)?\s*分/);
    if (max) fields['分值与封顶'] = max[0];
    if (/公式|÷|×|\*|最低有效报价/.test(quote)) fields['评分公式'] = quote;
    fields['得分边界'] = '仅提取文件标准；未知主观评审或其他报价，不计算企业实际得分';
  }
  if (categoryId === 'method') {
    const purchase = quote.match(/公开招标|邀请招标|竞争性磋商|竞争性谈判|询价|单一来源/);
    const review = quote.match(/综合评分法|最低评标价(?:法)?|综合评估法|经评审的最低投标价法/);
    if (purchase) fields['采购方式'] = purchase[0];
    if (review) fields['评审方法'] = review[0];
    if (/评定分离|确定中标|推荐顺序|中标候选/.test(quote)) fields['定标机制'] = quote;
  }
  if (categoryId === 'payment') fields['付款节点与触发条件'] = quote.split(/[；;。]/).filter(Boolean);
  if (categoryId === 'deposit') fields['保证金类型'] = /投标保证金/.test(quote) ? '投标保证金' : /履约保证金/.test(quote) ? '履约保证金' : '原文未明确类型，待核验';
  if (categoryId === 'survey') fields['是否强制勘查'] = /(?:无需|不要求|自愿|自行).{0,15}(?:踏勘|勘查)|不统一组织|不作为否决/.test(quote) ? '原文含自愿或免除表达，核验其适用范围' : /强制|必须|须参加/.test(quote) ? '原文明示参加要求，后果及例外仍需核验' : '未明确，待核验';
  if (categoryId === 'eco') {
    const policy = procurementPolicy(quote);
    fields['强制采购'] = policy.explicit ? `原文明确强制采购要求：${policy.positives.join('；')}。须核对指定产品范围${policy.negative ? '；另有非强制范围，分别核验' : ''}` : policy.negative ? '本段含非强制或否定强制要求；其他适用范围仍按原文核验' : policy.mentioned ? '仅出现强采标题、分类提示、条件或待核问题，具体产品适用范围待核验' : '本段未明确强制采购，不凭节能环保关键词推定';
    fields['政策属性'] = /优先采购/.test(quote) ? '含优先采购要求' : SCORE.test(quote) ? '含评分待遇，须与强制要求分开核验' : '按原文核验适用产品、认证及有效性';
  }
  if (categoryId === 'commitment') fields['签署与阶段'] = /签字|签署|盖章/.test(quote) ? quote : '需核对指定格式、签署主体、盖章与提交阶段';
  return fields;
}

function reference(unit) {
  return { blockId: unit.block.id, documentId: unit.block.documentId, fileName: unit.block.fileName, page: unit.block.page, section: unit.block.section, quote: unit.text };
}

function makeFinding(categoryId, units, source = 'offline') {
  const references = units.flatMap(unit => unit.fragments || [unit]).map(reference);
  const quote = unique(units.map(unit => unit.text)).join('\n');
  const section = units.map(unit => unit.block.section).join('；');
  const normalized=readText(quote);const normalizedSection=readText(section);
  const fields = fieldsFor(categoryId, normalized, normalizedSection);fields['完整要求']=quote;
  if(categoryId==='rejection'&&/装订|封套|密封|封口|加写标记/.test(normalized))fields['投标提交要求']='按原文逐项准备；只有明确拒收或无效后果才作为硬门槛';
  const scoreScoped = SCORE.test(normalizedSection) || SCORE.test(normalized);
  const explicitGate = normalized.split(/[；;。\n]/).some(clause => /资格(?:条件|要求)[：:]|不接受联合体投标|投标人须具备|供应商须具备/.test(clause) && /须|必须|至少|不少于|不得|不接受/.test(clause) && !/不要求|无需/.test(clause));
  const gate = explicitGate || (/资格(?:要求|条件|审查)/.test(normalizedSection) && /须|必须|至少|不少于|不得|不接受/.test(normalized) && !/不要求|无需/.test(normalized) && !scoreScoped);
  const hard = consequence(normalized) || (gate && ['entity', 'qualification', 'performance', 'personnel'].includes(categoryId));
  const policy = categoryId === 'eco' ? procurementPolicy(normalized) : {explicit: false, mentioned: false, negative: false};
  const finding = {
    id: `finding-${stable([categoryId, source, ...references.map(ref => `${ref.documentId}:${ref.blockId}:${ref.quote}`)])}`,
    categoryId, title: TITLE[categoryId], quote,
    interpretation: hard ? '原文含硬性审查条件；须结合企业实际资料核验，不以加分抵消。' : policy.explicit ? '保留强制采购适用范围及认证要求；未核实产品范围时仍待核验。' : scoreScoped ? '提取评分标准、条件与证明材料；不预测得分，不自动判断投标无效。' : '依原文整理要求、限定及例外；离线候选须对照来源核验。',
    fields, references, priority: hard ? 'hard' : policy.explicit ? 'policy' : policy.mentioned && !policy.negative ? 'pending' : 'normal',
    matchStatus: 'pending', source, hard, conditional: CONDITIONS.test(quote), reviewed: false, notes: []
  };
  Object.assign(finding,describeFinding(finding,units,units[0]?.analysisContext));
  const enumeration=categoryId==='rejection'&&units.find(unit=>unit.linkedEnumeration)?.linkedEnumeration;
  if(enumeration){finding.fields['关联枚举范围']=enumeration.range;finding.fields['关联主项编号']=enumeration.ordinals;if(enumeration.hasNested)finding.fields['枚举子项说明']='括号子项仅作为所属主项的定义上下文，不另当作同号主项或扩展被引用范围';if(enumeration.missing.length)finding.fields['未明确对应编号']=enumeration.missing;}
  if(!finding.hard&&finding.priority==='hard')finding.priority='normal';
  if(finding.fields['实质性要求']){
    const linked=linkedStarConsequences(units,units[0]?.analysisContext?.starConsequences||[]);
    const allRefs=[...finding.references,...linked.flatMap(unit=>unit.fragments||[unit]).map(reference)];
    finding.references=[...new Map(allRefs.map(ref=>[`${ref.documentId}:${ref.blockId}:${ref.quote}`,ref])).values()];
    if(linked.length)finding.fields['关联后果原文']=linked.map(unit=>unit.text);
  }
  if(finding.fields['关联审查后果']){
    const type=units.find(unit=>unit.review)?.review.type;
    const linked=(units[0]?.analysisContext?.reviewConsequences||[]).filter(unit=>unit.reviewConsequenceType===type&&unit.block.documentId===units[0].block.documentId);
    const allRefs=[...finding.references,...linked.flatMap(unit=>unit.fragments||[unit]).map(reference)];
    finding.references=[...new Map(allRefs.map(ref=>[`${ref.documentId}:${ref.blockId}:${ref.quote}`,ref])).values()];
    finding.fields['关联后果原文']=linked.map(unit=>unit.text);
  }
  if(finding.applicability==='not-required'){finding.priority='normal';finding.fields['不满足后果']='文件明确免除或不适用，不因未提交免除材料判失败。';}
  return finding;
}

function ordinalNumber(value){
  if(/^\d+$/.test(value))return Number(value);
  const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};let result=0;let current=0;
  for(const char of value){if(char in digits)current=digits[char];else if(char==='十'){result+=(current||1)*10;current=0;}else if(char==='百'){result+=(current||1)*100;current=0;}else return null;}
  return result+current;
}
function enumerationHeading(text){
  text=readText(text);if(/^\d+(?:\.\d+)+/.test(text))return null;
  const outer=text.match(/^([一二三四五六七八九十百零〇两\d]+)[、.]/);const inner=text.match(/^[（(]([一二三四五六七八九十百零〇两\d]+)[）)]/);const match=outer||inner;
  return match?{number:ordinalNumber(match[1]),style:outer?'outer':'parenthesized'}:null;
}
function referencedEnumeration(units,index){
  const current=units[index];const text=readText(current.text);
  const range=text.match(/(?:前述|上述)(?:第)?([一二三四五六七八九十百零〇两\d]+)(?:条|项)?(?:至|到|[-—~～])(?:第)?([一二三四五六七八九十百零〇两\d]+)(?:条|项)/);
  if(!range)return [];
  const first=ordinalNumber(range[1]);const last=ordinalNumber(range[2]);if(first===null||last===null||last<first)return [];
  const section=readText(current.block.section).replace(/\/第\d+页$/,'');let start=index;
  while(start>0){const previous=units[start-1];if(previous.block.documentId!==current.block.documentId||readText(previous.block.section).replace(/\/第\d+页$/,'')!==section)break;start--;}
  const candidates=units.slice(start,index).map((unit,i)=>({unit,index:start+i,heading:enumerationHeading(unit.text)}));
  const style=candidates.some(item=>item.heading?.style==='outer')?'outer':'parenthesized';
  let group=[];let prior=null;
  for(const item of candidates){if(item.heading?.style!==style)continue;if(prior!==null&&item.heading.number<=prior)group=[];group.push(item);prior=item.heading.number;}
  const selected=group.filter(item=>item.heading.number>=first&&item.heading.number<=last);if(!selected.length)return [];
  const result=[];let active=false;let hasNested=false;
  const beginning=group[0].index;
  for(const item of candidates.filter(item=>item.index>=beginning)){
    if(item.heading?.style===style)active=item.heading.number>=first&&item.heading.number<=last;
    if(active){result.push(item.unit);if(style==='outer'&&item.heading?.style==='parenthesized')hasNested=true;}
  }
  const ordinals=unique(selected.map(item=>String(item.heading.number)));const missing=[];
  for(let number=first;number<=last;number++)if(!ordinals.includes(String(number)))missing.push(String(number));
  current.linkedEnumeration={range:range[0],ordinals,hasNested,missing};return result;
}
function linkedUnits(units, index, categoryId) {
  const current = units[index]; const linked = [current];
  if(categoryId==='rejection'&&consequence(readText(current.text))&&/(?:以下|下列).{0,25}(?:情形|情况)|(?:以下|下列).{0,25}无效/.test(readText(current.text))){
    const embedded=[...readText(current.text).matchAll(/\((\d+)\)/g)];let expected=embedded.length?Number(embedded.at(-1)[1])+1:1;
    for(let j=index+1;j<units.length;j++){
      const next=units[j],heading=enumerationHeading(next.text);
      if(next.block.documentId!==current.block.documentId||next.block.section!==current.block.section||heading?.style!=='parenthesized'||heading.number!==expected)break;
      linked.push(next);next.consequenceParent=current;expected++;
    }
    if(linked.length>1)return linked;
  }
  if(categoryId==='rejection'&&/前述|上述/.test(readText(current.text))&&consequence(readText(current.text))){
    linked.unshift(...referencedEnumeration(units,index));
  }
  for (let j = index + 1; j < Math.min(index + 3, units.length); j++) {
    const next = units[j];
    if (next.block.documentId !== current.block.documentId) break;
    if (current.cells || next.cells || next.score) break;
    if (next.block.id !== current.block.id && next.block.section !== current.block.section) break;
    const ids = classify(next.text, next.block.section);
    if (!/^(?:须|应|必须|需|同时|并|其中|证明材料|材料|备注|注[：:]|未提供|未提交|除)/.test(next.text)) break;
    if (ids.length && !ids.includes(categoryId) && !/材料|证明|合同|验收/.test(next.text)) break;
    linked.push(next);
  }
  return linked;
}

function conflictProperties(unit) {
  const result = [];
  for (const clause of unit.text.split(/[；;。\n]/)) {
    const deadline = clause.match(/(投标截止时间|投标截止日期|投标截止|响应截止时间|响应文件递交截止时间)\s*(?:为|是|[：:])?\s*(\d{4}(?:年|[-/])\d{1,2}(?:月|[-/])\d{1,2}日?)\s*(\d{1,2}[：:]\d{2})?/);
    if (deadline) result.push({key: `递交截止:${/首次|第一轮/.test(clause) ? '首次' : /最终|最后|第二轮/.test(clause) ? '后续' : '默认'}`, value: `${deadline[2]}${deadline[3] || ''}`, topic: '投标或响应截止时间', unit});
    if (/支付|付款/.test(clause)) {
      const base = clause.match(/质保期满|验收(?:合格)?|合同生效|合同签订|收到发票|收到预付款/);
      const days = clause.match(/(\d+(?:\.\d+)?)\s*(日|天|个月|月)内/);
      const stage = /尾款/.test(clause) ? '尾款' : /预付款/.test(clause) ? '预付款' : /验收款/.test(clause) ? '验收款' : base?.[0] || '';
      if (base && days) result.push({key: `付款期限:${stage}:${base[0]}`, value: `${days[1]}${days[2]}`, topic: `${stage || '付款'}支付期限`, unit});
    }
    const delivery = clause.match(/(?:交货期|供货期|交付期限)[：:为是\s]*(\d+)\s*(天|日)/);
    if (delivery) result.push({key: '交货期限', value: `${delivery[1]}${delivery[2]}`, topic: '交货期限', unit});
    const warranty = clause.match(/质保期(?:为|是|[：:])?\s*(\d+)\s*(年|个月)/);
    const product = clause.match(/办公桌|办公椅|文件柜|沙发|会议桌|会议椅|书架|储物柜|[A-Za-z0-9]+型号/);
    if (warranty) result.push({key: `质保期限:${product?.[0] || '未指定产品'}`, value: `${warranty[1]}${warranty[2]}`, topic: `${product?.[0] || ''}质保期限`, unit});
    const money = clause.match(/(投标保证金|履约保证金|最高限价)[为是：:\s]*(\d+(?:\.\d+)?)\s*(万元|元)/);
    if (money) result.push({key: money[1], value: String(Number(money[2]) * (money[3] === '万元' ? 10000 : 1)), topic: money[1], unit});
  }
  return result;
}

function detectConflicts(units) {
  const buckets = new Map(); const results = []; const emitted = new Set();
  for (const property of units.flatMap(conflictProperties)) {
    const previous = buckets.get(property.key) || [];
    for (const other of previous) {
      if (other.value === property.value || other.unit.block.id === property.unit.block.id) continue;
      const relation=scopeRelation(other.unit.scope,property.unit.scope);
      if(relation==='different')continue;
      const pair = [other.unit.block.id, property.unit.block.id, property.key].sort().join(':');
      if (emitted.has(pair)) continue;
      emitted.add(pair);
      const finding = makeFinding('consistency', [other.unit, property.unit]);
      finding.title = `${property.topic}${relation==='unknown'?'来源与范围待核验':'表述差异（待核验）'}`;
      finding.interpretation = relation==='unknown'?'不同来源或未明确关联范围存在数值差异，尚不能确认两处互相冲突；先核对采购包、适用阶段、版本与更正依据，不自动采用一方。':'同一事项存在不同值；核对适用范围、版本和明确更正依据，不自动选择一方。';
      finding.fields = {[relation==='unknown'?'差异事项':'冲突事项']: property.topic, '两处数值': [other.value, property.value], '适用关系':relation==='unknown'?'来源或范围尚未明确，不确认冲突':'当前识别为同一来源与范围，仍需人工核验', '处理要求': '检查范围、计算基准及澄清更正；无明确依据保持待核验'};
      finding.hard = false; finding.priority = 'pending';
      results.push(finding);
    }
    previous.push(property); buckets.set(property.key, previous);
  }
  return results;
}

function attachEvidence(finding, evidenceDocs) {
  if (!['entity', 'qualification'].includes(finding.categoryId) || !evidenceDocs.length) return;
  const wanted = unique((finding.quote.match(/营业执照|ISO\s*9001|质量管理体系|资质证书|许可证|认证证书/gi) || []));
  const hits = evidenceDocs.flatMap(unitsFor).filter(unit => wanted.some(term => compact(unit.text).toUpperCase().includes(compact(term).toUpperCase())));
  finding.fields['证照比对'] = hits.length ? `本次证照中已找到相关材料：${unique(hits.map(unit => unit.block.fileName)).join('、')}。主体、等级及有效期仍需核验。` : '本次证照未能明确对应本条要求，保留待核验，不判不满足';
  if (hits.length) finding.references.push(...hits.slice(0, 8).map(reference));
  // Recognising a certificate name does not establish identity, validity or compliance.
  finding.matchStatus = 'pending';
}

function applyReview(finding, reviews) {
  const review = reviews?.[finding.id];
  const status = typeof review === 'string' ? review : review?.status || review?.matchStatus;
  if (!STATUSES.has(status)) return;
  finding.matchStatus = status;
  finding.reviewed = status !== 'pending';
  const note = typeof review?.note === 'string' ? review.note : typeof review?.notes === 'string' ? review.notes : '';
  finding.notes = note ? [note] : [];
}

function checkedAdditional(candidate, blockMap, warnings) {
  if (!candidate || !CATEGORIES.some(category => category.id === candidate.categoryId) || !Array.isArray(candidate.references) || !candidate.references.length) {
    warnings.push({code: 'FINDING_WITHOUT_SOURCE', message: '补充条款缺少有效分类或原文依据，未纳入报告。'}); return null;
  }
  const units = [];
  for (const ref of candidate.references) {
    const block = blockMap.get(`${ref.documentId}:${ref.blockId}`) || (!ref.documentId ? [...blockMap.values()].find(item => item.id === ref.blockId) : null);
    if (!block || !ref.quote || !compact(block.text).includes(compact(ref.quote))) {
      warnings.push({code: 'FINDING_SOURCE_MISMATCH', message: '补充条款与已选文件原文不一致，未纳入报告。'}); return null;
    }
    if(nonContentBlock(block)){warnings.push({code:'FINDING_NON_CONTENT_SOURCE',message:'补充条款引用的是已标记目录、页眉、页脚或页号，保留来源但不作为业务要求。'});return null;}
    // Resolve citation text to the original block; do not trust supplied page/file metadata.
    const quote = block.text.includes(ref.quote) ? ref.quote : block.text;
    units.push({text: quote, block});
  }
  const quoted = units.map(unit => compact(unit.text)).join('');
  if (candidate.quote && !quoted.includes(compact(candidate.quote))) {
    warnings.push({code: 'FINDING_SOURCE_MISMATCH', message: '补充条款引用不足以支持所述原文，未纳入报告。'}); return null;
  }
  const finding = makeFinding(candidate.categoryId, units, candidate.source === 'manual' ? 'manual' : 'ai');
  finding.title = typeof candidate.title === 'string' ? candidate.title.slice(0, 150) : finding.title;
  // Remote interpretations are retained as candidates, never as verified company facts.
  if (typeof candidate.interpretation === 'string') finding.fields['补充解读（待核验）'] = candidate.interpretation.slice(0, 2000);
  if (candidate.fields && typeof candidate.fields === 'object' && !Array.isArray(candidate.fields)) {
    for (const [key, value] of Object.entries(candidate.fields).slice(0, 30)) {
      const label = `AI候选·${key.slice(0, 80)}（待核验）`;
      if (typeof value === 'string') finding.fields[label] = value.slice(0, 4000);
      else if (Array.isArray(value)) finding.fields[label] = value.filter(item => typeof item === 'string').slice(0, 30).map(item => item.slice(0, 4000));
    }
  }
  finding.notes = ['补充原文引用已核对；模型字段与解读仍是候选，不代表企业事实已满足', ...(Array.isArray(candidate.notes) ? candidate.notes.filter(note => typeof note === 'string').slice(0, 10).map(note => note.slice(0, 2000)) : [])];
  return finding;
}

function embeddedAttachmentNames(units) {
  const names = new Set();
  units.forEach((unit, index) => {
    const heading = unit.text.normalize('NFKC').match(/^附件\s*([A-Za-z]|\d+|[一二三四五六七八九十]+)\s*(?:[：:、.]|\s|$)/);
    if (!heading || /另行上传|另行提供|另附|外部附件|未提供/.test(unit.text)) return;
    const ownBody = unit.text.slice(heading[0].length);
    const next = units[index + 1];
    const following = next && next.block.documentId === unit.block.documentId && !/^(?:附件|第[一二三四五六七八九十\d]+章)/.test(next.text) ? next.text : '';
    if (/须|应当|不得|无需|至少|不低于|不少于|\d+(?:mm|厘米|万元|元|日|年|把|件)|\d{4}[年\-/]|[|｜]/i.test(`${ownBody}\n${following}`)) names.add(`附件${heading[1]}`.toUpperCase());
  });
  return names;
}

/** Analyse only the current tender, its explicitly selected attachments and optional evidence. */
export function analyzeDocument(extraction, {attachments = [], evidence = [], reviews = {}, additionalFindings = [], companySnapshot = null, policyPackage = DEFAULT_POLICY_PACKAGE, projectContext = {}, analysisDate, procurementPolicy = null, policySnapshot = null} = {}) {
  const main = normalizeDocument(extraction, 'main');
  const docs = [main, ...attachments.map((item, i) => normalizeDocument(item, `attachment-${i + 1}`))];
  const evidenceDocs = evidence.map((item, i) => normalizeDocument(item, `evidence-${i + 1}`));
  const units = docs.flatMap(unitsFor);
  const reviewConsequences=units.filter(unit=>/资格审查|符合性审查/.test(readText(unit.text))&&/未满足|不合格|未通过/.test(readText(unit.text))&&consequence(readText(unit.text))&&!unit.cells);for(const unit of reviewConsequences)unit.reviewConsequenceType=/符合性审查/.test(readText(unit.text))?'conformity':'qualification';
  const analysisContext={starConsequences:units.filter(unit=>/标注.*★.*(?:实质性|无效)|★.*负偏离/.test(readText(unit.text))),policyExclusions:units.filter(unit=>/强制采购|优先采购|环境标志/.test(readText(unit.text))&&/不涉及/.test(readText(unit.text))),reviewConsequences};
  for(const unit of units)unit.analysisContext=analysisContext;
  const categories = CATEGORIES.map(item => ({...item, status: '未识别，待核验', items: []}));
  const byCategory = new Map(categories.map(item => [item.id, item]));
  const warnings = docs.flatMap(doc => doc.warnings.map(warning => typeof warning === 'string' ? {code: 'EXTRACTION_WARNING', message: warning, documentId: doc.id} : {...warning, documentId: doc.id}));
  const classified = new Set(); const seen = new Set();
  const add = finding => {
    if (seen.has(finding.id)) return;
    finding.references.forEach(ref => classified.add(`${ref.documentId}:${ref.blockId}`));
    seen.add(finding.id); attachEvidence(finding, evidenceDocs); applyReview(finding, reviews);
    byCategory.get(finding.categoryId).items.push(finding);
  };
  units.forEach((unit, i) => {
    if(unit.consequenceParent||unit.scoreRepeatOf)return;
    const ids = classify(unit.semanticText||unit.text, unit.block.section);
    if(unit.review&&!unit.score){const category=unit.review.type==='qualification'?'qualification':'rejection';if(!ids.includes(category))ids.push(category);}
    if(unit.score && !ids.includes('scoring'))ids.push('scoring');
    if(unit.cells && /★/.test(unit.text) && !/品目清单/.test(readText(unit.text))){if(!ids.includes('rejection'))ids.push('rejection');}
    if (ids.length) classified.add(`${unit.block.documentId}:${unit.block.id}`);
    ids.forEach(id => add(makeFinding(id, linkedUnits(units, i, id))));
  });
  detectConflicts(units).forEach(add);
  const blockMap = new Map(docs.flatMap(doc => doc.blocks.map(block => [`${block.documentId}:${block.id}`, block])));
  for (const candidate of additionalFindings) {
    const checked = checkedAdditional(candidate, blockMap, warnings);
    if (checked) add(checked);
  }
  if (!main.blocks.length) warnings.push({code: 'EMPTY_DOCUMENT', message: '主文件没有可分析正文；不能生成虚构条款或确定参与结论。'});
  for (const doc of docs.filter(doc => !doc.complete)) warnings.push({code: 'INCOMPLETE_EXTRACTION', documentId: doc.id, message: `${doc.fileName}存在无法读取或未完成的内容，分析覆盖不完整。`});
  const attachmentRefs = unique(units.flatMap(unit => matches(unit.text, /附件\s*(?:[A-Za-zＡ-Ｚａ-ｚ]|[0-9０-９]+|[一二三四五六七八九十]+)/g)).map(value => compact(value.normalize('NFKC')).toUpperCase()));
  const suppliedAttachments = docs.slice(1).map(doc => compact(`${doc.fileName} ${doc.blocks.map(block => block.text).join(' ')}`.normalize('NFKC')).toUpperCase());
  const embeddedAttachments = embeddedAttachmentNames(units);
  const missingAttachments = attachmentRefs.filter(name => !embeddedAttachments.has(name) && !suppliedAttachments.some(text => text.includes(name)));
  if (missingAttachments.length) warnings.push({code: 'ATTACHMENT_REFERENCE_PENDING', message: `原文引用${missingAttachments.join('、')}，所选附件尚未明确对应，相关规格及条件须核验。`});
  for (const category of categories) category.status = !category.items.length ? '未识别，待核验' : category.items.every(item => item.reviewed && item.matchStatus !== 'pending') ? '已人工核验' : '已提取，待核验';
  const unrecognizedBlocks = docs.flatMap(doc => doc.blocks).filter(block => !classified.has(`${block.documentId}:${block.id}`)).map(block => ({blockId: block.id, documentId: block.documentId, fileName: block.fileName, page: block.page, section: block.section}));
  const missingCategories = categories.filter(category => !category.items.length).map(category => category.title);
  const report = {
    id: randomUUID(), documentId: main.id, fileName: main.fileName, createdAt: new Date().toISOString(), mode: 'offline', analysisStatus: '待核验', categories,
    coverage: {
      documentCount: docs.length, blockCount: docs.reduce((sum, doc) => sum + doc.blocks.length, 0), classifiedBlocks: classified.size,
      unrecognizedBlocks, missingCategories, missingAttachments,
      embeddedAttachments: [...embeddedAttachments],
      complete: main.blocks.length > 0 && docs.every(doc => doc.complete) && !missingAttachments.length && !warnings.length,
      note: '已读取不等于语义已全面核验；未识别类别与未归类段落保留人工检查入口。'
    }, warnings
  };
  if(companySnapshot) report.companySnapshot=structuredClone(companySnapshot);
  report.projectContext=inferProjectContext([extraction,...attachments],projectContext);
  report.procurementPolicy=procurementPolicy?structuredClone(procurementPolicy):analyzeProcurementPolicy({documents:[{...extraction,role:'tender'},...attachments.map(doc=>({...doc,role:'attachment'}))],companySnapshot,projectContext:{...report.projectContext,governmentProcurement:report.projectContext.governmentProcurement??null},policyPackage,asOf:analysisDate});
  if(!procurementPolicy&&report.projectContext.conflictFields.length){
    const policy=report.procurementPolicy,allPolicy=report.projectContext.conflictFields.some(key=>['governmentProcurement','projectDate'].includes(key));
    const messages=report.projectContext.gaps;
    for(const [key,app]of Object.entries(policy.applicability))if(key!=='projectScoring'&&(allPolicy||key==='greenMaterial')){app.status='pending';app.reason='项目原文适用条件存在冲突，须先澄清';app.gaps=unique([...app.gaps,...messages]);}
    for(const product of policy.products)if(allPolicy||product.policyType==='greenMaterial'){product.status='pending';product.matchedRecordIds=[];product.gaps=unique([...product.gaps,...messages]);product.reason='项目原文适用条件存在冲突，不能确认政策匹配';}
    for(const key of ['met','pending','missing','notApplicable'])policy.summary[key]=policy.products.filter(product=>product.status===key).length;
    policy.warnings.push({code:'POLICY_CONTEXT_CONFLICT',message:messages.join('；')});
  }
  report.policySnapshot=policySnapshot?structuredClone(policySnapshot):{version:policyPackage.version,package:structuredClone(policyPackage),asOf:report.procurementPolicy.asOf};
  report.analysis=documentAnalysis(report,units);
  report.pricingAnalysis=buildPricingAnalysis(report,{documents:docs});
  // The exact reviewed fact used by categories also supplies the four outputs.
  report.analysis.keyRequirements=uniqueOutput(report.analysis.keyRequirements);
  return summarizeReport(report);
}

function uniqueOutput(items) {
  const rank = item => (item.categoryId === 'eco' && item.fields?.['强制采购']?.startsWith('原文明确') ? 100 : 0) + ({entity: 20, qualification: 20, performance: 20, personnel: 20, deposit: 30, sample:30, payment:30, eco: 30, scoring: 15, consistency: 20, commitment: 25, rejection: 0}[item.categoryId] || 0);
  const groups = new Map();
  for (const item of items) {
    const key = compact(item.quote);
    const group = groups.get(key) || []; group.push(item); groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const preferred = [...group].sort((a, b) => rank(b) - rank(a))[0];
    const confirmedFailure = group.find(item => item.hard && item.reviewed && item.matchStatus === 'unmet');
    const chosen = confirmedFailure ? {...preferred, id: confirmedFailure.id, reviewed: true, matchStatus: 'unmet'} : preferred;
    const refs = new Map(group.flatMap(item => item.references || []).map(ref => [`${ref.documentId}:${ref.blockId}:${compact(ref.quote)}`, ref]));
    const fields = Object.assign({}, ...group.filter(item => item !== preferred).map(item => item.fields), preferred.fields);
    const notes = unique(group.flatMap(item => Array.isArray(item.notes) ? item.notes : item.notes ? [item.notes] : []));
    return {...chosen, fields, notes, references: [...refs.values()], relatedFindingIds: group.map(item => item.id)};
  });
}

function scoringStandard(item) {
  return Boolean(item.fields?.['满分']) || (SCORE.test(readText(item.quote)) && (/\d+(?:\.\d+)?\s*分|[一二三四五六七八九十]+\s*分|(?:公式|得分\s*=|÷|×).{0,40}\d/.test(readText(item.quote))) && !/^不可通过其他加分项抵消/.test(readText(item.quote)));
}

function canonicalScoreOrigins(item, scores) {
  if(item.source!=='ai'||!/^web-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-finding-[0-9a-f]{20}$/i.test(item.id)||typeof item.quote!=='string'||!item.references?.length)return [];
  const sameSource=(candidate,original)=>candidate.documentId===original.documentId&&candidate.blockId===original.blockId&&typeof candidate.quote==='string'&&typeof original.quote==='string'&&candidate.quote.includes(original.quote);
  const origins=scores.filter(score=>score.id!==item.id&&score.quote&&item.quote.includes(score.quote)&&score.references?.length&&score.references.every(ref=>item.references.some(candidate=>sameSource(candidate,ref)))).sort((a,b)=>item.quote.indexOf(a.quote)-item.quote.indexOf(b.quote));
  // A whole-block web quotation can restate several immutable score rows. Only
  // exact, complete source coverage authorizes reuse of those existing rows.
  // A shared block, partial overlap or any additional quoted text is insufficient.
  if(!origins.length||origins.map(score=>score.quote).join('\n')!==item.quote||!item.references.every(ref=>origins.some(score=>score.references.some(original=>sameSource(ref,original)))))return [];
  return origins.map(score=>score.id);
}

/** Rebuild outputs after review; a score can never cancel a verified hard failure. */
export function summarizeReport(report) {
  const all = (report?.categories || []).flatMap(category => category.items || []);
  // A matched quotation does not validate the model's added conditions. Keep
  // candidates and their reviews on categories, outside authoritative outputs.
  const primary=all.filter(item=>item.source!=='ai'||item.reviewed===true);
  const risks = uniqueOutput(primary.filter(item => item.hard || item.scopePending || item.fields?.['投标提交要求'] || (item.categoryId === 'consistency' && item.references.length > 1 && item.fields?.['冲突事项']) || (item.categoryId === 'eco' && item.priority === 'policy')));
  const scoreCandidates=primary.filter(item => ['scoring', 'performance', 'sample', 'eco', 'personnel'].includes(item.categoryId) && scoringStandard(item));
  const structuredScores=(report.analysis?.scoring?.items||[]).map(score=>primary.find(item=>item.id===score.id)).filter(Boolean);
  const scoreQuotes=new Set(structuredScores.map(item=>compact(item.quote)));
  const scoreItems=structuredScores.length?[...structuredScores,...uniqueOutput(scoreCandidates.filter(item=>!scoreQuotes.has(compact(item.quote))&&!canonicalScoreOrigins(item,structuredScores).length&&/(?:加\d+(?:\.\d+)?分|每[^。；;]{0,50}\d+(?:\.\d+)?分)/.test(readText(item.quote))&&!/分值构成/.test(readText(item.quote))))]:uniqueOutput(scoreCandidates);
  const commitments = uniqueOutput(primary.filter(item => item.categoryId === 'commitment' && !item.fields?.['附件目录属性'] && item.stage!=='合同履约' && item.stage!=='履约验收'));
  const failed = primary.filter(item => item.hard && item.reviewed && item.matchStatus === 'unmet');
  const pending = primary.filter(item => !item.reviewed || item.matchStatus === 'pending');
  const coverageReviewed = report?.coverageReview?.reviewed === true && typeof report.coverageReview.note === 'string' && Boolean(report.coverageReview.note.trim());
  const coverageConfirmed = coverageReviewed || (report?.coverage?.complete && !report?.coverage?.missingCategories?.length && !report?.coverage?.unrecognizedBlocks?.length);
  const companyFactsConfirmed=hasConfirmedCompanyFacts(report);
  const reasons = []; const conditions = [];
  let label = '待核验';
  if (failed.length) {
    label = '不建议投';
    reasons.push(...unique(failed.map(item => `${item.title}：${item.notes || item.quote}`)));
    conditions.push('上述已确认硬门槛未满足，不可用评分加分抵消；如事实发生变化，应重新核验。');
  } else if (!primary.length) {
    reasons.push('没有足够的可识别条款，不能仅凭空白或失败解析判断参与条件。');
  } else if (companyFactsConfirmed && coverageConfirmed && !pending.length && primary.every(item => ['met', 'not-applicable'].includes(item.matchStatus) || (item.matchStatus === 'unmet' && !item.hard && ['scoring', 'performance', 'sample', 'eco', 'personnel'].includes(item.categoryId) && /^评分要求/.test(item.fields?.['用途'] || '')))) {
    const scoringGaps = primary.filter(item => item.matchStatus === 'unmet');
    label = scoringGaps.length ? '谨慎可投' : '可投';
    reasons.push(scoringGaps.length ? '当前硬门槛已核验满足；已确认存在评分材料缺口，仅给条件性参与建议。' : '当前已提取条款及适用范围均完成人工核验，未见已确认的不满足项。');
    if (scoringGaps.length) conditions.push(...unique(scoringGaps.map(item => `落实或接受该评分缺口的影响：${item.title}；${item.quote}`)));
    conditions.push('仅适用于本次文件、所选附件和已核验企业事实；实际递交前仍须确认资料和时限有效。');
  } else {
    reasons.push(coverageConfirmed ? '当前报告整理文件要求；企业事实或条件适用尚未充分核验，不能确定企业可投。' : '当前报告整理文件要求；企业事实、条件适用或原文覆盖尚未充分核验，不能确定企业可投。');
    if (pending.length) reasons.push(`${pending.length}条要求或条件仍待核验。`);
    if (!coverageReviewed && report?.coverage?.missingCategories?.length) conditions.push(`以下类别未明确识别，不等于不存在：${report.coverage.missingCategories.join('、')}。`);
    if (!coverageReviewed && !report?.coverage?.complete) conditions.push('先核对无法读取内容、所选附件及原文引用缺口。');
    if (!coverageReviewed && report?.coverage?.unrecognizedBlocks?.length) conditions.push('检查未归类段落与表格，避免遗漏跨章节条件。');
  }
  if (coverageReviewed) reasons.push('未识别类别、未归类段落和读取提示已对照原件人工确认；结论仅依据本次确认事实。');
  if(!companyFactsConfirmed&&!failed.length)reasons.push('尚未绑定可追溯且已确认的企业原件事实；采购条款与覆盖复核不能替代企业事实核验，企业资格仍待核验。');
  if (primary.some(item => item.conditional && !item.reviewed)) conditions.push('逐项确认且／或、条件和例外的适用范围。');
  if (risks.some(item => item.categoryId === 'consistency' && !item.reviewed)) conditions.push('冲突双方须取得明确适用顺序或澄清依据，不自动选择有利条款。');
  conditions.push(hasNonScoringMethod(report)?'本文件明确采用最低价法且未列计分表；不计算技术、商务或报价得分，先核对资格和实质性要求，再按文件规定的最终报价及价格排序执行。':'评分清单保留文件标准与材料；本地仅作证据支持的规则预计或有理由的人工参考估计，不保证实际专家得分。技术和报价满分仅为明确假设。');
  const categories = (report?.categories || []).map(category => ({...category, status: !category.items?.length ? (coverageReviewed ? '未识别，已人工覆盖复核' : '未识别，待核验') : category.items.every(item => item.reviewed && item.matchStatus !== 'pending') ? '已人工核验' : '已提取，待核验'}));
  const analysis=report.analysis?{...report.analysis,keyRequirements:uniqueOutput(primary.filter(item=>item.hard&&(item.categoryId!=='rejection'||item.fields['实质性要求'])))}:undefined;
  const companyAnalysis=buildCompanyAnalysis({...report,categories,...(analysis?{analysis}:{})});
  const qualification=companyAnalysis.qualification;
  if(qualification?.status==='unmet'&&!failed.length){label='不建议投';reasons.push('已确认存在资格或符合性硬门槛不满足。');}
  if(qualification?.status==='pending'&&!failed.length){
    if(['可投','谨慎可投'].includes(label))label='待核验';
    reasons.push('营业执照、企业资质、安全生产许可、人员与业绩的适用条件及原件尚未完成逐项核验。');
  }
  if(companyAnalysis.forecast?.totalRange)conditions.push(`技术、清单及报价满分假设下，总分测算区间为${companyAnalysis.forecast.totalRange.min}至${companyAnalysis.forecast.totalRange.max}分；商务未知分和主观评审仍须核验。`);
  if(companyAnalysis.screening.internalScreening)reasons.push('商务与独立附加分的95%企业内部规则单独作为筛选参考，不作为招标资格门槛或单独否决投标的依据。');
  const result={...report, categories, ...(analysis?{analysis}:{}), companyAnalysis, analysisStatus: report.onlineFailed===true?'partial':label === '待核验' ? '待核验' : '已人工核验', outputs: {risks, scoreItems, commitments, conclusion: {label, reasons: unique(reasons), conditions: unique(conditions)}}};
  result.pricingAnalysis=report.pricingAnalysis||buildPricingAnalysis(result);
  result.suitabilityAssessment=buildSuitabilityAssessment(result);
  result.presentation=buildReportContent(result);
  return result;
}
