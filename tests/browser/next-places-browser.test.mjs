import assert from 'node:assert/strict';
import test,{before,after,beforeEach,afterEach} from 'node:test';
import {freshNextPlacesBrowser,dataset} from '../helpers/next-places-browser.mjs';
import {place} from '../helpers/next-places-fixture.mjs';

let h;
before(async()=>{h=await freshNextPlacesBrowser();},{timeout:60000});
after(async()=>{await h?.close();},{timeout:20000});
beforeEach(()=>{h.errors.length=0;h.blocked.length=0;});
afterEach(async()=>{for(const context of h.browser.contexts())for(const page of context.pages())if(!page.isClosed())assert.deepEqual(await page.evaluate(()=>window.__checks),{writes:0,gps:0});await h.closeContexts();assert.deepEqual(h.errors,[]);assert.deepEqual(h.blocked,[]);});
const cards=page=>page.locator('#np-results article');
async function update(page){await page.getByRole('button',{name:'Update preview',exact:true}).click();}
async function dated(page){await page.locator('#np-date').fill('2026-11-26');await page.locator('#np-time').fill('12:00');await update(page);}

test('actual app entry opens five tentative places with unverified return and leaves source records unchanged',async()=>{
  const {page}=await h.open();assert.equal(await cards(page).count(),5);assert.match(await page.locator('#np-status').innerText(),/8 candidates need checks/);
  assert.equal(await page.getByText('Needs route & return check',{exact:true}).count(),5);assert.equal(await page.evaluate(()=>__nextFixture.unchanged()),true);
  assert.equal(await page.locator('#np-date').inputValue(),'');assert.match(await cards(page).first().innerText(),/Hours unchecked/);
});
test('a smaller set stays smaller and unknown prices remain different from a recorded zero estimate',async()=>{
  const data=dataset(3);data.setu_spots[0].spend_yen=0;const {page}=await h.open(data);await dated(page);
  assert.equal(await cards(page).count(),3);assert.match(await page.locator('#np-results').innerText(),/estimate ¥0/);assert.match(await page.locator('#np-results').innerText(),/Visit budget unknown/);
  await cards(page).first().locator('summary').click();assert.match(await cards(page).first().innerText(),/holiday exceptions/);
});
test('changed inputs clear old results; budget, rain, closing, remote access and beef exclusions stay inspectable',async()=>{
  const data=dataset(1);data.setu_spots.push(place('closed',{hours:{thu:[]}}),place('expensive',{spend_yen:2000}),place('rain',{setting:'outdoor'}),place('trail',{themes:['trail']}));data.setu_food_notes.push(place('beef',{name:'Beef restaurant'}));
  const {page}=await h.open(data);await page.locator('#np-budget').fill('1000');assert.equal(await cards(page).count(),0);assert.match(await page.locator('#np-status').innerText(),/Settings changed/);
  await page.locator('#np-weather').selectOption('rain');await dated(page);assert.equal(await cards(page).count(),1);
  await page.locator('#np-mode').selectOption('excluded');assert.equal(await cards(page).count(),5);const body=await page.locator('#np-results').innerText();for(const reason of [/closed/,/budget/,/rain cover/,/Remote\/trail/,/Beef-focused/])assert.match(body,reason);
});
test('all matching candidates page in fives and excluded-only results do not invent an alternative',async()=>{
  const {page}=await h.open(dataset(12));await page.locator('#np-mode').selectOption('all');assert.equal(await cards(page).count(),5);await page.getByRole('button',{name:'Next →',exact:true}).click();assert.match(await page.getByText('6–10 of 12',{exact:true}).innerText(),/6–10/);assert.equal(await cards(page).count(),5);
  await page.locator('#np-budget').fill('0');await update(page);assert.equal(await page.getByText('1–5 of 12',{exact:true}).count(),1);
  const onlyClosed=dataset(2);onlyClosed.setu_spots.forEach(x=>x.hours={thu:[]});const other=await h.open(onlyClosed);await dated(other.page);assert.equal(await cards(other.page).count(),0);assert.match(await other.page.locator('#np-results').innerText(),/No places fit/);
});
test('untrusted place names are literal text and Maps/source links preserve their safe provenance boundary',async()=>{
  const data=dataset(1),name='<img src=x onerror="alert(1)"> fictional';Object.assign(data.setu_spots[0],{name,source_url:'javascript:alert(1)',suggested_by:'DAY OFF #7'});
  const {page}=await h.open(data);assert.equal(await page.getByRole('heading',{name,exact:true}).count(),1);assert.equal(await page.locator('.next-places img').count(),0);assert.match(await cards(page).innerText(),/DAY OFF/);
  const link=await page.getByRole('link',{name:'Open place in Google Maps ↗',exact:true}).getAttribute('href');assert.equal(new URL(link).hostname,'www.google.com');assert.equal(await page.getByRole('link',{name:'Recorded source ↗',exact:true}).count(),0);
});
test('Escape and reopening remove the dialog and its account listener without changing the existing plan',async()=>{
  const {page}=await h.open();assert.equal(await page.evaluate(()=>__nextFixture.listeners.size),1);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>__nextFixture.listeners.size),0);
  await page.locator('#open').click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.evaluate(()=>__nextFixture.unchanged()),true);
});
test('switching accounts closes the old preview and a loading account cannot reuse its records',async()=>{
  const {page}=await h.open();await page.evaluate(()=>__nextFixture.switchAccount());await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('#open').click();await page.getByRole('dialog').waitFor();
  assert.match(await page.locator('#np-status').innerText(),/still loading/);assert.equal(await page.locator('#np-origin option').count(),1);assert.equal(await cards(page).count(),0);assert.equal(await page.getByText('Fictional place 0',{exact:true}).count(),0);
});
test('signed-out preview uses only local food records despite stale cloud hubs/spots and does not request GPS',async()=>{
  const {page}=await h.open();await page.evaluate(()=>__nextFixture.signOut());await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('#open').click();await page.getByRole('dialog').waitFor();await page.locator('#np-origin').selectOption('food:local1');await update(page);
  assert.equal(await cards(page).count(),1);assert.match(await cards(page).innerText(),/Local second place/);assert.match(await cards(page).innerText(),/Distance unknown/);assert.equal(await page.locator('#np-origin option').count(),3);
});
for(const width of [320,390,768,1280])test('dialog and long imported text fit a '+width+'px viewport',async()=>{
  const data=dataset(6);data.setu_hubs[0].name='FictionalArea'.repeat(30);data.setu_spots[0].name='LongFictionalPlace'.repeat(30);data.setu_spots[0].address='FictionalAddress'.repeat(30);
  const {page}=await h.open(data,{width});const sizes=await page.getByRole('dialog').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,viewport:innerWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
  assert.ok(sizes.scroll<=sizes.width+1,JSON.stringify(sizes));assert.ok(sizes.left>=0&&sizes.right<=width+1,JSON.stringify(sizes));
  if(width===390){assert.equal(await page.locator('#np-settings').getAttribute('open'),null);await page.getByText('Time, budget & weather',{exact:true}).click();await page.locator('#np-budget').fill('0');assert.equal(await cards(page).count(),0);await update(page);assert.equal(await cards(page).count(),5);}
});
