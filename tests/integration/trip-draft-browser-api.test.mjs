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
    for (const file of ['live-trip-draft-schema.sql','live-trip-draft-batch.sql']) {
      await admin.query(await readFile(new URL('../fixtures/'+file,import.meta.url),'utf8'));
    }
  }});
  t.after(()=>api.close());
  const browser=await chromium.launch({executablePath:await verifiedChrome(),args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  const rpcPath='/rest/v1/rpc/setu_rehearse_trip_draft';
  const bodies=[];
  let swapAtDispatch=false, releaseFirst;
  const firstRequestGate=new Promise(resolve=>{releaseFirst=resolve;});
  const otherToken=await api.token(B);
  const assets=new Map([
    ['/consent.mjs',new URL('../fixtures/trip-draft-consent.mjs',import.meta.url)],
    ['/sdk.js',new URL('../../node_modules/@supabase/supabase-js/dist/umd/supabase.js',import.meta.url)]
  ]);
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if (url.origin!==api.url) return route.abort();
    if (url.pathname==='/') return route.fulfill({contentType:'text/html',body:'<main></main><script src="/sdk.js"></script>'});
    if (assets.has(url.pathname)) return route.fulfill({contentType:'text/javascript',body:await readFile(assets.get(url.pathname))});
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
});
