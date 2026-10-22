const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const count=value=>Number.isSafeInteger(value)&&value>0?value:0;

// Human-readable feedback is separate from the retained diagnostic record.
export function companyImportFeedbackHTML(result={}){
 const summary=result.importSummary||{},warnings=Array.isArray(result.warnings)?result.warnings:[];
 const groups=new Map();
 for(const warning of warnings){
  const raw=typeof warning==='string'?warning:warning?.message||warning?.code||'';
  if(!raw)continue;
  const kind=/OCR|置信度|文字识别/i.test(raw)?'ocr':/unrecogni[sz]ed|ignored|paragraph style/i.test(raw)?'format':/缺失|不完整|未读|覆盖|缺口/.test(raw)?'coverage':'other';
  const entry=groups.get(kind)||{count:0};entry.count++;groups.set(kind,entry);
 }
 const titles={ocr:'部分资料经过文字识别，请对照原件核对名称、证号、金额及日期。',format:'文档含特殊版式或样式，请重点核对表格与并列字段。',coverage:'部分内容读取不完整，相关信息已保留待核验。',other:'还有需要对照原件核对的提示，可展开技术记录查看。'};
 const intro=`已录入 ${count(summary.added)} 条，待确认 ${count(summary.pending)} 条；重复 ${count(summary.duplicates)} 条，续期 ${count(summary.renewals)} 条，冲突 ${count(summary.conflicts)} 条。`;
 return `<div class="import-feedback-summary">${intro} 自动识别不等于人工核验。</div>${groups.size?`<details class="import-feedback-details"><summary>查看识别提示（${groups.size} 类）</summary><ul>${[...groups].map(([kind,entry])=>`<li>${titles[kind]}<span class="muted">（${entry.count} 条记录）</span></li>`).join('')}</ul><details class="import-technical-log"><summary>技术记录</summary><ul>${warnings.map(w=>`<li>${escape(typeof w==='string'?w:w?.message||w?.code||'')}</li>`).join('')}</ul></details></details>`:''}`;
}
