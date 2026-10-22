/* Shared sizing for original images and PDF pages; no document data is changed. */
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const list=value=>Array.isArray(value)?value:[];
const positive=(value,fallback=1)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
const clamp=value=>Math.min(4,Math.max(.1,Number.isFinite(Number(value))?Number(value):1));

export function sourceZoomState(current={},action='fit',{documentId=current.documentId,effectiveScale=current.scale}={}) {
  if(documentId!==current.documentId||action==='fit'||!current.mode)return {documentId,mode:'fit',scale:1};
  if(action==='document')return {...current};
  if(action==='actual')return {documentId,mode:'manual',scale:1};
  const step=action==='in'?.25:action==='out'?-.25:0;
  return {documentId,mode:'manual',scale:clamp(Math.round((positive(effectiveScale)+step)*1000)/1000)};
}

export function sourceZoomGeometry(zoom={},originalWidth,originalHeight,availableWidth) {
  const width=positive(originalWidth),height=positive(originalHeight);
  const scale=zoom.mode==='manual'?clamp(zoom.scale):Math.min(4,positive(availableWidth,width)/width);
  return {scale,width:Math.round(width*scale*1000)/1000,height:Math.round(height*scale*1000)/1000};
}

export function sourceZoomControlsHTML(kind) {
  if(!['image','pdf'].includes(kind))return '';
  return '<div class="source-zoom-controls" role="group" aria-label="原件缩放">'+
    '<button type="button" class="btn" data-source-zoom="out" aria-label="缩小原件" disabled>−</button>'+
    '<output class="source-zoom-value" aria-live="polite">适应宽度</output>'+
    '<button type="button" class="btn" data-source-zoom="in" aria-label="放大原件" disabled>＋</button>'+
    '<button type="button" class="btn" data-source-zoom="fit" disabled>适应宽度</button>'+
    '<button type="button" class="btn" data-source-zoom="actual" disabled>100%</button>'+
    '<span class="muted">放大后可横向滚动</span></div>';
}

export function sourceComparisonRecords(company={},documentId) {
  if(!documentId)return [];
  return list(company?.records).filter(record=>list(record.documentIds).includes(documentId)||
    list(record.fields?.evidence).some(proof=>proof.documentId===documentId)||
    list(record.sources).some(source=>source.documentId===documentId));
}

export function sourceComparisonHTML(company={},documentId,selectedId='',types=[]) {
  const records=sourceComparisonRecords(company,documentId);
  if(!records.length)return '';
  const selected=records.find(record=>record.id===selectedId)||(!selectedId&&records.length===1?records[0]:null),mismatched=!!selectedId&&!selected;
  const select=records.length>1||mismatched?`<label class="source-record-choice" for="source-record-select">选择对照资料<select id="source-record-select"><option value=""${!selected?' selected':''}>请选择对应条目</option>${records.map(record=>`<option value="${escape(record.id)}"${record===selected?' selected':''}>${escape(record.name||'未命名资料')}</option>`).join('')}</select></label>`:'';
  if(!selected)return `<h3>识别字段对照</h3>${select}<p class="muted">${mismatched?'所选资料与当前原件的关联已变更，请重新选择对应条目。':'同一原件关联多条资料，请选择对应条目后对照。'}</p>`;
  const info=types.find(type=>type.id===selected.type),fields=selected.fields||{};
  const rows=[['subjectName','材料主体名称'],...(info?.fields||[]),['notes','核对说明 / 补充信息']];
  const display=(value,kind)=>value==null||value===''?'待补充':kind==='checkbox'?(value===true?'是':'否'):Array.isArray(value)?value.join('；'):String(value);
  return `<h3>识别字段对照</h3>${select}<div class="source-record-heading"><strong>${escape(selected.name||'资料名称待补充')}</strong><span class="badge ${selected.verified===true?'':'pending'}">${selected.verified===true?'已人工核对':'待核验'}</span></div><p class="source-compare-note muted">识别字段供对照使用；缺失、模糊或冲突内容仍需按原件人工核对。</p><dl class="source-record-fields">${rows.map(([key,label,kind])=>`<div><dt>${escape(label)}</dt><dd${fields[key]==null||fields[key]===''?' class="muted"':''}>${escape(display(fields[key],kind))}</dd></div>`).join('')}</dl><button type="button" class="btn" data-source-edit-record="${escape(selected.id)}">编辑此条资料</button>`;
}
