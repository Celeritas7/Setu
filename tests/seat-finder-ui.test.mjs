import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Test the deployed runtime by default, or the current decoded template while editing.
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE,'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime?.includes('openSeatFinder'),'standalone finder is present in the delivered runtime');
const script = new vm.Script(`${runtime}\n;globalThis.__seatFinderTest = {Component};`);
const NOW = '2026-11-15T11:00:00+09:00';
const HUB_A = {id:'alpha',name:'Alpha',prefecture:'Saitama',lat:35.861,lng:139.645,radius_m:700,themes:[]};
const HUB_B = {id:'beta',name:'Beta',prefecture:'Saitama',lat:35.979,lng:139.611,radius_m:700,themes:[]};
const HUB_T = {id:'gamma',name:'Gamma',prefecture:'Tokyo',lat:35.682,lng:139.763,radius_m:700,themes:[]};
const weekHours = () => Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[['09:00','18:00']]]));
const item = (id,extra={}) => ({id,name:`Place ${id}`,hubId:HUB_A.id,lat:HUB_A.lat+0.001,lng:HUB_A.lng,
  accepted:true,status:'try',themes:['sit-long'],hours:weekHours(),stay_limit_min:0,...extra});
const plain = value => JSON.parse(JSON.stringify(value));
const ids = rows => Array.from(rows,row=>row.id);
const rowKeys = rows => Array.from(rows,row=>row.key);
const event = value => ({target:{value}});

function fixture({foods,spots=[],hubs=[{...HUB_A},{...HUB_B},{...HUB_T}],extra={}}={}) {
  let clock = new Date(NOW).getTime();
  const writes=[], storage=new Map(), scrolls=[];
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  class DCLogic { setState(patch) { this.state={...this.state,...(typeof patch==='function'?patch(this.state):patch)}; } }
  const window={scrollTo(...args){scrolls.push(args);},open(){},addEventListener(){},removeEventListener(){},
    setu:{save(...args){writes.push(args);throw new Error('Browsing or making a draft must not save automatically');}}};
  const context=vm.createContext({DCLogic,Date:ClockDate,Intl,URL,URLSearchParams,console,window,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    document:{getElementById(){return null;},hidden:false},navigator:{},
    setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},
    fetch(){throw new Error('Seating finder tests must not make external requests');}});
  script.runInContext(context);
  const app=new context.__seatFinderTest.Component();
  app.state={...app.state,cloud:true,user:{id:'synthetic-user'},hubs,
    foods:foods || Array.from({length:11},(_,i)=>item(`seat-${String(i).padStart(2,'0')}`,{spend:i*100,spendSeen:'2026-11-01'})),
    spots,screen:'home',hubId:null,wx:[],fc:{},...extra};
  return {app,writes,storage,scrolls,setNow:value=>{clock=new Date(value).getTime();}};
}

function openAt(app,{hub=HUB_A,date='2026-11-15',time='11:00'}={}) {
  app.openSeatFinder(hub.id);
  app.renderVals().onSeatDate(event(date));
  app.renderVals().onSeatTime(event(time));
  return app.renderVals();
}

function assertNoWrites(h) {
  assert.equal(h.writes.length,0,'no remote save');
  assert.equal(h.storage.size,0,'no local data mutation');
}

test('home shortcut and navigation menu open the finder without creating a draft or saving', () => {
  for(const entry of ['home','menu']) {
    const h=fixture(), app=h.app, before=JSON.stringify({foods:app.state.foods,spots:app.state.spots,outings:app.state.outings});
    app.state.menuOpen=true;
    const values=app.renderVals();
    if(entry==='home') values.openSitFinder();
    else {
      const link=values.menuLinks.find(link=>link.label==='Find a place to sit');
      assert.ok(link); link.go();
    }
    assert.equal(app.state.screen,'seat'); assert.equal(app.state.menuOpen,false); assert.equal(app.state.od,null);
    const view=app.renderVals();
    assert.equal(view.isSeatFinder,true); assert.equal(view.seatDate,'2026-11-15'); assert.equal(view.seatTime,'11:00');
    assert.equal(view.seatRows.length,0); assert.equal(view.seatHubDisabled,true);
    assert.match(view.seatEmptyText,/Choose a prefecture and area hub/);
    assert.equal(JSON.stringify({foods:app.state.foods,spots:app.state.spots,outings:app.state.outings}),before);
    assert.ok(h.scrolls.length); assertNoWrites(h);
  }
  const home=template.slice(template.indexOf('<!-- HOME -->'),template.indexOf('<!-- SEATING FINDER:'));
  assert.match(home,/<button[^>]+class="area-shortcut"[^>]+sc-camel-on-click="\{\{ openSitFinder \}\}"/);
});

test('finder starts on the selected home prefecture but never selects a hub or shows all places', () => {
  const h=fixture({extra:{homePrefecture:'saitama'}});
  h.app.renderVals().openSitFinder();
  const view=h.app.renderVals();
  assert.equal(view.seatPrefecture,'saitama'); assert.equal(view.seatHubId,'');
  assert.deepEqual(ids(view.seatHubs),['alpha','beta']); assert.equal(view.seatRows.length,0);
  assert.equal(h.app.state.od,null); assertNoWrites(h);
});

test('deleted or hidden hub shortcuts safely open the chooser without selecting that hub', () => {
  for(const hub of [{...HUB_A,deleted_at:'2026-11-14'},{...HUB_A,themes:['sick-day']}]) {
    const h=fixture({hubs:[hub]});
    assert.doesNotThrow(()=>h.app.openSeatFinder(hub.id));
    const view=h.app.renderVals();
    assert.equal(h.app.state.screen,'seat'); assert.equal(view.seatHubId,''); assert.equal(view.seatRows.length,0);
    assert.equal(h.app.state.od,null); assertNoWrites(h);
  }
});

test('prefecture then area selection scopes choices and rejects cross-prefecture hub values', () => {
  const foods=[item('a'),item('b',{hubId:HUB_B.id,lat:HUB_B.lat,lng:HUB_B.lng}),item('t',{hubId:HUB_T.id,lat:HUB_T.lat,lng:HUB_T.lng})];
  const h=fixture({foods}), app=h.app;
  app.openSeatFinder();
  assert.deepEqual(ids(app.renderVals().seatPrefectures),['saitama','tokyo']);
  app.renderVals().onSeatPrefecture(event('saitama'));
  let view=app.renderVals(); assert.deepEqual(ids(view.seatHubs),['alpha','beta']);
  view.onSeatHub(event('gamma')); assert.equal(app.renderVals().seatHubId,'');
  app.renderVals().onSeatHub(event('alpha'));
  assert.deepEqual(rowKeys(app.renderVals().seatRows),['food:a']);
  app.renderVals().onSeatPrefecture(event('tokyo'));
  view=app.renderVals(); assert.deepEqual(ids(view.seatHubs),['gamma']); assert.equal(view.seatHubId,''); assert.equal(view.seatRows.length,0);
  view.onSeatHub(event('gamma')); assert.deepEqual(rowKeys(app.renderVals().seatRows),['food:t']);
  const before=plain(app.state.seatSearch);
  app.renderVals().onSeatPrefecture(event('not-a-prefecture'));
  assert.deepEqual(plain(app.state.seatSearch),before);
  app.renderVals().onSeatPrefecture(event('')); view=app.renderVals();
  assert.equal(view.seatHubDisabled,true); assert.equal(view.seatRows.length,0); assertNoWrites(h);
});

test('hub entry selects its prefecture, keeps previous search settings and offers a hub return link', () => {
  const h=fixture(), app=h.app;
  openAt(app,{date:'2026-11-20',time:'13:15'});
  app.renderVals().onSeatPrice(event('1000')); app.renderVals().seatNext();
  app.state.screen='hub'; app.state.hubId=HUB_T.id;
  app.renderVals().hbOpenSeatFinder();
  let view=app.renderVals();
  assert.equal(view.seatPrefecture,'tokyo'); assert.equal(view.seatHubId,'gamma');
  assert.equal(view.seatDate,'2026-11-20'); assert.equal(view.seatTime,'13:15'); assert.equal(view.seatPrice,'1000');
  assert.equal(app.state.seatSearch.page,0); assert.equal(app.state.od,null);
  assert.match(view.seatCrumb,/Tokyo.*Gamma.*13:15 JST/);
  view.seatOpenHub(); assert.equal(app.state.screen,'hub'); assert.equal(app.state.hubId,'gamma'); assert.equal(app.state.from,'seat');
  assertNoWrites(h);
});

test('Open area hub then Back returns to the finder with its date, time, price and page intact', () => {
  const h=fixture(), app=h.app;
  openAt(app,{date:'2026-11-20',time:'13:15'}).onSeatPrice(event('1000'));
  app.renderVals().seatNext();
  const before=plain(app.state.seatSearch), rowsBefore=rowKeys(app.renderVals().seatRows);
  assert.equal(before.page,1); assert.equal(before.price,'1000');
  app.renderVals().seatOpenHub();
  assert.equal(app.state.screen,'hub'); assert.equal(app.state.from,'seat'); assert.equal(app.state.hubId,HUB_A.id);
  const hub=app.renderVals(); assert.equal(hub.showBack,true); assert.equal(hub.backLabel,'Find a place to sit');
  hub.back();
  const restored=app.renderVals();
  assert.equal(app.state.screen,'seat'); assert.equal(restored.isSeatFinder,true);
  assert.deepEqual(plain(app.state.seatSearch),before);
  assert.equal(restored.seatDate,'2026-11-20'); assert.equal(restored.seatTime,'13:15'); assert.equal(restored.seatPrice,'1000');
  assert.deepEqual(rowKeys(restored.seatRows),rowsBefore); assert.match(restored.seatCount,/6–10 of 11/);
  assert.equal(app.state.od,null); assertNoWrites(h);
});

test('recorded price filters retain distinct minimum/estimate labels and disclose excluded unknowns', () => {
  const h=fixture({foods:[item('minimum',{min_order_yen:500}),item('estimate',{spend:500,spendSeen:'2026-11-01'}),
    item('over',{spend:1000}),item('unpriced')]});
  let view=openAt(h.app);
  assert.equal(view.seatRows.length,4);
  view.onSeatPrice(event('500')); view=h.app.renderVals();
  assert.deepEqual(rowKeys(view.seatRows),['food:minimum','food:estimate']);
  assert.match(view.seatCount,/1 unpriced not shown/);
  assert.equal(view.seatRows[0].costText,'Minimum order: ¥500');
  assert.equal(view.seatRows[1].costText,'Estimated visit budget: ~¥500');
  assert.match(view.seatRows[1].costDetail,/not a confirmed seating fee or minimum order.*2026-11-01/);
  view.onSeatPrice(event('known')); view=h.app.renderVals(); assert.equal(view.seatRows.length,3);
  assert.ok(view.seatRows.every(row=>row.costAmount!=null));
  view.onSeatPrice(event('invalid')); view=h.app.renderVals();
  assert.equal(view.seatPrice,'all'); assert.equal(view.seatRows.length,4); assert.doesNotMatch(view.seatCount,/unpriced not shown/);
  assertNoWrites(h);
});

test('an unknown-only price result explains how to include unpriced places again', () => {
  const h=fixture({foods:[item('unpriced')]});
  openAt(h.app).onSeatPrice(event('known'));
  let view=h.app.renderVals(); assert.equal(view.seatEmpty,true); assert.equal(view.seatRows.length,0);
  assert.match(view.seatEmptyText,/no recorded price.*All prices/i); assert.match(view.seatCount,/1 unpriced not shown/);
  view.onSeatPrice(event('all')); view=h.app.renderVals(); assert.equal(view.seatRows.length,1);
  assert.equal(view.seatRows[0].costText,'Price unknown'); assertNoWrites(h);
});

test('results paginate five at a time and date, time, price, prefecture and hub changes reset the page', () => {
  const h=fixture(), app=h.app;
  let view=openAt(app);
  assert.equal(view.seatRows.length,5); assert.match(view.seatCount,/1–5 of 11/);
  assert.equal(view.seatHasPrev,false); assert.equal(view.seatHasNext,true);
  view.seatNext(); view=app.renderVals(); assert.equal(view.seatRows.length,5); assert.match(view.seatCount,/6–10 of 11/);
  view.seatNext(); view=app.renderVals(); assert.equal(view.seatRows.length,1); assert.match(view.seatCount,/11–11 of 11/);
  assert.equal(view.seatHasNext,false); view.seatPrev(); assert.equal(app.state.seatSearch.page,1);
  for(const [key,value] of [['onSeatDate','2026-11-20'],['onSeatTime','13:00'],['onSeatPrice','known'],['onSeatHub','beta'],['onSeatPrefecture','tokyo']]) {
    app.state.seatSearch={...app.state.seatSearch,page:2,msg:'Old message'};
    app.renderVals()[key](event(value));
    assert.equal(app.state.seatSearch.page,0,key); assert.equal(app.state.seatSearch.msg,'',key);
  }
  assert.equal(app.state.od,null); assertNoWrites(h);
});

test('bad date or time shows a helpful empty state and cannot create a draft from a stale card', () => {
  for(const [field,bad] of [['onSeatTime','24:00'],['onSeatTime',''],['onSeatTime','9:00'],['onSeatDate','2026-02-30'],['onSeatDate','']]) {
    const h=fixture({foods:[item('seat')]}), app=h.app;
    const old=openAt(app).seatRows[0];
    app.renderVals()[field](event(bad));
    const view=app.renderVals(); assert.equal(view.seatRows.length,0); assert.equal(view.seatEmpty,true);
    assert.match(view.seatEmptyText,/valid date and start time/);
    old.add(); assert.equal(app.state.od,null); assert.equal(app.state.screen,'seat');
    assert.match(app.renderVals().seatMessage,/option changed/); assertNoWrites(h);
  }
});

test('only explicit Plan with this place creates a typed draft for the checked date and time', () => {
  for(const type of ['food','spot']) {
    const h=fixture({foods:[item('same')],spots:[item('same')]}), app=h.app;
    const view=openAt(app,{date:'2026-11-20',time:'13:15'});
    assert.equal(app.state.od,null);
    const row=view.seatRows.find(row=>row.key===type+':same'); assert.ok(row);
    assert.equal(row.addLabel,'Plan with this place'); row.add();
    assert.equal(app.state.screen,'plan'); assert.equal(app.state.od.id,null); assert.equal(app.state.od.rev,null);
    assert.equal(app.state.od.hubId,HUB_A.id); assert.equal(app.state.od.date,'2026-11-20'); assert.equal(app.state.od.sitTime,'13:15');
    assert.equal(app.state.od.sitOpen,true); assert.deepEqual(plain(app.state.od.stops),[{t:type,id:'same'}]);
    assert.match(app.state.od.msg,/new draft.*Save day.*not reserved/);
    assert.equal(app.state.outings.length,0); assert.equal(app.state.foods[0].status,'try'); assert.equal(app.state.spots[0].status,'try');
    row.add(); assert.deepEqual(plain(app.state.od.stops),[{t:type,id:'same'}]); assertNoWrites(h);
  }
});

test('an existing unsaved or saved day survives finder browsing and Open current day unchanged', () => {
  for(const id of [null,'existing-day']) {
    const od={id,rev:id?7:null,date:'2026-12-01',hubId:'beta',title:'Existing notes',rainy:true,status:'planned',
      stops:[{t:'food',id:'keep'}],sitTime:'14:45',sitPage:2,sitOpen:false,busy:false,msg:'Keep draft'};
    const h=fixture({extra:{od}}), app=h.app, before=plain(od);
    let view=openAt(app,{date:'2026-11-20',time:'13:15'});
    assert.deepEqual(plain(app.state.od),before);
    view.onSeatPrice(event('known')); view=app.renderVals();
    assert.deepEqual(plain(app.state.od),before); assert.equal(view.seatRows[0].addLabel,'Open current day');
    view.seatRows[0].add(); assert.equal(app.state.screen,'plan');
    for(const key of Object.keys(before).filter(key=>key!=='msg')) assert.deepEqual(plain(app.state.od[key]),before[key],key);
    assert.match(app.state.od.msg,/current draft is still here/); assertNoWrites(h);
  }
});

test('an in-progress save guards stale seating actions without altering the existing day', () => {
  const od={id:'saving-day',rev:2,date:'2026-11-15',hubId:'alpha',stops:[{t:'food',id:'keep'}],busy:true,sitTime:'11:00'};
  const h=fixture({extra:{od}}), app=h.app, before=plain(od);
  const view=openAt(app); assert.equal(view.seatRows[0].addLabel,'Saving…');
  view.seatRows[0].add(); assert.equal(app.state.screen,'seat');
  assert.deepEqual(plain(app.state.od),before); assertNoWrites(h);
});

test('stale cards recheck acceptance, status, seating limit, hours and selected hub at click time', () => {
  for(const patch of [{accepted:false},{status:'skip'},{deleted_at:'2026-11-15'},{stay_limit_min:60},{hours:{sun:[]}}]) {
    const h=fixture({foods:[item('stale')]}), app=h.app;
    const old=openAt(app).seatRows[0];
    app.state.foods=[{...app.state.foods[0],...patch}]; old.add();
    assert.equal(app.state.od,null); assert.equal(app.state.screen,'seat');
    assert.match(app.renderVals().seatMessage,/option changed/); assertNoWrites(h);
  }
  const h=fixture({foods:[item('old-hub')]}), app=h.app;
  const old=openAt(app).seatRows[0]; app.renderVals().onSeatHub(event('beta')); old.add();
  assert.equal(app.state.od,null); assert.match(app.renderVals().seatMessage,/option changed/); assertNoWrites(h);
});

test('a stale finder card cannot create a draft after its hub has been deleted', () => {
  const h=fixture({foods:[item('old-hub')]}), app=h.app;
  const old=openAt(app).seatRows[0];
  app.state.hubs=app.state.hubs.map(hub=>hub.id===HUB_A.id?{...hub,deleted_at:'2026-11-15'}:hub);
  old.add();
  assert.equal(app.state.od,null); assert.equal(app.state.screen,'seat');
  assert.match(app.renderVals().seatMessage,/option changed/); assertNoWrites(h);
});

test('unknown hours stay unconfirmed and a known too-short selected-time window is excluded', () => {
  const h=fixture({foods:[item('unknown',{hours:null}),item('closing',{hours:{sun:[['09:00','12:30']]}})]});
  let view=openAt(h.app);
  assert.equal(view.seatRows.length,2);
  assert.match(view.seatRows.find(row=>row.key==='food:unknown').shortStatus,/needs confirmation/);
  const old=view.seatRows.find(row=>row.key==='food:closing');
  view.onSeatTime(event('11:01')); view=h.app.renderVals();
  assert.deepEqual(rowKeys(view.seatRows),['food:unknown']); old.add();
  assert.equal(h.app.state.od,null); assert.match(h.app.renderVals().seatMessage,/option changed/); assertNoWrites(h);
});

test('every standalone finder template binding resolves and actions/links have safe types', () => {
  const h=fixture({foods:[item('seat',{spend:500,spendSeen:'2026-11-01',source_url:'https://example.org/policy',confidence:'reviews',last_checked:'2026-11-14'})],
    spots:[item('toilet',{name:'Saved toilet',themes:['toilet'],lat:HUB_A.lat+0.0015})]});
  const view=openAt(h.app), markup=template.match(/<section class="area-stack" aria-label="Find a place to sit">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(markup); assert.equal(view.seatRows.length,1); assert.equal(view.isSeatFinder,true);
  const aliases={sr:view.seatRows[0],pg:view.seatPrefectures[0],hg:view.seatHubs[0]};
  for(const match of markup.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const expression=match[1]; if(['true','false'].includes(expression)) continue;
    const parts=expression.split('.'); let value=Object.hasOwn(aliases,parts[0])?aliases:view;
    for(const part of parts) { assert.ok(value!=null && part in Object(value),`missing finder binding ${expression}`); value=value[part]; }
    assert.notEqual(value,undefined,expression);
    const prefix=markup.slice(Math.max(0,match.index-60),match.index);
    if(/sc-camel-on-(click|change)="\s*$/.test(prefix)) assert.equal(typeof value,'function',expression);
    if(/href="\s*$/.test(prefix)) assert.match(value,/^https?:\/\//,expression);
  }
  assert.match(markup,/A visit estimate is not a minimum order or a guaranteed total/);
  assert.match(markup,/<details><summary>Price, seating &amp; sources<\/summary>/);
  assertNoWrites(h);
});
