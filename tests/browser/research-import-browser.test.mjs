import assert from 'node:assert/strict';
import test,{before,after,beforeEach,afterEach} from 'node:test';
import {freshImporterBrowser,fictionalResearch,importerAssets} from '../helpers/research-import-browser.mjs';
import {local} from '../helpers/research-cloud-fixture.mjs';

let h;
before(async()=>{h=await freshImporterBrowser();},{timeout:60000});
after(async()=>{await h?.close();},{timeout:20000});
beforeEach(()=>{h.control.stall=false;h.control.fail.clear();h.control.version=null;h.requests.length=0;h.errors.length=0;h.rejected.length=0;});
afterEach(async()=>{await h.closeContexts();assert.deepEqual(h.errors,[]);assert.deepEqual(h.rejected,[]);});
async function upload(page,data){await page.locator('#research-file').setInputFiles({name:'fictional-research.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.locator('#preview').waitFor();}
async function saved(page){await page.locator('#storage-status').filter({hasText:'Confirmed decisions saved in this browser'}).waitFor();}
async function ready(page){await page.locator('#offline-status').filter({hasText:'Research Import ready offline'}).waitFor();}
async function resume(page){await page.getByRole('button',{name:'Resume saved review',exact:true}).first().click();await page.locator('#storage-status').filter({hasText:'Resumed saved review.'}).waitFor();await page.locator('#preview').waitFor();}
async function hub(page){const box=page.locator('#hub-counts .hub-count').first();await box.locator('summary').click();await box.getByRole('combobox').selectOption('new');await box.getByRole('checkbox').check();await box.getByRole('button',{name:'Use hub choice',exact:true}).click();await saved(page);}
async function decide(page,data,index,action){
  const source=data.places[index];await page.locator('#candidate-search').fill(source.research_id);
  const card=page.locator('#candidates article').filter({has:page.getByRole('heading',{name:source.name_ja,exact:true})});
  if(action==='Accept as suggestion'){await card.getByLabel('Suggestion category').selectOption('see');const ack=card.getByRole('checkbox',{name:/I reviewed the overlaps/});if(await ack.count())await ack.check();}
  await card.getByRole('button',{name:action,exact:true}).click();await saved(page);
}
async function download(page,id='#backup'){const waiting=page.waitForEvent('download');await page.locator(id).click();const file=await waiting,chunks=[];for await(const part of await file.createReadStream())chunks.push(part);return Buffer.concat(chunks);}
async function records(page){return page.evaluate(async()=>{const s=await SetuResearchStorage.open();try{return await s.list();}finally{s.close();}});}
async function prepared(page,data){await upload(page,data);await saved(page);await hub(page);await decide(page,data,0,'Accept as suggestion');await decide(page,data,1,'Skip');await page.locator('#save-drafts').click();await page.locator('#storage-status').filter({hasText:'1 local suggestions saved'}).waitFor();}

test('37 candidates and seven hubs survive real file upload, autosave, idempotent draft saves and explicit portable restore',async()=>{
  const data=fictionalResearch(),first=await h.open();await prepared(first.page,data);
  await first.page.locator('#save-drafts').click();await first.page.locator('#storage-status').filter({hasText:'0 local suggestions added'}).waitFor();
  const backup=await download(first.page),parsed=await local.inspectInput(backup.toString());assert.deepEqual(parsed.research,data);assert.equal(parsed.workspace.catalog.places.length,1);
  await first.page.reload();await resume(first.page);assert.match(await first.page.locator('#summary').innerText(),/35 pending · 1 accepted suggestions · 1 skipped/);
  const second=await h.open();await upload(second.page,JSON.parse(backup));await second.page.locator('#restore-confirm').waitFor();
  assert.equal((await records(second.page)).length,0,'A backup preview must not overwrite before confirmation.');
  await second.page.locator('#restore-confirm').click();await saved(second.page);
  assert.deepEqual((await local.inspectInput((await download(second.page)).toString())).research,data);assert.equal((await records(second.page))[0].payload.catalog.places.length,1);
});

test('actual worker control, all nine cache files and saved decisions survive offline new-tab reopening and normal reload',async()=>{
  const data=fictionalResearch({count:3}),{page,context}=await h.open();await prepared(page,data);await ready(page);
  const outside=await context.newPage();await outside.goto(h.origin+'/Setu/index.html');assert.equal(await outside.evaluate(()=>navigator.serviceWorker.controller),null);
  const keys=await page.evaluate(async()=>{const k=(await caches.keys()).find(x=>x.startsWith('setu-research-import-'));return (await (await caches.open(k)).keys()).map(x=>new URL(x.url).pathname);});
  assert.equal(keys.length,9);assert.deepEqual(keys.slice().sort(),importerAssets.map(x=>'/Setu/'+x).sort());
  await context.setOffline(true);const offline=await context.newPage();await offline.goto(h.url);await offline.locator('#storage-status').filter({hasText:'Local storage ready'}).waitFor();await resume(offline);
  assert.match(await offline.locator('#summary').innerText(),/1 pending · 1 accepted suggestions · 1 skipped/);assert.deepEqual((await local.inspectInput((await download(offline)).toString())).research,data);
  await offline.reload();await resume(offline);assert.equal((await records(offline))[0].payload.catalog.places.length,1);
});

test('two real tabs reject a stale save, retain an exportable losing decision and resume the winner explicitly',async()=>{
  const data=fictionalResearch({count:3}),{page:a,context}=await h.open();await upload(a,data);await saved(a);
  const {page:b}=await h.open({context});await resume(b);await hub(a);await decide(a,data,0,'Accept as suggestion');
  await b.locator('#candidate-search').fill(data.places[1].research_id);await b.locator('#candidates').getByRole('button',{name:'Skip',exact:true}).click();
  await b.locator('#storage-status').filter({hasText:'Not saved:'}).waitFor();const stored=(await records(a))[0].payload.reviews;
  const winner=Object.values(stored)[0];assert.equal(winner.candidates[0].decision,'accept_suggestion');assert.equal(winner.candidates[1].decision,'pending');
  const losing=await local.inspectInput((await download(b)).toString());assert.equal(losing.workspace.reviews[losing.report].candidates[1].decision,'skip');
  await resume(b);assert.match(await b.locator('#summary').innerText(),/1 accepted suggestions · 0 skipped/);await decide(b,data,2,'Skip');
  assert.equal(Object.values((await records(a))[0].payload.reviews)[0].candidates[2].decision,'skip');
});

test('a corrupt latest workspace remains stored until its valid previous checkpoint is explicitly restored',async()=>{
  const data=fictionalResearch({count:3}),{page}=await h.open();await prepared(page,data);
  await page.evaluate(async()=>{const store=await SetuResearchStorage.open();try{const [current]=await store.list();await store.write(current.id,current.rev,{broken:true});}finally{store.close();}});
  await page.reload();await page.getByRole('button',{name:'Recover previous checkpoint',exact:true}).click();await page.locator('#restore-confirm').waitFor();
  assert.deepEqual((await records(page))[0].payload,{broken:true},'A recovery preview cannot silently replace the current record.');
  assert.deepEqual((await local.inspectInput((await download(page)).toString())).research,data);
  await page.locator('#restore-confirm').click();await saved(page);assert.equal((await records(page))[0].payload.catalog.places.length,1);
  assert.match(await page.locator('#summary').innerText(),/1 accepted suggestions · 1 skipped/);
});

test('missing static cache files cannot advertise ready, and repair retains the actual IndexedDB review',async()=>{
  const data=fictionalResearch({count:3}),{page}=await h.open();await prepared(page,data);await ready(page);const before=await records(page);
  const missing='/Setu/js/research-local.js';h.control.fail.add(missing);
  await page.evaluate(async path=>{for(const key of await caches.keys())if(key.startsWith('setu-research-import-'))await (await caches.open(key)).delete(new URL(path,location.origin).href);},missing);
  await page.locator('#offline-check').click();await page.locator('#offline-status').filter({hasText:'not verified'}).waitFor();assert.equal(await page.locator('#offline-reopen').isHidden(),true);
  h.control.fail.clear();await page.locator('#offline-check').click();await ready(page);assert.deepEqual(await records(page),before);
});

test('a worker build update survives closing and reopening, retires only its own old cache and retains stored research',async()=>{
  const data=fictionalResearch({count:3}),{page,context}=await h.open();await prepared(page,data);await ready(page);const before=await records(page);
  await page.evaluate(async()=>{const cache=await caches.open('unrelated-application-fixture');await cache.put('/unrelated-fixture',new Response('Retain unrelated bytes'));});
  h.control.version='r3-browser-fixture-next';
  await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
  await page.waitForFunction(async()=>{
    const registration=await navigator.serviceWorker.getRegistration(),keys=await caches.keys();
    return !registration.installing&&keys.some(key=>key.endsWith('r3-browser-fixture-next'));
  });
  // Exercise a normal visit after all old importer clients close, without forcing activation.
  await page.close();const next=await context.newPage();await next.goto(h.url);await next.locator('#storage-status').filter({hasText:'Local storage ready'}).waitFor();await ready(next);await resume(next);assert.deepEqual(await records(next),before);
  const keys=await next.evaluate(()=>caches.keys());assert.equal(keys.filter(x=>x.startsWith('setu-research-import-')).length,1);assert.ok(keys.some(x=>x.endsWith('r3-browser-fixture-next')));assert.ok(keys.includes('unrelated-application-fixture'));
});

test('a fully cached importer opens when the network accepts requests but never answers them',async()=>{
  const data=fictionalResearch({count:3}),{page,context}=await h.open();await prepared(page,data);await ready(page);h.control.stall=true;
  const next=await context.newPage();try{await next.goto(h.url,{timeout:5000});await next.locator('#storage-status').filter({hasText:'Local storage ready'}).waitFor({timeout:5000});await resume(next);assert.equal((await records(next))[0].payload.catalog.places.length,1);}finally{h.release();h.control.stall=false;}
});

test('invalid JSON and a second destination do not erase saved source research or suggestions',async()=>{
  const data=fictionalResearch({count:3}),{page}=await h.open();await prepared(page,data);const before=await records(page);
  await page.locator('#research-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.locator('#errors').filter({hasText:'could not be validated'}).waitFor();assert.deepEqual(await records(page),before);
  await upload(page,fictionalResearch({region:'B',count:3}));await saved(page);const after=await records(page);assert.equal(after.length,2);assert.deepEqual(after.find(record=>record.id===before[0].id),before[0]);
});
