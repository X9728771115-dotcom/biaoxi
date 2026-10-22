import assert from 'node:assert/strict';import {mkdtemp,rm,cp,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
const [bundle,fixtures]=process.argv.slice(2);if(!bundle||!fixtures)throw new Error('需要打包资源目录和测试素材目录');
const temp=await mkdtemp(join(tmpdir(),'biaoxi-packaged-'));
try{
 // Move dependencies away from the development checkout: missing bundled modules cannot fall back to its node_modules.
 const isolated=join(temp,'app');await cp(resolve(bundle),isolated,{recursive:true});
 const {extractDocument}=await import(pathToFileURL(join(isolated,'src/core/extractor.js')));
 const {analyzeDocument}=await import(pathToFileURL(join(isolated,'src/core/analyzer.js')));
 const {exportReport}=await import(pathToFileURL(join(isolated,'src/server/export.js')));
 const extraction=await extractDocument({id:'smoke',fileName:'中文扫描条款-测试用途.pdf',path:join(resolve(fixtures),'中文扫描条款-测试用途.pdf')});
 assert.ok(extraction.blocks.some(b=>b.text.includes('投标保证金')));assert.ok(extraction.blocks.some(b=>b.text.includes('政府强制采购')));assert.ok(extraction.warnings.some(w=>w.code==='OCR_REVIEW_REQUIRED'));
 const report=analyzeDocument(extraction);assert.equal(report.categories.length,14);assert.equal(report.outputs.conclusion.label,'待核验');
 const pdf=await exportReport(report,'pdf'),word=await exportReport(report,'docx');assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.equal(word.subarray(0,2).toString(),'PK');
 console.log(JSON.stringify({runtime:process.versions.node,platform:process.platform,arch:process.arch,isolatedBundle:true,scanBlocks:extraction.blocks.length,categories:report.categories.length,pdfBytes:pdf.length,wordBytes:word.length,pass:true}));
}finally{await rm(temp,{recursive:true,force:true});}
