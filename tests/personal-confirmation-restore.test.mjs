import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const local=createRequire(import.meta.url)('../js/research-local.js');

const now=new Date('2026-11-27T15:05:00Z'); // 00:05 on Nov 28 in Japan
const row={id:'abcdef12-3456-4789-8abc-def012345678',destination:'fictional-area',place_id:'p1',
  place_name:'Library',address:'Example town',source_hash:'a'.repeat(64),
  space:'Reading room',tag:'Cocoon',status:'personally_confirmed',observation:'Quiet desks',
  observed_on:'2024-02-29',recorded_at:'2024-02-28T15:00:00.000Z'};
const envelope=reviews=>({format:'setu_personal_space_reviews',version:1,reviews});
const restore=(reviews,existing=[],clock=now)=>local.personalAdditions(envelope(reviews),row.destination,row.place_id,existing,clock);

test('historical personal reviews preserve original evidence and deduplicate UUID identity',()=>{
  const before=JSON.stringify(row);
  assert.deepEqual(restore([row,row]),[row]);
  assert.deepEqual(restore([row],[row]),[]);
  assert.deepEqual(restore([{...row,id:row.id.toUpperCase()}],[row]),[]);
  assert.deepEqual(restore([{...row,recorded_at:'2024-02-29T00:00:00+09:00'}]),[{...row,recorded_at:'2024-02-29T00:00:00+09:00'}]);
  assert.deepEqual(restore([{...row,recorded_at:'2024-02-29T08:00:00Z'}]),[{...row,recorded_at:'2024-02-29T08:00:00Z'}]);
  assert.equal(JSON.stringify(row),before);
});

test('invalid review IDs never become personal confirmations',()=>{
  for(const id of ['-'.repeat(36),'a'.repeat(36),'abcdef12345647898abcdef012345678',
    'abcdef12-3456-4789-8abc-def01234567z',row.id+'\n',null]) {
    assert.throws(()=>restore([{...row,id}]),/invalid space review/i,String(id));
  }
});

test('visit dates and recording chronology use Japan time at the day boundary',()=>{
  const boundary={...row,observed_on:'2026-11-28',recorded_at:'2026-11-27T15:00:00Z'};
  assert.deepEqual(restore([boundary]),[boundary]);
  assert.throws(()=>restore([boundary],[],new Date('2026-11-27T14:59:59.999Z')),/today in Japan/);
  assert.throws(()=>restore([{...boundary,recorded_at:'2026-11-27T14:59:59.999Z'}]),/after the recording date in Japan/);
  assert.throws(()=>restore([{...boundary,recorded_at:'2026-11-27T15:06:00Z'}]),/recording time is in the future/);
  assert.throws(()=>restore([{...row,observed_on:'2099-12-31',recorded_at:'2026-11-25T08:00:00Z'}]),/today in Japan/);
  assert.throws(()=>restore([{...row,observed_on:'2024-03-01'}]),/after the recording date/);
});

test('invalid calendar dates and ambiguous or impossible recording timestamps are rejected',()=>{
  for(const observed_on of ['2026-02-29','2024-02-30','2024-2-29','0000-01-01',null])
    assert.throws(()=>restore([{...row,observed_on}]),/real date/);
  for(const recorded_at of ['2024-02-30T12:00:00Z','2024-02-29T24:00:00Z','2024-02-29T12:00:60Z',
    '2024-02-29T12:00:00','2024-02-29','February 29, 2024','2024-02-29T12:00:00+24:00',
    '2024-02-29T12:00:00Z\n',null])
    assert.throws(()=>restore([{...row,recorded_at}]),/valid ISO timestamp/,String(recorded_at));
});

test('invalid batches and conflicting IDs cannot mutate existing records or silently replace evidence',()=>{
  const existing=[{...row}],before=JSON.stringify(existing);
  const older={...row,id:'11223344-5566-4789-8abc-def012345678',observed_on:'2020-01-01',recorded_at:'2020-01-01T03:00:00Z'};
  assert.throws(()=>restore([older,{...row,id:'-'.repeat(36)}],existing),/invalid space review/i);
  assert.throws(()=>restore([older,{...row,id:row.id.toUpperCase(),tag:'Hideout'}],existing),/conflicting observations/);
  assert.throws(()=>restore([{...older,place_id:'p2'}],existing),/another place/);
  assert.throws(()=>restore([{...older,status:'potential'}],existing),/invalid space review/i);
  assert.equal(JSON.stringify(existing),before);
  assert.deepEqual(restore([older],existing),[older]);
});
