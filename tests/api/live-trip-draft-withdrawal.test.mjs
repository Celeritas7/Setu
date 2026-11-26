import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {freshResearchApi} from '../helpers/research-http-gateway.mjs';
import {A,B} from '../helpers/research-cloud-fixture.mjs';

test('only the reviewed owner and revision can withdraw a draft occurrence',async t=>{
  const api=await freshResearchApi({async prepareDatabase(admin){
    for (const name of ['schema','batch','correction','withdrawal']) {
      await admin.query(await readFile(new URL('../fixtures/live-trip-draft-'+name+'.sql',import.meta.url),'utf8'));
    }
  }});
  t.after(()=>api.close());
  const {sb:a}=await api.sdk(A),{sb:b}=await api.sdk(B),{sb:anon}=await api.sdk(A,{is_anonymous:true});
  const trip=randomUUID(),key={expected_owner:A,trip,stop:1,occurrence:0};
  const observation={space:'Lobby',outcome:'Visited',date:'2026-11-26',spend_yen:null,note:null};
  const proposals=[0,1].map(index=>({source:{trip_id:trip,stop_index:1,observation_index:index},
    stop_name:'Library',place_ref:null,observation}));
  const batch={format:'setu_place_update_draft',version:1,status:'draft',proposals};
  const submit=(client,owner)=>client.rpc('setu_rehearse_trip_draft',{expected_owner:owner,batch});
  const read=(client,args)=>client.rpc('setu_rehearse_review_observation',args);
  const withdraw=(client,rev)=>client.rpc('setu_rehearse_withdraw_observation',{...key,reviewed_revision:rev});
  assert.equal((await submit(a,A)).error,null);
  assert.equal((await submit(b,B)).error,null);
  const [{revision}]=(await read(a,key)).data;
  const correct=(rev,note)=>a.rpc('setu_rehearse_correct_observation',
    {...key,reviewed_revision:rev,replacement:{...observation,note}});
  assert.equal((await correct(revision,'Updated')).data,2);
  assert.equal((await withdraw(a,revision)).status,409);
  assert.equal((await withdraw(b,2)).status,403);
  assert.equal((await withdraw(anon,2)).status,403);
  const [current]=(await read(a,key)).data;
  assert.equal(current.observation.note,'Updated');
  assert.equal((await withdraw(a,current.revision)).error,null);
  assert.deepEqual((await read(a,key)).data,[]);
  assert.equal((await withdraw(a,current.revision)).status,404);
  assert.equal((await correct(current.revision,'Retry')).status,404);
  assert.equal((await submit(a,A)).error.code,'P0001');
  assert.deepEqual((await read(a,key)).data,[]);
  for (const [client,params] of [[a,{...key,occurrence:1}],[b,{...key,expected_owner:B}]]) {
    assert.deepEqual((await read(client,params)).data,[{stop_name:'Library',place_ref:null,observation,revision:1}]);
  }
});
