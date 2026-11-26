import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), local=require('../js/research-local.js'), model=require('../js/research-import.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function research() {
  const place={research_id:'P1',name_ja:'Example park',name_en:null,hub_id:'town',place_type:'park',
    location:{address_ja:'Example address 1',coordinates:null,maps_url:'https://example.org/map/1'},
    research_fields:{cost:{raw_text:'Unknown admission',admission_yen:null,admission_evidence:'unknown'},hours:{raw_summary:'Unknown',weekly_intervals:null,date_specific_open:null},access:{}},
    tags:{practical_candidates:[],experiential_candidates:[{tag:'Cocoon',status:'potential'}],personal_confirmed_experiences:[]},
    source_links:[{url:'https://example.org/park',checked_at:'2026-11-20'}],visit_status:'suggested',accepted_into_setu:false,review_status:'not_reviewed',personal_observation:null};
  return {format:'setu_research_handoff',schema_version:'1.0.0',destination:{name_ja:'Example town',origin_station_ja:'Example station',travel_date:null,date_confirmed:false,does_not_eat_beef:true},
    provenance:{checked:'2026-11-20'},import_contract:{no_direct_supabase_writes:true},hubs:[{id:'town',name_ja:'Town centre'}],places:[place]};
}
function decide(outcome) {assert.equal(outcome.ok,true,outcome.error);return outcome.value;}
async function approved(data=research(),catalog=local.emptyCatalog()) {
  const input=await local.inspectInput(JSON.stringify(data));
  let review=local.prepare(data,null,catalog,'2026-11-22',input.scope);
  review=decide(model.resolveHub(review,'town',{kind:'new'},true));
  review=decide(model.setDecision(review,'P1','accept_suggestion',{record_kind:'see',distinct_acknowledged:true}));
  return {...input,review};
}
test('destination identities ignore origin/date and report IDs distinguish changed evidence',async()=>{
  const data=research(), changed=copy(data);changed.destination.origin_station_ja='Other station';changed.destination.travel_date='2026-12-01';
  assert.equal(await local.destinationId(data),await local.destinationId(changed));
  const first=await local.inspectInput(JSON.stringify(data)), next=await local.inspectInput(JSON.stringify(changed));
  assert.notEqual(first.report,next.report);
  changed.destination.name_ja='Other town';assert.notEqual(await local.destinationId(data),await local.destinationId(changed));
});
test('R1 and R2 exports restore by validated replay and ignore forged proposed writes',async()=>{
  const input=await approved(), r2=model.reviewExport(input.review);
  r2.proposed_changes=[{accepted:true,status:'done',review:'Forged',lat:35}];
  const restored=local.restoredReview(r2,local.emptyCatalog(),'2026-11-22',input.scope).review;
  assert.deepEqual(restored.research,input.research);assert.equal(restored.candidates[0].decision,'accept_suggestion');
  assert.equal(model.reviewExport(restored).proposed_changes[0].suggestion_defaults.accepted,false);
  const r1=model.preview(input.research);delete r1.review_version;delete r1.review_targets;
  assert.equal(local.restoredReview(r1,local.emptyCatalog(),'2026-11-22',input.scope).review.candidates[0].decision,'pending');
  r2.candidates[0].decision_details.fields=['review'];r2.candidates[0].decision='merge_selected';
  assert.throws(()=>local.restoredReview(r2,local.emptyCatalog(),'2026-11-22',input.scope));
});
test('approved drafts save idempotently with unknown costs and potential tags preserved',async()=>{
  const input=await approved(), empty=local.emptyCatalog(), original=copy(input.research);
  const first=await local.materialize(input.review,empty,input.scope), again=await local.materialize(input.review,first.catalog,input.scope);
  assert.equal(first.added,1);assert.equal(again.added,0);assert.deepEqual(first.catalog,again.catalog);assert.deepEqual(empty,local.emptyCatalog());
  const draft=first.catalog.places[0];assert.equal(draft.status,'try');assert.equal(draft.accepted,false);assert.equal(draft.source.research_fields.cost.admission_yen,null);
  assert.deepEqual(draft.personal_confirmed_experiences,[]);assert.deepEqual(draft.source,original.places[0]);
  assert.equal(local.restoredReview(model.reviewExport(input.review),first.catalog,'2026-11-22',input.scope).review.candidates[0].decision,'accept_suggestion');
});
test('different research IDs cannot duplicate a saved place or hub',async()=>{
  const input=await approved(), first=await local.materialize(input.review,local.emptyCatalog(),input.scope);
  const changed=copy(input.research);changed.places[0].research_id='OtherID';
  let review=local.prepare(changed,null,first.catalog,'2026-11-22',input.scope);
  review=decide(model.resolveHub(review,'town',{kind:'new'},true));
  review=decide(model.setDecision(review,'OtherID','accept_suggestion',{record_kind:'see',distinct_acknowledged:true}));
  await assert.rejects(local.materialize(review,first.catalog,input.scope),/already represents/);
  assert.equal(first.catalog.places.length,1);
  changed.hubs[0].id='other-hub';changed.places[0].hub_id='other-hub';changed.places[0].name_ja='Distinct place';changed.places[0].location.address_ja='Different address';
  review=local.prepare(changed,null,first.catalog,'2026-11-22',input.scope);
  review=decide(model.resolveHub(review,'other-hub',{kind:'new'},true));
  review=decide(model.setDecision(review,'OtherID','accept_suggestion',{record_kind:'see',distinct_acknowledged:true}));
  await assert.rejects(local.materialize(review,first.catalog,input.scope),/local hub with this name/);
});
test('changed research merges selected local facts without overwriting original evidence',async()=>{
  const input=await approved(), first=await local.materialize(input.review,local.emptyCatalog(),input.scope);
  const changed=copy(input.research);changed.places[0].research_fields.cost={raw_text:'Published free admission',admission_yen:0,admission_evidence:'published'};
  let review=local.prepare(changed,null,first.catalog,'2026-11-22',input.scope);
  review=decide(model.setDecision(review,'P1','merge_selected',{target:{table:model.LOCAL_PLACES,id:first.catalog.places[0].id},fields:['cost'],same_place_acknowledged:true}));
  const merged=await local.materialize(review,first.catalog,input.scope), again=await local.materialize(review,merged.catalog,input.scope);
  assert.equal(merged.merged,1);assert.equal(again.merged,0);assert.equal(merged.catalog.places[0].source.research_fields.cost.admission_yen,null);
  assert.equal(local.effectiveSource(merged.catalog.places[0]).research_fields.cost.admission_yen,0);
  assert.equal(local.effectiveSource(merged.catalog.places[0]).research_fields.hours.raw_summary,'Unknown');
  const stale=copy(merged.catalog);stale.places[0].rev++;
  const newer=copy(changed);newer.places[0].research_fields.cost.admission_yen=500;
  const exportChanged=model.reviewExport(review);exportChanged.research=newer;
  const restored=local.restoredReview(exportChanged,stale,'2026-11-22',input.scope);
  assert.equal(restored.review.candidates[0].decision,'pending');assert.equal(restored.warnings.length,1);
});
test('several selected fact groups targeting one local row save atomically',async()=>{
  const input=await approved(), first=await local.materialize(input.review,local.emptyCatalog(),input.scope), changed=copy(input.research);
  const second=copy(changed.places[0]);second.research_id='P2';second.name_ja='Second source';changed.places.push(second);
  let review=local.prepare(changed,null,first.catalog,'2026-11-22',input.scope);
  const target={table:model.LOCAL_PLACES,id:first.catalog.places[0].id};
  review=decide(model.setDecision(review,'P1','merge_selected',{target,fields:['cost'],same_place_acknowledged:true}));
  review=decide(model.setDecision(review,'P2','merge_selected',{target,fields:['hours'],same_place_acknowledged:true}));
  const saved=await local.materialize(review,first.catalog,input.scope);assert.equal(saved.merged,2);assert.equal(saved.catalog.places[0].rev,3);
});
test('cloud-target merges remain deferred and never modify saved personal fields',async()=>{
  const data=research(), scope=await local.destinationId(data);
  const tables=Object.fromEntries(model.TABLES.map(table=>[table,[]]));tables.setu_spots=[{id:'cloud',name:'Saved',rev:8,review:'Private review',status:'done',lat:35}];
  let review=local.prepare(data,{scope:'test',tables},local.emptyCatalog(),'2026-11-22',scope);
  review=decide(model.setDecision(review,'P1','merge_selected',{target:{table:'setu_spots',id:'cloud'},fields:['cost'],same_place_acknowledged:true}));
  const saved=await local.materialize(review,local.emptyCatalog(),scope);assert.equal(saved.deferred,1);assert.equal(saved.catalog.places.length,0);
  assert.equal(tables.setu_spots[0].review,'Private review');assert.equal(tables.setu_spots[0].status,'done');
});
test('full backups round-trip and reject malformed versions, confirmations and duplicate identities',async()=>{
  const input=await approved(), saved=await local.materialize(input.review,local.emptyCatalog(),input.scope);
  const workspace={id:input.scope,active:input.report,reviews:{[input.report]:model.reviewExport(input.review)},catalog:saved.catalog};
  const restored=await local.inspectInput(JSON.stringify(local.backup(workspace)));
  assert.deepEqual(restored.workspace.catalog,saved.catalog);assert.equal(restored.workspace.reviews[input.report].candidates[0].decision,'accept_suggestion');
  const bad=local.backup(workspace);bad.workspace.catalog.places[0].accepted=true;
  await assert.rejects(local.inspectInput(JSON.stringify(bad)),/Invalid or personally confirmed/);
  const duplicate=local.backup(workspace), draft=copy(duplicate.workspace.catalog.places[0]);draft.research_id='dupe';draft.source.research_id='dupe';draft.id=local.placeId(input.scope,'dupe');duplicate.workspace.catalog.places.push(draft);
  await assert.rejects(local.inspectInput(JSON.stringify(duplicate)),/duplicate local places/);
  await assert.rejects(local.inspectInput('{bad'),/Invalid JSON/);
  await assert.rejects(local.inspectInput('{"__proto__":{}}'),/Reserved key/);
  await assert.rejects(local.inspectInput('{"value":1e999}'),/Number cannot be represented/);
  await assert.rejects(local.inspectInput('{"format":"setu_research_local_backup","schema_version":"99"}'),/Unsupported/);
});

test('explicit classification updates keep stable IDs and older backups require an explicit conflict choice',async()=>{
  const input=await approved(),first=await local.materialize(input.review,local.emptyCatalog(),input.scope);
  const changed=decide(model.setDecision(input.review,'P1','accept_suggestion',{record_kind:'shop',distinct_acknowledged:true}));
  const updated=await local.materialize(changed,first.catalog,input.scope);
  assert.equal(updated.updated,1);assert.equal(updated.catalog.places.length,1);assert.equal(updated.catalog.places[0].id,first.catalog.places[0].id);
  const old={id:input.scope,active:input.report,reviews:{[input.report]:model.reviewExport(input.review)},catalog:first.catalog};
  const current={...old,catalog:updated.catalog};
  const beforeCurrent=copy(current), beforeOld=copy(old);
  await assert.rejects(local.mergeWorkspace(current,old),/Choose a version for each conflicting draft/);
  await assert.rejects(local.mergeWorkspace(current,old,()=>['']),/Each conflicting draft needs a choice/);
  const choose=version=>conflicts=>{
    assert.equal(conflicts.length,1);
    const [conflict]=conflicts;
    assert.equal(conflict.key,'places');
    assert.deepEqual(conflict.device,current.catalog.places[0]);
    assert.deepEqual(conflict.backup,old.catalog.places[0]);
    assert.equal(conflict.device.id,conflict.backup.id);
    return version===null?null:[version];
  };
  assert.equal(await local.mergeWorkspace(current,old,choose(null)),null);
  const restored=await local.mergeWorkspace(current,old,choose('device'));
  assert.deepEqual(restored.catalog,current.catalog);
  assert.equal(restored.catalog.places[0].record_kind,'shop');assert.equal(restored.catalog.places[0].rev,2);
  const restoredOlder=await local.mergeWorkspace(current,old,choose('backup'));
  assert.deepEqual(restoredOlder.catalog,old.catalog);
  assert.equal(restoredOlder.catalog.places[0].record_kind,'see');assert.equal(restoredOlder.catalog.places[0].rev,1);
  assert.equal(restoredOlder.catalog.places[0].id,restored.catalog.places[0].id);
  assert.deepEqual(current,beforeCurrent,'preview and cancellation must not mutate the device workspace');
  assert.deepEqual(old,beforeOld,'restore must not mutate the backup evidence');
});
