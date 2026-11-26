import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import {freshPostgres} from '../helpers/research-native-postgres.mjs';
import {submitTripDraft} from '../helpers/submit-trip-draft.mjs';

test('concurrent immutable trip draft saves',async t=>{
  const cluster=await freshPostgres();
  t.after(()=>cluster.close());
  await cluster.admin.query(await readFile(new URL('../fixtures/live-trip-draft-schema.sql',import.meta.url),'utf8'));
  const owner=randomUUID(), other=randomUUID();
  await cluster.admin.query('insert into auth.users(id) values ($1),($2)',[owner,other]);
  const first=await cluster.actor(owner), second=await cluster.actor(owner), otherAccount=await cluster.actor(other);
  const original={space:'Library',date:'2026-11-26',outcome:'Visited',spend_yen:null,note:null};
  const changed={...original,spend_yen:0};
  const read='select observation from public.setu_place_update_drafts where trip_id=$1';

  for (const [name,release,retry,expected] of [
    ['identical after commit','commit',original,'identical'],
    ['changed after commit','commit',changed,'conflict'],
    ['changed after rollback','rollback',changed,'inserted']
  ]) await t.test(name,async ()=>{
    const trip=randomUUID();
    await first.query('begin');
    let pending;
    try {
      assert.equal(await submitTripDraft(first,trip,original),'inserted');
      pending=submitTripDraft(second,trip,retry);
      pending.catch(()=>{}); // Observe early errors while checking the server's lock graph.
      const deadline=Date.now()+4500;
      while (true) {
        const {rows}=await cluster.admin.query('select $1::int = any(pg_blocking_pids($2)) as blocked',
          [first.rehearsalPid,second.rehearsalPid]);
        if (rows[0].blocked) break;
        assert.ok(Date.now()<deadline,'second session never waited for the first transaction');
        await delay(15);
      }
      await first.query(release);
      assert.equal(await pending,expected);
      assert.deepEqual((await second.query(read,[trip])).rows,[{observation:release==='commit'?original:retry}]);
    } finally {
      await first.query('rollback');
      if (pending) await pending.catch(()=>{});
    }
  });

  await t.test('another owner can save the same source while the first transaction is open',async ()=>{
    const trip=randomUUID();
    await first.query('begin');
    try {
      await submitTripDraft(first,trip,original);
      assert.equal(await submitTripDraft(otherAccount,trip,changed),'inserted');
      await first.query('commit');
      assert.deepEqual((await first.query(read,[trip])).rows,[{observation:original}]);
      assert.deepEqual((await otherAccount.query(read,[trip])).rows,[{observation:changed}]);
    } finally {await first.query('rollback');}
  });
});
