import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {freshPostgres} from '../helpers/research-native-postgres.mjs';
import {draftCases} from '../helpers/trip-draft-validation-cases.mjs';

const {validateDraft}=createRequire(import.meta.url)('../../js/trip-draft-validation.js');

test('version 1 local validation and disposable PostgreSQL submission agree on shared files',async t=>{
  const cluster=await freshPostgres();
  t.after(()=>cluster.close());
  for (const file of ['live-trip-draft-schema.sql','live-trip-draft-batch.sql']) {
    await cluster.admin.query(await readFile(new URL('../fixtures/'+file,import.meta.url),'utf8'));
  }
  const owner=randomUUID();
  await cluster.admin.query('insert into auth.users values ($1)',[owner]);
  const actor=await cluster.actor(owner);
  const table='public.setu_place_update_drafts';
  const readRows=async()=>(await cluster.admin.query(`select trip_id::text,stop_index,observation_index,stop_name,place_ref,observation
    from ${table} order by trip_id,stop_index,observation_index`)).rows;
  const submit=async data=>(await actor.query('select * from public.setu_rehearse_trip_draft($1::uuid,$2::jsonb)',[owner,JSON.stringify(data)])).rows[0];
  // Restrict cleanup to the table in the fresh, owned loopback test cluster.
  for (const item of draftCases()) await t.test(item.name,async()=>{
    assert.deepEqual(await readRows(),[]);
    const data=JSON.parse(JSON.stringify(item.data));
    try {
      if (item.valid) {
        const preview=validateDraft(data);
        assert.equal(preview.size,item.distinct);
        assert.deepEqual(await submit(data),{inserted:item.distinct,identical:item.identical});
        const expected=new Map();
        for (const p of data.proposals) {
          const src={...p.source,trip_id:p.source.trip_id.toLowerCase()};
          const key=JSON.stringify([src.trip_id,src.stop_index,src.observation_index]);
          if (!expected.has(key)) expected.set(key,{...src,stop_name:p.stop_name,place_ref:p.place_ref,observation:p.observation});
        }
        const compare=(a,b)=>a.trip_id.localeCompare(b.trip_id)||a.stop_index-b.stop_index||a.observation_index-b.observation_index;
        assert.deepEqual(await readRows(),[...expected.values()].sort(compare),'stored values preserve null, zero and original evidence');
      } else {
        assert.throws(()=>validateDraft(data),/Choose a version 1|Invalid observation|Invalid comfort|Conflicting proposals/);
        await assert.rejects(submit(data),error=>{
          assert.ok(['22023','22003','23514','22P02','22P05','P0001'].includes(error.code),`unexpected SQL error ${error.code}: ${error.message}`);
          return true;
        });
        assert.deepEqual(await readRows(),[],'invalid batch cannot leave partial rows');
      }
    } finally {await cluster.admin.query(`truncate ${table}`);}
  });
});
