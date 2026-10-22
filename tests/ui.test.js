import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApiClient, filterFindings, formatLocation, sourceContext, escapeHtml, partitionFindingFields, groupEcoFindings, jobPanelVisible, coverageReviewBody } from '../public/app.js';

test('UI API obtains session token and protects subsequent JSON requests', async () => {
  const calls = [];
  const client = makeApiClient(async (path, options = {}) => {
    calls.push({ path, options });
    return new Response(JSON.stringify(path === '/api/bootstrap' ? { token: 'local-session' } : { jobId: 'job-1' }), { status: 200 });
  });
  await client.bootstrap();
  const result = await client.request('/api/analyses', { method: 'POST', body: { documentIds: ['main'], attachmentIds: ['attachment'], evidenceIds: [], mode: 'offline' } });
  assert.equal(result.jobId, 'job-1');
  assert.equal(calls[0].options.headers?.['X-Biaoxi-Token'], undefined);
  assert.equal(calls[1].options.headers['X-Biaoxi-Token'], 'local-session');
  assert.deepEqual(JSON.parse(calls[1].options.body).attachmentIds, ['attachment']);
});

test('UI does not interpret failed API response as a completed result', async () => {
  const client = makeApiClient(async () => new Response(JSON.stringify({ error: '源文件无法读取' }), { status: 422 }));
  await assert.rejects(client.request('/api/reports/missing'), /源文件无法读取/);
});

test('Risk filter retains conditional hard requirements and pending facts', () => {
  const rows = [
    { title: '未提交认证', hard: true, conditional: true, matchStatus: 'pending' },
    { title: '环保评分', priority: 'policy', matchStatus: 'met' },
    { title: '付款条款', priority: 'normal', matchStatus: 'met' },
  ];
  assert.deepEqual(filterFindings(rows, '', true).map(x => x.title), ['未提交认证']);
  assert.equal(filterFindings(rows, '环保', false).length, 1);
});

test('DOCX source labels retain section and never invent page numbers', () => {
  assert.equal(formatLocation({ fileName: '采购.docx', page: null, section: '合同草案 / 表格2' }), '采购.docx · 合同草案 / 表格2');
  assert.equal(formatLocation({ fileName: '采购.pdf', page: 8 }), '采购.pdf · 第8页');
});

test('Source highlighting uses actual raw text and escapes uploaded HTML', () => {
  const raw = '采购要求 <script>alert(1)</script> 必须提交认证，其余待核验';
  const html = sourceContext(raw, '必须提交认证');
  assert.ok(html.includes('<mark>必须提交认证</mark>'));
  assert.ok(!html.includes('<script>'));
  assert.equal(sourceContext('原文不存在所引条款', '另一条款'), escapeHtml('原文不存在所引条款'));
});

test('Reading view exposes business fields and folds auxiliary parsing without losing any field', () => {
  const fields = { '完整要求':'必须提交认证，最高5分。', '用途':'评分用途', '证明材料':['认证证书'], '分值与封顶':'最高5分', '阈值与数量':['5分'], '逻辑关系':'且', '条件与例外':'必须提交认证，最高5分。', '评分公式':'必须提交认证，最高5分。', 'AI补充':'仍需核验' };
  const result = partitionFindingFields(fields);
  assert.deepEqual(result.core.flatMap(row => row.labels), ['完整要求','评分公式','证明材料','分值与封顶']);
  assert.deepEqual(result.more.flatMap(row => row.labels), ['用途','阈值与数量','逻辑关系','条件与例外','AI补充']);
  assert.deepEqual(new Set([...result.core,...result.more].flatMap(row => row.labels)), new Set(Object.keys(fields)));
  assert.equal(result.core.filter(row => row.value === fields['完整要求']).length, 1);
});

test('Eco grouping prioritizes explicit procurement and keeps negative or conditional policy distinct', () => {
  const rows = [
    { id:'mandatory', quote:'空调执行强制采购，须提交节能证书。', fields:{'强制采购':'原文明确强制采购要求：须核对产品范围'} },
    { id:'negative', quote:'家具非强制采购；环境标志产品优先采购。', fields:{'强制采购':'本段含非强制或否定强制要求；其他适用范围仍按原文核验'} },
    { id:'conditional', quote:'如属于强制采购品目，须按规定执行。', fields:{'强制采购':'仅出现强采标题、分类提示、条件或待核问题，具体产品适用范围待核验'} },
    { id:'energy', quote:'节能产品需提供有效认证。', fields:{'强制采购':'本段未明确强制采购，不凭节能环保关键词推定'} },
    { id:'environment', quote:'提交环境标志认证。', fields:{} },
    { id:'preference', quote:'优先采购相关产品，给予2分。', fields:{} },
  ];
  const groups=groupEcoFindings(rows);
  assert.deepEqual(groups.find(group=>group.id==='mandatory').items.map(item=>item.id), ['mandatory','conditional']);
  assert.deepEqual([...new Set(groups.flatMap(group=>group.items).map(item=>item.id))].sort(), rows.map(item=>item.id).sort());
  assert.ok(!groups.find(group=>group.id==='mandatory').items.some(item=>item.id==='negative'));
});

test('Eco groups ignore generic parser hints and distinguish policy headings from actual conditional requirements', () => {
  const generic='本段未明确强制采购，不凭节能环保关键词推定';
  const rows=[
    {id:'performance',title:'节能环保与强制采购',quote:'家具甲醛释放量应符合环保性能要求。',fields:{'强制采购':generic,'政策属性':'按原文核验适用产品、认证及有效性'}},
    {id:'heading',quote:'产品属于政府强制采购类别？请确认适用品目。',fields:{'强制采购':'仅出现强采标题、分类提示、条件或待核问题，具体产品适用范围待核验'}},
    {id:'condition',quote:'如产品属于强制采购品目，须提供有效认证。',fields:{'强制采购':'仅出现强采标题、分类提示、条件或待核问题，具体产品适用范围待核验'}},
    {id:'combined',quote:'节能产品、环境标志产品优先采购并给予2分。',fields:{'强制采购':generic}},
  ];
  const groups=groupEcoFindings(rows),ids=id=>groups.find(group=>group.id===id).items.map(item=>item.id);
  assert.deepEqual(ids('mandatory'),['condition']);
  assert.deepEqual(ids('pending'),['heading']);
  assert.deepEqual(ids('energy'),['combined']);
  assert.deepEqual(ids('environment'),['combined']);
  assert.deepEqual(ids('preference'),['combined']);
  assert.deepEqual(ids('other'),['performance']);
  for(const group of groups)for(const item of group.items)assert.equal(item,rows.find(row=>row.id===item.id));
});

test('Completed progress disappears while cancellation and failure explanations remain available', () => {
  assert.equal(jobPanelVisible({status:'completed'}),false);
  assert.equal(jobPanelVisible({status:'running'}),true);
  assert.equal(jobPanelVisible({status:'failed'}),true);
  assert.equal(jobPanelVisible({status:'cancelled'}),true);
  assert.equal(jobPanelVisible(null),false);
});

test('Coverage acknowledgement requires an explicit confirmation and a recorded basis, and can be revoked', () => {
  assert.throws(()=>coverageReviewBody(true,'已核对原件',false), /勾选/);
  assert.throws(()=>coverageReviewBody(true,'  ',true), /依据/);
  assert.throws(()=>coverageReviewBody(true,'已核对',true), /至少8/);
  assert.deepEqual(coverageReviewBody(true,'  已核对原件及所有附件  ',true), {reviewed:true,note:'已核对原件及所有附件'});
  assert.deepEqual(coverageReviewBody(false,'原复核依据'), {reviewed:false,note:'原复核依据'});
});
