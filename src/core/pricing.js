// Pricing evidence is supplied by the caller; this module performs no I/O.
const FIELDS=['compilation','rounds','evaluation','ties','contract','limits','warnings'];
const clean=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const key=ref=>[ref.documentId,ref.blockId,ref.quote,ref.rowStart??''].join('|');
const reference=value=>({documentId:value.documentId,blockId:value.blockId,fileName:value.fileName||'',page:value.page??null,section:value.section||'',quote:value.quote,...Object.fromEntries(['sheet','rowStart','rowEnd','lineStart','lineEnd'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))});
const uniqueRefs=refs=>[...new Map(refs.flatMap(ref=>ref.fragments||[ref]).map(ref=>[key(ref),reference(ref)])).values()];
const validRef=ref=>ref&&typeof ref.documentId==='string'&&typeof ref.blockId==='string'&&typeof ref.quote==='string'&&ref.quote.trim();
const sentenceParts=quote=>quote.split(/[。；;\n]/).map(s=>s.trim()).filter(Boolean);
const generic=q=>/常用|通常|例如|举例|方法(?:包括|分为)|(?:可采用|可以采用).*(?:法|合同)/.test(q)&&!/(?:本项目|本次|本工程).*(?:采用|价格形式|执行)/.test(q);
const negative=q=>/(?:不采用|不使用|不适用|不进行|不实行|不选用|并非|并不|无需|无须|不要求|不得(?:采用|进行|实行|选用)|未(?:选择|选用|确定))/.test(q);

function originalSources(report,documents){
 const refs=[],canonical=new Map(),excludedDocuments=new Set(),suppliedDocuments=new Set();
 for(const document of documents||[]){
  const extraction=document?.extraction||document||{},id=document?.id||extraction.id;
  if(document?.role==='evidence'){if(id)excludedDocuments.add(id);continue;}
  if(id)suppliedDocuments.add(id);
  for(const block of extraction.blocks||[]){
   if(['toc','page-header','page-footer','page-number'].includes(block.role))continue;
   const base={documentId:block.documentId||id,blockId:block.id,fileName:block.fileName||document.fileName||extraction.fileName,page:block.page??null,section:block.section||'',lineStart:block.lineStart,lineEnd:block.lineEnd};
   if(typeof block.text==='string'&&block.text.trim()){const ref={...base,quote:block.text};if(validRef(ref)){canonical.set(`${ref.documentId}|${ref.blockId}`,ref);if(!block.tableRows?.length)refs.push(ref);}}
   for(const row of block.tableRows||[]){const cells=Array.isArray(row)?row:row.cells||[],quote=row.text||cells.map(c=>typeof c==='object'?c.displayValue??c.formatted??c.value??'':c??'').join(' | '),ref={...base,quote,page:row.page??base.page,sheet:block.sheet,rowStart:row.rowStart??row.row,rowEnd:row.rowEnd??row.rowStart??row.row};if(validRef(ref))refs.push(ref);}
  }
 }
 // Only citation objects are read. Generated summaries, company materials and
 // AI candidate fields cannot introduce a pricing fact by their own prose.
 const skipped=new Set(['companySnapshot','companyAnalysis','procurementPolicy','procurementPolicyDisplay','policySnapshot','policySources','aiSupplement','fields','interpretation','notes','suitabilityAssessment','pricingAnalysis']);
 const visited=new WeakSet();
 function walk(value){
  if(!value||typeof value!=='object'||visited.has(value))return;visited.add(value);
  if(validRef(value)&&!excludedDocuments.has(value.documentId)){
   const original=canonical.get(`${value.documentId}|${value.blockId}`);
   if((!suppliedDocuments.has(value.documentId)&&!original)||original?.quote.includes(value.quote))refs.push(reference(value));
   return;
  }
  if(Array.isArray(value)){value.forEach(walk);return;}
  for(const [name,child]of Object.entries(value))if(!skipped.has(name))walk(child);
 }
 walk(report?.categories);walk(report?.analysis);walk(report?.projectContext);walk(report?.presentation);
  // A table page and its retained partial citations resolve to the complete
 // relevant row, never to the whole page. Keep the widest same-row quotation
 // so that a shorter citation cannot discard an exception or calculation base.
 const atomic=uniqueRefs(refs.flatMap(ref=>{
  const lines=ref.quote.split('\n').filter(line=>line.trim());
  return lines.length>1&&lines.filter(line=>line.includes('|')).length>1?lines.map(quote=>({...ref,quote})):[ref];
 }));
 return atomic.filter(ref=>!atomic.some(other=>other!==ref&&other.documentId===ref.documentId&&other.blockId===ref.blockId&&other.quote.length>ref.quote.length&&other.quote.includes(ref.quote)));
}
function relatedUnits(sources){
 const units=[],section=ref=>clean(ref.section).replace(/\s*\/\s*第\s*\d+\s*页$/,'');
 for(let index=0;index<sources.length;index++){
  const first=sources[index],fragments=[first];let quote=first.quote;
  // A paragraph interrupted by a page break can carry its own exception on
  // the next page. Join the actual fragments, retaining separate exact refs.
  while(/报价|限价|预算|计价/.test(clean(quote))&&!quote.includes('|')&&!/^\d+(?:\.\d+)+[.、]?\s*[^。；;]{0,30}$/.test(clean(quote))&&!/[。；;！？!?]$/.test(quote.trim())){
   const next=sources[index+1];
   if(!next||next.documentId!==first.documentId||next.blockId===first.blockId||section(next)!==section(first)||next.quote.includes('|')||/^(?:第[一二三四五六七八九十\d]+[章节]|\d+\.\d|[一二三四五六七八九十]+、)/.test(clean(next.quote))||fragments.length>=4)break;
   quote+=next.quote;fragments.push(next);index++;
  }
  units.push({...first,quote,fragments});
 }
 return units;
}
function overlapWarnings(report,documents){
 const warnings=[...(report?.warnings||[])];
 for(const document of documents||[]){if(document?.role==='evidence')continue;const extraction=document?.extraction||document||{};for(const warning of extraction.warnings||[])if(warning&&typeof warning==='object')warnings.push({...warning,documentId:warning.documentId||document.id||extraction.id});}
 return warnings.filter(warning=>warning?.code==='PDF_OVERLAPPING_TEXT');
}

/** Separate quotation compilation, rounds, evaluation and contract evidence. */
export function buildPricingAnalysis(report={}, {documents=[]}={}){
 const result=Object.fromEntries(FIELDS.map(field=>[field,[]])),originals=originalSources(report,documents),overlaps=overlapWarnings(report,documents);
 const unreliable=ref=>overlaps.some(warning=>(!warning.documentId||warning.documentId===ref.documentId)&&(warning.page==null||warning.page===ref.page));
 const sources=relatedUnits(originals.filter(ref=>!unreliable(ref)));
 const add=(field,value,refs)=>{const references=uniqueRefs(refs);if(!value||result[field].some(item=>item.value===value))return;result[field].push({value,references});};
 const matches=predicate=>sources.filter(ref=>predicate(clean(ref.quote),ref));
 for(const warning of overlaps){const refs=originals.filter(ref=>unreliable(ref)&&(!warning.documentId||warning.documentId===ref.documentId)&&(warning.page==null||warning.page===ref.page)&&/报价|限价|预算|计价|税率|工程量清单/.test(clean(ref.quote)));if(refs.length)add('warnings',`原文第${warning.page??'待核'}页存在重叠文字；相关报价编制、轮次及数值关系待核验，不据此认定确定报价轮次。`,refs);}
 const compilation=matches(q=>!generic(q)&&(/(?:投标报价|竞标报价|响应报价|报价)(?:总额|总价)?[^。；;]{0,35}(?:含税|包括.*全部费用)|投标报价含税|投标总价\(含税\)|投标报价总额为各分项金额之和|工程量清单.*(?:填写|填入|填报)|按.*工程量清单.*填写/.test(q)));
 for(const ref of compilation)add('compilation',ref.quote,[ref]);
 const taxRefs=matches(q=>/报价含税|投标总价\(含税\)|含税报价金额|税率/.test(q));
 const rates=taxRefs.flatMap(ref=>{const q=clean(ref.quote);if(/例如|示例|举例|假设|参考税率/.test(q))return[];return[...q.matchAll(/税率(?:为|是|按|[：:=])?\s*(\d+(?:\.\d+)?)\s*%/g)].map(match=>({rate:match[1],ref}));});
 for(const {rate,ref}of rates)add('compilation',`原文明确税率为${rate}%。`,[ref]);
 if(taxRefs.length&&!rates.length)add('warnings','已提供原文未明确具体税率，须核验；不按常用税率推定。',taxRefs);
 const initial=matches(q=>!generic(q)&&!negative(q)&&(/(?:初次|首次|第一轮).{0,15}报价/.test(q)||/投标截止时间前.*投标函.*投标报价/.test(q)));
 for(const ref of initial)add('rounds','初次投标文件报价：'+ref.quote,[ref]);
 for(const ref of matches(q=>!generic(q)&&/(?:只|仅)允许(?:进行|提交)?一(?:次|轮)报价/.test(q)))add('rounds',ref.quote,[ref]);
 const second=matches(q=>sentenceParts(q).some(s=>!generic(s)&&!negative(s)&&(/(?:进行|提交|报出|开展|组织).{0,12}(?:二次|第二轮|最终)报价/.test(s)||/(?:磋商结束后|要求[^。；;]{0,40}(?:提交|报出)最后报价|(?:在|于)规定时间内提交最后报价)/.test(s))));
 for(const ref of second)add('rounds',ref.quote,[ref]);
 const ranked=matches(q=>!generic(q)&&!/(?:不采用|不适用|不使用).{0,30}经评审/.test(q)&&(/经评审的投标价由低到高/.test(q)||/(?:本次|本项目|评审办法的采用).{0,30}(?:采用|\|)?\s*经评审的最低投标价法/.test(q)));
 for(const ref of ranked){const parts=sentenceParts(ref.quote).filter(q=>/经评审的最低投标价法|经评审的投标价由低到高/.test(q));if(parts.length)add('evaluation',parts.join('；')+'。',[ref]);}
 if(ranked.some(ref=>/经评审的投标价由低到高/.test(ref.quote)))add('evaluation','价格排序依据为经评审的投标价，不能等同于原始投标报价；原文另列经评审价相等时的投标报价比较规则。',ranked.filter(ref=>/经评审的投标价由低到高/.test(ref.quote)));
 const comprehensive=matches(q=>!generic(q)&&!negative(q)&&/(?:采用|使用).{0,8}综合评分法|(?:评审方法|评标方法)\s*\|\s*综合评分法/.test(q));
 for(const ref of comprehensive)add('evaluation',ref.quote,[ref]);
 const scoreTie=q=>/(?:评审|评标|综合)?(?:得分|总分).{0,12}(?:相同|相等|一致)/.test(q)&&/报价/.test(q)&&/顺序|排序|排列|优先/.test(q);
 const tieRefs=matches(q=>!generic(q)&&(scoreTie(q)&&!negative(q)||sentenceParts(q).some(s=>/(?:报价|投标价).{0,18}(?:一致|相等|相同)/.test(s)&&/优先/.test(s)&&!negative(s))));
 for(const ref of tieRefs){
  // Equal comprehensive scores, and equal scores plus equal prices, are
  // separate conditions. Preserve both tiers rather than inventing a general
  // lowest-price preference from the latter clause alone.
  if(scoreTie(clean(ref.quote))){add('ties',ref.quote,[ref]);continue;}
  const parts=sentenceParts(ref.quote).filter(q=>/(?:报价|投标价).{0,18}(?:一致|相等|相同)/.test(q)&&/优先/.test(q));if(parts.length)add('ties',parts.join('；')+'。',[ref]);
 }
 if(tieRefs.some(ref=>/最终报价.{0,8}(?:一致|相等|相同)/.test(clean(ref.quote)))&&tieRefs.some(ref=>/经评审的投标价相等/.test(ref.quote)))add('warnings','原文并列最终报价一致时的相关施工业绩优先、经评审价相等时的投标报价优先；两类同价规则的适用层次和先后顺序待采购方澄清。',tieRefs);
 const contractRefs=matches((q,ref)=>/固定总价|固定单价/.test(q)&&!generic(q)&&(/合同|价格形式/.test(q)||/合同/.test(ref.section)));
 const explicit=contractRefs.flatMap(ref=>sentenceParts(ref.quote).filter(q=>!negative(q)&&!/(?:请选择|二选一|总价[／/]固定单价)/.test(clean(q))).flatMap(q=>{
  const selected=clean(q).match(/(?:本项目|本工程|本合同).{0,25}(?:采用|实行|为|选用)\s*(固定总价|固定单价)(?:合同)?|[☑✓√]\s*(固定总价|固定单价)/);
  return selected?[{method:selected[1]||selected[2],ref}]:[];
 }));
 const selectedMethods=[...new Set(explicit.map(x=>x.method))];
 if(selectedMethods.length===1)add('contract',`本项目原文明确采用${selectedMethods[0]}合同。`,explicit.map(x=>x.ref));
 else if(contractRefs.length){
  add('contract',selectedMethods.length>1?'合同价格形式存在互相冲突的选择，待澄清。':'合同价格形式待澄清：参考条款列有'+[...new Set(contractRefs.flatMap(ref=>ref.quote.match(/固定总价|固定单价/g)||[]))].join('／')+'，未见本项目已选定价格形式；清单汇总报价不能据此推定为固定总价合同。',contractRefs);
 }
 // Overview lot-limit labels have already been resolved against original rows;
 // the numeric wording is still required in those cited original rows.
 for(const item of report?.analysis?.overview||[]){
  if(item.kind!=='lot-limit')continue;
  const refs=(item.references||[]).filter(validRef).filter(ref=>/\d[\d,.]*\s*元/.test(ref.quote));
  const label=String(item.label||''),value=String(item.value||'');
  if(refs.length&&/标段|包件/.test(label)&&refs.some(ref=>clean(ref.quote).includes(clean(value))))add('limits',`${label}：${value}`,refs);
 }
 for(const ref of matches(q=>/最高(?:投标|响应|竞标)?限价|预算(?:金额|价)/.test(q)&&/\d[\d,.]*\s*(?:万元|元)/.test(q)))add('limits',ref.quote,[ref]);
 if(!result.compilation.length)add('warnings','已保留原文缺少完整报价编制依据，清单填报、含税口径及费用范围待核验。',[]);
 if(!result.rounds.length)add('warnings','已保留原文未明确报价轮次与最终报价程序，待核验。',[]);
 if(!result.contract.length)add('warnings','已保留原文未形成可确认的合同价格形式，待核验。',[]);
 if((report?.coverage?.complete===false)||(documents||[]).some(d=>(d.extraction||d)?.complete===false))add('warnings','原文覆盖不完整，报价条件及合同模板选择须补查；当前分析不补读磁盘或外部资料。',[]);
 return result;
}
