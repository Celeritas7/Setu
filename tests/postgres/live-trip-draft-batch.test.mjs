import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {freshPostgres} from '../helpers/research-native-postgres.mjs';

test('atomic place update draft envelope rehearsal',async t=>{
  const cluster=await freshPostgres();
  t.after(()=>cluster.close());
  for (const file of ['live-trip-draft-schema.sql','live-trip-draft-batch.sql']) {
    await cluster.admin.query(await readFile(new URL('../fixtures/'+file,import.meta.url),'utf8'));
  }
  const owner=randomUUID(),other=randomUUID(),trip=randomUUID();
  await cluster.admin.query('insert into auth.users values ($1),($2)',[owner,other]);
  const actor=await cluster.actor(owner);
  const envelope=proposals=>({format:'setu_place_update_draft',version:1,status:'draft',proposals});
  const entry=index=>({source:{trip_id:trip,stop_index:2,observation_index:index},stop_name:'Library',
    place_ref:null,observation:{space:'Lobby',date:'2026-11-26',outcome:'Visited',note:null,spend_yen:0}});
  async function submit(batch,client=actor) {
    const {rows}=await client.query('select * from public.setu_rehearse_trip_draft($1::jsonb)',[JSON.stringify(batch)]);
    return rows[0];
  }
  const before=entry(2);
  assert.deepEqual(await submit(envelope([before,before])),{inserted:1,identical:1});
  assert.deepEqual(await submit(envelope([before])),{inserted:0,identical:1});
  const batch=envelope([entry(0),before]);
  await assert.rejects(submit({...batch,owner_id:other}),{code:'22023'});
  await assert.rejects(submit({...batch,version:'1'}),{code:'22023'});
  await assert.rejects(submit(envelope([])),{code:'22023'});
  const changed={...before,observation:{...before.observation,spend_yen:null}};
  await assert.rejects(submit(envelope([entry(0),changed])),{code:'P0001'});
  await assert.rejects(submit(envelope([entry(0),{...entry(1),observation:{}}])),{code:'23514'});
  await assert.rejects(submit(envelope([entry(0),{...entry(1),source:{...entry(1).source,owner_id:other}}])),{code:'22023'});
  assert.deepEqual((await actor.query('select observation_index,observation from public.setu_place_update_drafts')).rows,
    [{observation_index:2,observation:before.observation}]);
  const otherActor=await cluster.actor(other);
  assert.deepEqual(await submit(envelope([changed]),otherActor),{inserted:1,identical:0});
  for (const client of [await cluster.actor(other,true),await cluster.actor(null,false,'anon')]) {
    await assert.rejects(submit(batch,client),{code:'42501'});
  }
  assert.deepEqual(await submit(batch),{inserted:1,identical:1});
});
