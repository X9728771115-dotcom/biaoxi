import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const run=(name,args=[],env={})=>spawnSync(process.execPath,[join(root,'scripts',name),...args],{cwd:root,encoding:'utf8',env:{...process.env,...env}});

test('candidate web launch ignores inherited production storage and uses its own directory',()=>{
 const result=run('dev-isolated.mjs',['web','--print-config'],{BIAOXI_DATA_DIR:join(tmpdir(),'external-data'),BIAOXI_USER_DATA_DIR:join(tmpdir(),'external-profile')});
 assert.equal(result.status,0,result.stderr);
 const config=JSON.parse(result.stdout);
 assert.equal(config.cwd,resolve(root));
 assert.equal(config.env.BIAOXI_DATA_DIR,join(resolve(root),'candidate-data','web'));
 assert.equal(config.env.BIAOXI_USER_DATA_DIR,undefined);
 assert.ok(config.args[0].endsWith(join('src','server','cli.js')));
});

test('candidate desktop launch isolates profile and rejects inherited production data',()=>{
 const result=run('dev-isolated.mjs',['desktop','--print-config'],{BIAOXI_DATA_DIR:join(tmpdir(),'external-data'),BIAOXI_USER_DATA_DIR:join(tmpdir(),'external-profile')});
 assert.equal(result.status,0,result.stderr);
 const config=JSON.parse(result.stdout);
 assert.equal(config.env.BIAOXI_USER_DATA_DIR,join(resolve(root),'candidate-data','desktop'));
 assert.equal(config.env.BIAOXI_DATA_DIR,undefined);
 assert.ok(config.args[0].endsWith(join('electron','cli.js')));
});

test('public test runner suppresses private fixture environment and enables synthetic OCR explicitly',async()=>{
 const result=run('run-tests.mjs',['--ocr','--print-config'],{BIAXI_REAL_DOC_FILE:join(tmpdir(),'private.doc'),BIAXI_REAL_CERTIFICATE_DIR:join(tmpdir(),'private-certificates')});
 assert.equal(result.status,0,result.stderr);
 const config=JSON.parse(result.stdout);
 assert.equal(config.env.BIAXI_REAL_DOC_FILE,undefined);
 assert.equal(config.env.BIAXI_REAL_CERTIFICATE_DIR,undefined);
 assert.equal(config.env.BIAXI_OCR_TEST,'1');
 assert.ok(config.args.includes('--test'));
 assert.ok(config.args.some(x=>x.endsWith('extractor.test.js')));
 const {createTestConfig}=await import('../scripts/run-tests.mjs');
 const actual=createTestConfig({ocr:true,environment:{BIAXI_REAL_DOC_FILE:'external.doc',BIAXI_REAL_CERTIFICATE_DIR:'external-certificates',PATH:process.env.PATH}});
 assert.equal(actual.env.BIAXI_REAL_DOC_FILE,undefined);
 assert.equal(actual.env.BIAXI_REAL_CERTIFICATE_DIR,undefined);
 assert.equal(actual.env.BIAXI_OCR_TEST,'1');
});

test('source checker accepts synthetic code and reports private paths and credentials without their values',()=>{
 const directory=mkdtempSync(join(tmpdir(),'biaoxi-source-check-'));
 try{
  writeFileSync(join(directory,'safe.js'),'export const example="虚构采购样例";');
  const safe=run('check-source.mjs',['--root',directory]);
  assert.equal(safe.status,0,safe.stderr);
  const fakeSecret=['sk','proj','a'.repeat(40)].join('-');
  const personalPath=['','Users','example-person','document.pdf'].join('/');
  writeFileSync(join(directory,'unsafe.txt'),personalPath+'\n'+fakeSecret);
  const unsafe=run('check-source.mjs',['--root',directory]);
  assert.equal(unsafe.status,1);
  assert.match(unsafe.stdout,/unsafe\.txt/);
  assert.match(unsafe.stdout,/PRIVATE_PATH/);
  assert.match(unsafe.stdout,/CREDENTIAL/);
  assert.ok(!unsafe.stdout.includes(fakeSecret));
  assert.ok(!unsafe.stdout.includes(personalPath));
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('source checker rejects runtime data forced into Git even when ignored',()=>{
 const directory=mkdtempSync(join(tmpdir(),'biaoxi-source-git-'));
 try{
  assert.equal(spawnSync('git',['init','--quiet'],{cwd:directory}).status,0);
  mkdirSync(join(directory,'.data'));
  writeFileSync(join(directory,'.data','runtime.json'),'{}');
  assert.equal(spawnSync('git',['add','--force','.data/runtime.json'],{cwd:directory}).status,0);
  const result=run('check-source.mjs',['--root',directory]);
  assert.equal(result.status,1);
  assert.match(result.stdout,/RUNTIME_DATA/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('source checker rejects official policy originals forced into the public source index',()=>{
 const directory=mkdtempSync(join(tmpdir(),'biaoxi-policy-source-git-'));
 try{
  assert.equal(spawnSync('git',['init','--quiet'],{cwd:directory}).status,0);
  mkdirSync(join(directory,'assets','policies','official'),{recursive:true});
  writeFileSync(join(directory,'assets','policies','official','example.pdf'),'synthetic placeholder');
  assert.equal(spawnSync('git',['add','--force','assets/policies/official/example.pdf'],{cwd:directory}).status,0);
  const result=run('check-source.mjs',['--root',directory]);
  assert.equal(result.status,1);assert.match(result.stdout,/RUNTIME_DATA/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('source checker covers untracked additions and staged contents hidden by a clean working copy',()=>{
 const directory=mkdtempSync(join(tmpdir(),'biaoxi-source-index-'));
 try{
  assert.equal(spawnSync('git',['init','--quiet'],{cwd:directory}).status,0);
  writeFileSync(join(directory,'staged.txt'),'public example');
  assert.equal(spawnSync('git',['add','staged.txt'],{cwd:directory}).status,0);
  const fakeSecret=['sk','proj','b'.repeat(40)].join('-');
  writeFileSync(join(directory,'new.txt'),fakeSecret);
  const untracked=run('check-source.mjs',['--root',directory]);
  assert.equal(untracked.status,1);
  assert.match(untracked.stdout,/new\.txt/);
  assert.ok(!untracked.stdout.includes(fakeSecret));
  rmSync(join(directory,'new.txt'));
  writeFileSync(join(directory,'staged.txt'),fakeSecret);
  assert.equal(spawnSync('git',['add','staged.txt'],{cwd:directory}).status,0);
  writeFileSync(join(directory,'staged.txt'),'public example');
  const staged=run('check-source.mjs',['--root',directory]);
  assert.equal(staged.status,1);
  assert.match(staged.stdout,/CREDENTIAL/);
  assert.match(staged.stdout,/index/);
  assert.ok(!staged.stdout.includes(fakeSecret));
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('source checker fails explicitly when a repository index cannot be enumerated',()=>{
 const directory=mkdtempSync(join(tmpdir(),'biaoxi-source-broken-index-'));
 try{
  assert.equal(spawnSync('git',['init','--quiet'],{cwd:directory}).status,0);
  writeFileSync(join(directory,'safe.txt'),'public example');
  writeFileSync(join(directory,'.git','index'),'invalid index');
  const result=run('check-source.mjs',['--root',directory]);
  assert.equal(result.status,1);
  assert.match(result.stdout,/INDEX_ENUMERATION_FAILED/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('isolated web storage preserves authenticated original-file downloads',async()=>{
 const {createLaunchConfig}=await import('../scripts/dev-isolated.mjs');
 const {createService}=await import('../src/server/service.js');
 const directory=mkdtempSync(join(tmpdir(),'biaoxi-web-storage-'));
 let service;
 try{
  const config=createLaunchConfig('web',{root:directory,environment:{}});
  service=await createService({dataDir:config.dataDir,port:0});
  const {token}=await(await fetch(service.url+'/api/bootstrap')).json();
  const headers={'X-Biaoxi-Token':token},form=new FormData();
  const contents='完全虚构的隔离目录原件下载测试。';
  form.append('role','tender');form.append('files',new Blob([contents]),'synthetic.txt');
  const response=await fetch(service.url+'/api/documents',{method:'POST',headers,body:form});
  assert.equal(response.status,200);
  const {documents}=await response.json();
  const original=await fetch(service.url+'/api/documents/'+documents[0].id+'/file',{headers});
  assert.equal(original.status,200);
  assert.equal(await original.text(),contents);
 }finally{await service?.close();rmSync(directory,{recursive:true,force:true});}
});
