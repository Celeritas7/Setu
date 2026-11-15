import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Inspect and execute the shipped Component and helpers, not a reimplementation.
const bundle = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE, 'utf8')
  : JSON.parse(bundle.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime?.includes('G4_VISITED_SEATING_START'));
const script = new vm.Script(`${runtime}\n;globalThis.__g4Test = {Component,g4DraftFor,g4SavePatch,g4Summary,g4OwnDate,sitLongModel};`);
const TODAY = new Date('2026-11-15T11:00:00+09:00');
const plain = value => JSON.parse(JSON.stringify(value));
const event = value => ({target:{value}});
const HUB = {id:'fictional-area',name:'Fictional area',lat:35,lng:139,themes:[],radius_m:700};
const row = (id, extra={}) => ({id,rev:5,name:`Fictional café ${id}`,hubId:HUB.id,accepted:true,status:'try',
  themes:['sit-long','cafe'],hours:{sun:[['09:00','18:00']]},lat:35.001,lng:139.001,
  spend:1200,spendSeen:'2026-10-01',min_order:'One drink',min_order_yen:400,stay_limit_min:null,
  seating_type:'buy_to_sit',confidence:'reviews',last_checked:'2026-10-01',seatingChecks:{},seatingChecksSupported:true,...extra});

function harness({cloud=true,saveImpl=null}={}) {
  const writes=[], storage=new Map(), fetching=[];
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [TODAY.getTime()])); }
    static now() { return TODAY.getTime(); }
  }
  class DCLogic {setState(patch){this.state={...this.state,...(typeof patch==='function'?patch(this.state):patch)};}}
  const window = {scrollTo(){},open(){},addEventListener(){},removeEventListener(){},
    setu:{save(...args){writes.push(args);return saveImpl ? saveImpl(...args) : Promise.resolve({id:args[1],rev:6});}}};
  const ctx = vm.createContext({DCLogic,Date:ClockDate,Intl,URL,URLSearchParams,window,console,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    document:{getElementById(){return null;},hidden:false},navigator:{},
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
    fetch(...args){fetching.push(args);throw new Error('G4 tests must not make HTTP requests');}});
  script.runInContext(ctx);
  const app = new ctx.__g4Test.Component();
  const food = row('shared'), spot = row('shared',{name:'Fictional study bench',kind:'other',spend:0,min_order_yen:null});
  app.state={...app.state,screen:'place',placeId:food.id,hubId:HUB.id,user:cloud ? {id:'fictional-user'} : null,cloud,
    foods:[food],spots:cloud ? [spot] : [],hubs:[HUB],foodSugg:[],outings:[{id:'fictional-day',date:'2026-11-15',hubId:HUB.id,status:'planned',stops:[{t:'food',id:food.id}]}],
    od:{date:'2026-11-15',hubId:HUB.id,stops:[{t:'food',id:food.id}],note:'Keep my day draft',rainy:true}};
  let pulls=0;
  app.pullCloud=async()=>{pulls++;};
  return {...ctx.__g4Test,app,window,writes,fetching,storage,get pulls(){return pulls;}};
}

test('older optional fields and missing values prefill without marking any fact checked',()=>{
  const h=harness(), older={id:'old',name:'Old fictional spot'};
  const d=h.g4DraftFor('food',older,TODAY,false);
  assert.deepEqual(plain(d.values),{seating_type:'',min_order:'',min_order_yen:'',stay_mode:'unknown',stay_minutes:''});
  assert.deepEqual(plain(d.checked),{}); assert.equal(d.schemaReady,true);
  assert.match(h.g4SavePatch(older,d,TODAY).error,/at least one/);
  assert.match(h.g4Summary(older,TODAY),/No individual/);
});

test('opening and canceling the sheet never writes or modifies the day',()=>{
  const h=harness(), before=plain(h.app.state);
  h.app.renderVals().pConfirm();
  const v=h.app.renderVals();
  assert.equal(v.g4Open,true);assert.equal(v.g4Name,'Fictional café shared');
  assert.equal(v.g4Date,'2026-11-15');assert.equal(v.g4Policy,'buy_to_sit');assert.equal(v.g4Cost,'400');
  assert.equal(v.g4Stay,'unknown');assert.equal(v.g4PolicyChecked,false);assert.equal(v.g4OrderChecked,false);
  v.g4Cancel();
  assert.equal(h.app.state.g4,null); assert.deepEqual(plain(h.app.state.foods),before.foods);
  assert.deepEqual(plain(h.app.state.od),before.od); assert.deepEqual(plain(h.app.state.outings),before.outings);
  assert.equal(h.writes.length,0);
});

test('only checked fields are saved, with field dates and no overall confirmation',async()=>{
  const h=harness(), old=plain(h.app.state), app=h.app;
  app.openG4('food','shared');
  app.renderVals().g4MarkCost();
  await app.saveG4();
  assert.equal(h.writes.length,1);
  const [table,id,patch,rev]=h.writes[0];
  assert.equal(table,'setu_food_notes');assert.equal(id,'shared');assert.equal(rev,5);
  assert.deepEqual(plain(patch),{min_order_yen:400,seating_checks:{min_order_yen:'2026-11-15'}});
  assert.equal(app.state.g4.done,true);assert.match(app.renderVals().g4Success,/1 fact personally confirmed/);
  assert.deepEqual(plain(app.state.od),old.od);assert.deepEqual(plain(app.state.outings),old.outings);
  assert.deepEqual(plain(app.state.foods),old.foods); assert.equal(h.pulls,1);
  await app.saveG4();assert.equal(h.writes.length,1,'saved sheet cannot submit again');
});

test('editing seating policy and stay limit marks only those fields selected',()=>{
  const h=harness(), app=h.app;
  app.openG4('food','shared');
  app.renderVals().g4OnPolicy(event('own_food_ok'));
  app.renderVals().g4OnStay(event('limited'));
  app.renderVals().g4OnMinutes(event('90'));
  const patch=h.g4SavePatch(app.state.foods[0],app.state.g4,TODAY).patch;
  assert.deepEqual(plain(patch),{seating_type:'own_food_ok',stay_limit_min:90,seating_checks:{seating_type:'2026-11-15',stay_limit_min:'2026-11-15'}});
  assert.equal(app.state.g4.checked.min_order_yen,undefined);
  assert.equal(app.state.foods[0].seating_type,'buy_to_sit','draft must not mutate saved record');
});

test('unknown, explicit ¥0 and explicit unlimited stay remain distinct',()=>{
  const h=harness();
  const raw=row('older',{min_order_yen:null,stay_limit_min:null,seat_checks:undefined,seatingChecks:{}});
  let d=h.g4DraftFor('food',raw,TODAY);
  assert.equal(d.values.min_order_yen,'');assert.equal(d.values.stay_mode,'unknown');
  d.checked.min_order_yen=true;
  assert.match(h.g4SavePatch(raw,d,TODAY).error,/Unknown cannot be confirmed/);
  d.values.min_order_yen='0'; d.values.stay_mode='unlimited';d.checked.stay_limit_min=true;
  assert.deepEqual(plain(h.g4SavePatch(raw,d,TODAY).patch),{min_order_yen:0,stay_limit_min:0,
    seating_checks:{min_order_yen:'2026-11-15',stay_limit_min:'2026-11-15'}});
  const old=h.g4DraftFor('food',row('older',{stay_limit_min:0,min_order_yen:0}),TODAY);
  assert.equal(old.values.min_order_yen,'0');assert.equal(old.values.stay_mode,'unlimited');
});

test('explicitly replacing saved facts with unknown clears only those values and dates',()=>{
  const h=harness(), original=row('old',{stay_limit_min:60,
    seatingChecks:{stay_limit_min:'2026-09-01',min_order_yen:'2026-10-01',outlets:'2026-06-01'}});
  const d=h.g4DraftFor('food',original,TODAY);
  d.values.stay_mode='unknown';d.checked.stay_limit_min=true;
  const result=h.g4SavePatch(original,d,TODAY);
  assert.equal(result.cleared,1);assert.equal(result.confirmed,0);
  assert.deepEqual(plain(result.patch),{stay_limit_min:null,seating_checks:{min_order_yen:'2026-10-01',outlets:'2026-06-01'}});
  assert.equal(original.stay_limit_min,60,'read-only input remains unchanged');
});

test('a checked minimum does not change visit budget, menu examples, hours, or a review',async()=>{
  const h=harness(), app=h.app;
  app.state.menu=[{id:'fictional-menu',note_id:'shared',name:'Fictional tea',price_yen:600}];
  app.state.foods[0]={...app.state.foods[0],rating:4,text:'Fictional review'};
  app.openG4('food','shared');app.renderVals().g4OnCost(event('600'));
  await app.saveG4();
  assert.deepEqual(Object.keys(h.writes[0][2]).sort(),['min_order_yen','seating_checks']);
  assert.equal(h.writes[0][2].min_order_yen,600);
  assert.equal(app.state.foods[0].spend,1200);assert.equal(app.state.foods[0].rating,4);
  assert.equal(app.state.foods[0].text,'Fictional review');assert.equal(app.state.menu[0].price_yen,600);
});

test('date and amount validation reject future, malformed, and unsupported values before writes',async()=>{
  const h=harness(), app=h.app;
  app.openG4('food','shared');app.renderVals().g4MarkCost();
  for(const date of ['2026-11-16','2026-02-30','2026-11-15T00:00:00Z','']){
    app.renderVals().g4OnDate(event(date));await app.saveG4();assert.match(app.state.g4.error,/real confirmation date/);
  }
  app.renderVals().g4OnDate(event('2026-11-14'));
  for(const bad of ['-1','1.5','many','2147483648']){
    app.renderVals().g4OnCost(event(bad));await app.saveG4();assert.match(app.state.g4.error,/Minimum yen/);
  }
  app.renderVals().g4OnCost(event('0'));app.renderVals().g4OnStay(event('limited'));
  app.renderVals().g4OnMinutes(event('0'));await app.saveG4();assert.match(app.state.g4.error,/positive whole number/);
  assert.equal(h.writes.length,0);
});

test('failed saves keep all entries and retry after the failure',async()=>{
  let fail=true;
  const h=harness({saveImpl:()=>fail ? Promise.reject(new Error('Fictional server unavailable')) : Promise.resolve({})});
  h.app.openG4('food','shared');h.app.renderVals().g4OnPolicy(event('own_food_ok'));
  await h.app.saveG4();
  assert.match(h.app.state.g4.error,/Not saved.*server unavailable/);
  assert.equal(h.app.state.g4.values.seating_type,'own_food_ok');assert.equal(h.app.state.g4.checked.seating_type,true);
  assert.equal(h.app.state.g4.done,false);assert.equal(h.app.state.g4.busy,false);
  fail=false;await h.app.saveG4();
  assert.equal(h.app.state.g4.done,true);assert.equal(h.writes.length,2);
});

test('duplicate submissions are ignored even when network save is still pending',async()=>{
  let resume;
  const h=harness({saveImpl:()=>new Promise(resolve=>{resume=resolve;})});
  h.app.openG4('food','shared');h.app.renderVals().g4MarkPolicy();
  const first=h.app.saveG4(),second=h.app.saveG4();
  assert.equal(h.app.state.g4.busy,true);assert.equal(h.app.renderVals().g4SaveDisabled,true);
  assert.equal(h.writes.length,1);
  h.app.closeG4();assert.ok(h.app.state.g4,'Cancel cannot make an in-flight write appear canceled');
  resume({id:'shared',rev:6});await Promise.all([first,second]);
  assert.equal(h.writes.length,1);assert.equal(h.app.state.g4.done,true);
});

test('missing approved migration, switched account, or changed revision blocks writes',async()=>{
  const h=harness(),app=h.app;
  app.state.foods[0]={...app.state.foods[0],seatingChecksSupported:false};
  app.openG4('food','shared');app.renderVals().g4MarkPolicy();
  assert.equal(app.renderVals().g4SchemaMissing,true);assert.equal(app.renderVals().g4SaveDisabled,true);
  await app.saveG4();assert.equal(h.writes.length,0);
  app.closeG4();app.state.foods[0].seatingChecksSupported=true;
  app.openG4('food','shared');app.renderVals().g4MarkPolicy();
  app.state.foods[0]={...app.state.foods[0],rev:6};await app.saveG4();assert.match(app.state.g4.error,/changed/);
  app.closeG4();app.openG4('food','shared');app.renderVals().g4MarkPolicy();
  app.state.user={id:'another-fictional-user'};await app.saveG4();assert.match(app.state.g4.error,/sign-in state changed/);
  assert.equal(h.writes.length,0);
});

test('spot and food IDs are typed and a spot confirmation never marks it visited',async()=>{
  const h=harness(),app=h.app;
  app.openG4('spot','shared');assert.equal(app.state.g4.type,'spot');
  app.renderVals().g4OnStay(event('unlimited'));await app.saveG4();
  assert.equal(h.writes[0][0],'setu_spots');assert.equal(h.writes[0][2].stay_limit_min,0);
  assert.equal(h.writes[0][2].status,undefined);
  assert.equal(app.state.spots[0].status,'try');assert.equal(app.state.outings[0].status,'planned');
  assert.equal(app.state.od.note,'Keep my day draft');
});

test('hub sit-long and saved-spot entry points open the same spot-aware form without changing the draft',()=>{
  const h=harness(),app=h.app,before=plain(app.state.od);
  app.state.screen='hub';app.state.sitHubFor=HUB.id;
  const seated=app.renderVals().hbSitRows.find(x=>x.key==='spot:shared');
  assert.ok(seated);
  seated.confirm();assert.equal(app.state.g4.type,'spot');app.closeG4();
  const spot=app.renderVals().hbSpots.find(x=>x.name==='Fictional study bench');
  const action=spot.acts.find(x=>x.label==='Visited / Confirm seating');
  assert.ok(action);action.go();assert.equal(app.state.g4.type,'spot');app.closeG4();
  assert.deepEqual(plain(app.state.od),before);assert.equal(h.writes.length,0);
});

test('cloud reads recognize the approved per-field column without borrowing legacy dates',async()=>{
  const h=harness(), app=h.app;
  const data={
    setu_food_notes:[{id:'f-cloud',rev:4,name:'Fictional café',accepted:true,status:'try',seating_type:'free_seating',
      min_order_yen:0,stay_limit_min:null,confidence:'confirmed',last_checked:'2026-09-01',seating_checks:{min_order_yen:'2026-11-15'}}],
    setu_spots:[{id:'s-cloud',rev:6,name:'Fictional bench',hub_id:HUB.id,accepted:true,status:'done',
      stay_limit_min:0,seating_checks:{stay_limit_min:'2026-11-14'}}],
    setu_hubs:[{id:HUB.id,name:HUB.name,themes:[]}]
  };
  const query=table=>({select(){return this;},is(){return this;},order(){return this;},eq(){return this;},limit(){return this;},
    then(resolve,reject){return Promise.resolve({data:data[table]||[],error:null}).then(resolve,reject);}});
  h.window.setu.sb={from:query};app.geocodeMissing=()=>{};app.locateQuiet=()=>{};
  // Use the shipped pullCloud loader, rather than the no-I/O stub from the fixture.
  const prototype=Object.getPrototypeOf(app);
  await prototype.pullCloud.call(app);
  const food=app.state.foods[0],spot=app.state.spots[0];
  assert.equal(food.seatingChecksSupported,true);assert.equal(spot.seatingChecksSupported,true);
  assert.equal(food.min_order_yen,0);assert.equal(food.stay_limit_min,null);
  assert.deepEqual(plain(food.seatingChecks),{min_order_yen:'2026-11-15'});
  assert.equal(h.g4OwnDate(food,'seating_type',TODAY),null,'legacy confidence cannot confirm unchecked policy');
  assert.equal(h.g4OwnDate(food,'min_order_yen',TODAY),'2026-11-15');
  assert.equal(h.g4OwnDate(spot,'stay_limit_min',TODAY),'2026-11-14');
  assert.equal(h.writes.length,0);
});

test('local saved-food confirmation persists in the existing browser store',async()=>{
  const h=harness({cloud:false}),app=h.app;
  app.openG4('food','shared');app.renderVals().g4OnPolicy(event('free_seating'));
  await app.saveG4();
  assert.equal(h.writes.length,0);assert.equal(app.state.foods[0].seating_type,'free_seating');
  assert.deepEqual(plain(app.state.foods[0].seatingChecks),{seating_type:'2026-11-15'});
  const stored=JSON.parse(h.storage.get('setu.food.v1'));assert.deepEqual(stored[0].seatingChecks,{seating_type:'2026-11-15'});
});

test('dated individual checks are visible in seating results without recasting earlier facts',()=>{
  const h=harness(), source=row('checked',{stay_limit_min:90,
    seatingChecks:{seating_type:'2026-11-14',stay_limit_min:'2026-11-15'},confidence:'reviews'});
  const result=h.sitLongModel({hub:HUB,foods:[source],spots:[],at:TODAY,now:TODAY})[0];
  assert.match(result.personalChecksText,/seating policy 2026-11-14/);
  assert.match(result.personalChecksText,/stay limit 2026-11-15/);
  assert.doesNotMatch(result.personalChecksText,/order requirement/);
  assert.match(result.policyText,/Policy unverified/,'source confidence is distinct from personal checks');
  assert.equal(h.g4OwnDate({...source,seatingChecks:{seating_type:'2026-11-16'}},'seating_type',TODAY),null);
  assert.equal(h.g4OwnDate({...source,stay_limit_min:null,seatingChecks:{stay_limit_min:'2026-11-14'}},'stay_limit_min',TODAY),null,
    'a stray metadata date never turns an unknown stay limit into a confirmed one');
});

test('all sit-long result flows and place details expose one shared confirmation sheet',()=>{
  for (const token of ['isSeatFinder','odSitRows','hbSitRows','pCanConfirm','g4Open']) assert.match(template,new RegExp(token));
  assert.equal((template.match(/sc-camel-on-click="\{\{ sr.confirm \}\}"/g)||[]).length,3);
  assert.match(template,/Visited \/ Confirm seating details/);
  assert.match(template,/role="dialog" aria-modal="true"/);
  assert.match(template,/@media\(max-width:420px\)\{\.seat-confirm-backdrop/);
  assert.doesNotMatch(template,/sc-camel-on-click="\{\{ g4Save \}\}"[^>]*>Save day/);
});

test('migration is additive, scoped to the two seating tables, and does not alter access rules',()=>{
  const files=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.includes('g4_seating_field_confirmations.sql'));
  assert.equal(files.length,1);
  const sql=fs.readFileSync(new URL(`../supabase/migrations/${files[0]}`,import.meta.url),'utf8');
  assert.match(sql,/alter table public\.setu_food_notes[\s\S]*?add column if not exists seating_checks/);
  assert.match(sql,/alter table public\.setu_spots[\s\S]*?add column if not exists seating_checks/);
  assert.match(sql,/jsonb not null default '\{\}'::jsonb/);
  assert.doesNotMatch(sql,/\b(?:grant|revoke|create policy|drop policy|update|delete from|insert into)\b/i);
});
