import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createService} from '../src/server/service.js';

const MIB=1024*1024;
const row=(index,notes='')=>({id:`record-${index}`,type:'qualification',name:`已核资料${index}`,fields:{notes},documentIds:[],verified:false,sources:[]});
function sizedCompany(bytes){
 const body={name:'大规模企业资料核验测试',records:Array.from({length:450},(_,i)=>row(i))};
 let remaining=bytes-Buffer.byteLength(JSON.stringify(body),'utf8');
 assert.ok(remaining>=0);
 for(const record of body.records){const count=Math.min(5000,remaining);record.fields.notes='a'.repeat(count);remaining-=count;}
 assert.equal(remaining,0);assert.equal(Buffer.byteLength(JSON.stringify(body),'utf8'),bytes);return body;
}
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'biaoxi-company-size-v16-'));const svc=await createService({dataDir:dir});
 t.after(async()=>{await svc.close();await rm(dir,{recursive:true,force:true});});
 const {token}=await(await fetch(svc.url+'/api/bootstrap')).json();
 const req=(path,method='GET',body)=>fetch(svc.url+path,{method,headers:{'X-Biaoxi-Token':token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return{svc,req};
}

test('V16 verified material growth above 512KB saves without loosening field, record, or ownership validation',async t=>{
 const f=await fixture(t),body={name:'企业核验资料规模测试',records:Array.from({length:120},(_,i)=>row(i,'资质原件核验内容'.repeat(230)))};
 const bytes=Buffer.byteLength(JSON.stringify(body),'utf8');assert.ok(bytes>512*1024&&bytes<2*MIB);
 const created=await f.req('/api/companies','POST',body);assert.equal(created.status,201);const company=await created.json();
 assert.equal(company.records.length,120);assert.deepEqual(company.records.map(r=>r.fields.notes),body.records.map(r=>r.fields.notes));
 const before=await(await f.req('/api/companies/'+company.id)).json();
 for(const invalid of [
  {...body,records:Array.from({length:501},(_,i)=>row(i))},
  {...body,records:[row(1,'x'.repeat(5001))]},
  {...body,records:[{...row(1),fields:{systemCommand:'非法扩充字段'}}]},
 ])assert.equal((await f.req('/api/companies/'+company.id,'PUT',invalid)).status,400);
 const other=await(await f.req('/api/companies','POST',{name:'其他企业',records:[]})).json();
 await f.svc.store.saveDocument({id:'foreign-proof',role:'evidence',companyId:other.id,fileName:'其他企业原件.txt',extraction:{blocks:[]}});
 const foreign=structuredClone(body);foreign.records[0].documentIds=['foreign-proof'];
 assert.equal((await f.req('/api/companies/'+company.id,'PUT',foreign)).status,400);
 assert.deepEqual(await(await f.req('/api/companies/'+company.id)).json(),before);assert.equal((await f.svc.store.getDocument('foreign-proof')).companyId,other.id);
});

test('V16 company JSON accepts exactly 2MiB but rejects the next byte with a company limit error and no overwrite',async t=>{
 const f=await fixture(t),atLimit=sizedCompany(2*MIB);const accepted=await f.req('/api/companies','POST',atLimit);
 assert.equal(accepted.status,201);const saved=await accepted.json();assert.equal(saved.records.length,450);
 const rejected=await f.req('/api/companies/'+saved.id,'PUT',sizedCompany(2*MIB+1));assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/2\s*(?:MiB|MB)/i);
 const after=await(await f.req('/api/companies/'+saved.id)).json();assert.deepEqual(after,saved);
});

test('V16 global JSON input still has a finite 3MiB transport ceiling',async t=>{
 const f=await fixture(t);const rejected=await f.req('/api/companies','POST',{name:'超出传输上限测试',records:[],padding:'a'.repeat(3*MIB)});
 assert.equal(rejected.status,413);assert.equal((await f.svc.store.listCompanies()).length,0);
});
