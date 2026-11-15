import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Run the delivered runtime, not a separately maintained copy of the budget logic.
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE, 'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime?.includes('PLANNING_BUDGET_HELPERS_START'));
const script = new vm.Script(`${runtime}\n;globalThis.__budgetTest = {Component,planningBudgetInfo,planningBudgetSummary,PLANNING_MENU_EXAMPLES};`);
const NOW = new Date('2026-11-15T11:00:00+09:00');
const plain = value => JSON.parse(JSON.stringify(value));
const event = value => ({target:{value}});
const harnesses = [];

function harness() {
  const writes = [], fetches = [], opened = [], storage = new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); }
    static now() { return NOW.getTime(); }
  }
  class DCLogic {
    setState(patch) { this.state = {...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch)}; }
  }
  const window = {scrollTo(){}, open(...args){opened.push(args);}, addEventListener(){}, removeEventListener(){},
    setu:{save(...args){writes.push(args); throw new Error('Budget browsing must not save records');},
      softDelete(...args){writes.push(args); throw new Error('Budget browsing must not delete records');}}};
  const context = vm.createContext({DCLogic, Date:ClockDate, Intl, URL, URLSearchParams, window, console,
    localStorage:{getItem:key => storage.get(key) || null, setItem:(key,value) => storage.set(key,value)},
    document:{getElementById(){return null;}, hidden:false}, navigator:{},
    setInterval(){return 1;}, clearInterval(){}, setTimeout(){return 1;}, clearTimeout(){},
    fetch(...args){fetches.push(args); throw new Error('Budget tests must not fetch prices or call a database');}});
  script.runInContext(context);
  const h = {...context.__budgetTest, writes, fetches, opened, storage};
  harnesses.push(h);
  return h;
}

test.afterEach(() => {
  for (const h of harnesses) {
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.fetches, []);
  }
  harnesses.length = 0;
});

const hub = (id,name='Budget area',prefecture='Saitama') => ({id,name,prefecture,themes:[],geoQuery:'',lat:null,lng:null,radius_m:700});
const spot = (id,extra={}) => ({id,hubId:'budget-hub',name:`Place ${id}`,accepted:true,status:'try',kind:'other',
  themes:[],hours:null,lat:null,lng:null,address:'',url:'',...extra});
const food = (id,extra={}) => ({...spot(id),name:`Food ${id}`,area:'',...extra});
const names = rows => Array.from(rows,row => row.name);
const currentItems = app => app.renderVals().wvGroups[0]?.items || [];
function selectHub(app) {
  app.renderVals().onWvPrefecture(event('saitama'));
  app.renderVals().onWvHub(event('hub:budget-hub'));
}
function fixture(extra={}) {
  const h = harness(), app = new h.Component();
  const hubs = [hub('budget-hub'),hub('remote-hub','Remote area','Tokyo')];
  const foods = [
    food('unknown-minimum',{min_order_yen:100,min_order:'One drink',themes:['cafe','sit-long']}),
    food('expensive',{spend:1500,min_order_yen:100,spendSeen:'2026-11-01'}),
    food('five-hundred',{spend:500}),food('zero',{spend:0}),
    food('malformed',{spend:false}),food('raw-thousand',{spend_yen:'1000',spend_seen:'2026-11-01'})
  ];
  const spots = [spot('unknown'),spot('five-hundred',{spend:500}),spot('two-hundred',{spend:200}),
    spot('remote',{hubId:'remote-hub',spend:400}),spot('deleted',{deleted_at:'2026-01-01',spend:0}),
    spot('suggestion',{accepted:false,spend:0}),spot('visited',{status:'done',spend:0})];
  app.state = {...app.state,cloud:true,user:{id:'fixture-user'},screen:'plan',theme:'all',sick:false,
    hubs,foods,spots,foodSugg:[],outings:[],wx:[],fc:{},...extra};
  return {...h,app};
}

test('visit estimates and recorded minimum orders remain separate numeric concepts', () => {
  const {planningBudgetInfo:info} = harness();
  const row = info({spend:1500,min_order_yen:300,min_order:'One drink',spendSeen:'2026-11-01'},null,NOW);
  assert.equal(row.amount,1500);
  assert.match(row.budgetText,/1,500/);
  assert.match(row.budgetText,/estimate/i);
  assert.doesNotMatch(row.budgetText,/300|minimum|seating fee/i);
  assert.equal(row.hasMinimum,true);
  assert.match(row.minimumText,/300/);
  assert.match(row.minimumText,/One drink/);
  assert.match(row.priceDetail,/per person/i);
  assert.match(row.priceDetail,/not recorded|confirm/i);
});

test('an explicit zero is a known recorded amount, without a free-food or free-stay claim', () => {
  const {planningBudgetInfo:info} = harness();
  for (const record of [{spend:0},{spend:'0'},{spend_yen:0},{spend:0,spend_yen:600}]) {
    const row = info(record,null,NOW);
    assert.equal(row.amount,0);
    assert.match(row.budgetText,/¥0/);
    assert.doesNotMatch(row.budgetText,/unknown|free/i);
  }
  const local = info({spend:750,spendSeen:'2026-11-01'},null,NOW);
  const cloud = info({spend_yen:'750',spend_seen:'2026-11-01'},null,NOW);
  assert.deepEqual(plain(local),plain(cloud));
});

test('malformed and absent visit amounts stay unknown instead of becoming zero', () => {
  const {planningBudgetInfo:info} = harness();
  for (const value of [undefined,null,'',false,true,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'many',{},[]]) {
    const row = info({spend:value,spend_yen:value},null,NOW);
    assert.equal(row.amount,null,`invalid amount ${String(value)}`);
    assert.match(row.budgetText,/unknown/i);
    assert.doesNotMatch(row.budgetText,/¥0|free/i);
  }
  assert.equal(info({spend:false,spend_yen:400},null,NOW).amount,400);
  assert.equal(info(null,null,NOW).amount,null);
});

test('minimums, seating labels and price-like prose never manufacture a visit budget', () => {
  const {planningBudgetInfo:info} = harness();
  for (const seating_type of ['free_seating','buy_to_sit','own_food_ok']) {
    const row = info({min_order_yen:300,min_order:'Coffee ¥300',seating_type,name:'¥100 café',intro:'Free and cheap'},null,NOW);
    assert.equal(row.amount,null);
    assert.match(row.budgetText,/unknown/i);
    assert.match(row.minimumText,/300/);
    assert.match(row.priceDetail,/not automatically|not.*total/i);
  }
});

test('budget dates cannot silently inherit seating-policy verification dates', () => {
  const {planningBudgetInfo:info} = harness();
  const row = info({spend:700,last_checked:'2026-11-15',confidence:'confirmed'},null,NOW);
  assert.match(row.priceDetail,/Budget seen date unknown/i);
  assert.doesNotMatch(row.priceDetail,/2026-11-15|verified/i);
  for (const spendSeen of ['2026-02-30','2026-13-01','2026-11-15T00:00:00Z',false])
    assert.match(info({spend:700,spendSeen},null,NOW).priceDetail,/date unknown/i);
});

test('old and future prices disclose uncertainty using Japan calendar days', () => {
  const {planningBudgetInfo:info} = harness();
  assert.doesNotMatch(info({spend:500,spendSeen:'2026-09-16'},null,NOW).priceDetail,/over 60 days/i);
  assert.match(info({spend:500,spendSeen:'2026-09-15'},null,NOW).priceDetail,/over 60 days old/i);
  assert.match(info({spend:500,spendSeen:'2026-09-16'},null,new Date('2026-11-15T15:01:00Z')).priceDetail,/over 60 days old/i);
  assert.match(info({spend:500,spendSeen:'2026-11-16'},null,NOW).priceDetail,/future date/i);
  for (const now of [null,false,'invalid',new Date('invalid')])
    assert.match(info({spend:500,spendSeen:'2026-11-01'},null,now).priceDetail,/recency unknown/i);
});

test('weekly hours and ninety-minute stay claims remain unverified without evidence', () => {
  const {planningBudgetInfo:info} = harness();
  const row = info({themes:['cafe','sit-long']},null,NOW);
  assert.match(row.hoursText,/unverified|unknown/i);
  assert.match(row.stayText,/90.*unverified/i);
  const saved = info({themes:['cafe'],hours:{sun:[['09:00','18:00']]},stay_limit_min:60},null,NOW);
  assert.match(saved.hoursText,/weekly/i);
  assert.match(saved.hoursText,/holiday.*unverified/i);
  assert.match(saved.stayText,/60/);
  assert.match(saved.stayText,/less than 90/i);
});

test('summary includes zero, raw estimates and unresolved stop references honestly', () => {
  const {planningBudgetSummary:summary} = harness();
  const row = summary([{spend:0},{spend_yen:'500'},{min_order_yen:100},{spend:false}],6);
  assert.deepEqual(plain({known:row.known,unknown:row.unknown,sum:row.sum}),{known:2,unknown:4,sum:500});
  assert.match(row.text,/500/);
  assert.match(row.text,/4 unknown/i);
  assert.match(row.text,/per person|\/ person/i);
  assert.match(row.text,/transport excluded/i);
  assert.equal(summary([{spend:300},{spend:400}],1).unknown,0,'a too-small expected count cannot produce negative unknowns');
  assert.equal(summary([null,undefined,{spend:300}],5).unknown,4);
});

test('all-unknown and zero-only totals cannot be confused with each other', () => {
  const {planningBudgetSummary:summary} = harness();
  const unknown = summary([{min_order_yen:300}],3);
  assert.equal(unknown.known,0); assert.equal(unknown.unknown,3);
  assert.match(unknown.text,/unknown/i); assert.match(unknown.text,/3/);
  assert.doesNotMatch(unknown.text,/¥0|free/i);
  const zero = summary([{spend:0}],1);
  assert.equal(zero.known,1); assert.equal(zero.unknown,0); assert.equal(zero.sum,0);
  assert.match(zero.text,/¥0/); assert.doesNotMatch(zero.text,/unknown|free/i);
  assert.doesNotMatch(summary([]).text,/free/i);
});

test('Maps links reject executable, credential-bearing and lookalike source URLs', () => {
  const {planningBudgetInfo:info} = harness();
  for (const url of ['javascript:alert(1)','data:text/html,test','https://maps.google.com.evil.example/maps/123',
    'https://evil.example/google.com/maps/123','https://user:secret@www.google.com/maps/123','http://www.google.com/maps/123']) {
    const result = new URL(info({name:'Fixture café',address:'Fixture address',url},hub('b'),NOW).maps);
    assert.equal(result.protocol,'https:');
    assert.ok(['google.com','www.google.com'].includes(result.hostname));
    assert.equal(result.username,''); assert.equal(result.password,'');
    assert.equal(result.searchParams.get('query'),'Fixture café Fixture address');
  }
  const valid = 'https://www.google.com/maps/place/Fixture';
  assert.equal(info({name:'Fixture',url:valid},null,NOW).maps,valid);
});

test('budget calculations leave frozen saved data and hub records unchanged', () => {
  const {planningBudgetInfo:info,planningBudgetSummary:summary} = harness();
  const record = Object.freeze({name:'Fixture café',spend:650,spend_yen:900,spend_seen:'2026-11-01',
    min_order_yen:300,min_order:'One drink',themes:Object.freeze(['cafe'])});
  const area = Object.freeze(hub('b'));
  const before = JSON.stringify({record,area});
  assert.equal(info(record,area,NOW).amount,650);
  assert.equal(summary(Object.freeze([record]),2).unknown,1);
  assert.equal(JSON.stringify({record,area}),before);
});

test('the embedded menu catalog matches the reviewable data file exactly', () => {
  const {PLANNING_MENU_EXAMPLES:catalog} = harness();
  const data = JSON.parse(fs.readFileSync(new URL('../data/planning-menu-examples.json',import.meta.url),'utf8'));
  assert.equal(data.schemaVersion,1); assert.ok(data.entries.length > 0);
  assert.deepEqual(plain(catalog),data);
  for (const entry of catalog.entries) {
    assert.ok(entry.names.length && entry.hubNames.length && entry.sources.length && entry.examples.length);
    assert.match(entry.checkedOn,/^\d{4}-\d{2}-\d{2}$/);
    for (const source of entry.sources) assert.equal(new URL(source.url).protocol,'https:');
  }
});

test('menu examples require an exact café alias and matching hub, not chain inheritance', () => {
  const {planningBudgetInfo:info,PLANNING_MENU_EXAMPLES:catalog} = harness();
  const entry = catalog.entries.find(x => x.id === 'saint-marc-musashi-urawa-mare');
  assert.ok(entry,'the branch-specific example is available');
  const area = hub('musashi',entry.hubNames[0]);
  const row = info({name:entry.names[0],themes:['cafe']},area,NOW);
  assert.equal(row.hasMenu,true); assert.ok(row.menuExamples.length >= 2);
  assert.equal(row.amount,null,'menu prices do not manufacture a saved visit estimate');
  assert.equal(row.hasMinimum,false,'published prices do not prove a minimum order');
  assert.match(row.stayText,/unverified/i);
  assert.match(row.menuNote,/2026-11-15/);
  assert.match(row.menuNote,/may vary|vary by store/i);
  assert.equal(info({name:entry.names[0]},hub('other','Minami-Urawa'),NOW).hasMenu,false);
  assert.equal(info({name:'Saint Marc Café'},area,NOW).hasMenu,false);
  assert.equal(info({name:'Saint Marc Café unrelated branch',area:entry.hubNames[0]},area,NOW).hasMenu,false);
  assert.equal(info({name:entry.names[0],area:entry.hubNames[0]},null,NOW).hasMenu,false,'free text cannot substitute for hub identity');
  assert.equal(info({name:'  '+entry.names[0].toUpperCase()+'  '},area,NOW).hasMenu,true,'case and surrounding whitespace are harmless');
});

test('menu totals are labeled examples and source/date safety survives malformed catalog entries', () => {
  const {planningBudgetInfo:info,PLANNING_MENU_EXAMPLES:catalog} = harness();
  const entry = catalog.entries.find(x => x.id === 'saint-marc-musashi-urawa-mare');
  assert.ok(entry);
  const area = hub('musashi',entry.hubNames[0]), record = {name:entry.names[0],spend:1200};
  const row = info(record,area,NOW);
  assert.equal(row.amount,1200);
  assert.ok(row.menuExamples.every(x => /example/i.test(x.text)));
  assert.ok(row.menuExamples.some(x => /350/.test(x.text)));
  assert.ok(row.menuExamples.some(x => /770/.test(x.text)));
  assert.ok(row.menuSources.every(x => new URL(x.url).protocol === 'https:'));
  // Mutate only this test's isolated, in-memory catalog, never source or saved app records.
  entry.checkedOn = '2026-11-16';
  assert.match(info(record,area,NOW).menuNote,/future date/i);
  entry.checkedOn = '2026-09-01';
  assert.match(info(record,area,NOW).menuNote,/over 60 days old/i);
  entry.sources = [{label:'Unsafe',url:'javascript:alert(1)'},{label:'Credentials',url:'https://a:b@example.com/'}];
  assert.equal(info(record,area,NOW).hasMenu,false);
  assert.equal(info(record,area,NOW).menuSources.length,0);
  entry.sources = [{label:'Fixture source',url:'https://example.com/menu'}];
  entry.examples = [{id:'bad',kind:'drink',label:'Malformed price',items:[{name:'Drink',yen:false}]}];
  assert.equal(info(record,area,NOW).hasMenu,false);
});

test('My Plan keeps its original grouped order and five-place pagination by default', () => {
  const {app} = fixture();
  let v = app.renderVals();
  assert.equal(v.wvBudgetLimit,'all'); assert.equal(v.wvBudgetGroup,'all'); assert.equal(v.wvBudgetSort,'original');
  assert.equal(v.wvGroups.length,0,'no places appear before choosing an area');
  selectHub(app); v = app.renderVals();
  assert.deepEqual(names(currentItems(app)),['Food unknown-minimum','Food expensive','Food five-hundred','Food zero','Food malformed']);
  assert.match(v.wvPageCount,/1–5 of 9/);
  assert.equal(v.wvHasNext,true); v.wvNext(); v = app.renderVals();
  assert.deepEqual(names(currentItems(app)),['Food raw-thousand','Place unknown','Place five-hundred','Place two-hundred']);
  assert.match(v.wvPageCount,/6–9 of 9/); assert.equal(v.wvHasNext,false);
});

test('budget limits filter saved visit estimates, not minimum orders, with zero included', () => {
  const {app} = fixture(); selectHub(app);
  app.renderVals().onWvBudgetLimit(event('500'));
  let v = app.renderVals();
  assert.deepEqual(names(currentItems(app)),['Food five-hundred','Food zero','Place five-hundred','Place two-hundred']);
  assert.ok(currentItems(app).every(x => x.amount !== null && x.amount <= 500));
  assert.match(v.wvBudgetCounts,/3.*unknown|unknown.*3/i);
  assert.match(v.wvBudgetCounts,/hidden|not shown|excluded|use Budget unknown to review/i);
  assert.equal(v.wvBudgetEmpty,false);
  v.onWvBudgetLimit(event('0')); v = app.renderVals();
  assert.deepEqual(names(currentItems(app)),['Food zero']);
  assert.equal(currentItems(app)[0].amount,0);
  assert.equal(v.wvBudgetEmpty,false);
});

test('unknown-price group remains accessible while a numeric limit is active', () => {
  const {app} = fixture(); selectHub(app);
  app.renderVals().onWvBudgetLimit(event('0'));
  app.renderVals().onWvBudgetGroup(event('unknown'));
  let v = app.renderVals();
  assert.equal(v.wvBudgetLimit,'0'); assert.equal(v.wvBudgetGroup,'unknown');
  assert.deepEqual(names(currentItems(app)),['Food unknown-minimum','Food malformed','Place unknown']);
  assert.ok(currentItems(app).every(x => x.amount === null));
  assert.equal(v.wvBudgetEmpty,false);
  v.onWvBudgetGroup(event('known')); v = app.renderVals();
  assert.deepEqual(names(currentItems(app)),['Food zero']);
  v.onWvBudgetLimit(event('all'));
  assert.equal(currentItems(app).length,5);
  assert.equal(app.renderVals().wvHasNext,true,'all six known prices remain paginated');
});

test('price sort is stable across pages and puts all unknown estimates last', () => {
  const {app} = fixture(); selectHub(app);
  app.renderVals().onWvBudgetSort(event('price'));
  assert.deepEqual(names(currentItems(app)),['Food zero','Place two-hundred','Food five-hundred','Place five-hundred','Food raw-thousand']);
  app.renderVals().wvNext();
  assert.deepEqual(names(currentItems(app)),['Food expensive','Food unknown-minimum','Food malformed','Place unknown']);
  app.renderVals().onWvBudgetSort(event('original'));
  assert.equal(app.state.wvPage,0);
  assert.deepEqual(names(currentItems(app)),['Food unknown-minimum','Food expensive','Food five-hundred','Food zero','Food malformed']);
});

test('changing budget controls resets pagination and never rewrites saved data or the draft', () => {
  const {app} = fixture(); selectHub(app);
  app.openOuting(null,{hubId:'budget-hub',date:'2026-11-21',stops:[{t:'food',id:'expensive'}],rainy:true,rainManual:true});
  const before = JSON.stringify({foods:app.state.foods,spots:app.state.spots,hubs:app.state.hubs,outings:app.state.outings,od:app.state.od});
  for (const [handler,value] of [['onWvBudgetLimit','1000'],['onWvBudgetGroup','known'],['onWvBudgetSort','price']]) {
    app.setState({wvPage:1}); app.renderVals()[handler](event(value));
    assert.equal(app.state.wvPage,0);
  }
  assert.equal(JSON.stringify({foods:app.state.foods,spots:app.state.spots,hubs:app.state.hubs,outings:app.state.outings,od:app.state.od}),before);
  assert.equal(app.state.wvHubKey,'hub:budget-hub');
});

test('budget controls accept only their declared options, never negative or injected filters', () => {
  const {app} = fixture(); selectHub(app);
  for (const value of ['all','0','500','1000','1500','2000','3000']) {
    app.renderVals().onWvBudgetLimit(event(value));
    assert.equal(app.renderVals().wvBudgetLimit,value);
  }
  app.renderVals().onWvBudgetLimit(event('-100'));
  assert.ok(['all','0','500','1000','1500','2000','3000'].includes(app.renderVals().wvBudgetLimit));
  app.renderVals().onWvBudgetGroup(event('bogus'));
  assert.ok(['all','known','unknown'].includes(app.renderVals().wvBudgetGroup));
  app.renderVals().onWvBudgetSort(event('bogus'));
  assert.ok(['original','price'].includes(app.renderVals().wvBudgetSort));
});

test('empty budget results explain the filter without losing the area or original list', () => {
  const {app} = fixture({foods:[food('over-limit',{spend:900})],spots:[]}); selectHub(app);
  app.renderVals().onWvBudgetLimit(event('500'));
  let v = app.renderVals();
  assert.equal(v.wvBudgetEmpty,true); assert.equal(currentItems(app).length,0);
  assert.match(v.wvBudgetEmptyText,/budget|estimate|filter/i);
  assert.equal(v.wvHubKey,'hub:budget-hub');
  v.onWvBudgetLimit(event('all')); v = app.renderVals();
  assert.equal(v.wvBudgetEmpty,false);
  assert.deepEqual(names(currentItems(app)),['Food over-limit']);
});

test('budget cards keep add-to-day and open actions while exposing independent price details', () => {
  const {app} = fixture(); selectHub(app);
  let row = currentItems(app)[0];
  assert.equal(row.amount,null); assert.match(row.budgetText,/unknown/i);
  assert.equal(row.hasMinimum,true); assert.match(row.minimumText,/100/);
  assert.equal(typeof row.add,'function'); assert.equal(typeof row.open,'function');
  assert.equal(new URL(row.maps).protocol,'https:');
  app.openOuting(null,{hubId:'budget-hub',date:'2026-11-21',stops:[]});
  row = currentItems(app)[0]; row.add();
  assert.deepEqual(plain(app.state.od.stops),[{t:'food',id:'unknown-minimum'}]);
  assert.equal(currentItems(app)[0].addTxt,'✓ In day');
  currentItems(app)[0].add();
  assert.equal(app.state.od.stops.length,0,'the existing selected-stop toggle still removes the stop rather than duplicating it');
});

test('menu example prices cannot satisfy the visit-budget filter or plan total', () => {
  const {app,PLANNING_MENU_EXAMPLES:catalog} = fixture();
  const entry = catalog.entries.find(x => x.id === 'saint-marc-musashi-urawa-mare'); assert.ok(entry);
  app.setState({hubs:[hub('budget-hub',entry.hubNames[0])],foods:[food('menu-only',{name:entry.names[0]})],spots:[]});
  selectHub(app);
  assert.equal(currentItems(app)[0].hasMenu,true); assert.equal(currentItems(app)[0].amount,null);
  app.renderVals().onWvBudgetLimit(event('1000'));
  assert.equal(currentItems(app).length,0);
  app.renderVals().onWvBudgetGroup(event('unknown'));
  assert.equal(currentItems(app).length,1);
  app.openOuting(null,{hubId:'budget-hub',date:'2026-11-21',stops:[{t:'food',id:'menu-only'}]});
  assert.match(app.renderVals().odTotals,/unknown/i);
  assert.doesNotMatch(app.renderVals().odTotals,/¥350|¥770/);
});

const missingReferenceDay = () => ({id:'saved-day',rev:1,date:'2026-11-21',hubId:'budget-hub',status:'planned',rainy:false,title:'',
  stops:[{t:'food',id:'five-hundred'},{t:'spot',id:'missing'},{t:'spot',id:'unknown'},{t:'food',id:'zero'}]});

test('saved-day and home summaries count raw references, including unresolved unknown prices', () => {
  const {app} = fixture({outings:[missingReferenceDay()]});
  const v = app.renderVals();
  for (const text of [v.pdList[0].sub,v.hpSub]) {
    assert.match(text,/4 stops/);
    assert.match(text,/500/);
    assert.match(text,/2 unknown/i);
    assert.match(text,/transport excluded/i);
  }
});

test('draft totals preserve unknown references and do not silently drop missing places', () => {
  const {app} = fixture({outings:[missingReferenceDay()]});
  app.renderVals().pdList[0].go();
  const v = app.renderVals();
  assert.equal(v.odStops.length,4);
  assert.match(v.odTotals,/4 stops/); assert.match(v.odTotals,/500/); assert.match(v.odTotals,/2 unknown/i);
  assert.match(v.odBudgetNote,/transport|travel/i);
  assert.match(v.odStops[1].name,/missing|unavailable|unresolved/i);
  assert.deepEqual(Array.from(v.odStops,x => x.n),[1,2,3,4]);
  assert.equal(v.odStops[2].name,'Place unknown');
  assert.equal(v.odStops[3].name,'Food zero');
});

test('removing a resolved row after an unresolved reference removes the correct original stop', () => {
  const {app} = fixture({outings:[missingReferenceDay()]});
  app.renderVals().pdList[0].go();
  const original = plain(app.state.outings);
  app.renderVals().odStops[2].remove();
  assert.deepEqual(plain(app.state.od.stops),[{t:'food',id:'five-hundred'},{t:'spot',id:'missing'},{t:'food',id:'zero'}]);
  assert.deepEqual(plain(app.state.outings),original,'draft edits never rewrite saved plans before Save');
});

test('missing or unpinned stops cannot produce an apparently complete walking total', () => {
  const {app} = fixture({outings:[missingReferenceDay()]});
  app.state.hubs[0] = {...app.state.hubs[0],lat:35.8,lng:139.65};
  app.state.foods = app.state.foods.map(x => ({...x,lat:35.801,lng:139.65}));
  app.state.spots = app.state.spots.map(x => ({...x,lat:35.802,lng:139.65}));
  app.renderVals().pdList[0].go();
  const v = app.renderVals();
  assert.match(v.odTotals,/known walking subtotal; other legs unknown/);
  assert.match(v.odStops[1].walk,/unknown/);
  assert.match(v.odStops[2].walk,/unknown/,'walk after the missing stop is not known');
  assert.match(v.odStops[3].walk,/min walk/);
});

test('moving a row preserves unresolved stop references and uses original draft indices', () => {
  const {app} = fixture({outings:[missingReferenceDay()]});
  app.renderVals().pdList[0].go();
  app.renderVals().odStops[2].up();
  assert.deepEqual(plain(app.state.od.stops),[{t:'food',id:'five-hundred'},{t:'spot',id:'unknown'},{t:'spot',id:'missing'},{t:'food',id:'zero'}]);
  assert.equal(app.renderVals().odStops.length,4);
});

test('Suggest cannot silently replace a draft containing unresolved saved references', () => {
  const {app} = fixture({outings:[missingReferenceDay()]});
  app.renderVals().pdList[0].go();
  const before = plain(app.state.od.stops);
  app.renderVals().odSuggest();
  assert.deepEqual(plain(app.state.od.stops),before);
  assert.match(app.renderVals().odMsg,/missing|unavailable|unresolved/i);
});
