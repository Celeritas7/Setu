import assert from 'node:assert/strict';
import test from 'node:test';
import {model,template,appHarness,query,hub,place,now} from './helpers/next-places-fixture.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
function run(spots,{foods=[],hubs=[hub],...changes}={}){const h=appHarness(),data=model.project({spots,foods,hubs},h.helpers);return {data,...model.rank(data,{...query,...changes},h.helpers,now)};}

test('at most five preview cards, with all remaining matches available and no filler',()=>{
  const data=run(Array.from({length:8},(_,i)=>place('p'+i)));assert.equal(data.rows.slice(0,5).length,5);assert.equal(data.total,8);
  assert.equal(run([place('only')]).rows.length,1);assert.equal(run([]).rows.length,0);
});
test('typed identities, duplicate rows, skipped/deleted/unaccepted and sick-day visibility',()=>{
  const rows=[place('same'),place('same'),place('skip',{status:'skip'}),place('deleted',{deleted_at:'2026-11-20'}),place('suggested',{accepted:false}),place('sick',{themes:['sick-day']})];
  const data=run(rows,{foods:[place('same')]});assert.deepEqual(data.rows.map(x=>x.key).sort(),['food:same','spot:same']);
});
test('ordinary visited places stay out, while explicitly repeatable rest/grocery and go-back records stay available',()=>{
  const r=run([place('visited',{status:'done'}),place('bench',{status:'done',themes:['sit-long']}),place('grocery',{status:'done',themes:['local-grocery']})],{foods:[place('again',{status:'done',go_back:true})]});
  assert.deepEqual(r.rows.map(x=>x.key).sort(),['food:again','spot:bench','spot:grocery']);
});
test('unknown and zero costs differ; minimum orders and estimates stay separate and a zero budget is enforced',()=>{
  const r=run([place('unknown'),place('zero',{spend_yen:0}),place('cost',{spend_yen:400}),place('minimum',{min_order_yen:200,spend_yen:0})],{budget:'0'});
  assert.deepEqual(r.rows.map(x=>x.key).sort(),['spot:unknown','spot:zero']);assert.match(r.rows.find(x=>x.key==='spot:zero').costText,/estimate ¥0/);
  assert.match(r.rows.find(x=>x.key==='spot:unknown').costText,/unknown/);assert.equal(r.excluded.length,2);
  assert.ok(r.rows.every(x=>x.warnings.some(w=>/Travel costs and extra fees are unknown/.test(w))));
});
test('invalid, fractional or unsafe prices remain unknown instead of becoming free',()=>{
  const r=run([place('bad',{spend_yen:-1}),place('fraction',{spend_yen:1.5}),place('bool',{spend_yen:false}),place('large',{spend_yen:Number.MAX_SAFE_INTEGER+1})]);
  assert.ok(r.rows.every(x=>x.cost===null));
});
test('closing checks include estimated travel and the requested stay; an unverified route stays explicit',()=>{
  const r=run([place('fits',{hours:{thu:[['09:00','12:35']]}}),place('short',{hours:{thu:[['09:00','12:15']]}}),place('closed',{hours:{thu:[]}})]);
  assert.deepEqual(r.rows.map(x=>x.key),['spot:fits']);assert.equal(r.excluded.length,2);
  assert.ok(r.rows[0].travelMin>0);assert.equal(r.rows[0].returnStatus,'unverified');assert.equal(r.rows[0].leaveBy,null);
});
test('Japan-local overnight intervals, lunch breaks, closing-only uncertainty and continuous weeks reuse the shipped hours checker',()=>{
  assert.equal(run([place('overnight',{hours:{wed:[['17:00','26:00']],thu:[]}})],{time:'01:00'}).rows.length,1);
  assert.equal(run([place('lunch',{hours:{thu:[['09:00','12:15'],['13:00','18:00']]}})]).excluded.length,1);
  assert.match(run([place('partial',{hours:{thu:[[null,'18:00']]}})]).rows[0].hoursText,/unknown/);
  const hours=Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[['00:00','24:00']]]));
  const row=run([place('all-day',{hours})],{visitMin:90}).rows[0];assert.match(row.hoursText,/continuous/);assert.equal(row.closesAt,null);
});
test('stale or future-dated hours cannot establish current opening/closure; holiday uncertainty remains',()=>{
  for(const date of ['2020-01-01','2027-01-01',null]){
    const row=run([place('old',{hours:{thu:[]},hours_seen:date})]).rows[0];assert.ok(row);assert.match(row.hoursText,/recheck/);assert.equal(row._tier,1);
  }
  assert.ok(run([place('weekly')]).rows[0].warnings.some(w=>/holiday exceptions/.test(w)));
});
test('undated checks cannot infer opening, an arrival time or a safe return',()=>{
  const row=run([place('p')],{date:''}).rows[0];assert.equal(row.arrival,null);assert.match(row.hoursText,/select a date/);assert.equal(row.leaveBy,null);
});
test('missing or malformed coordinates have no fabricated proximity or travel time',()=>{
  for(const coordinate of [null,'',false,NaN,Infinity,91]){
    const row=run([place('unplaced',{lat:coordinate})]).rows[0];assert.equal(row.distanceKm,null);assert.equal(row.travelMin,null);assert.equal(row.arrival,null);
  }
  const r=run([place('far',{lat:36})]);assert.equal(r.rows.length,0);assert.match(r.excluded[0].excluded[0],/distance/);
});
test('rain excludes explicitly exposed outdoor places and promotes recorded cover without certifying access',()=>{
  const r=run([place('out',{setting:'outdoor'}),place('covered',{setting:'indoor'}),place('unknown')],{weather:'rain'});
  assert.equal(r.excluded[0].key,'spot:out');assert.equal(r.rows[0].key,'spot:covered');assert.match(r.rows[0].shelterText,/unverified/);
});
test('recorded quiet/rest preferences and category variety affect feasible previews',()=>{
  const places=[place('a',{kind:'shop'}),place('b',{kind:'shop'}),place('c',{kind:'shop'}),place('quiet',{kind:'other',quiet:3,themes:['sit-long']}),place('sight')];
  const r=run(places);assert.equal(r.rows[0].key,'spot:quiet');assert.ok(new Set(r.rows.slice(0,3).map(x=>x.kind)).size>=2);
});
test('beef-focused meals are excluded; unknown broths and vegan beef alternatives are not certified',()=>{
  const r=run([],{foods:[place('beef',{name:'Beef bowl'}),place('chicken',{name:'Chicken lunch'}),place('vegan',{name:'Vegan beef alternative'})]});
  assert.deepEqual(r.rows.map(x=>x.key).sort(),['food:chicken','food:vegan']);assert.ok(r.rows.every(x=>x.warnings.some(w=>/broths/.test(w))));
});
test('raw prose and supplied safe-return labels cannot produce a verified return or leave-by time',()=>{
  const result=run([place('remote',{return_status:'verified_with_margin',safe_leave_by:'18:00',verified:'Safe return',themes:['remote']}),place('town')]),row=result.excluded[0];
  assert.equal(row.returnStatus,'unverified');assert.equal(row.leaveBy,null);assert.equal(row.eligibility,'needs_checks');
  assert.equal(result.rows[0].key,'spot:town');assert.match(row.excluded[0],/Remote\/trail/);
});
test('known access restrictions and recorded stay limits exclude a place, while zero means explicitly unlimited',()=>{
  const r=run([place('blocked',{access_state:'prohibited'}),place('short',{stay_limit_min:20}),place('unlimited',{stay_limit_min:0})]);
  assert.deepEqual(r.rows.map(x=>x.key),['spot:unlimited']);assert.equal(r.excluded.length,2);
});
test('invalid controls fail visibly; the date is checked as a real Japan-local calendar date',()=>{
  for(const changed of [{origin:''},{date:'2026-02-30'},{time:'24:00'},{visitMin:0},{visitMin:481},{budget:'-1'},{budget:'1.5'},{radiusKm:0}])assert.ok(run([place('p')],changed).errors.length,JSON.stringify(changed));
  assert.equal(model.instant('2026-11-26','01:00').toISOString(),'2026-11-25T16:00:00.000Z');
});
test('projection omits private reviews and observations, keeps source dates, and never changes the source records',()=>{
  const original={spots:[place('p',{review:'PRIVATE',rating:5,personal_confirmed_experiences:['Cocoon'],hours_seen:'2026-11-25',spend_seen:'2026-11-24'})],foods:[],hubs:[hub]},before=copy(original);
  const h=appHarness(),data=model.project(original,h.helpers),r=model.rank(data,query,h.helpers,now);
  assert.deepEqual(original,before);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(JSON.stringify(r).includes('Cocoon'),false);assert.match(r.rows[0].priceEvidence,/2026-11-24/);
});
test('unsafe source URLs and Maps lookalikes never become executable card links',()=>{
  for(const url of ['javascript:alert(1)','https://user:pass@example.org','https://www.google.com.evil.example/maps/a']){
    const row=run([place('p',{source_url:url})]).rows[0];assert.match(row.maps,/^https:\/\/www.google.com\/maps\/search/);if(url.startsWith('javascript')||url.includes('user:'))assert.equal(row.source,'');
  }
});
test('signed-in previews use only the matching identity-bound snapshot; signed-out data excludes stale cloud spots',()=>{
  const h=appHarness(),raw={setu_food_notes:[place('a-food')],setu_spots:[place('a-spot')],setu_hubs:[hub]};
  h.app.state={...h.app.state,user:{id:'A'},cloud:true,foods:[place('stale-rendered')],spots:[place('stale-spot')]};h.app.researchComparison={userId:'A',tables:raw};
  assert.deepEqual(Array.from(h.app.nextPlacesData().data.records,x=>x.key).sort(),['food:a-food','spot:a-spot']);
  h.app.state.user={id:'B'};assert.equal(h.app.nextPlacesData().data.records.length,0);
  h.app.state={...h.app.state,user:null,foods:[place('local')]};assert.deepEqual(Array.from(h.app.nextPlacesData().data.records,x=>x.key),['food:local']);assert.deepEqual(h.writes,[]);assert.deepEqual(h.requests,[]);
});
test('Home/menu use the actual callback; the preview suppresses map following without changing map mode',()=>{
  const h=appHarness();assert.equal((template.match(/sc-camel-on-click="\{\{ openNextPlaces \}\}"/g)||[]).length,2);
  assert.equal(typeof h.app.renderVals().openNextPlaces,'function');h.app.state={...h.app.state,screen:'map',mv:{...h.app.state.mv,scope:'near'}};
  h.app.nextPlacesOpen=true;assert.equal(h.app.mapLocationActive(),false);assert.equal(h.app.state.mv.scope,'near');
});

for (const nextOwner of [null, 'B']) for (const failure of [false, true]) {
  test('pending cloud ' + (failure ? 'failure' : 'success') + ' after ' + (nextOwner || 'sign-out'), async () => {
    const {app,window,storage} = appHarness();
    const pending = Promise.withResolvers();
    let auth, owner = 'A';
    storage.set('setu.food.v1', JSON.stringify([place('local')]));
    window.setu.onAuth = fn => { auth = fn; return () => {}; };
    window.setu.sb = {from(table) {
      const reply = owner === 'A' ? pending.promise : Promise.resolve({
        data: table === 'setu_food_notes' ? [place('B-food')] : []
      });
      return {select(){return this;},is(){return this;},order(){return this;},limit(){return this;},
        eq(){return this;},then(ok,fail){return reply.then(ok,fail);}};
    }};
    app.geocodeMissing = app.locateQuiet = () => {};
    app.componentDidMount();
    auth({id:'A'});
    owner = nextOwner;
    auth(owner ? {id:owner} : null);
    await new Promise(resolve => setImmediate(resolve));
    if (failure) pending.reject(Error('old account request failed'));
    else pending.resolve({data:[place('A-food')]});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.state.cloudErr, '');
    assert.equal(app.state.cloud, !!owner);
    const expected = owner ? 'B-food' : 'local';
    assert.deepEqual(Array.from(app.state.foods, row => row.id), [expected]);
    assert.deepEqual(Array.from(app.nextPlacesData().data.records, row => row.key), ['food:'+expected]);
    app.componentWillUnmount();
  });
}

test('quiet preference uses the saved busy-to-quiet scale',()=>{
  const {rows}=run([1,2,3,null].map((quiet,i)=>place(String(i),{quiet})));
  assert.deepEqual(rows.slice(0,2).map(row=>row.quiet),[3,2]);
  assert.match(rows.find(row=>row.quiet===1).quietText,/busy/);
  assert.match(rows.find(row=>row.quiet===null).quietText,/unknown/);
});

test('linked food names feed both the dietary check and Maps search',()=>{
  const {app,helpers}=appHarness();
  app.state.user={id:'current'};app.state.cloud=true;
  app.researchComparison={userId:'current',tables:{setu_hubs:[hub],
    akatsuki_shops:[{id:1,name:'Example Beef Bowl'},{id:2,name:'Example Cafe'}],
    setu_food_notes:[1,2].map(id=>place(id,{name:null,shop_id:String(id),address:'Example street'}))}};
  const {rows,excluded}=model.rank(app.nextPlacesData().data,query,helpers,now);
  assert.deepEqual(excluded.map(row=>row.name),['Example Beef Bowl']);
  assert.deepEqual(rows.map(row=>row.name),['Example Cafe']);
  assert.match(new URL(rows[0].maps).searchParams.get('query'),/Example Cafe/);
});

test('research map filters preserve practical versus potential tag identity',()=>{
  const {app}=appHarness();
  const indoor={tags:['Practical · Indoor','Potential · Cocoon']};
  const other={tags:['Practical · Cocoon']};
  app.state.researchPins=[indoor,other];
  assert.deepEqual(app.filteredResearchPins(),[indoor,other]);
  app.state.researchTag='Potential · Cocoon';
  assert.deepEqual(app.filteredResearchPins(),[indoor]);
  app.state.researchTag='Practical · Cocoon';
  assert.deepEqual(app.filteredResearchPins(),[other]);
});
