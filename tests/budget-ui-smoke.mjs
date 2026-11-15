import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// Optional real-renderer smoke check; run separately from the Node unit suite:
//   node tests/budget-ui-smoke.mjs
// Requires Playwright and its Chromium, or SETU_CHROMIUM_PATH=/path/to/chromium.
// SETU_TEST_TEMPLATE may point at an unpacked template during development.
// Screenshots use SETU_SMOKE_ARTIFACTS, otherwise a fresh temporary directory.
// Only invented account/place records are rendered. Auth/database/map bootstrap
// scripts and component lifecycle work are disabled, and external HTTP is blocked.
const { chromium } = await import('playwright').catch(() => {
  throw new Error('Optional UI smoke check requires Playwright; the normal Node unit suite does not.');
});
const bundle = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const templateTag = /(<script type="__bundler\/template">\s*)([\s\S]*?)(\s*<\/script>)/;
const manifest = JSON.parse(bundle.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1]);
const original = process.env.SETU_TEST_TEMPLATE
  ? await fs.readFile(process.env.SETU_TEST_TEMPLATE, 'utf8')
  : JSON.parse(bundle.match(templateTag)[2]);
const rendererId = original.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/)?.[1];
assert.ok(manifest[rendererId], 'first template script must be the packaged renderer');
const rendererBytes = Buffer.from(manifest[rendererId].data, 'base64');
const renderer = (manifest[rendererId].compressed ? gunzipSync(rendererBytes) : rendererBytes).toString();
assert.match(renderer, /DCLogic/, 'retain only the actual packaged renderer, not account bootstrap');

const hub = {id:'ui-musashi', name:'Musashi-Urawa', prefecture:'Saitama', geoQuery:'埼玉県さいたま市', themes:[]};
const place = (id, name, extra={}) => ({id, name, hubId:hub.id, accepted:true, status:'try', themes:['cafe'], ...extra});
const foods = [
  place('ui-saint', 'Saint Marc Café 武蔵浦和マーレ'),
  place('ui-spress', 'S PRESS CAFE'),
  place('ui-expensive', 'Sample expensive café', {spend:1500, spendSeen:'2026-11-01'}),
  place('ui-zero', 'Sample recorded zero', {spend:0}),
  place('ui-five-hundred', 'Sample five hundred', {spend:500}),
  place('ui-three-hundred', 'Sample three hundred', {spend:300}),
  place('ui-minimum', 'Sample minimum only', {min_order_yen:100, min_order:'Sample order requirement'}),
  place('ui-raw', 'Sample raw estimate', {spend_yen:1000})
];
const state = {
  cloud:true, user:{id:'fixture-user'}, screen:'plan', theme:'all', sick:false,
  hubs:[hub], hubId:hub.id, foods, spots:[place('ui-garden', 'Sample garden · estimate unknown', {themes:[], kind:'see'})],
  foodSugg:[], trips:[], days:[], outings:[], friends:[], stays:[], menu:[], wx:[], fc:{}, od:null,
  wvPrefecture:'saitama', wvHubKey:'hub:'+hub.id, wvPage:0,
  wvBudgetLimit:'all', wvBudgetGroup:'all', wvBudgetSort:'original'
};
function replaceOnce(text, needle, replacement) {
  assert.equal(text.split(needle).length, 2, 'fixture injection point must occur exactly once: '+needle);
  return text.replace(needle, replacement);
}
let template = replaceOnce(original, '...this.loadAll() };', '...this.loadAll(), ...'+JSON.stringify(state)+' };');
template = replaceOnce(template, 'componentDidMount(){', 'componentDidMount(){ window.__budgetSmokeApp=this; return; // Isolated fixture\n');
template = replaceOnce(template, 'componentDidUpdate(){', 'componentDidUpdate(){ return; // Isolated fixture\n');
template = template.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g, (tag, attrs) =>
  /type="text\/x-dc"/.test(attrs) || attrs.match(/src="([^"]+)"/)?.[1] === rendererId ? tag : '');
const fixture = bundle.replace(templateTag, (_, before, _old, after) =>
  before+JSON.stringify(template).replaceAll('</', '<\\u002F')+after);

const artifacts = process.env.SETU_SMOKE_ARTIFACTS || await fs.mkdtemp(path.join(os.tmpdir(), 'setu-budget-ui-'));
await fs.mkdir(artifacts, {recursive:true});
const server = http.createServer((req,res) => {
  if (req.url !== '/fixture') {res.writeHead(404); res.end('Isolated UI fixture only'); return;}
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "connect-src 'none'; frame-src 'none'; img-src 'self' data: blob:");
  res.end(fixture);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:'+server.address().port;
let browser;
const failures = [], runtimeErrors = [];
try {
  browser = await chromium.launch({headless:true, ...(process.env.SETU_CHROMIUM_PATH ? {executablePath:process.env.SETU_CHROMIUM_PATH} : {}), args:['--no-sandbox']});
  for (const width of [320,390,1280]) {
    const context = await browser.newContext({viewport:{width,height:1000}, timezoneId:'Asia/Tokyo', serviceWorkers:'block'});
    const requests = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (!['GET','HEAD'].includes(route.request().method())) requests.push(route.request().method()+' '+url);
      return url.startsWith(origin+'/') || url.startsWith('blob:') || url.startsWith('data:') ? route.continue() : route.abort();
    });
    await context.addInitScript(() => {
      window.__budgetWrites = [];
      window.setu = {save(...args){window.__budgetWrites.push(args); throw new Error('Account writes are forbidden in the smoke fixture');}};
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => runtimeErrors.push(width+': '+error.message));
    try {
      await page.goto(origin+'/fixture', {waitUntil:'load'});
      const cards = page.locator('article.budget-card');
      await cards.first().waitFor();
      await page.waitForFunction(() => Boolean(window.__budgetSmokeApp));
      assert.equal(await cards.count(), 5, 'first page shows five cards');
      assert.equal(await page.evaluate(() => window.__budgetSmokeApp.state.od), null, 'prices appear before a day draft exists');
      const saint = cards.filter({has:page.getByRole('button', {name:'Saint Marc Café 武蔵浦和マーレ', exact:true})});
      const spress = cards.filter({has:page.getByRole('button', {name:'S PRESS CAFE', exact:true})});
      await saint.getByText(/Drink example: ¥350/).waitFor();
      await saint.getByText(/Light food \+ drink example: ¥770/).waitFor();
      await spress.getByText(/Drink example: ¥550/).waitFor();
      assert.equal(await saint.getByText('Visit budget unknown', {exact:true}).isVisible(), true);
      assert.equal(await saint.getByText('90-minute stay: unverified', {exact:true}).isVisible(), true);
      const menuBox = await saint.locator('.budget-examples').boundingBox();
      const addBox = await saint.getByRole('button', {name:'Add Saint Marc Café 武蔵浦和マーレ to day', exact:true}).boundingBox();
      assert.ok(menuBox.y+menuBox.height <= addBox.y, 'menu examples are before the add action');

      await saint.locator('summary').click();
      await saint.getByText(/Menu checked: 2026-11-15/).waitFor();
      const source = saint.getByRole('link', {name:'Official branch drink menu ↗', exact:true});
      assert.equal(await source.getAttribute('href'), 'https://www.saint-marc-hd.com/saintmarccafe/shop/688/menu/category/drink/');
      assert.equal(await source.getAttribute('target'), '_blank');
      assert.match(await source.getAttribute('rel'), /noopener/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow at '+width);
      await page.screenshot({path:path.join(artifacts, 'budget-plan-'+width+'.png'), fullPage:true});

      const maps = saint.getByRole('link', {name:'Open Saint Marc Café 武蔵浦和マーレ in Google Maps', exact:true});
      const mapsHref = new URL(await maps.getAttribute('href'));
      assert.equal(mapsHref.protocol, 'https:');
      assert.equal(mapsHref.hostname, 'www.google.com');
      assert.match(mapsHref.searchParams.get('query'), /Saint Marc Café 武蔵浦和マーレ/);
      assert.equal(await maps.getAttribute('target'), '_blank');
      assert.match(await maps.getAttribute('rel'), /noopener/);
      // Exercise the actual link click without navigating to an external account.
      await maps.evaluate(link => link.addEventListener('click', event => {event.preventDefault(); window.__clickedBudgetMap=link.href;}, {once:true}));
      await maps.click();
      assert.equal(await page.evaluate(() => window.__clickedBudgetMap), mapsHref.href);
      assert.equal(await page.evaluate(() => window.__budgetSmokeApp.state.od), null, 'Maps click does not add a day or place');

      await page.getByRole('button', {name:'Next', exact:true}).click();
      await page.getByText('6–9 of 9 places · Saitama / Musashi-Urawa', {exact:true}).waitFor();
      assert.equal(await cards.count(), 4);
      await page.getByLabel('Max visit estimate / person', {exact:true}).selectOption('500');
      await page.getByText('1–3 of 3 places · Saitama / Musashi-Urawa', {exact:true}).waitFor();
      assert.equal(await cards.count(), 3, 'ceiling resets pagination and excludes unknown estimates');
      assert.deepEqual(await cards.locator('.budget-price').allTextContents(), [
        'Recorded visit budget: ¥0 / person', 'Estimated visit budget: ~¥500 / person', 'Estimated visit budget: ~¥300 / person'
      ]);
      await page.getByRole('button', {name:'Budget unknown · 4', exact:true}).click();
      await page.getByText('1–4 of 4 places · Saitama / Musashi-Urawa', {exact:true}).waitFor();
      assert.equal(await cards.count(), 4, 'unknown group remains reviewable regardless of ceiling');
      assert.equal(await cards.locator('.budget-price.unknown').count(), 4);
      await page.getByLabel('Max visit estimate / person', {exact:true}).selectOption('all');
      await page.getByLabel('Sort places', {exact:true}).selectOption('price');
      await page.getByText('1–5 of 9 places · Saitama / Musashi-Urawa', {exact:true}).waitFor();
      assert.deepEqual(await cards.locator('.budget-name').allTextContents(), [
        'Sample recorded zero', 'Sample three hundred', 'Sample five hundred', 'Sample raw estimate', 'Sample expensive café'
      ], 'price sort places known estimates first and unknowns last');
      await page.getByLabel('Sort places', {exact:true}).selectOption('original');
      await saint.getByRole('button', {name:'Add Saint Marc Café 武蔵浦和マーレ to day', exact:true}).click();
      await saint.getByRole('button', {name:'Remove Saint Marc Café 武蔵浦和マーレ from day', exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__budgetSmokeApp.state.od.stops), [{t:'food',id:'ui-saint'}]);
      await saint.getByRole('button', {name:'Remove Saint Marc Café 武蔵浦和マーレ from day', exact:true}).click();
      await saint.getByRole('button', {name:'Add Saint Marc Café 武蔵浦和マーレ to day', exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__budgetSmokeApp.state.od.stops), []);

      const missingStops = [{t:'spot',id:'ui-unavailable-saved-ref'}, {t:'food',id:'ui-expensive'}];
      await page.evaluate(stops => {
        const app=window.__budgetSmokeApp;
        app.setState({od:{...app.state.od,id:'fixture-draft',stops,hubId:'ui-musashi',prefectureId:'saitama'}});
      }, missingStops);
      await page.getByText('Unavailable saved stop', {exact:true}).waitFor();
      await page.getByText(/Recorded place-spend subtotal: ~¥1,500 \/ person \+ 1 unknown/).waitFor();
      await page.getByRole('button', {name:'Plan a day here', exact:true}).click();
      assert.deepEqual(await page.evaluate(() => window.__budgetSmokeApp.state.od.stops), missingStops, 'hub planning action preserves an existing draft');
      await page.getByRole('button', {name:'Suggest stops for this day', exact:true}).click();
      await page.getByText(/Some saved stops are unavailable\. Reload or review those stops/).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__budgetSmokeApp.state.od.stops), missingStops, 'suggestion cannot silently drop an unresolved saved stop');
      assert.doesNotMatch(await page.getByRole('link', {name:'Route in Maps ↗', exact:true}).getAttribute('href'), /unavailable|Unavailable/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'draft has no horizontal overflow at '+width);
      await page.screenshot({path:path.join(artifacts, 'budget-draft-'+width+'.png'), fullPage:true});
      assert.deepEqual(await page.evaluate(() => window.__budgetWrites), [], 'no account writes');
      assert.deepEqual(requests, [], 'no network mutation requests');
      console.log('PASS '+width+'px: upfront examples, sources, independent Maps link, ceiling, unknowns, sorting, paging, add/remove, preserved missing draft refs, no overflow/writes');
    } catch (error) {
      failures.push(width+'px: '+error.stack);
      await page.screenshot({path:path.join(artifacts, 'budget-failure-'+width+'.png'), fullPage:true}).catch(() => {});
    } finally {await context.close();}
  }
  assert.deepEqual(runtimeErrors, [], 'no renderer runtime errors');
  assert.deepEqual(failures, [], 'all responsive UI smoke checks pass');
  console.log('Screenshots: '+artifacts);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
