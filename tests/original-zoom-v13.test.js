import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import * as ui from '../public/app.js';

const feature=name=>{assert.equal(typeof ui[name],'function',`缺少原件对照行为 ${name}`);return ui[name];};

test('原图适应宽度后仍可放大到超出容器，100%使用真实原始尺寸',()=>{
  const transition=feature('sourceZoomState'),geometry=feature('sourceZoomGeometry');
  const fit=transition({},'document',{documentId:'image-1'});
  assert.deepEqual(geometry(fit,4000,2000,600),{scale:.15,width:600,height:300});
  const enlarged=transition(fit,'in',{effectiveScale:.15});
  assert.deepEqual(geometry(enlarged,4000,2000,600),{scale:.4,width:1600,height:800});
  assert.deepEqual(geometry(transition(enlarged,'actual'),4000,2000,600),{scale:1,width:4000,height:2000});
  assert.deepEqual(geometry(transition(enlarged,'fit'),4000,2000,900),{scale:.225,width:900,height:450});
});

test('PDF分页保留缩放，换原件恢复适应宽度，并限制连续放大缩小的边界',()=>{
  const transition=feature('sourceZoomState'),geometry=feature('sourceZoomGeometry');
  let zoom=transition({},'document',{documentId:'pdf-1'});
  zoom=transition(zoom,'actual');zoom=transition(zoom,'in');
  assert.deepEqual(geometry(transition(zoom,'document',{documentId:'pdf-1'}),600,800,420),{scale:1.25,width:750,height:1000});
  assert.deepEqual(geometry(transition(zoom,'document',{documentId:'pdf-2'}),600,800,420),{scale:.7,width:420,height:560});
  for(let index=0;index<50;index++)zoom=transition(zoom,'in');
  assert.equal(zoom.scale,4);
  for(let index=0;index<50;index++)zoom=transition(zoom,'out');
  assert.equal(zoom.scale,.1);
  assert.ok(Number.isFinite(geometry(zoom,0,0,0).width));
});

const company={id:'company-1',records:[
  {id:'record-a',type:'qualification',name:'建筑专业资质',verified:false,documentIds:['shared'],fields:{subjectName:'甲企业',specialty:'建筑工程',grade:'二级',certificateNumber:'A-001'}},
  {id:'record-b',type:'qualification',name:'市政专业资质',verified:false,documentIds:['shared'],fields:{subjectName:'甲企业',specialty:'市政工程',grade:'三级',certificateNumber:'B-002'}},
  {id:'record-c',type:'performance',name:'关联证明中的合同',verified:false,documentIds:[],fields:{amount:0,evidence:[{documentId:'proof-only'}]}},
  {id:'record-d',type:'entity',name:'来源关联执照',verified:false,documentIds:[],sources:[{documentId:'source-only'}],fields:{}},
  {id:'other',type:'entity',name:'其他原件资料',verified:true,documentIds:['other-doc'],fields:{}}
]};

test('仅对照当前原件关联条目，兼容证明和来源关联且不改写企业原数据',()=>{
  const records=feature('sourceComparisonRecords'),before=structuredClone(company);
  assert.deepEqual(records(company,'shared').map(record=>record.id),['record-a','record-b']);
  assert.deepEqual(records(company,'proof-only').map(record=>record.id),['record-c']);
  assert.deepEqual(records(company,'source-only').map(record=>record.id),['record-d']);
  assert.deepEqual(records(company,'missing'),[]);assert.deepEqual(company,before);
});

test('共享原件必须选择对应条目；从具体条目打开时呈现该条字段及编辑入口',()=>{
  const render=feature('sourceComparisonHTML'),before=structuredClone(company);
  let $=load(render(company,'shared'));
  assert.equal($('#source-record-select option[value="record-a"]').length,1);
  assert.equal($('#source-record-select option[value="record-b"]').length,1);
  assert.equal($('.source-record-fields').length,0,'未选择时不默认套用第一个专业');
  $=load(render(company,'shared','record-b'));
  assert.ok($('.source-record-fields').text().includes('市政工程'));
  assert.equal($('.source-record-fields').text().includes('建筑工程'),false);
  assert.equal($('[data-source-edit-record="record-b"]').length,1);
  assert.ok($.text().includes('待核验'));assert.equal($('input:checked').length,0);
  $=load(render(company,'shared','other'));
  assert.equal($('.source-record-fields').length,0,'拒绝对照不属于此原件的条目');
  assert.deepEqual(company,before);
});

test('单关联原件遇到显式错配条目时不默认为另一条资料，需重新选择后对照',()=>{
  const $=load(feature('sourceComparisonHTML')(company,'proof-only','record-a'));
  assert.equal($('.source-record-fields').length,0);
  assert.equal($('[data-source-edit-record]').length,0);
  assert.equal($('#source-record-select option[value="record-c"]').length,1);
  assert.ok($.text().includes('关联已变更'));
});

test('字段对照保留零金额和缺口，危险内容仅作为文字，不新增确认表单',()=>{
  const render=feature('sourceComparisonHTML'),value=structuredClone(company);
  value.records[2].fields.clientName='<img src=x onerror=1>';
  const $=load(render(value,'proof-only'));
  assert.ok($('.source-record-fields').text().includes('0'));
  assert.ok($('.source-record-fields').text().includes('待补充'));
  assert.ok($.text().includes('<img src=x onerror=1>'));
  assert.equal($('script,img,form,input').length,0);
});

test('原件对照窗口保留分页和关闭，提供全屏及窄屏原件字段切换入口',async()=>{
  const $=load(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
  assert.equal($('#source-dialog .source-preview-column #source-content').length,1);
  assert.equal($('#source-dialog .source-comparison-panel').length,1);
  assert.equal($('#source-dialog [data-source-expand]').length,1);
  assert.equal($('#source-dialog [data-source-tab="original"]').attr('aria-controls'),'source-preview-column');
  assert.equal($('#source-dialog [data-source-tab="fields"]').attr('aria-controls'),'source-comparison');
  assert.equal($('#source-dialog #source-page-controls #source-prev').length,1);
  assert.equal($('#source-dialog [data-close-dialog="source-dialog"]').length,1);
  const controls=load(feature('sourceZoomControlsHTML')('pdf'));
  for(const action of ['in','out','fit','actual'])assert.equal(controls(`[data-source-zoom="${action}"]`).length,1);
  assert.equal(controls('[role="group"]').attr('aria-label'),'原件缩放');
  assert.equal(load(ui.sourceZoomControlsHTML('download'))('button').length,0);
});
