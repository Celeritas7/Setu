import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {verifiedChrome} from '../helpers/research-browser-binary.mjs';

test('account-bound selection and explicit confirmation in a browser',async t=>{
  const browser=await chromium.launch({executablePath:await verifiedChrome(),args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  const origin='http://127.0.0.1';
  const source=await readFile(new URL('../fixtures/trip-draft-consent.mjs',import.meta.url),'utf8');
  await page.route('**/*',route=>{
    const url=route.request().url();
    if (url===origin+'/') return route.fulfill({contentType:'text/html',body:'<main></main>'});
    if (url===origin+'/consent.mjs') return route.fulfill({contentType:'text/javascript',body:source});
    return route.abort();
  });
  await page.goto(origin);
  await page.evaluate(async ()=>{
    const {openConsent}=await import('/consent.mjs');
    const proposals=['Library','Courtyard'].map((space,index)=>({
      source:{trip_id:'33333333-3333-4333-8333-333333333333',stop_index:index,observation_index:0},
      stop_name:space,place_ref:null,observation:{space,date:'2026-11-26',outcome:'Visited',spend_yen:index?null:0,note:null}
    }));
    window.calls=[];
    window.openReview=()=>{
      window.user={id:'account-A'};
      openConsent(document.querySelector('main'),{proposals,owner:'account-A',
        auth:{async getUser(){if(window.pause) await new Promise(resolve=>window.resume=resolve);return {data:{user:window.user}};}},
        onSessionChange(fn){window.notifyUser=fn;return ()=>{window.notifyUser=null;};},
        capture:(owner,batch)=>calls.push({owner,batch})});
    };
    openReview();
  });
  const boxes=page.getByRole('checkbox'), review=page.getByRole('button',{name:'Review selected observations'});
  const confirm=page.getByRole('button',{name:'Confirm selected observations'});
  assert.ok(await review.isDisabled());
  await boxes.first().check();await review.click();
  assert.match(await page.locator('pre').innerText(),/Library/);
  await boxes.last().check();
  assert.ok(await confirm.isDisabled());
  assert.equal(await page.locator('pre').innerText(),'');
  await boxes.first().uncheck();await review.click();
  const reviewed=JSON.parse(await page.locator('pre').innerText());
  await confirm.click();
  const calls=await page.evaluate(()=>window.calls);
  assert.equal(calls.length,1);assert.equal(calls[0].owner,'account-A');
  assert.deepEqual(calls[0].batch,reviewed);
  assert.deepEqual(calls[0].batch.proposals.map(row=>row.stop_name),['Courtyard']);
  await page.evaluate(()=>openReview());await boxes.first().check();await review.click();
  await page.evaluate(()=>{window.pause=true;window.resume=null;});
  await confirm.click();await page.waitForFunction(()=>typeof window.resume==='function');
  await boxes.last().check();
  await page.evaluate(()=>{window.pause=false;resume();});
  assert.ok(await confirm.isDisabled());
  assert.equal(await page.evaluate(()=>calls.length),1);
  await page.getByRole('button',{name:'Cancel'}).click();
  for (const event of ['switch','cancel','anonymous','signout']) {
    await page.evaluate(()=>openReview());await boxes.first().check();await review.click();
    await page.evaluate(()=>{window.pause=true;window.resume=null;});
    await confirm.click();await page.waitForFunction(()=>typeof window.resume==='function');
    if (event==='switch') await page.evaluate(()=>{notifyUser({id:'account-B'});window.user={id:'account-A'};});
    if (event==='cancel') await page.getByRole('button',{name:'Cancel'}).click();
    if (event==='anonymous') await page.evaluate(()=>{window.user.is_anonymous=true;});
    if (event==='signout') await page.evaluate(()=>{window.user=null;});
    await page.evaluate(()=>{window.pause=false;resume();});
    await page.getByRole('status').filter({hasText:/cancelled|changed|could not be verified/}).waitFor();
    assert.equal(await page.evaluate(()=>calls.length),1);
  }
});
