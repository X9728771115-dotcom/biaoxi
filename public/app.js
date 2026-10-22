import {suitabilityAssessmentHTML,suitabilityReviewBody,pricingAnalysisHTML} from './suitability-view.js';
export {suitabilityAssessmentHTML,suitabilityReviewBody,pricingAnalysisHTML} from './suitability-view.js';
import {companyImportFeedbackHTML} from './import-feedback.js';
import {selectSourceItems} from './pdf-highlights.js';
import {sourceZoomState,sourceZoomGeometry,sourceZoomControlsHTML,sourceComparisonRecords,sourceComparisonHTML as comparisonHTML} from './source-zoom.js';
export {sourceZoomState,sourceZoomGeometry,sourceZoomControlsHTML,sourceComparisonRecords} from './source-zoom.js';
import {projectOverviewHTML,prioritySummaryHTML,webChatHTML,procurementPolicyHTML,policyPackageInfoHTML,categoryResultHTML,presentationSectionHTML} from './analysis-view.js';
import {makeCompanyClient, COMPANY_TYPES, companySummary, companyLibraryHTML, recordFormHTML, evidenceRowHTML, recordFromValues, companyWithRecord, companyWithoutRecord, analysisRequestBody, scoreAssessmentBody, companyAnalysisHTML, safeReportConclusion} from './company-view.js';
export {makeCompanyClient, COMPANY_TYPES, companySummary, companyLibraryHTML, recordFormHTML, evidenceRowHTML, recordFromValues, companyWithRecord, companyWithoutRecord, analysisRequestBody, scoreAssessmentBody, companyAnalysisHTML, safeReportConclusion} from './company-view.js';
import {openWebChat} from './web-chat.js';
import {hasNonScoringMethod} from './score-summary.js';
export {openWebChat,webChatControls,performWebChatAction,webChatViewportBounds} from './web-chat.js';
/* Native, dependency-free UI. All findings and conclusions come from the local service. */
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const valueText = value => Array.isArray(value) ? value.map(valueText).join('；') : value && typeof value === 'object' ? Object.entries(value).map(([key,item]) => `${key}：${valueText(item)}`).join('；') : String(value ?? '');
const CORE_FIELDS = /^(?:完整要求|证明材料|时间口径|不满足后果|强制采购|政策属性|评分构成|分值与封顶|评分公式|付款节点与触发条件|采购方式|评审方法|定标机制|保证金类型|是否强制勘查|签署与阶段|证照比对|冲突事项|两处数值|处理要求)$|证明材料|认证要求|认证有效期|适用产品|产品范围|品目|供货期限|提交期限|付款条件|履行期限|签收主体/;
export function partitionFindingFields(fields = {}) {
  const core=[],more=[];
  for(const [label,value] of Object.entries(fields)) {
    const text=valueText(value).trim();if(!text)continue;
    const target=CORE_FIELDS.test(label)?core:more;
    // A single original passage can be the full requirement and a formula or signing rule.
    // Keep every label, but show the identical value only once within each disclosure level.
    const same=target.find(row=>valueText(row.value).replace(/\s+/g,'')===text.replace(/\s+/g,''));
    if(same)same.labels.push(label);else target.push({labels:[label],value});
  }
  return {core,more};
}
export const jobPanelVisible = job => !!job && job.status !== 'completed';
export function scoringSectionHint(report) {
  return hasNonScoringMethod(report)
    ?'本项目采用最低价法，评分加分与得分预测不适用；请核对资格、实质性要求、最终报价及价格排序。'
    :'资料支持预计及人工参考估分可在项目总览查看；技术与报价满分仅是假设，不保证实际评审。';
}
export function webChatUsage({available=false,busy=false}={}) {
  return {
    disabled:!available||busy,
    title:available?'在标析内部登录并分析当前报告':'免费网页自动分析需要标析桌面版',
    reportHelp:available
      ?'用法：离线报告 → 选择平台 → 点击上方分析按钮 → 登录并开始网页分析。无需 API 密钥；DeepSeek 当前仍因平台环境异常未打通，请先用豆包。'
      :'当前为浏览器版：请用上方“AI 深度分析”配置并使用 API。免费网页自动分析仅桌面版支持，用法：选择平台 → 登录 → 开始网页分析；DeepSeek 网页当前仍有环境限制。',
    loginStatus:available
      ?'豆包已完成实际复测；点击“开始网页分析”后才发送所列材料。DeepSeek 当前仍因平台环境异常未打通。'
      :'当前是浏览器版。免费网页自动分析需要标析桌面版；下方为可选 API 接口设置。'
  };
}
export function coverageReviewBody(reviewed,note='',confirmed=false) {
  const basis=String(note).trim();
  if(reviewed&&!confirmed)throw new Error('请勾选已对照原件复核全部覆盖提示。');
  if(reviewed&&!basis)throw new Error('请填写覆盖复核依据。');
  if(reviewed&&basis.length<8)throw new Error('请记录至少8个字的覆盖复核依据。');
  if(basis.length>2000)throw new Error('复核依据不能超过2000字。');
  return {reviewed:!!reviewed,note:basis};
}
export function groupEcoFindings(items = []) {
  const groups=[{id:'mandatory',title:'政府强制采购',items:[]},{id:'pending',title:'政策适用待核验',items:[]},{id:'energy',title:'节能产品',items:[]},{id:'environment',title:'环境标志产品',items:[]},{id:'preference',title:'优先采购与政策加分',items:[]},{id:'other',title:'其他政策要求',items:[]}];
  for(const item of items) {
    const policy=valueText(item.fields?.['强制采购']);
    const quote=String(item.quote||'');
    // Titles and generic parser hints mention every policy even for a plain performance clause.
    const substance=Object.entries(item.fields||{}).filter(([label,value])=>/^(?:政策属性|政策待遇|适用产品|产品范围|节能认证|环境标志认证)$/.test(label)&&!/^(?:本段|仅出现|按原文核验|未明确|需核对|原文未明确)/.test(valueText(value))).map(([,value])=>valueText(value));
    const text=[quote,...substance].join(' ');
    const negative=clause=>/(?:非强制|不强制|不(?:属于|是|要求|实行|执行).{0,15}强制采购)/.test(clause);
    const clauses=quote.split(/[。；;\n]/).filter(clause=>!negative(clause)&&!/[？?]/.test(clause));
    const conditional=clauses.some(clause=>/(?:如|若|当|仅当)[^。；]{0,45}强制采购[^。；]{0,60}(?:须|必须|应|按规定|执行)/.test(clause));
    const explicit=/^(?:原文明确强制采购|有条件适用)/.test(policy)||conditional||(!policy&&clauses.some(clause=>/(?:属于|列为|实行|执行|采用).{0,12}强制采购|强制采购.{0,25}(?:须|必须|应提供|要求)/.test(clause)));
    const ids=[];
    if(explicit)ids.push('mandatory');
    else if(/^仅出现强采标题/.test(policy)||(/强制采购/.test(quote)&&!negative(quote)))ids.push('pending');
    if(/节能/.test(text))ids.push('energy');
    if(/环境标志/.test(text))ids.push('environment');
    if(/优先采购|加分|评分待遇|政策附加|给予\s*\d+(?:\.\d+)?\s*分/.test(text))ids.push('preference');
    if(!ids.length)ids.push('other');
    for(const id of ids)groups.find(group=>group.id===id).items.push(item);
  }
  return groups;
}
export function formatLocation(ref = {}) {
  return [ref.fileName, ref.sheet?`${ref.sheet} / 第${ref.rowStart??'待核'}${ref.rowEnd&&ref.rowEnd!==ref.rowStart?'–'+ref.rowEnd:''}行`:'', ref.page != null ? `第${ref.page}页` : '', ref.section].filter(Boolean).join(' · ') || '出处尚未定位，待核验';
}
export function filterFindings(items = [], query = '', riskOnly = false) {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(item => (!riskOnly || item.hard || item.priority === 'hard' || item.priority === 'pending' || !item.matchStatus || item.matchStatus === 'pending' || item.matchStatus === 'unmet') && (!search || [item.title,item.quote,item.interpretation,valueText(item.fields),valueText(item.notes)].join(' ').toLocaleLowerCase().includes(search)));
}
const sourceComparable=value=>String(value??'').normalize('NFKC').replace(/\s+/g,'');
export function resolveSourceTarget(extraction={},input={}){
  const reference={...input},blocks=extraction.blocks||[],sheets=extraction.sheets||[];
  let block=blocks.find(item=>item.id===reference.blockId);
  const sectionMatch=reference.section?.match(/工作表 (.*?) \/ 第\s*(\d+)(?:[–-](\d+))?\s*行/);
  if(!block&&reference.quote){
    const candidates=blocks.filter(item=>
      (reference.page==null||!item.sheet&&item.page===reference.page)&&
      (!reference.section||item.section===reference.section)&&
      (!reference.workbookFileName||item.fileName===reference.workbookFileName||item.fileName?.endsWith(' / '+reference.workbookFileName))&&
      sourceComparable(item.text).includes(sourceComparable(reference.quote)));
    if(candidates.length===1)block=candidates[0];
  }
  const sheetName=reference.sheet||block?.sheet||sectionMatch?.[1];
  const isSpreadsheet=!!sheetName||['xls','xlsx'].includes(extraction.format);
  if(!isSpreadsheet){
    if(!block&&reference.quote){const candidates=blocks.filter(item=>!item.sheet&&(reference.page==null||item.page===reference.page)&&sourceComparable(item.text).includes(sourceComparable(reference.quote)));if(candidates.length===1)block=candidates[0];}
    return {mode:extraction.format==='pdf'?'pdf':'text',reference:{...reference,page:reference.page??block?.page??(extraction.format==='pdf'?1:null)},block,precise:false};
  }
  if(!block&&reference.section){const candidates=blocks.filter(item=>item.sheet&&item.section===reference.section&&(!sheetName||item.sheet===sheetName));if(candidates.length===1)block=candidates[0];}
  if(!block&&reference.quote){const candidates=blocks.filter(item=>item.sheet&&(!sheetName||item.sheet===sheetName)&&sourceComparable(item.text).includes(sourceComparable(reference.quote)));if(candidates.length===1)block=candidates[0];}
  const wantedName=reference.sheet||block?.sheet||sectionMatch?.[1];
  const workbook=reference.workbookFileName||block?.fileName||reference.fileName;
  const matchesWorkbook=sheet=>!!workbook&&(workbook===sheet.fileName||workbook.endsWith(' / '+sheet.fileName));
  let candidates=sheets.map((sheet,index)=>({sheet,index})).filter(item=>!wantedName||item.sheet.name===wantedName);
  if(Number.isInteger(reference.sheetIndex)&&sheets[reference.sheetIndex]&&(!wantedName||sheets[reference.sheetIndex].name===wantedName))candidates=candidates.filter(item=>item.index===reference.sheetIndex);
  else {const exact=candidates.filter(item=>matchesWorkbook(item.sheet));if(exact.length)candidates=exact;}
  if(candidates.length>1&&wantedName)return {mode:'spreadsheet',reference,block,sheetIndex:null,precise:false,warning:'同名工作表所属工作簿尚未唯一定位，请选择工作簿与工作表。'};
  const selected=candidates[0]||(!wantedName&&sheets.length?{sheet:sheets[0],index:0}:null);
  if(!selected)return {mode:'spreadsheet',reference,block,sheetIndex:null,precise:false,warning:'引用工作表未能定位，请核对工作簿与原文。'};
  let rowStart=Number(reference.rowStart)||null,rowEnd=Number(reference.rowEnd)||rowStart;
  let warning='';
  if(!rowStart&&reference.quote){
    const quote=sourceComparable(reference.quote),scope=block?.sheet===selected.sheet.name?block: null;
    let rows=(scope?.tableRows||blocks.filter(item=>item.sheet===selected.sheet.name&&matchesWorkbook({...selected.sheet,fileName:item.fileName})&&item.tableRows).flatMap(item=>item.tableRows||[])).filter(row=>sourceComparable(row.text||row.cells?.join(' | ')).includes(quote));
    if(!scope&&!rows.length){const cellRows=new Set(selected.sheet.cells.filter(cell=>sourceComparable(cell.displayValue).includes(quote)).map(cell=>cell.source?.row??cell.row));rows=[...cellRows].map(row=>({row}));}
    const numbers=[...new Set(rows.map(row=>row.row??row.rowStart).filter(Number.isInteger))];
    if(numbers.length===1)rowStart=rowEnd=numbers[0];else warning=numbers.length?'引文命中多行，具体行待核对；未将整块范围当作精确定位。':'引文未能定位具体行，请对照工作表核验。';
  }
  if(!rowStart&&sectionMatch&&Number(sectionMatch[2])===Number(sectionMatch[3]||sectionMatch[2]))rowStart=rowEnd=Number(sectionMatch[2]);
  const result={...reference,sheet:selected.sheet.name,sheetIndex:selected.index,workbookFileName:selected.sheet.fileName,page:null};
  if(rowStart){result.rowStart=rowStart;result.rowEnd=rowEnd;}else{delete result.rowStart;delete result.rowEnd;if(!result.windowStart&&block?.rowStart)result.windowStart=block.rowStart;}
  return {mode:'spreadsheet',reference:result,sheetIndex:selected.index,block,precise:!!rowStart,warning};
}
export function resetReportContentScroll(root){const content=root?.querySelector('.analysis-results');if(content)content.scrollTop=0;}
export function spreadsheetSourceHTML(extraction={},reference={}) {
  const target=resolveSourceTarget(extraction,reference),sheets=extraction.sheets||[];reference=target.reference;const sheet=sheets[target.sheetIndex];if(target.mode!=='spreadsheet')return '<p class="muted">所选出处位于原文件页面，请查看原件。</p>';if(!sheet)return `<p class="message warning">${escapeHtml(target.warning||'工作表内容待核验。')}</p>`;
  const byRow=new Map();let maxColumn=1;for(const cell of sheet.cells||[]){const row=cell.source?.row??cell.row,column=cell.source?.column??cell.column;if(!row||!column)continue;maxColumn=Math.max(maxColumn,column);const cells=byRow.get(row)||new Map();cells.set(column,cell);byRow.set(row,cells);}
  const columns=Math.min(1024,Math.max(1,sheet.columnCount||0,maxColumn)),pageRows=Math.min(200,Math.max(1,Math.floor(12000/columns)));
  const rowNumbers=[...byRow.keys()].sort((a,b)=>a-b),selected=Number(reference.rowStart)||rowNumbers[0]||1,start=Number(reference.windowStart)||Math.max(1,selected-Math.min(30,Math.floor(pageRows/3))),visible=rowNumbers.filter(row=>row>=start).slice(0,pageRows),columnName=number=>{let result='';for(let value=number;value;value=Math.floor((value-1)/26))result=String.fromCharCode(65+(value-1)%26)+result;return result;};
  const last=visible.at(-1)||start,hasMore=rowNumbers.some(row=>row>last),highlightEnd=Number(reference.rowEnd)||selected;
  return `<div class="spreadsheet-reader"><label>工作表<select data-sheet-select>${sheets.map((item,index)=>`<option value="${index}"${index===target.sheetIndex?' selected':''}>${item.containerFileName?escapeHtml(item.fileName)+' / ':''}${escapeHtml(item.name)}${item.hidden?'（隐藏表）':''}</option>`).join('')}</select></label>${target.warning?`<p class="message warning">${escapeHtml(target.warning)}</p>`:''}<p class="muted">工作表 ${escapeHtml(sheet.name)} · 显示真实行 ${visible[0]||start}–${last}，共 ${rowNumbers.length} 个有内容行。公式仅显示原件与缓存，不计算、不访问外链。</p><div class="table-scroll"><table class="spreadsheet-source-table"><thead><tr><th scope="col">行</th>${Array.from({length:columns},(_,i)=>`<th scope="col">${columnName(i+1)}</th>`).join('')}</tr></thead><tbody>${visible.map(row=>`<tr data-sheet-row="${row}"${reference.rowStart&&row>=selected&&row<=highlightEnd?' class="source-row-highlight"':''}><th scope="row">${row}</th>${Array.from({length:columns},(_,i)=>{const cell=byRow.get(row).get(i+1);return `<td>${escapeHtml(cell?.displayValue??'')}${cell?.formula?`<details class="cell-formula"><summary>${cell.hasCachedValue||cell.cachedValue!==null&&cell.cachedValue!==undefined?'公式 / 缓存':'公式无缓存，待核验'}</summary><code>${escapeHtml(cell.formula)}</code>${cell.cachedValue!==null&&cell.cachedValue!==undefined?`<small>缓存：${escapeHtml(cell.cachedValue)}</small>`:''}</details>`:''}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="actions"><button type="button" class="btn" data-sheet-window="${Math.max(1,start-pageRows)}"${start<=1?' disabled':''}>前一段</button><label>定位行 <input type="number" min="1" max="100000" value="${selected}" data-sheet-row-jump></label><button type="button" class="btn" data-sheet-window="${last+1}"${hasMore?'':' disabled'}>后一段</button></div><p class="source-caption">Excel按工作表与真实行定位，不推定PDF页码；空白行保留原始编号间隔。</p></div>`;
}
export function sourceContext(text, quote) {
  const raw = String(text ?? ''), excerpt = String(quote ?? '');
  const at = excerpt ? raw.indexOf(excerpt) : -1;
  if (at < 0) return escapeHtml(raw);
  return `${escapeHtml(raw.slice(0,at))}<mark>${escapeHtml(excerpt)}</mark>${escapeHtml(raw.slice(at + excerpt.length))}`;
}
export function sourceDocumentReference(doc={},report=null,quote='') {
  return {documentId:doc.id||report?.documentId,fileName:doc.fileName||(doc.id===report?.documentId?report?.fileName:''),page:null,quote};
}
export function sourcePreviewMode({view='analysis',narrow=false,quiet=false}={}) {
  return view==='companies'||(!quiet&&narrow)?'dialog':'pane';
}
export function reportExportPath(id,format,{details=false}={}) {
  return `/api/reports/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}${details?'&details=1':''}`;
}
export function sourcePaginationState(doc={},requestedPage=1,actualTotal=0,{mode}={}) {
  const isPdf=mode!=='spreadsheet'&&originalPreviewKind(doc)==='pdf',pages=doc.extraction?.pages||[];
  const knownTotal=Math.floor(Number(actualTotal)),total=isPdf?(Number.isFinite(knownTotal)&&knownTotal>0?knownTotal:Math.max(1,pages.length,...pages.map(page=>Number.isFinite(Number(page.number))?Math.floor(Number(page.number)):0))):1;
  const page=Math.min(total,Math.max(1,Math.floor(Number(requestedPage)||1)));
  return {isPdf,total,page,previousDisabled:page<=1,nextDisabled:page>=total};
}
export function originalPreviewKind(doc={}) {
  const format=String(doc.fileName||'').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()||doc.extraction?.format;
  if(format==='pdf')return 'pdf';
  return ['png','jpg','jpeg','webp','bmp'].includes(format)?'image':'download';
}
export function originalFileActionsHTML(doc={}) {
  return `<div class="original-file-actions"><span class="original-file-name">${escapeHtml(doc.fileName||'原文件')}</span><button type="button" class="btn" data-download-original="${escapeHtml(doc.id)}">下载原件</button><span class="original-download-status" role="status"></span></div>`;
}
export function sourceComparisonHTML(company,documentId,selectedId='') {
  return comparisonHTML(company,documentId,selectedId,COMPANY_TYPES);
}
export function apiAnalysisReadiness(settings={}) {
  const checks=[['enabled','启用 API 联网分析','ai-enabled',settings.enabled===true],['hasKey','API 密钥','ai-key',settings.hasKey===true],['model','模型或接入点','ai-model',!!String(settings.model||'').trim()]];
  const missing=checks.filter(([, , ,ready])=>!ready);
  return {ready:!missing.length,missing:missing.map(([,label])=>label),focusId:missing[0]?.[2]||''};
}
export function reportSelectedAttachmentIds(report={}) {
  const generated=new Set((report.embeddedAttachments||[]).filter(entry=>entry.rootDocumentId===report.documentId&&entry.parentDocumentId).map(entry=>entry.documentId));
  const selected=Array.isArray(report.selectedAttachmentIds)?report.selectedAttachmentIds:Array.isArray(report.attachmentIds)?report.attachmentIds:[];
  return selected.filter(id=>!generated.has(id));
}
export function reportOnlineAnalysisBody(report={}) {
  if(typeof report.documentId!=='string'||!report.documentId.trim())throw new Error('请先打开有原文件的报告。');
  const companyId=Object.hasOwn(report,'companyId')?report.companyId:Object.hasOwn(report.companyAnalysis||{},'companyId')?report.companyAnalysis.companyId:report.companySnapshot?.id;
  const context=report.projectContext||{},projectContext={};
  for(const key of ['governmentProcurement','projectDate','region','province','projectType','buildingStructure','localImplementationConfirmed']){
    const value=context[key],sources=context.provenance?.[key];
    const valid=['governmentProcurement','localImplementationConfirmed'].includes(key)?typeof value==='boolean':typeof value==='string'&&value.trim()!==''&&value.length<=200;
    // Only explicitly supplied manual values are replayed as manual input; the
    // service will infer the remaining context again from the original files.
    if(valid&&Array.isArray(sources)&&sources.some(source=>source.kind==='manual'&&source.value===value))projectContext[key]=value;
  }
  return {documentIds:[report.documentId],attachmentIds:reportSelectedAttachmentIds(report),evidenceIds:Array.isArray(report.evidenceIds)?[...report.evidenceIds]:[],...(companyId?{companyId}:{}),mode:'online',...(Object.keys(projectContext).length?{projectContext}:{})};
}
export async function requestOnlineAnalysis(api,body,{openSettings=()=>{}}={}) {
  const settings=await api.request('/api/settings'),readiness=apiAnalysisReadiness(settings);
  if(!readiness.ready){openSettings(readiness,settings);return {action:'settings',settings};}
  const result=await api.request('/api/analyses',{method:'POST',body});
  if(!result.jobId)throw new Error('服务未返回分析任务，请重试。');
  return {...result,action:'submitted',settings};
}
export async function readSourceDocument(api,documentId,cache=new Map()) {
  if(typeof documentId!=='string'||!documentId)throw new Error('请选择已保存的原件。');
  const doc=cache.get(documentId)||await api.request(`/api/documents/${encodeURIComponent(documentId)}`);
  if(doc?.id!==documentId)throw new Error('原件返回编号与所选文件不一致，请刷新资料后重试。');
  cache.set(documentId,doc);return doc;
}
export function makeApiClient(fetcher = globalThis.fetch) {
  let token = '';
  async function request(path, options = {}) {
    const { body, raw = false, unauthenticated = false, ...rest } = options;
    const headers = { ...(rest.headers || {}) };
    if (!unauthenticated && token) headers['X-Biaoxi-Token'] = token;
    let payload = body;
    if (body !== undefined && !(typeof FormData !== 'undefined' && body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body);
    }
    let response;
    try { response = await fetcher(path, { ...rest, headers, body:payload, credentials:'same-origin' }); }
    catch (error) { if (error.name === 'AbortError') throw error; throw new Error('无法连接本地服务，请确认标析正在运行后重试。'); }
    if (!response.ok) {
      let data; try { data = await response.json(); } catch { /* No server error text to expose. */ }
      const message = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message;
      throw new Error(message || `请求未成功（${response.status}），请重试。`);
    }
    if (raw) return response;
    if (response.status === 204) return {};
    return response.json();
  }
  return { request, async bootstrap() { const data = await request('/api/bootstrap', { unauthenticated:true }); token = data.token || ''; return data; } };
}

const MATCH_LABELS = { pending:'待核验', met:'已确认满足', unmet:'已确认不满足', 'not-applicable':'不适用' };
const CATEGORY_STATUS = { pending:'待核验', partial:'部分提取，待核验', found:'已提取条款', located:'已定位', identified:'已提取条款', extracted:'已提取条款', unrecognized:'尚未识别，待核验', absent:'未定位，待核验' };
const STATUS_LABELS = { complete:'已整理', completed:'已整理', partial:'有待核事项', pending:'待核验', offline:'离线分析', online:'联网 AI', 'web-chat':'网页 AI 试验' };
const SUPPORTED = new Set(['pdf','doc','docx','xlsx','xls','png','jpg','jpeg','txt','md','webp','bmp','tif','tiff']);
export const supportsUploadFile = fileName => SUPPORTED.has(String(fileName||'').split('.').pop().toLowerCase());
const ACTIVE_JOBS = new Set(['queued','running']);

if (typeof document !== 'undefined') startApp();

function startApp() {
  const $ = id => document.getElementById(id);
  const api = makeApiClient();
  const companiesApi = makeCompanyClient(api);
  const state = { ready:false, view:'upload', section:{kind:'overview',id:'overview'}, categories:[], outputs:[], reports:[], report:null, files:{tender:[],attachment:[],evidence:[]}, uploading:0, mode:'offline', settings:{enabled:false,provider:'doubao',hasKey:false}, job:null, pollTimer:null, loadSequence:0, sourceSequence:0, sourceRefs:[], documentCache:new Map(),pdfCache:new Map(),readerPage:1,readerDoc:null, exportReportId:null, reviewBusy:new Set(), coverageBusy:new Set(), recordsLoading:false, confirm:null, companies:[],companyId:'',libraryId:'',companyType:'all',companyBusy:false,companyLoadSequence:0,editingRecord:null,deletedRecord:null,companyImportNotice:'',scoreBusy:new Set() };
  state.sourceZoom=sourceZoomState();state.sourceScale=1;state.sourceDimensions=null;state.sourceCompareRecordId='';state.sourceCompanyId='';
  let toastTimer, sourceReturnFocus, sourceResizeTimer, webChatOpening=false, focusRefreshing=false;
  const webChatAvailable=typeof window.biaoxiWebChat?.open==='function';
  function renderWebChatAvailability(){
    const guidance=webChatUsage({available:webChatAvailable,busy:webChatOpening});
    for(const id of ['open-web-chat','open-web-chat-login']){const button=$(id);button.disabled=guidance.disabled;button.title=guidance.title;}
    $('web-chat-report-help').textContent=guidance.reportHelp;
    const status=$('web-chat-login-status');
    if(!webChatAvailable||!status.dataset.initialized){status.textContent=guidance.loginStatus;status.dataset.initialized='true';}
  }
  function renderApiAvailability() {
    const readiness=apiAnalysisReadiness(state.settings),busy=!!activeJob()||state.aiStarting===true;
    $('report-ai-analysis').disabled=!state.report||busy;
    $('report-ai-analysis').textContent=state.aiStarting?'正在提交 AI 分析…':`AI 深度分析${readiness.ready?'':' · 需配置 API'}`;
    $('report-ai-status').textContent=readiness.ready?'使用已配置的 API；点击后分析当前报告的原文件、关联附件及证照。':`${webChatAvailable?'API 深度分析':'当前浏览器的 AI 深度分析'}需配置：${readiness.missing.join('、')}。点击上方按钮前往设置。`;
    const configure=$('configure-online-ai');configure.hidden=state.mode!=='online'||readiness.ready;
    configure.disabled=busy;
    if(state.mode==='online')$('mode-help').textContent=readiness.ready?'已具备 API 配置；仅开始本次分析时发送所选主文件、附件及证照的提取内容。':`联网 AI 尚缺：${readiness.missing.join('、')}。请点击“去配置 AI”；配置完成前不会发送文件。`;
    if(state.aiConfigRequested){
      $('ai-configuration-notice').hidden=false;
      $('ai-configuration-notice').textContent=readiness.ready?'API 配置已具备。请返回原报告点击“AI 深度分析”，或返回上传页开始联网分析。':`AI 深度分析尚缺：${readiness.missing.join('、')}。请补齐并保存设置，再返回报告或上传页开始分析。`;
    }
  }
  function openAiConfiguration(readiness=apiAnalysisReadiness(state.settings),settings=state.settings) {
    state.settings=settings;state.aiConfigRequested=true;openView('settings');renderApiAvailability();
    $('settings-form').scrollIntoView({block:'start'});$(readiness.focusId||'ai-provider')?.focus({preventScroll:true});
  }
  const icon = id => `<svg aria-hidden="true"><use href="#i-${escapeHtml(id)}"/></svg>`;
  const allFindings = report => (report?.categories || []).flatMap(category => category.items || []);
  const currentFindings = () => allFindings(state.report);
  const activeJob = () => state.job && ACTIVE_JOBS.has(state.job.status);
  function errorText(error) {
    let message = String(error?.message || error || '操作未完成，请重试。');
    const typedKey = $('ai-key')?.value?.trim();
    if (typedKey) message = message.split(typedKey).join('[密钥已隐藏]');
    return message;
  }
  function showError(error) { $('app-error').textContent = errorText(error); $('app-error').hidden = false; }
  function clearError() { $('app-error').hidden = true; $('app-error').textContent = ''; }
  function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(() => {$('toast').hidden=true;},4200); }
  function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
  function fileSize(value) { const bytes = Number(value) || 0; return bytes >= 1048576 ? `${(bytes/1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.ceil(bytes/1024)} KB` : `${bytes} B`; }
  function emptyState(title, description, action = '') { return `<div class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${action}</div>`; }
  function renderNavigation() {
    $('output-nav').innerHTML = `<button type="button" class="side-link" data-overview ${state.section.kind==='overview'&&state.view==='analysis'?'aria-current="page"':''}>项目总览</button>`+state.outputs.map(output => `<button type="button" class="side-link" data-section-kind="output" data-section-id="${escapeHtml(output.id)}" ${state.section.kind==='output'&&state.section.id===output.id&&state.view==='analysis'?'aria-current="page"':''}>${escapeHtml(output.title)}</button>`).join('');
    $('category-nav').innerHTML = state.categories.map(category => {const result=state.report?.categories?.find(item=>item.id===category.id);const status=category.id==='scoring'&&state.report&&hasNonScoringMethod(state.report)?'不适用':result?.items?.length?(result.items.every(item=>item.reviewed)?'已复核':'待核验'):'未明确';return `<button type="button" class="side-link" data-section-kind="category" data-section-id="${escapeHtml(category.id)}" ${state.section.kind==='category'&&state.section.id===category.id&&state.view==='analysis'?'aria-current="page"':''}>${escapeHtml(category.title)}${state.report?`<span class="nav-status">${status}</span>`:''}</button>`;}).join('');
    const options = [{id:'overview',title:'项目总览',kind:'overview'},...state.outputs.map(item => ({...item,kind:'output'})),...state.categories.map(item => ({...item,kind:'category'}))];
    $('mobile-section').innerHTML = options.map(item => `<option value="${escapeHtml(item.kind)}:${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('');
    $('mobile-section').value = `${state.section.kind}:${state.section.id}`;
  }
  function openView(view) {
    if (view === 'analysis' && !state.report) view = 'upload';
    state.view=view;
    document.querySelector('.category-directory').open=view==='analysis';
    ['upload','analysis','records','companies','settings'].forEach(name => {$(name+'-view').hidden=name!==view;});
    document.querySelectorAll('.top-nav').forEach(button => {
      const selected = button.dataset.view===view || button.dataset.view==='analysis'&&view==='upload';
      if(selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    renderNavigation();
    if(view==='records') loadRecords().catch(showError);
    if(view==='companies') loadCompanies().catch(showError);
    if(view==='settings') loadSettings().catch(showError);
    if(view==='analysis') renderReport();
    window.scrollTo({top:0,behavior:'auto'});
  }
  function chooseSection(kind,id) {
    state.section={kind,id};
    if(!state.report) {openView('upload'); toast('请先上传并分析主招标文件。');return;}
    openView('analysis');resetReportContentScroll(document);
  }
  function renderFileLists() {
    for(const role of ['tender','attachment','evidence']) {
      $(role+'-list').innerHTML=state.files[role].map(doc => `<li>${icon('file')}<span class="file-copy">${escapeHtml(doc.fileName || doc.name)}<small>${fileSize(doc.byteSize ?? doc.size)} · 已保存，待本次分析</small></span><button type="button" class="icon-btn" data-remove-role="${role}" data-document-id="${escapeHtml(doc.id)}" aria-label="从本次分析移除 ${escapeHtml(doc.fileName || doc.name)}" ${activeJob()?'disabled':''}>×</button></li>`).join('');
    }
    $('start-analysis').disabled=!state.ready||!state.files.tender.length||state.uploading>0||!!activeJob()||state.aiStarting===true;
    $('dropzone').setAttribute('aria-disabled',String(!state.ready||!!activeJob()));
    document.querySelectorAll('[data-pick-role]').forEach(button => {button.disabled=!state.ready||!!activeJob();});
  }
  async function uploadFiles(files,role='tender') {
    if(!state.ready) {showError('本地服务尚未连接，请先重试连接。');return;}
    if(activeJob()) {toast('当前正在分析，请等待完成或先取消。');return;}
    const chosen=Array.from(files || []); if(!chosen.length)return;
    const invalid=chosen.find(file=>!supportsUploadFile(file.name));
    if(invalid){showError(`${invalid.name} 的格式不支持。支持 PDF、Word（DOC/DOCX）、Excel（XLSX/XLS）、图片和 TXT。`);return;}
    if(chosen.length>20){showError('每次最多选择20份文件，请分批上传。');return;}
    const oversizedExcel=chosen.find(file=>['xls','xlsx'].includes(file.name.split('.').pop().toLowerCase())&&file.size>20*1024*1024);
    if(oversizedExcel){showError(`${oversizedExcel.name} 超过Excel20MB解析上限，请拆分后上传。`);return;}
    const oversized=chosen.find(file=>file.size>100*1024*1024);
    if(oversized){showError(`${oversized.name} 超过单文件100 MB限制。`);return;}
    clearError();state.uploading++;$('upload-status').textContent=`正在上传 ${chosen.length} 份文件…`;renderFileLists();
    const form=new FormData();chosen.forEach(file=>form.append('files',file));form.append('role',role);
    try {
      const result=await api.request('/api/documents',{method:'POST',body:form});
      if(!Array.isArray(result.documents)||!result.documents.length)throw new Error('服务未返回已保存文件，请重试上传。');
      state.files[role].push(...result.documents);toast(`已保存 ${result.documents.length} 份文件，可开始本次分析。`);
    }catch(error){showError(error);}
    finally{state.uploading--;$(role+'-input').value='';$('upload-status').textContent=state.uploading?'仍有文件正在上传…':'';renderFileLists();}
  }
  function updateMode() {
    state.mode=document.querySelector('input[name="analysis-mode"]:checked').value;
    $('mode-help').textContent=state.mode==='online'?'仅开始本次联网分析时，所选主文件、附件及证照的提取内容才发送给已配置服务商；需先启用 AI 接口。':'本地文字识别与规则整理；复杂语义及依据不足的内容保留待核验。';
    renderApiAvailability();
  }
  async function startAnalysis() {
    if(!state.files.tender.length || activeJob() || state.uploading || state.aiStarting)return;
    if(state.files.tender.length>20 || state.files.attachment.length>20 || state.files.evidence.length>20){showError('本次每种用途最多选择20份文件，请移除多余文件。');return;}
    state.aiStarting=true;clearError();$('start-analysis').disabled=true;renderApiAvailability();
    try{
      const payload=analysisRequestBody(state);
      const result=state.mode==='online'?await requestOnlineAnalysis(api,payload,{openSettings:openAiConfiguration}):await api.request('/api/analyses',{method:'POST',body:payload});
      if(result.settings)state.settings=result.settings;
      if(result.action==='settings')return;
      if(!result.jobId)throw new Error('服务未返回分析任务，请重试。');
      state.job={id:result.jobId,status:'queued',progress:0,message:'已提交任务，等待读取文件',reportIds:[]};
      renderJob();renderFileLists();pollJob();
    }catch(error){showError(error);}finally{state.aiStarting=false;renderFileLists();renderApiAvailability();}
  }
  async function startReportOnlineAnalysis() {
    if(!state.report||activeJob()||state.aiStarting)return;
    const report=state.report;state.aiStarting=true;clearError();renderApiAvailability();renderFileLists();
    try {
      const result=await requestOnlineAnalysis(api,reportOnlineAnalysisBody(report),{openSettings:openAiConfiguration});
      state.settings=result.settings;if(result.action==='settings')return;
      state.job={id:result.jobId,status:'queued',progress:0,message:'已提交当前报告的 AI 深度分析，等待读取原文件',reportIds:[]};
      renderJob();renderFileLists();pollJob();toast('已开始 AI 深度分析，完成后显示新报告。');
    }catch(error){showError(error);}
    finally{state.aiStarting=false;renderApiAvailability();renderFileLists();}
  }
  function renderJob() {
    renderApiAvailability();
    const job=state.job;if(!jobPanelVisible(job)){$('job-panel').hidden=true;return;}
    $('job-panel').hidden=false;
    const titles={queued:'等待分析',running:'正在分析',completed:'本次分析已结束',failed:'本次分析未完成',cancelled:'分析已取消'};
    $('job-title').textContent=titles[job.status]||'读取任务状态';
    const progress=Number(job.progress);
    if(Number.isFinite(progress))$('job-progress').value=Math.max(0,Math.min(100,progress));else $('job-progress').removeAttribute('value');
    $('job-message').textContent=job.message||job.error||'';
    $('cancel-job').hidden=!ACTIVE_JOBS.has(job.status);$('cancel-job').disabled=!!job.cancelling;
    $('cancel-job').textContent=job.cancelling?'正在取消…':'取消分析';
    $('job-actions').innerHTML=!ACTIVE_JOBS.has(job.status)?`${job.reportIds?.length?'<button type="button" class="btn" data-job-results>查看已保存报告</button>':''}<button type="button" class="btn" data-dismiss-job>收起进度</button>`:'';
  }
  async function pollJob() {
    clearTimeout(state.pollTimer);const id=state.job?.id;if(!id)return;
    try {
      const job=await api.request(`/api/jobs/${encodeURIComponent(id)}`);
      if(state.job?.id!==id)return;
      state.job={...state.job,...job};renderJob();renderFileLists();
      if(ACTIVE_JOBS.has(job.status)){state.pollTimer=setTimeout(pollJob,1100);return;}
      await loadRecords(false).catch(showError);
      if(job.reportIds?.length){await loadReport(job.reportIds[0]);}
      if(job.status==='completed')toast(`本次分析已结束，已保存 ${job.reportIds?.length||0} 份独立报告。`);
      if(job.status==='failed')showError(job.error||job.message||'分析未完成，请查看任务信息。');
      if(job.status==='cancelled')toast('分析已取消，已生成报告可从报告记录查看。');
    }catch(error){
      if(state.job?.id!==id)return;
      $('job-message').textContent=errorText(error)+' 任务可能仍在运行。';
      $('job-actions').innerHTML='<button type="button" class="btn" data-retry-job>重新读取进度</button>';
      state.pollTimer=setTimeout(pollJob,4000);
    }
  }
  async function cancelJob() {
    if(!activeJob()||state.job.cancelling)return;
    state.job.cancelling=true;renderJob();
    try{await api.request(`/api/jobs/${encodeURIComponent(state.job.id)}/cancel`,{method:'POST'});pollJob();}
    catch(error){state.job.cancelling=false;renderJob();showError(error);}
  }
  function renderReportSelect() {
    const reports=[...state.reports];if(state.report&&!reports.some(report=>report.id===state.report.id))reports.unshift(state.report);
    $('report-select').innerHTML=reports.map(report=>`<option value="${escapeHtml(report.id)}">${escapeHtml(report.fileName)}</option>`).join('');
    $('report-select').value=state.report?.id||'';
  }
  async function loadReport(id,{overview=false,preserveView=false}={}) {
    if(!id)return;
    const sequence=++state.loadSequence;clearError();$('report-loading').hidden=false;
    try{
      const report=await api.request(`/api/reports/${encodeURIComponent(id)}`);
      if(sequence!==state.loadSequence)return;
      const preserve=preserveView&&state.report?.id===id&&state.view==='analysis';
      state.report=report;
      if(preserve){renderReport();renderReportSelect();}
      else{state.section={kind:'overview',id:'overview'};$('finding-search').value='';$('risk-filter').checked=false;openView('analysis');renderReportSelect();await openSource('',report.documentId,undefined,true);}
    }catch(error){showError(error);}
    finally{if(sequence===state.loadSequence)$('report-loading').hidden=true;}
  }
  function normalizeList(items=[]) {
    return Array.isArray(items)?items.map(item=>typeof item==='string'?(currentFindings().find(finding=>finding.id===item)||{id:'',title:item,matchStatus:'pending'}):item).filter(Boolean):[];
  }
  function findingHTML(item) {
    const match=item.matchStatus||'pending';
    const hard=!!item.hard||item.priority==='hard', pending=item.priority==='pending';
    const classes=hard?'hard':pending?'pending':item.priority==='policy'?'policy':'';
    const references=Array.isArray(item.references)?item.references:[];
    const source=references[0]||(typeof item.source==='object'?item.source:{});
    const displayFields=Object.fromEntries(Object.entries(item.fields||{}).filter(([key])=>key!=='完整要求'));
    const fields=partitionFindingFields(displayFields);
    const fieldRows=rows=>rows.map(({labels,value})=>`<dt${labels.includes('强制采购')?' class="procurement-field"':''}>${labels.map(escapeHtml).join(' / ')}</dt><dd${labels.includes('强制采购')?' class="procurement-field"':''}>${escapeHtml(valueText(value))}</dd>`).join('');
    const quoteShown=fields.core.some(row=>valueText(row.value).replace(/\s+/g,'')===String(item.quote||'').replace(/\s+/g,''));
    const coreHTML=fields.core.length?`<dl class="fields">${fieldRows(fields.core)}</dl>`:'';
    const moreHTML=fields.more.length?`<details class="more-details"><summary>更多解析 <span>${fields.more.reduce((count,row)=>count+row.labels.length,0)} 项</span></summary><dl class="fields">${fieldRows(fields.more)}</dl></details>`:'';
    const quoteHTML=item.quote&&!quoteShown?`<details class="quote-details"><summary>条款原文</summary><blockquote>${escapeHtml(item.quote)}</blockquote></details>`:'';
    const options=Object.entries(MATCH_LABELS).map(([value,label])=>`<option value="${value}" ${match===value?'selected':''}>${label}</option>`).join('');
    const note=item.reviewNote||'';
    return `<article class="finding ${classes}" data-finding="${escapeHtml(item.id)}"><div class="finding-heading"><h3>${escapeHtml(item.title||'待核验条款')}</h3><div class="badges">${hard?`<span class="badge hard">${item.conditional?'条件性硬要求':'硬性要求'}</span>`:''}${item.priority==='policy'?'<span class="badge">政策要求</span>':''}<span class="badge ${match==='met'?'met':match==='pending'?'pending':match==='unmet'?'hard':''}">${escapeHtml(MATCH_LABELS[match]||match)}</span>${item.reviewed?'<span class="badge">已人工复核</span>':''}</div></div>${item.interpretation?`<p class="interpretation">${escapeHtml(item.interpretation)}</p>`:''}${item.impact?`<p class="business-impact"><strong>投标影响</strong>${escapeHtml(item.impact)}</p>`:''}${item.actions?.length?`<div class="business-actions"><strong>准备事项</strong><ul>${item.actions.map(action=>`<li>${escapeHtml(valueText(action))}</li>`).join('')}</ul></div>`:''}${coreHTML}${moreHTML}${quoteHTML}${item.notes?.length?`<p class="saved-note">${escapeHtml(valueText(item.notes))}</p>`:''}<div class="finding-footer"><span class="finding-location">依据：${escapeHtml(formatLocation(source))}${references.length>1?`（共${references.length}处）`:''}</span>${item.id?`<button type="button" class="btn link" data-source-finding="${escapeHtml(item.id)}">查看原文 ${icon('chevron')}</button>`:''}</div>${item.id?`<details class="review-panel"><summary>人工复核与备注</summary><form class="review-form" data-review-finding="${escapeHtml(item.id)}"><label>本次核验状态<select name="status">${options}</select></label><label>复核依据或待办<textarea name="note" maxlength="2000" placeholder="记录依据、缺失材料或需要澄清的内容">${escapeHtml(note)}</textarea></label><button type="submit" class="btn" ${state.reviewBusy.has(item.id)?'disabled':''}>${state.reviewBusy.has(item.id)?'提交中…':'提交复核'}</button><span class="review-response" role="status"></span></form></details>`:''}</article>`;
  }
  function warningHTML() {
    const report=state.report;const warnings=Array.isArray(report.warnings)?report.warnings:[];
    const label=safeReportConclusion(report).label;
    let html=label==='待核验'||!label?'<div class="message warning"><strong>参与条件待核验</strong><p>企业材料缺失或条款依据不足时，保留待核状态；未识别到要求不等于没有要求。</p></div>':'';
    if(warnings.length)html+=`<details class="coverage-details"><summary>本报告有 ${warnings.length} 项读取或分析提示</summary><ul>${warnings.map(warning=>`<li>${escapeHtml(typeof warning==='string'?warning:warning.message||warning.code)}${warning.page!=null?`（第${escapeHtml(warning.page)}页）`:''}</li>`).join('')}</ul></details>`;
    return html;
  }
  function conclusionHTML() {
    const conclusion=safeReportConclusion(state.report);
    const tone=conclusion.label==='可投'?'met':conclusion.label==='不建议投'?'unmet':'';
    const list=value=>Array.isArray(value)?value:typeof value==='string'&&value?[value]:[];
    const reasons=list(conclusion.reasons),conditions=list(conclusion.conditions);
    return `<div class="conclusion-block ${tone}"><h3>${escapeHtml(conclusion.label||'待核验')}</h3>${reasons.length?`<h4>判断理由</h4><ul>${reasons.map(reason=>`<li>${escapeHtml(valueText(reason))}</li>`).join('')}</ul>`:''}${conditions.length?`<h4>前提与待核事项</h4><ul>${conditions.map(condition=>`<li>${escapeHtml(valueText(condition))}</li>`).join('')}</ul>`:''}</div><p class="muted">资料缺失不能判为已确认不满足；硬性门槛不能用评分加分抵消。</p>`;
  }
  function renderOverview() {
    const report=state.report;
    let html=suitabilityAssessmentHTML(report)+prioritySummaryHTML(report)+pricingAnalysisHTML(report)+companyAnalysisHTML(report)+projectOverviewHTML(report)+webChatHTML(report);
    html+=`<section class="overview-section"><h2>14类分析覆盖</h2><div class="category-coverage">${state.categories.map(category=>{const result=report.categories?.find(item=>item.id===category.id),status=category.id==='scoring'&&hasNonScoringMethod(report)?'最低价法：不适用':CATEGORY_STATUS[result?.status]||result?.status||'未定位，待核验';return `<div class="coverage-row"><span>${escapeHtml(category.title)}</span><span>${escapeHtml(`${result?.items?.length?result.items.length+'条 · ':''}${status}`)}</span></div>`;}).join('')}</div></section>`;
    return html+coverageReviewHTML();
  }
  function coverageReviewHTML() {
    const report=state.report,coverage=report.coverage||{},review=report.coverageReview||{},busy=state.coverageBusy.has(report.id);
    const missing=(coverage.missingCategories||[]).map(value=>state.categories.find(category=>category.id===value)?.title||value);
    const blocks=Array.isArray(coverage.unrecognizedBlocks)?coverage.unrecognizedBlocks:[],warnings=Array.isArray(report.warnings)?report.warnings:[];
    const list=values=>values.length?values.map(escapeHtml).join('、'):'当前无记录';
    return `<details class="coverage-review"><summary>读取覆盖复核 <span>${review.reviewed?'已人工确认':'待人工复核'}</span></summary><div class="coverage-review-body"><dl class="fields"><dt>文件读取</dt><dd>${coverage.complete===true?'读取状态完整，仍须核对未归类内容':'存在读取或附件缺口，请对照原件复核'}</dd><dt>未识别类别</dt><dd>${list(missing)}</dd><dt>未归类段落</dt><dd>${blocks.length} 处</dd><dt>待补附件</dt><dd>${list(coverage.missingAttachments||[])}</dd></dl>${blocks.length?`<details class="unclassified-details"><summary>查看未归类段落出处</summary><ul>${blocks.map((ref,index)=>`<li><span>${escapeHtml(formatLocation(ref))}</span><button type="button" class="btn link" data-coverage-reference="${index}">查看原文</button></li>`).join('')}</ul></details>`:''}<div class="coverage-warnings"><h4>读取与分析提示</h4>${warnings.length?`<ul>${warnings.map(warning=>`<li>${escapeHtml(typeof warning==='string'?warning:warning.message||warning.code)}${warning.page!=null?`（第${escapeHtml(warning.page)}页）`:''}</li>`).join('')}</ul>`:'<p>当前无读取提示记录；请仍对照原件检查覆盖。</p>'}</div><p class="coverage-boundary">此复核仅确认已检查读取覆盖，不替代各条款的核验，不会自动判为可投。</p>${review.reviewed?`<p class="saved-note"><strong>已保存的复核依据：</strong>${escapeHtml(review.note||'')}${review.reviewedAt?`<br>${escapeHtml(formatDate(review.reviewedAt))}`:''}</p><button type="button" class="btn" data-revoke-coverage ${busy?'disabled':''}>${busy?'提交中…':'撤销覆盖复核'}</button><span class="coverage-response" role="status"></span>`:`${review.note?`<p class="saved-note">此前记录：${escapeHtml(review.note)}</p>`:''}<form class="coverage-review-form"><label class="coverage-confirm"><input type="checkbox" name="confirmed" required>已对照原件复核上述提示、未归类内容和未识别类别</label><label>复核依据<textarea name="note" required minlength="8" maxlength="2000" placeholder="至少8字，记录核对的原件、章节、附件及缺口处理依据">${escapeHtml(review.note||'')}</textarea></label><div class="actions"><button type="submit" class="btn" ${busy?'disabled':''}>${busy?'提交中…':'提交覆盖复核'}</button><span class="coverage-response" role="status"></span></div></form>`}</div></details>`;
  }
  async function submitCoverageReview(form,reviewed=true) {
    const reportId=state.report?.id;if(!reportId||state.coverageBusy.has(reportId))return;
    const panel=document.querySelector('.coverage-review'),response=panel?.querySelector('.coverage-response');
    let body;
    try{body=coverageReviewBody(reviewed,reviewed?form.elements.note.value:state.report.coverageReview?.note||'',reviewed?form.elements.confirmed.checked:false);}catch(error){if(response)response.textContent=errorText(error);return;}
    state.coverageBusy.add(reportId);panel?.querySelectorAll('button').forEach(button=>button.disabled=true);if(response)response.textContent='正在保存覆盖复核…';
    try{
      const report=await api.request(`/api/reports/${encodeURIComponent(reportId)}/coverage-review`,{method:'POST',body});
      state.coverageBusy.delete(reportId);
      if(state.report?.id===reportId){state.report=report;renderReport();const updated=document.querySelector('.coverage-review');if(updated)updated.open=true;}
      loadRecords(false).catch(()=>{});toast(reviewed?'覆盖复核已保存；各条款仍按实际核验状态判断。':'覆盖复核已撤销，读取覆盖重新保留待核验。');
    }catch(error){if(response?.isConnected)response.textContent=errorText(error);}
    finally{state.coverageBusy.delete(reportId);if(panel?.isConnected)panel.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  function ecoHTML(items) {
    return groupEcoFindings(items).filter(group=>!['pending','other'].includes(group.id)||group.items.length).map(group=>`<section class="eco-group ${group.id==='mandatory'?'mandatory-group':''}"><h3 class="eco-group-title">${escapeHtml(group.title)}</h3>${group.id==='mandatory'?'<p class="group-help">逐项核验适用产品、认证及有效期、例外和后果；条件性强采须核实适用范围。</p>':group.id==='pending'?'<p class="group-help">标题、分类提示或待核问题保留在此，不能直接认定强采适用。</p>':''}${group.items.length?group.items.map(findingHTML).join(''):`<p class="eco-empty">${group.id==='mandatory'?'当前未定位明确或条件性强采条款，请继续核对品目及附件。':'尚未单独定位条款，未识别不等于没有要求。'}</p>`}</section>`).join('');
  }
  function renderReport() {
    if(!state.report)return;
    renderApiAvailability();
    const report=state.report;renderNavigation();renderReportSelect();
    const overview=state.section.kind==='overview';
    $('result-title').textContent=overview?'项目总览':'分析结果';
    $('report-mode').textContent=`${STATUS_LABELS[report.mode]||report.mode||'分析方式待核验'}${report.onlineFailed?'（联网失败，保留离线结果）':''}`;
    $('report-notice').innerHTML=warningHTML();
    document.querySelector('.result-toolbar').hidden=overview;
    if(overview){$('report-content').innerHTML=renderOverview();return;}
    const rawCategory=state.section.kind==='category'?report.categories?.find(item=>item.id===state.section.id):null;
    const category=state.section.kind==='category'?(report.presentation?.categories?.find(item=>item.id===state.section.id)||rawCategory):null;
    const output=state.outputs.find(item=>item.id===state.section.id);
    const title=category?.title||state.categories.find(item=>item.id===state.section.id)?.title||output?.title||'分析条款';
    if(state.section.id==='conclusion'&&state.section.kind==='output'){
      $('report-content').innerHTML=`<div class="content-heading"><h2>${escapeHtml(title)}</h2></div>${conclusionHTML()}<div class="actions" style="margin-top:25px"><button type="button" class="btn" data-overview>查看四项完整报告</button><button type="button" class="btn" data-export-current>导出报告</button></div>`;return;
    }
    const raw=state.section.kind==='category'?normalizeList(category?.items):normalizeList((report.presentation?.outputs||report.outputs)?.[state.section.id]);
    const visible=filterFindings(raw,$('finding-search').value,$('risk-filter').checked);
    const hint=state.section.id==='scoreItems'||state.section.id==='scoring'?scoringSectionHint(report):state.section.id==='risks'||state.section.id==='rejection'?'硬性条款高亮；是否触发须结合原文及企业事实核验。':'原文、字段与企业核验状态逐项对应。';
    const eco=state.section.kind==='category'&&state.section.id==='eco';
    const hasPresentation=!!report.presentation;
    const rawItems=state.section.kind==='category'?normalizeList(rawCategory?.items):normalizeList(report.outputs?.[state.section.id]);
    const content=hasPresentation?presentationSectionHTML({items:visible,rawItems,rawHTML:rawItems.map(findingHTML).join(''),hasFilter:!!$('finding-search').value.trim()||$('risk-filter').checked,documentId:report.documentId}):visible.length?(eco?ecoHTML(visible):visible.map(findingHTML).join('')):emptyState(raw.length?'没有符合筛选的条款':'尚未定位到这类条款',raw.length?'清除搜索或风险筛选后查看全部条款。':'规则未识别不等于文件没有要求，请通过原文和附件继续核验。',raw.length?'<button type="button" class="btn" data-clear-filter>清除筛选</button>':`<button type="button" class="btn" data-open-document="${escapeHtml(report.documentId)}">查看主文件原文</button>`);
    $('report-content').innerHTML=`<div class="content-heading"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(hint)}</p></div>${eco?procurementPolicyHTML(report):''}${content}`;
  }
  async function submitReview(form) {
    const id=form.dataset.reviewFinding;if(state.reviewBusy.has(id))return;
    const reportId=state.report.id,body={findingId:id,status:form.elements.status.value,note:form.elements.note.value.trim()};
    const response=form.querySelector('.review-response'),button=form.querySelector('button[type="submit"]');
    state.reviewBusy.add(id);button.disabled=true;button.textContent='提交中…';response.textContent='';
    try{
      const result=await api.request(`/api/reports/${encodeURIComponent(reportId)}/review`,{method:'POST',body});
      state.reviewBusy.delete(id);
      if(state.report?.id===reportId){state.report=result;renderReport();}
      loadRecords(false).catch(()=>{});toast('复核状态与备注已保存，报告结论已更新。');
    }catch(error){response.textContent=errorText(error);}
    finally{state.reviewBusy.delete(id);if(button.isConnected){button.disabled=false;button.textContent='提交复核';}}
  }
  async function loadRecords(render=true) {
    state.recordsLoading=true;$('records-status').textContent='正在读取报告记录…';$('refresh-records').disabled=true;
    if(render&&!state.reports.length)$('records-content').innerHTML='<div class="loading-line">正在读取报告记录…</div>';
    try{const result=await api.request('/api/reports');state.reports=Array.isArray(result.reports)?result.reports:[];if(render||state.view==='records')renderRecords();renderReportSelect();$('records-status').textContent='';return state.reports;}
    catch(error){$('records-status').textContent=errorText(error);if(render)$('records-content').innerHTML=emptyState('报告记录未能读取','请确认本地服务状态，然后刷新记录。');throw error;}
    finally{state.recordsLoading=false;$('refresh-records').disabled=false;}
  }
  function renderRecords() {
    const query=$('record-search').value.trim().toLocaleLowerCase();
    const reports=state.reports.filter(report=>String(report.fileName||'').toLocaleLowerCase().includes(query));
    if(!reports.length){$('records-content').innerHTML=emptyState(query?'没有匹配报告':'还没有分析报告',query?'尝试其他文件名称。':'上传主招标文件并开始分析，完成后可在这里查看与导出。',!query?'<button type="button" class="btn primary" data-view="upload">上传招标文件</button>':'');return;}
    $('records-content').innerHTML=`<table class="history-table"><thead><tr><th scope="col">招标文件</th><th scope="col" class="history-label">报告结论</th><th scope="col" class="history-mode">分析方式</th><th scope="col">操作</th></tr></thead><tbody>${reports.map(report=>`<tr><td>${escapeHtml(report.fileName)}<span class="timestamp">${escapeHtml(formatDate(report.createdAt))}</span></td><td class="history-label">${escapeHtml(typeof report.conclusion==='string'?report.conclusion:report.outputs?.conclusion?.label||'待核验')}</td><td class="history-mode">${escapeHtml(STATUS_LABELS[report.mode]||report.mode||'待核验')}</td><td><div class="actions"><button type="button" class="btn link" data-open-report="${escapeHtml(report.id)}">查看</button><button type="button" class="btn link" data-export-report="${escapeHtml(report.id)}">导出</button><button type="button" class="btn link danger" data-delete-report="${escapeHtml(report.id)}">删除</button></div></td></tr>`).join('')}</tbody></table>`;
  }
  function showConfirm(title,message,action,label='确认') {
    state.confirm=action;$('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-action').textContent=label;$('confirm-action').disabled=false;$('confirm-dialog').showModal();
  }
  function deleteReport(id) {
    const report=state.reports.find(item=>item.id===id)||state.report;
    showConfirm('删除报告',`删除“${report?.fileName||'该文件'}”的这份报告？删除后无法从报告记录恢复。`,async()=>{
      await api.request(`/api/reports/${encodeURIComponent(id)}`,{method:'DELETE'});
      if(state.report?.id===id){state.report=null;state.loadSequence++;openView('records');}
      await loadRecords();toast('报告已删除。');
    },'删除报告');
  }
  function openExport(id) {
    const report=state.reports.find(item=>item.id===id)||(state.report?.id===id?state.report:null);
    if(!id)return;state.exportReportId=id;$('export-file-name').textContent=report?.fileName||'所选独立报告';$('export-status').textContent='';$('export-details').checked=false;$('export-dialog').showModal();
  }
  async function downloadReport(format) {
    const id=state.exportReportId;if(!id)return;
    $('export-dialog').classList.add('export-busy');document.querySelectorAll('[data-export-format]').forEach(button=>button.disabled=true);$('export-status').textContent=`正在生成 ${format==='pdf'?'PDF':'Word'} 报告…`;
    try{
      const response=await api.request(reportExportPath(id,format,{details:$('export-details').checked}),{raw:true});
      const blob=await response.blob();if(!blob.size)throw new Error('导出文件为空，请重试。');
      const report=state.reports.find(item=>item.id===id)||(state.report?.id===id?state.report:null);
      const disposition=response.headers.get('Content-Disposition')||'';
      let name=`${report?.fileName||'标析'}-分析报告.${format}`;
      const match=disposition.match(/filename\*=UTF-8''([^;]+)/i);if(match){try{name=decodeURIComponent(match[1]);}catch{/* Keep local filename. */}}
      const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
      $('export-status').textContent=`${format==='pdf'?'PDF':'Word'} 报告已生成。`;toast('报告已生成，下载包含当前复核状态和原文出处。');
    }catch(error){$('export-status').textContent=errorText(error);}
    finally{$('export-dialog').classList.remove('export-busy');document.querySelectorAll('[data-export-format]').forEach(button=>button.disabled=false);}
  }
  async function openSource(findingId,documentId,reference,quiet=false,recordId='') {
    const finding=currentFindings().find(item=>item.id===findingId);
    state.sourceRefs=reference?[reference]:finding?.references?.length?finding.references:[sourceDocumentReference(state.documentCache.get(documentId)||{id:documentId},state.report,finding?.quote||'')];
    const options=state.sourceRefs.map((ref,index)=>`<option value="${index}">${escapeHtml(formatLocation(ref))}</option>`).join('');
    for(const id of ['source-reference','reader-reference']){$(id).innerHTML=options;$(id).hidden=state.sourceRefs.length<2;$(id).value='0';}
    const previewMode=sourcePreviewMode({view:state.view,narrow:window.matchMedia('(max-width: 980px)').matches,quiet});
    $('source-title').textContent=state.view==='companies'?'企业资料原件':'原文依据';
    state.sourceCompareRecordId=recordId;selectSourceTab('original');
    if(previewMode==='dialog'&&!$('source-dialog').open){sourceReturnFocus=document.activeElement;$('source-dialog').showModal();}
    await renderSource(0);
  }
  function selectSourceTab(tab) {
    const selected=tab==='fields'&&!$('source-comparison').hidden?'fields':'original';
    $('source-dialog').dataset.sourceTab=selected;
    $('source-compare-tabs').querySelectorAll('[data-source-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sourceTab===selected)));
  }
  function renderSourceComparison(doc) {
    const primary=state.view==='companies'?libraryCompany():state.report?.companySnapshot;
    const company=sourceComparisonRecords(primary,doc.id).length?primary:state.companies.find(item=>sourceComparisonRecords(item,doc.id).length);
    const html=sourceComparisonHTML(company,doc.id,state.sourceCompareRecordId);
    state.sourceCompanyId=company?.id||'';
    $('source-comparison').innerHTML=html;$('source-comparison').hidden=!html;
    $('source-compare-tabs').hidden=!html;$('source-dialog').classList.toggle('has-source-comparison',!!html);
    if(!html)selectSourceTab('original');
  }
  function sourceZoomGeometryFor(target,width,height) {
    const scroller=target.querySelector('.original-preview-viewport');
    const available=Math.max(1,(scroller?.clientWidth||target.clientWidth)-16);
    const geometry=sourceZoomGeometry(state.sourceZoom,width,height,available);
    state.sourceDimensions={width,height};state.sourceScale=geometry.scale;
    const region=target.closest('#source-content,#reader-content')||target;
    region.querySelectorAll('.source-zoom-value').forEach(output=>output.textContent=`${Math.round(geometry.scale*100)}%`);
    region.querySelectorAll('[data-source-zoom]').forEach(button=>{
      const action=button.dataset.sourceZoom;button.disabled=action==='out'&&geometry.scale<=.1||action==='in'&&geometry.scale>=4;
      if(['fit','actual'].includes(action))button.setAttribute('aria-pressed',String(action==='fit'?state.sourceZoom.mode==='fit':state.sourceZoom.mode==='manual'&&geometry.scale===1));
    });
    return geometry;
  }
  function resizeOriginalImage(target) {
    const image=target.querySelector('.image-original-page img');if(!image?.naturalWidth)return;
    const geometry=sourceZoomGeometryFor(target,image.naturalWidth,image.naturalHeight);
    image.style.width=geometry.width+'px';image.style.height=geometry.height+'px';
  }
  async function refreshSourceZoom() {
    if(!state.readerDoc)return;
    const target=$('source-dialog').open?$('source-content'):$('reader-content');
    if(target.querySelector('.image-original-page img'))resizeOriginalImage(target);
    else if(target.querySelector('.pdf-original-page'))await renderSource(state.readerReferenceIndex||0);
  }
  function updateSourcePagination(doc,page,actualTotal=state.pdfCache.get(doc.id)?.numPages,options={}) {
    const pagination=sourcePaginationState(doc,page,actualTotal,options);state.readerPage=pagination.page;
    document.querySelector('.source-pane .reader-controls').hidden=!pagination.isPdf;
    $('source-page-controls').hidden=!pagination.isPdf;
    for(const prefix of ['reader','source']) {
      $(prefix+'-page').value=pagination.page;$(prefix+'-page').max=pagination.total;
      $(prefix+'-total').textContent=`/ ${pagination.total}`;
      $(prefix+'-prev').disabled=pagination.previousDisabled;$(prefix+'-next').disabled=pagination.nextDisabled;
    }
  }
  async function readerJump(number) {
    const doc=state.readerDoc;if(!doc)return;
    const {page}=sourcePaginationState(doc,number,state.pdfCache.get(doc.id)?.numPages);
    const ref={documentId:doc.id,fileName:doc.fileName,page,quote:''};state.sourceRefs=[ref];
    $('reader-reference').hidden=true;$('source-reference').hidden=true;await renderSource(0);
  }
  function readerSearch() {
    const query=$('reader-query').value.trim(),doc=state.readerDoc;if(!query||!doc)return;
    const normalized=value=>String(value).normalize('NFKC').replace(/\s+/g,'');
    if(state.readerTarget?.mode==='spreadsheet'&&doc.extraction?.sheets?.length){for(const [sheetIndex,sheet] of doc.extraction.sheets.entries()){const cell=sheet.cells.find(cell=>normalized(cell.displayValue||'').includes(normalized(query)));if(cell){state.sourceRefs=[{documentId:doc.id,fileName:doc.fileName,sheet:sheet.name,sheetIndex,workbookFileName:sheet.fileName,rowStart:cell.source.row,rowEnd:cell.source.row,quote:query}];renderSource(0).catch(showError);return;}}toast('当前Excel中未定位到内容。');return;}
    const page=doc.extraction?.pages?.find(page=>normalized(page.text).includes(normalized(query)));
    if(!page){toast('原文中未定位到该内容；扫描识别和兼容文字可再核对。');return;}
    state.sourceRefs=[{documentId:doc.id,fileName:doc.fileName,page:page.number,quote:query}];renderSource(0).catch(showError);
  }
  async function renderOriginalPDF(doc,pageNumber,quote,target,sequence) {
    const pdfjs=await import('/vendor/pdfjs/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';
    let pdf=state.pdfCache.get(doc.id);
    if(!pdf){const response=await api.request(`/api/documents/${encodeURIComponent(doc.id)}/file`,{raw:true});const data=new Uint8Array(await response.arrayBuffer());
      pdf=await pdfjs.getDocument({data,cMapUrl:new URL('/vendor/pdfjs/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('/vendor/pdfjs/standard_fonts/',location.href).href,wasmUrl:new URL('/vendor/pdfjs/wasm/',location.href).href}).promise;
      if(state.pdfCache.size>=4){const first=state.pdfCache.keys().next().value;state.pdfCache.get(first)?.destroy();state.pdfCache.delete(first);}state.pdfCache.set(doc.id,pdf);}
    if(sequence!==state.sourceSequence)return;
    updateSourcePagination(doc,pageNumber,pdf.numPages);
    const page=await pdf.getPage(Math.min(pdf.numPages,pageNumber));
    if(sequence!==state.sourceSequence)return;
    const scroller=document.createElement('div');scroller.className='original-preview-viewport';scroller.tabIndex=0;scroller.setAttribute('role','region');scroller.setAttribute('aria-label','原件预览，可横向和纵向滚动');target.replaceChildren(scroller);
    const base=page.getViewport({scale:1}),geometry=sourceZoomGeometryFor(target,base.width,base.height),viewport=page.getViewport({scale:geometry.scale});
    const wrapper=document.createElement('div');wrapper.className='pdf-original-page';wrapper.style.width=viewport.width+'px';wrapper.style.height=viewport.height+'px';
    const canvas=document.createElement('canvas'),ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';wrapper.append(canvas);
    scroller.append(wrapper);
    const renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});state.sourcePdfRenderTask=renderTask;
    await renderTask.promise;if(state.sourcePdfRenderTask===renderTask)state.sourcePdfRenderTask=null;
    if(sequence!==state.sourceSequence)return;
    if(quote){const content=await page.getTextContent();
      for(const item of selectSourceItems(content.items,quote)){const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]),mark=document.createElement('span');mark.className='pdf-source-mark';mark.style.left=x+'px';mark.style.top=(y-Math.max(6,item.height)*viewport.scale)+'px';mark.style.width=Math.max(4,item.width*viewport.scale)+'px';mark.style.height=Math.max(8,item.height*viewport.scale*1.25)+'px';wrapper.append(mark);}}
    if(sequence!==state.sourceSequence)return;
    scroller.replaceChildren(wrapper);
    if(quote){const excerpt=document.createElement('div');excerpt.className='source-excerpt';excerpt.textContent=quote;target.append(excerpt);}
  }
  async function renderSource(index) {
    const ref=state.sourceRefs[index];if(!ref)return;
    const sequence=++state.sourceSequence,dialog=$('source-dialog').open,target=dialog?$('source-content'):$('reader-content');
    state.sourcePdfRenderTask?.cancel();state.sourcePdfRenderTask=null;
    $('source-location').textContent=formatLocation(ref);$('reader-location').textContent=formatLocation(ref);target.innerHTML='<div class="loading-line" role="status">正在读取原文…</div>';
    try{
      const documentId=ref.documentId||state.report?.documentId,doc=await readSourceDocument(api,documentId,state.documentCache);
      if(sequence!==state.sourceSequence)return;state.readerDoc=doc;
      state.sourceZoom=sourceZoomState(state.sourceZoom,'document',{documentId:doc.id});
      renderSourceComparison(doc);
      // Original bytes remain available even when OCR failed or has not run.
      const kind=originalPreviewKind(doc);
      target.innerHTML=originalFileActionsHTML(doc)+sourceZoomControlsHTML(kind)+'<div class="original-file-content"><div class="loading-line" role="status">正在读取原件…</div></div>';
      const content=target.querySelector('.original-file-content');
      const extraction=doc.extraction||{format:kind==='pdf'?'pdf':'',blocks:[],pages:[]};
      const resolved=resolveSourceTarget(extraction,ref);state.readerTarget=resolved;state.readerReferenceIndex=index;state.sourceRefs[index]=resolved.reference;
      $('source-location').textContent=formatLocation(resolved.reference);$('reader-location').textContent=formatLocation(resolved.reference);
      if(resolved.mode==='spreadsheet'){updateSourcePagination(doc,1,0,{mode:'spreadsheet'});$('reader-file').textContent=doc.fileName;content.innerHTML='<p class="source-caption">Excel内容预览；下载原件可核对原始工作簿和版式。</p>'+spreadsheetSourceHTML(extraction,resolved.reference);content.querySelector('.source-row-highlight')?.scrollIntoView({block:'center'});return;}
      const blocks=extraction.blocks||[],block=resolved.block;
      const {page}=sourcePaginationState(doc,ref.page??block?.page??1,state.pdfCache.get(doc.id)?.numPages);updateSourcePagination(doc,page);$('reader-file').textContent=doc.fileName;
      const pageText=extraction.pages?.find(source=>source.number===page)?.text;
      const related=block&&block.page==null?blocks.filter(other=>other.section===block.section):blocks.filter(other=>other.page===page);
      const original=pageText||related.map(block=>block.text).join('\n\n')||blocks.map(block=>block.text).join('\n\n');
      if(kind==='pdf'){try{await renderOriginalPDF(doc,page,ref.quote||'',content,sequence);return;}catch(error){if(sequence!==state.sourceSequence)return;target.querySelector('.source-zoom-controls')?.remove();content.innerHTML='<p class="message warning">原页面暂时无法渲染，可下载原件核对；以下为已提取文字。</p>';}}
      else if(kind==='image'){
        try{
          const response=await api.request(`/api/documents/${encodeURIComponent(doc.id)}/file`,{raw:true}),blob=await response.blob();
          if(!blob.size)throw new Error('原图片为空');
          const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('原图片读取失败'));reader.readAsDataURL(blob);});
          if(sequence!==state.sourceSequence)return;
          content.innerHTML='<p class="source-caption">上传的原始图片</p><div class="original-preview-viewport" tabindex="0" role="region" aria-label="原件预览，可横向和纵向滚动"><div class="image-original-page"></div></div>';
          const image=document.createElement('img');image.alt=doc.fileName+'（上传原图）';image.decoding='async';
          image.addEventListener('load',()=>{if(sequence===state.sourceSequence)resizeOriginalImage(target);});
          image.addEventListener('error',()=>{if(sequence===state.sourceSequence){target.querySelector('.source-zoom-controls')?.remove();content.querySelector('.image-original-page')?.replaceChildren(Object.assign(document.createElement('p'),{className:'message warning',textContent:'浏览器无法显示这张原图，请下载原件查看。'}));}});
          image.src=dataURL;content.querySelector('.image-original-page').append(image);
        }catch(error){if(sequence!==state.sourceSequence)return;target.querySelector('.source-zoom-controls')?.remove();content.innerHTML='<p class="message warning">原图暂时无法显示，请下载原件查看。</p>';}
        content.insertAdjacentHTML('beforeend',original?`<details class="original-ocr-text"><summary>识别文字（辅助核对）</summary><div class="source-document">${sourceContext(original,ref.quote)}</div></details>`:'<p class="source-caption">暂无可用识别文字，可直接对照原图。</p>');return;
      }
      else content.innerHTML='';
      const word=/\.docx?$/i.test(doc.fileName)||['doc','docx'].includes(extraction.format);
      content.insertAdjacentHTML('beforeend',`<p class="source-caption">${word?'Word兼容文字预览，按章节定位，不推定页码。原始排版、签章和插图请下载原件核对。':'以下为提取内容；原始文件请使用上方“下载原件”查看。'}</p>${original?`<div class="source-document">${sourceContext(original,ref.quote)}</div>`:'<p class="muted">暂无可用识别内容，仍可下载保存的原文件。</p>'}`);
    }catch(error){if(sequence===state.sourceSequence)target.innerHTML=`<div class="message error">${escapeHtml(errorText(error))}</div>`;}
  }
  function renderSettings(settings) {
    state.settings=settings;$('ai-enabled').checked=!!settings.enabled;$('ai-provider').value=settings.provider||'doubao';$('ai-base-url').value=settings.baseUrl||'';$('ai-model').value=settings.model||'';$('ai-key').value='';
    $('ai-key').placeholder=settings.hasKey?'已保存密钥；留空保留，输入新值替换':'填写 API 密钥';
    $('key-state').textContent=settings.hasKey?'已保存密钥，密钥不会返回或显示在页面中。':'尚未保存密钥。';
    $('key-storage-note').textContent=settings.keyStorage==='system'?'密钥保存在系统安全存储中。':'浏览器开发模式：密钥仅在本地服务会话内保存，服务重启后需重新填写。';
    renderApiAvailability();
  }
  async function openWebChatWindow(loginOnly=false) {
    if(webChatOpening)return;
    if(!webChatAvailable){renderWebChatAvailability();return;}
    const provider=$(loginOnly?'web-chat-login-provider':'web-chat-provider').value;
    const reportId=loginOnly?undefined:state.report?.id;
    const buttons=[$('open-web-chat'),$('open-web-chat-login')];
    const status=$('web-chat-login-status');
    webChatOpening=true;buttons.forEach(button=>button.disabled=true);clearError();
    if(loginOnly)status.textContent='正在打开标析内置平台窗口…';
    try{
      if(!loginOnly&&!reportId)throw new Error('请先选择一份分析报告。');
      await openWebChat(window.biaoxiWebChat,{provider,reportId});
      const message=loginOnly?'已在标析内打开平台，可先完成登录。':'已打开本次网页 AI 窗口；点击开始网页分析后才发送列出的材料。';
      if(loginOnly)status.textContent=message;toast(message);
    }catch(error){if(loginOnly)status.textContent=errorText(error);else showError(error);}
    finally{webChatOpening=false;renderWebChatAvailability();}
  }
  async function policyAction(action){
    const status=$('policy-package-status');if(!status)return;const controls=document.querySelectorAll('[data-policy-load],[data-policy-check],[data-policy-import]');controls.forEach(control=>control.disabled=true);
    try{status.textContent='正在处理政策包…';await action(status);}catch(error){status.textContent=errorText(error);}finally{controls.forEach(control=>control.disabled=false);}
  }
  async function showPolicyPackages(){await policyAction(async status=>{const info=await api.request('/api/policy');$('policy-package-info').innerHTML=policyPackageInfoHTML(info);status.textContent='已读取本机政策包；报告保留生成时政策快照。';});}
  async function checkPolicyUpdates(){await policyAction(async status=>{status.textContent='正在联网核对固定官方原件，最多20秒…';const result=await api.request('/api/policy/check-updates',{method:'POST',body:{}});status.textContent=result.message;$('policy-package-info').innerHTML=policyPackageInfoHTML(await api.request('/api/policy'));});}
  async function importPolicyPackage(file){if(!file)return;await policyAction(async status=>{if(file.size>2*1024*1024)throw new Error('政策JSON包不能超过2MB');let pkg;try{pkg=JSON.parse(await file.text());}catch{throw new Error('请导入有效JSON政策包');}const result=await api.request('/api/policy/import',{method:'POST',body:{policyPackage:pkg}});status.textContent=`已导入本机政策包 ${result.version}，仅用于后续重新分析；旧报告保留原快照。`;$('policy-package-info').innerHTML=policyPackageInfoHTML(await api.request('/api/policy'));});}
  async function reanalyzePolicyContext(form){
    if(activeJob())return;const report=state.report;if(!report)return;const button=form.querySelector('button[type="submit"]'),status=form.querySelector('.policy-context-status');
    const projectContext={};for(const control of form.querySelectorAll('[name]')){if(!control.value)continue;projectContext[control.name]=['governmentProcurement','localImplementationConfirmed'].includes(control.name)?control.value==='true':control.value.trim();}
    button.disabled=true;status.textContent='正在按补充条件生成新报告…';
    try{const result=await api.request('/api/analyses',{method:'POST',body:{documentIds:[report.documentId],attachmentIds:reportSelectedAttachmentIds(report),evidenceIds:report.evidenceIds||[],companyId:report.companySnapshot?.id||null,mode:'offline',projectContext}});state.job={id:result.jobId,status:'queued',progress:0,message:'等待分析',reportIds:[]};renderJob();pollJob();toast('已开始重新分析，原报告保留。');}catch(error){status.textContent=errorText(error);button.disabled=false;}
  }
  async function loadSettings() {
    $('settings-status').textContent='正在读取设置…';
    try{const settings=await api.request('/api/settings');renderSettings(settings);$('settings-status').textContent='';}
    catch(error){$('settings-status').textContent=errorText(error);throw error;}
  }
  function settingsBody() {
    const body={enabled:$('ai-enabled').checked,provider:$('ai-provider').value,baseUrl:$('ai-base-url').value.trim(),model:$('ai-model').value.trim()};
    if($('ai-key').value.trim())body.apiKey=$('ai-key').value.trim();return body;
  }
  async function saveSettings() {
    if(!$('settings-form').reportValidity())return;
    const button=$('save-settings');button.disabled=true;$('settings-status').textContent='正在保存设置…';clearError();
    try{const result=await api.request('/api/settings',{method:'PUT',body:settingsBody()});renderSettings(result);$('settings-status').textContent='设置已保存。';toast('AI 设置已保存；只有主动选择联网分析才发送文件内容。');}
    catch(error){$('settings-status').textContent=errorText(error);}
    finally{button.disabled=false;}
  }
  async function testSettings() {
    if(!$('settings-form').reportValidity())return;
    const button=$('test-settings');button.disabled=true;$('settings-status').textContent='正在测试接口；不会发送招标文件内容…';
    try{const result=await api.request('/api/settings/test',{method:'POST',body:settingsBody()});$('settings-status').textContent=result.message||'连接成功；本次测试未发送招标文件内容。';}
    catch(error){$('settings-status').textContent=errorText(error);}
    finally{button.disabled=false;}
  }
  const libraryCompany = () => state.companies.find(company=>company.id===state.libraryId);
  const companyDocuments = company => [...new Set((company?.records||[]).flatMap(record=>record.documentIds||[]))].map(id=>state.documentCache.get(id)||{id,fileName:company.records.flatMap(record=>record.sources||[]).find(source=>source.documentId===id)?.fileName||`原件 ${id}`});
  function renderCompanySelection() {
    $('analysis-company-select').innerHTML='<option value="">不选择企业，仅分析文件</option>'+state.companies.map(company=>`<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`).join('');
    $('analysis-company-select').value=state.companyId;
    const selected=state.companies.find(company=>company.id===state.companyId);
    $('analysis-company-summary').textContent=selected?companySummary(selected):'可不选择企业；企业匹配与预计分保留待核验。';
  }
  function renderCompanyLibrary() {
    const company=libraryCompany();
    $('company-list-select').innerHTML=state.companies.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    $('company-list-select').value=company?.id||'';
    $('company-content').innerHTML=companyLibraryHTML(company,state.companyType,companyDocuments(company));
    $('company-notice').innerHTML=state.companyImportNotice;
    $('company-undo').hidden=!state.deletedRecord||state.deletedRecord.companyId!==state.libraryId;
    if(state.editingRecord&&company) {
      const record=state.editingRecord==='new'?{}:company.records.find(item=>item.id===state.editingRecord);
      if(record)$('company-record-editor').innerHTML=recordFormHTML(record,record.type||state.companyType,companyDocuments(company));
    }
    $('companies-view').querySelectorAll('button,input,select,textarea').forEach(control=>control.disabled=state.companyBusy);
  }
  async function loadCompanies(render=true) {
    const sequence=++state.companyLoadSequence;
    $('company-status').textContent='正在读取本地企业资料…';
    try {
      const companies=await companiesApi.list();if(sequence!==state.companyLoadSequence)return;
      state.companies=companies;
      if(!companies.some(item=>item.id===state.libraryId))state.libraryId=companies[0]?.id||'';
      if(!companies.some(item=>item.id===state.companyId))state.companyId='';
      const ids=[...new Set(companies.flatMap(company=>company.records.flatMap(record=>record.documentIds||[])))];
      await Promise.allSettled(ids.filter(id=>!state.documentCache.has(id)).map(async id=>{const doc=await api.request(`/api/documents/${encodeURIComponent(id)}`);state.documentCache.set(id,doc);}));
      renderCompanySelection();if(render)renderCompanyLibrary();$('company-status').textContent='资料与原件保存在本机。';
    }catch(error){$('company-status').textContent=errorText(error);throw error;}
  }
  function replaceCompany(company) {
    const index=state.companies.findIndex(item=>item.id===company.id);
    if(index<0)state.companies.push(company);else state.companies[index]=company;
    renderCompanySelection();
  }
  async function companyAction(action) {
    if(state.companyBusy)return;
    state.companyBusy=true;clearError();$('companies-view').querySelectorAll('button,input,select,textarea').forEach(control=>control.disabled=true);let saved=false;$('company-status').textContent='正在保存本地资料…';
    try{await action();saved=true;$('company-status').textContent='本地企业资料已保存。';}
    catch(error){showError(error);$('company-status').textContent=errorText(error);}
    finally{state.companyBusy=false;if(saved)renderCompanyLibrary();else $('companies-view').querySelectorAll('button,input,select,textarea').forEach(control=>control.disabled=false);}
  }
  async function createCompany(form) {
    const name=form.elements.companyName.value.trim();if(!name)return;
    await companyAction(async()=>{const company=await companiesApi.create(name);replaceCompany(company);state.libraryId=company.id;state.editingRecord=null;form.reset();toast('企业已保存，可以添加或导入资料。');});
  }
  async function saveCompanyName(form) {
    const company=libraryCompany(),name=form.elements.companyName.value.trim();if(!company||!name)return;
    await companyAction(async()=>{replaceCompany(await companiesApi.save({...company,name}));toast('企业名称已保存。');});
  }
  async function saveCompanyRecord(form) {
    const company=libraryCompany();if(!company)return;
    let record;
    try {
      const fields={};form.querySelectorAll('[name^="field:"]').forEach(control=>{fields[control.name.slice(6)]=control.type==='checkbox'?control.checked:control.value;});
      const evidence=Array.from(form.querySelectorAll('.evidence-row')).map(row=>({kind:row.querySelector('[name="evidenceKind"]').value,documentId:row.querySelector('[name="evidenceDocumentId"]').value,verified:row.querySelector('[name="evidenceVerified"]').checked,stamped:row.querySelector('[name="evidenceStamped"]').checked,valid:row.querySelector('[name="evidenceValid"]').checked,confirmationAcknowledged:row.dataset.confirmationAcknowledged==='true'}));
      record=recordFromValues({type:form.dataset.recordType,name:form.elements.name.value,fields,evidence,verified:form.elements.verified.checked,conflictsResolved:form.elements.conflictsResolved?.checked===true,confirmationAcknowledged:form.dataset.confirmationAcknowledged==='true'},company.records.find(item=>item.id===form.dataset.recordId),companyDocuments(company));
    }catch(error){$('company-record-status').textContent=errorText(error);return;}
    await companyAction(async()=>{replaceCompany(await companiesApi.save(companyWithRecord(company,record)));state.editingRecord=null;toast('资料已保存，只有明确核对的材料参与确定支持。');});
  }
  async function removeCompanyRecord(id) {
    const company=libraryCompany(),record=company?.records.find(item=>item.id===id);if(!record)return;
    await companyAction(async()=>{replaceCompany(await companiesApi.save(companyWithoutRecord(company,id)));state.deletedRecord={companyId:company.id,record};state.editingRecord=null;toast('资料记录已删除，可撤销；原件仍保存在本机。');});
  }
  async function restoreCompanyRecord() {
    const deleted=state.deletedRecord,company=libraryCompany();if(!deleted||deleted.companyId!==company?.id)return;
    await companyAction(async()=>{replaceCompany(await companiesApi.save(companyWithRecord(company,deleted.record)));state.deletedRecord=null;toast('资料记录已恢复。');});
  }
  async function importCompanyDocuments(files) {
    const chosen=Array.from(files||[]),company=libraryCompany();if(!company||!chosen.length)return;
    if(chosen.length>20){showError('每次最多导入20份原件。');return;}
    if(chosen.some(file=>['xls','xlsx'].includes(file.name.split('.').pop().toLowerCase())&&file.size>20*1024*1024)){showError('Excel文件上限20MB，请拆分后导入。');return;}
    if(chosen.some(file=>file.size>100*1024*1024||!supportsUploadFile(file.name))){showError('支持 PDF、Word（DOC/DOCX）、Excel、图片或TXT原件；Excel20MB，其他文件100MB以内。');return;}
        await companyAction(async()=>{
      $('company-status').textContent='正在上传并识别候选字段…';
      const body=new FormData();chosen.forEach(file=>body.append('files',file));body.append('role','evidence');
      const uploaded=await api.request('/api/documents',{method:'POST',body});
      if(!uploaded.documents?.length)throw new Error('服务未返回原件，请重试导入。');
      const result=await companiesApi.importDocuments(company.id,'auto',uploaded.documents.map(doc=>doc.id));
      replaceCompany(result.company);
      await Promise.allSettled(uploaded.documents.map(async doc=>{state.documentCache.set(doc.id,await api.request(`/api/documents/${encodeURIComponent(doc.id)}`));}));
      const summary=result.importSummary||{};
      state.companyImportNotice=companyImportFeedbackHTML(result);
      state.editingRecord=null;state.companyType='all';
      toast('原件与候选资料已保存，所有人工确认保持未勾选。');
    });
  }
  async function submitScoreAssessment(form,clearId) {
    const report=state.report,scoreId=clearId||form?.dataset.scoreAssessment;if(!report||!scoreId||state.scoreBusy.has(scoreId))return;
    const response=form?.querySelector('.score-response');let body;
    try{body=scoreAssessmentBody(report,{scoreId,estimatedScore:clearId?null:form.elements.estimatedScore.value,reason:clearId?'':form.elements.reason.value,evidenceIds:clearId?[]:Array.from(form.querySelectorAll('[name="evidenceIds"]:checked')).map(input=>input.value)});}
    catch(error){if(response)response.textContent=errorText(error);else showError(error);return;}
    state.scoreBusy.add(scoreId);form?.querySelectorAll('button').forEach(button=>button.disabled=true);if(response)response.textContent='正在保存参考估分…';
    try{const updated=await api.request(`/api/reports/${encodeURIComponent(report.id)}/score-assessments`,{method:'POST',body});if(state.report?.id===report.id){state.report=updated;renderReport();}loadRecords(false).catch(()=>{});toast(clearId?'参考估分已清除。':'人工参考估分已保存，测算已刷新。');}
    catch(error){if(response?.isConnected)response.textContent=errorText(error);else showError(error);}
    finally{state.scoreBusy.delete(scoreId);if(form?.isConnected)form.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  async function submitSuitabilityReview(form) {
    const report=state.report;if(!report||form.dataset.suitabilityReview!==report.id)return;
    const key='suitability:'+report.id;if(state.scoreBusy.has(key))return;
    const response=form.querySelector('.suitability-response');let body;
    try{body=suitabilityReviewBody(Object.fromEntries(new FormData(form).entries()));}catch(error){response.textContent=errorText(error);return;}
    state.scoreBusy.add(key);form.querySelectorAll('button').forEach(button=>button.disabled=true);response.textContent='正在保存内部评估…';
    try{const updated=await api.request(`/api/reports/${encodeURIComponent(report.id)}/suitability`,{method:'PUT',body});if(state.report?.id===report.id){state.report=updated;renderReport();}toast('适投评估已保存；企业资料和采购核验状态未改变。');}
    catch(error){if(response.isConnected)response.textContent=errorText(error);else showError(error);}
    finally{state.scoreBusy.delete(key);if(form.isConnected)form.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  async function initialize() {
    state.ready=false;$('boot-status').hidden=false;$('boot-status').textContent='正在连接本地分析服务…';renderFileLists();
    try {
      const data=await api.bootstrap();if(!data.token)throw new Error('无法建立本地服务会话，请重新启动标析。');
      state.categories=Array.isArray(data.categories)?data.categories:[];state.outputs=Array.isArray(data.outputs)?data.outputs:[];
      $('app-version').textContent=`版本 ${data.version||''}`;
      state.ready=true;renderWebChatAvailability();renderNavigation();openView('upload');renderFileLists();$('boot-status').hidden=true;
      await Promise.allSettled([loadRecords(false),api.request('/api/settings').then(settings=>{state.settings=settings;renderSettings(settings);}),loadCompanies(false)]);
    }catch(error){$('boot-status').innerHTML=`<p>${escapeHtml(errorText(error))}</p><button type="button" class="btn" data-retry-bootstrap>重试连接</button>`;}
  }
  if(typeof window.biaoxiWebChat?.onState==='function'){
    Promise.resolve(window.biaoxiWebChat.onState(next=>{
      if(next?.reportSaved!==true||!next.reportId)return;
      loadRecords(false).catch(showError);
      if(state.report?.id===next.reportId)loadReport(next.reportId,{preserveView:true}).catch(showError);
    })).catch(showError);
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a[data-view]');if(!target)return;
    if(target.tagName==='A')event.preventDefault();
    if(target.dataset.sourceZoom){
      const action=target.dataset.sourceZoom;
      state.sourceZoom=sourceZoomState(state.sourceZoom,action,{effectiveScale:state.sourceScale});
      refreshSourceZoom().then(()=>{const region=$('source-dialog').open?$('source-content'):$('reader-content');region.querySelector(`[data-source-zoom="${action}"]`)?.focus({preventScroll:true});}).catch(showError);return;
    }
    if(target.hasAttribute('data-source-expand')){
      const expanded=$('source-dialog').classList.toggle('source-dialog-fullscreen');target.textContent=expanded?'还原窗口':'全屏';target.setAttribute('aria-pressed',String(expanded));
      requestAnimationFrame(()=>refreshSourceZoom().catch(showError));return;
    }
    if(target.dataset.sourceTab){selectSourceTab(target.dataset.sourceTab);if(target.dataset.sourceTab==='original')requestAnimationFrame(()=>refreshSourceZoom().catch(showError));return;}
    if(target.dataset.sourceEditRecord){
      const company=state.companies.find(item=>item.id===state.sourceCompanyId),record=company?.records.find(item=>item.id===target.dataset.sourceEditRecord);
      if(!record){toast('请在企业资料库刷新后编辑此条资料。');return;}
      const existing=state.libraryId===company.id&&state.editingRecord===record.id&&$('company-record-form');
      state.libraryId=company.id;state.editingRecord=record.id;state.companyType=record.type;
      sourceReturnFocus=null;$('source-dialog').close();
      if(state.view!=='companies'){state.view='companies';openView('companies');}
      if(!existing)renderCompanyLibrary();
      $('company-record-editor')?.scrollIntoView({block:'start'});$('company-record-form')?.elements.name.focus({preventScroll:true});return;
    }
    if(target.hasAttribute('data-configure-ai')){openAiConfiguration();return;}
    if(target.dataset.downloadOriginal){
      const id=target.dataset.downloadOriginal,status=target.parentElement.querySelector('.original-download-status');
      target.disabled=true;if(status)status.textContent='正在读取原文件…';
      (async()=>{
        try{
          const doc=await readSourceDocument(api,id,state.documentCache),response=await api.request(`/api/documents/${encodeURIComponent(id)}/file`,{raw:true}),blob=await response.blob();
          if(!blob.size)throw new Error('原文件为空，请核对保存状态。');
          const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=doc.fileName;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
          if(status)status.textContent='已准备原文件下载。';
        }catch(error){if(status)status.textContent=errorText(error);}
        finally{target.disabled=false;}
      })();return;
    }
    if(target.hasAttribute('data-policy-load')){showPolicyPackages();return;}
    if(target.hasAttribute('data-policy-check')){checkPolicyUpdates();return;}
    if(target.dataset.sheetWindow){const index=state.readerReferenceIndex||0,ref=state.sourceRefs[index];if(ref){ref.windowStart=Number(target.dataset.sheetWindow);renderSource(index).catch(showError);}return;}
    if(target.hasAttribute('data-manage-selected-company')){state.libraryId=state.companyId||state.libraryId;state.editingRecord=null;openView('companies');return;}
    if(target.dataset.companyType){if(state.companyBusy)return;state.companyType=target.dataset.companyType;state.editingRecord=null;state.companyImportNotice='';renderCompanyLibrary();return;}
    if(target.hasAttribute('data-new-record')){if(state.companyType==='all')state.companyType='entity';state.editingRecord='new';renderCompanyLibrary();$('company-record-form')?.elements.name.focus();return;}
    if(target.dataset.editRecord){state.editingRecord=target.dataset.editRecord;state.companyType=libraryCompany()?.records.find(record=>record.id===target.dataset.editRecord)?.type||state.companyType;renderCompanyLibrary();$('company-record-form')?.elements.name.focus();return;}
    if(target.hasAttribute('data-close-record')){state.editingRecord=null;renderCompanyLibrary();return;}
    if(target.dataset.deleteRecord){removeCompanyRecord(target.dataset.deleteRecord);return;}
    if(target.hasAttribute('data-undo-record')){restoreCompanyRecord();return;}
    if(target.hasAttribute('data-add-evidence')){const form=$('company-record-form');$('record-evidence-rows').insertAdjacentHTML('beforeend',evidenceRowHTML({},companyDocuments(libraryCompany()),form.dataset.recordType));return;}
    if(target.hasAttribute('data-remove-evidence')){const form=target.closest('form');target.closest('.evidence-row').remove();if(form)resetRecordConfirmation(form);return;}
    if(target.dataset.companyDocument){const recordId=target.closest('tr')?.querySelector('[data-edit-record]')?.dataset.editRecord||'';openSource('',target.dataset.companyDocument,undefined,false,recordId).catch(showError);return;}
    if(target.dataset.clearScore){submitScoreAssessment(target.closest('form'),target.dataset.clearScore);return;}
    if(target.dataset.view){openView(target.dataset.view);return;}
    if(target.dataset.sectionId){chooseSection(target.dataset.sectionKind,target.dataset.sectionId);return;}
    if(target.dataset.pickRole){$(target.dataset.pickRole+'-input').click();return;}
    if(target.dataset.removeRole){if(activeJob())return;state.files[target.dataset.removeRole]=state.files[target.dataset.removeRole].filter(doc=>doc.id!==target.dataset.documentId);renderFileLists();return;}
    if(target.hasAttribute('data-overview')){chooseSection('overview','overview');return;}
    if(target.hasAttribute('data-source-reference')){try{const ref=JSON.parse(target.dataset.sourceReference);openSource('',ref.documentId,ref).catch(showError);}catch(error){showError(error);}return;}
    if(target.hasAttribute('data-source-finding')){openSource(target.dataset.sourceFinding).catch(showError);return;}
    if(target.hasAttribute('data-coverage-reference')){const ref=state.report?.coverage?.unrecognizedBlocks?.[Number(target.dataset.coverageReference)];if(ref)openSource('',ref.documentId,ref).catch(showError);return;}
    if(target.hasAttribute('data-revoke-coverage')){submitCoverageReview(null,false);return;}
    if(target.dataset.openDocument){openSource('',target.dataset.openDocument).catch(showError);return;}
    if(target.dataset.openReport){loadReport(target.dataset.openReport,{overview:true});return;}
    if(target.dataset.deleteReport){deleteReport(target.dataset.deleteReport);return;}
    if(target.dataset.exportReport){openExport(target.dataset.exportReport);return;}
    if(target.hasAttribute('data-export-current')){if(state.report)openExport(state.report.id);return;}
    if(target.dataset.exportFormat){downloadReport(target.dataset.exportFormat);return;}
    if(target.dataset.closeDialog){$(target.dataset.closeDialog).close();return;}
    if(target.hasAttribute('data-clear-filter')){$('finding-search').value='';$('risk-filter').checked=false;renderReport();return;}
    if(target.hasAttribute('data-retry-bootstrap')){clearError();initialize();return;}
    if(target.hasAttribute('data-dismiss-job')){state.job=null;renderJob();return;}
    if(target.hasAttribute('data-retry-job')){pollJob();return;}
    if(target.hasAttribute('data-job-results')){loadReport(state.job?.reportIds?.[0]);return;}
    if(target.id==='start-analysis')startAnalysis();
    if(target.id==='report-ai-analysis')startReportOnlineAnalysis();
    if(target.id==='cancel-job')cancelJob();
    if(target.id==='refresh-companies'){loadCompanies().catch(showError);return;}
    if(target.id==='refresh-records'){clearError();loadRecords().catch(showError);}
    if(target.id==='test-settings')testSettings();
    if(target.id==='open-web-chat')openWebChatWindow();
    if(target.id==='open-web-chat-login')openWebChatWindow(true);
    if(target.id==='confirm-action'){
      const action=state.confirm;if(!action)return;target.disabled=true;
      Promise.resolve().then(action).then(()=>{$('confirm-dialog').close();state.confirm=null;}).catch(error=>{showError(error);$('confirm-dialog').close();}).finally(()=>{target.disabled=false;});
    }
  });
  document.addEventListener('submit',event=>{if(event.target.matches('[data-suitability-review]')){event.preventDefault();submitSuitabilityReview(event.target);}if(event.target.matches('.policy-context-form')){event.preventDefault();reanalyzePolicyContext(event.target);}if(event.target.id==='new-company-form'){event.preventDefault();createCompany(event.target);}if(event.target.id==='company-name-form'){event.preventDefault();saveCompanyName(event.target);}if(event.target.id==='company-record-form'){event.preventDefault();saveCompanyRecord(event.target);}if(event.target.matches('[data-score-assessment]')){event.preventDefault();submitScoreAssessment(event.target);}if(event.target.matches('.review-form')){event.preventDefault();submitReview(event.target);}if(event.target.matches('.coverage-review-form')){event.preventDefault();submitCoverageReview(event.target);}if(event.target.id==='settings-form'){event.preventDefault();saveSettings();}});
  function resetRecordConfirmation(form,message='资料已修改，请重新核对并确认本条资料。') {
    form.elements.verified.checked=false;form.dataset.confirmationAcknowledged='false';if(form.elements.conflictsResolved)form.elements.conflictsResolved.checked=false;
    const response=form.querySelector('#company-record-status');if(response)response.textContent=message;
  }
  document.addEventListener('change',event=>{
    const control=event.target;if(control.hasAttribute('data-policy-import')){importPolicyPackage(control.files[0]);return;}
    if(control.id==='source-record-select'){state.sourceCompareRecordId=control.value;if(state.readerDoc)renderSourceComparison(state.readerDoc);$('source-record-select')?.focus({preventScroll:true});return;}
    if(control.hasAttribute('data-sheet-select')){const doc=state.readerDoc,sheetIndex=Number(control.value),sheet=doc.extraction.sheets[sheetIndex];state.sourceRefs=[{documentId:doc.id,fileName:doc.fileName,sheet:sheet.name,sheetIndex,workbookFileName:sheet.fileName}];$('reader-reference').hidden=true;$('source-reference').hidden=true;renderSource(0).catch(showError);return;}
    if(control.hasAttribute('data-sheet-row-jump')){const index=state.readerReferenceIndex||0,ref=state.sourceRefs[index];if(ref){ref.rowStart=Number(control.value);ref.rowEnd=ref.rowStart;delete ref.windowStart;renderSource(index).catch(showError);}return;}
    if(control.id==='company-import-input')importCompanyDocuments(control.files);
    const form=control.closest('#company-record-form');if(!form)return;
    if(control.name==='verified'){form.dataset.confirmationAcknowledged=control.checked?'true':'false';return;}
    const row=control.closest('.evidence-row');
    if(row&&['evidenceDocumentId','evidenceKind'].includes(control.name)){
      for(const name of ['evidenceVerified','evidenceStamped','evidenceValid'])row.querySelector(`[name="${name}"]`).checked=false;
      row.dataset.confirmationAcknowledged='false';resetRecordConfirmation(form,'关联原件或证明种类已更改，请重新核对这份证明及本条资料。');return;
    }
    if(row&&['evidenceVerified','evidenceStamped','evidenceValid'].includes(control.name)){row.dataset.confirmationAcknowledged='true';resetRecordConfirmation(form);return;}
    if(control.name==='name'||control.name.startsWith('field:'))resetRecordConfirmation(form);
  });
  document.addEventListener('input',event=>{
    const control=event.target,form=control.closest('#company-record-form');
    if(form&&(control.name==='name'||control.name.startsWith('field:')))resetRecordConfirmation(form);
  });
  $('analysis-company-select').addEventListener('change',event=>{state.companyId=event.target.value;renderCompanySelection();});
  $('company-list-select').addEventListener('change',event=>{state.libraryId=event.target.value;state.editingRecord=null;state.companyImportNotice='';renderCompanyLibrary();});
  for(const role of ['tender','attachment','evidence'])$(role+'-input').addEventListener('change',event=>uploadFiles(event.target.files,role));
  $('dropzone').addEventListener('click',()=>{if(state.ready&&!activeJob())$('tender-input').click();});
  $('dropzone').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(state.ready&&!activeJob())$('tender-input').click();}});
  $('dropzone').addEventListener('dragover',event=>{event.preventDefault();$('dropzone').classList.add('drag-over');});
  $('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag-over'));
  $('dropzone').addEventListener('drop',event=>{event.preventDefault();$('dropzone').classList.remove('drag-over');uploadFiles(event.dataTransfer.files);});
  document.querySelectorAll('input[name="analysis-mode"]').forEach(input=>input.addEventListener('change',updateMode));
  $('report-select').addEventListener('change',event=>loadReport(event.target.value));
  $('finding-search').addEventListener('input',renderReport);
  $('risk-filter').addEventListener('change',renderReport);
  $('mobile-section').addEventListener('change',event=>{const [kind,id]=event.target.value.split(':');chooseSection(kind,id);});
  $('record-search').addEventListener('input',renderRecords);
  $('source-reference').addEventListener('change',event=>renderSource(Number(event.target.value)));
  $('reader-reference').addEventListener('change',event=>renderSource(Number(event.target.value)));
  $('reader-prev').addEventListener('click',()=>readerJump(state.readerPage-1));
  $('reader-next').addEventListener('click',()=>readerJump(state.readerPage+1));
  $('reader-page').addEventListener('change',event=>readerJump(Number(event.target.value)));
  $('source-prev').addEventListener('click',()=>readerJump(state.readerPage-1));
  $('source-next').addEventListener('click',()=>readerJump(state.readerPage+1));
  $('source-page').addEventListener('change',event=>readerJump(Number(event.target.value)));
  $('reader-search').addEventListener('click',readerSearch);
  $('reader-query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();readerSearch();}});
  $('source-dialog').addEventListener('close',()=>{state.sourceSequence++;state.sourcePdfRenderTask?.cancel();state.sourcePdfRenderTask=null;if(sourceReturnFocus?.isConnected)sourceReturnFocus.focus({preventScroll:true});sourceReturnFocus=null;});
  window.addEventListener('resize',()=>{
    clearTimeout(sourceResizeTimer);
    if(state.sourceZoom.mode==='fit'&&($('source-dialog').open||state.view==='analysis'&&!window.matchMedia('(max-width: 980px)').matches))sourceResizeTimer=setTimeout(()=>refreshSourceZoom().catch(showError),140);
  });
  $('ai-provider').addEventListener('change',event=>{
    const urls={doubao:'https://ark.cn-beijing.volces.com/api/v3',deepseek:'https://api.deepseek.com',custom:''};
    const known=Object.values(urls);if(! $('ai-base-url').value || known.includes($('ai-base-url').value))$('ai-base-url').value=urls[event.target.value];
  });
  window.addEventListener('focus',async()=>{
    if(!window.biaoxiWebChat||!state.ready||state.view!=='analysis'||!state.report||activeJob()||focusRefreshing)return;
    focusRefreshing=true;
    try{await loadReport(state.report.id,{preserveView:true});}
    finally{focusRefreshing=false;}
  });
  initialize();
}
