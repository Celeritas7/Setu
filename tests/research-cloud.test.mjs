import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {workspace,research,snapshot,copy,A,B,cloud,Store,model,local} from './helpers/research-cloud-fixture.mjs';
function api() {
  const tables={setu_hubs:[],setu_spots:[],setu_food_notes:[],akatsuki_places:[],akatsuki_shops:[],setu_research_identities:[],setu_research_evidence:[],setu_research_workspaces:[]};
  const calls=[],receipts=new Map();let authOwner=A,lost=false,totalAvailable=true;
  class Query {
    filters=[];offset=0;last=Infinity;single=false;
    constructor(table){this.table=table;}
    select(){return this;}order(){return this;}eq(field,value){this.filters.push(row=>row[field]===value);return this;}
    is(field,value){this.filters.push(row=>(row[field] ?? null)===value);return this;}
    range(first,last){this.offset=first;this.last=last;return this;}limit(count){this.last=count-1;return this;}maybeSingle(){this.single=true;return this;}
    then(resolve,reject){return Promise.resolve().then(()=>{
      const matches=tables[this.table].filter(row=>this.filters.every(fn=>fn(row)));
      // Deliberately lower than the requested page size, like an API row cap.
      const rows=matches.slice(this.offset,Math.min(this.last+1,this.offset+2));
      return {data:this.single?(rows[0] || null):rows,count:totalAvailable?matches.length:null,error:null};
    }).then(resolve,reject);}
  }
  const sb={auth:{async getUser(){return {data:{user:{id:authOwner}}};}},from(table){return new Query(table);},async rpc(name,args){
    calls.push({name,args:copy(args || {})});if(name==='setu_research_capabilities')return {data:'4.0.0'};
    if(args.p_owner!==authOwner)return {error:{code:'28000',message:'Account changed'}};
    let response=receipts.get(args.p_request_id);
    if(!response){let row=tables.setu_research_workspaces.find(row=>row.destination_id===args.p_destination);
      if((row?.rev || 0)!==args.p_expected_revision)return {error:{code:'40001',message:'Workspace changed'}};
      response={owner:args.p_owner,destination:args.p_destination,request_id:args.p_request_id,rev:args.p_expected_revision+1,created:0,evidence_added:0};
      if(!row){row={user_id:authOwner,destination_id:args.p_destination};tables.setu_research_workspaces.push(row);}Object.assign(row,{rev:response.rev,payload:copy(args.p_workspace)});receipts.set(args.p_request_id,response);
    }
    if(lost){lost=false;return {error:{code:'FETCH_ERROR',message:'Response lost'}};}return {data:copy(response)};
  }};
  return {sb,tables,calls,receipts,setOwner(value){authOwner=value;},loseResponse(){lost=true;},loseCount(){totalAvailable=false;}};
}
async function setup(enabled=true) {
  const backend=api(),localStore=new Store(),outbox=new Store(),payload=await workspace(),record=await localStore.write(payload.id,0,payload);let current=true;
  const client=cloud.create({sb:backend.sb,owner:A,isCurrent:()=>current,localStore,outbox,enabled,uuid:randomUUID});
  return {...backend,client,record,localStore,outbox,invalidate(){current=false;}};
}
const mutations=h=>h.calls.filter(call=>call.name==='setu_research_commit');
test('release gate and explicit account/batch approval prevent accidental uploads',async()=>{
  assert.equal(cloud.RELEASE_ENABLED,false);const h=await setup(false),plan=await h.client.prepare(h.record);
  await assert.rejects(h.client.commit(plan,true),/disabled/);assert.equal(mutations(h).length,0);assert.equal(h.outbox.records.size,0);
  const enabled=await setup(),preview=await enabled.client.prepare(enabled.record);await assert.rejects(enabled.client.commit(preview,false),/Confirm/);assert.equal(mutations(enabled).length,0);
});
test('uncertain uploads retain an exact durable request and retry its ID without uploading edited data',async()=>{
  const h=await setup(),plan=await h.client.prepare(h.record);h.loseResponse();
  await assert.rejects(h.client.commit(plan,true),/Response lost/);
  assert.equal([...h.outbox.records.values()][0].payload.state,'pending');
  await assert.rejects(h.client.prepare(h.record),/Retry that exact request/);
  const result=await h.client.retry(h.record.id);assert.equal(result.rev,1);
  assert.deepEqual(mutations(h)[0].args,mutations(h)[1].args);assert.equal(h.receipts.size,1);
});
test('changed accounts and local revisions invalidate a prepared batch before dispatch',async()=>{
  const h=await setup(),plan=await h.client.prepare(h.record);h.setOwner(B);
  await assert.rejects(h.client.commit(plan,true),/session/);assert.equal(mutations(h).length,0);
  h.setOwner(A);await h.localStore.write(h.record.id,1,h.record.payload);
  await assert.rejects(h.client.commit(plan,true),/Local review changed/);assert.equal(mutations(h).length,0);
});
test('a stale cloud revision is a known conflict and a fresh preview is required',async()=>{
  const h=await setup(),plan=await h.client.prepare(h.record);h.tables.setu_research_workspaces.push({destination_id:h.record.id,user_id:A,rev:7,payload:h.record.payload});
  await assert.rejects(h.client.commit(plan,true),/Workspace changed/);
  assert.equal([...h.outbox.records.values()][0].payload.state,'conflict');
  assert.equal((await h.client.prepare(h.record)).remote_rev,7);
});
test('paged comparison honors exact totals when the API caps each response and refuses incomplete reads',async()=>{
  const h=await setup();for(let i=0;i<7;i++)h.tables.setu_hubs.push({id:String(i),name:'Other hub '+i,rev:1});
  const plan=await h.client.prepare(h.record,true);assert.equal(plan.summary.created,1);
  h.loseCount();await assert.rejects(h.client.prepare(h.record,true),/Comparison changed/);assert.equal(mutations(h).length,0);
});
test('cloud backup downloads validate and preserve all original evidence',async()=>{
  const h=await setup(),plan=await h.client.prepare(h.record);await h.client.commit(plan,true);
  const backup=await h.client.download(h.record.id),restored=await local.inspectInput(JSON.stringify(backup));
  assert.deepEqual(restored.workspace.catalog,h.record.payload.catalog);assert.deepEqual(restored.research,research());
});
test('combining devices keeps cloud-only research versions and shows decision differences instead of hiding them',async()=>{
  const first=await workspace(),next=copy(first);const report=next.active;
  next.reviews[report]=model.setDecision(next.reviews[report],'P1','skip').value;
  const merged=await cloud.combine(first,next);assert.equal(merged.differences[0].cloud,'accept_suggestion');assert.equal(merged.differences[0].local,'skip');
  const other=research();other.provenance.new_version=true;const third=await workspace(other);
  const combined=await cloud.combine(first,third);assert.equal(Object.keys(combined.payload.reviews).length,2);
  const diverged=copy(first);diverged.catalog.places[0].source.location.address_ja='Changed address';
  await assert.rejects(cloud.combine(first,diverged),/draft conflict/);
});
test('selective cloud merges require a current target revision and never propose protected column updates',async()=>{
  const data=research(),input=await local.inspectInput(JSON.stringify(data)),id=randomUUID();let review=model.preview(data,snapshot({setu_spots:[{id,name:'Saved park',rev:2}]}));
  review=model.setDecision(review,'P1','merge_selected',{target:{table:'setu_spots',id},fields:['cost','potential_experiences'],same_place_acknowledged:true}).value;
  const payload={id:input.scope,active:input.report,reviews:{[input.report]:review},catalog:local.emptyCatalog()};
  const plan=await cloud.build(payload,snapshot({setu_spots:[{id,name:'Saved park',rev:2}]}),[],true);assert.deepEqual(plan.checks,[{table:'setu_spots',id,rev:2}]);assert.equal(plan.summary.merges,1);
  await assert.rejects(cloud.build(payload,snapshot({setu_spots:[{id,rev:3}]}),[],true),/target changed/);
  const rebased=local.restoredReview(review,local.emptyCatalog(),'2026-11-22',input.scope,snapshot({setu_spots:[{id,rev:3}]}));
  assert.equal(rebased.review.candidates[0].decision,'pending');assert.match(rebased.warnings[0],/approval again/);
});

test('backup serialization enforces the restore limit in UTF-8 bytes', async()=>{
  const envelope=local.backup(await workspace());
  const roundTrip=await local.inspectInput(local.serializeBackup(envelope));
  assert.equal(roundTrip.kind,'backup');
  assert.deepEqual(roundTrip.workspace.catalog,envelope.workspace.catalog);
  envelope.padding='';
  const remaining=local.MAX_BACKUP_BYTES-Buffer.byteLength(JSON.stringify(envelope));
  envelope.padding='旅'.repeat(Math.floor(remaining/3))+'x'.repeat(remaining%3);
  assert.equal(Buffer.byteLength(local.serializeBackup(envelope)),local.MAX_BACKUP_BYTES);
  envelope.padding+='x';
  assert.throws(()=>local.serializeBackup(envelope),/25 MiB/);
});
