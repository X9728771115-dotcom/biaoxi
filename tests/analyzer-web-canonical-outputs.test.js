import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeDocument,summarizeReport} from '../src/core/analyzer.js';

const extraction=JSON.parse(readFileSync(new URL('./fixtures/analysis-roof-extraction.json',import.meta.url)));
const requestId='502e84dd-0ffb-473f-a65f-f94cf1cf548d';
const all=report=>report.categories.flatMap(category=>category.items);
function withWebCandidate(quote){
 const block=extraction.blocks.find(block=>block.id.endsWith(':b452'));
 const report=analyzeDocument(structuredClone(extraction),{additionalFindings:[{categoryId:'performance',title:'网页业绩补充解读',quote,references:[{documentId:extraction.id,blockId:block.id,quote}],source:'ai'}]});
 const candidate=all(report).find(item=>item.source==='ai');assert.ok(candidate);
 candidate.id=`web-${requestId}-${candidate.id}`;
 return {report,candidate};
}

test('a web quotation exactly restating canonical score rows remains a pending candidate without a four-output score duplicate',()=>{
 const baseline=analyzeDocument(structuredClone(extraction)),block=extraction.blocks.find(block=>block.id.endsWith(':b452'));
 const {report,candidate}=withWebCandidate(block.text),before=structuredClone(report),updated=summarizeReport(report);
 assert.equal(baseline.outputs.scoreItems.length,13);
 assert.deepEqual(updated.outputs.scoreItems.map(item=>item.id),baseline.outputs.scoreItems.map(item=>item.id));
 assert.equal(updated.outputs.risks.length,baseline.outputs.risks.length);assert.equal(updated.outputs.commitments.length,baseline.outputs.commitments.length);
 assert.deepEqual(all(updated).find(item=>item.id===candidate.id),candidate);assert.equal(candidate.reviewed,false);assert.equal(candidate.matchStatus,'pending');
 assert.deepEqual(report,before,'summarizing must not rewrite category candidates or their review state');
});

test('another web quotation in the same source block remains eligible when canonical rows do not fully cover it',()=>{
 const block=extraction.blocks.find(block=>block.id.endsWith(':b452')),quote=block.text.match(/每提供1个合同得1分，最多得3分。/)?.[0];assert.ok(quote);
 const {report,candidate}=withWebCandidate(quote);
 assert.ok(!summarizeReport(report).outputs.scoreItems.some(item=>item.id===candidate.id),'an unreviewed quotation remains in the candidate review path');
 candidate.reviewed=true;
 const updated=summarizeReport(report);
 assert.ok(updated.outputs.scoreItems.some(item=>item.id===candidate.id),'same block alone must never suppress a distinct source quotation');
});

test('canonical risk and commitment outputs do not recount an immutable finding clone and retain both independent reviews',()=>{
 const report=analyzeDocument({id:'clone-source',fileName:'clone.txt',complete:true,warnings:[],blocks:[{id:'risk',page:1,text:'投标保证金未在投标截止前提交，投标将被否决。'},{id:'commitment',page:2,text:'供应商须提交真实性承诺函，由法定代表人签字并加盖公章。'}]});
 const beforeCounts={risks:report.outputs.risks.length,commitments:report.outputs.commitments.length},clones=[];
 for(const source of [report.outputs.risks[0],report.outputs.commitments[0]]){
  const base=all(report).find(item=>item.id===source.id);base.reviewed=true;base.matchStatus='met';
  const clone={...structuredClone(base),id:`web-${requestId}-${base.id}`,source:'ai',reviewed:false,matchStatus:'pending'};report.categories.find(category=>category.id===base.categoryId).items.push(clone);clones.push(clone);
 }
 const updated=summarizeReport(report);
 assert.equal(updated.outputs.risks.length,beforeCounts.risks);assert.equal(updated.outputs.commitments.length,beforeCounts.commitments);
 for(const clone of clones){assert.deepEqual(all(updated).find(item=>item.id===clone.id),clone);assert.equal(all(updated).find(item=>item.id===clone.id.slice(`web-${requestId}-`.length)).reviewed,true);}
});
