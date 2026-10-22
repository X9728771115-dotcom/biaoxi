import {projectLabeledFacts} from './document-brief.js';
const allowedContext=new Set(['governmentProcurement','projectDate','region','province','projectType','buildingStructure','localImplementationConfirmed']);
export function validateProjectContext(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowedContext.has(key)))throw new Error('无效的项目政策适用条件');
 const result={};for(const [key,input]of Object.entries(value)){
  if(input===''||input===null)continue;
  if(['governmentProcurement','localImplementationConfirmed'].includes(key)){if(typeof input!=='boolean')throw new Error('项目适用条件须明确选择是或否');}
  else if(typeof input!=='string'||input.length>200)throw new Error('无效或超长项目适用条件');
  if(key==='projectDate'){const date=new Date(input+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(input)||!Number.isFinite(date.getTime())||!date.toISOString().startsWith(input))throw new Error('项目采购日期须为有效YYYY-MM-DD日期');}
  result[key]=typeof input==='string'?input.trim():input;
 }return result;
}
// Recognize only labeled project rows; a contact/agency address is not a project site.
const contextCell=value=>String(value??'').normalize('NFKC').replace(/\s+/g,'');
function tableProjectFacts(row,block){
 const cells=(row.cells||[]).map(contextCell),label=cells.findIndex(cell=>/^(?:项目概况|项目地点|建设地点|项目所在城市|实施地点|交货地点)$/.test(cell));
 if(label<0||/代理机构|代理单位|采购代理|招标代理/.test([block.section||'',...cells.slice(0,label)].join(' ')))return {};
 const overview=cells[label]==='项目概况',value=cells.slice(label+1).join(' ');
 const address=overview?value.match(/(?:位于|坐落于)([^，,。；;]+)/)?.[1]:value;
 const location=address?.match(/^(?:[\u3400-\u9fff]{2,10}省)?([\u3400-\u9fff]{2,10}市)([\u3400-\u9fff]{1,8}(?:区|县))?/);
 const region=location?location[1]+(location[2]||''):undefined;
 // The source describes the building as an office building, not merely an
 // office address. Preserve the original phrase in provenance when normalized.
 const originalType=overview?value.match(/(?<![不非])(?:为|是|属于)(机关办公综合建筑|办公楼|医院|学校|综合体|展览馆|会展中心|体育馆|保障性住房)(?=[。，；,;]|$)/u)?.[1]:undefined;
 const projectType=originalType==='机关办公综合建筑'?'办公楼':originalType;
 return {region,projectType,originalType};
}
// Only explicit tender clauses/labels infer context. No device location or analysis
// clock is a procurement fact. Conflicting clauses remain gaps for manual input.
export function inferProjectContext(documents=[],manual={}){
 const values=new Map(),provenance={},gaps=[],conflictFields=[];
 const put=(key,value,source,priority=0)=>{if(value===undefined||value==='')return;const items=values.get(key)||[];items.push({value,source,priority});values.set(key,items);};
 for(const fact of projectLabeledFacts(documents).filter(fact=>fact.label==='建设地点')){
  const doc=documents.find(value=>(value.id||value.extraction?.id)===fact.documentId),blocks=(doc?.extraction||doc)?.blocks||[];
  // Existing structured-table city inference remains authoritative for table rows.
  if(fact.references.some(source=>blocks.find(block=>block.id===source.blockId)?.tableRows?.length))continue;
  for(const source of fact.references)put('region',fact.value,source,1);
 }
 for(const doc of documents){if(doc.role==='evidence')continue;const extraction=doc.extraction||doc;
  for(const block of extraction.blocks||[]){const rows=block.tableRows?.length?block.tableRows.map((row,index)=>({text:row.text||row.cells?.join(' | ')||'',cells:row.cells||[],row:row.row??row.rowStart,tableRow:index+1})): [{text:block.text||'',row:block.rowStart}];
   for(const row of rows)for(const quote of row.text.split(/\n+/)){
    const source={documentId:doc.id||extraction.id,fileName:doc.fileName||extraction.fileName,blockId:block.id,page:block.page??null,section:block.section||'',quote,...(block.sheet?{sheet:block.sheet,rowStart:row.row,rowEnd:row.row}:{})};
    const facts=tableProjectFacts(row,block);
    if(facts.region)put('region',facts.region,{...source,tableRow:row.tableRow});
    if(facts.projectType)put('projectType',facts.projectType,{...source,tableRow:row.tableRow,...(facts.projectType!==facts.originalType?{originalValue:facts.originalType,normalizedValue:facts.projectType}:{})});
    if(/明确(?:为|属于)非政府采购|非政府采购项目|不属于政府采购/.test(quote))put('governmentProcurement',false,source);
    else if(/^(?:\s*政府采购(?!法|活动)[^。；\n]{0,80}(?:项目|文件|公告|招标)|.*(?:本次采购|本项目|项目性质|采购类别)[^。；\n]{0,15}(?:属于|为|按照)?政府采购)/.test(quote)&&!/(?:如|若|不属于|非)政府采购/.test(quote))put('governmentProcurement',true,source);
    const dated=quote.match(/(采购日期|公告发布日期|投标截止日期|开标时间)[：:]\s*(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
    if(dated){const value=`${dated[2]}-${dated[3].padStart(2,'0')}-${dated[4].padStart(2,'0')}`;try{validateProjectContext({projectDate:value});put('projectDate',value,source,({采购日期:4,公告发布日期:3,投标截止日期:2,开标时间:1})[dated[1]]);}catch{}}
    for(const [key,labels]of [['region','项目地点|建设地点|项目所在城市|实施地点'],['province','项目所在省份|建设省份'],['projectType','项目类型|建筑类型'],['buildingStructure','建筑结构|结构形式']]){
     if(['region','projectType'].includes(key)&&(/代理机构|代理单位|采购代理|招标代理/.test(block.section||'')||/(?:代理机构|代理单位|采购代理|招标代理)[^。；|\n]*(?:项目地点|建设地点|项目所在城市|实施地点|项目类型|建筑类型)[：:]/.test(quote)))continue;
     const match=quote.match(new RegExp(`(?:${labels})[：:]\\s*([^；;|，,。\\n]+)`));if(match&&!/^(?:见|详见|参见|按)(?:第|采购|竞标|投标|前|附)/.test(match[1].trim()))put(key,match[1].trim(),source);
    }
    if(/本项目(?:已)?纳入政府采购支持绿色建材[^。；\n]*实施范围/.test(quote))put('localImplementationConfirmed',true,source);
   }
  }
 }
 const result={};for(const [key,items]of values){const priority=Math.max(...items.map(item=>item.priority)),selected=items.filter(item=>item.priority===priority),distinct=[...new Set(selected.map(item=>item.value))];provenance[key]=selected.map(item=>item.source);if(distinct.length===1)result[key]=distinct[0];else{conflictFields.push(key);gaps.push(`${({projectDate:'项目采购日期',governmentProcurement:'政府采购属性',region:'项目地区',projectType:'项目类型',buildingStructure:'结构形式'})[key]||key}存在不同原文值，适用条件待人工核验`);}}
 for(const [key,value]of Object.entries(validateProjectContext(manual))){result[key]=value;const index=conflictFields.indexOf(key);if(index>=0)conflictFields.splice(index,1);provenance[key]=[{kind:'manual',quote:'分析前人工提供的项目适用条件',value}];}
 return {...result,provenance,gaps,conflictFields};
}

// Certificate evaluation uses the user's local calendar; timestamp storage stays UTC.
export function localCalendarDate(now=new Date()){
 return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
