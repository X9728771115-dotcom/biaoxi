import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {buildCompanyAnalysis,hasConfirmedCompanyFacts} from '../src/core/company-analysis.js';
import {buildQualificationReview} from '../src/core/qualification.js';
import {companySummary,companyLibraryHTML,companyAnalysisHTML,scoreAssessmentBody} from '../public/company-view.js';
import {predictionSummaryHTML} from '../public/score-summary.js';

const archive=(id,type='personnel',fields={})=>({id,type,name:'unclassified-folder-'+id,documentIds:['doc-'+id],verified:false,fields:{notes:'仅保存导入原件，尚未形成证件事实',...fields,evidence:[{kind:'source',documentId:'doc-'+id,verified:false}]}});
const personnel={id:'person-1',type:'personnel',name:'演示注册资料',documentIds:['registration'],verified:false,fields:{role:'项目经理',employer:'演示企业',evidence:[{kind:'registration',documentId:'registration',verified:false}]}};
const company=records=>({id:'company',name:'演示企业',records});
const scope={documentId:'tender',package:'1',phase:'response'};
const report=records=>({id:'report',createdAt:'2026-10-18T00:00:00Z',companySnapshot:company(records),categories:[{id:'personnel',items:[{id:'manager-gate',categoryId:'personnel',title:'拟派项目经理',quote:'拟派项目经理须提供建筑工程二级及以上建造师注册证。',hard:true,reviewed:false,matchStatus:'pending',references:[]}]}],analysis:{scoring:{status:'计分项与分组总分校验通过',packages:[{scope}],items:[{id:'person-score',categoryId:'personnel',title:'拟派项目经理',group:'技术',maxScore:10,standard:'提供项目经理注册证书，主观评分',materials:['注册证书'],references:[],scope}]}}});

test('V11 source-only bundles with directory names and stray fields never enter match or qualification candidates',()=>{
 const records=[archive('one'),archive('two','qualification',{category:'建筑工程施工总承包',subjectName:'演示企业'}),archive('three','personnel',{role:'项目经理',employer:'演示企业'}),personnel];
 const before=structuredClone(records),result=buildCompanyAnalysis(report(records));
 assert.deepEqual(result.matches[0].records.map(row=>row.id),['person-1']);
 assert.deepEqual(result.scoreRows[0].recordIds,['person-1']);
 assert.deepEqual(result.qualification.groups.find(group=>group.id==='personnel').recordIds,['person-1']);
 assert.deepEqual(result.qualification.groups.find(group=>group.id==='construction-qualification').recordIds,[]);
 assert.deepEqual(records,before);
});

test('V11 legacy original-only entries with empty facts use attachment structure rather than localized names',()=>{
 const legacy={id:'legacy',type:'personnel',name:'Folder 2025 A',fields:{notes:'keep originals'},documentIds:['legacy-original'],sources:[]};
 const result=buildCompanyAnalysis(report([legacy]));
 assert.deepEqual(result.matches[0].records,[]);
 assert.deepEqual(buildQualificationReview(report([legacy])).groups.find(group=>group.id==='personnel').recordIds,[]);
 assert.match(companySummary(company([legacy])),/归档包 1 包/);
});

test('V11 mixed typed proof stays a structured candidate while source-only confirmation is never evidence confirmation',()=>{
 const mixed=archive('mixed');mixed.fields.evidence.push({kind:'registration',documentId:'doc-mixed',verified:false});
 assert.deepEqual(buildCompanyAnalysis(report([mixed])).matches[0].records.map(row=>row.id),['mixed']);
 const badConfirmation=archive('confirmed');badConfirmation.verified=true;badConfirmation.fields.evidence[0].verified=true;
 assert.equal(hasConfirmedCompanyFacts(report([badConfirmation])),false);
});

test('V11 library separates archive counts and records from qualifications and personnel without claiming employee count',()=>{
 const records=[archive('one'),archive('two','qualification'),personnel],value=company(records),before=structuredClone(value);
 const summary=companySummary(value);assert.match(summary,/资质证件 0 条/);assert.match(summary,/人员资料 1 条/);assert.match(summary,/归档包 2 包/);
 const all=load(companyLibraryHTML(value,'all'));assert.equal(all('tbody tr').length,3);assert.equal(all('[data-company-type="archive"] span').text(),'2');assert.equal(all('[data-company-type="personnel"] span').text(),'1');assert.match(all.text(),/不代表员工人数/);
 const structured=load(companyLibraryHTML(value,'personnel'));assert.equal(structured('tbody tr').length,1);assert.equal(structured('tbody tr strong').text(),personnel.name);
 const archived=load(companyLibraryHTML(value,'archive'));assert.equal(archived('tbody tr').length,2);assert.match(archived('tbody').text(),/归档包/);assert.equal(archived('[data-new-record]').length,0);assert.deepEqual(value,before);
});

test('V11 score summary names confirmed evidence support and explains unknown is not an actual zero score',()=>{
 const $=load(predictionSummaryHTML({companyId:'company',forecast:{business:{confirmedScore:0,pendingMaxScore:3,maxScore:8,assumedScore:5,range:{min:5,max:8}}}}));
 assert.equal($('.prediction-metrics>div').eq(2).find('span').text(),'商务已核证据支持');assert.match($.text(),/未知不等于实际零分/);assert.equal($.text().includes('商务已确认得分'),false);
});

test('V11 assumed full personnel row retains factual gaps and avoids archive originals in score forms',()=>{
 const originals=Array.from({length:140},(_,index)=>archive(String(index))),r=report([...originals,personnel]);r.companyAnalysis=buildCompanyAnalysis(r);
 assert.equal(r.companyAnalysis.scoreRows[0].assumedScore,10);assert.ok(r.companyAnalysis.scoreRows[0].missing.includes('企业条目尚未人工确认'));
 const $=load(companyAnalysisHTML(r));assert.match($('.company-score-table').text(),/企业条目尚未人工确认/);
 assert.equal($('[name="evidenceIds"]').length,1);assert.equal($('[name="evidenceIds"]').first().attr('value'),'registration');
 // Deliberate manual reference remains permitted by the saved snapshot API.
 assert.deepEqual(scoreAssessmentBody(r,{scoreId:'person-score',estimatedScore:1,reason:'人工查看已保存原件并给出参考',evidenceIds:['doc-0']}).evidenceIds,['doc-0']);
});

test('V11 a deliberately saved archive reference remains selected without listing the rest of its bundle',()=>{
 const bundle=archive('saved');bundle.documentIds.push('unselected-original');
 const r=report([bundle,personnel]);r.scoreAssessments=[{scoreId:'person-score',estimatedScore:1,reason:'人工对照已选原件后留存参考说明',evidenceIds:['doc-saved']}];r.companyAnalysis=buildCompanyAnalysis(r);
 const $=load(companyAnalysisHTML(r));
 assert.equal($('[name="evidenceIds"][value="doc-saved"]:checked').length,1);
 assert.equal($('[name="evidenceIds"][value="unselected-original"]').length,0);
});

test('V11 company table gives the fourth original column room and keeps narrow screens scrollable',async()=>{
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.company-record-table\s*\{[^}]*min-width:\s*(?:9\d\d|1\d\d\d)px/);
 assert.match(css,/\.company-record-table td:nth-child\(4\) \.btn\s*\{[^}]*white-space:\s*normal/);
 assert.match(css,/\.company-type-tabs\s*\{[^}]*(?:overflow-x:\s*auto|flex-wrap:\s*wrap)/);
});
