import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {verifiedChrome} from '../helpers/research-browser-binary.mjs';
import {freshResearchApi} from '../helpers/research-http-gateway.mjs';
import {A,B} from '../helpers/research-cloud-fixture.mjs';

test('browser confirmation sends only the reviewed observations to local PostgREST',async t=>{
  const api=await freshResearchApi({async prepareDatabase(admin){
    for (const file of ['live-trip-draft-schema.sql','live-trip-draft-batch.sql','live-trip-draft-correction.sql','live-trip-draft-withdrawal.sql']) {
      await admin.query(await readFile(new URL('../fixtures/'+file,import.meta.url),'utf8'));
    }
  }});
  t.after(()=>api.close());
  const browser=await chromium.launch({executablePath:await verifiedChrome(),args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  const rpcPath='/rest/v1/rpc/setu_rehearse_trip_draft';
  const bodies=[],withdrawals=[];
  let swapAtDispatch=false, releaseFirst;
  const firstRequestGate=new Promise(resolve=>{releaseFirst=resolve;});
  const otherToken=await api.token(B);
  const assets=new Map([
    ['/correction.mjs',new URL('../fixtures/trip-draft-correction-editor.mjs',import.meta.url)],
    ['/consent.mjs',new URL('../fixtures/trip-draft-consent.mjs',import.meta.url)],
    ['/sdk.js',new URL('../../node_modules/@supabase/supabase-js/dist/umd/supabase.js',import.meta.url)]
  ]);
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if (url.origin!==api.url) return route.abort();
    if (url.pathname==='/') return route.fulfill({contentType:'text/html',body:'<main></main><script src="/sdk.js"></script>'});
    if (assets.has(url.pathname)) return route.fulfill({contentType:'text/javascript',body:await readFile(assets.get(url.pathname))});
    if (url.pathname==='/rest/v1/rpc/setu_rehearse_withdraw_observation') withdrawals.push(req.postDataJSON());
    if (url.pathname===rpcPath) {
      bodies.push(req.postDataJSON());
      if (bodies.length===1) await firstRequestGate;
      if (swapAtDispatch) return route.continue({headers:{...req.headers(),authorization:'Bearer '+otherToken}});
    }
    return route.continue();
  });
  await page.goto(api.url);
  const trip=randomUUID();
  await page.evaluate(async ({owner,token,trip})=>{
    const {openConsent}=await import('/consent.mjs');
    const sb=window.supabase.createClient(location.origin,'synthetic-rehearsal-key',{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
    const {error}=await sb.auth.setSession({access_token:token,refresh_token:'synthetic-unused'});
    if (error) throw error;
    const proposals=['Library','Park'].map((name,index)=>({
      source:{trip_id:trip,stop_index:index,observation_index:0},stop_name:name,place_ref:null,
      observation:{space:name,outcome:'Visited',date:'2026-11-26',note:null,spend_yen:index?0:null}
    }));
    window.review=()=>openConsent(document.querySelector('main'),{owner,proposals,auth:sb.auth,
      onSessionChange(fn){
        const {data}=sb.auth.onAuthStateChange((event,session)=>fn(session?.user));
        return ()=>data.subscription.unsubscribe();
      },
      async capture(expected_owner,batch){
        const result=await sb.rpc('setu_rehearse_trip_draft',{expected_owner,batch});
        if (result.error) throw result.error;
      }
    });
    const {openCorrection}=await import('/correction.mjs');
    window.editPark=()=>openCorrection(document.querySelector('main'),sb,{expected_owner:owner,trip,stop:1,occurrence:0});
    window.review();
  },{owner:A,token:await api.token(A),trip});
  const choose=async index=>{
    await page.getByRole('checkbox').nth(index).check();
    await page.getByRole('button',{name:'Review selected observations'}).click();
    await page.waitForFunction(()=>document.querySelector('pre')?.textContent.length>0);
    return JSON.parse(await page.locator('pre').innerText());
  };
  const rows=async()=> (await api.db.admin.query('select owner_id,stop_name,observation from public.setu_place_update_drafts')).rows;
  await choose(0);
  await page.getByRole('button',{name:'Cancel'}).click();
  assert.deepEqual(bodies,[]);assert.deepEqual(await rows(),[]);
  await page.evaluate(()=>window.review());
  const reviewed=await choose(1);
  await page.getByRole('button',{name:'Confirm selected observations'}).click();
  try {
    await page.getByText('Submitting selected observations…').waitFor();
    assert.deepEqual(await rows(),[]);
  } finally {releaseFirst();}
  await page.getByText('Selected observations confirmed in rehearsal.').waitFor();
  assert.deepEqual(bodies,[{expected_owner:A,batch:reviewed}]);
  const saved=[{owner_id:A,stop_name:'Park',observation:reviewed.proposals[0].observation}];
  assert.deepEqual(await rows(),saved);
  await page.evaluate(()=>window.review());
  await choose(0);
  swapAtDispatch=true;
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===rpcPath);
  await page.getByRole('button',{name:'Confirm selected observations'}).click();
  assert.equal((await response).status(),403);
  await page.getByText(/Save could not be confirmed/).waitFor();
  assert.equal(bodies.length,2);
  assert.deepEqual(await rows(),saved);

  await t.test('conflicting browser edit retains input and requires a fresh comparison',async ()=>{
    swapAtDispatch=false;
    await page.evaluate(()=>window.editPark());
    await page.getByText(/Saved revision 1 · Park/).waitFor();
    const note=page.getByLabel('First-hand note'), yen=page.getByLabel(/Actual yen/);
    const reviewEdit=page.getByRole('button',{name:'Review correction'});
    const confirm=page.getByRole('button',{name:'Confirm correction'});
    await note.fill('My updated note.');await yen.fill('');await reviewEdit.click();
    const {sb:second}=await api.sdk(A);
    const newer={...saved[0].observation,note:'Second session note.',space:'Park shelter',spend_yen:150};
    const args={expected_owner:A,trip,stop:1,occurrence:0,reviewed_revision:1,replacement:newer};
    assert.equal((await second.rpc('setu_rehearse_correct_observation',args)).data,2);
    await confirm.click();
    await page.getByText(/Another edit was saved/).waitFor();
    assert.ok(await confirm.isDisabled());
    assert.ok(await reviewEdit.isDisabled());
    await page.getByRole('button',{name:'Load latest revision'}).click();
    await page.getByText(/Saved revision 2 · Park/).waitFor();
    assert.match(await page.locator('pre').first().innerText(),/Second session note/);
    assert.equal(await note.inputValue(),'My updated note.');
    assert.equal(await yen.inputValue(),'');
    assert.ok(await confirm.isDisabled());
    assert.deepEqual((await rows())[0].observation,newer);
    await reviewEdit.click();await yen.fill('0');assert.ok(await confirm.isDisabled());
    await reviewEdit.click();await confirm.click();
    await page.getByText('Saved revision 3.').waitFor();
    assert.deepEqual((await rows())[0].observation,{...newer,note:'My updated note.',spend_yen:0});
    await page.evaluate(()=>window.editPark());
    await page.getByText(/Saved revision 3 · Park/).waitFor();
    await note.fill('Discard me');await reviewEdit.click();
    await page.getByRole('button',{name:'Cancel'}).click();
    await page.getByText('Correction cancelled.').waitFor();
    assert.equal((await rows())[0].observation.note,'My updated note.');
  });
  await t.test('withdrawal requires confirmation of the current saved revision',async ()=>{
    const {sb}=await api.sdk(A);
    const key={expected_owner:A,trip,stop:1,occurrence:0};
    const current=async ()=>(await sb.rpc('setu_rehearse_review_observation',key)).data;
    const [before]=await current();
    const open=()=>page.evaluate(()=>window.editPark());
    const prepare=page.getByRole('button',{name:'Review withdrawal'});
    const confirm=page.getByRole('button',{name:'Confirm withdrawal'});
    await open();await prepare.click();
    await page.getByText(/Its original observation stays in storage/).waitFor();
    await page.getByRole('button',{name:'Cancel'}).click();
    await page.getByText('Withdrawal cancelled.').waitFor();
    assert.deepEqual(withdrawals,[]);
    assert.deepEqual(await current(),[before]);
    await open();await prepare.click();
    const replacement={...before.observation,note:'Reviewed after the trip.'};
    const edit=await sb.rpc('setu_rehearse_correct_observation',{...key,reviewed_revision:before.revision,replacement});
    assert.equal(edit.error,null);
    await confirm.click();
    await page.getByText(/Another edit was saved/).waitFor();
    assert.ok(await prepare.isDisabled());
    await page.getByRole('button',{name:'Load latest revision'}).click();
    await page.getByText(/Saved revision .*Reviewed after the trip/s).waitFor();
    assert.equal(await confirm.count(),0);
    assert.equal((await current())[0].revision,edit.data);
    await prepare.click();await confirm.click();
    await page.getByText('Observation withdrawn from review.').waitFor();
    assert.deepEqual(withdrawals,[{...key,reviewed_revision:before.revision},{...key,reviewed_revision:edit.data}]);
    assert.deepEqual(await current(),[]);
    assert.deepEqual((await rows())[0].observation,replacement);
  });
});
