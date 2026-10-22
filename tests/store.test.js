import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createStore} from '../src/server/store.js';
test('durable reports survive restart and path traversal IDs are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'biaoxi-'));try{const store=await createStore(dir);await store.saveReport({id:'r-test',fileName:'招标.pdf',createdAt:'2026-10-10',outputs:{conclusion:{label:'待核验'}}});const another=await createStore(dir);assert.equal((await another.getReport('r-test')).fileName,'招标.pdf');await assert.rejects(another.getReport('../../secret'));await another.deleteReport('r-test');assert.equal((await another.listReports()).length,0);}finally{await rm(dir,{recursive:true,force:true});}
});

test('F4 every document save preserves immutable ownership even from a stale unowned copy',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'biaoxi-owner-'));try{const store=await createStore(dir);const old={id:'doc-owned',fileName:'合同.txt',role:'evidence',status:'queued'};await store.saveDocument(old);await store.saveDocument({...old,companyId:'company-a',status:'ready'});await store.saveDocument({...old,status:'extracting'});assert.equal((await store.getDocument(old.id)).companyId,'company-a');await assert.rejects(store.saveDocument({...old,companyId:'company-b'}),/归属/);}finally{await rm(dir,{recursive:true,force:true});}
});
