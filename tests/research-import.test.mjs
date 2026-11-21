import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const model = require('../js/research-import.js');
const schema = require('../js/research-import-schema.js');
const copy = value => JSON.parse(JSON.stringify(value));
const text = value => JSON.stringify(value);
const bundle = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const template = JSON.parse(bundle.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)[1];

// Synthetic, deliberately unrelated to the user's private research export.
function fixture() {
  const place = {
    research_id:'EXAMPLE-1', name_ja:'架空の公園', name_en:'Example park', hub_id:'example-hub',
    location:{address_ja:'架空県見本市1丁目', coordinates:null, maps_url:'https://example.org/map/1'},
    research_fields:{cost:{raw_text:'Price unpublished', admission_yen:null, admission_evidence:'unknown'},
      hours:{raw_summary:'Unknown', weekly_intervals:null, date_specific_open:null}, access:{}},
    tags:{practical_candidates:['quiet'], experiential_candidates:[{tag:'Cocoon', status:'potential', personal_confirmation:false}], personal_confirmed_experiences:[]},
    source_links:[{url:'https://example.org/park/1', checked_at:'2026-11-20'}],
    visit_status:'suggested', accepted_into_setu:false, review_status:'not_reviewed', personal_observation:null,
  };
  return {format:'setu_research_handoff', schema_version:'1.0.0',
    destination:{name_ja:'架空の町', origin_station_ja:'見本駅', travel_date:null, date_confirmed:false},
    provenance:{checked_at:'2026-11-20'}, import_contract:{no_direct_supabase_writes:true},
    hubs:[{id:'example-hub', name_ja:'架空の町'}], places:[place]};
}
function snapshot(tables = {}) {
  return {format:'setu_research_comparison', captured_at:'2026-11-22T00:00:00Z', scope:'test snapshot', complete:false,
    tables:Object.fromEntries(model.TABLES.map(table => [table, tables[table] || []]))};
}
function rejected(data, path) {
  const result = model.validateText(text(data));
  assert.equal(result.ok, false);
  assert.equal(result.data, undefined);
  assert.ok(result.errors.some(error => error.path.includes(path)), text(result.errors));
}

test('valid research preserves unknown fields, full evidence and destination independence', () => {
  const data = fixture();
  data.historical_transport = {service_date:'2020-01-01', evidence:'Old departures'};
  data.places[0].future_extension = {nested:['retained']};
  const valid = model.validateText('\uFEFF' + text(data));
  assert.equal(valid.ok, true);
  const preview = model.preview(valid.data, null, '2026-11-22');
  assert.deepEqual(preview.research, data);
  assert.equal(preview.candidates[0].state, 'comparison_unavailable');
  assert.deepEqual(preview.candidates[0].proposed_state, {accepted:false,status:'try',lat:null,lng:null,personal_confirmed_experiences:[]});
  assert.equal(preview.candidates[0].decision, 'pending');
});

test('every constraint in the supplied schema has a supported evaluator', () => {
  const supported = new Set(['$schema','$id','$comment','title','type','required','properties','items','minItems','maxItems','const','minimum','minLength','pattern']);
  function check(rule) {
    Object.keys(rule).forEach(key => assert.ok(supported.has(key), 'Unsupported schema keyword ' + key));
    Object.values(rule.properties || {}).forEach(check);
    if (rule.items) check(rule.items);
  }
  check(schema);
  assert.equal(model.validateText(text(fixture())).ok, true);
});

test('malformed, unsupported and structurally invalid files yield field errors without data', () => {
  assert.equal(model.validateText('{bad').ok, false);
  assert.equal(model.validateText('null').ok, false);
  assert.equal(model.validateText('x'.repeat(model.MAX_BYTES + 1)).ok, false);
  const invalids = [
    [data => data.schema_version = '2.0.0', '/schema_version'],
    [data => delete data.places[0].source_links, '/source_links'],
    [data => data.places[0].name_ja = '   ', '/name_ja'],
    [data => data.places[0].research_fields.cost.admission_yen = -1, '/admission_yen'],
    [data => data.places[0].research_fields.cost.admission_yen = 1.5, '/admission_yen'],
    [data => data.places[0].tags.personal_confirmed_experiences = ['Cocoon'], '/personal_confirmed_experiences'],
    [data => data.places[0].accepted_into_setu = true, '/accepted_into_setu'],
    [data => data.places[0].visit_status = 'visited', '/visit_status'],
    [data => data.places[0].review_status = 'reviewed', '/review_status'],
    [data => data.places[0].personal_observation = 'A personal review', '/personal_observation'],
  ];
  for (const [change, path] of invalids) { const data = fixture(); change(data); rejected(data, path); }
});

test('IDs, cross-hub references, links, dates and candidate confirmations are checked', () => {
  const invalids = [
    [data => data.hubs.push(copy(data.hubs[0])), '/hubs/1/id'],
    [data => data.places.push(copy(data.places[0])), '/places/1/research_id'],
    [data => data.places[0].hub_id = 'missing', '/hub_id'],
    [data => data.places[0].source_links[0].url = 'https://', '/url'],
    [data => data.places[0].source_links[0].url = 'https://user:secret@example.org', '/url'],
    [data => data.places[0].source_links[0].checked_at = '2026-02-30', '/checked_at'],
    [data => data.destination.date_confirmed = true, '/travel_date'],
    [data => data.places[0].tags.experiential_candidates[0].status = 'personally_confirmed', '/experiential_candidates/0'],
    [data => data.places[0].research_fields.cost.meal_budget_yen = {min:800,max:200}, '/meal_budget_yen'],
    [data => data.places[0].research_fields.cost.sample_prices = [{yen:'0'}], '/sample_prices'],
  ];
  for (const [change, path] of invalids) { const data = fixture(); change(data); rejected(data, path); }
  assert.equal(model.validateText('{"__proto__":{}}').ok, false);
  const deep = fixture(); let nested = deep;
  for (let i=0; i<35; i++) { nested.extension = {}; nested = nested.extension; }
  rejected(deep, '/extension');
});

test('matching Japanese aliases, NFKC, addresses, URLs and external IDs stays advisory', () => {
  const data = fixture();
  data.places[0].external_place_id = 'external-example';
  const saved = snapshot({
    setu_hubs:[{id:'hub-db-id', name:'架空の町'}],
    setu_spots:[{id:'spot-id', name:'Different name', address:'架空県見本市１丁目'}],
    setu_food_notes:[{id:'food-id',name:'A cafe',source_url:'https://example.org/park/1?utm_source=example'}],
    akatsuki_places:[{id:'place-id',label:'Another label',aliases:['架空の 公園']}],
    akatsuki_shops:[{id:42,name:'Shop',place_ref:'external-example'}],
  });
  const preview = model.preview(data, saved, '2026-11-22');
  assert.equal(preview.hubs[0].matches[0].id, 'hub-db-id');
  assert.equal(preview.candidates[0].matches.length, 4);
  assert.equal(preview.candidates[0].state, 'possible_existing');
  assert.equal(preview.candidates[0].decision, 'pending');
  assert.equal(preview.comparison.complete, false);
});

test('repeated preview never mutates places or personal reviews and is deterministic', () => {
  const data = fixture(), original = copy(data);
  const saved = snapshot({setu_spots:[{id:'same',name:'架空の公園',status:'done',accepted:true,review:'Keep my review',rating:5,seating_checks:{wifi:'2026-01-01'},themes:['Cocoon']}]});
  const before = copy(saved);
  const first = model.preview(data, saved, '2026-11-22');
  assert.deepEqual(model.preview(data, saved, '2026-11-22'), first);
  assert.deepEqual(data, original); assert.deepEqual(saved, before);
  assert.ok(!text(first).includes('Keep my review'));
  assert.ok(!text(first).includes('seating_checks'));
});

test('broad directory matches retain their total and bound expanded comparisons', () => {
  const saved = snapshot({setu_spots:Array.from({length:30}, (_, i) => ({id:String(i),name:'Other place',source_url:'https://example.org/park/1'}))});
  const candidate = model.preview(fixture(), saved, '2026-11-22').candidates[0];
  assert.equal(candidate.match_count, 30);
  assert.equal(candidate.matches.length, 20);
  assert.equal(candidate.decision, 'pending');
});

test('price semantics separate published zero, unknown, estimates, historic and conditional fees', () => {
  const price = model.priceSummary({admission_yen:null, admission_evidence:'unknown', meal_budget_yen:{min:200,max:600},
    sample_prices:[{scope:'festival',yen:300,evidence:'historical_event_price_not_future'}, {scope:'seating_if_permitted',yen:0,evidence:'operator'}]});
  assert.match(price.admission, /unknown/); assert.match(price.estimate, /estimate ¥200–600/);
  assert.equal(price.samples[0].classification, 'Historical price');
  assert.equal(price.samples[1].classification, 'Conditional seating price');
  assert.equal(model.priceSummary({admission_yen:0,admission_evidence:'published'}).admission, 'Published ¥0 admission');
  assert.match(model.priceSummary({admission_yen:0,admission_evidence:'assumption'}).admission, /unknown/);
});

test('old and future source dates are flagged without generating a current safe return', () => {
  const data = fixture();
  data.places[0].source_links[0].checked_at = '2020-01-01';
  let preview = model.preview(data, null, '2026-11-22');
  assert.match(preview.candidates[0].sources[0].warning, /stale/);
  data.places[0].source_links[0].checked_at = '2027-01-01';
  preview = model.preview(data, null, '2026-11-22');
  assert.match(preview.candidates[0].sources[0].warning, /Future/);
  assert.equal(preview.candidates[0].safe_return, undefined);
});

function appHarness() {
  const storage = new Map(), navigations = [];
  class DCLogic {setState(patch) {this.state = {...this.state, ...patch};}}
  const context = vm.createContext({DCLogic, console, URL, Date, Intl, setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},
    window:{location:{assign(path){navigations.push(path);}}},
    localStorage:{getItem(){return null;}}, sessionStorage:{setItem(k,v){storage.set(k,v);},removeItem(k){storage.delete(k);}},
    document:{}, navigator:{}});
  new vm.Script(runtime + '\n;globalThis.App = Component;').runInContext(context);
  return {app:new context.App(),storage,navigations};
}

test('normal entry creates a one-use snapshot without reviews, locations or account identifiers', () => {
  const h = appHarness();
  h.app.state.user = {id:'user-one'}; h.app.state.cloud = true;
  const tables = snapshot({setu_food_notes:[{id:'row',name:'Example',review:'Private review',user_id:'user-one',lat:35,lng:139,rating:4}]}).tables;
  h.app.researchComparison = {userId:'user-one',tables};
  h.app.renderVals().openResearchImport();
  const raw = h.storage.get(model.SNAPSHOT_KEY), transferred = JSON.parse(raw);
  assert.equal(transferred.tables.setu_food_notes[0].name, 'Example');
  assert.ok(!/Private review|user-one|rating|lat|lng/.test(raw));
  assert.equal(h.navigations[0], 'research-import.html');
  assert.match(template, /sc-camel-on-click="\{\{ openResearchImport \}\}"/);
});

test('changed account and signed-out state cannot reuse previous cloud comparison', () => {
  const h = appHarness();
  h.storage.set(model.SNAPSHOT_KEY, 'old snapshot');
  h.app.researchComparison = {userId:'old-user',tables:snapshot().tables};
  h.app.state.user = {id:'new-user'}; h.app.state.cloud = true;
  h.app.openResearchImport();
  assert.equal(h.storage.has(model.SNAPSHOT_KEY), false);
  h.app.state.user = null; h.app.state.foods = [{id:'local',name:'Local only'}];
  h.app.openResearchImport();
  const transferred = JSON.parse(h.storage.get(model.SNAPSHOT_KEY));
  assert.equal(transferred.tables.setu_food_notes.length, 1);
  assert.equal(transferred.tables.setu_spots.length, 0);
  assert.match(transferred.scope, /browser-local/);
});

function decision(outcome) {assert.equal(outcome.ok, true, outcome.error);return outcome.value;}
function readyReview(data = fixture(), saved = null) {
  let review = model.preview(data, saved, '2026-11-22');
  for (const hub of review.hubs) review = decision(model.resolveHub(review, hub.id, {kind:'new'}, true));
  return review;
}
function addCandidate(data, id, name) {
  const next = copy(data.places[0]); next.research_id = id; next.name_ja = name;
  next.name_en = name; next.location.address_ja += id;
  next.source_links[0].url = 'https://example.org/' + id; data.places.push(next);
}

test('R2 accepts only with explicit hub/category and exports unaccepted unvisited defaults', () => {
  const data = fixture(), untouched = copy(data);
  let review = model.preview(data, null, '2026-11-22');
  assert.match(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'food'}).error, /hub resolution/);
  review = decision(model.resolveHub(review,'example-hub',{kind:'new'}));
  assert.match(model.setDecision(review,'EXAMPLE-1','accept_suggestion').error, /Choose Food/);
  review = decision(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'food'}));
  const exported = model.reviewExport(review), proposal = exported.proposed_changes[0];
  assert.equal(proposal.destination_record.table,'setu_food_notes');
  assert.deepEqual(proposal.suggestion_defaults,{accepted:false,status:'try',lat:null,lng:null,personal_confirmed_experiences:[]});
  assert.equal(proposal.hub.research_hub_id,'example-hub');
  assert.deepEqual(exported.research, untouched); assert.deepEqual(data, untouched);
  assert.deepEqual(exported.review_summary,{pending:0,accept_suggestion:1,skip:0,merge_selected:0});
  assert.equal(model.suggestedKind({place_type:'bakery'}),'food');
  assert.equal(model.suggestedKind({place_type:'unknown_future_type'}),'');
});

test('R2 duplicate hubs can use a saved hub or share one draft; cycles and unreviewed duplicates fail', () => {
  const data = fixture();data.hubs.push({id:'duplicate-hub',name_ja:data.hubs[0].name_ja});
  let review = model.preview(data,snapshot({setu_hubs:[{id:'existing-hub',name:data.hubs[0].name_ja,rev:4}]}),'2026-11-22');
  assert.equal(model.resolveHub(review,'example-hub',{kind:'new'}).ok,false);
  review = decision(model.resolveHub(review,'example-hub',{kind:'existing',id:'existing-hub'}));
  review = decision(model.resolveHub(review,'duplicate-hub',{kind:'research_hub',id:'example-hub'}));
  assert.equal(model.resolvedHub(review,'duplicate-hub').id,'existing-hub');
  assert.equal(model.resolveHub(review,'example-hub',{kind:'research_hub',id:'duplicate-hub'}).ok,false);
  assert.equal(model.resolveHub(review,'example-hub',{kind:'existing',id:'invented'}).ok,false);
  assert.equal(review.hubs[0].resolution.id,'existing-hub');
});

test('R2 possible matches require a separate-suggestion acknowledgment and linked shops resolve food targets', () => {
  const data = fixture();
  const saved = snapshot({akatsuki_shops:[{id:9,name:data.places[0].name_ja}],setu_food_notes:[{id:'food-db',shop_id:9,name:null,rev:2}]});
  let review = readyReview(data,saved);
  assert.ok(review.candidates[0].matches.some(match => match.table==='setu_food_notes' && match.reasons.includes('Linked shop')));
  assert.equal(review.review_targets.find(target=>target.id==='food-db').name,data.places[0].name_ja);
  assert.equal(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'food'}).ok,false);
  review = decision(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'food',distinct_acknowledged:true,linked_location:'akatsuki_shops:9'}));
  assert.deepEqual(model.reviewExport(review).proposed_changes[0].linked_location,{table:'akatsuki_shops',id:9});
});

test('R2 selective merge preserves source evidence, unknown prices and every personal field', () => {
  const data = fixture(); data.places[0].safety_flags = [{kind:'entry_prohibited'}];
  const saved = snapshot({setu_spots:[{id:'existing',name:'Saved place',rev:7,status:'done',accepted:true,
    review:'Private review to protect',rating:5,lat:35,lng:139,seating_checks:{wifi:'2026-01-01'},themes:['Cocoon']}]});
  const before = copy(saved);
  let review = readyReview(data,saved);
  const target={kind:'existing',table:'setu_spots',id:'existing'};
  assert.equal(model.setDecision(review,'EXAMPLE-1','merge_selected',{target,fields:['cost']}).ok,false);
  assert.equal(model.setDecision(review,'EXAMPLE-1','merge_selected',{target,fields:[],same_place_acknowledged:true}).ok,false);
  for (const field of ['review','rating','status','accepted','lat','lng','seating_checks','personal_confirmed_experiences']) {
    assert.equal(model.setDecision(review,'EXAMPLE-1','merge_selected',{target,fields:[field],same_place_acknowledged:true}).ok,false,field);
  }
  review = decision(model.setDecision(review,'EXAMPLE-1','merge_selected',{target,fields:['cost'],same_place_acknowledged:true}));
  const exported = model.reviewExport(review), merge = exported.proposed_changes[0];
  assert.equal(merge.target.rev,7);
  assert.deepEqual(merge.selected_research_facts,[{key:'cost',path:'research_fields.cost',value:data.places[0].research_fields.cost}]);
  assert.equal(merge.selected_research_facts[0].value.admission_yen,null);
  assert.deepEqual(merge.evidence.source_links,data.places[0].source_links);
  assert.deepEqual(merge.evidence.safety_flags,data.places[0].safety_flags);
  assert.equal(merge.suggestion_defaults,undefined);
  assert.equal(text(exported).includes('Private review to protect'),false);
  assert.deepEqual(saved,before);
});

test('R2 registry rows cannot be merge targets and invented targets are rejected', () => {
  const review = readyReview(fixture(),snapshot({akatsuki_places:[{id:'registry',label:'Linked location'}]}));
  for (const target of [{table:'akatsuki_places',id:'registry'},{table:'setu_spots',id:'invented'}]) {
    assert.equal(model.setDecision(review,'EXAMPLE-1','merge_selected',{target,fields:['hours'],same_place_acknowledged:true}).ok,false);
  }
});

test('R2 duplicate research candidates can merge into one accepted suggestion and reset safely', () => {
  const data = fixture();addCandidate(data,'EXAMPLE-2','Second research source');
  let review = readyReview(data);
  review = decision(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'see',distinct_acknowledged:true}));
  review = decision(model.setDecision(review,'EXAMPLE-2','merge_selected',{target:{kind:'research_candidate',id:'EXAMPLE-1'},fields:['hours'],same_place_acknowledged:true}));
  assert.equal(model.reviewSummary(review).merge_selected,1);
  review = decision(model.setDecision(review,'EXAMPLE-1','skip'));
  assert.equal(review.candidates[1].decision,'pending');
  assert.equal(model.reviewExport(review).proposed_changes.length,0);
  assert.equal(review.research.places.length,2);
});

test('R2 hub changes invalidate affected accepts and their dependent merges', () => {
  const data = fixture();addCandidate(data,'EXAMPLE-2','Second source');
  data.hubs.push({id:'shared-hub',name_ja:'Same destination subhub'});data.places[0].hub_id='shared-hub';
  let review = readyReview(data);
  review = decision(model.resolveHub(review,'shared-hub',{kind:'research_hub',id:'example-hub'}));
  review = decision(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'other',distinct_acknowledged:true}));
  review = decision(model.setDecision(review,'EXAMPLE-2','merge_selected',{target:{kind:'research_candidate',id:'EXAMPLE-1'},fields:['hours'],same_place_acknowledged:true}));
  const outcome = model.resolveHub(review,'example-hub',null);
  assert.equal(outcome.reset_count,2);
  assert.equal(model.reviewSummary(outcome.value).pending,2);
  assert.equal(model.reviewExport(outcome.value).proposed_changes.length,0);
});

test('R2 overlapping staged facts are rejected while distinct fact groups can share a target', () => {
  const data = fixture();addCandidate(data,'EXAMPLE-2','Second source');
  let review = readyReview(data,snapshot({setu_spots:[{id:'existing',name:'Saved',rev:3}]}));
  const options={target:{table:'setu_spots',id:'existing'},fields:['cost'],same_place_acknowledged:true};
  review = decision(model.setDecision(review,'EXAMPLE-1','merge_selected',options));
  assert.match(model.setDecision(review,'EXAMPLE-2','merge_selected',options).error,/Overlapping facts/);
  review = decision(model.setDecision(review,'EXAMPLE-2','merge_selected',{...options,fields:['hours']}));
  assert.equal(model.reviewExport(review).proposed_changes.length,2);
  review = decision(model.setDecision(review,'EXAMPLE-1','skip'));
  assert.equal(model.reviewExport(review).proposed_changes.length,1);
});

test('R2 one linked location cannot create two staged suggestions and decisions are repeatable', () => {
  const data = fixture();addCandidate(data,'EXAMPLE-2','Second source');
  let review = readyReview(data,snapshot({akatsuki_places:[{id:'location',label:'Existing location'}]}));
  const opts={record_kind:'other',distinct_acknowledged:true,linked_location:'akatsuki_places:location'};
  review = decision(model.setDecision(review,'EXAMPLE-1','accept_suggestion',opts));
  assert.deepEqual(decision(model.setDecision(review,'EXAMPLE-1','accept_suggestion',opts)),review);
  assert.equal(model.setDecision(review,'EXAMPLE-2','accept_suggestion',opts).ok,false);
});

test('shared research pages alone remain advisory for saved and within-file places', () => {
  const data=fixture();addCandidate(data,'EXAMPLE-2','Different park');
  data.places[1].location.maps_url='https://example.org/map/2';
  data.places[1].source_links=copy(data.places[0].source_links);
  const saved=snapshot({setu_spots:[{id:'other',name:'Another place',address:'Elsewhere',source_url:data.places[0].source_links[0].url}]});
  let review=readyReview(data,saved);
  assert.equal(review.candidates[0].match_count,1);
  assert.deepEqual(review.candidates[0].possible_file_duplicates,[]);
  assert.deepEqual(review.candidates[0].shared_source_references,['EXAMPLE-2']);
  assert.equal(review.candidates[0].needs_distinct_review,false);
  review=decision(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'see'}));
  assert.equal(review.candidates[0].decision,'accept_suggestion');
});

test('matching names, addresses and place IDs still require explicit separate-place review', () => {
  const data=fixture();data.places[0].external_place_id='place-1';
  const records=[{id:'name',name:data.places[0].name_ja},
    {id:'address',name:'Different',address:data.places[0].location.address_ja},
    {id:'external',name:'Different',place_ref:'place-1'}];
  for(const row of records){
    const review=readyReview(data,snapshot({setu_spots:[row]}));
    assert.equal(review.candidates[0].needs_distinct_review,true);
    assert.equal(model.setDecision(review,'EXAMPLE-1','accept_suggestion',{record_kind:'see'}).ok,false);
  }
});
