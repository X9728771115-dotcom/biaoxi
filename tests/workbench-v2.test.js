import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectOverviewHTML, narrativeHTML, prioritySummaryHTML} from '../public/analysis-view.js';
import {exportReport} from '../src/server/export.js';
import mammoth from 'mammoth';

const ref={documentId:'doc-1',blockId:'block-1',fileName:'采购.pdf',page:24,section:'采购需求',quote:'竣工验收和审计完成后一次支付审定金额100%。'};
const item={id:'payment-1',categoryId:'payment',title:'付款条件',quote:ref.quote,interpretation:'验收与审计均完成后一次支付。',impact:'需评估前期垫资。',actions:['确认审计和支付时限。'],fields:{完整要求:ref.quote},references:[ref],matchStatus:'pending'};
const report={fileName:'采购.pdf',createdAt:'2026-10-10T00:00:00Z',mode:'offline',categories:[{id:'payment',title:'付款方式',items:[item]}],outputs:{risks:[item],scoreItems:[],commitments:[],conclusion:{label:'待核验',reasons:['企业证据不足'],conditions:[]}},coverage:{},warnings:[],analysis:{overview:[{label:'预算',value:'1122100元',references:[ref]}],scoring:{items:[{id:'score-1',title:'施工方案',group:'技术',maxScore:10,standard:'内容完整得10分',materials:['施工方案'],references:[ref]}],groups:[{name:'技术',maxScore:82},{name:'商务',maxScore:8},{name:'报价',maxScore:10}],total:100,status:'分值已校核'},commercialRisks:[item],clarifications:[],technical:[]}};

test('总览呈现项目事实和完整分值标准，可定位真实来源而不声称企业已满足',()=>{
 const html=projectOverviewHTML(report);
 for(const text of ['1122100元','施工方案','内容完整得10分','82','100','垫资'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('data-source-reference'));
 assert.ok(!html.includes('企业已满足'));
});
test('关联分析保留影响、准备事项与出处，并转义上传内容',()=>{
 const html=narrativeHTML({...item,title:'<script>unsafe</script>'});
 assert.ok(html.includes('需评估前期垫资。'));
 assert.ok(html.includes('确认审计和支付时限。'));
 assert.ok(html.includes('第24页'));
 assert.ok(!html.includes('<script>'));
});
test('完整核查Word包含总览与关联风险，同一原文只在证据附录完整出现一次',async()=>{
 const text=(await mammoth.extractRawText({buffer:await exportReport(report,'docx',{includeRaw:true})})).value;
 for(const value of ['项目概况','1122100元','施工方案','工程与履约资金风险','垫资','废标项清单','必须加分项','必须承诺内容','投标可行性结论','原文证据'])assert.ok(text.includes(value),value);
 assert.equal(text.split(ref.quote).length-1,1,'相同条款在输出与分类中不得重复全文');
 assert.ok(text.includes('第24页'));
 const concise=(await mammoth.extractRawText({buffer:await exportReport(report,'docx')})).value;
 assert.ok(!concise.includes('原文证据'));assert.ok(concise.includes('验收与审计均完成后一次支付。'));assert.ok(concise.includes('第24页'));assert.ok(concise.includes('确认审计和支付时限。'));
});

test('总览保留四项输出入口与待核理由，不重复整份清单',()=>{
 const html=prioritySummaryHTML(report);
 for(const value of ['废标项清单','必须加分项','必须承诺内容','投标可行性结论','企业证据不足','data-section-id="risks"'])assert.ok(html.includes(value),value);
 assert.ok(!html.includes(ref.quote));
 assert.ok(!html.includes('已满足'));
});
