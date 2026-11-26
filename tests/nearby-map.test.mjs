import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// By default test the shipped bundle, not a hand-maintained copy of the logic.
// During editing: SETU_TEST_TEMPLATE=/absolute/path/template.html node tests/nearby-map.test.mjs
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE, 'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime, 'actual embedded Setu runtime is present');
assert.ok(runtime.includes('NEARBY_MAP_HELPERS_START'), 'nearby-map implementation is present');
const SCRIPT = new vm.Script(`${runtime}\n;globalThis.__setuTest = {mapHasPt,mapInBounds,mapFreshPhone,mapAnchor,nearbyMapModel,mapPage,Component};`);
const T0 = Date.UTC(2026, 10, 14, 7, 0, 0);

function harness({ permission = 'granted', noGeolocation = false } = {}) {
  let clock = T0, nextWatch = 0, nextTimer = 1;
  const watches = new Map(), cleared = [], timers = new Map(), storage = new Map();
  const windowListeners = new Map(), documentListeners = new Map(), oneShots = [];
  const counts = { permissionQueries:0, changes:0, dbWrites:0 };
  let permissionReply = () => Promise.resolve({ state:permission });
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const localStorage = { getItem:k => storage.get(k) ?? null, setItem:(k,v) => storage.set(k,String(v)), removeItem:k => storage.delete(k) };
  const document = {
    hidden:false, getElementById:() => null, querySelector:() => null,
    addEventListener:(name,fn) => documentListeners.set(name,fn),
    removeEventListener:(name,fn) => { if (documentListeners.get(name) === fn) documentListeners.delete(name); }
  };
  const navigator = {
    permissions:{ query:() => { counts.permissionQueries++; return permissionReply(); } },
    ...(noGeolocation ? {} : { geolocation:{
      watchPosition:(success,error,options) => { const id = nextWatch++; watches.set(id,{success,error,options}); return id; },
      clearWatch:id => cleared.push(id),
      getCurrentPosition:(success,error,options) => oneShots.push({success,error,options})
    } })
  };
  const window = {
    localStorage, addEventListener:(name,fn) => windowListeners.set(name,fn),
    removeEventListener:(name,fn) => { if (windowListeners.get(name) === fn) windowListeners.delete(name); },
    scrollTo:() => {}, open:() => {},
    setu:{ onAuth:() => () => {}, save:() => { counts.dbWrites++; throw new Error('GPS must not write to the database'); } }
  };
  class DCLogic {
    setState(patch) {
      this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
      counts.changes++;
      if (this.__mounted) this.componentDidUpdate();
    }
  }
  const ctx = vm.createContext({
    DCLogic, document, navigator, window, localStorage, Date:ClockDate, console,
    URL, URLSearchParams,
    setInterval:(fn,ms) => { const id = nextTimer++; timers.set(id,{fn,ms}); return id; },
    clearInterval:id => timers.delete(id),
    setTimeout:(fn,ms) => { const id = nextTimer++; timers.set(id,{fn,ms}); return id; },
    clearTimeout:id => timers.delete(id),
    fetch:() => { throw new Error('Unit tests must not make network requests'); }
  });
  SCRIPT.runInContext(ctx);
  const api = ctx.__setuTest;
  const app = new api.Component();
  app.__mounted = true;
  app.componentDidMount();
  return {
    ...api, app, document, window, watches, cleared, timers, storage, oneShots, counts,
    now:() => clock,
    advance:ms => { clock += ms; },
    setPermissionReply:fn => { permissionReply = fn; },
    // These regressions exercise an already-selected travel mode. Planning-map
    // tests separately verify that ordinary Map entry is all-areas and GPS-free.
    async enter() { app.setState({screen:'map',mv:{...app.state.mv,scope:'near',follow:true}}); await this.flush(); },
    async flush() { for (let i=0; i<6; i++) await Promise.resolve(); },
    emit(id, {lat=35,lng=139,accuracy=10,at=clock} = {}) {
      watches.get(id).success({ coords:{latitude:lat,longitude:lng,accuracy},timestamp:at });
    },
    fail(id,code) { watches.get(id).error({code}); },
    async visibility(hidden) { document.hidden=hidden; documentListeners.get('visibilitychange')?.(); await this.flush(); },
    dispose() { app.componentWillUnmount(); app.__mounted=false; }
  };
}

const place = (id, lat=35.001, extra={}) => ({id,name:`Place ${id}`,lat,lng:139,status:'try',accepted:true,themes:[],...extra});
const state = extra => ({
  sick:false, foods:[],foodSugg:[],spots:[],hubs:[],
  here:{lat:35,lng:139,at:T0,accuracy:10},hereSrc:'phone',mapLoc:'live',
  mv:{scope:'near',radiusKm:3,source:'all',tag:'all',page:0}, ...extra
});
const ids = rows => Array.from(rows, r=>r.id);

test('a next-place preview pauses existing map watching and closing it resumes only the explicit nearby mode',async()=>{
  const h=harness();await h.enter();h.emit(0);await h.flush();const before=h.app.state.here;
  h.app.nextPlacesOpen=true;h.app.setState({menuOpen:false});await h.flush();
  assert.ok(h.cleared.includes(0));assert.equal(h.app.mapLocationActive(),false);assert.deepEqual(h.app.state.here,before);
  h.app.nextPlacesOpen=false;h.app.syncMapLocation();await h.flush();assert.equal(h.watches.size,2);
  h.app.setState({mv:{...h.app.state.mv,scope:'all'}});h.app.nextPlacesOpen=true;h.app.nextPlacesOpen=false;h.app.syncMapLocation();await h.flush();
  assert.equal(h.watches.size,2,'planning mode never starts an additional watch');assert.equal(h.counts.dbWrites,0);h.dispose();
});

test('entire embedded runtime parses; coordinates are finite, ranged, and not missing', () => {
  new Function(runtime);
  const h=harness();
  for (const p of [{lat:0,lng:0},{lat:'35.0',lng:'139.0'},{lat:-90,lng:180}]) assert.equal(h.mapHasPt(p),true);
  for (const p of [null,{}, {lat:null,lng:139},{lat:'',lng:139},{lat:NaN,lng:139},{lat:91,lng:139},{lat:35,lng:181},{lat:35,lng:Infinity}]) assert.equal(h.mapHasPt(p),false);
  h.dispose();
});

test('booleans and whitespace are not coordinates', () => {
  const h=harness();
  for (const p of [{lat:false,lng:false},{lat:'   ',lng:'139'},{lat:[],lng:139}]) assert.equal(h.mapHasPt(p),false,JSON.stringify(p));
  h.dispose();
});

test('nearby anchor requires a fresh phone fix, never a historical stay', () => {
  const h=harness(), s=state();
  assert.equal(h.mapFreshPhone(s,T0),true);
  assert.equal(h.mapFreshPhone({...s,hereSrc:'hub'},T0),false);
  assert.equal(h.mapFreshPhone({...s,here:{...s.here,at:T0-300001}},T0),false);
  assert.equal(h.mapFreshPhone({...s,here:{...s.here,at:T0+60001}},T0),false);
  assert.equal(h.mapAnchor({...s,mapLoc:'denied'},T0),null);
  assert.equal(h.mapAnchor({...s,hereSrc:'hub'},T0),null);
  h.dispose();
});

test('a fresh but inaccurate one-shot fix is not a usable nearby-map anchor', () => {
  const h=harness();
  const s=state({here:{lat:35,lng:139,at:T0,accuracy:10000},spots:[place('not-known-to-be-nearby')]});
  assert.equal(h.mapFreshPhone(s,T0),false,'old one-shot location must pass the same accuracy gate as a watch fix');
  assert.equal(h.mapAnchor(s,T0),null);
  const model=h.nearbyMapModel(s,T0);
  assert.equal(model.needsLocation,true);
  assert.equal(model.nearby.length,0,'do not claim proximity from a ±10 km fix');
  h.dispose();
});

test('manual area and center use their own coordinates, not phone fallback', () => {
  const h=harness(), s=state({hubs:[{id:'area',lat:36,lng:140}]});
  assert.equal(h.mapAnchor({...s,mv:{scope:'area',areaId:'area'}},T0).lat,36);
  assert.equal(h.mapAnchor({...s,mv:{scope:'area',areaId:'missing'}},T0),null);
  assert.equal(h.mapAnchor({...s,mv:{scope:'center',center:{lat:37,lng:141}}},T0).lat,37);
  assert.equal(h.mapAnchor({...s,mv:{scope:'all'}},T0),null);
  h.dispose();
});

test('radius sorting, deduplication, skipped/deleted/sick gating, and suggestion provenance', () => {
  const h=harness();
  const s=state({foods:[place('food',35.002)],foodSugg:[place('food',35.002),place('suggested',35.001,{accepted:false})],spots:[
    place('far',35.1),place('near',35.003),place('skip',35.001,{status:'skip'}),
    place('deleted',35.001,{deleted_at:'2026-01-01'}),place('sick',35.001,{themes:['sick-day']})]});
  const m=h.nearbyMapModel(s,T0);
  assert.deepEqual(ids(m.nearby),['suggested','food','near']);
  assert.equal(m.all.filter(r=>r.id==='food').length,1);
  assert.equal(m.nearby[0]._suggestion,true);
  assert.equal(m.nearby.find(r=>r.id==='food')._suggestion,false);
  assert.ok(h.nearbyMapModel({...s,sick:true},T0).nearby.some(r=>r.id==='sick'));
  h.dispose();
});

test('source, theme and radius intersect; facets describe nearby source matches', () => {
  const h=harness(), dayoff={by:'DAY OFF · TRAIN TV #28',themes:['dayoff','cafe','quiet']};
  const s=state({mv:{scope:'near',radiusKm:1,source:'dayoff',tag:'cafe'},spots:[
    place('yes',35.001,dayoff),place('wrong-theme',35.002,{by:dayoff.by,themes:['dayoff','rain-ok']}),
    place('ordinary',35.001,{themes:['cafe']}),place('too-far',35.02,dayoff)]});
  const m=h.nearbyMapModel(s,T0);
  assert.deepEqual(ids(m.nearby),['yes']);
  assert.equal(m.facets.cafe,1); assert.equal(m.facets.quiet,1); assert.equal(m.facets['rain-ok'],1);
  assert.equal(m.facets.dayoff,undefined);
  h.dispose();
});

test('unplaced rows remain separate and never acquire fabricated distances', () => {
  const h=harness(), s=state({spots:[place('pinned'),place('unknown',null),place('invalid',NaN)]});
  const m=h.nearbyMapModel(s,T0);
  assert.deepEqual(ids(m.nearby),['pinned']);
  assert.deepEqual(ids(m.unplaced).sort(),['invalid','unknown']);
  assert.ok(m.unplaced.every(r=>r.distanceKm===undefined));
  const unavailable=h.nearbyMapModel({...s,here:null},T0);
  assert.equal(unavailable.needsLocation,true); assert.equal(unavailable.nearby.length,0);
  assert.equal(unavailable.unplaced.length,2);
  h.dispose();
});

test('all-areas DAY OFF order uses episode, with no fake distance from user', () => {
  const h=harness(), s=state({mv:{scope:'all',source:'dayoff',tag:'all'},spots:[
    place('old',36,{by:'DAY OFF #2'}),place('new',35.1,{by:'DAY OFF #28'})]});
  const m=h.nearbyMapModel(s,T0);
  assert.deepEqual(ids(m.nearby),['new','old']); assert.ok(m.nearby.every(r=>r.distanceKm===null));
  assert.equal(m.needsLocation,false);
  h.dispose();
});

test('five-row pagination clamps stale, fractional, and invalid page inputs', () => {
  const h=harness(), rows=Array.from({length:12},(_,i)=>({id:i}));
  assert.deepEqual(ids(h.mapPage(rows,0).rows),[0,1,2,3,4]);
  const last=h.mapPage(rows,99); assert.equal(last.page,2); assert.equal(last.start,11); assert.equal(last.end,12);
  assert.deepEqual(ids(last.rows),[10,11]);
  assert.equal(h.mapPage(rows,-1).page,0); assert.equal(h.mapPage(rows,'bad').page,0); assert.equal(h.mapPage(rows,1.9).page,1);
  const none=h.mapPage([],3); assert.equal(none.page,0); assert.equal(none.start,0); assert.equal(none.end,0); assert.equal(none.rows.length,0);
  h.dispose();
});

test('an explicitly selected nearby mode watches only on Map, at most once across renders, including watch ID zero', async () => {
  const h=harness();
  h.app.componentDidUpdate(); await h.flush(); assert.equal(h.watches.size,0);
  await h.enter(); assert.equal(h.watches.size,1); assert.equal(h.app.mapWatch,0);
  for(let i=0;i<8;i++) h.app.setState({mapTick:i});
  await h.flush(); assert.equal(h.watches.size,1);
  h.app.setState({screen:'home'}); assert.deepEqual(h.cleared,[0]); assert.equal(h.timers.size,0);
  const before=h.counts.changes; h.emit(0); assert.equal(h.counts.changes,before,'late callback after leaving is ignored');
  h.dispose();
});

test('hidden tab stops location, visible tab resumes one watch, unmount clears it', async () => {
  const h=harness(); await h.enter();
  await h.visibility(true); assert.deepEqual(h.cleared,[0]); assert.equal(h.app.state.mapLoc,'paused');
  const before=h.counts.changes; h.emit(0); assert.equal(h.counts.changes,before);
  await h.visibility(false); assert.equal(h.watches.size,2); assert.equal(h.app.mapWatch,1);
  h.dispose(); assert.deepEqual(h.cleared,[0,1]); assert.equal(h.timers.size,0);
  const last=h.counts.changes; h.emit(1); assert.equal(h.counts.changes,last);
});

test('permission prompt/denial does not loop on renders; explicit Near me may request', async () => {
  const h=harness({permission:'prompt'}); await h.enter();
  assert.equal(h.watches.size,0); assert.equal(h.app.state.mapLoc,'prompt');
  for(let i=0;i<5;i++) h.app.setState({mapTick:i});
  await h.flush(); assert.equal(h.counts.permissionQueries,1);
  h.app.useNearMe(); await h.flush(); assert.equal(h.watches.size,1);
  h.fail(0,1); await h.flush(); assert.equal(h.app.state.mapLoc,'denied');
  for(let i=0;i<5;i++) h.app.setState({mapTick:i});
  assert.equal(h.watches.size,1); assert.ok(h.cleared.includes(0));
  h.dispose();
});

test('async permission result cannot start watch after manual mode or unmount', async () => {
  const h=harness(); let resolve;
  h.setPermissionReply(()=>new Promise(r=>{resolve=r;}));
  h.app.setState({screen:'map',mv:{...h.app.state.mv,scope:'near',follow:true}});
  h.app.selectMapArea({id:'manual',name:'Manual area',lat:36,lng:140});
  resolve({state:'granted'}); await h.flush();
  assert.equal(h.watches.size,0); assert.equal(h.app.state.mv.scope,'area');
  assert.equal(h.app.state.mv.areaId,'manual');
  h.dispose();
  const closed=harness(); let resolveAfterUnmount;
  closed.setPermissionReply(()=>new Promise(r=>{resolveAfterUnmount=r;}));
  closed.app.setState({screen:'map',mv:{...closed.app.state.mv,scope:'near',follow:true}}); closed.dispose();
  resolveAfterUnmount({state:'granted'}); await closed.flush();
  assert.equal(closed.watches.size,0); assert.equal(closed.timers.size,0);
});

test('unavailable geolocation remains usable without repeatedly requesting it', async () => {
  const h=harness({noGeolocation:true}); await h.enter();
  assert.equal(h.app.state.mapLoc,'unavailable');
  for(let i=0;i<5;i++) h.app.setState({mapTick:i});
  await h.flush(); assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0);
  h.dispose();
});

test('manual area selection stops watch and late GPS cannot hijack it', async () => {
  const h=harness(); await h.enter(); h.emit(0);
  h.app.selectMapArea({id:'manual',name:'Manual area',lat:36,lng:140});
  const before=h.app.state.here;
  h.advance(60000); h.emit(0,{lat:37,lng:141});
  assert.equal(h.app.state.here,before); assert.equal(h.app.state.mv.scope,'area');
  assert.equal(h.app.mvView.lat,36); assert.ok(h.cleared.includes(0));
  assert.equal(h.counts.dbWrites,0);
  h.dispose();
});

test('GPS throttle accepts first fix, limits rapid movement, and refreshes stationary freshness', async () => {
  const h=harness(); await h.enter(); h.emit(0);
  assert.equal(h.app.state.mapLoc,'live'); assert.equal(h.app.state.here.at,T0);
  h.advance(10000); h.emit(0,{lat:35.01}); assert.equal(h.app.state.here.at,T0);
  h.advance(10000); h.emit(0,{lat:35.003}); assert.equal(h.app.state.here.at,T0+20000);
  const firstView=h.app.mvView; h.app.mvView=null;
  h.advance(30000); h.emit(0,{lat:35.003}); assert.equal(h.app.state.here.at,T0+20000);
  h.advance(30000); h.emit(0,{lat:35.003}); assert.equal(h.app.state.here.at,T0+80000);
  assert.equal(h.app.mvView,null,'stationary refresh does not recenter the map'); assert.ok(firstView);
  assert.equal(h.counts.dbWrites,0); assert.equal(h.storage.size,0,'watch does not persist GPS history');
  h.dispose();
});

test('inaccurate, stale and out-of-order GPS fixes cannot replace a good fix', async () => {
  const h=harness(); await h.enter();
  h.emit(0,{accuracy:2000}); assert.equal(h.app.state.mapLoc,'inaccurate'); assert.equal(h.app.state.here,null);
  h.emit(0,{at:T0-120001}); assert.equal(h.app.state.here,null);
  h.emit(0); const good=h.app.state.here;
  h.advance(60000); h.emit(0,{at:T0-1,lat:36}); assert.equal(h.app.state.here,good);
  h.dispose();
});

test('movement can refresh nearby results without recentering a manually panned map', async () => {
  const h=harness(); await h.enter(); h.emit(0);
  h.app.mvView=null;
  h.app.setState({mv:{...h.app.state.mv,follow:false,panned:true,page:2}});
  h.advance(30000); h.emit(0,{lat:35.004});
  assert.equal(h.app.state.here.lat,35.004); assert.equal(h.app.state.mv.page,0);
  assert.equal(h.app.state.mv.follow,false); assert.equal(h.app.mvView,null);
  h.dispose();
});

test('a far-future GPS timestamp cannot poison live location', async () => {
  const h=harness(); await h.enter();
  h.emit(0,{at:T0+600000});
  assert.equal(h.app.state.here,null,'future fix must be rejected before it blocks later legitimate fixes');
  h.emit(0); assert.equal(h.app.state.here.at,T0);
  h.dispose();
});

test('late older one-shot location cannot replace a newer watch fix', async () => {
  const h=harness(); h.app.locate(); assert.equal(h.oneShots.length,1);
  await h.enter(); h.emit(0); h.app.selectMapArea({id:'manual',lat:36,lng:140});
  const good=h.app.state.here;
  h.oneShots[0].success({coords:{latitude:34,longitude:138,accuracy:100},timestamp:T0-1000});
  assert.equal(h.app.state.here,good); assert.equal(h.app.state.mv.scope,'area');
  h.dispose();
});

test('fit-to-matches uses only destination coordinates and handles an empty list', () => {
  const h=harness();
  h.app.state={...h.app.state,...state({mv:{...h.app.state.mv,scope:'all',source:'dayoff'},spots:[place('one',36,{by:'DAY OFF #28'})]}),layers:{places:false,friends:true}};
  h.app.fitMapMatches();
  assert.equal(h.app.mvFit.length,1); assert.equal(h.app.mvFit[0][0],36); assert.equal(h.app.state.mv.follow,false);
  assert.equal(h.app.state.layers.places,true);
  h.app.mvFit=null; h.app.state.spots=[]; h.app.fitMapMatches(); assert.equal(h.app.mvFit,null);
  h.dispose();
});

test('pending-name browsing still offers a way back when the final pin becomes available', () => {
  const h=harness();
  h.app.state={...h.app.state,cloud:true,spots:[place('pending',null)],mv:{...h.app.state.mv,scope:'all',pendingOpen:true}};
  assert.equal(h.app.renderVals().mapHasPending,true);
  h.app.setState({spots:[place('pending')]});
  const v=h.app.renderVals();
  assert.ok(!h.app.state.mv.pendingOpen || v.mapHasPending,
    'a cloud/geocode refresh must not strand the user in an empty pending-only list');
  if(h.app.state.mv.pendingOpen) v.mapPendingToggle();
  assert.equal(h.app.state.mv.pendingOpen,false);
  assert.equal(h.app.renderVals().mapRows[0].name,'Place pending');
  h.dispose();
});

test('DAY OFF source resets every inherited spatial scope and type, then fits every destination', () => {
  for(const scope of ['near','area','center','viewport']) {
    const h=harness(), picked=[{t:'spot',id:'saved-pick'}];
    const destinations=Array.from({length:6},(_,i)=>place(`dayoff-${i}`,35+i,{by:`DAY OFF #${i+1}`,themes:[i%2?'jinja':'cafe'],accepted:false}));
    const food=place('dayoff-food',42,{by:'DAY OFF #28',themes:['cafe'],accepted:false});
    h.app.state={...h.app.state,...state({spots:[...destinations,place('ordinary',35.001)],foodSugg:[food],
      hubs:[{id:'area',name:'Area',lat:35,lng:139,themes:[]}]}),screen:'map',cloud:true,
      layers:{places:false,friends:true},
      mv:{...h.app.state.mv,scope,source:'all',radiusKm:3,areaId:'area',center:{lat:35,lng:139},
        bounds:{south:34.99,north:35.01,west:138.99,east:139.01},tag:'cafe',page:2,
        pendingOpen:true,resultsOpen:false,sel:{key:'old'},picked,follow:true,panned:true}};
    const originalSpots=h.app.state.spots, originalFood=h.app.state.foodSugg;
    h.app.mvView={lat:1,lng:2,z:16}; h.app.mvFit=[[1,2]]; h.app.gJump={lat:1,lng:2,k:1};
    const source=h.app.renderVals().mapSources.find(x=>x.label.includes('DAY OFF'));
    assert.ok(source); source.go();
    const mv=h.app.state.mv, model=h.nearbyMapModel(h.app.state), view=h.app.renderVals();
    assert.equal(mv.source,'dayoff'); assert.equal(mv.scope,'all');
    assert.equal(mv.areaId,null); assert.equal(mv.center,null); assert.equal(mv.bounds,null); assert.equal(mv.tag,'all');
    assert.equal(mv.page,0); assert.equal(mv.pendingOpen,false); assert.equal(mv.sel,null);
    assert.equal(mv.follow,false); assert.equal(mv.panned,false); assert.equal(mv.resultsOpen,true);
    assert.equal(h.app.mvView,null); assert.equal(h.app.gJump,null); assert.equal(h.app.state.layers.places,true);
    assert.equal(model.nearby.length,7,`${scope}: distant places and pending-acceptance food must remain discoverable`);
    assert.ok(model.nearby.every(x=>x.distanceKm===null),'trip planning must not invent a nearby distance');
    assert.deepEqual(Array.from(h.app.mvFit,p=>Array.from(p)).sort((a,b)=>a[0]-b[0]),[35,36,37,38,39,40,42].map(lat=>[lat,139]));
    assert.equal(h.app.mapPoints().filter(x=>x.dayoff).length,7); assert.equal(view.mapRows.length,5);
    assert.equal(view.mapRadiusVisible,false); assert.equal(view.mapFilterLabel,'Filters · No limit');
    assert.match(view.mapMatchText,/7 pinned places.*no radius limit.*DAY OFF/);
    assert.equal(view.mapResultTitle,'DAY OFF destinations'); assert.equal(view.mapHasLocationHelp,false);
    assert.equal(mv.picked,picked); assert.equal(h.app.state.spots,originalSpots); assert.equal(h.app.state.foodSugg,originalFood);
    assert.ok(h.app.state.spots.slice(0,6).every(x=>x.accepted===false));
    assert.equal(h.counts.dbWrites,0); assert.equal(h.storage.size,0); assert.equal(h.watches.size,0);
    h.dispose();
  }
});

test('DAY OFF fits coordinates arriving after selection without refitting unchanged data', () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',cloud:false};
  h.app.selectMapSource('dayoff'); assert.equal(h.app.mvFit,null); assert.equal(h.app.dayOffAutoFit,true);
  h.app.setState({cloud:true,spots:[place('near',35,{by:'DAY OFF #1'}),place('far',39,{by:'DAY OFF #2'})]});
  assert.equal(h.app.mvFit.length,2);
  h.app.mvFit=null; // a successful draw consumes this command
  h.app.setState({mapTick:T0+1}); assert.equal(h.app.mvFit,null,'ordinary renders must not refit');
  h.app.setState({spots:[...h.app.state.spots].reverse()});
  assert.equal(h.app.mvFit,null,'a different row order is not a different destination set');
  h.app.setState({foodSugg:[place('later-food',43,{by:'DAY OFF #3',accepted:false})]});
  assert.equal(h.app.mvFit.length,3,'newly loaded coordinates join the initial trip overview');
  h.app.renderVals().mapRows[0].go();
  const selectedView=h.app.mvView;
  assert.equal(h.app.dayOffAutoFit,false); assert.equal(h.app.mvFit,null);
  h.app.setState({spots:[...h.app.state.spots,place('even-later',44,{by:'DAY OFF #4'})]});
  assert.equal(h.app.mvFit,null,'late rows cannot override a deliberately opened destination');
  assert.equal(h.app.mvView,selectedView); assert.equal(h.counts.dbWrites,0);
  h.dispose();
});

test('a type filter cancels the old all-destinations fit while Leaflet is still loading', () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',cloud:true,spots:[
    place('cafe',35,{by:'DAY OFF #1',themes:['cafe']}),place('shrine',42,{by:'DAY OFF #2',themes:['jinja']})
  ]};
  h.app.selectMapSource('dayoff'); assert.equal(h.app.mvFit.length,2);
  const cafe=h.app.renderVals().mapTags.find(x=>/^Caf/i.test(x.label));
  assert.ok(cafe); cafe.go();
  assert.equal(h.app.state.mv.tag,'cafe'); assert.equal(h.app.dayOffAutoFit,false);
  assert.equal(h.app.mvFit,null,'a delayed draw must not consume the obsolete all-destinations command');
  assert.deepEqual(ids(h.nearbyMapModel(h.app.state).nearby),['cafe']);
  h.app.setState({spots:[...h.app.state.spots,place('later-shrine',43,{by:'DAY OFF #3',themes:['jinja']})]});
  assert.equal(h.app.mvFit,null,'a later cloud update must respect the explicit type selection');
  h.dispose();
});

test('DAY OFF stops the live watcher and late fixes or permission replies cannot hijack trip mode', async () => {
  const h=harness(); await h.enter(); h.emit(0);
  h.app.setState({spots:[place('far',39,{by:'DAY OFF #1'})]});
  h.app.selectMapSource('dayoff');
  assert.ok(h.cleared.includes(0)); assert.equal(h.app.mapWatch,null); assert.equal(h.timers.size,0);
  const here=h.app.state.here, fit=h.app.mvFit, before=h.counts.changes;
  h.advance(60000); h.emit(0,{lat:36,lng:140});
  assert.equal(h.app.state.here,here); assert.equal(h.app.mvFit,fit); assert.equal(h.app.mvView,null);
  assert.equal(h.counts.changes,before); assert.equal(h.app.state.mv.scope,'all');
  await h.visibility(true); await h.visibility(false); await h.flush();
  assert.equal(h.watches.size,1,'returning to a trip overview must not restart GPS');
  h.app.setState({screen:'home'}); h.app.setState({screen:'map'}); await h.flush();
  assert.equal(h.watches.size,1,'returning to Map retains the manual trip overview');
  h.dispose();
  const deferred=harness(); let resolve;
  deferred.setPermissionReply(()=>new Promise(r=>{resolve=r;}));
  deferred.app.setState({screen:'map',mv:{...deferred.app.state.mv,scope:'near',follow:true}});
  deferred.app.selectMapSource('dayoff');
  resolve({state:'granted'}); await deferred.flush();
  assert.equal(deferred.watches.size,0); assert.equal(deferred.app.state.mv.scope,'all');
  assert.equal(deferred.app.mapStarting,false); deferred.dispose();
});

test('Near me explicitly narrows DAY OFF; All sources never implicitly restores the old GPS scope', async () => {
  const h=harness({permission:'prompt'});
  h.app.state={...h.app.state,screen:'map',cloud:true,
    spots:[place('near',35.001,{by:'DAY OFF #1'}),place('far',40,{by:'DAY OFF #2'})]};
  h.app.selectMapSource('dayoff'); await h.flush();
  assert.equal(h.counts.permissionQueries,0); assert.equal(h.watches.size,0);
  h.app.renderVals().mapSources.find(x=>x.label==='All sources').go(); await h.flush();
  assert.equal(h.app.state.mv.source,'all'); assert.equal(h.app.state.mv.scope,'all');
  assert.equal(h.app.state.mv.follow,false); assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0);
  h.app.selectMapSource('dayoff'); h.app.renderVals().mapNearMe(); await h.flush();
  assert.equal(h.app.state.mv.source,'dayoff'); assert.equal(h.app.state.mv.scope,'near');
  assert.equal(h.app.state.mv.follow,true); assert.equal(h.watches.size,1); assert.equal(h.app.dayOffAutoFit,false);
  h.emit(0); assert.deepEqual(ids(h.nearbyMapModel(h.app.state).nearby),['near']);
  assert.equal(h.app.renderVals().mapRadiusVisible,true);
  h.app.renderVals().mapAllDayOff();
  assert.equal(h.app.state.mv.scope,'all'); assert.equal(h.app.state.mv.source,'dayoff');
  assert.equal(h.app.state.mv.tag,'all'); assert.equal(h.app.state.mv.follow,false);
  assert.equal(h.nearbyMapModel(h.app.state).nearby.length,2); assert.ok(h.cleared.includes(0));
  assert.equal(h.app.mvFit.length,2); assert.equal(h.app.renderVals().mapRadiusVisible,false);
  h.dispose();
});

test('viewport containment supports dateline crossing and wrapped maps without invalid-coordinate leaks', () => {
  const h=harness(), b={south:-10,north:10,west:170,east:-170};
  for(const lng of [170,175,-175,-170]) assert.equal(h.mapInBounds({lat:0,lng},b),true);
  for(const lng of [169,-169,0]) assert.equal(h.mapInBounds({lat:0,lng},b),false);
  assert.equal(h.mapInBounds({lat:0,lng:175},{...b,west:530,east:550}),true);
  assert.equal(h.mapInBounds({lat:0,lng:-175},{...b,west:530,east:550}),true);
  assert.equal(h.mapInBounds({lat:0,lng:0},{...b,west:-180,east:180}),true);
  assert.equal(h.mapInBounds({lat:11,lng:175},b),false);
  for(const bad of [null,{}, {...b,south:11}, {...b,north:NaN}, {...b,west:Infinity}, {...b,east:'190'}])
    assert.equal(h.mapInBounds({lat:0,lng:175},bad),false);
  assert.equal(h.mapInBounds({lat:null,lng:175},b),false);
  h.dispose();
});

test('Search this area uses the visible viewport for results, facets, pins, hubs and friends, not a 3 km circle', async () => {
  const h=harness();
  h.app.state={...h.app.state,...state({
    spots:[place('visible-far',35.08,{by:'DAY OFF #1',themes:['jinja']}),place('near-but-offscreen',35,{lng:139.01,themes:['cafe']}),place('unplaced',null)],
    foodSugg:[place('visible-food',35.07,{by:'DAY OFF #2',themes:['cafe'],accepted:false})],
    hubs:[{id:'visible-hub',name:'Visible hub',lat:35.06,lng:139,themes:[]},{id:'offscreen-hub',name:'Offscreen hub',lat:35,lng:139.01,themes:[]}]
  }),screen:'map',cloud:true,
    friends:[{id:'visible-friend',name:'Visible friend',lat:35.05,lng:139},{id:'offscreen-friend',name:'Offscreen friend',lat:35,lng:139.01}],
    mv:{...h.app.state.mv,scope:'near',radiusKm:3,mode:'street',panned:false,follow:true,page:4,pendingOpen:true,sel:{key:'old'}}};
  const {map,element}=stubLeaflet(h); await h.app.drawStreet(element);
  assert.equal(h.app.renderVals().mapPanned,true,'viewport search is available even after zoom-only or no drag');
  map.bounds={south:34.99,north:35.10,west:138.999,east:139.001};
  h.app.mvFit=[[1,2]]; h.app.mvView={lat:1,lng:2,z:16}; h.app.gJump={lat:1,lng:2,k:1};
  h.app.renderVals().mapSearchHere(); await h.flush();
  const mv=h.app.state.mv, model=h.nearbyMapModel(h.app.state), view=h.app.renderVals();
  assert.equal(mv.scope,'viewport'); assert.equal(mv.center,null); assert.equal(mv.areaId,null);
  assert.equal(mv.follow,false); assert.equal(mv.page,0); assert.equal(mv.pendingOpen,false); assert.equal(mv.sel,null);
  assert.equal(h.app.mvFit,null); assert.equal(h.app.mvView,null); assert.equal(h.app.gJump,null);
  assert.deepEqual(ids(model.nearby),['visible-far','visible-food']);
  assert.ok(model.nearby.every(x=>x.distanceKm===null));
  assert.equal(model.facets.jinja,1); assert.equal(model.facets.cafe,1);
  assert.deepEqual(Array.from(h.app.mapPoints(),x=>x.key).filter(x=>x!=='you').sort(),
    ['svisible-far','fvisible-food','hvisible-hub','cvisible-friend'].sort());
  assert.equal(view.mapRows.length,2); assert.equal(view.mapResultTitle,'Options in this map area');
  assert.match(view.mapMatchText,/2 pinned places in this map area/);
  assert.equal(view.mapRadiusVisible,false); assert.equal(view.mapFilterLabel,'Filters · Map area');
  assert.equal(view.mapAreaName,'This map area'); assert.doesNotMatch(view.mapEmptyText,/3 km/);
  assert.equal(view.mapHasPending,true,'unknown coordinates stay honestly separate from viewport results');
  assert.equal(h.watches.size,0); assert.equal(h.counts.dbWrites,0);
  h.dispose();
});

test('DAY OFF viewport results can return to all destinations with the explicit all-destinations control', async () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',cloud:true,spots:[
    place('visible',35.08,{by:'DAY OFF #1'}),place('far',40,{by:'DAY OFF #2'}),place('ordinary',35.08)
  ],mv:{...h.app.state.mv,scope:'all',source:'dayoff',mode:'street',follow:false}};
  const {map,element}=stubLeaflet(h); await h.app.drawStreet(element);
  map.bounds={south:35,north:35.1,west:138.9,east:139.1};
  h.app.searchMapCenter(); await h.flush();
  assert.equal(h.app.state.mv.source,'dayoff'); assert.deepEqual(ids(h.nearbyMapModel(h.app.state).nearby),['visible']);
  const view=h.app.renderVals();
  assert.equal(view.mapIsDayOff,true); assert.match(view.mapDayOffHint,/No radius limit/);
  assert.equal(view.mapRadiusVisible,false); assert.doesNotMatch(view.mapFilterLabel+' '+view.mapMatchText,/3 km/);
  view.mapAllDayOff(); await h.flush();
  assert.equal(h.app.state.mv.scope,'all'); assert.equal(h.app.state.mv.bounds,null);
  assert.deepEqual(ids(h.nearbyMapModel(h.app.state).nearby),['far','visible']);
  assert.equal(map.fits.at(-1).coords.length,2); assert.equal(h.watches.size,0);
  h.dispose();
});

test('opening a pending suggestion pauses GPS without accepting or writing the suggestion', async () => {
  const h=harness(); await h.enter(); h.emit(0);
  h.app.setState({cloud:true,spots:[place('pending',null,{accepted:false,by:'DAY OFF #28'})],
    mv:{...h.app.state.mv,pendingOpen:true}});
  const rows=h.app.renderVals().mapRows; assert.equal(rows.length,1); rows[0].go();
  assert.ok(h.app.state.br); assert.ok(h.cleared.includes(0)); assert.equal(h.app.state.spots[0].accepted,false);
  assert.equal(h.counts.dbWrites,0);
  h.app.closeBrowse(); await h.flush(); assert.equal(h.watches.size,2);
  h.dispose();
});

test('explicit region selection discards stale queued fit and view commands', () => {
  const h=harness();
  h.app.mvFit=[[35,139],[40,-73]];
  h.app.mvView={lat:35,lng:139,z:16};
  h.app.browseMapRegion(['World',30,139,1,null]);
  assert.equal(h.app.mvFit,null,'old fit must not override a newer region choice after Leaflet loads');
  assert.equal(h.app.mvView,null,'globe region choice must discard a queued street view');
  assert.equal(h.app.state.mv.scope,'all'); assert.equal(h.app.state.mv.follow,false);
  assert.equal(h.app.gJump.lat,30); assert.equal(h.app.gJump.k,1);
  h.app.browseMapRegion(['Kanto',35.8,139.6,null,9]);
  assert.equal(h.app.mvView.lat,35.8); assert.equal(h.app.mvView.z,9);
  h.dispose();
});

// Check bindings in the actual replacement markup, including every loop scope.
// Conditional branches are deliberately all inspected, not just visible ones.
function checkMapBindings(values) {
  const markup=template.match(/<!-- MAP -->([\s\S]*?)<!-- PLACE TO EAT -->/)?.[1];
  assert.ok(markup,'Map markup block exists');
  let scopes=[values];
  const stack=[], rootBindings=new Set(), loopBindings=new Set(), loopNames=new Set();
  let checked=0;
  const resolve=(expression,scope) => {
    if(expression==='true') return true;
    if(expression==='false') return false;
    if(expression==='null') return null;
    assert.match(expression,/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/,
      `unsupported Map binding expression must be explicitly tested: ${expression}`);
    let value=scope;
    for(const part of expression.split('.')) {
      assert.ok(value != null && part in Object(value),`missing Map binding: ${expression}`);
      value=value[part];
    }
    assert.notEqual(value,undefined,`undefined Map binding: ${expression}`);
    if(expression.includes('.')) loopBindings.add(expression); else rootBindings.add(expression);
    checked++;
    return value;
  };
  const token=/<sc-for\b[^>]*>|<\/sc-for\s*>|\{\{\s*([\s\S]*?)\s*\}\}/g;
  let match;
  while((match=token.exec(markup))) {
    const raw=match[0];
    if(/^<sc-for\b/.test(raw)) {
      const expression=raw.match(/\blist="\{\{\s*([^{}]*?)\s*\}\}"/)?.[1];
      const alias=raw.match(/\bas="([\w$]+)"/)?.[1];
      assert.ok(expression && alias,`loop has list and alias: ${raw}`);
      loopNames.add(expression);
      const children=[];
      for(const scope of scopes) {
        const rows=resolve(expression,scope); assert.ok(Array.isArray(rows),`${expression} must be a list`);
        assert.ok(rows.length>0,`fixture must exercise every member binding in ${expression}`);
        for(const row of rows) children.push({...scope,[alias]:row});
      }
      stack.push(scopes); scopes=children;
    } else if(/^<\/sc-for/.test(raw)) {
      assert.ok(stack.length,'Map loops are balanced'); scopes=stack.pop();
    } else {
      const expression=match[1].trim();
      const prefix=markup.slice(Math.max(0,match.index-60),match.index);
      for(const scope of scopes) {
        const value=resolve(expression,scope);
        if(/\bsc-camel-on-(?:click|change)="\s*$/.test(prefix))
          assert.equal(typeof value,'function',`${expression} must be an event callback`);
        if(/\bhref="\s*$/.test(prefix))
          assert.equal(typeof value,'string',`${expression} must be a URL string`);
      }
    }
  }
  assert.equal(stack.length,0,'Map loops close');
  return {checked,rootBindings,loopBindings,loopNames};
}

test('all Map markup root and loop bindings resolve to real renderVals data and callbacks', t => {
  const h=harness(), x=place('dayoff',35.001,{themes:['cafe','dayoff'],by:'DAY OFF #28',url:'https://example.com/episode',hubId:'area'});
  h.app.state={...h.app.state,...state({hubs:[{id:'area',name:'Area',lat:35,lng:139,themes:[]}],spots:[x,place('pending',null,{themes:['cafe']})]}),
    screen:'map',cloud:true,mv:{...h.app.state.mv,scope:'area',areaId:'area',tag:'cafe',areaOpen:true,filtersOpen:true,sel:{key:'sdayoff'},picked:[{t:'spot',id:'dayoff'}]}};
  const result=checkMapBindings(h.app.renderVals());
  assert.ok(result.rootBindings.size>50,'exercise the complete Map view, not a tiny subset');
  assert.equal(result.loopNames.size,8,'all eight Map loop models are covered');
  h.app.state.mv={...h.app.state.mv,pendingOpen:true};
  checkMapBindings(h.app.renderVals());
  t.diagnostic(`Checked ${result.rootBindings.size} root bindings, ${result.loopBindings.size} scoped member bindings and ${result.loopNames.size} loops (${result.checked} evaluations).`);
  h.dispose();
});

function stubLeaflet(h) {
  const handlers=new Map(), element={clientWidth:360,clientHeight:480}, markerCalls=[];
  const map={
    removed:false,zoom:11,center:{lat:35.85,lng:139.65},fits:[],
    bounds:{south:35.7,north:36,west:139.4,east:139.9},
    on(name,fn) { const list=handlers.get(name)||[]; list.push(fn); handlers.set(name,list); return this; },
    once(name,fn) { const once=(...args)=>{this.off(name,once);fn(...args);}; return this.on(name,once); },
    off(name,fn) { handlers.set(name,(handlers.get(name)||[]).filter(x=>x!==fn)); return this; },
    emit(name) { for(const fn of [...(handlers.get(name)||[])]) fn(); },
    setView(coords,zoom) { this.center={lat:coords[0],lng:coords[1]}; this.zoom=zoom; return this; },
    flyTo(coords,zoom) { this.emit('zoomstart'); this.setView(coords,zoom); this.emit('zoomend'); this.emit('moveend'); return this; },
    fitBounds(coords,options) { this.fits.push({coords,options}); this.emit('zoomstart'); this.zoom=4; this.emit('zoomend'); this.emit('moveend'); return this; },
    getZoom() { return this.zoom; }, getCenter() { return this.center; },
    getBounds() { return {getSouth:()=>this.bounds.south,getNorth:()=>this.bounds.north,getWest:()=>this.bounds.west,getEast:()=>this.bounds.east}; },
    invalidateSize() { assert.equal(this.removed,false,'cannot invalidate a map destroyed by its own fitBounds event'); return this; },
    remove() { this.removed=true; return this; }
  };
  const layer={addTo() {return this;},clearLayers() {assert.equal(map.removed,false); return this;}};
  const marker=(coords,options)=>{
    const record={coords,options}; markerCalls.push(record);
    return {bindTooltip(text) {record.tooltip=text;return this;},addTo() {return this;},on() {return this;}};
  };
  h.window.L={map:()=>map,tileLayer:()=>({addTo() {return this;}}),layerGroup:()=>layer,
    circleMarker:marker,marker,divIcon:options=>options};
  h.document.getElementById=id=>id==='setuStreet' && h.app.state.screen==='map' && h.app.state.mv.mode==='street' ? element : null;
  h.document.createElement=tag=>({tagName:tag});
  h.document.head={appendChild:node=>{if(node.tagName==='script') node.onload?.();}};
  return {map,element,markerCalls};
}

test('wide fit-to-matches cannot trigger a destructive street-to-globe transition', async () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',here:null,spots:[place('east',35),place('west',40,{lng:-73})],
    mv:{...h.app.state.mv,scope:'all',mode:'street',follow:false}};
  const {map,element,markerCalls}=stubLeaflet(h);
  h.app.mvFit=[[35,139],[40,-73]];
  await h.app.drawStreet(element);
  assert.equal(map.fits.length,1); assert.equal(map.zoom,4);
  assert.equal(h.app.state.mv.mode,'street','programmatic wide fit must stay in street mode');
  assert.equal(h.app.lmap,map); assert.equal(map.removed,false); assert.equal(markerCalls.length,2);
  assert.ok(!h.app.mapFitting,'fit suppression must be cleared after the fit');
  map.emit('zoomend');
  assert.equal(h.app.state.mv.mode,'street','a repeated programmatic zoom finish must not enter the globe');
  map.zoom=6; map.emit('zoomstart'); map.zoom=5; map.emit('zoomend');
  assert.equal(h.app.state.mv.mode,'globe','a later deliberate zoom-out crossing still supports the globe transition');
  assert.equal(map.removed,true);
  h.dispose();
});

test('late all-source and DAY OFF coordinates refit only until the user deliberately pans or zooms', async () => {
  for(const source of ['all','dayoff']) for(const interaction of ['dragstart','zoomstart']) {
    const h=harness();
    h.app.state={...h.app.state,screen:'map',cloud:false};
    const {map}=stubLeaflet(h);
    h.app.selectMapSource(source); await h.flush();
    assert.equal(map.fits.length,0);
    h.app.setState({cloud:true,spots:[place('first',35,{by:'DAY OFF #1'})]}); await h.flush();
    const fitFlag=source === 'dayoff' ? 'dayOffAutoFit' : 'planningAutoFit';
    assert.equal(map.fits.length,1); assert.equal(h.app[fitFlag],true,'programmatic fit zoom must not cancel pending-data handling');
    h.app.setState({spots:[...h.app.state.spots,place('later',39,{by:'DAY OFF #2'})]}); await h.flush();
    assert.equal(map.fits.length,2); assert.equal(map.fits[1].coords.length,2);
    map.emit(interaction);
    assert.equal(h.app[fitFlag],false,`${source}: ${interaction} owns the viewport from now on`);
    h.app.setState({spots:[...h.app.state.spots,place('last',42,{by:'DAY OFF #3'})]}); await h.flush();
    assert.equal(map.fits.length,2,'data refresh must preserve the intentionally chosen viewport');
    assert.equal(h.app.renderVals().mapPanned,true,'Search this area remains available after either interaction');
    assert.equal(h.watches.size,0); h.dispose();
  }
});

test('viewport search ignores malformed bounds without replacing the existing scope', async () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',mv:{...h.app.state.mv,scope:'all',mode:'street',follow:false}};
  const {map,element}=stubLeaflet(h); await h.app.drawStreet(element);
  for(const bounds of [{south:36,north:35,west:139,east:140},{south:35,north:36,west:NaN,east:140}]) {
    map.bounds=bounds; h.app.searchMapCenter();
    assert.equal(h.app.state.mv.scope,'all');
  }
  assert.equal(h.watches.size,0); h.dispose();
});
