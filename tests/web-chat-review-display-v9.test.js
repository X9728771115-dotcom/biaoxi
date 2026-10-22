import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {analyzeDocument} from '../src/core/analyzer.js';
import {webChatHTML} from '../public/analysis-view.js';
import {buildReportSections} from '../src/server/export.js';

const first='首轮原答：<script>privateModelText()</script>，此内容仍待核验';
const last='复核原答：仍需核对企业证据，不能据此确认参与资格';
function fixture(completed=true){
 const report=analyzeDocument({id:'review-display',fileName:'复核样本.txt',complete:true,format:'txt',blocks:[{id:'b1',page:null,text:'供应商须提供有效营业执照。'}],warnings:[]});
 report.webChat={requestId:'review-display-request',provider:'doubao',status:'partial',rawText:completed?last:first,coverage:{categoryCount:14,outputCount:4,unverifiedReferences:3},categories:[],warnings:[],review:{attempted:true,completed,status:completed?'completed':'incomplete'},reviewRounds:[{round:1,rawText:first,coverage:{categoryCount:14,outputCount:4,unverifiedReferences:6}},...(completed?[{round:2,rawText:last,coverage:{categoryCount:14,outputCount:4,unverifiedReferences:3}}]:[])]};
 return report;
}
test('两轮原答可分别查看且首答安全转义，自动复核结束仍不表示内容准确',()=>{
 const $=load(webChatHTML(fixture()));
 assert.ok($.text().includes('自动复核已结束'));
 assert.ok($.text().includes('两轮原答'));
 assert.ok($.text().includes(first));assert.ok($.text().includes(last));
 assert.equal($('script').length,0);
 assert.equal($('details.web-chat-history').attr('open'),undefined);
 assert.ok($.text().includes('仍需人工核验'));
 assert.ok($.text().includes('引用未通过：3处'));
});
test('取消或失败只返回首轮时明确复核未完成，不伪称两轮已完成',()=>{
 const $=load(webChatHTML(fixture(false)));
 assert.ok($.text().includes('自动复核未完成'));
 assert.ok(!$.text().includes('自动复核已结束'));
 assert.equal($.text().split(first).length-1,1);
});
test('默认导出标明两轮过程边界，完整核查版保留两份原答且各出现一次',()=>{
 const report=fixture(),summary=JSON.stringify(buildReportSections(report)),full=JSON.stringify(buildReportSections(report,{includeRaw:true}));
 assert.ok(summary.includes('自动复核已结束'));
 assert.ok(summary.includes('仍需人工核验'));
 assert.ok(summary.includes('引用未通过：3处'));
 assert.ok(!summary.includes(first));assert.ok(!summary.includes(last));
 assert.equal(full.split(first).length-1,1);assert.equal(full.split(last).length-1,1);
 assert.ok(full.includes('首轮原答'));assert.ok(full.includes('复核原答'));
});
test('复核未完成的导出保留首答一次并明确边界',()=>{
 const text=JSON.stringify(buildReportSections(fixture(false),{includeRaw:true}));
 assert.ok(text.includes('自动复核未完成'));
 assert.equal(text.split(first).length-1,1);
 assert.ok(!text.includes('自动复核已结束'));
});
test('重复错引提示合并展示但保留不同问题及引用未通过总数',()=>{
 const report=fixture(),warning={code:'WEB_CHAT_REFERENCE_UNVERIFIED',message:'本条引用无法核对，须对照原件'};
 report.webChat.warnings=[warning,warning,{code:'WEB_CHAT_CONTENT_REVIEW',message:'报价公式仍有差异'}];
 const html=load(webChatHTML(report)).text();
 assert.equal(html.split(warning.message).length-1,1);
 assert.ok(html.includes('报价公式仍有差异'));assert.ok(html.includes('引用未通过：3处'));
});
test('默认导出不会把同一网页警告在全局与网页清单中重复数十次',()=>{
 const report=fixture(),warning={code:'WEB_CHAT_REFERENCE_UNVERIFIED',message:'当前网页引文没有匹配真实原文'};
 report.warnings=[warning];report.webChat.warnings=[warning,warning,{code:'WEB_CHAT_CONTENT_REVIEW',message:'具体公式差异仍待核验'}];
 const text=JSON.stringify(buildReportSections(report));
 assert.equal(text.split(warning.message).length-1,1);
 assert.ok(text.includes('具体公式差异仍待核验'));assert.ok(text.includes('引用未通过：3处'));
});
