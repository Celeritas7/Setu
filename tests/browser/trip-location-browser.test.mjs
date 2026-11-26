import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {verifiedChrome} from '../helpers/research-browser-binary.mjs';

async function sessionPage(t) {
  const browser = await chromium.launch({executablePath: await verifiedChrome(), args: ['--no-sandbox']});
  t.after(() => browser.close());
  const page = await browser.newPage();
  const origin = 'http://127.0.0.1';
  const assets = new Map([
    ['trip-session.html', 'text/html'], ['css/research-import.css', 'text/css'],
    ['js/trip-session.js', 'application/javascript'], ['js/research-storage.js', 'application/javascript']
  ]);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(1);
    if (url.origin !== origin || !assets.has(path)) return route.abort();
    await route.fulfill({contentType: assets.get(path), body: await readFile(new URL('../../' + path, import.meta.url))});
  });
  return {page,origin};
}

test('trip location is explicit, temporary and cancelled in the background', async t => {
  const {page,origin}=await sessionPage(t);
  await page.addInitScript(() => {
    window.gps = {count: 0, cleared: []};
    Object.defineProperty(navigator, 'geolocation', {value: {
      watchPosition(ok, fail) { Object.assign(window.gps, {ok, fail}); return window.gps.count++; },
      clearWatch(id) { window.gps.cleared.push(id); }
    }});
  });
  await page.goto(origin + '/trip-session.html');
  await page.locator('#edit').waitFor();
  const locate = page.getByRole('button', {name: 'Check my location'});
  assert.equal(await locate.isHidden(), true);
  await page.getByLabel('Starting place').fill('Fictional stop');
  await page.locator('#submit').click();
  await locate.waitFor();
  assert.equal(await page.evaluate(() => gps.count), 0);
  const fix = () => page.evaluate(() => gps.ok({
    coords: {latitude: 10, longitude: 20, accuracy: 4.5}, timestamp: Date.now()
  }));
  const result = page.locator('#location-result');
  await locate.click();
  await fix();
  assert.match(await result.innerText(), /10.00000, 20.00000 · accuracy about 5 m/);
  await locate.click();
  await page.evaluate(() => gps.fail({code: 1}));
  assert.match(await result.innerText(), /permission denied/);
  await locate.click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {value: true, configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await fix();
  assert.equal(await result.innerText(), '');
  await page.evaluate(() => { delete document.hidden; });
  await locate.click();
  await page.locator('#finish').click();
  await locate.waitFor({state: 'hidden'});
  await fix();
  assert.deepEqual(await page.evaluate(() => gps.cleared), [0, 1, 2, 3]);
  assert.equal(await result.textContent(), '');
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const {trips} = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  assert.equal(trips[0].stops.length, 1);
  assert.deepEqual(Object.keys(trips[0].stops[0]).sort(), ['at', 'name']);
});

test('explicit observations keep the building and its rooms separate in a completed trip', async t => {
  const {page,origin}=await sessionPage(t);
  await page.goto(origin+'/trip-session.html');
  await page.getByLabel('Starting place').fill('Fictional museum');
  await page.locator('#submit').click();
  await page.locator('#finish').click();
  const add=page.getByRole('button',{name:'Add observation for Fictional museum'});
  const save=page.getByRole('button',{name:'Save observation'});
  await add.click();
  await page.locator('#outcome').selectOption({label:'Visited'});
  await page.locator('#spend').fill('0');
  await save.click();
  await add.click();
  await page.locator('#space').fill('Study room');
  await page.locator('#outcome').selectOption({label:'Did not enter'});
  await save.click();
  await add.click();
  await page.locator('#space').fill('Courtyard');
  await page.locator('#outcome').selectOption({label:'Personally reviewed'});
  await save.click();
  await page.getByText('Describe what you personally experienced.').waitFor();
  await page.locator('#note').fill('Bench was uncomfortable.');
  await save.click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.reload();
  await page.getByText(/Study room · Did not enter/).waitFor();
  const download=page.waitForEvent('download');
  await page.locator('#export').click();
  const {trips}=JSON.parse(await readFile(await (await download).path(),'utf8'));
  const {observations}=trips[0].stops[0];
  assert.deepEqual(observations.map(o=>[o.space,o.outcome,o.spend_yen,o.note]),[
    ['Fictional museum','Visited',0,null],['Study room','Did not enter',null,null],
    ['Courtyard','Personally reviewed',null,'Bench was uncomfortable.']
  ]);
  assert.match(observations[0].date,/^\d{4}-\d{2}-\d{2}$/);
});
