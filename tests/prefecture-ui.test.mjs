import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE,'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime?.includes('PREFECTURE_HUB_HELPERS_START'));
const script = new vm.Script(`${runtime}\n;globalThis.__prefectureUi = {Component};`);
const NOW = new Date('2026-11-15T11:00:00+09:00');
const plain = x => JSON.parse(JSON.stringify(x));
const event = value => ({target:{value}});
const ids = rows => Array.from(rows,x=>x.id);
const harnesses = [];

function harness() {
  const writes=[], fetches=[], opened=[], storage=new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length?args:[NOW.getTime()])); }
    static now() { return NOW.getTime(); }
  }
  class DCLogic { setState(patch) { this.state={...this.state,...(typeof patch==='function'?patch(this.state):patch)}; } }
  const window={scrollTo(){},open(...args){opened.push(args);},addEventListener(){},removeEventListener(){},
    setu:{save(...args){writes.push(args);throw new Error('Hierarchy navigation must not save records');},
      softDelete(...args){writes.push(args);throw new Error('Hierarchy navigation must not delete records');}}};
  const ctx=vm.createContext({DCLogic,Date:ClockDate,Intl,URL,URLSearchParams,window,console,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    document:{getElementById(){return null;},hidden:false},navigator:{},
    setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},
    fetch(...args){fetches.push(args);throw new Error('Hierarchy navigation must not fetch');}});
  script.runInContext(ctx);
  const h={...ctx.__prefectureUi,writes,fetches,opened,storage};
  harnesses.push(h);
  return h;
}
test.afterEach(() => {
  for (const h of harnesses) { assert.deepEqual(h.writes,[]); assert.deepEqual(h.fetches,[]); }
  harnesses.length=0;
});

const hub=(id,prefecture,name,extra={})=>({id,prefecture,name,themes:[],geoQuery:'',lat:null,lng:null,radius_m:700,...extra});
const spot=(id,hubId,extra={})=>({id,hubId,name:`Place ${id}`,accepted:true,status:'try',kind:'other',themes:[],hours:null,lat:null,lng:null,address:'',url:'',...extra});
const food=(id,hubId,extra={})=>({id,hubId,name:`Food ${id}`,accepted:true,status:'try',themes:[],hours:null,lat:null,lng:null,address:'',area:'',url:'',...extra});

function fixture(extra={}) {
  const h=harness(), app=new h.Component();
  const hubs=[...Array.from({length:7},(_,i)=>hub(`s-${i+1}`,'Saitama',`Area ${i+1}`,{themes:i===0?['camera']:[]})),
    hub('t-active','Tokyo','Tokyo active'),hub('t-done','Tokyo','Tokyo visited'),hub('t-empty','Tokyo','Tokyo empty')];
  const spots=[...Array.from({length:7},(_,i)=>spot(`s-place-${i+1}`,'s-1',{themes:i===0?['camera','sit-long']:[]})),
    spot('tokyo-camera','t-active',{themes:['camera']}),spot('visited','t-done',{status:'done'}),
    spot('suggested','s-1',{accepted:false}),spot('skipped','s-1',{status:'skip'}),
    spot('deleted','s-1',{deleted_at:'2026-01-01'}),spot('sick-only','s-1',{themes:['sick-day']})];
  app.state={...app.state,cloud:true,user:{id:'fixture-user'},screen:'home',theme:'all',sick:false,
    hubs,spots,foods:[],foodSugg:[],outings:[],wx:[],fc:{},...extra};
  return {...h,app};
}

test('Home begins with prefecture roots and no hub or theme-board cards', () => {
  const {app}=fixture(), v=app.renderVals();
  assert.equal(v.homeAtPrefectures,true); assert.equal(v.homeInPrefecture,false);
  assert.equal(v.homeAreaTitle,'Prefectures');
  assert.deepEqual(ids(v.homePrefectures),['saitama','tokyo']);
  assert.equal(v.hubCards.length,0); assert.equal(v.tbOn,false); assert.equal(v.tbHubs.length,0);
  assert.match(v.homePrefectures[0].summary,/7 area hubs/);
  assert.match(v.homeAreaHint,/Prefecture → Area hub → Places/);
});

test('Home reveals only five hubs in one prefecture and supports pagination and search', () => {
  const {app}=fixture();
  app.renderVals().homePrefectures.find(p=>p.id==='saitama').go();
  let v=app.renderVals();
  assert.equal(v.homeAtPrefectures,false); assert.equal(v.homeInPrefecture,true);
  assert.deepEqual(ids(v.hubCards),['s-1','s-2','s-3','s-4','s-5']);
  assert.match(v.homeHubCount,/1–5 of 7/); assert.equal(v.homeHubHasPrev,false); assert.equal(v.homeHubHasNext,true);
  v.homeHubNext(); v=app.renderVals();
  assert.deepEqual(ids(v.hubCards),['s-6','s-7']); assert.match(v.homeHubCount,/6–7 of 7/);
  assert.equal(v.homeHubHasPrev,true); assert.equal(v.homeHubHasNext,false);
  v.onHomeHubQuery(event('AREA 7')); v=app.renderVals();
  assert.equal(app.state.homeHubPage,0); assert.deepEqual(ids(v.hubCards),['s-7']);
  v.onHomeHubQuery(event('no such hub')); v=app.renderVals();
  assert.equal(v.homeHubEmpty,true); assert.equal(v.hubCards.length,0);
  v.onHomeHubQuery(event('')); v=app.renderVals();
  assert.equal(v.hubCards.length,5);
  v.homeAllPrefectures(); v=app.renderVals();
  assert.equal(v.homeAtPrefectures,true); assert.equal(v.hubCards.length,0); assert.equal(app.state.homeHubQuery,'');
});

test('opening a hub and returning to its sibling hubs keeps the prefecture context', () => {
  const {app}=fixture();
  app.renderVals().homePrefectures.find(p=>p.id==='saitama').go();
  app.renderVals().hubCards[0].go();
  assert.equal(app.state.screen,'hub'); assert.equal(app.state.hubId,'s-1');
  const v=app.renderVals(); assert.match(v.hbPrefectureCrumb,/Saitama/);
  v.hbSiblingHubs();
  assert.equal(app.state.screen,'home'); assert.equal(app.state.homePrefecture,'saitama');
  assert.equal(app.renderVals().homeInPrefecture,true);
});

test('theme selection resets Home to grouped prefectures instead of reviving the all-places board', () => {
  const {app}=fixture();
  app.renderVals().homePrefectures.find(p=>p.id==='saitama').go();
  app.renderVals().homeHubNext();
  app.renderVals().themeChips.find(c=>/camera/i.test(c.label)).go();
  let v=app.renderVals();
  assert.equal(app.state.theme,'camera'); assert.equal(app.state.homePrefecture,''); assert.equal(app.state.homeHubPage,0);
  assert.equal(v.homeAtPrefectures,true); assert.equal(v.hubCards.length,0); assert.equal(v.tbOn,false); assert.equal(v.tbHubs.length,0);
  assert.deepEqual(ids(v.homePrefectures),['saitama','tokyo'],'a matching child can expose its otherwise untagged hub');
  v.homePrefectures.find(p=>p.id==='tokyo').go(); v=app.renderVals();
  assert.deepEqual(ids(v.hubCards),['t-active']);
  v.themeChips.find(c=>c.label==='All').go();
  assert.equal(app.renderVals().homeAtPrefectures,true);
});

test('My plan starts without locations and reveals one selected hub, five places at a time', () => {
  const {app}=fixture({screen:'plan'});
  let v=app.renderVals();
  assert.equal(v.wvCount,8); assert.equal(v.wvGroups.length,0); assert.equal(v.wvHubs.length,0);
  assert.equal(v.wvHubDisabled,true); assert.equal(v.wvChooseArea,true);
  v.onWvPrefecture(event('saitama')); v=app.renderVals();
  assert.equal(v.wvGroups.length,0); assert.equal(v.wvHubDisabled,false);
  assert.deepEqual(Array.from(v.wvHubs,h=>h.key),['hub:s-1']);
  v.onWvHub(event('hub:s-1')); v=app.renderVals();
  assert.equal(v.wvGroups.length,1); assert.equal(v.wvGroups[0].items.length,5);
  assert.equal(v.wvGroups[0].name,'Area 1'); assert.match(v.wvPageCount,/1–5 of 7 places · Saitama/);
  v.wvNext(); v=app.renderVals();
  assert.equal(v.wvGroups[0].items.length,2); assert.match(v.wvPageCount,/6–7 of 7/);
  assert.equal(v.wvHasNext,false); assert.equal(v.wvHasPrev,true);
  v.wvPrev(); assert.equal(app.renderVals().wvGroups[0].items.length,5);
});

test('changing the My plan prefecture clears stale hub selection and page but preserves saved records', () => {
  const {app}=fixture({screen:'plan'}), before=plain({hubs:app.state.hubs,spots:app.state.spots,foods:app.state.foods});
  app.renderVals().onWvPrefecture(event('saitama')); app.renderVals().onWvHub(event('hub:s-1')); app.renderVals().wvNext();
  app.renderVals().onWvPrefecture(event('tokyo'));
  let v=app.renderVals();
  assert.equal(app.state.wvPage,0); assert.equal(v.wvHubKey,''); assert.equal(v.wvGroups.length,0);
  assert.deepEqual(Array.from(v.wvHubs,h=>h.key),['hub:t-active']);
  v.onWvHub(event('hub:s-1'));
  assert.equal(app.renderVals().wvGroups.length,0,'cannot select a hub outside the selected prefecture');
  app.renderVals().onWvHub(event('hub:t-active'));
  v=app.renderVals(); assert.equal(v.wvGroups.length,1); assert.equal(v.wvGroups[0].items.length,1);
  assert.deepEqual(plain({hubs:app.state.hubs,spots:app.state.spots,foods:app.state.foods}),before);
});

test('zero-linked and dangling references remain reachable through Unassigned without a fake hub', () => {
  const {app,opened}=fixture({hubs:[hub('valid','Tokyo','Real hub')],foods:[food('orphan-food',null)],
    spots:[spot('orphan-spot',null),spot('dangling','missing-hub')],screen:'home'});
  let v=app.renderVals();
  assert.deepEqual(ids(v.homePrefectures),['tokyo','unassigned']);
  v.homePrefectures.find(p=>p.id==='unassigned').go(); v=app.renderVals();
  assert.equal(v.hubCards.length,1); assert.equal(v.hubCards[0].id,null); assert.equal(v.hubCards[0].name,'Unassigned places');
  v.hubCards[0].go(); v=app.renderVals();
  assert.equal(app.state.screen,'plan'); assert.equal(v.wvPrefecture,'unassigned');
  assert.equal(v.wvHubKey,'unassigned-places'); assert.equal(v.wvGroups[0].items.length,3);
  v.wvGroups[0].items.find(x=>x.name==='Place dangling').open();
  assert.equal(opened.length,1,'an orphan spot can still open its map without a nonexistent hub screen');
  v.wvGroups[0].plan();
  assert.equal(app.state.od.hubId,null,'the explicit unassigned group must not select the first valid hub');
  assert.equal(app.state.spots.find(x=>x.id==='dangling').hubId,'missing-hub','browsing must not silently relink a stored place');
});

test('adding a dangling-hub place to a new draft uses a safe null outing hub', () => {
  const {app}=fixture({hubs:[],foods:[],spots:[spot('dangling','missing-hub')],screen:'plan'});
  app.renderVals().onWvPrefecture(event('unassigned'));
  app.renderVals().onWvHub(event('unassigned-places'));
  app.renderVals().wvGroups[0].items[0].add();
  assert.equal(app.state.od.hubId,null,'a missing foreign key must not be copied into a new outing draft');
  assert.deepEqual(plain(app.state.od.stops),[{t:'spot',id:'dangling'}]);
});

test('a hubless place with an explicit address is reachable inside its known prefecture', () => {
  const {app}=fixture({hubs:[],foods:[],spots:[spot('address-known',null,{address:'埼玉県さいたま市'})],screen:'home'});
  let v=app.renderVals();
  assert.deepEqual(ids(v.homePrefectures),['saitama']);
  v.homePrefectures[0].go(); v=app.renderVals();
  assert.equal(v.hubCards.length,1); assert.equal(v.hubCards[0].id,null);
  assert.equal(v.hubCards[0].key,'unassigned-places:saitama');
  assert.equal(v.hubCards[0].name,'Places without an area hub');
  v.hubCards[0].go(); v=app.renderVals();
  assert.equal(app.state.screen,'plan'); assert.equal(v.wvPrefecture,'saitama');
  assert.equal(v.wvHubKey,'unassigned-places:saitama');
  assert.equal(v.wvGroups.length,1); assert.equal(v.wvGroups[0].items[0].name,'Place address-known');
  v.wvGroups[0].plan();
  assert.equal(app.state.od.hubId,null); assert.equal(app.state.spots[0].hubId,null);
});

test('a new day starts with no selected area and only reveals hubs after choosing a prefecture', () => {
  const {app}=fixture({screen:'plan'});
  app.renderVals().odNew();
  let v=app.renderVals();
  assert.equal(v.odPrefecture,''); assert.equal(v.odHubId,''); assert.equal(v.odHubDisabled,true); assert.equal(v.odHubs.length,0);
  assert.deepEqual(ids(v.odPrefectures),['saitama','tokyo']);
  v.onOdPrefecture(event('tokyo')); v=app.renderVals();
  assert.equal(v.odHubDisabled,false);
  assert.deepEqual(ids(v.odHubs),['t-active','t-empty','t-done'],'visited and empty hubs must remain selectable');
  v.onOdHub(event('t-empty'));
  assert.equal(app.state.od.hubId,'t-empty'); assert.equal(app.renderVals().odHubId,'t-empty');
});

test('changing a day prefecture and hub preserves date, existing stop order and unsaved settings', () => {
  const {app}=fixture({screen:'plan'});
  app.openOuting(null,{hubId:'s-1',date:'2026-11-21',stops:[{t:'spot',id:'s-place-2'},{t:'spot',id:'s-place-1'}],rainy:true,rainManual:true,sitTime:'14:30',sitOpen:true});
  const stops=plain(app.state.od.stops);
  let v=app.renderVals(); assert.equal(v.odPrefecture,'saitama');
  v.onOdPrefecture(event('tokyo'));
  assert.equal(app.state.od.hubId,null);
  v=app.renderVals(); v.onOdHub(event('t-done'));
  assert.equal(app.state.od.hubId,'t-done'); assert.equal(app.state.od.prefectureId,'tokyo');
  assert.equal(app.state.od.date,'2026-11-21'); assert.equal(app.state.od.sitTime,'14:30'); assert.equal(app.state.od.sitOpen,true);
  assert.equal(app.state.od.rainy,true); assert.equal(app.state.od.rainManual,true);
  assert.deepEqual(plain(app.state.od.stops),stops);
  assert.match(app.renderVals().odMsg,/existing stops are kept/i);
  app.renderVals().onOdHub(event('s-1'));
  assert.equal(app.state.od.hubId,'t-done','cross-prefecture hub injection must be ignored');
});

test('busy day drafts ignore selector changes and plan-here does not replace an existing draft', () => {
  const {app}=fixture({screen:'plan'});
  app.openOuting(null,{hubId:'s-1',date:'2026-11-21',stops:[{t:'spot',id:'s-place-1'}],busy:true});
  const before=plain(app.state.od);
  app.renderVals().onOdPrefecture(event('tokyo')); app.renderVals().onOdHub(event('s-2'));
  assert.deepEqual(plain(app.state.od),before);
  app.setState({od:{...app.state.od,busy:false}});
  app.renderVals().onWvPrefecture(event('tokyo')); app.renderVals().onWvHub(event('hub:t-active'));
  app.renderVals().wvGroups[0].plan();
  assert.equal(app.state.od.hubId,'s-1'); assert.equal(app.state.od.date,'2026-11-21');
  assert.deepEqual(plain(app.state.od.stops),before.stops);
  assert.match(app.state.od.msg,/current draft is still here/i);
});

test('Sick-day gating applies to roots, child options and want-to-visit lists', () => {
  const {app}=fixture({hubs:[hub('ordinary','Saitama','Ordinary hub'),hub('special','Hokkaido','Hidden hub',{themes:['sick-day']})],
    foods:[],spots:[spot('normal','ordinary'),spot('hidden','special',{themes:['sick-day']})]});
  let v=app.renderVals();
  assert.deepEqual(ids(v.homePrefectures),['saitama']); assert.equal(v.wvCount,1);
  assert.deepEqual(ids(v.wvPrefectures),['saitama']);
  app.setState({sick:true}); v=app.renderVals();
  assert.deepEqual(ids(v.homePrefectures),['hokkaido','saitama']); assert.equal(v.wvCount,2);
  v.homePrefectures.find(p=>p.id==='hokkaido').go(); assert.deepEqual(ids(app.renderVals().hubCards),['special']);
  app.setState({sick:false}); v=app.renderVals();
  assert.equal(v.homeAtPrefectures,true); assert.equal(v.hubCards.length,0,'stale selection cannot reveal a newly hidden hub');
  app.openOuting(null);
  assert.deepEqual(ids(app.renderVals().odPrefectures),['saitama']);
});

test('empty saved data has no fabricated prefectures, hubs or place lists', () => {
  const {app}=fixture({hubs:[],foods:[],spots:[]});
  const v=app.renderVals();
  assert.equal(v.hasHubs,false); assert.equal(v.homePrefectures.length,0); assert.equal(v.hubCards.length,0);
  assert.equal(v.wvEmpty,true); assert.equal(v.wvGroups.length,0); assert.equal(v.wvPrefectures.length,0);
});

test('template binds dependent area selectors and no longer renders the all-area chip wall', () => {
  for (const name of ['homePrefectures','homeInPrefecture','homeHubQuery','homeHubNext','wvPrefectures','wvHubs','wvNext','odPrefectures','odHubs']) {
    assert.ok(template.includes(`{{ ${name} }}`),`${name} has live markup`);
  }
  assert.equal(template.includes('list="{{ odAreas }}"'),false);
  assert.match(template,/value="\{\{ odHubId \}\}"[^>]+disabled="\{\{ odHubDisabled \}\}"/);
  assert.match(template,/value="\{\{ wvHubKey \}\}"[^>]+disabled="\{\{ wvHubDisabled \}\}"/);
});
