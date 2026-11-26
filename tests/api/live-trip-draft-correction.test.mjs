import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {freshResearchApi} from '../helpers/research-http-gateway.mjs';
import {A,B} from '../helpers/research-cloud-fixture.mjs';

test('review and correct only the current owner’s draft observation by revision',async t=>{
  const api=await freshResearchApi({async prepareDatabase(admin){
    for (const name of ['schema','batch','correction']) {
      await admin.query(await readFile(new URL('../fixtures/live-trip-draft-'+name+'.sql',import.meta.url),'utf8'));
    }
  }});
  t.after(()=>api.close());
  const {sb:first}=await api.sdk(A), {sb:second}=await api.sdk(A), {sb:other}=await api.sdk(B);
  const trip=randomUUID(), key={expected_owner:A,trip,stop:2,occurrence:3};
  const observation={space:'Lobby',outcome:'Visited',date:'2026-11-26',note:null,spend_yen:null};
  const place_ref={type:'spot',id:'library'};
  const proposal={source:{trip_id:trip,stop_index:2,observation_index:3},stop_name:'Library',place_ref,observation};
  const batch={format:'setu_place_update_draft',version:1,status:'draft',proposals:[proposal]};
  const review=(client,params=key)=>client.rpc('setu_rehearse_review_observation',params);
  const correct=(client,reviewed_revision,replacement,params=key)=>client.rpc('setu_rehearse_correct_observation',
    {...params,reviewed_revision,replacement});
  assert.equal((await first.rpc('setu_rehearse_trip_draft',{expected_owner:A,batch})).error,null);
  const original={stop_name:'Library',place_ref,observation,revision:1};
  assert.deepEqual((await review(first)).data,[original]);
  assert.deepEqual((await review(second)).data,[original]);
  assert.deepEqual((await review(other)).data,[]);
  assert.equal((await correct(other,1,observation)).status,403);
  assert.equal((await correct(other,1,observation,{...key,expected_owner:B})).status,404);
  const otherKey={...key,expected_owner:B};
  assert.equal((await other.rpc('setu_rehearse_trip_draft',{expected_owner:B,batch})).error,null);
  const {sb:anonymous}=await api.sdk(A,{is_anonymous:true});
  assert.deepEqual((await review(anonymous)).data,[]);
  assert.equal((await correct(anonymous,1,observation)).status,403);
  assert.equal((await correct(first,1,{...observation,spend_yen:-1})).error.code,'22023');
  const choices=[{...observation,spend_yen:0},{...observation,note:'Outdoor bench.'}];
  const results=await Promise.all([correct(first,1,choices[0]),correct(second,1,choices[1])]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winner=choices[results.findIndex(r=>r.status===200)];
  assert.equal((await correct(first,1,winner)).data,2);
  assert.equal((await correct(first,2,winner)).data,2);
  assert.deepEqual((await review(first)).data,[{...original,observation:winner,revision:2}]);
  assert.equal((await first.from('setu_place_update_drafts').update({observation}).eq('trip_id',trip)).status,403);
  assert.equal((await first.rpc('setu_rehearse_trip_draft',{expected_owner:A,batch})).error.code,'P0001');
  const [latest]=(await review(second)).data;
  assert.deepEqual(latest,{...original,observation:winner,revision:2});
  const revised={...winner,note:'Checked again at the lobby.'};
  assert.equal((await correct(second,latest.revision,revised)).data,3);
  assert.equal((await correct(first,1,winner)).status,409);
  assert.deepEqual((await review(other,otherKey)).data,[original]);
});
