import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the delivered runtime, not a separately maintained copy of the helper.
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE,'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime?.includes('SIT_COST_HELPERS_START'),'cost helpers are present in the actual template');
const script = new vm.Script(`${runtime}\n;globalThis.__costTest = {normalizeSitFacts,sitCostInfo,sitLongModel};`);
const NOW = new Date('2026-11-15T11:00:00+09:00');
const HUB = {id:'test-hub',name:'Test hub',lat:35,lng:139,radius_m:700,themes:[]};
const item = (id,extra={}) => ({id,name:`Place ${id}`,hubId:HUB.id,lat:35.001,lng:139,status:'try',accepted:true,
  themes:['sit-long'],hours:{sun:[['09:00','18:00']]},stay_limit_min:0,...extra});
class DCLogic { setState(patch) { this.state={...this.state,...patch}; } }
const context = vm.createContext({DCLogic,Date,Intl,URL,URLSearchParams,console,
  window:{},localStorage:{getItem(){return null;},setItem(){}},document:{},navigator:{},
  setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},
  fetch(){throw new Error('Cost tests must not fetch or invent current menu prices');}});
script.runInContext(context);
const api = context.__costTest;
const info = (x,now=NOW) => api.sitCostInfo(x,api.normalizeSitFacts(x),now);
const model = foods => api.sitLongModel({foods,hub:HUB,at:NOW,now:NOW});
const plain = value => JSON.parse(JSON.stringify(value));

test('a recorded minimum takes precedence over an unrelated visit-budget estimate', () => {
  const row=info({min_order_yen:600,spend:1500,min_order:'One drink',last_checked:'2026-11-10',spendSeen:'2026-11-01'});
  assert.equal(row.costKind,'minimum'); assert.equal(row.costAmount,600); assert.equal(row.costRank,0);
  assert.equal(row.costText,'Minimum order: ¥600');
  assert.match(row.costDetail,/not the total visit cost/);
  assert.match(row.costDetail,/Recorded order note: One drink/);
  assert.match(row.costDetail,/Minimum-order check: 2026-11-10/);
  assert.doesNotMatch(row.costText,/1,500|confirmed|verified|free/i);
});

test('saved spend is explicitly a visit estimate, never a minimum order or seating fee', () => {
  const local=info({spend:1200,spendSeen:'2026-11-01'});
  const cloud=info({spend_yen:'1200',spend_seen:'2026-11-01'});
  assert.deepEqual(plain(local),plain(cloud));
  assert.equal(local.costText,'Estimated visit budget: ~¥1,200');
  assert.equal(local.costKind,'estimate'); assert.equal(local.costAmount,1200); assert.equal(local.costRank,1);
  assert.match(local.costDetail,/not a confirmed seating fee or minimum order/);
  assert.match(local.costDetail,/Budget seen: 2026-11-01/);
  assert.doesNotMatch(local.costText,/Minimum|free/i);
});

test('explicit zero survives for both minimum and estimate without a free-food claim', () => {
  const minimum=info({min_order_yen:0,spend:500});
  assert.equal(minimum.costText,'Minimum order: ¥0'); assert.equal(minimum.costKind,'minimum');
  for(const x of [{spend:0},{spend:'0'},{spend_yen:0},{spend:0,spend_yen:800}]) {
    const estimate=info(x);
    assert.equal(estimate.costText,'Estimated visit budget: ~¥0');
    assert.equal(estimate.costAmount,0); assert.equal(estimate.costKind,'estimate');
    assert.doesNotMatch(estimate.costText,/free/i);
  }
});

test('missing, boolean, negative, fractional and non-finite costs are unknown, not zero', () => {
  for(const bad of [undefined,null,'',false,true,-1,1.2,NaN,Infinity,'many',{},[]]) {
    const row=info({min_order_yen:bad,spend:bad,spend_yen:bad});
    assert.equal(row.costKind,'unknown'); assert.equal(row.costAmount,null); assert.equal(row.costRank,2);
    assert.equal(row.costText,'Price unknown'); assert.doesNotMatch(row.costText,/¥0|free/i);
  }
  assert.equal(info({spend:false,spend_yen:400}).costAmount,400);
  assert.equal(info(null).costKind,'unknown');
});

test('seating labels, prose and an order description never invent numeric prices', () => {
  for(const seating_type of ['free_seating','buy_to_sit','own_food_ok']) {
    const row=info({seating_type,min_order:'One coffee, maybe ¥300',intro:'Cheap and free seating',name:'¥100 café'});
    assert.equal(row.costKind,'unknown'); assert.equal(row.costAmount,null);
    assert.match(row.costDetail,/Recorded order note: One coffee, maybe ¥300/);
    assert.equal(row.costText,'Price unknown');
  }
});

test('unknown budget date remains explicit and policy dates do not substitute for it', () => {
  const row=info({spend:700,last_checked:'2026-11-15',confidence:'confirmed'});
  assert.equal(row.costKind,'estimate');
  assert.match(row.costDetail,/Budget seen date unknown.*confirm current price/);
  assert.doesNotMatch(row.costDetail,/2026-11-15|verified/i);
  for(const spendSeen of ['2026-02-30','2026-13-01','2026-11-15T00:00:00Z',false])
    assert.match(info({spend:700,spendSeen}).costDetail,/date unknown/);
});

test('staleness starts after 60 Japan-calendar days and applies to either price source', () => {
  assert.doesNotMatch(info({spend:500,spendSeen:'2026-09-16'}).costDetail,/over 60 days/);
  assert.match(info({spend:500,spendSeen:'2026-09-15'}).costDetail,/over 60 days old.*confirm current price/);
  assert.match(info({min_order_yen:500,last_checked:'2026-09-15'}).costDetail,/over 60 days old.*confirm current terms/);
  // It is already November 16 in Japan, but still November 15 in UTC.
  assert.match(info({spend:500,spendSeen:'2026-09-16'},new Date('2026-11-15T15:01:00Z')).costDetail,/over 60 days old/);
});

test('future dates and an invalid current instant do not masquerade as recent verification', () => {
  for(const x of [{spend:500,spendSeen:'2026-11-16'},{min_order_yen:500,last_checked:'2026-11-16'}]) {
    const row=info(x);
    assert.match(row.costDetail,/future date.*confirm the recorded date/);
    assert.doesNotMatch(row.costDetail,/verified|recently confirmed/i);
  }
  for(const now of [null,false,'invalid',new Date('invalid')])
    assert.match(info({spend:500,spendSeen:'2026-11-01'},now).costDetail,/recency unknown/);
});

test('local spend is preferred and can use the raw source date without mutating inputs', () => {
  const x=Object.freeze({spend:650,spend_yen:900,spend_seen:'2026-11-01',min_order:'One drink'});
  const facts=Object.freeze(api.normalizeSitFacts(x));
  const before=JSON.stringify({x,facts});
  const row=api.sitCostInfo(x,facts,NOW);
  assert.equal(row.costAmount,650); assert.match(row.costDetail,/2026-11-01/);
  assert.equal(JSON.stringify({x,facts}),before);
});

test('sit-long rows expose compact primary text and separate honest supporting details', () => {
  const rows=model([item('budget',{spend:700,spendSeen:'2026-09-01'}),item('minimum',{min_order_yen:300,min_order:'One drink'}),item('unknown')]);
  const budget=rows.find(row=>row.x.id==='budget');
  assert.equal(budget.costText,'Estimated visit budget: ~¥700');
  assert.equal(budget.costKind,'estimate'); assert.equal(budget.costAmount,700); assert.equal(budget.costRank,1);
  assert.match(budget.costDetail,/over 60 days old/);
  assert.doesNotMatch(budget.costText,/date|unknown|confirmed/i);
  const minimum=rows.find(row=>row.x.id==='minimum');
  assert.equal(minimum.costText,'Minimum order: ¥300'); assert.match(minimum.costDetail,/One drink/);
  assert.equal(rows.find(row=>row.x.id==='unknown').costText,'Price unknown');
});

test('price sorting compares knowledge tiers before amounts, keeping hours and smoke-free first', () => {
  const rows=model([
    item('unknown'),item('budget-500',{spend:500}),item('min-900',{min_order_yen:900}),item('budget-0',{spend:0}),
    item('min-300',{min_order_yen:300}),item('smoke-free',{smoke_free:'yes'}),
    item('hours-unknown',{hours:null,smoke_free:'yes',min_order_yen:0})
  ]);
  assert.deepEqual(Array.from(rows,row=>row.x.id),['smoke-free','min-300','min-900','budget-0','budget-500','unknown','hours-unknown']);
});

test('a raw cloud estimate and its local mapped form produce the same cost view', () => {
  const raw=model([item('raw',{spend_yen:0,spend_seen:'2026-11-10'})])[0];
  const mapped=model([item('mapped',{spend:0,spendSeen:'2026-11-10'})])[0];
  for(const key of ['costText','costDetail','costKind','costAmount','costRank']) assert.equal(raw[key],mapped[key]);
});
