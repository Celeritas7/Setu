import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/next-five.js', import.meta.url), 'utf8');
const context = { Date, Intl };
vm.runInNewContext(source + '\nglobalThis.api={rank:nextFiveRank,hours:nextFiveHours,clock:nextFiveJapanClock};', context);
const { rank, hours, clock } = context.api;
const at = new Date('2026-11-21T02:00:00Z'); // 11:00 Saturday in Japan

const row = (id, changes={}) => ({
  id,name:id,_t:'spot',distanceKm:0.2,spend:null,
  hours:{sat:[['09:00','17:00']]},themes:[], ...changes
});
const run = (rows, opts={})=>rank(rows,{anchor:{lat:35.96,lng:139.30},now:at,...opts});

test('uses Japan-local Saturday clock without guessing selected trip date',()=>{
  const c=clock(at);
  assert.equal(c.weekday,'sat');
  assert.equal(c.date,'2026-11-21');
  assert.equal(c.time,'11:00');
});

test('requires a real location anchor and never calls all-Japan browsing nearby',()=>{
  const result=rank([row('a')],{now:at});
  assert.equal(result.rows.length,0);
  assert.match(result.reason,/area|Near me/);
});

test('returns at most five and prioritizes nearby while varying categories',()=>{
  const rows=Array.from({length:8},(_,i)=>row('spot-'+i,{distanceKm:0.1+i*0.1}));
  assert.equal(run(rows).rows.length,5);
  assert.equal(run(rows.slice(0,3)).rows.length,3);
  assert.equal(run(rows).rows[0].id,'spot-0');
});

test('unknown cost is not declared free; estimated zero is not admission',()=>{
  const result=run([row('unknown'),row('zero',{spend:0})]).rows;
  assert.match(result.find(p=>p.id==='unknown')._next.price,/unknown/i);
  assert.match(result.find(p=>p.id==='zero')._next.price,/¥0/);
  assert.match(result.find(p=>p.id==='zero')._next.price,/not entry fee/i);
});

test('regular closing is only provisional and too-short options are removed',()=>{
  const rows=[
    row('closed',{hours:{sat:[]}}),
    row('too-short',{hours:{sat:[['09:00','11:20']]}}),
    row('unknown-hours',{hours:null}),
    row('open')
  ];
  const result=run(rows).rows;
  assert.deepEqual(Array.from(result,x=>x.id).sort(),['open','unknown-hours']);
  assert.match(result.find(p=>p.id==='open')._next.hours,/holiday changes unchecked/);
  assert.match(result.find(p=>p.id==='unknown-hours')._next.hours,/unknown/i);
  const c=clock(new Date('2026-11-20T16:00:00Z')); // 01:00 Saturday
  assert.equal(hours({fri:[['20:00','26:00']]},c,20).status,'regular_open');
});

test('neither proximity nor published hours certify return or walking time',()=>{
  const result=run([row('remote',{distanceKm:2.1})]).rows[0];
  assert.match(result._next.risk,/UNVERIFIED/);
  assert.match(result._next.travel,/straight-line/i);
  assert.match(result._next.travel,/walk unknown/i);
  assert.equal(run([row('beyond',{distanceKm:3.1})]).rows.length,0);
});

test('rain preference can elevate sheltered candidates, but shelter is evidence-limited',()=>{
  const rows=[
    row('garden',{distanceKm:0.3,themes:['nature']}),
    row('library',{distanceKm:0.5,setting:'indoor',themes:['sit-long']})
  ];
  const normal=run(rows,{mood:'balanced',rainy:false}).rows;
  const rain=run(rows,{mood:'balanced',rainy:true}).rows;
  assert.equal(normal[0].id,'garden');
  assert.equal(rain[0].id,'library');
  assert.match(rain.find(p=>p.id==='garden')._next.reason,/rain shelter unknown/);
});

test('existing packed Setu app actually contains opt-in UI, ranking and beef filtering',()=>{
  const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const packed=app.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  assert.ok(packed,'packed HTML template is intact');
  const html=JSON.parse(packed[1]);
  assert.match(html,/LIVE_NEXT_FIVE_START/);
  assert.match(html,/LIVE_NEXT_FIVE_END/);
  assert.match(html,/Next five · preview/);
  assert.match(html,/mapNextMoodToggle/);
  assert.match(html,/mapNextRainToggle/);
  assert.match(html,/nextFiveRank\(model\.nearby\.filter\(x=>!sitBeefFocused\(x\)\)/);
  assert.match(html,/Return UNVERIFIED/);
  assert.match(html,/mapHasPrev:!ranked/);
  assert.match(html,/mapHasPending:!ranked/);
  assert.ok(app.length<1048576,'keep GitHub file-content fetching available');
});
