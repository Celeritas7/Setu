import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const ownerA='11111111-1111-4111-8111-111111111111';
const ownerB='22222222-2222-4222-8222-222222222222';
const trip='33333333-3333-4333-8333-333333333333';
const table='public.setu_place_update_drafts';

test('private place update drafts in disposable PostgreSQL', async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    insert into auth.users values ('${ownerA}'), ('${ownerB}');
    alter default privileges in schema public grant all on tables to anon,authenticated;
  `);
  await db.exec(await readFile(new URL('./fixtures/live-trip-draft-schema.sql',import.meta.url),'utf8'));
  async function signIn(id) {
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  }
  const observation={space:'Reading room',outcome:'Did not enter',date:'2026-11-26',spend_yen:null,note:null};
  async function submit(details,stopName='Library',placeRef=null) {
    const values=[trip,JSON.stringify(details),stopName,placeRef===null?null:JSON.stringify(placeRef)];
    const result=await db.query(`insert into ${table}
      (trip_id,stop_index,observation_index,stop_name,observation,place_ref) values ($1,0,0,$3,$2::jsonb,$4::jsonb)
      on conflict (owner_id,trip_id,stop_index,observation_index) do nothing returning trip_id`,
      values);
    if (result.rows.length) return 'inserted';
    const {rows}=await db.query(`select observation=$2::jsonb and stop_name=$3 and (place_ref is not distinct from $4::jsonb) as same
      from ${table} where trip_id=$1 and stop_index=0 and observation_index=0`,values);
    return rows[0].same?'identical':'conflict';
  }
  await signIn(ownerA);
  assert.equal(await submit(observation),'inserted');
  assert.equal(await submit(observation),'identical');
  assert.equal(await submit({...observation,spend_yen:0}),'conflict');
  assert.equal(await submit(observation,'Other library'),'conflict');
  assert.equal(await submit(observation,'Library',{type:'spot',id:'second'}),'conflict');
  await signIn(ownerB);
  assert.deepEqual((await db.query(`select * from ${table}`)).rows,[]);
  await assert.rejects(db.query(`insert into ${table}
    (owner_id,trip_id,stop_index,observation_index,stop_name,observation)
    values ($1,$2,1,0,'Other room','{}')`,[ownerA,trip]),{code:'42501'});
  assert.equal(await submit({...observation,note:'B only'}),'inserted');
  await signIn(ownerA);
  const rows=(await db.query(`select owner_id,observation from ${table}`)).rows;
  assert.deepEqual(rows,[{owner_id:ownerA,observation}]);
  for (const command of [`update ${table} set stop_name='Changed'`,`delete from ${table}`,`truncate ${table}`]) {
    await assert.rejects(db.exec(command),{code:'42501'});
  }
  await db.exec('reset role; set role anon');
  await assert.rejects(db.exec(`select * from ${table}`),{code:'42501'});
  await assert.rejects(db.exec(`insert into ${table} default values`),{code:'42501'});
});
