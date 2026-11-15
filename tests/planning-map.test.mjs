import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the same runtime that is shipped, with only browser/network boundaries stubbed.
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE, 'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime, 'actual embedded Setu runtime is present');
const SCRIPT = new vm.Script(`${runtime}\n;globalThis.__planningTest = {Component,nearbyMapModel,mapFreshPhone,MAP_RADII};`);
const T0 = Date.UTC(2026, 10, 15, 5, 0, 0);

function harness({permission = 'granted', noGeolocation = false} = {}) {
  let clock = T0, nextWatch = 0, nextTimer = 1;
  const watches = new Map(), cleared = [], timers = new Map(), storage = new Map(), oneShots = [], opened = [];
  const documentListeners = new Map(), windowListeners = new Map();
  const counts = {permissionQueries:0, changes:0, dbWrites:0};
  let permissionReply = () => Promise.resolve({state:permission});
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const localStorage = {
    getItem:key => storage.get(key) ?? null,
    setItem:(key,value) => storage.set(key,String(value)),
    removeItem:key => storage.delete(key)
  };
  const document = {
    hidden:false, getElementById:() => null, querySelector:() => null,
    addEventListener:(name,fn) => documentListeners.set(name,fn),
    removeEventListener:(name,fn) => { if (documentListeners.get(name) === fn) documentListeners.delete(name); }
  };
  const navigator = {
    permissions:{query:() => { counts.permissionQueries++; return permissionReply(); }},
    ...(noGeolocation ? {} : {geolocation:{
      watchPosition:(success,error,options) => { const id=nextWatch++; watches.set(id,{success,error,options}); return id; },
      clearWatch:id => cleared.push(id),
      getCurrentPosition:(success,error,options) => oneShots.push({success,error,options})
    }})
  };
  const window = {
    localStorage, scrollTo:() => {}, open:(...args) => opened.push(args),
    addEventListener:(name,fn) => windowListeners.set(name,fn),
    removeEventListener:(name,fn) => { if (windowListeners.get(name) === fn) windowListeners.delete(name); },
    setu:{onAuth:() => () => {}, save:() => { counts.dbWrites++; throw new Error('Map controls must not write records'); }}
  };
  class DCLogic {
    setState(patch) {
      this.state = {...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch)};
      counts.changes++;
      if (this.__mounted) this.componentDidUpdate();
    }
  }
  const context = vm.createContext({
    DCLogic,document,navigator,window,localStorage,Date:ClockDate,console,URL,URLSearchParams,
    setInterval:(fn,ms) => { const id=nextTimer++; timers.set(id,{fn,ms}); return id; },
    clearInterval:id => timers.delete(id),
    setTimeout:(fn,ms) => { const id=nextTimer++; timers.set(id,{fn,ms}); return id; },
    clearTimeout:id => timers.delete(id),
    fetch:() => { throw new Error('Regression tests must not make network requests'); }
  });
  SCRIPT.runInContext(context);
  const api = context.__planningTest, app = new api.Component();
  app.__mounted = true;
  app.componentDidMount();
  return {
    ...api,app,document,window,watches,cleared,timers,storage,oneShots,opened,counts,
    advance:ms => { clock += ms; },
    setPermissionReply:fn => { permissionReply = fn; },
    async flush() { for(let i=0;i<6;i++) await Promise.resolve(); },
    async enter() { app.openPlanningMap(); await this.flush(); },
    async visibility(hidden) { document.hidden=hidden; documentListeners.get('visibilitychange')?.(); await this.flush(); },
    emit(id,{lat=35,lng=139,accuracy=10,at=clock}={}) {
      watches.get(id).success({coords:{latitude:lat,longitude:lng,accuracy},timestamp:at});
    },
    fail(id,code) { watches.get(id).error({code}); },
    dispose() { app.componentWillUnmount(); app.__mounted=false; }
  };
}

const place = (id,lat=35.001,extra={}) => ({id,name:`Place ${id}`,lat,lng:139,status:'try',accepted:true,themes:[],...extra});
const ids = rows => Array.from(rows,row=>row.id);
const sourceState = extra => ({sick:false,foods:[],foodSugg:[],spots:[],hubs:[],here:null,hereSrc:'none',mv:{scope:'all',source:'all',tag:'all'},...extra});

test('Map starts with all areas and never requests or watches location just to plan', async () => {
  for(const permission of ['granted','prompt','denied']) {
    const h=harness({permission});
    assert.equal(h.app.state.mv.scope,'all');
    assert.equal(h.app.state.mv.follow,false);
    await h.enter();
    for(let i=0;i<3;i++) h.app.setState({mapTick:i});
    await h.visibility(true); await h.visibility(false);
    h.app.setState({screen:'home'}); await h.enter();
    assert.equal(h.counts.permissionQueries,0,`${permission}: planning must not query phone permission`);
    assert.equal(h.watches.size,0); assert.equal(h.oneShots.length,0);
    assert.equal(h.app.mapLocationActive(),false);
    const view=h.app.renderVals();
    assert.equal(view.mapAreaName,'All areas');
    assert.match(view.mapLocationLabel,/planning.*no.*limit/i);
    assert.equal(view.mapHasLocationHelp,false);
    assert.equal(h.nearbyMapModel(h.app.state).needsLocation,false);
    assert.equal(h.nearbyMapModel(h.app.state).radiusActive,false);
    assert.equal(h.counts.dbWrites,0); assert.equal(h.storage.size,0);
    h.dispose();
  }
});

test('ordinary and DAY OFF planning options are not clipped by an old room fix or radius', () => {
  const h=harness(), s=sourceState({
    here:{lat:35,lng:139,at:T0,accuracy:10},hereSrc:'phone',mapLoc:'live',
    mv:{scope:'all',radiusKm:1,source:'all',tag:'all',bounds:{south:34.99,north:35.01,west:138.99,east:139.01}},
    foods:[place('near-cafe',35.001,{themes:['cafe']})],
    spots:[place('distant-sight',40,{themes:['jinja']}),place('dayoff-trip',42,{by:'DAY OFF #5'})]
  });
  const model=h.nearbyMapModel(s,T0);
  assert.deepEqual(ids(model.nearby).sort(),['dayoff-trip','distant-sight','near-cafe']);
  assert.ok(model.nearby.every(row=>row.distanceKm===null),'planning does not manufacture a distance from the room');
  assert.equal(model.needsLocation,false); assert.equal(model.radiusActive,false);
  assert.equal(model.facets.cafe,1); assert.equal(model.facets.jinja,1);
  const absentScope=h.nearbyMapModel({...s,mv:{source:'all',tag:'all'}},T0);
  assert.equal(absentScope.scope,'all','missing spatial state must fall back to planning, never GPS');
  assert.equal(absentScope.nearby.length,3);
  h.dispose();
});

test('larger 50 km and 100 km radii use their actual distances rather than falling back to 3 km', () => {
  const h=harness(), s=sourceState({
    hubs:[{id:'selected-hub',name:'Selected hub',lat:35,lng:139}],
    spots:[place('close',35.01),place('about-44-km',35.4),place('about-78-km',35.7),place('about-111-km',36)],
    mv:{scope:'area',areaId:'selected-hub',radiusKm:50,source:'all',tag:'all'}
  });
  assert.ok(h.MAP_RADII.includes(50)); assert.ok(h.MAP_RADII.includes(100));
  const fifty=h.nearbyMapModel(s,T0);
  assert.equal(fifty.radius,50); assert.equal(fifty.radiusActive,true);
  assert.deepEqual(ids(fifty.nearby),['close','about-44-km']);
  const hundred=h.nearbyMapModel({...s,mv:{...s.mv,radiusKm:100}},T0);
  assert.equal(hundred.radius,100);
  assert.deepEqual(ids(hundred.nearby),['close','about-44-km','about-78-km']);
  assert.ok(h.app.mapRadiusZoom(100)<h.app.mapRadiusZoom(25),'wider distances receive a wider camera view');
  assert.ok(h.app.mapRadiusZoom(50)<h.app.mapRadiusZoom(25));
  h.dispose();
});

test('planning preserves skipped/deleted/sick gating and keeps unknown-coordinate options reachable', () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',cloud:true,spots:[
    place('far',42),place('unplaced',null),place('skip',36,{status:'skip'}),
    place('deleted',36,{deleted_at:'2026-01-01'}),place('sick-only',36,{themes:['sick-day']})
  ]};
  const model=h.nearbyMapModel(h.app.state,T0);
  assert.deepEqual(ids(model.nearby),['far']); assert.deepEqual(ids(model.unplaced),['unplaced']);
  assert.equal(model.unplaced[0].distanceKm,undefined);
  const view=h.app.renderVals();
  assert.equal(view.mapHasPending,true); view.mapPendingToggle();
  assert.equal(h.app.renderVals().mapRows[0].name,'Place unplaced');
  h.app.renderVals().mapPendingToggle();
  assert.equal(h.app.renderVals().mapRows[0].name,'Place far');
  assert.equal(h.counts.dbWrites,0);
  h.dispose();
});

test('planning remains usable without geolocation support or a phone fix', async () => {
  const h=harness({noGeolocation:true});
  h.app.setState({cloud:true,spots:[place('distant-plan',41)]});
  await h.enter();
  const view=h.app.renderVals();
  assert.equal(view.mapRows[0].name,'Place distant-plan');
  assert.equal(view.mapHasLocationHelp,false);
  assert.doesNotMatch(view.mapLocationLabel,/blocked|unavailable|permission|locating/i);
  assert.doesNotMatch(view.mapMatchText,/waiting|3 km/i);
  assert.equal(h.counts.permissionQueries,0); assert.equal(h.watches.size,0);
  h.dispose();
});

test('initial all-source planning camera fits distant destinations rather than the room', async () => {
  const h=harness();
  h.app.setState({cloud:true,here:{lat:0,lng:0,accuracy:10,at:T0},hereSrc:'phone',
    spots:[place('first',35),place('far',42)]});
  await h.enter();
  assert.equal(h.app.state.mv.mode,'street','first planning view must draw ordinary place pins without zooming the globe');
  assert.deepEqual(Array.from(h.app.mvFit ?? [],p=>Array.from(p)).sort((a,b)=>a[0]-b[0]),[[35,139],[42,139]],
    'fit includes all destinations, not the cached room fix');
  assert.equal(h.watches.size,0);
  h.app.mvFit=null; // simulate the renderer consuming this command
  h.app.setState({mapTick:T0+1});
  assert.equal(h.app.mvFit,null,'ordinary renders must not repeatedly override the chosen camera');
  h.dispose();
});

test('No limit clears every spatial restriction while retaining source, type and picked places', () => {
  for(const source of ['all','dayoff']) for(const scope of ['near','area','center','viewport']) {
    const h=harness(), picked=[{t:'spot',id:'near-cafe'}];
    const spots=[place('near-cafe',35.001,{by:'DAY OFF #1',themes:['cafe']}),
      place('far-cafe',42,{by:'DAY OFF #2',themes:['cafe']}),place('other-type',43,{themes:['jinja']})];
    h.app.state={...h.app.state,screen:'map',cloud:true,spots,
      here:{lat:35,lng:139,accuracy:10,at:T0},hereSrc:'phone',mapLoc:'live',
      hubs:[{id:'old-area',name:'Old area',lat:35,lng:139}],layers:{places:false,friends:true},
      mv:{...h.app.state.mv,scope,source,tag:'cafe',radiusKm:3,areaId:'old-area',center:{lat:35,lng:139},
        bounds:{south:34.99,north:35.01,west:138.99,east:139.01},follow:true,panned:true,page:8,
        pendingOpen:true,resultsOpen:false,sel:{key:'old'},picked}};
    h.app.mvFit=[[1,2]]; h.app.mvView={lat:1,lng:2,z:16}; h.app.gJump={lat:1,lng:2,k:1};
    h.app.mvWantHere=true; h.app.mapAskNext=true;
    const action=h.app.renderVals().mapAllAreas;
    assert.equal(typeof action,'function','No limit is an actual renderVals action'); action();
    const mv=h.app.state.mv, model=h.nearbyMapModel(h.app.state,T0);
    assert.equal(mv.scope,'all'); assert.equal(mv.follow,false); assert.equal(mv.panned,false);
    assert.equal(mv.areaId,null); assert.equal(mv.center,null); assert.equal(mv.bounds,null);
    assert.equal(mv.source,source); assert.equal(mv.tag,'cafe'); assert.equal(mv.picked,picked);
    assert.equal(mv.page,0); assert.equal(mv.pendingOpen,false); assert.equal(mv.sel,null);
    assert.equal(mv.resultsOpen,true); assert.equal(h.app.state.layers.places,true);
    assert.equal(h.app.mvView,null); assert.equal(h.app.gJump,null);
    assert.ok(!h.app.mvWantHere); assert.ok(!h.app.mapAskNext);
    assert.equal(model.radiusActive,false); assert.equal(model.needsLocation,false);
    assert.deepEqual(ids(model.nearby).sort(),['far-cafe','near-cafe']);
    assert.deepEqual(Array.from(h.app.mvFit ?? [],p=>Array.from(p)).sort((a,b)=>a[0]-b[0]),[[35.001,139],[42,139]]);
    assert.equal(h.app.state.spots,spots); assert.equal(h.counts.dbWrites,0); assert.equal(h.storage.size,0);
    assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0);
    h.dispose();
  }
});

test('Near me is opt-in and No limit stops its watcher and ignores late location callbacks', async () => {
  const h=harness({permission:'prompt'});
  h.app.setState({cloud:true,spots:[place('near',35.001),place('far',42)]});
  await h.enter();
  assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0);
  h.app.renderVals().mapNearMe(); await h.flush();
  assert.equal(h.app.state.mv.scope,'near'); assert.equal(h.app.state.mv.follow,true);
  assert.equal(h.watches.size,1); assert.equal(h.app.state.mv.radiusKm,3);
  h.emit(0); assert.deepEqual(ids(h.nearbyMapModel(h.app.state,T0).nearby),['near']);
  h.app.renderVals().mapAllAreas(); await h.flush();
  assert.equal(h.app.mapWatch,null); assert.ok(h.cleared.includes(0)); assert.equal(h.timers.size,0);
  const here=h.app.state.here,fit=h.app.mvFit,before=h.counts.changes;
  h.advance(60000); h.emit(0,{lat:36,lng:140});
  assert.equal(h.app.state.here,here); assert.equal(h.app.mvFit,fit); assert.equal(h.app.mvView,null);
  assert.equal(h.counts.changes,before); assert.equal(h.app.state.mv.scope,'all');
  await h.visibility(true); await h.visibility(false);
  h.app.setState({screen:'home'}); await h.enter();
  assert.equal(h.watches.size,1,'returning to planning never restarts the old watcher');
  assert.equal(h.counts.dbWrites,0); h.dispose();
});

test('a deferred permission reply after No limit cannot restart location following', async () => {
  const h=harness(); await h.enter(); h.app.useNearMe(); await h.flush();
  assert.equal(h.watches.size,1);
  await h.visibility(true);
  let resolve;
  h.setPermissionReply(()=>new Promise(r=>{resolve=r;}));
  await h.visibility(false);
  assert.equal(typeof resolve,'function','resuming explicit Near me rechecks permission asynchronously');
  h.app.showAllMapPlaces();
  resolve({state:'granted'}); await h.flush();
  assert.equal(h.app.state.mv.scope,'all'); assert.equal(h.app.state.mv.follow,false);
  assert.equal(h.app.mapWatch,null); assert.equal(h.app.mapStarting,false);
  assert.equal(h.watches.size,1,'the old watch remains stopped'); assert.equal(h.timers.size,0);
  h.dispose();
});

test('all-source overview includes data arriving later but stops refitting after a destination is opened', async () => {
  const h=harness(); await h.enter();
  assert.equal(h.app.mvFit,null);
  h.app.setState({cloud:true,spots:[place('first',35),place('far',42)]});
  assert.equal(h.app.mvFit?.length,2);
  h.app.mvFit=null;
  h.app.setState({spots:[...h.app.state.spots].reverse()});
  assert.equal(h.app.mvFit,null,'a reordered cloud response is not a different destination set');
  h.app.setState({spots:[...h.app.state.spots,place('later',44)]});
  assert.equal(h.app.mvFit?.length,3);
  h.app.renderVals().mapRows[0].go();
  const view=h.app.mvView;
  assert.ok(view); assert.equal(h.app.mvFit,null);
  h.app.setState({spots:[...h.app.state.spots,place('after-choice',45)]});
  assert.equal(h.app.mvView,view); assert.equal(h.app.mvFit,null,'late data must not override a deliberate destination choice');
  assert.equal(h.counts.dbWrites,0); h.dispose();
});

test('50 km and 100 km controls update a selected area without starting GPS', () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',cloud:true,hubs:[{id:'chosen',name:'Chosen hub',lat:35,lng:139}],
    spots:[place('within-50',35.4),place('within-100',35.7)],
    mv:{...h.app.state.mv,scope:'area',areaId:'chosen',radiusKm:3,follow:false}};
  for(const radius of [50,100]) {
    const control=h.app.renderVals().mapRadii.find(x=>x.label===`${radius} km`);
    assert.ok(control); control.go();
    assert.equal(h.app.state.mv.radiusKm,radius); assert.equal(h.app.state.mv.scope,'area');
    assert.equal(h.nearbyMapModel(h.app.state,T0).radius,radius);
    assert.match(h.app.renderVals().mapFilterLabel,new RegExp(`${radius} km`));
  }
  assert.equal(h.nearbyMapModel(h.app.state,T0).nearby.length,2);
  assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0); assert.equal(h.counts.dbWrites,0);
  h.dispose();
});

test('a finite radius from planning or viewport uses the visible map center, never the room GPS', () => {
  for(const scope of ['all','viewport']) {
    const h=harness();
    h.app.state={...h.app.state,screen:'map',cloud:true,
      here:{lat:35,lng:139,accuracy:10,at:T0},hereSrc:'phone',mapLoc:'live',
      mv:{...h.app.state.mv,scope,mode:'street',bounds:{south:35.9,north:36.1,west:139.9,east:140.1}}};
    h.app.lmap={getCenter:()=>({lat:36,lng:140}),remove:()=>{}};
    h.app.lmapEl=null;
    h.app.setMapRadius(50);
    assert.equal(h.app.state.mv.scope,'center'); assert.equal(h.app.state.mv.radiusKm,50);
    assert.equal(h.app.state.mv.center.lat,36); assert.equal(h.app.state.mv.center.lng,140);
    assert.equal(h.app.state.mv.bounds,null); assert.equal(h.app.state.mv.follow,false);
    assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0);
    h.dispose();
  }
});

test('finite radius with no available map center asks for an area without requesting GPS', () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',mv:{...h.app.state.mv,scope:'all',mode:'street'}};
  h.app.setMapRadius(100);
  assert.equal(h.app.state.mv.scope,'all'); assert.equal(h.app.state.mv.areaOpen,true);
  assert.equal(h.nearbyMapModel(h.app.state,T0).radiusActive,false);
  assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0); assert.equal(h.oneShots.length,0);
  h.dispose();
});

test('opening Map for a new planning session does not carry over an earlier nearby radius', async () => {
  const h=harness(); await h.enter(); h.app.useNearMe(); await h.flush(); h.emit(0);
  h.app.setState({spots:[place('distant-plan',42)],screen:'home',mv:{...h.app.state.mv,radiusKm:1}});
  assert.ok(h.cleared.includes(0));
  await h.enter();
  assert.equal(h.app.state.screen,'map'); assert.equal(h.app.state.mv.scope,'all');
  assert.equal(h.app.state.mv.follow,false); assert.equal(h.watches.size,1);
  assert.deepEqual(ids(h.nearbyMapModel(h.app.state,T0).nearby),['distant-plan']);
  assert.equal(h.nearbyMapModel(h.app.state,T0).radiusActive,false);
  h.dispose();
});

test('a late Home one-shot fix cannot recenter an all-area planning view', async () => {
  const h=harness();
  h.app.locate(); assert.equal(h.oneShots.length,1);
  h.app.setState({cloud:true,spots:[place('plan',42)]}); await h.enter();
  const fit=h.app.mvFit;
  h.oneShots[0].success({coords:{latitude:35,longitude:139,accuracy:20},timestamp:T0});
  assert.equal(h.app.state.mv.scope,'all'); assert.equal(h.app.state.mv.follow,false);
  assert.equal(h.app.mvFit,fit); assert.equal(h.app.mvView,null);
  assert.equal(h.watches.size,0); assert.equal(h.counts.dbWrites,0);
  h.dispose();
});

test('No limit is exposed in the mode controls and Filters, without a false selected 3 km chip', async () => {
  const h=harness(); await h.enter();
  const view=h.app.renderVals();
  assert.equal(view.mapIsPlanning,true); assert.equal(view.mapIsNear,false);
  assert.match(view.mapFilterLabel,/No limit/);
  assert.deepEqual(Array.from(view.mapRadii,r=>r.label),['No limit','1 km','3 km','5 km','10 km','25 km','50 km','100 km']);
  assert.equal(view.mapRadii[0].bg,'#111111');
  assert.equal(view.mapRadii[0].active,true);
  assert.equal(view.mapRadii.find(r=>r.label==='3 km').bg,'#FFFFFF','remembered travel radius is not an active planning filter');
  assert.equal(view.mapRadii.find(r=>r.label==='3 km').active,false);
  const markup=template.match(/<!-- MAP -->([\s\S]*?)<!-- PLACE TO EAT -->/)?.[1];
  assert.ok(markup);
  assert.match(markup,/sc-camel-on-click="\{\{ mapAllAreas \}\}"[^>]*aria-pressed="\{\{ mapIsPlanning \}\}"/);
  assert.match(markup,/sc-for list="\{\{ mapRadii \}\}"/);
  assert.match(markup,/aria-pressed="\{\{ rad.active \}\}"/,'distance choices expose their state to assistive technology');
  assert.doesNotMatch(markup,/<sc-if value="\{\{ mapRadiusVisible \}\}"/,'distance controls must not disappear in no-limit mode');
  h.app.state.mv={...h.app.state.mv,scope:'center',center:{lat:35,lng:139},radiusKm:100};
  assert.equal(h.app.renderVals().mapRadii.find(r=>r.label==='100 km').active,true);
  assert.equal(h.app.renderVals().mapRadii[0].active,false);
  h.app.renderVals().mapRadii[0].go();
  assert.equal(h.app.state.mv.scope,'all'); assert.equal(h.app.renderVals().mapIsPlanning,true);
  h.dispose();
});

test('a map center on a wrapped world is normalized before a manual radius is applied', () => {
  const h=harness();
  h.app.state={...h.app.state,screen:'map',mv:{...h.app.state.mv,scope:'all',mode:'street'}};
  h.app.lmap={getCenter:()=>({lat:35,lng:499}),remove:()=>{}};
  h.app.lmapEl=null;
  h.app.setMapRadius(100);
  assert.equal(h.app.state.mv.scope,'center'); assert.equal(h.app.state.mv.center.lat,35);
  assert.equal(h.app.state.mv.center.lng,139);
  assert.equal(h.nearbyMapModel(h.app.state,T0).needsLocation,false);
  assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0);
  h.dispose();
});

test('Home Map link and menu Map action both reset earlier travel state into planning', async () => {
  for(const entry of ['home','menu']) {
    const h=harness(), picked=[{t:'spot',id:'far-cafe'}];
    await h.enter(); h.app.useNearMe(); await h.flush(); h.emit(0);
    h.app.setState({screen:entry==='home'?'home':'plan',menuOpen:true,cloud:true,
      spots:[place('far-cafe',42,{themes:['cafe']})],
      mv:{...h.app.state.mv,radiusKm:1,tag:'cafe',picked}});
    const view=h.app.renderVals();
    if(entry==='home') view.goMap();
    else view.menuLinks.find(link=>link.label==='Map').go();
    await h.flush();
    assert.equal(h.app.state.screen,'map'); assert.equal(h.app.state.mv.scope,'all');
    assert.equal(h.app.state.mv.follow,false); assert.equal(h.app.state.mv.tag,'cafe');
    assert.equal(h.app.state.mv.picked,picked); assert.equal(h.app.state.menuOpen,false);
    assert.deepEqual(ids(h.nearbyMapModel(h.app.state,T0).nearby),['far-cafe']);
    assert.equal(h.watches.size,1,'only the original explicitly requested watch existed');
    assert.ok(h.cleared.includes(0)); assert.equal(h.counts.dbWrites,0);
    h.dispose();
  }
});

test('detail Back returns to the existing explicit nearby context instead of resetting to planning', async () => {
  for(const detail of ['food','hub']) {
    const h=harness(), picked=[{t:'food',id:'meal'}];
    h.app.setState({cloud:true,foods:[place('meal',35.001,{hubId:'chosen',themes:['cafe']})],
      hubs:[{id:'chosen',name:'Chosen hub',lat:35.002,lng:139,themes:[]}]});
    await h.enter(); h.app.useNearMe(); await h.flush(); h.emit(0);
    h.app.setMapRadius(50);
    h.app.setState({mv:{...h.app.state.mv,tag:'cafe',picked,page:1,sel:{key:detail==='food'?'fmeal':'hchosen'}}});
    const before=h.app.state.mv;
    const view=h.app.renderVals();
    assert.equal(view.msHasOpen,true); view.msOpen();
    assert.equal(h.app.state.screen,detail==='food'?'place':'hub');
    const back=h.app.renderVals(); assert.equal(back.backLabel,'Map'); back.back(); await h.flush();
    assert.equal(h.app.state.screen,'map'); assert.equal(h.app.state.mv.scope,'near');
    assert.equal(h.app.state.mv.radiusKm,50); assert.equal(h.app.state.mv.tag,'cafe');
    assert.equal(h.app.state.mv.picked,picked); assert.equal(h.app.state.mv.sel,before.sel);
    assert.equal(h.app.state.mv.page,1); assert.equal(h.app.state.mv.follow,before.follow);
    assert.equal(h.watches.size,2,'return to explicit travel context may resume its existing permission');
    assert.equal(h.counts.dbWrites,0); h.dispose();
  }
});

test('widening a nearby radius with an expired fix clears stale camera commands until a fresh fix arrives', async () => {
  for(const radius of [50,100]) {
    const h=harness(), picked=[{t:'spot',id:'saved-choice'}];
    await h.enter(); h.app.useNearMe(); await h.flush(); h.emit(0);
    h.app.setState({mv:{...h.app.state.mv,source:'dayoff',tag:'cafe',picked}});
    h.advance(300001);
    assert.equal(h.mapFreshPhone(h.app.state),false);
    assert.equal(h.nearbyMapModel(h.app.state).anchor,null);
    h.app.mvView={lat:42,lng:140,z:16};
    h.app.setMapRadius(radius);
    assert.equal(h.app.mvView,null,'an expired phone fix must not leave an old fly-to command queued');
    assert.equal(h.app.state.mv.scope,'near'); assert.equal(h.app.state.mv.radiusKm,radius);
    assert.equal(h.app.state.mv.follow,true); assert.equal(h.nearbyMapModel(h.app.state).needsLocation,true);
    assert.equal(h.app.state.mv.source,'dayoff'); assert.equal(h.app.state.mv.tag,'cafe');
    assert.equal(h.app.state.mv.picked,picked);
    assert.equal(h.watches.size,1,'changing a radius keeps the explicit watcher rather than making a new request');
    h.emit(0,{lat:35.02,lng:139.02});
    assert.equal(h.mapFreshPhone(h.app.state),true);
    assert.equal(h.nearbyMapModel(h.app.state).needsLocation,false);
    assert.equal(h.app.mvView.lat,35.02); assert.equal(h.app.mvView.lng,139.02);
    assert.equal(h.app.mvView.z,h.app.mapRadiusZoom(radius));
    assert.equal(h.app.state.mv.source,'dayoff'); assert.equal(h.app.state.mv.tag,'cafe');
    assert.equal(h.app.state.mv.picked,picked); assert.equal(h.counts.dbWrites,0);
    h.dispose();
  }
});

test('denied Near me recovers into unrestricted planning without retrying location', async () => {
  const h=harness({permission:'denied'}), picked=[{t:'spot',id:'distant'}];
  h.app.setState({cloud:true,spots:[place('distant',42,{themes:['cafe']})],
    mv:{...h.app.state.mv,tag:'cafe',picked}});
  await h.enter(); h.app.renderVals().mapNearMe(); await h.flush();
  assert.equal(h.watches.size,1); h.fail(0,1); await h.flush();
  assert.equal(h.app.state.mapLoc,'denied');
  assert.equal(h.app.renderVals().mapHasLocationHelp,true);
  h.app.renderVals().mapAllAreas(); await h.flush();
  let view=h.app.renderVals();
  assert.equal(view.mapIsPlanning,true); assert.equal(view.mapHasLocationHelp,false);
  assert.deepEqual(ids(h.nearbyMapModel(h.app.state).nearby),['distant']);
  assert.equal(h.app.state.mv.picked,picked); assert.equal(h.app.state.mv.tag,'cafe');
  assert.doesNotMatch(view.mapLocationLabel,/blocked|permission|waiting/i);
  const here=h.app.state.here, fit=h.app.mvFit;
  h.emit(0,{lat:35.01}); h.fail(0,3);
  assert.equal(h.app.state.here,here); assert.equal(h.app.mvFit,fit);
  assert.equal(h.app.state.mapLoc,'denied','late failures are ignored as well as late successes');
  await h.visibility(true); await h.visibility(false);
  h.app.setState({screen:'home'}); h.app.renderVals().goMap(); await h.flush();
  view=h.app.renderVals();
  assert.equal(view.mapIsPlanning,true); assert.equal(view.mapHasLocationHelp,false);
  assert.equal(h.watches.size,1,'planning never retries the denied watch');
  assert.equal(h.oneShots.length,0); assert.equal(h.counts.permissionQueries,0);
  assert.equal(h.counts.dbWrites,0); h.dispose();
});

test('invalid radius inputs cannot mutate spatial mode, filters, picks or queued camera work', () => {
  for(const scope of ['all','near','area','center','viewport']) {
    const h=harness();
    h.app.state={...h.app.state,screen:'map',mv:{...h.app.state.mv,scope,source:'dayoff',tag:'cafe',radiusKm:50,
      areaId:'chosen',center:{lat:35,lng:139},bounds:{south:34,north:36,west:138,east:140},
      picked:[{t:'spot',id:'saved'}],page:2,follow:scope==='near'}};
    h.app.mvFit=[[35,139],[42,139]]; h.app.mvView={lat:36,lng:140,z:9}; h.app.gJump={lat:35,lng:139,k:1};
    const before=h.app.state, fit=h.app.mvFit, view=h.app.mvView, jump=h.app.gJump;
    for(const invalid of [undefined,null,false,true,0,-1,2,101,Infinity,NaN,'50',{},[]]) {
      h.app.setMapRadius(invalid);
      assert.equal(h.app.state,before,`${scope}: ${String(invalid)} is not a supported numeric radius`);
      assert.equal(h.app.mvFit,fit); assert.equal(h.app.mvView,view); assert.equal(h.app.gJump,jump);
    }
    assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0); assert.equal(h.counts.dbWrites,0);
    h.dispose();
  }
});

test('switching sources while travelling keeps the chosen radius and picks without restarting GPS', async () => {
  const h=harness(), picked=[{t:'spot',id:'ordinary'}];
  h.app.setState({cloud:true,spots:[place('ordinary',35.4,{themes:['cafe']}),
    place('episode',35.7,{by:'DAY OFF #8',themes:['cafe']})]});
  await h.enter(); h.app.selectMapSource('dayoff');
  h.app.setState({mv:{...h.app.state.mv,tag:'cafe',picked}});
  h.app.useNearMe(); await h.flush(); h.emit(0); h.app.setMapRadius(100);
  const watch=h.app.mapWatch;
  assert.deepEqual(ids(h.nearbyMapModel(h.app.state).nearby),['episode']);
  h.app.renderVals().mapSources.find(x=>x.label==='All sources').go(); await h.flush();
  assert.equal(h.app.state.mv.scope,'near'); assert.equal(h.app.state.mv.radiusKm,100);
  assert.equal(h.app.state.mv.tag,'cafe'); assert.equal(h.app.state.mv.picked,picked);
  assert.equal(h.app.mapWatch,watch); assert.equal(h.watches.size,1);
  assert.deepEqual(ids(h.nearbyMapModel(h.app.state).nearby),['ordinary','episode']);
  h.app.showAllMapPlaces(); await h.flush();
  assert.equal(h.app.state.mv.radiusKm,100,'No limit remembers but disables the travel radius');
  assert.equal(h.nearbyMapModel(h.app.state).radiusActive,false);
  assert.equal(h.app.state.mv.source,'all'); assert.equal(h.app.state.mv.picked,picked);
  h.app.useNearMe(); await h.flush();
  assert.equal(h.app.state.mv.radiusKm,100); assert.equal(h.app.state.mv.scope,'near');
  assert.equal(h.app.state.mv.tag,'cafe'); assert.equal(h.app.state.mv.picked,picked);
  assert.equal(h.watches.size,2,'only the later explicit Near me starts the second watch');
  assert.equal(h.counts.dbWrites,0); h.dispose();
});

test('map picks transfer intact into the merged budget-aware draft and survive Home/Map navigation', async () => {
  const h=harness();
  const foods=[place('paid-cafe',42,{hubId:'trip-area',spend:750,themes:['cafe']})];
  const spots=[place('unknown-sight',42.01,{hubId:'trip-area',kind:'see'})];
  h.app.setState({cloud:true,foods,spots,hubs:[{id:'trip-area',name:'Trip area',prefecture:'Saitama',lat:42,lng:139,themes:[]}],
    wvBudgetLimit:'1000',wvBudgetGroup:'unknown',wvBudgetSort:'price'});
  await h.enter();
  for(const name of ['Place paid-cafe','Place unknown-sight']) {
    h.app.renderVals().mapRows.find(row=>row.name===name).go();
    const selected=h.app.renderVals(); assert.equal(selected.msCanPick,true); selected.msPick();
  }
  const picked=JSON.parse(JSON.stringify(h.app.state.mv.picked));
  assert.deepEqual(picked,[{t:'food',id:'paid-cafe'},{t:'spot',id:'unknown-sight'}]);
  h.app.showAllMapPlaces();
  assert.deepEqual(JSON.parse(JSON.stringify(h.app.state.mv.picked)),picked);
  h.app.renderVals().mpPlan();
  assert.equal(h.app.state.screen,'plan');
  assert.deepEqual(JSON.parse(JSON.stringify(h.app.state.od.stops)),picked);
  assert.deepEqual(Array.from(h.app.state.mv.picked),[],'the selected stops have transferred into the draft');
  const draft=h.app.state.od, view=h.app.renderVals();
  assert.match(view.odTotals,/2 stops/); assert.match(view.odTotals,/750/); assert.match(view.odTotals,/1 unknown/i);
  assert.match(view.odBudgetNote,/transport|travel/i);
  view.back(); assert.equal(h.app.state.screen,'home');
  h.app.renderVals().goMap(); await h.flush();
  assert.equal(h.app.state.screen,'map'); assert.equal(h.app.state.mv.scope,'all');
  assert.equal(h.app.state.od,draft,'returning to Map must not replace an unsaved budget-aware day');
  assert.equal(h.app.state.wvBudgetLimit,'1000'); assert.equal(h.app.state.wvBudgetGroup,'unknown');
  assert.equal(h.app.state.wvBudgetSort,'price');
  assert.equal(h.app.state.foods,foods); assert.equal(h.app.state.spots,spots);
  assert.equal(h.watches.size,0); assert.equal(h.counts.permissionQueries,0); assert.equal(h.counts.dbWrites,0);
  h.dispose();
});

test('planning picked places appends typed distinct stops to an existing day without replacing its fields or missing references', () => {
  const h=harness(), originalStops=[{t:'food',id:'old-meal'},{t:'spot',id:'missing-saved-stop'},{t:'food',id:'shared-id'}];
  const original={id:'existing-day',rev:7,date:'2026-11-28',hubId:'original-hub',title:'Keep my day',status:'planned',
    stops:originalStops,rainy:true,rainManual:true,rainAuto:false,sitOpen:true,sitTime:'15:45',sitPage:2,
    prefectureId:'saitama',busy:false,confirmDel:false,msg:'Earlier message',customBudgetNote:'Do not discard'};
  const saved=[{...original,stops:originalStops.slice()}];
  const picked=[{t:'food',id:'shared-id'},{t:'spot',id:'shared-id'},{t:'food',id:'new-meal'},{t:'food',id:'new-meal'}];
  h.app.state={...h.app.state,screen:'map',cloud:true,od:original,outings:saved,
    foods:[place('old-meal'),place('shared-id'),place('new-meal')],spots:[place('shared-id')],
    mv:{...h.app.state.mv,picked,sel:{key:'fnew-meal'}}};
  h.app.renderVals().mpPlan();
  assert.equal(h.app.state.screen,'plan');
  assert.deepEqual(JSON.parse(JSON.stringify(h.app.state.od.stops)),[
    ...originalStops,{t:'spot',id:'shared-id'},{t:'food',id:'new-meal'}]);
  for(const key of Object.keys(original).filter(key=>!['stops','msg'].includes(key)))
    assert.deepEqual(h.app.state.od[key],original[key],`existing draft field ${key} is preserved`);
  assert.deepEqual(originalStops,[{t:'food',id:'old-meal'},{t:'spot',id:'missing-saved-stop'},{t:'food',id:'shared-id'}]);
  assert.equal(h.app.state.outings,saved,'the saved cloud plan is not changed by a draft append');
  assert.deepEqual(Array.from(h.app.state.mv.picked),[]);
  assert.equal(h.app.state.mv.sel,null);
  assert.match(h.app.state.od.msg,/added|draft|existing/i);
  assert.equal(h.counts.dbWrites,0); h.dispose();
});

test('busy, visited and cancelled days refuse map-pick appends without losing either day stops or picks', () => {
  for(const mode of ['busy','done','cancelled']) {
    const h=harness(), stops=[{t:'spot',id:'missing'}], picked=[{t:'food',id:'new-meal'}];
    const day={id:'existing-day',rev:3,date:'2026-11-01',hubId:'saved-area',status:mode==='busy'?'planned':mode,
      stops,busy:mode==='busy',rainy:true,title:'Preserve this day',msg:''};
    h.app.state={...h.app.state,screen:'map',cloud:true,od:day,foods:[place('new-meal')],mv:{...h.app.state.mv,picked}};
    h.app.renderVals().mpPlan();
    assert.equal(h.app.state.od.stops,stops,`${mode}: stop references remain unchanged`);
    assert.equal(h.app.state.mv.picked,picked,`${mode}: choices remain available for another day`);
    assert.equal(h.app.state.od.id,day.id); assert.equal(h.app.state.od.date,day.date);
    assert.equal(h.app.state.od.status,day.status); assert.equal(h.app.state.od.busy,day.busy);
    assert.ok(h.app.state.od.msg,'the blocked action must explain itself');
    assert.equal(h.counts.dbWrites,0); h.dispose();
  }
});

// Minimal eventful Leaflet boundary: exercise navigation and camera event ordering
// without a browser, map tiles, paid discovery or a database.
function stubStreet(h) {
  const element={id:'setuStreet',clientWidth:360,clientHeight:480}, maps=[], tooltips=[];
  function makeMap() {
    const events=new Map();
    const map={removed:false,center:{lat:35.85,lng:139.65},zoom:11,fits:[],views:[],
      on(name,fn){const rows=events.get(name)||[];rows.push(fn);events.set(name,rows);return this;},
      once(name,fn){const once=(...args)=>{this.off(name,once);fn(...args);};return this.on(name,once);},
      off(name,fn){events.set(name,(events.get(name)||[]).filter(x=>x!==fn));return this;},
      emit(name){for(const fn of [...(events.get(name)||[])])fn();},
      setView(coords,zoom){this.center={lat:coords[0],lng:coords[1]};this.zoom=zoom;this.views.push({coords,zoom});return this;},
      flyTo(coords,zoom){this.emit('zoomstart');this.setView(coords,zoom);this.emit('zoomend');this.emit('moveend');return this;},
      fitBounds(coords,options){this.fits.push({coords,options});this.emit('zoomstart');this.zoom=3;this.emit('zoomend');this.emit('moveend');return this;},
      getCenter(){return this.center;},getZoom(){return this.zoom;},
      getBounds(){return {getSouth:()=>34,getNorth:()=>36,getWest:()=>138,getEast:()=>140};},
      invalidateSize(){assert.equal(this.removed,false);return this;},remove(){this.removed=true;return this;}};
    maps.push(map); return map;
  }
  const marker=()=>({addTo(){return this;},bindTooltip(value){tooltips.push(value);return this;},on(){return this;}});
  h.window.L={map:makeMap,tileLayer:()=>({addTo(){return this;}}),
    layerGroup:()=>({addTo(){return this;},clearLayers(){return this;}}),
    circleMarker:marker,marker,divIcon:options=>options};
  h.document.getElementById=id=>id==='setuStreet' && h.app.state.screen==='map' && h.app.state.mv.mode==='street' ? element : null;
  h.document.createElement=tag=>({tagName:tag});
  h.document.head={appendChild:node=>{if(node.tagName==='script')node.onload?.();}};
  return {element,maps,tooltips};
}

test('camera memory records only the main street map and No limit explicitly resets it', () => {
  const h=harness();
  h.app.lmap={getCenter:()=>({lat:36.25,lng:140.5}),getZoom:()=>12,remove(){}};
  h.app.lmapEl={id:'setuStreet'};
  h.app.rememberMapCamera();
  assert.deepEqual(JSON.parse(JSON.stringify(h.app.mapCamera)),{lat:36.25,lng:140.5,z:12});
  const camera=h.app.mapCamera;
  for(const id of ['setuHubMap','setuPlaceMap','other-map']) {
    h.app.lmapEl={id}; h.app.lmap.getCenter=()=>({lat:42,lng:142}); h.app.lmap.getZoom=()=>17;
    h.app.rememberMapCamera(); assert.equal(h.app.mapCamera,camera,`${id} must not replace main map memory`);
  }
  h.app.showAllMapPlaces(); assert.equal(h.app.mapCamera,null);
  assert.equal(h.counts.dbWrites,0); assert.equal(h.storage.size,0,'camera memory is session-only');
  h.dispose();
});

test('detail Back reconstructs the previous street camera in planning and explicit nearby modes', async () => {
  for(const mode of ['planning','nearby']) {
    const h=harness(); const {maps}=stubStreet(h);
    h.app.setState({cloud:true,foods:[place('meal',35.01,{hubId:'chosen'})],
      hubs:[{id:'chosen',name:'Chosen hub',lat:35.015,lng:139,themes:[]}]});
    await h.enter();
    if(mode==='nearby'){h.app.useNearMe();await h.flush();h.emit(0);await h.flush();}
    const original=h.app.lmap;
    assert.ok(original);
    original.emit('dragstart');
    original.center={lat:35.015,lng:139.012};original.zoom=12;
    h.app.mapTap(h.app.mapPoints().find(p=>p.key==='fmeal'));
    const view=h.app.renderVals();assert.equal(view.msHasOpen,true);view.msOpen();await h.flush();
    assert.equal(original.removed,true);assert.equal(h.app.state.screen,'place');
    assert.equal(h.app.mapCamera.lat,35.015);assert.ok(Math.abs(h.app.mapCamera.lng-139.012)<1e-9);
    assert.equal(h.app.mapCamera.z,12);
    h.app.renderVals().back();await h.flush();
    const restored=h.app.lmap;
    assert.equal(h.app.state.screen,'map');assert.notEqual(restored,original);assert.equal(maps.length,2);
    assert.equal(restored.center.lat,35.015);assert.ok(Math.abs(restored.center.lng-139.012)<1e-9);
    assert.equal(restored.zoom,12);
    assert.equal(h.app.state.mv.scope,mode==='nearby'?'near':'all');
    assert.equal(h.app.state.mv.sel.key,'fmeal');
    assert.equal(h.counts.dbWrites,0);h.dispose();
  }
});

test('street recreation prefers an explicit camera, then remembered camera, then the selected area anchor', async () => {
  const choices=[
    {view:{lat:42,lng:142,z:15},camera:{lat:37,lng:141,z:12},expected:{lat:42,lng:142,z:15}},
    {view:null,camera:{lat:37,lng:141,z:12},expected:{lat:37,lng:141,z:12}},
    {view:null,camera:null,expected:{lat:36,lng:140,z:9}}
  ];
  for(const choice of choices) {
    const h=harness(),{element}=stubStreet(h);
    h.app.state={...h.app.state,screen:'map',hubs:[{id:'selected',name:'Selected area',lat:36,lng:140,themes:[]}],
      mv:{...h.app.state.mv,scope:'area',areaId:'selected',radiusKm:50,mode:'street'}};
    h.app.mvView=choice.view;h.app.mapCamera=choice.camera;
    await h.app.drawStreet(element);
    assert.deepEqual(h.app.lmap.center,{lat:choice.expected.lat,lng:choice.expected.lng});
    assert.equal(h.app.lmap.zoom,choice.expected.z);
    assert.equal(h.watches.size,0);h.dispose();
  }
});

test('zooming into a wide fitted map never enters the globe, but zooming out across five does', async () => {
  const h=harness(),{element}=stubStreet(h);
  h.app.state={...h.app.state,screen:'map',spots:[place('east',35),place('west',40,{lng:-73})],
    mv:{...h.app.state.mv,scope:'all',mode:'street'}};
  h.app.mvFit=[[35,139],[40,-73]];
  await h.app.drawStreet(element);
  const map=h.app.lmap;
  assert.equal(map.zoom,3);assert.equal(h.app.state.mv.mode,'street');assert.equal(map.removed,false);
  // A repeated finish event and zooming IN from the wide overview do not cross out.
  map.emit('zoomend');assert.equal(h.app.state.mv.mode,'street');
  for(const zoom of [4,5,6]) {
    map.emit('zoomstart');map.zoom=zoom;map.emit('zoomend');
    assert.equal(h.app.state.mv.mode,'street',`zooming in to ${zoom} remains on the street map`);
    assert.equal(map.removed,false);
  }
  map.emit('zoomstart');map.zoom=5;map.emit('zoomend');
  assert.equal(h.app.state.mv.mode,'globe');assert.equal(map.removed,true);
  assert.equal(h.counts.dbWrites,0);h.dispose();
});

test('place, selected-pin and unplaced Maps links never reuse executable or lookalike source URLs', async () => {
  const badUrls=['javascript:alert(1)','data:text/html,<script>alert(1)</script>',
    'https://www.google.com.evil.example/maps/place/cafe','https://evil.example/google.com/maps/cafe',
    'https://user:secret@www.google.com/maps/place/cafe'];
  for(const url of badUrls) {
    const h=harness();
    const record=place('unsafe',35.001,{name:'Fixture café',address:'Fixture address',url});
    h.app.setState({cloud:true,spots:[record]});await h.enter();
    const safe=value=>{
      const parsed=new URL(value);
      assert.equal(parsed.protocol,'https:');assert.ok(['google.com','www.google.com'].includes(parsed.hostname));
      assert.equal(parsed.username,'');assert.equal(parsed.password,'');
      assert.equal(parsed.searchParams.get('query'),'Fixture café Fixture address');
    };
    let view=h.app.renderVals();safe(view.mapRows[0].maps);
    view.mapRows[0].go();safe(h.app.renderVals().msMaps);
    h.app.setState({spots:[{...record,lat:null}],mv:{...h.app.state.mv,sel:null,pendingOpen:true}});
    view=h.app.renderVals();safe(view.mapRows[0].maps);view.mapRows[0].go();
    assert.equal(h.opened.length,1);safe(h.opened[0][0]);
    assert.equal(h.opened[0][1],'_blank');assert.equal(h.opened[0][2],'noopener,noreferrer');
    assert.equal(h.app.state.spots[0].url,url,'display safety does not rewrite stored records');
    assert.equal(h.counts.dbWrites,0);h.dispose();
  }
});

test('ordinary and DAY OFF place names reach Leaflet tooltips as literal text nodes, never HTML strings', async () => {
  const h=harness(),{element,tooltips}=stubStreet(h);
  const label='<img src=x onerror=alert(1)> & café';
  h.app.state={...h.app.state,screen:'map',cloud:true,
    spots:[place('ordinary',35,{name:label}),place('episode',36,{name:label,by:'DAY OFF #8'})],
    mv:{...h.app.state.mv,scope:'all',mode:'street'}};
  await h.app.drawStreet(element);
  assert.equal(tooltips.length,2);
  assert.ok(tooltips.every(x=>typeof x==='object' && x.tagName==='span'));
  assert.deepEqual(tooltips.map(x=>x.textContent).sort(),[label,'📺 DAY OFF · '+label].sort());
  assert.ok(tooltips.every(x=>!Object.hasOwn(x,'innerHTML')));
  const empty=h.app.mapTooltip(null);assert.equal(empty.textContent,'');
  assert.equal(h.counts.dbWrites,0);h.dispose();
});
