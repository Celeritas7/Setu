import assert from 'node:assert/strict';
import test,{before,after,beforeEach} from 'node:test';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {workspace,research,snapshot,copy,A,B,cloud,model,local} from './helpers/research-cloud-fixture.mjs';
let db;
const sql=fs.readFileSync(new URL('../supabase/migrations/20261122065058_research_import_cloud.sql',import.meta.url),'utf8');
before(async()=>{
  db=new PGlite();await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${A}'),('${B}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to authenticated,anon; grant execute on all functions in schema auth to authenticated,anon;
    create table public.setu_hubs(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),name text not null,accepted boolean default true,added_by text,geo_query text,lat float8,lng float8,rev integer default 1,deleted_at timestamptz);
    create table public.setu_spots(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),name text,address text,hub_id uuid references public.setu_hubs(id),kind text,source_url text,intro text,accepted boolean default true,status text,added_by text,verified text,lat float8,lng float8,geo_query text,spend_yen integer,place_ref text,rev integer default 1,deleted_at timestamptz,review text,rating integer,seating_checks jsonb);
    create table public.setu_food_notes(like public.setu_spots including all);
    create function public.setu_touch() returns trigger language plpgsql as $$begin
      if tg_op='UPDATE' and new.rev is distinct from old.rev+1 then raise exception 'SETU_STALE' using errcode='40001'; end if;
      if tg_op='INSERT' then new.rev:=1;new.user_id:=auth.uid();else new.user_id:=old.user_id;end if;return new;end$$;
    create trigger setu_hubs_touch before insert or update on public.setu_hubs for each row execute function public.setu_touch();
    create trigger setu_spots_touch before insert or update on public.setu_spots for each row execute function public.setu_touch();
    create trigger setu_food_notes_touch before insert or update on public.setu_food_notes for each row execute function public.setu_touch();
    alter table public.setu_hubs enable row level security;alter table public.setu_spots enable row level security;alter table public.setu_food_notes enable row level security;
    create policy own on public.setu_hubs to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.setu_spots to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.setu_food_notes to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    grant select,insert,update on public.setu_hubs,public.setu_spots,public.setu_food_notes to authenticated;
  `);await db.exec(sql);
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('reset role;truncate public.setu_research_requests,public.setu_research_evidence,public.setu_research_identities,public.setu_research_workspaces,public.setu_spots,public.setu_food_notes,public.setu_hubs cascade;');
  await as(A);
});
async function as(owner,role='authenticated'){await db.exec(`reset role;set role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.query("select set_config('request.jwt.claims','{}',false)");}
async function commit(payload,{owner=A,expected=0,publish=true,checks=[],request=randomUUID()}={}) {
  const r=await db.query('select public.setu_research_commit($1,$2,$3,$4,$5,$6,$7) as result',[owner,payload.id,expected,request,JSON.stringify(payload),publish,JSON.stringify(checks)]);return r.rows[0].result;
}
async function rows(table){return (await db.query(`select * from public.${table}`)).rows;}
async function checks(){return (await db.query("select 'setu_hubs' as table,id,rev from public.setu_hubs union all select 'setu_spots',id,rev from public.setu_spots union all select 'setu_food_notes',id,rev from public.setu_food_notes")).rows;}

test('migration creates owner-isolated RLS storage with no anon or public mutator access',async()=>{
  const data=await workspace();await commit(data,{publish:false});
  await as(B);assert.equal((await rows('setu_research_workspaces')).length,0);
  await assert.rejects(commit(data,{owner:A,publish:false}),/account changed/);
  await as('', 'anon');await assert.rejects(rows('setu_research_workspaces'),/permission denied/);
  await assert.rejects(commit(data,{publish:false}),/permission denied/);
  await as(A);const privileges=await db.query("select has_function_privilege('anon','public.setu_research_commit(uuid,text,integer,uuid,jsonb,boolean,jsonb)','execute') as allowed");assert.equal(privileges.rows[0].allowed,false);
});
test('publishing uses fixed unvisited defaults and preserves complete research, unknown prices and potential tags',async()=>{
  const data=await workspace(),saved=await commit(data);assert.equal(saved.created,1);assert.equal(saved.hubs_created,1);
  const row=(await rows('setu_spots'))[0];assert.equal(row.accepted,false);assert.equal(row.status,'try');assert.equal(row.lat,null);assert.equal(row.spend_yen,null);assert.equal(row.review,null);
  const evidence=(await rows('setu_research_evidence'))[0];assert.deepEqual(evidence.source,data.catalog.places[0].source);assert.equal(evidence.source.tags.experiential_candidates[0].status,'potential');
  assert.deepEqual((await rows('setu_research_workspaces'))[0].payload,data);
});
test('a v1 source may omit optional personal_observation without losing evidence or confirming a visit',async()=>{
  const source=research();delete source.places[0].personal_observation;
  assert.equal(model.validateText(JSON.stringify(source)).ok,true);
  const data=await workspace(source),saved=await commit(data);assert.equal(saved.created,1);
  const row=(await rows('setu_spots'))[0];assert.equal(row.review,null);assert.equal(row.accepted,false);assert.equal(row.status,'try');
  assert.deepEqual((await rows('setu_research_evidence'))[0].source,source.places[0]);
});
test('lost-response retries return the exact receipt even after a later save and reject altered request reuse',async()=>{
  const data=await workspace(),request=randomUUID(),first=await commit(data,{request});
  await commit(data,{expected:1,publish:false});assert.deepEqual(await commit(data,{request}),first);
  assert.equal((await rows('setu_spots')).length,1);assert.equal((await rows('setu_research_evidence')).length,1);
  await assert.rejects(commit(data,{request,publish:false}),/reused with different content/);
});
test('stale devices cannot overwrite workspaces and failed publishing rolls back the whole batch',async()=>{
  const data=await workspace();await commit(data,{publish:false});
  await assert.rejects(commit(data,{publish:false}),/cloud workspace changed/);
  const broken=copy(data);broken.catalog.places[0].accepted=true;
  await assert.rejects(commit(broken,{expected:1}),/Invalid draft defaults/);
  assert.equal((await rows('setu_hubs')).length,0);assert.equal((await rows('setu_spots')).length,0);assert.equal((await rows('setu_research_identities')).length,0);
  assert.equal((await rows('setu_research_workspaces'))[0].rev,1);assert.equal((await rows('setu_research_requests')).length,1);
});
test('repeated publishing reuses identities and does not reset a personally accepted, visited or pinned place',async()=>{
  const data=await workspace();await commit(data);
  await db.exec("update public.setu_spots set rev=rev+1,accepted=true,status='done',review='Keep my review',rating=5,lat=35,lng=139,seating_checks='{\"wifi\":\"2026-11-21\"}'");
  const before=(await rows('setu_spots'))[0],result=await commit(data,{expected:1,checks:await checks()});
  assert.equal(result.created,0);assert.equal(result.evidence_added,0);assert.deepEqual((await rows('setu_spots'))[0],before);
});
test('global import duplicates across destinations are rejected without partial hubs or workspaces',async()=>{
  const first=await workspace();await commit(first);
  const another=research();another.destination.name_ja='Another destination';another.hubs[0].name_ja='Other hub';const second=await workspace(another);
  await assert.rejects(commit(second),/RESEARCH_DUPLICATE/);
  assert.equal((await rows('setu_hubs')).length,1);assert.equal((await rows('setu_research_workspaces')).length,1);
});
test('selected merges attach evidence, increment revisions and preserve all personal columns; stale targets fail',async()=>{
  const data=await workspace(research(),'food');await commit(data);const row=(await rows('setu_food_notes'))[0];
  await db.query("update public.setu_food_notes set rev=rev+1,review='Personal',rating=4,status='done',accepted=true where id=$1",[row.id]);
  const before=(await rows('setu_food_notes'))[0],newData=research();newData.places[0].research_id='M1';newData.places[0].research_fields.cost.raw_text='Unknown; indoor exhibition separate';
  const input=await local.inspectInput(JSON.stringify(newData));let review=model.preview(newData,snapshot({setu_food_notes:[before]}));
  review=model.setDecision(review,'M1','merge_selected',{target:{table:'setu_food_notes',id:row.id},fields:['cost'],same_place_acknowledged:true}).value;
  const payload={id:input.scope,active:input.report,reviews:{[input.report]:review},catalog:local.emptyCatalog()};
  const stale=[{table:'setu_food_notes',id:row.id,rev:row.rev}];await assert.rejects(commit(payload,{expected:1,checks:stale}),/saved place changed/);
  await commit(payload,{expected:1,checks:[{...stale[0],rev:before.rev}]});
  const after=(await rows('setu_food_notes'))[0];assert.deepEqual({...after,rev:before.rev},before);assert.equal(after.rev,before.rev+1);
  assert.deepEqual((await rows('setu_research_evidence')).at(-1).selected_fields,['cost']);
});
test('competing cloud saves have one revision winner and retain the prior checkpoint',async()=>{
  const data=await workspace();await commit(data,{publish:false});
  const outcomes=await Promise.allSettled([commit(data,{expected:1,publish:false}),commit(data,{expected:1,publish:false})]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal(outcomes.find(result=>result.status==='rejected').reason.code,'40001');
  const row=(await rows('setu_research_workspaces'))[0];assert.equal(row.rev,2);assert.deepEqual(row.previous_payload,data);
});
test('anonymous sign-ins and protected fact selections cannot use the mutator',async()=>{
  const data=await workspace();await db.exec("select set_config('request.jwt.claims','{\"is_anonymous\":true}',false)");
  await assert.rejects(commit(data),/not signed in/);await db.exec("select set_config('request.jwt.claims','{}',false)");
  await commit(data);const row=(await rows('setu_spots'))[0];
  await assert.rejects(db.query("select public.setu_research_attach($1,'setu_spots',$2,$3,$4,'[\"review\"]')",[data.id,row.id,JSON.stringify(data.catalog.places[0].source),JSON.stringify(data.catalog.places[0].evidence)]),/Invalid research fact/);
  const funcs=await db.query("select proname from pg_proc where proname like 'setu_research_%' and prosecdef");assert.equal(funcs.rows.length,0);
});
test('another owner can import their own copy but cannot attach evidence to the first owner’s target',async()=>{
  const data=await workspace();await commit(data);const id=(await rows('setu_spots'))[0].id;
  await as(B);await commit(data,{owner:B});assert.equal((await rows('setu_spots')).length,1);
  await assert.rejects(db.query("select public.setu_research_attach($1,'setu_spots',$2,$3,$4,'[\"cost\"]')",[data.id,id,JSON.stringify(data.catalog.places[0].source),JSON.stringify(data.catalog.places[0].evidence)]),/target unavailable/);
});
test('the server refuses unsupported research versions and unsafe source URLs atomically',async()=>{
  const data=await workspace(),version=copy(data);version.reviews[version.active].research.schema_version='99';
  await assert.rejects(commit(version,{publish:false}),/Unsupported or invalid/);
  const bad=copy(data);bad.catalog.places[0].source.source_links[0].url='javascript:alert(1)';
  await assert.rejects(commit(bad),/Invalid research source/);
  assert.equal((await rows('setu_spots')).length,0);assert.equal((await rows('setu_research_workspaces')).length,0);
});
