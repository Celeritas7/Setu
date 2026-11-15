import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Test the delivered runtime by default. During editing, point to the decoded template.
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE,'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime?.includes('SIT_LONG_HELPERS_START'),'sit-long helpers are present in the actual template');
const script = new vm.Script(`${runtime}\n;globalThis.__sitTest = {normalizeSitFacts,sitLongAvailability,sitLongModel,sitCheckAt,Component};`);
const NOW = new Date('2026-11-15T11:00:00+09:00');
const HUB = {id:'urawa',name:'Urawa',lat:35,lng:139,radius_m:700,themes:[]};
const allDay = () => Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(d=>[d,[['00:00','24:00']]]));
const item = (id,extra={}) => ({id,name:`Place ${id}`,hubId:HUB.id,lat:35.001,lng:139,status:'try',accepted:true,
  themes:['sit-long'],hours:{sun:[['09:00','18:00']]},stay_limit_min:0,...extra});
const plain = value => JSON.parse(JSON.stringify(value));
const keys = rows => Array.from(rows,x=>x.key);
const freeze = x => { if(x && typeof x==='object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };

function harness() {
  let now = NOW.getTime();
  const writes=[], storage=new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length?args:[now])); }
    static now() { return now; }
  }
  class DCLogic { setState(patch) { this.state={...this.state,...(typeof patch==='function'?patch(this.state):patch)}; } }
  const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  const window={scrollTo(){},open(){},addEventListener(){},removeEventListener(){},
    setu:{save(...args){writes.push(args);throw new Error('A sit-long chooser must not save or accept automatically');}}};
  const ctx=vm.createContext({DCLogic,Date:ClockDate,Intl,URL,URLSearchParams,window,localStorage,console,
    document:{getElementById(){return null;},hidden:false},navigator:{},
    setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},
    fetch(){throw new Error('Sit-long tests do not fetch external data');}});
  script.runInContext(ctx);
  return {...ctx.__sitTest,window,writes,storage,setNow:value=>{now=new Date(value).getTime();}};
}
const api=harness();
const model = extra => api.sitLongModel({hub:HUB,at:NOW,now:NOW,foods:[],spots:[],...extra});

test('the complete embedded runtime parses and all Phase G helpers are callable', () => {
  new Function(runtime);
  for(const key of ['normalizeSitFacts','sitLongAvailability','sitLongModel','sitCheckAt']) assert.equal(typeof api[key],'function');
});

test('normalization preserves meaningful zero and false, trims text, and never coerces unknowns into facts', () => {
  const facts=api.normalizeSitFacts({seating_type:'free_seating',min_order:'  one drink  ',min_order_yen:0,stay_limit_min:0,
    outlets:false,wifi:false,quiet:3,smoke_free:'partly',setting:'both',feel:'  By the window  ',confidence:'reviews',last_checked:'2026-11-15'});
  assert.equal(facts.min_order_yen,0); assert.equal(facts.stay_limit_min,0); assert.equal(facts.outlets,false); assert.equal(facts.wifi,false);
  assert.equal(facts.min_order,'one drink'); assert.equal(facts.feel,'By the window'); assert.equal(facts.last_checked,'2026-11-15');
  for(const bad of [null,undefined,'',false,true,-1,NaN,Infinity,'bad',1.2]) {
    const x=api.normalizeSitFacts({min_order_yen:bad,stay_limit_min:bad});
    assert.equal(x.min_order_yen,null); assert.equal(x.stay_limit_min,null);
  }
  const strings=api.normalizeSitFacts({min_order_yen:'300',stay_limit_min:'90',wifi:'false',outlets:0,quiet:4});
  assert.equal(strings.min_order_yen,300); assert.equal(strings.stay_limit_min,90);
  assert.equal(strings.wifi,null); assert.equal(strings.outlets,null); assert.equal(strings.quiet,null);
  assert.ok(Object.values(api.normalizeSitFacts(null)).every(x=>x===null));
});

test('invalid enum values and impossible dates remain unknown', () => {
  const x=api.normalizeSitFacts({seating_type:'free_food',smoke_free:'probably',setting:'covered',confidence:'from reviews',last_checked:'2026-02-30'});
  assert.equal(x.seating_type,null); assert.equal(x.smoke_free,null); assert.equal(x.setting,null); assert.equal(x.confidence,null); assert.equal(x.last_checked,null);
  for(const date of ['2026-13-01','2026-00-01','2026-11-00','2026-04-31','26-11-15','2026-11-15T00:00:00Z'])
    assert.equal(api.normalizeSitFacts({last_checked:date}).last_checked,null);
  assert.equal(api.normalizeSitFacts({last_checked:'2028-02-29'}).last_checked,'2028-02-29');
});

test('strict sitCheckAt parses Japan time, including the UTC previous-day boundary', () => {
  assert.equal(api.sitCheckAt('2026-11-15','00:30').toISOString(),'2026-11-14T15:30:00.000Z');
  assert.equal(api.sitCheckAt('2026-11-15','11:00').toISOString(),'2026-11-15T02:00:00.000Z');
  assert.equal(api.sitCheckAt('2028-02-29','23:59').toISOString(),'2028-02-29T14:59:00.000Z');
  for(const [date,time] of [['2026-02-29','12:00'],['2026-02-30','12:00'],['2026-13-01','12:00'],['2026-11-15','24:00'],
    ['2026-11-15','12:60'],['2026-11-15','9:00'],['','12:00'],['2026-11-15',''],[null,'12:00'],['2026-11-15',null],['2026-11-15T00:00:00Z','12:00']])
    assert.equal(api.sitCheckAt(date,time),null,`${date} ${time} must not roll over or default silently`);
});

test('90 continuous minutes is inclusive but 89m59s is too short', () => {
  const hours={sun:[['09:00','12:30']]};
  const exact=api.sitLongAvailability(hours,NOW); assert.equal(exact.state,'open'); assert.equal(exact.remainingMinutes,90);
  const short=api.sitLongAvailability(hours,new Date(NOW.getTime()+1000));
  assert.equal(short.state,'short'); assert.ok(short.remainingMinutes<90);
  assert.equal(api.sitLongAvailability(hours,new Date('2026-11-15T12:30:00+09:00')).state,'closed');
});

test('previous-day overnight availability remains valid despite today being closed', () => {
  const hours={sat:[['17:00','26:00']],sun:[]};
  const exact=api.sitLongAvailability(hours,new Date('2026-11-15T00:30:00+09:00'));
  assert.equal(exact.state,'open'); assert.equal(exact.remainingMinutes,90); assert.equal(exact.closesAt,'2026-11-14T17:00:00.000Z');
  assert.equal(api.sitLongAvailability(hours,new Date('2026-11-15T00:30:01+09:00')).state,'short');
  assert.equal(api.sitLongAvailability({sat:[['17:00','02:00']],sun:[]},new Date('2026-11-15T00:30:00+09:00')).state,'open');
});

test('split shifts do not bridge a gap; overlaps and adjacent intervals do combine', () => {
  assert.equal(api.sitLongAvailability({sun:[['09:00','12:00'],['13:00','18:00']]},NOW).state,'short');
  const overlap=api.sitLongAvailability({sun:[['09:00','12:00'],['11:00','15:00']]},NOW);
  assert.equal(overlap.state,'open'); assert.equal(overlap.remainingMinutes,240);
  assert.equal(api.sitLongAvailability({sun:[['09:00','12:00'],['12:00','15:00']]},NOW).remainingMinutes,240);
  const midnight=api.sitLongAvailability({sun:[['22:00','24:00']],mon:[['00:00','03:00']]},new Date('2026-11-15T23:30:00+09:00'));
  assert.equal(midnight.state,'open'); assert.equal(midnight.remainingMinutes,210);
});

test('all-week 24-hour availability has no invented closing at the scan horizon', () => {
  const open=api.sitLongAvailability(allDay(),NOW);
  assert.equal(open.state,'open'); assert.equal(open.alwaysOpen,true); assert.equal(open.closesAt,null);
  const row=model({foods:[item('24h',{hours:allDay()})]})[0];
  assert.match(row.hoursText,/24-hour opening recorded/); assert.doesNotMatch(row.hoursText,/until|closes/i);
  const withBreak=allDay(); withBreak.wed=[['09:00','24:00']];
  const limited=api.sitLongAvailability(withBreak,NOW);
  assert.equal(limited.alwaysOpen,false); assert.equal(limited.closesAt,'2026-11-17T15:00:00.000Z');
});

test('schedule evaluation uses Japan weekday/time, not the process timezone', () => {
  const at=new Date('2026-11-14T23:30:00Z'); // Sunday08:30 in Japan, still Saturday in UTC
  assert.equal(api.sitLongAvailability({sat:[['00:00','24:00']],sun:[['09:00','18:00']]},at).state,'closed');
  assert.equal(api.sitLongAvailability({sun:[['08:00','18:00']]},at).state,'open');
  assert.equal(api.sitLongAvailability({sun:[['08:00','18:00']],mon:[]},new Date('2026-11-16T11:00:00+09:00')).state,'closed');
});

test('unknown, malformed and closing-only hours never establish a proven 90-minute stay', () => {
  for(const hours of [null,{},[],{sun:null},{sun:'09:00-18:00'},{sun:[[null,'18:00']]},{sun:[['09:00',null]]},
    {sun:[['bad','18:00']]},{sun:[['09:00','99:00']]},{sun:[['09:00','09:00']]},{sun:[['09:00','18:00','extra']]}])
    assert.equal(api.sitLongAvailability(hours,NOW).state,'unknown');
  assert.equal(api.sitLongAvailability({sun:[]},NOW).state,'closed');
  for(const at of [null,new Date('invalid'),'bad',false]) assert.equal(api.sitLongAvailability(allDay(),at).state,'unknown');
});

test('the model includes only saved accepted sit-long rows and obeys status and sick mode', () => {
  const foods=[item('ok'),item('suggestion',{accepted:false}),item('skip',{status:'skip'}),item('deleted',{deleted_at:'2026-11-14'}),
    item('ordinary',{themes:['cafe']}),item('sick',{themes:['sit-long','sick-day']})];
  assert.deepEqual(keys(model({foods})),['food:ok']);
  assert.deepEqual(keys(model({foods,sick:true})),['food:ok','food:sick']);
  assert.equal(model({foods,hub:{...HUB,themes:['sick-day']}}).length,0);
  assert.equal(model({foods,hub:null}).length,0);
  assert.equal(model({foods:[],spots:[item('spot')]})[0].x._t,'spot');
});

test('food hub matching preserves explicit links and the existing to-try/go-back proximity rules', () => {
  const foods=[item('linked-far',{lat:40,status:'done',again:'no'}),item('near-try',{hubId:'other',lat:35.005}),
    item('near-no-return',{hubId:'other',status:'done',again:'no'}),item('near-return',{hubId:'other',status:'done',again:'yes'}),
    item('area-only',{hubId:'other',lat:null,lng:null,area:'East Urawa'}),item('elsewhere',{hubId:'other',lat:40,area:'Tokyo'})];
  assert.deepEqual(new Set(keys(model({foods}))),new Set(['food:linked-far','food:near-try','food:near-return','food:area-only']));
  assert.deepEqual(keys(model({spots:[item('linked'),item('unlinked',{hubId:'other'})]})),['spot:linked']);
  assert.equal(model({foods:[item('raw-hub',{hubId:null,hub_id:HUB.id})]}).length,1);
});

test('known short visits are excluded; unknown limits are included but explicitly unconfirmed', () => {
  const foods=[item('short-limit',{stay_limit_min:89}),item('short-hours',{hours:{sun:[['09:00','12:00']]}}),
    item('closed',{hours:{sun:[]}}),item('exact-limit',{stay_limit_min:90}),item('unknown-limit',{stay_limit_min:null}),item('unknown-hours',{hours:null})];
  const rows=model({foods});
  assert.equal(rows.length,3); assert.ok(rows.every(r=>!['short-limit','short-hours','closed'].includes(r.x.id)));
  const unknown=rows.find(r=>r.x.id==='unknown-limit'); assert.equal(unknown.eligibility,'unconfirmed'); assert.match(unknown.stayText,/unknown.*confirm/i);
  assert.equal(rows.find(r=>r.x.id==='exact-limit').eligibility,'eligible');
  assert.equal(rows.at(-1).x.id,'unknown-hours'); assert.match(rows.at(-1).hoursText,/unknown.*confirm/i);
});

test('sort order prioritizes known hours, smoke-free, known minimum cost, quiet and known distance', () => {
  const foods=[item('unknown-hours',{hours:null,smoke_free:'yes',min_order_yen:0,quiet:3}),
    item('smoking-free',{smoke_free:'no',min_order_yen:0,quiet:3}),
    item('cost-unknown',{smoke_free:'yes',min_order_yen:null,quiet:3}),
    item('cheap',{smoke_free:'yes',min_order_yen:100,quiet:1,lat:36}),
    item('loud',{smoke_free:'yes',min_order_yen:200,quiet:1}),
    item('quiet-far',{smoke_free:'yes',min_order_yen:200,quiet:3,lat:36}),
    item('quiet-near',{smoke_free:'yes',min_order_yen:200,quiet:3}),
    item('quiet-no-pin',{smoke_free:'yes',min_order_yen:200,quiet:3,lat:null,lng:null}),
    item('quiet-unknown',{smoke_free:'yes',min_order_yen:200,quiet:null})];
  assert.deepEqual(keys(model({foods})),['food:cheap','food:quiet-near','food:quiet-far','food:quiet-no-pin','food:loud','food:quiet-unknown','food:cost-unknown','food:smoking-free','food:unknown-hours']);
});

test('zero cost and unlimited stay are different from unknown; facilities retain explicit no', () => {
  const zero=model({foods:[item('zero',{min_order_yen:0,stay_limit_min:0,wifi:false,outlets:false})]})[0];
  assert.match(zero.costText,/¥0/); assert.match(zero.stayText,/limit: none/); assert.match(zero.facilitiesText,/Wi-Fi: no/); assert.match(zero.facilitiesText,/Power: no/);
  const unknown=model({foods:[item('unknown',{min_order_yen:null,stay_limit_min:null,wifi:null,outlets:null})]})[0];
  assert.match(unknown.costText,/unknown/); assert.doesNotMatch(unknown.costText,/¥0|free/i);
  assert.match(unknown.stayText,/unknown/); assert.match(unknown.facilitiesText,/Wi-Fi: unknown/);
  assert.match(zero.hoursText,/^Recorded hours cover/);
});

test('free seating never becomes an outside-food permission', () => {
  const free=model({foods:[item('free',{seating_type:'free_seating'})]})[0];
  assert.match(free.seatingText,/outside food not confirmed/); assert.doesNotMatch(free.seatingText,/Own food allowed/);
  const own=model({spots:[item('own',{seating_type:'own_food_ok'})]})[0]; assert.match(own.seatingText,/Own food allowed \(recorded\)/);
});

test('conservative beef-focused filtering avoids milk, burdock, negative claims and vegan venue false positives', () => {
  const names=['牛乳カフェ','牛蒡茶屋','Beef-free Cafe','No beef Cafe','Vegan Steakhouse','Vegetarian Steakhouse'];
  const allowed=names.map((name,i)=>item(`safe-${i}`,{name}));
  allowed.push(item('mixed-menu',{name:'General Cafe',dish:'Beef and chicken curry options'}));
  const excluded=[item('wagyu',{name:'Wagyu Kitchen'}),item('beef',{dish:'Beef curry'}),item('cutlet',{name:'牛カツ専門店'}),item('tagged',{themes:['sit-long','beef-focused']})];
  assert.deepEqual(new Set(keys(model({foods:[...allowed,...excluded]}))),new Set(allowed.map(x=>'food:'+x.id)));
});

test('policy claims remain recorded facts with safe source links and valid non-future check dates', () => {
  const row=model({foods:[item('source',{confidence:'confirmed',source_url:'https://example.org/policy',last_checked:'2026-11-14'})]})[0];
  assert.match(row.policyText,/Recorded as confirmed/); assert.equal(row.policyUrl,'https://example.org/policy');
  for(const extra of [{url:'javascript:alert(1)'},{url:'https://user:password@example.org/'},{url:'/relative'},
    {url:'https://example.org/',last_checked:'2027-01-01'},{url:'https://example.org/',last_checked:'2026-02-30'}]) {
    const p=model({foods:[item('unknown',{confidence:'confirmed',last_checked:'2026-11-14',...extra})]})[0];
    assert.match(p.policyText,/Policy unverified/); assert.doesNotMatch(p.policyText,/Invalid Date|Recorded as confirmed/);
  }
  const reviews=model({foods:[item('reviews',{confidence:'reviews',url:'http://example.org/review',last_checked:'2026-01-01'})]})[0];
  assert.match(reviews.policyText,/Policy unverified.*from reviews.*may be out of date/);
  assert.equal(reviews.policyUrl,'http://example.org/review');
});

test('nearest saved toilet requires an explicit tag and valid coordinates without promising access', () => {
  const toilets=[item('untagged',{name:'Toilet',themes:[],lat:35.0011}),item('invalid',{themes:['toilet'],lng:181}),
    item('skipped',{themes:['toilet'],status:'skip',lat:35.0012}),item('suggested',{themes:['toilet'],accepted:false,lat:35.0012}),
    item('sick',{themes:['toilet','sick-day'],lat:35.0012}),item('near',{name:'Station toilet',themes:['toilet'],lat:35.0015}),
    item('far',{name:'Other toilet',themes:['toilet'],lat:35.01})];
  const row=model({foods:[item('seat')],spots:toilets})[0];
  assert.match(row.toiletText,/Station toilet.*straight-line.*access not confirmed/);
  assert.doesNotMatch(row.toiletText,/free|public|inside/i);
  assert.equal(new URL(row.toiletUrl).searchParams.get('query'),'35.0015,139');
  const unknown=model({foods:[item('seat',{lat:null,lng:null})],spots:toilets})[0];
  assert.equal(unknown.toiletUrl,''); assert.match(unknown.toiletText,/distance unknown/);
  const none=model({foods:[item('seat')]})[0]; assert.equal(none.toiletText,'No saved toilet with coordinates');
});

test('typed keys, selected state and original records survive without mutation or automatic acceptance', () => {
  const foods=freeze([item('same',{review:'Original note',url:'https://example.org/'})]);
  const spots=freeze([item('same',{kind:'other'})]); const hub=freeze({...HUB});
  const before=JSON.stringify({foods,spots,hub});
  const rows=model({foods,spots,hub,selectedKeys:new Set(['spot:same'])});
  assert.deepEqual(new Set(keys(rows)),new Set(['food:same','spot:same']));
  assert.equal(rows.find(x=>x.key==='spot:same').selected,true); assert.equal(rows.find(x=>x.key==='food:same').selected,false);
  assert.equal(rows.find(x=>x.key==='food:same').x.review,'Original note');
  assert.equal(JSON.stringify({foods,spots,hub}),before); assert.equal(api.writes.length,0);
  assert.equal(model({foods:[...foods,...foods]}).length,1,'duplicate typed records are not shown twice');
});

function appFixture({foods,spots=[],hubs=[{...HUB}],extra={}}={}) {
  const h=harness(), app=new h.Component();
  app.state={...app.state,cloud:true,user:{id:'unit-test'},hubs,foods:foods||Array.from({length:7},(_,i)=>item(`seat-${i}`,{min_order_yen:i*100})),spots,
    screen:'hub',hubId:HUB.id,wx:[],fc:{},...extra};
  return {...h,app};
}

test('Hub sit-long toggle, five-option pagination and refresh use current Japan time without writes', () => {
  const h=appFixture(), app=h.app;
  assert.equal(app.renderVals().hbSitOn,false); app.renderVals().hbSitToggle();
  let v=app.renderVals(); assert.equal(v.hbSitOn,true); assert.equal(v.hbSitRows.length,5);
  assert.match(v.hbSitWhen,/2026-11-15 at 11:00 JST/); assert.match(v.hbSitCount,/1–5 of 7/);
  assert.equal(v.hbSitHasPrev,false); assert.equal(v.hbSitHasNext,true);
  v.hbSitNext(); v=app.renderVals(); assert.equal(v.hbSitRows.length,2); assert.match(v.hbSitCount,/6–7 of 7/);
  assert.equal(v.hbSitHasNext,false); v.hbSitPrev(); assert.equal(app.state.sitHubPage,0);
  app.renderVals().hbSitNext(); app.renderVals().hbSitRefresh(); assert.equal(app.state.sitHubPage,0);
  app.renderVals().hbSitToggle(); assert.equal(app.renderVals().hbSitRows.length,0);
  assert.equal(app.state.foods.length,7); assert.equal(h.writes.length,0); assert.equal(h.storage.size,0);
  app.state.hubId='another-hub'; assert.equal(app.renderVals().hbSitOn,false);
});

test('Hub refresh removes a formerly eligible card after its continuous 90-minute window passes', () => {
  const h=appFixture({foods:[item('closing',{hours:{sun:[['09:00','12:30']]}})]});
  h.app.renderVals().hbSitToggle(); assert.equal(h.app.renderVals().hbSitRows.length,1);
  h.setNow('2026-11-15T11:01:00+09:00'); h.app.renderVals().hbSitRefresh();
  assert.equal(h.app.renderVals().hbSitRows.length,0); assert.equal(h.app.renderVals().hbSitEmpty,true); assert.equal(h.writes.length,0);
});

test('Plan sit-long chooser resets pagination on time/date changes and preserves existing stops', () => {
  const h=appFixture(), app=h.app;
  app.openOuting(null,{hubId:HUB.id,date:'2026-11-15',sitTime:'11:00',stops:[{t:'food',id:'seat-0'}]});
  const savedStops=plain(app.state.od.stops);
  assert.equal(app.renderVals().odSitOn,false); app.renderVals().odSitToggle();
  let v=app.renderVals(); assert.equal(v.odSitRows.length,5); assert.match(v.odSitWhen,/2026-11-15 at 11:00 JST/);
  assert.equal(v.odSitRows.find(r=>r.key==='food:seat-0').addLabel,'✓ In day');
  v.odSitNext(); assert.equal(app.state.od.sitPage,1); assert.equal(app.renderVals().odSitRows.length,2);
  app.renderVals().onOdSitTime({target:{value:'17:00'}}); v=app.renderVals();
  assert.equal(app.state.od.sitPage,0); assert.equal(v.odSitRows.length,0); assert.equal(v.odSitEmpty,true);
  app.renderVals().onOdSitTime({target:{value:'11:00'}}); assert.equal(app.renderVals().odSitRows.length,5);
  app.renderVals().odSitNext(); app.renderVals().onOdDate({target:{value:'2026-11-16'}});
  assert.equal(app.state.od.sitPage,0); assert.match(app.renderVals().odSitWhen,/2026-11-16/);
  app.renderVals().onOdDate({target:{value:'2026-02-30'}}); assert.equal(app.renderVals().odSitRows.length,0);
  assert.match(app.renderVals().odSitEmptyText,/valid date/i);
  app.renderVals().odSitToggle(); assert.equal(app.renderVals().odSitOn,false);
  assert.deepEqual(plain(app.state.od.stops),savedStops); assert.equal(h.writes.length,0);
});

test('Hub Plan a day here opens an empty draft, not a future stop inferred from present opening', () => {
  const h=appFixture(), app=h.app;
  app.renderVals().hbSitToggle(); app.renderVals().hbSitRows[0].add();
  assert.equal(app.state.screen,'plan'); assert.equal(app.state.od.hubId,HUB.id);
  assert.equal(app.state.od.stops.length,0); assert.equal(app.state.od.id,null); assert.equal(app.state.od.sitOpen,true);
  assert.match(app.state.od.msg,/Choose your date and check time/); assert.equal(h.writes.length,0);
});

test('opening the chooser from Hub preserves an existing unsaved or saved day draft', () => {
  const h=appFixture(), app=h.app;
  app.state.od={id:'existing',rev:7,date:'2026-12-01',hubId:'another-area',title:'My notes',rainy:true,status:'planned',stops:[{t:'food',id:'keep'}],sitTime:'14:00'};
  const before=plain(app.state.od); app.renderVals().hbSitToggle(); app.renderVals().hbSitRows[0].add();
  assert.equal(app.state.screen,'plan');
  for(const key of ['id','rev','date','hubId','title','rainy','status','stops','sitTime']) assert.deepEqual(plain(app.state.od[key]),before[key]);
  assert.match(app.state.od.msg,/current draft is still here/); assert.equal(h.writes.length,0);
});

test('adding a sit-long stop is idempotent, typed, draft-only and rechecks stale card eligibility', () => {
  const h=appFixture({foods:[item('same'),item('stale')],spots:[item('same')]}); const app=h.app;
  app.openOuting(null,{hubId:HUB.id,date:'2026-11-15',sitTime:'11:00',sitOpen:true});
  const food=app.renderVals().odSitRows.find(r=>r.key==='food:same'); food.add(); food.add();
  assert.deepEqual(plain(app.state.od.stops),[{t:'food',id:'same'}]);
  app.renderVals().odSitRows.find(r=>r.key==='spot:same').add();
  assert.deepEqual(plain(app.state.od.stops),[{t:'food',id:'same'},{t:'spot',id:'same'}]);
  const stale=app.renderVals().odSitRows.find(r=>r.key==='food:stale');
  app.state.foods=app.state.foods.map(x=>x.id==='stale'?{...x,accepted:false}:x); stale.add();
  assert.equal(app.state.od.stops.length,2); assert.match(app.state.od.msg,/option changed/);
  assert.equal(app.state.foods.find(x=>x.id==='stale').accepted,false); assert.equal(h.writes.length,0);
});

test('stale Plan buttons cannot add after time becomes invalid or while a save is in progress', () => {
  const h=appFixture(), app=h.app;
  app.openOuting(null,{hubId:HUB.id,date:'2026-11-15',sitTime:'11:00',sitOpen:true});
  const row=app.renderVals().odSitRows[0];
  app.renderVals().onOdSitTime({target:{value:'24:00'}}); row.add(); assert.equal(app.state.od.stops.length,0);
  app.renderVals().onOdSitTime({target:{value:'11:00'}}); app.state.od={...app.state.od,busy:true};
  row.add(); assert.equal(app.state.od.stops.length,0); assert.match(app.renderVals().odSitRows[0].addLabel,/Saving/);
  app.state.screen='hub'; app.state.sitHubFor=HUB.id; const before=plain(app.state.od);
  app.renderVals().hbSitRows[0].add(); assert.equal(app.state.screen,'hub'); assert.deepEqual(plain(app.state.od),before);
  assert.equal(h.writes.length,0);
});

test('new card Maps links never trust a dangerous URL merely because it contains a Maps hostname', () => {
  const h=appFixture({foods:[item('danger',{url:'javascript:alert("maps.google.com")',source_url:'javascript:alert(1)'})]});
  h.app.renderVals().hbSitToggle(); const row=h.app.renderVals().hbSitRows[0];
  assert.match(row.maps,/^https:\/\/www\.google\.com\/maps\//); assert.equal(row.hasPolicyUrl,false); assert.equal(row.policyUrl,'');
  assert.doesNotMatch(row.maps,/^javascript:/); assert.equal(h.writes.length,0);
});

test('every Hub and Plan sit-long panel binding resolves, including row actions and safe links', () => {
  const h=appFixture({foods:[item('seat',{url:'https://example.org/policy',confidence:'reviews',last_checked:'2026-11-14'})],
    spots:[item('toilet',{name:'Toilet',themes:['toilet'],lat:35.0015})]});
  h.app.renderVals().hbSitToggle(); const hub=h.app.renderVals();
  h.app.openOuting(null,{hubId:HUB.id,date:'2026-11-15',sitTime:'11:00',sitOpen:true}); const plan=h.app.renderVals();
  const panels=[...template.matchAll(/<section class="sit-panel" aria-label="([^"]+)">([\s\S]*?)<\/section>/g)];
  assert.equal(panels.length,2);
  for(const [,label,markup] of panels) {
    const values=label.includes('planned day')?plan:hub, rows=label.includes('planned day')?values.odSitRows:values.hbSitRows;
    assert.equal(rows.length,1);
    for(const match of markup.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      const expression=match[1]; if(['true','false'].includes(expression)) continue;
      const parts=expression.split('.'); let value=parts[0]==='sr'?{sr:rows[0]}:values;
      for(const part of parts) { assert.ok(value!=null && part in Object(value),`missing ${label} binding ${expression}`); value=value[part]; }
      assert.notEqual(value,undefined,expression);
      const prefix=markup.slice(Math.max(0,match.index-60),match.index);
      if(/sc-camel-on-(click|change)="\s*$/.test(prefix)) assert.equal(typeof value,'function',expression);
      if(/href="\s*$/.test(prefix)) assert.match(value,/^https?:\/\//,expression);
    }
  }
  assert.equal(h.writes.length,0);
});

test('pullCloud preserves optional seating facts including zero and false for foods, suggestions and spots', async () => {
  const h=appFixture(), facts={seating_type:'free_seating',min_order:'No order required',min_order_yen:0,stay_limit_min:0,
    outlets:false,wifi:false,quiet:3,smoke_free:'yes',setting:'indoor',feel:'Quiet tables',confidence:'reviews',last_checked:'2026-11-14'};
  const tables={setu_food_notes:[{...item('food'),hub_id:HUB.id,...facts},{...item('suggestion'),hub_id:HUB.id,accepted:false,...facts}],
    setu_spots:[{...item('spot'),hub_id:HUB.id,...facts}],setu_hubs:[{...HUB}]};
  const reads=[];
  h.window.setu.sb={from(table) {
    reads.push(table);
    const query={select(){return this;},is(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
      then(resolve,reject){return Promise.resolve({data:tables[table]||[],error:null}).then(resolve,reject);}};
    return query;
  }};
  // The existing geocoding/location side effects are not part of field-mapping verification.
  h.app.geocodeMissing=()=>{}; h.app.locateQuiet=()=>{};
  await h.app.pullCloud(); assert.equal(h.app.state.cloud,true); assert.equal(h.app.state.cloudErr,'');
  const rows=[h.app.state.foods[0],h.app.state.foodSugg[0],h.app.state.spots[0]];
  assert.equal(rows.length,3);
  for(const row of rows) {
    assert.ok(row);
    for(const [key,value] of Object.entries(facts)) assert.equal(row[key],value,`${row.id}.${key}`);
  }
  assert.equal(h.app.state.foodSugg[0].accepted,false); assert.equal(h.app.state.foods[0].accepted,true);
  assert.ok(reads.includes('setu_food_notes')); assert.ok(reads.includes('setu_spots'));
  assert.equal(h.writes.length,0); assert.equal(h.storage.size,0);
});
