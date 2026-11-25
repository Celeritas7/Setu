import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {freshPostgres} from '../helpers/research-native-postgres.mjs';
import {A,B,workspace} from '../helpers/research-cloud-fixture.mjs';

test('release catalog is read-only, inventories an exact install, exposes privilege/RLS/object drift and preserves personal data',async()=>{
  const db=await freshPostgres();
  const sql=await readFile(new URL('../../supabase/checks/research_import_catalog.sql',import.meta.url),'utf8');
  const migration=await readFile(new URL('../../supabase/migrations/20261122065058_research_import_cloud.sql',import.meta.url),'utf8');
  const inspect=async()=>{
    await db.admin.query('begin read only');
    try{return (await db.admin.query(sql)).rows[0].research_catalog;}
    finally{await db.admin.query('rollback');}
  };
  const drift=async(change,check,restore)=>{
    await db.admin.query(change);
    try{await check(await inspect());}finally{await db.admin.query(restore);}
  };
  try {
    assert.equal(createHash('sha256').update(migration).digest('hex'),'a72ab87055330d4c09eabb0a4bef4f0c212fdd864a8d6da6dae2d2e6d1683790');
    await db.admin.query('insert into auth.users values($1)',[A]);
    const actor=await db.actor(A);
    await actor.query("insert into public.setu_food_notes(name,review,rating,status,accepted) values('Fictional place','Retain my review',5,'done',true)");
    const personal=(await actor.query('select * from public.setu_food_notes')).rows;
    const before=await inspect();
    assert.equal(before.probe_version,'r4-catalog-1');assert.equal(before.metadata_only,true);
    assert.ok(Object.values(before.prerequisites).every(x=>x===true));
    assert.ok(before.core_tables.every(t=>t.present&&t.rls&&t.shape_sha256.length===64));
    assert.equal(before.core_tables.reduce((n,t)=>n+t.columns,0),109);
    assert.ok(before.research_tables.every(t=>!t.present));
    assert.deepEqual(before.research_functions,[]);assert.deepEqual(before.research_relations,[]);
    for(const flag of ['migration_history_checked','gateway_verified','recovery_verified','activation_authorized'])assert.equal(before[flag],false);

    await db.admin.query(migration);
    const installed=await inspect();
    assert.equal(installed.research_tables.filter(t=>t.present&&t.rls).length,4);
    assert.equal(installed.research_tables.reduce((n,t)=>n+t.policies,0),7);
    const ownerKeys=installed.research_tables.flatMap(t=>t.foreign_keys);
    assert.equal(ownerKeys.length,4);assert.ok(ownerKeys.every(k=>k.validated&&k.references==='auth.users'&&k.delete_action==='c'));
    assert.equal(installed.research_functions.length,7);assert.equal(installed.research_indexes.length,12);
    assert.equal(installed.research_indexes.filter(i=>!i.unique).length,7);
    assert.ok(installed.research_indexes.every(i=>i.valid&&i.ready));
    for(const f of installed.research_functions){
      assert.equal(f.security_definer,false);assert.equal(f.anon_execute,false);assert.equal(f.public_execute,false);
      assert.equal(f.authenticated_execute,true);assert.ok(f.settings.some(x=>['search_path=""','search_path='].includes(x)));
    }
    for(const t of installed.research_tables){
      assert.ok(Object.values(t.effective_grants.anon).every(x=>x===false));
      assert.equal(t.effective_grants.authenticated.truncate,false);
      if(t.name!=='setu_research_workspaces')assert.equal(t.effective_grants.authenticated.update,false);
    }
    assert.deepEqual(installed.core_tables.map(t=>t.shape_sha256),before.core_tables.map(t=>t.shape_sha256));
    assert.equal(installed.core_revision_function_sha256,before.core_revision_function_sha256);
    assert.deepEqual((await actor.query('select * from public.setu_food_notes')).rows,personal);

    await drift('alter table public.setu_research_evidence disable row level security',
      report=>assert.equal(report.research_tables.find(t=>t.name==='setu_research_evidence').rls,false),
      'alter table public.setu_research_evidence enable row level security');
    await drift('alter policy research_evidence_read on public.setu_research_evidence using(true)',
      report=>assert.equal(report.research_tables.find(t=>t.name==='setu_research_evidence').policy_rules.some(p=>p.using==='true'),true),
      'alter policy research_evidence_read on public.setu_research_evidence using((select auth.uid())=user_id)');
    await drift('grant execute on function public.setu_research_capabilities() to public',
      report=>assert.equal(report.research_functions.find(f=>f.name==='setu_research_capabilities').anon_execute,true),
      'revoke execute on function public.setu_research_capabilities() from public');
    await db.admin.query('create role setu_release_extra nologin; grant setu_release_extra to authenticated');
    await drift('grant truncate on public.setu_research_requests to setu_release_extra',
      report=>assert.equal(report.research_tables.find(t=>t.name==='setu_research_requests').effective_grants.authenticated.truncate,true),
      'revoke truncate on public.setu_research_requests from setu_release_extra');
    await db.admin.query('revoke setu_release_extra from authenticated; drop role setu_release_extra');
    await drift('create function public.setu_research_unexpected() returns integer language sql as $$ select 1 $$',
      report=>assert.equal(report.research_functions.some(f=>f.name==='setu_research_unexpected'),true),
      'drop function public.setu_research_unexpected()');
    const index=installed.research_indexes.find(i=>i.name==='setu_research_food_external');
    await drift('drop index public.setu_research_food_external',
      report=>assert.equal(report.research_indexes.length,11),index.definition);
    assert.deepEqual((await actor.query('select * from public.setu_food_notes')).rows,personal);
  }finally{await db.close();}
},{timeout:60000});

test('the separate core TRUNCATE proposal preserves owner CRUD and reviews, allows R4 publication and exposes inherited residual access',async()=>{
  const db=await freshPostgres();
  const repair=await readFile(new URL('../../supabase/operations/research_core_revoke_truncate.sql',import.meta.url),'utf8');
  const probe=await readFile(new URL('../../supabase/checks/research_import_catalog.sql',import.meta.url),'utf8');
  const inspect=async()=>(await db.admin.query(probe)).rows[0].research_catalog;
  try {
    await db.admin.query('insert into auth.users values($1),($2)',[A,B]);
    const a=await db.actor(A),b=await db.actor(B),guest=await db.actor(null,false,'anon');
    const {rows:[food]}=await a.query("insert into public.setu_food_notes(name,review,rating,status,accepted) values('Retained fictional cafe','Keep this review',5,'done',true) returning *");
    const before=await inspect();
    for(const t of before.core_tables)for(const role of ['anon','authenticated'])assert.equal(t.effective_grants[role].truncate,true);
    await db.admin.query(repair);await db.admin.query(repair);
    const after=await inspect();
    for(const t of after.core_tables){
      const old=before.core_tables.find(x=>x.name===t.name);assert.equal(t.rls,old.rls);
      assert.equal(t.policies,old.policies);assert.equal(t.triggers,old.triggers);
      for(const role of ['anon','authenticated']){
        assert.equal(t.effective_grants[role].truncate,false);
        assert.deepEqual({...t.effective_grants[role],truncate:true},old.effective_grants[role]);
      }
    }
    assert.equal(after.core_revision_function_sha256,before.core_revision_function_sha256);
    assert.deepEqual((await a.query('select * from public.setu_food_notes')).rows,[food]);
    for(const client of [a,guest])await assert.rejects(client.query('truncate public.setu_hubs,public.setu_food_notes,public.setu_spots'),e=>e.code==='42501');
    assert.deepEqual((await b.query('select * from public.setu_food_notes')).rows,[]);
    assert.deepEqual((await guest.query('select * from public.setu_food_notes')).rows,[]);
    await a.query('update public.setu_food_notes set review=$1,rev=rev+1 where id=$2',['My later personal edit',food.id]);
    const {rows:[spot]}=await a.query("insert into public.setu_spots(name) values('Disposable owner spot') returning id");
    await a.query('delete from public.setu_spots where id=$1',[spot.id]);

    await db.admin.query(await readFile(new URL('../../supabase/migrations/20261122065058_research_import_cloud.sql',import.meta.url),'utf8'));
    const payload=await workspace();
    const {rows:[{receipt}]}=await a.query('select public.setu_research_commit($1,$2,0,$3,$4,true,$5) as receipt',[
      A,payload.id,randomUUID(),JSON.stringify(payload),'[]',
    ]);
    assert.equal(receipt.created,1);
    assert.equal((await a.query('select review from public.setu_food_notes where id=$1',[food.id])).rows[0].review,'My later personal edit');

    // A direct REVOKE must not be reported as effective denial after role drift.
    await db.admin.query('create role setu_prior_writer nologin; grant truncate on public.setu_spots to setu_prior_writer; grant setu_prior_writer to authenticated');
    await db.admin.query(repair);
    assert.equal((await inspect()).core_tables.find(x=>x.name==='setu_spots').effective_grants.authenticated.truncate,true);
  }finally{await db.close();}
},{timeout:60000});
