import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {submitTripDraft} from './helpers/submit-trip-draft.mjs';
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
  const submit=(...args)=>submitTripDraft(db,trip,...args);
  await signIn(ownerA);
  await t.test('storage validates each source observation before accepting it',async ()=>{
    const personal={...observation,outcome:'Personally reviewed',note:'The seat felt uncomfortable.'};
    const invalid=[
      {...observation,space:'  '}, {...observation,date:'2026-02-29'}, {...observation,date:'11/26/2026'},
      {...observation,outcome:'Confirmed'}, {...observation,spend_yen:'0'}, {...observation,spend_yen:-1},
      {...observation,spend_yen:0.5}, {...observation,spend_yen:9007199254740992},
      {...observation,note:undefined}, {...observation,accepted:true},
      {...personal,note:null}, {...personal,note:'  '},
      {...observation,comfort_answers:{noise:'Quiet'}}, {...personal,comfort_answers:[]},
      {...personal,comfort_answers:{wifi:'Verified'}}, {...personal,comfort_answers:{unexpected:null}}
    ];
    for (const details of invalid) await assert.rejects(submit(details),{code:'23514'});
    for (const ref of [{type:'spot'}, {type:'',id:'a'}, {type:'spot',id:-1}, {type:'spot',id:{}},
      {type:'spot',id:'a',accepted:true}]) {
      await assert.rejects(submit(observation,'Library',ref),{code:'23514'});
    }
    assert.deepEqual((await db.query(`select * from ${table}`)).rows,[]);
    await db.exec('begin');
    try {
      const valid={...personal,date:'2024-02-29',spend_yen:0,comfort_answers:{comfort:'Uncomfortable',wifi:null}};
      assert.equal(await submit(valid,'Library',{type:'spot',id:0}),'inserted');
      assert.deepEqual((await db.query(`select observation from ${table}`)).rows,[{observation:valid}]);
    } finally { await db.exec('rollback'); }
  });
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
