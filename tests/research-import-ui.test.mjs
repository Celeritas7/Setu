import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const model = require('../js/research-import.js');
const ui = fs.readFileSync(new URL('../js/research-import-ui.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../research-import.html', import.meta.url), 'utf8');

// A small event/DOM adapter runs the shipped UI script. It cannot assess layout
// or browser engine compatibility; those remain separate manual checks.
class Element {
  constructor(tag = 'div') {this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.value = ''; this.hidden = false; this.textContent = ''; this.files = [];}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  addEventListener(type, callback) {this.listeners[type] = callback;}
  async fire(type) {await this.listeners[type]?.({target:this});}
  get options() {return this.children;}
  focus() {this.focused = true;}
  scrollIntoView() {this.scrolled = true;}
  click() {this.clicked = true;}
  remove() {this.removed = true;}
}
function harness(snapshot = null) {
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  elements.preview.hidden = true;
  const storage = new Map(snapshot ? [[model.SNAPSHOT_KEY, JSON.stringify(snapshot)]] : []), blobs = [];
  const context = vm.createContext({
    window:{SetuResearchImport:model}, Date, Intl, Blob,
    URL:{createObjectURL(blob){blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},setTimeout(){},
    sessionStorage:{getItem(key){return storage.get(key);},removeItem(key){storage.delete(key);}},
    document:{body:new Element('body'),getElementById(id){assert.ok(elements[id],id);return elements[id];},
      createElement(tag){return new Element(tag);},createDocumentFragment(){return new Element('fragment');}},
  });
  vm.runInContext(ui, context);
  return {elements,storage,blobs};
}
const walk = element => [element, ...element.children.flatMap(walk)];
const allText = element => walk(element).map(node => node.textContent).join('\n');
function data() {
  return {format:'setu_research_handoff',schema_version:'1.0.0',destination:{origin_station_ja:'Example',travel_date:null,date_confirmed:false},
    provenance:{},import_contract:{},hubs:[{id:'example',name_ja:'Example hub'}],places:[{
      research_id:'example',name_ja:'<img src=x onerror=alert(1)>',hub_id:'example',
      location:{address_ja:'Unverified text',coordinates:null,maps_url:'https://example.org/map'},
      research_fields:{cost:{raw_text:'Unpublished',admission_yen:null,admission_evidence:'unknown'},
        hours:{raw_summary:'Unknown',weekly_intervals:null,date_specific_open:null},access:{}},
      tags:{practical_candidates:[],experiential_candidates:[],personal_confirmed_experiences:[]},
      source_links:[{url:'https://example.org',checked_at:'2026-01-01'}],visit_status:'suggested',accepted_into_setu:false,review_status:'not_reviewed',personal_observation:null,
    }]};
}
async function paste(h, value) {h.elements['research-text'].value = JSON.stringify(value);await h.elements.validate.fire('click');}

test('UI renders untrusted names as text, retains raw evidence and exports a pending dry run', async () => {
  const h = harness(), e = h.elements;
  await paste(h, data());
  assert.equal(e.preview.hidden, false);
  assert.match(e.summary.textContent, /1 candidates · 1 hubs/);
  assert.match(allText(e.candidates), /<img src=x onerror=alert\(1\)>/);
  assert.equal(walk(e.candidates).filter(node => node.tagName === 'IMG').length, 0);
  assert.match(allText(e.candidates), /Admission price unknown/);
  assert.match(allText(e.candidates), /Return transport is unverified/);
  await e.export.fire('click');
  const exported = JSON.parse(await h.blobs[0].text());
  assert.equal(exported.mode, 'dry_run');
  assert.equal(exported.candidates[0].decision, 'pending');
  assert.deepEqual(exported.research, data());
});

test('editing or invalidating input clears a previous preview and prevents stale export', async () => {
  const h = harness(), e = h.elements;
  await paste(h, data());
  e['research-text'].value = '{bad'; await e['research-text'].fire('input');
  assert.equal(e.preview.hidden, true);
  await e.export.fire('click'); assert.equal(h.blobs.length, 0);
  await e.validate.fire('click'); assert.match(allText(e.errors), /Invalid JSON/);
  assert.equal(e.errors.focused, true);
});

test('a canceled picker preserves preview; a late old read cannot replace a newer file or clear', async () => {
  const h = harness(), e = h.elements;
  await paste(h, data());
  await e['research-file'].fire('change'); assert.equal(e.preview.hidden, false);
  let resolveOld;
  e['research-file'].files = [{name:'old.json',size:10,text(){return new Promise(resolve => {resolveOld = resolve;});}}];
  const old = e['research-file'].fire('change');
  assert.equal(e.preview.hidden, true);
  const newer = data(); newer.places[0].name_ja = 'Newer file';
  e['research-file'].files = [{name:'new.json',size:10,async text(){return JSON.stringify(newer);}}];
  await e['research-file'].fire('change'); resolveOld(JSON.stringify(data())); await old;
  assert.match(allText(e.candidates), /Newer file/);
  await e.clear.fire('click'); assert.equal(e.preview.hidden, true);
  await e.export.fire('click'); assert.equal(h.blobs.length, 0);
});

test('comparison snapshot is consumed once and old snapshots are unavailable', () => {
  const snapshot = {format:'setu_research_comparison',captured_at:new Date().toISOString(),scope:'loaded records',
    tables:Object.fromEntries(model.TABLES.map(table => [table, []]))};
  let h = harness(snapshot);
  assert.equal(h.storage.has(model.SNAPSHOT_KEY), false);
  assert.match(h.elements['comparison-status'].textContent, /Comparing with loaded records/);
  snapshot.captured_at = '2020-01-01T00:00:00Z';
  h = harness(snapshot);
  assert.match(h.elements['comparison-status'].textContent, /unavailable/);
});

test('standalone importer forbids network requests and has no auth or write client', () => {
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /supabase|setu-hub|akatsuki-broadcast/);
  assert.doesNotMatch(ui, /innerHTML|\.insert\(|\.upsert\(|\.update\(|fetch\(|localStorage/);
});

const button = (root, text) => walk(root).find(item => item.tagName === 'BUTTON' && item.textContent === text);
const selectFor = (root, label) => walk(root).find(item => item.tagName === 'LABEL' && item.textContent === label)?.children.find(item => item.tagName === 'SELECT');
const checkFor = (root, label) => walk(root).find(item => item.tagName === 'LABEL' && item.children.some(child => child.textContent === label))?.children.find(item => item.tagName === 'INPUT');

test('R2 UI accepts only after a hub/category choice and exports decisions with unvisited defaults', async () => {
  const h = harness(), e = h.elements; await paste(h,data());
  let kind = selectFor(e.candidates,'Suggestion category');kind.value='see';await kind.fire('change');
  await button(e.candidates,'Accept as suggestion').fire('click');
  assert.match(e['decision-status'].textContent,/hub resolution/);
  assert.equal(e['decision-status'].focused,undefined);
  assert.ok(walk(e.candidates).some(item=>item.focused && /hub resolution/.test(item.textContent)));
  const hub = selectFor(e['hub-counts'],'Hub destination');hub.value='new';
  await button(e['hub-counts'],'Use hub choice').fire('click');
  await button(e.candidates,'Accept as suggestion').fire('click');
  assert.match(e.summary.textContent,/1 accepted suggestions/);
  await e.export.fire('click');
  const exported=JSON.parse(await h.blobs[0].text());
  assert.equal(exported.proposed_changes[0].suggestion_defaults.accepted,false);
  assert.equal(exported.proposed_changes[0].destination_record.kind,'see');
  assert.equal(exported.candidates[0].decision,'accept_suggestion');
  assert.match(allText(e.candidates),/Accepted as suggestion · staged/);
  assert.doesNotMatch(allText(e.candidates),/Suggested · unvisited · not accepted/);
  await button(e.candidates,'Skip').fire('click');assert.match(e.summary.textContent,/1 skipped/);
  await button(e.candidates,'Reset decision').fire('click');assert.match(e.summary.textContent,/1 pending/);
});

test('R2 UI selective merge requires same-place confirmation and at least one chosen fact', async () => {
  const tables=Object.fromEntries(model.TABLES.map(table=>[table,[]]));
  tables.setu_spots=[{id:'saved',name:'Saved park',rev:5,review:'Private review',rating:4,lat:35,lng:139}];
  const h=harness({format:'setu_research_comparison',captured_at:new Date().toISOString(),scope:'loaded test rows',tables});
  const e=h.elements;await paste(h,data());
  const target=selectFor(e.candidates,'Same-place target');target.value='setu_spots:saved';await target.fire('change');
  await button(e.candidates,'Stage selected fact merge').fire('click');
  assert.match(e['decision-status'].textContent,/Confirm the selected target/);
  const same=checkFor(e.candidates,'I checked that the selected target and this research candidate are the same place.');
  same.checked=true;await same.fire('change');
  await button(e.candidates,'Stage selected fact merge').fire('click');
  assert.match(e['decision-status'].textContent,/Select at least one/);
  const cost=checkFor(e.candidates,'Prices, scopes and estimates');cost.checked=true;await cost.fire('change');
  await button(e.candidates,'Stage selected fact merge').fire('click');
  assert.match(e.summary.textContent,/1 selected merges/);
  await e.export.fire('click');const exported=JSON.parse(await h.blobs[0].text());
  assert.deepEqual(exported.proposed_changes[0].selected_research_facts.map(field=>field.key),['cost']);
  assert.equal(exported.proposed_changes[0].target.rev,5);
  assert.equal(JSON.stringify(exported).includes('Private review'),false);
  const editCost=checkFor(e.candidates,'Prices, scopes and estimates');editCost.checked=false;await editCost.fire('change');
  assert.match(e.summary.textContent,/1 pending/);
  await e.export.fire('click');assert.equal(JSON.parse(await h.blobs[1].text()).proposed_changes.length,0);
  await button(e.candidates,'Skip').fire('click');await e.export.fire('click');
  assert.equal(JSON.parse(await h.blobs[2].text()).proposed_changes.length,0);
});

test('R2 UI filters by decision and retains choices while filtering/paging', async () => {
  const h=harness(),e=h.elements;await paste(h,data());
  await button(e.candidates,'Skip').fire('click');
  e['decision-filter'].value='pending';await e['decision-filter'].fire('input');
  assert.match(e['page-status'].textContent,/No matching/);
  e['decision-filter'].value='skip';await e['decision-filter'].fire('input');
  assert.match(allText(e.candidates),/Skipped · original evidence retained/);
  await e.export.fire('click');assert.equal(JSON.parse(await h.blobs[0].text()).review_summary.skip,1);
});

test('candidate decision shortcut scrolls to and focuses the decision panel', async () => {
  const h=harness();await paste(h,data());
  await button(h.elements.candidates,'Review decision ↓').fire('click');
  const panel=walk(h.elements.candidates).find(item=>item.className==='review-actions');
  assert.equal(panel.scrolled,true);assert.equal(panel.focused,true);
});
