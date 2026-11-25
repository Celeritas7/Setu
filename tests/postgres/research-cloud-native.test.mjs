import assert from 'node:assert/strict';
import test,{before,after,beforeEach,afterEach} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {freshPostgres} from '../helpers/research-native-postgres.mjs';
import {research,workspace,snapshot,copy,A,B,cloud,model,local,Store} from '../helpers/research-cloud-fixture.mjs';

let db;
const storage=['setu_research_workspaces','setu_research_requests','setu_research_identities','setu_research_evidence'];
const core=['setu_hubs','setu_food_notes','setu_spots'];
const all=[...storage,...core];
const migration=new URL('../../supabase/migrations/20261122065058_research_import_cloud.sql',import.meta.url);
before(async()=>{
  db=await freshPostgres();
  await db.admin.query('insert into auth.users values($1),($2)',[A,B]);
  await db.admin.query(await readFile(migration,'utf8'));
  console.log('Native rehearsal: '+db.info.version+'; owned temporary loopback cluster; synthetic data only.');
},{timeout:60000});
after(async()=>{await db?.close();},{timeout:20000});
beforeEach(async()=>{await db.admin.query('truncate '+all.map(t=>'public.'+t).join(',')+' cascade');});
afterEach(async()=>{await db?.closeActors();});

async function rows(table,client=db.admin){assert.ok(all.includes(table));return (await client.query('select * from public.'+table)).rows;}
async function counts(){const result={};for(const t of all)result[t]=(await rows(t)).length;return result;}
async function empty(){for(const n of Object.values(await counts()))assert.equal(n,0);}
async function pid(client){assert.ok(Number.isInteger(client.rehearsalPid));return client.rehearsalPid;}
async function checks(client){return (await client.query("select 'setu_hubs' as table,id,rev from public.setu_hubs union all select 'setu_spots',id,rev from public.setu_spots union all select 'setu_food_notes',id,rev from public.setu_food_notes")).rows;}
function caught(promise){return promise.then(value=>({ok:true,value}),error=>({ok:false,error}));}
function rejected(result,code){assert.equal(result.ok,false);assert.equal(result.error.code,code,result.error.message);}
function args(payload,{owner=A,expected=0,publish=true,checks=[],request=randomUUID()}={}){
  return {p_owner:owner,p_destination:payload.id,p_expected_revision:expected,p_request_id:request,p_workspace:payload,p_publish:publish,p_checks:checks};
}
async function send(client,a){return (await client.query('select public.setu_research_commit($1,$2,$3,$4,$5,$6,$7) as result',[
  a.p_owner,a.p_destination,a.p_expected_revision,a.p_request_id,JSON.stringify(a.p_workspace),a.p_publish,JSON.stringify(a.p_checks),
])).rows[0].result;}
async function commit(client,payload,options){return send(client,args(payload,options));}
async function waiting(backend,blockingBackend,kind){
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    const {rows:[row]}=await db.admin.query("select pg_blocking_pids($1) as blockers,exists(select 1 from pg_locks where pid=$1 and not granted and ($2::text is null or locktype=$2)) as waiting",[backend,kind||null]);
    if(row.waiting&&row.blockers.includes(blockingBackend))return;
    await delay(15);
  }
  assert.fail('The independent backend did not reach the expected PostgreSQL lock wait.');
}
async function mergePayload(target,fields=['cost']){
  const data=research();data.places[0].research_fields.cost.raw_text='New researched price remains unknown';
  const input=await local.inspectInput(JSON.stringify(data));
  let review=local.prepare(data,snapshot({setu_food_notes:[target]}),local.emptyCatalog(),'2026-11-25',input.scope);
  const decision=model.setDecision(review,'P1','merge_selected',{target:{table:'setu_food_notes',id:target.id},fields,same_place_acknowledged:true});
  assert.equal(decision.ok,true,decision.error);review=decision.value;
  return {id:input.scope,active:input.report,reviews:{[input.report]:model.reviewExport(review)},catalog:local.emptyCatalog()};
}
async function personalFood(client){
  return (await client.query(`insert into public.setu_food_notes(name,address,accepted,status,review,rating,lat,lng,
    wifi,seating_type,last_checked,spend_yen,spend_seen,themes,hours)
    values('Test park','Test address 1',true,'done','Keep my personal review',5,35,139,true,'own_food_ok',
    '2026-11-20',700,'2026-11-20',array['quiet'],'{"fri":[[540,1080]]}') returning *`)).rows[0];
}

test('migration runs on native PostgreSQL 17 with invoker functions and effective owner-only grants',async()=>{
  const a=await db.actor(A),b=await db.actor(B);
  const pids=[await pid(a),await pid(b),await pid(db.admin)];assert.equal(new Set(pids).size,3);
  const role=(await a.query('select current_user as name,rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0];
  assert.deepEqual(role,{name:'authenticated',rolsuper:false,rolbypassrls:false});
  await assert.rejects(a.query('set role postgres'),error=>error.code==='42501');
  assert.equal((await a.query('select public.setu_research_capabilities() as version')).rows[0].version,'4.0.0');
  const functions=(await db.admin.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated from pg_proc where proname like 'setu_research_%'")).rows;
  assert.equal(functions.length,7);
  for(const f of functions){assert.equal(f.prosecdef,false);assert.equal(f.anon,false);assert.equal(f.authenticated,true);assert.ok(f.proconfig.some(c=>['search_path=""','search_path='].includes(c)));}
  for(const t of storage){
    const x=(await db.admin.query("select relrowsecurity,has_table_privilege('anon',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon,has_table_privilege('authenticated',$1,'TRUNCATE') as truncate from pg_class where oid=$1::regclass",['public.'+t])).rows[0];
    assert.equal(x.relrowsecurity,true);assert.equal(x.anon,false);assert.equal(x.truncate,false);
  }
  for(const t of storage.slice(1))assert.equal((await db.admin.query("select has_table_privilege('authenticated',$1,'UPDATE,DELETE') as allowed",['public.'+t])).rows[0].allowed,false);
});

test('backup-only saves retain the complete workspace and previous checkpoint without creating places',async()=>{
  const a=await db.actor(A),data=await workspace();
  const first=await commit(a,data,{publish:false});assert.equal(first.rev,1);
  const changed=research();changed.places[0].research_fields.cost.raw_text='Rechecked, still unknown';
  const second=await workspace(changed);await commit(a,second,{publish:false,expected:1});
  const saved=(await rows(storage[0],a))[0];assert.equal(saved.rev,2);assert.deepEqual(saved.payload,second);assert.deepEqual(saved.previous_payload,data);
  for(const t of core)assert.equal((await rows(t)).length,0);
  const restored=await local.inspectInput(JSON.stringify(local.backup(saved.payload)));
  assert.deepEqual(restored.workspace.catalog,second.catalog);
});

test('publishing and exact repeated saves preserve sources, unknown prices and all personal fields',async()=>{
  const a=await db.actor(A),data=await workspace(research(),'food');await commit(a,data);
  const first=(await rows('setu_food_notes',a))[0];
  assert.equal(first.accepted,false);assert.equal(first.status,'try');assert.equal(first.lat,null);assert.equal(first.spend_yen,null);
  assert.equal(first.review,null);assert.deepEqual(first.themes,[]);
  await a.query("update public.setu_food_notes set rev=rev+1,accepted=true,status='done',review='Personal',rating=4,lat=35,lng=139,wifi=true where id=$1",[first.id]);
  const before=(await rows('setu_food_notes',a))[0],result=await commit(a,data,{expected:1,checks:await checks(a)});
  assert.equal(result.created,0);assert.equal(result.evidence_added,0);
  assert.deepEqual((await rows('setu_food_notes',a))[0],before);
  assert.deepEqual((await rows(storage[3],a))[0].source,data.catalog.places[0].source);
});

test('Little World optional profiles survive native publication and portable backup losslessly',async()=>{
  const source=JSON.parse(await readFile(new URL('../../docs/research-prompts/little-world/synthetic-handoff.example.json',import.meta.url),'utf8'));
  const input=await local.inspectInput(JSON.stringify(source));let review=local.prepare(source,null,local.emptyCatalog(),'2026-11-25',input.scope);
  review=model.resolveHub(review,source.hubs[0].id,{kind:'new'},true).value;
  review=model.setDecision(review,'FOOD-1','accept_suggestion',{record_kind:'food',distinct_acknowledged:true}).value;
  const saved=await local.materialize(review,local.emptyCatalog(),input.scope);
  const payload={id:input.scope,active:input.report,reviews:{[input.report]:model.reviewExport(review)},catalog:saved.catalog};
  const a=await db.actor(A);await commit(a,payload);
  assert.deepEqual((await rows(storage[3],a))[0].source,source.places[0]);
  const restored=await local.inspectInput(JSON.stringify(local.backup((await rows(storage[0],a))[0].payload)));
  assert.deepEqual(restored.research,source);
});

test('valid v1 handoffs may omit the optional null personal_observation field',async()=>{
  const source=research();delete source.places[0].personal_observation;
  assert.equal(model.validateText(JSON.stringify(source)).ok,true);
  const a=await db.actor(A);await commit(a,await workspace(source));
  assert.equal((await rows('setu_spots',a)).length,1);
  assert.equal(Object.hasOwn((await rows(storage[3],a))[0].source,'personal_observation'),false);
});

test('non-null personal observations still reject the complete batch',async()=>{
  const a=await db.actor(A),data=await workspace();
  for(const value of [{review:'Must not import'},'Personally visited',false,[]]){
    const bad=copy(data);bad.catalog.places[0].source.personal_observation=value;
    await assert.rejects(commit(a,bad),/Research cannot supply personal confirmations/);await empty();
  }
});

test('a second account cannot read or forge any of the four owner-isolated storage tables',async()=>{
  const a=await db.actor(A),data=await workspace();await commit(a,data);
  const b=await db.actor(B);
  for(const t of storage){assert.equal((await rows(t,b)).length,0);assert.equal((await b.query('select * from public.'+t+' where user_id=$1',[A])).rowCount,0);}
  await assert.rejects(commit(b,data,{owner:A}),error=>error.code==='28000');
  const probes=[
    ["insert into public.setu_research_workspaces(user_id,destination_id,rev,payload) values($1,$2,1,$3)",[A,'destination-'+'a'.repeat(64),JSON.stringify(data)]],
    ["insert into public.setu_research_requests(user_id,request_id,request_hash,response) values($1,$2,'test','{}')",[A,randomUUID()]],
    ["insert into public.setu_research_identities values($1,'test',$2,'setu_spots',$3,'{}')",[A,data.id,randomUUID()]],
    ["insert into public.setu_research_evidence values($1,'test',$2,'setu_spots',$3,'{}','{}',array['cost'],now())",[A,data.id,randomUUID()]],
  ];
  for(const [sql,values] of probes)await assert.rejects(b.query(sql,values),error=>error.code==='42501');
  await assert.rejects(b.query('truncate public.setu_research_evidence'),error=>error.code==='42501');
  assert.equal((await rows(storage[0])).length,1);
});

test('anonymous roles and anonymous sign-ins cannot call the research mutator',async()=>{
  const data=await workspace(),guest=await db.actor(null,false,'anon');
  await assert.rejects(rows(storage[0],guest),error=>error.code==='42501');
  await assert.rejects(commit(guest,data),error=>error.code==='42501');
  const signedAnonymous=await db.actor(A,true);await assert.rejects(commit(signedAnonymous,data),error=>error.code==='28000');
  const noUser=await db.actor(null);await assert.rejects(commit(noUser,data),error=>error.code==='28000');await empty();
});

test('two first publications use distinct connections: one wins and the stale contender leaves no partial records',async()=>{
  const a=await db.actor(A),b=await db.actor(A),data=await workspace();
  await a.query('begin');const first=await commit(a,data);
  const next=caught(commit(b,data));await waiting(await pid(b),await pid(a),'advisory');
  await a.query('commit');rejected(await next,'40001');
  assert.equal(first.created,1);assert.equal((await rows('setu_spots')).length,1);
  assert.equal((await rows(storage[0]))[0].rev,1);assert.equal((await rows(storage[1])).length,1);
});

test('concurrent copies of one request wait, then both receive the identical receipt without duplicate places',async()=>{
  const a=await db.actor(A),b=await db.actor(A),data=await workspace(),request=args(data);
  await a.query('begin');const first=await send(a,request);
  const next=caught(send(b,request));await waiting(await pid(b),await pid(a),'advisory');await a.query('commit');
  const second=await next;assert.equal(second.ok,true);assert.deepEqual(second.value,first);
  assert.equal((await rows(storage[1])).length,1);assert.equal((await rows('setu_spots')).length,1);
});

test('competing revision updates preserve the winner and its previous complete checkpoint',async()=>{
  const a=await db.actor(A),b=await db.actor(A),data=await workspace();await commit(a,data,{publish:false});
  const change=research();change.places[0].research_fields.cost.raw_text='Winner evidence';const winner=await workspace(change);
  await a.query('begin');await commit(a,winner,{publish:false,expected:1});
  const next=caught(commit(b,data,{publish:false,expected:1}));await waiting(await pid(b),await pid(a),'advisory');
  await a.query('commit');rejected(await next,'40001');
  const saved=(await rows(storage[0]))[0];assert.equal(saved.rev,2);assert.deepEqual(saved.payload,winner);assert.deepEqual(saved.previous_payload,data);
  assert.equal((await rows(storage[1])).length,2);
});

test('different owners do not share an advisory lock or duplicate identity namespace',async()=>{
  const a=await db.actor(A),b=await db.actor(B),data=await workspace();await a.query('begin');await commit(a,data);
  const second=await commit(b,data,{owner:B});assert.equal(second.owner,B);await a.query('commit');
  assert.equal((await rows('setu_spots')).length,2);
  for(const client of [a,b]){assert.equal((await rows(storage[0],client)).length,1);assert.equal((await rows('setu_spots',client)).length,1);}
});

test('concurrent cross-destination duplicates wait for the owner lock, then fail atomically',async()=>{
  const a=await db.actor(A),b=await db.actor(A);await a.query('begin');await commit(a,await workspace());
  const other=research();other.destination.name_ja='Another test destination';other.hubs[0].name_ja='Different test hub';
  const pending=caught(commit(b,await workspace(other)));await waiting(await pid(b),await pid(a),'advisory');await a.query('commit');
  const result=await pending;rejected(result,'40001');assert.match(result.error.message,/RESEARCH_DUPLICATE/);
  assert.equal((await rows('setu_hubs')).length,1);assert.equal((await rows(storage[0])).length,1);
});

test('selective evidence merges preserve every core/personal value except revision and update time',async()=>{
  const a=await db.actor(A),before=await personalFood(a),payload=await mergePayload(before,['cost','hours']);
  await commit(a,payload,{checks:[{table:'setu_food_notes',id:before.id,rev:before.rev}]});
  const after=(await rows('setu_food_notes',a))[0];assert.equal(after.rev,before.rev+1);
  assert.deepEqual({...after,rev:before.rev,updated_at:before.updated_at},before);
  assert.deepEqual((await rows(storage[3],a))[0].selected_fields,['cost','hours']);
});

test('an actual concurrent manual edit blocks the importer, then rejects its stale target without changing the review',async()=>{
  const importer=await db.actor(A),editor=await db.actor(A),before=await personalFood(editor),payload=await mergePayload(before);
  await editor.query('begin');await editor.query("update public.setu_food_notes set rev=rev+1,review='New personal review' where id=$1",[before.id]);
  const pending=caught(commit(importer,payload,{checks:[{table:'setu_food_notes',id:before.id,rev:before.rev}]}));
  await waiting(await pid(importer),await pid(editor));await editor.query('commit');rejected(await pending,'40001');
  assert.equal((await rows('setu_food_notes'))[0].review,'New personal review');
  for(const t of storage)assert.equal((await rows(t)).length,0);
});

test('failure late in a multi-place batch rolls back earlier hubs, places, identities, evidence and workspace',async()=>{
  const source=research(),other=copy(source.places[0]);other.research_id='P2';other.name_ja='Second test park';other.location.address_ja='Different test address';source.places.push(other);
  const payload=await workspace(source);let review=payload.reviews[payload.active];
  review=model.setDecision(review,'P2','accept_suggestion',{record_kind:'see',distinct_acknowledged:true}).value;
  payload.reviews[payload.active]=review;payload.catalog=(await local.materialize(review,local.emptyCatalog(),payload.id)).catalog;
  assert.equal(payload.catalog.places.length,2);payload.catalog.places[1].source.source_links[0].url='javascript:alert(1)';
  const a=await db.actor(A);await assert.rejects(commit(a,payload),/Invalid research source URL/);await empty();
});

test('terminating a backend before commit rolls back the complete batch and permits the same request to retry',async()=>{
  const importer=await db.actor(A),control=await db.connect(),data=await workspace(),request=args(data);let pending;
  try {
    await db.admin.query(`create function public.rehearsal_pause() returns trigger language plpgsql as $$begin
      perform pg_advisory_xact_lock(987654321);return new;end$$;
      create trigger rehearsal_pause before insert on public.setu_research_requests for each row execute function public.rehearsal_pause()`);
    await control.query('begin');await control.query('select pg_advisory_xact_lock(987654321)');
    pending=caught(send(importer,request));const backend=await pid(control),importerPid=await pid(importer);
    await waiting(importerPid,backend,'advisory');
    await db.admin.query('select pg_terminate_backend($1)',[importerPid]);
    assert.equal((await pending).ok,false);await empty();
  } finally {
    await control.query('rollback');if(pending)await pending;
    await db.admin.query('drop trigger if exists rehearsal_pause on public.setu_research_requests;drop function if exists public.rehearsal_pause()');
  }
  const retry=await send(await db.actor(A),request);assert.equal(retry.created,1);assert.equal((await rows(storage[1])).length,1);
});

test('the real transport keeps an unconfirmed outbox request after a discarded committed response, then recovers its receipt',async()=>{
  const a=await db.actor(A),data=await workspace(),localStore=new Store(),outbox=new Store();
  const record=await localStore.write(data.id,0,data),built=await cloud.build(data,snapshot(),[],true);
  const plan={...built,owner:A,destination:data.id,local_rev:record.rev,remote_rev:0};let drop=true,original;
  const sb={auth:{getUser:async()=>({data:{user:{id:A}}})},async rpc(name,values){
    assert.equal(name,'setu_research_commit');
    try {const response=await send(a,values);original??=response;if(drop){drop=false;throw Error('Simulated lost response after the real commit');}return {data:response};}
    catch(error){if(error.code)return {error:{code:error.code,message:error.message}};throw error;}
  }};
  const client=cloud.create({sb,owner:A,isCurrent:()=>true,localStore,outbox,enabled:true});
  await assert.rejects(client.commit(plan,true),error=>error.uncertain===true);
  assert.equal((await outbox.read(A+'/'+data.id)).payload.state,'pending');assert.equal((await rows('setu_spots')).length,1);
  await commit(await db.actor(A),data,{publish:false,expected:1});
  assert.deepEqual(await client.retry(data.id),original);assert.equal((await outbox.read(A+'/'+data.id)).payload.state,'done');
  assert.equal((await rows(storage[0]))[0].rev,2);assert.equal((await rows('setu_spots')).length,1);
  const bad=args(data,{request:original.request_id,publish:false});
  await assert.rejects(send(a,bad),error=>error.code==='22023');
});
