import assert from 'node:assert/strict';
import test,{before,after,beforeEach} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {generateKeyPair,UnsecuredJWT} from 'jose';
import {freshResearchApi} from '../helpers/research-http-gateway.mjs';
import {A,B,workspace,research,copy,snapshot,model,local,cloud} from '../helpers/research-cloud-fixture.mjs';

let h;
const storage=['setu_research_workspaces','setu_research_requests','setu_research_identities','setu_research_evidence'];
const core=['setu_hubs','setu_food_notes','setu_spots'];
before(async()=>{h=await freshResearchApi();console.log('HTTP rehearsal: real PostgREST 16.6, Supabase JS 2.119.2, ES256 test keys, owned PostgreSQL 17 cluster.');},{timeout:60000});
after(async()=>{await h?.close();},{timeout:20000});
beforeEach(async()=>{
  Object.assign(h.control,{dropCommitResponses:false,swapCommitToken:null,identityFailure:false,afterCommit:null});h.requests.length=0;
  await h.db.admin.query('truncate '+[...storage,...core,'akatsuki_places','akatsuki_shops'].map(t=>'public.'+t).join(',')+' cascade');
});
async function rows(table){assert.ok([...storage,...core].includes(table));return (await h.db.admin.query('select * from public.'+table)).rows;}
async function empty(){for(const t of [...storage,...core])assert.equal((await rows(t)).length,0);}
async function raw(path,jwt,{method='GET',body,headers={}}={}){
  const r=await fetch(h.url+'/rest/v1/'+path,{method,headers:{...(jwt?{authorization:'Bearer '+jwt}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};
}
function request(payload,extra={}){return {p_owner:A,p_destination:payload.id,p_expected_revision:0,p_request_id:randomUUID(),p_workspace:payload,p_publish:true,p_checks:[],...extra};}
async function personalFood(){
  const actor=await h.db.actor(A);
  return (await actor.query("insert into public.setu_food_notes(name,address,accepted,status,review,rating,spend_yen,wifi,themes) values('Test park','Test address 1',true,'done','Keep my review',5,700,true,array['quiet']) returning *")).rows[0];
}
async function mergePayload(row){
  const data=research();data.places[0].research_fields.cost.raw_text='Updated research; price remains unknown';
  const input=await local.inspectInput(JSON.stringify(data));
  let review=local.prepare(data,snapshot({setu_food_notes:[row]}),local.emptyCatalog(),'2026-11-25',input.scope);
  const choice=model.setDecision(review,'P1','merge_selected',{target:{table:'setu_food_notes',id:row.id},fields:['cost'],same_place_acknowledged:true});
  assert.equal(choice.ok,true,choice.error);review=choice.value;
  return {id:input.scope,active:input.report,reviews:{[input.report]:model.reviewExport(review)},catalog:local.emptyCatalog()};
}

test('a signed JWT reaches the real REST capability and SDK getUser identity routes',async()=>{
  const {sb}=await h.sdk(A);const who=await sb.auth.getUser();assert.equal(who.error,null);assert.equal(who.data.user.id,A);
  const cap=await sb.rpc('setu_research_capabilities');assert.equal(cap.error,null);assert.equal(cap.data,'4.0.0');
});

test('missing, tampered, wrong-key, unsigned, expired, future and wrong-audience tokens fail JWT/permission checks',async()=>{
  const valid=await h.token(A),parts=valid.split('.');
  parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),sub:B})).toString('base64url');
  const wrongKey=(await generateKeyPair('ES256')).privateKey,now=Math.floor(Date.now()/1000);
  const tokens=[null,parts.join('.'),await h.token(A,{},wrongKey),new UnsecuredJWT({sub:A,role:'authenticated',exp:now+600}).encode(),
    await h.token(A,{exp:now-3600}),await h.token(A,{nbf:now+3600}),await h.token(A,{aud:'wrong-audience'})];
  const payload=await workspace();
  for(const jwt of tokens){const r=await raw('rpc/setu_research_commit',jwt,{method:'POST',body:request(payload)});assert.equal(r.status,401,JSON.stringify(r.data));}
  await empty();
});

test('a valid signature cannot grant the gateway an administrative database role',async()=>{
  const r=await raw('rpc/setu_research_commit',await h.token(A,{role:'postgres'}),{method:'POST',body:request(await workspace())});
  assert.equal(r.status,403);assert.equal(r.data.code,'42501');await empty();
});

test('valid signed anonymous and wrong-owner requests cannot publish',async()=>{
  const data=await workspace();
  for(const jwt of [await h.token(A,{is_anonymous:true}),await h.token(B)]){
    const r=await raw('rpc/setu_research_commit',jwt,{method:'POST',body:request(data)});
    assert.equal(r.data.code,'28000');assert.ok([401,403].includes(r.status));
  }
  await empty();
});

test('backup-only prepare and commit use real HTTP JSON claims and retain a portable workspace',async()=>{
  const data=await workspace(),device=await h.client(data),plan=await device.api.prepare(device.record,false);
  assert.equal(plan.remote_rev,0);const receipt=await device.api.commit(plan,true);assert.equal(receipt.owner,A);assert.equal(receipt.rev,1);
  const restored=await local.inspectInput(JSON.stringify(await device.api.download(data.id)));
  assert.deepEqual(restored.workspace.catalog,data.catalog);for(const t of core)assert.equal((await rows(t)).length,0);
});

test('SDK publication and repeat publication preserve sources, unknown prices and personal reviews',async()=>{
  const data=await workspace(research(),'food'),d=await h.client(data);
  assert.equal((await d.api.commit(await d.api.prepare(d.record,true),true)).created,1);
  const first=(await rows('setu_food_notes'))[0];assert.equal(first.accepted,false);assert.equal(first.status,'try');assert.equal(first.spend_yen,null);assert.equal(first.lat,null);
  const edited=await d.sb.from('setu_food_notes').update({rev:first.rev+1,review:'Personal review',accepted:true,status:'done',rating:4,lat:35,lng:139}).eq('id',first.id).select().single();assert.equal(edited.error,null);
  const before=(await rows('setu_food_notes'))[0],plan=await d.api.prepare(d.record,true);assert.equal(plan.summary.reused,1);
  const result=await d.api.commit(plan,true);assert.equal(result.created,0);assert.equal(result.evidence_added,0);
  assert.deepEqual((await rows('setu_food_notes'))[0],before);
  assert.deepEqual((await d.api.evidence())[0].source,data.catalog.places[0].source);
});

test('another account sees no owner records, even with an explicit owner-ID filter',async()=>{
  const data=await workspace(),a=await h.client(data);await a.api.commit(await a.api.prepare(a.record,true),true);
  const b=await h.client(data,B);assert.deepEqual(await b.api.list(),[]);assert.deepEqual(await b.api.evidence(),[]);
  assert.equal((await b.api.prepare(b.record,false)).remote_rev,0);
  for(const table of [...storage,...core]){const r=await b.sb.from(table).select('user_id').eq('user_id',A);assert.equal(r.error,null);assert.deepEqual(r.data,[]);}
  await b.api.commit(await b.api.prepare(b.record,true),true);assert.equal((await rows('setu_spots')).length,2);
});

test('direct HTTP inserts cannot forge another owner in any research table',async()=>{
  const data=await workspace(),d=await h.client(data);await d.api.commit(await d.api.prepare(d.record,true),true);
  const jwt=await h.token(B),cases=[
    [storage[0],{user_id:A,destination_id:'destination-'+'a'.repeat(64),rev:1,payload:{}}],
    [storage[1],{user_id:A,request_id:randomUUID(),request_hash:'test',response:{}}],
    [storage[2],{user_id:A,local_id:'forged',destination_id:data.id,target_table:'setu_spots',target_id:randomUUID(),original:{}}],
    [storage[3],{user_id:A,attachment_key:'forged',destination_id:data.id,target_table:'setu_spots',target_id:randomUUID(),source:{},evidence:{},selected_fields:['cost']}],
  ];
  for(const [table,body] of cases){const r=await raw(table,jwt,{method:'POST',body});assert.equal(r.status,403);assert.equal(r.data.code,'42501');}
  assert.equal((await rows(storage[0])).length,1);
});

test('append-only permissions and private-schema exposure are enforced at HTTP endpoints',async()=>{
  const data=await workspace(),d=await h.client(data);await d.api.commit(await d.api.prepare(d.record,true),true);
  const update=await raw(storage[1],d.jwt,{method:'PATCH',body:{request_hash:'changed'}});assert.equal(update.status,403);assert.equal(update.data.code,'42501');
  const remove=await raw(storage[3],d.jwt,{method:'DELETE'});assert.equal(remove.status,403);
  const hidden=await d.sb.schema('auth').from('users').select();assert.equal(hidden.error.code,'PGRST106');
  assert.equal((await rows(storage[1])).length,1);assert.equal((await rows(storage[3])).length,1);
});

test('fresh comparison completes over real server-enforced two-row pages and exact count headers',async()=>{
  const a=await h.db.actor(A);for(let i=0;i<5;i++)await a.query('insert into public.setu_hubs(name) values($1)',['Unrelated hub '+i]);
  const b=await h.db.actor(B);await b.query("insert into public.setu_hubs(name) values('Other owner hub')");
  const d=await h.client(await workspace()),plan=await d.api.prepare(d.record,true);assert.equal(plan.summary.created,1);
  const pages=h.requests.filter(r=>r.path.startsWith('/rest/v1/setu_hubs?'));assert.equal(pages.length,3);
});

test('stale HTTP workspaces become explicit conflicts and require a new preview',async()=>{
  const data=await workspace(),a=await h.client(data),b=await h.client(data);
  const pa=await a.api.prepare(a.record,false),pb=await b.api.prepare(b.record,false);await a.api.commit(pa,true);
  await assert.rejects(b.api.commit(pb,true),e=>e.code==='40001'&&e.rejected===true);
  assert.equal((await b.outbox.read(A+'/'+data.id)).payload.state,'conflict');
  const refreshed=await b.api.prepare(b.record,false);assert.equal(refreshed.remote_rev,1);await b.api.commit(refreshed,true);
  assert.equal((await rows(storage[0]))[0].rev,2);
});

test('selected evidence merges through HTTP preserve every existing personal/core value except revision and time',async()=>{
  const before=await personalFood(),d=await h.client(await mergePayload(before));
  const plan=await d.api.prepare(d.record,true);assert.equal(plan.summary.merges,1);await d.api.commit(plan,true);
  const after=(await rows('setu_food_notes'))[0];assert.equal(after.rev,before.rev+1);
  assert.deepEqual({...after,rev:before.rev,updated_at:before.updated_at},before);assert.deepEqual((await d.api.evidence())[0].selected_fields,['cost']);
});

test('an HTTP manual edit after preview prevents a stale selected merge',async()=>{
  const before=await personalFood(),d=await h.client(await mergePayload(before)),plan=await d.api.prepare(d.record,true);
  const edit=await d.sb.from('setu_food_notes').update({rev:before.rev+1,review:'New manual review'}).eq('id',before.id);assert.equal(edit.error,null);
  await assert.rejects(d.api.commit(plan,true),e=>e.code==='40001');
  assert.equal((await rows('setu_food_notes'))[0].review,'New manual review');for(const t of storage)assert.equal((await rows(t)).length,0);
});

test('a real SDK account switch before dispatch cannot send a prior account plan',async()=>{
  const data=await workspace(),d=await h.client(data),plan=await d.api.prepare(d.record,false);
  const changed=await d.sb.auth.setSession({access_token:await h.token(B),refresh_token:'synthetic-not-used'});assert.equal(changed.error,null);
  await assert.rejects(d.api.commit(plan,true),e=>e.code==='AUTH_CHANGED');assert.equal(await d.outbox.read(A+'/'+data.id),null);await empty();
});

test('the RPC owner guard rejects a token switch at dispatch even when both client identity checks see the prior account',async()=>{
  const data=await workspace(),d=await h.client(data),plan=await d.api.prepare(d.record,false);h.control.swapCommitToken=await h.token(B);
  await assert.rejects(d.api.commit(plan,true),e=>e.code==='28000');await empty();
});

test('an account switch after commit keeps the receipt pending for its original owner and never retries it as the new owner',async()=>{
  const data=await workspace(),d=await h.client(data),plan=await d.api.prepare(d.record,true);
  h.control.afterCommit=async()=>{const r=await d.sb.auth.setSession({access_token:await h.token(B),refresh_token:'synthetic-not-used'});assert.equal(r.error,null);};
  await assert.rejects(d.api.commit(plan,true),e=>e.code==='AUTH_CHANGED'&&e.uncertain===true);
  const original=(await rows(storage[1]))[0].response;assert.equal(original.owner,A);
  assert.equal((await d.outbox.read(A+'/'+data.id)).payload.state,'pending');
  await assert.rejects(d.api.retry(data.id),e=>e.code==='AUTH_CHANGED');
  const asB=cloud.create({sb:d.sb,owner:B,isCurrent:()=>true,localStore:d.localStore,outbox:d.outbox,enabled:true});
  await assert.rejects(asB.retry(data.id),/No uncertain upload/);assert.equal(await d.outbox.read(B+'/'+data.id),null);
  const r=await d.sb.auth.setSession({access_token:await h.token(A),refresh_token:'synthetic-not-used'});assert.equal(r.error,null);
  assert.deepEqual(await d.api.retry(data.id),original);assert.equal((await rows('setu_spots')).length,1);
});

test('an actually dropped committed HTTP response leaves the exact request pending and retry recovers its original receipt',async()=>{
  const data=await workspace(),d=await h.client(data),plan=await d.api.prepare(d.record,true);h.control.dropCommitResponses=true;
  await assert.rejects(d.api.commit(plan,true),e=>e.uncertain===true);
  const pending=await d.outbox.read(A+'/'+data.id);assert.equal(pending.payload.state,'pending');
  assert.equal((await rows('setu_spots')).length,1);const original=(await rows(storage[1]))[0].response;
  h.control.dropCommitResponses=false;
  const other=await h.client(data);await other.api.commit(await other.api.prepare(other.record,false),true);
  assert.deepEqual(await d.api.retry(data.id),original);assert.equal((await rows(storage[0]))[0].rev,2);assert.equal((await rows('setu_spots')).length,1);
  const commits=h.requests.filter(r=>r.path==='/rest/v1/rpc/setu_research_commit'),lost=commits.find(r=>r.dropped);
  assert.ok(lost);assert.equal(commits.at(-1).bodyHash,lost.bodyHash);assert.equal((await d.outbox.read(A+'/'+data.id)).payload.state,'done');
});

test('identity verification failure and the default release gate prevent HTTP mutations',async()=>{
  const data=await workspace(),d=await h.client(data),plan=await d.api.prepare(d.record,false);h.control.identityFailure=true;
  await assert.rejects(d.api.commit(plan,true),e=>e.code==='AUTH_CHANGED');h.control.identityFailure=false;
  assert.equal(cloud.RELEASE_ENABLED,false);
  const disabled=cloud.create({sb:d.sb,owner:A,isCurrent:()=>true,localStore:d.localStore,outbox:d.outbox});
  await assert.rejects(disabled.commit(plan,true),e=>e.code==='NOT_ENABLED');await empty();
});

test('Little World and unknown dish prices round-trip over actual REST JSON and current/previous downloads',async()=>{
  const source=JSON.parse(await readFile(new URL('../../docs/research-prompts/little-world/synthetic-handoff.example.json',import.meta.url),'utf8'));
  const input=await local.inspectInput(JSON.stringify(source));let review=local.prepare(source,null,local.emptyCatalog(),'2026-11-25',input.scope);
  review=model.resolveHub(review,source.hubs[0].id,{kind:'new'},true).value;
  review=model.setDecision(review,'FOOD-1','accept_suggestion',{record_kind:'food',distinct_acknowledged:true}).value;
  const materialized=await local.materialize(review,local.emptyCatalog(),input.scope);
  const payload={id:input.scope,active:input.report,reviews:{[input.report]:model.reviewExport(review)},catalog:materialized.catalog};
  const d=await h.client(payload);await d.api.commit(await d.api.prepare(d.record,true),true);
  assert.deepEqual((await d.api.evidence())[0].source,source.places[0]);
  await d.api.commit(await d.api.prepare(d.record,false),true);
  for(const previous of [false,true]){const restored=await local.inspectInput(JSON.stringify(await d.api.download(payload.id,previous)));assert.deepEqual(restored.research,source);}
});
