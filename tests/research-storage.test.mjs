import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{open}=require('../js/research-storage.js');

// IndexedDB event adapter exercises completion/abort handling without claiming
// browser-engine validation. Native IndexedDB remains a device acceptance gate.
function fakeIndexedDB() {
  const rows=new Map();let tail=Promise.resolve(),quota=false;
  const db={createObjectStore(){},close(){},transaction(name,mode){
    const tx={error:null,aborted:false,pending:[],abort(){this.aborted=true;},objectStore(){return {
      get(id){const request={};tx.pending.push(()=>{request.result=structuredClone(rows.get(id));request.onsuccess?.();});return request;},
      getAll(){const request={};tx.pending.push(()=>{request.result=structuredClone([...rows.values()]);request.onsuccess?.();});return request;},
      put(record){tx.commit=()=>{if(quota)throw new Error('QuotaExceededError');rows.set(record.id,structuredClone(record));};},
    };}};
    const run=async()=>{await new Promise(resolve=>setImmediate(resolve));try{for(const call of tx.pending)call();if(tx.aborted){tx.onabort?.();return;}tx.commit?.();tx.oncomplete?.();}catch(error){tx.error=error;tx.onabort?.();}};
    if(mode==='readwrite')tail=tail.then(run);else run();return tx;
  }};
  return {rows,setQuota(value){quota=value;},open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess?.();});return request;}};
}
test('IDB adapter commits atomically and preserves the previous complete payload',async()=>{
  const engine=fakeIndexedDB(),store=await open(engine);
  assert.equal(await store.read('dest'),null);
  const first=await store.write('dest',0,{value:1});assert.equal(first.rev,1);
  const second=await store.write('dest',1,{value:2});assert.deepEqual(second.previous,{value:1});
  assert.equal((await store.list()).length,1);assert.equal((await store.read('dest')).payload.value,2);
});
test('simultaneous writers cannot both commit the same expected revision',async()=>{
  const engine=fakeIndexedDB(),store=await open(engine);
  const results=await Promise.allSettled([store.write('dest',0,{value:1}),store.write('dest',0,{value:2})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const rejected=results.find(result=>result.status==='rejected');assert.equal(rejected.reason.code,'CONFLICT');
  assert.equal((await store.read('dest')).rev,1);
});
test('quota abort leaves the complete saved record intact',async()=>{
  const engine=fakeIndexedDB(),store=await open(engine);await store.write('dest',0,{value:'keep'});engine.setQuota(true);
  await assert.rejects(store.write('dest',1,{value:'lose'}),/Quota/);
  assert.equal((await store.read('dest')).payload.value,'keep');assert.equal((await store.read('dest')).rev,1);
});
