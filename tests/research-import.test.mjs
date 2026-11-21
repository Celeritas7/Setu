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
