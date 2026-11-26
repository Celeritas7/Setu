import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {draftCases} from './helpers/trip-draft-validation-cases.mjs';

const {validateDraft,outcomes}=createRequire(import.meta.url)('../js/trip-draft-validation.js');

test('the trip observation form uses the version 1 outcome choices',async()=>{
  const html=await readFile(new URL('../trip-session.html',import.meta.url),'utf8');
  const options=html.match(/<select id="outcome"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...options.matchAll(/<option>([^<]+)<\/option>/g)].map(match=>match[1]),outcomes);
});

test('version 1 draft preview validator follows the shared database cases',async t=>{
  for (const item of draftCases()) await t.test(item.name,()=>{
    const original=JSON.stringify(item.data), data=JSON.parse(original);
    if (item.valid) {
      const rows=validateDraft(data);
      assert.equal(rows.size,item.distinct);
      assert.equal([...rows.values()].reduce((n,row)=>n+row.copies,0),data.proposals.length);
      for (const row of rows.values()) assert.ok(data.proposals.includes(row.proposal),'preview retains original proposal');
    } else assert.throws(()=>validateDraft(data),/Choose a version 1|Invalid observation|Invalid comfort|Conflicting proposals/);
    assert.equal(JSON.stringify(data),original,'validation does not rewrite submitted evidence');
  });
});
