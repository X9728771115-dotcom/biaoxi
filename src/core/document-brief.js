import {createHash} from 'node:crypto';
import {explicitEvaluationMethods} from '../../public/score-summary.js';

const compact=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'');
const unique=values=>[...new Map(values.map(value=>[JSON.stringify(value),value])).values()];
export const referenceTemplate=block=>/参考模板/.test(block?.section||'');
export function referenceTemplateBlockIds(document){
 const result=new Set();let inside=false;
 for(const block of document.blocks||[]){
  const title=compact(block.text);
  if(/^第[一二三四五六七八九十\d]+章/.test(title))inside=/参考模板/.test(title);
  if(referenceTemplate(block))inside=true;
  if(inside)result.add(block.id);
 }
 return result;
}
const placeholder=value=>!value||/^(?:见|详见|按|参见)(?:第|采购|竞标|投标|前|附)|_{2,}|\*{2,}|\{\{|^(?:年|月|日|标段|包件)[：:]*$/.test(value);
const ref=node=>({documentId:node.document.id,fileName:node.document.fileName,blockId:node.block.id,page:node.block.page??null,section:node.block.section||'',quote:node.text});
const references=nodes=>unique(nodes.map(ref));
function note(title,interpretation,nodes,categoryId,extra={}){
 const refs=references(nodes),id=createHash('sha256').update(title+JSON.stringify(refs)).digest('hex').slice(0,16);
 return{id:`brief-${id}`,title,interpretation,quote:nodes.map(node=>node.text).join('\n'),references:refs,categoryId,source:'derived',hard:false,conditional:false,applicability:'required',matchStatus:'pending',reviewed:false,fields:{},actions:['对照所引原文、适用标段及真实企业材料核验。'],...extra};
}

/** Read a printed label and its native next paragraph; references never use reconstructed text. */
export function projectLabeledFacts(documents=[]){
 const result=[];
 const labels=[['项目名称','采购项目名称|采购项目|项目名称'],['建设地点','建设地点|项目地点|实施地点|交货地点'],['工期／交付','计划工期|工期|交货时间|交付期限']];
 for(const value of documents){if(value.role==='evidence')continue;const document=value.extraction?{...value.extraction,id:value.id||value.extraction.id,fileName:value.fileName||value.extraction.fileName}:value;
  const templateIds=referenceTemplateBlockIds(document);
  const nodes=(document.blocks||[]).filter(block=>!['toc','page-number','page-header','page-footer'].includes(block.role)&&!templateIds.has(block.id)).flatMap(block=>String(block.text||'').split(/\n+/).filter(text=>text.trim()).map(text=>({text,block,document})));
  for(let index=0;index<nodes.length;index++)for(const [label,pattern]of labels){
   const node=nodes[index],text=compact(node.text),match=text.match(new RegExp(`(?:${pattern})[：:|]([^|]*)`));if(!match)continue;
   if(label==='项目名称'&&node.text.includes('|')&&/项目编码|计量单位|工程量/.test(text)&&/项目特征描述|工作内容/.test(text))continue;
   if(label==='建设地点'&&/代理机构|代理单位|采购代理|招标代理/.test(node.block.section||''))continue;
   let found=match[1].replace(/[。；;]+$/,'');const sources=[node];
   if(label==='项目名称')found=found.split(/(?:采购)?项目编号[：:]|采购人[：:]|(?:采购)?代理机构[：:]/)[0];
   if(!found&&nodes[index+1]&&nodes[index+1].block.id!==node.block.id){const next=nodes[index+1];if(next.document.id===node.document.id&&!/^[\d一二三四五六七八九十]+[.、]|[：:|]/.test(compact(next.text))){found=compact(next.text).replace(/[。；;]+$/,'');sources.push(next);}}
   if(placeholder(found)||found.length>400||label==='工期／交付'&&!/\d+(?:日历)?(?:天|日|个月|月)/.test(found)||label==='建设地点'&&sources.length>1&&(/协议|双方|甲乙|应当|不得|为加强/.test(found)||found.length>100))continue;
   result.push({label,value:found,references:references(sources),documentId:document.id});
  }
 }
 const merged=new Map();for(const fact of result){const key=JSON.stringify([fact.documentId,fact.label,fact.value]);if(!merged.has(key))merged.set(key,fact);else merged.get(key).references=unique([...merged.get(key).references,...fact.references]);}
 return [...merged.values()];
}

/** Conservative summaries supplement the classified clauses; they do not certify semantic completeness. */
export function buildDocumentBrief(documents=[],{scoringItems=[]}={}){
 const overview=projectLabeledFacts(documents),businessRequirements=[],preparation=[],methodDetails=[],clarifications=[],paymentEvidence=[];
 const methodChoices=documents.filter(document=>document.role!=='evidence').flatMap(document=>{
  const excluded=referenceTemplateBlockIds(document);
  return(document.blocks||[]).filter(block=>!excluded.has(block.id)&&!['toc','page-number','page-header','page-footer'].includes(block.role)).flatMap(block=>explicitEvaluationMethods(block.text,block.section).map(choice=>({...choice,node:{document,block,text:block.text||''}})));
 });
 const methodKinds=new Set(methodChoices.map(choice=>choice.method)),methodScoped=methodChoices.some(choice=>choice.package);
 const confirmedScoringMethod=methodKinds.size===1&&methodKinds.has('comprehensive')&&scoringItems.length>0;
 const methodMixed=methodKinds.size>1||methodScoped&&!confirmedScoringMethod;
 const selectedMethod=!methodMixed&&methodKinds.size===1?[...methodKinds][0]:null;
 if(methodChoices.length){const chosenNodes=unique(methodChoices.map(choice=>choice.node));overview.push({label:'评审方法',value:methodMixed?'采购包或来源的方法适用范围待核验':methodChoices[0].label,references:references(chosenNodes)});
  if(methodMixed)clarifications.push(note('评审方法的包件或来源适用范围待核验','文件分别列有包件专属方法或不同方法选择；未明确当前所选包及适用来源，不能将一个最低价条款升格为全报告方法。',chosenNodes,'consistency'));
 }
 let lowestPrice=null;
 for(const document of documents){
  const nodes=(document.blocks||[]).filter(block=>!['toc','page-number','page-header','page-footer'].includes(block.role)).map(block=>({document,block,text:block.text||''}));
  const templateIds=referenceTemplateBlockIds(document),actual=nodes.filter(node=>!templateIds.has(node.block.id));
  const limits=[];
  for(let index=0;index<actual.length;index++){
   const node=actual[index],text=compact(node.text),context=actual.slice(Math.max(0,index-2),index+1).map(value=>compact(value.text)).join('');
   if(!/最高(?:投标)?限价|控制价/.test(context))continue;
   for(const match of text.matchAll(/(标段|包件|采购包)([\d一二三四五六七八九十]+)[：:|]((?:含税|人民币|最高(?:投标)?限价|为|是|[：:])*)(\d[\d,]*(?:\.\d+)?)(万元|亿元|元)([^;；。]*)/g)){
    const beforeAmount=actual.slice(Math.max(0,index-2),index).map(value=>compact(value.text)).join('')+text.slice(0,match.index)+match[3];
    const labels=[...beforeAmount.matchAll(/最高(?:投标)?限价|控制价|预算(?:金额|价)?/g)];
    if(!labels.length||!/最高(?:投标)?限价|控制价/.test(labels.at(-1)[0]))continue;
    const multiplier=unit=>({万元:1e4,亿元:1e8,元:1}[unit]||1),amount=Number(match[4].replace(/,/g,''))*multiplier(match[5]);
    const safety=match[6].match(/安全生产费[：:]?(\d[\d,]*(?:\.\d+)?)(万元|亿元|元)/),safetyFee=safety?Number(safety[1].replace(/,/g,''))*multiplier(safety[2]):undefined;
    const fact={kind:'lot-limit',label:`${match[1]}${match[2]}最高投标限价`,package:match[2],amount,...(safetyFee!==undefined?{safetyFee}:{}),value:`${/含税/.test(match[3])?'含税':''}${amount}元${safetyFee!==undefined?`（含安全生产费${safetyFee}元）`:''}`,references:references([node]),documentId:document.id};
    if(!limits.some(previous=>previous.package===fact.package&&previous.amount===fact.amount))limits.push(fact);
   }
  }
  overview.push(...limits);
  const range=actual.filter(node=>/划分为\d+个(?:标段|包件)|(?:标段|包件)[一二三\d]+[：:].*(?:标段|包件)[一二三\d]+[：:]/.test(compact(node.text))&&!/最高(?:投标)?限价|含税\d+元/.test(compact(node.text)));
  if(range.length)overview.push({label:'标段／包件范围',value:range.map(node=>compact(node.text)).join('；'),references:references(range),documentId:document.id});

  const method=selectedMethod==='lowest-price'?unique(methodChoices.filter(choice=>choice.node.document.id===document.id).map(choice=>choice.node)):[];
  if(method.length&&!scoringItems.length){
   const order=actual.filter(node=>/经评审的(?:投标)?价.{0,6}由低到高|有一项不符合评审标准.*无效投标/.test(compact(node.text)));
   const text=compact(method.map(node=>node.text).join(''));
   const checks=['形式评审','资格评审','响应性评审','施工组织设计','项目管理机构'].filter(value=>text.includes(value));
   const stages=[checks.length?`先完成${checks.join('、')}等文件规定的审查`:'资格与实质性审查要求按文件核对'];
   if(/二次报价|最终报价|最后报价/.test(text))stages.push('通过审查后按原文进行二次报价（最终报价）');
   if(order.some(node=>/由低到高/.test(compact(node.text))))stages.push('按经评审价格由低到高推荐候选人，低于成本等例外按原文核验');
   if(/一致.*业绩.*优先/.test(text))stages.push('最终报价一致时，相关施工业绩优先，不能转换为业绩加分');
   const explanation=`文件明确采用${methodChoices[0].label}，已读取内容未列明确计分表，得分预测与内部得分比例测算不适用。`;
   const detail=note('最低价评审的审查、最终报价与排序',stages.join('；')+'。'+explanation,[...method,...order],'method');
   methodDetails.push(detail);lowestPrice={status:'not-applicable',method:'lowest-price',explanation,references:detail.references};
  }

  let qualifications=actual.filter(node=>/独立法人资格|一般纳税人|安全生产许可证.*有效|(?:竞标人|投标人|供应商)(?:必须|须|应).{0,12}具备.{0,60}资质|近[一二三四五\d]+年.{0,45}类似.{0,15}业绩|拟派项目经理.*(?:须|应|具备)|不得被.{0,30}(?:严重违法|失信)|没有.{0,50}(?:限制竞标|财产.*冻结|停业)|近一年内.*行贿犯罪/.test(compact(node.text))&&!/见.*前附表|自愿组成|联合体协议书/.test(compact(node.text)));
  const enumerated=node=>/^\([\d一二三四五六七八九十]+\)/.test(compact(node?.text));
  const qualificationIndices=new Set(qualifications.map(node=>actual.indexOf(node)));
  for(const index of [...qualificationIndices])if(enumerated(actual[index])){
   let parent=index-1;while(parent>=0&&enumerated(actual[parent]))parent--;
   if(parent<0||!/不得(?:存在|有|属于).{0,15}下列|禁止.{0,8}下列/.test(compact(actual[parent].text)))continue;
   // A copied list item keeps the prohibitive parent and its continuous list.
   qualificationIndices.add(parent);for(let next=parent+1;next<actual.length&&enumerated(actual[next]);next++)qualificationIndices.add(next);
  }
  qualifications=[...qualificationIndices].sort((a,b)=>a-b).map(index=>actual[index]);
  if(qualifications.length>=2){
   const suffix='。上述条件逐项核验；企业证据未确认时保留待核验，不能以得分抵消。';
   businessRequirements.push(note('项目主体、资质与信用资格',qualifications.map(node=>compact(node.text)).join('；')+suffix,qualifications,'qualification',{sourceClauseSummary:{suffix}}));
  }
  const consortium=actual.filter(node=>/是否接受联合体/.test(compact(node.text)));
  for(const node of consortium){
   const selected=[...new Set([...compact(node.text).matchAll(/(?:☑|■|√)(不接受|接受)/g)].map(match=>match[1]))];
   if(selected.length!==1)continue;
   const interpretation=selected[0]==='不接受'?'项目勾选不接受联合体；后续“如有”联合体协议与授权格式不能反向改变本项目选项。':'项目勾选接受联合体；成员资格、分工和提交材料另按实际适用条款核验，未勾选的“不接受”不能改变项目选项。';
   businessRequirements.push(note('联合体项目选项',interpretation,[node],'qualification'));
  }
  for(let index=0;index<actual.length;index++)if(/投标保证金.*是否要求/.test(compact(actual[index].text))){
   const selection=actual.slice(index,index+2),selected=selection.find(node=>/(?:☑|■|√)不要求/.test(compact(node.text)));
   if(selected)overview.push({label:'投标保证金',value:'项目选项不要求递交投标保证金',references:references(selection),documentId:document.id});
  }
  const usb=actual.filter(node=>/U盘/i.test(node.text)&&/拒收|不予受理/.test(compact(node.text)));
  if(usb.length)preparation.push(note('PDF电子版与U盘递交拒收条件',usb.map(node=>compact(node.text)).join('；'),usb,'rejection',{hard:true,impact:'未按本条格式、签章或密封要求递交，文件明确可能拒收。',actions:['逐项核对PDF、签章、纸电一致性、非空白页面及U盘单独密封。']}));

  const payments=actual.filter(node=>/付款方式|支付方式|资金支付/.test(compact(node.text))&&/支付|付款/.test(compact(node.text)));
  const settlement=actual.filter(node=>/审计/.test(compact(node.text))&&/验收/.test(compact(node.text))&&/结算|支付|付款/.test(compact(node.text)));
  paymentEvidence.push(...[...payments,...settlement].map(node=>({quote:node.text,references:[ref(node)]})));
  for(const payment of payments){
   const text=compact(payment.text),paidChoices=[...text.matchAll(/支付[^;；。]{0,50}?(\d+(?:\.\d+)?)%/g)],paid=paidChoices[0],held=text.match(/剩余(\d+(?:\.\d+)?)%/);
   // Several payment stages cannot be checked by adding only the first stage to the retention.
   if(paidChoices.length!==1||!held)continue;
   const at=actual.indexOf(payment),nearby=actual.slice(Math.max(0,at-3),at+5),quality=nearby.find(node=>/质量保证金[：:|].*\d+(?:\.\d+)?%/.test(compact(node.text)));
   const qualityRate=quality&&compact(quality.text).match(/质量保证金[：:|][^%]{0,35}?(\d+(?:\.\d+)?)%/)?.[1];
   const total=Number(paid[1])+Number(held[1]),parts=[];
   if(Math.abs(total-100)>.00001)parts.push(`若按同一基数，支付${paid[1]}%与“剩余${held[1]}%”合计${total}%，表述需核对；这不等于实际款项总额已确定为${total}%`);
   if(qualityRate&&Number(qualityRate)!==Number(held[1]))parts.push(`另条质量保证金为${qualityRate}%，与“剩余${held[1]}%”的比例表述不同`);
   if(/发票(?:金额|价款)/.test(text)&&quality&&/合同(?:价|金额)/.test(compact(quality.text)))parts.push('原文还存在发票金额与合同价的基数差异，不能直接比较实际保留金额，须澄清');
   if(parts.length)clarifications.push(note('付款比例与质量保证金表述冲突',parts.join('；')+'。比例基数及付款、保留金额须书面澄清，不自动更改任何一处原文。',[payment,...(quality?[quality]:[])],'consistency',{impact:'影响合同结算和履约资金安排；未澄清前不作确定付款计划。'}));
  }

  for(const warning of document.warnings||[]){
   if(warning.code!=='DOC_EMBEDDED_UNPARSED')continue;
   const titles=actual.filter(node=>/^(?:第[一二三四五六七八九十\d]+章)?(?:技术标准和要求|一、技术标准和要求|图纸|1\.图纸)$/.test(compact(node.text)));
   const gap=note('内嵌附件具体未读取范围',warning.message+' 当前仅以已读取正文分析，不能用章标题或清单替代附件技术正文及图纸。',titles,'consistency',{processingSources:[{documentId:document.id,code:warning.code,message:warning.message}],impact:'技术做法、图纸尺寸、工程量对应及附件条款仍有真实读取缺口。',actions:['将警告中列明的实际附件单独上传，核对其与本标段和文件版本的关联。']});
   clarifications.push(gap);
  }
 }
 return{overview,businessRequirements,preparation,methodDetails,clarifications,paymentEvidence,lowestPrice};
}
