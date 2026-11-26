import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {freshResearchApi} from '../helpers/research-http-gateway.mjs';
import {A,B} from '../helpers/research-cloud-fixture.mjs';

test('HTTP draft submission binds the reviewed account to the request identity',async t=>{
  const api=await freshResearchApi({async prepareDatabase(admin){
    for (const file of ['live-trip-draft-schema.sql','live-trip-draft-batch.sql']) {
      await admin.query(await readFile(new URL('../fixtures/'+file,import.meta.url),'utf8'));
    }
  }});
  t.after(()=>api.close());
  const {sb}=await api.sdk(A);
  const account=(await sb.auth.getUser()).data.user.id;
  assert.equal(account,A);
  const source={trip_id:randomUUID(),stop_index:1,observation_index:0};
  const observation={space:'Reading room',outcome:'Did not enter',date:'2026-11-26',spend_yen:null,note:null};
  const batch={format:'setu_place_update_draft',version:1,status:'draft',
    proposals:[{source,stop_name:'Library',place_ref:null,observation}]};
  const request={expected_owner:account,batch};
  const submit=()=>sb.rpc('setu_rehearse_trip_draft',request);
  const rows=async()=> (await api.db.admin.query('select owner_id,observation from public.setu_place_update_drafts')).rows;
  async function switchTo(owner,claims={}) {
    const {error}=await sb.auth.setSession({access_token:await api.token(owner,claims),refresh_token:'synthetic-unused'});
    assert.equal(error,null);
  }
  await switchTo(B);
  const switched=await submit();
  assert.equal(switched.status,403);assert.equal(switched.error.code,'42501');
  assert.deepEqual(await rows(),[]);
  await switchTo(A,{is_anonymous:true});
  const anonymous=await submit();
  assert.equal(anonymous.status,403);assert.deepEqual(await rows(),[]);
  await switchTo(A);
  const saved=await submit();
  assert.equal(saved.error,null);assert.deepEqual(saved.data,[{inserted:1,identical:0}]);
  assert.deepEqual((await submit()).data,[{inserted:0,identical:1}]);
  assert.deepEqual(await rows(),[{owner_id:A,observation}]);
});
