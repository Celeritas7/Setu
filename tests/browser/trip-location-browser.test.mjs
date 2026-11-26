import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {verifiedChrome} from '../helpers/research-browser-binary.mjs';

async function sessionPage(t) {
  const browser = await chromium.launch({executablePath: await verifiedChrome(), args: ['--no-sandbox']});
  t.after(() => browser.close());
  const context = await browser.newContext({acceptDownloads:true});
  const page = await context.newPage();
  const origin = 'http://127.0.0.1';
  const assets = new Map([
    ['trip-session.html', 'text/html'], ['css/research-import.css', 'text/css'],
    ['js/trip-session.js', 'application/javascript'], ['js/research-storage.js', 'application/javascript'],
    ['js/trip-note-drafts.js', 'application/javascript']
  ]);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(1);
    if (url.origin !== origin || !assets.has(path)) return route.abort();
    await route.fulfill({contentType: assets.get(path), body: await readFile(new URL('../../' + path, import.meta.url))});
  });
  return {page,origin,context};
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
  await page.locator('#outcome').selectOption({label:'Personally reviewed'});
  await page.locator('#comfort-details summary').click();
  await page.getByLabel('Noise level').selectOption('Quiet');
  await page.locator('#outcome').selectOption({label:'Did not enter'});
  await save.click();
  await add.click();
  await page.locator('#space').fill('Courtyard');
  await page.locator('#outcome').selectOption({label:'Personally reviewed'});
  await save.click();
  await page.getByText('Describe what you personally experienced.').waitFor();
  await page.locator('#comfort-details summary').click();
  assert.equal(await page.getByLabel('Noise level').inputValue(),'');
  await page.getByLabel('Comfort',{exact:true}).selectOption('Uncomfortable');
  await page.getByLabel('Would you return?').selectOption('No');
  await page.locator('#note').fill('Bench was uncomfortable.');
  await save.click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.reload();
  await page.getByText(/Study room · Did not enter/).waitFor();
  const download=page.waitForEvent('download');
  await page.locator('#export').click();
  const {trips}=JSON.parse(await readFile(await (await download).path(),'utf8'));
  const {observations}=trips[0].stops[0];
  assert.equal(observations[1].comfort_answers,undefined);
  assert.equal(observations[2].comfort_answers.wifi,null);
  assert.equal(observations[2].comfort_answers.noise,null);
  assert.equal(observations[2].comfort_answers.comfort,'Uncomfortable');
  assert.equal(observations[2].comfort_answers.return,'No');
  await page.getByText('Comfort · Uncomfortable',{exact:true}).waitFor();
  assert.deepEqual(observations.map(o=>[o.space,o.outcome,o.spend_yen,o.note]),[
    ['Fictional museum','Visited',0,null],['Study room','Did not enter',null,null],
    ['Courtyard','Personally reviewed',null,'Bench was uncomfortable.']
  ]);
  await page.getByText('Planned vs recorded · trip report').click();
  await page.getByText('Prepare place update draft').click();
  const exportDraft=page.getByRole('button',{name:'Export selected observations as draft'});
  assert.equal(await exportDraft.isDisabled(),true);
  const options=page.getByRole('checkbox');
  assert.equal(await options.count(),3);
  await options.nth(0).check();
  await options.nth(0).uncheck();
  assert.equal(await exportDraft.isDisabled(),true);
  await options.nth(2).check();
  const draftFile=page.waitForEvent('download');
  await exportDraft.click();
  const draft=JSON.parse(await readFile(await (await draftFile).path(),'utf8'));
  assert.equal(draft.status,'draft');
  assert.deepEqual(draft.proposals,[{
    source:{trip_id:trips[0].id,stop_index:0,observation_index:2},
    stop_name:'Fictional museum',place_ref:null,observation:observations[2]
  }]);
  await page.getByText('Preview a place update draft',{exact:true}).click();
  const upload=async proposals=>{
    await page.locator('#draft-file').setInputFiles({name:'draft.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify({...draft,proposals}))});
  };
  const proposal=draft.proposals[0];
  const foreign={...proposal,source:{...proposal.source,trip_id:'different-trip'}};
  const altered={...proposal,observation:{...proposal.observation,note:'Different text.'}};
  await upload([proposal,{...proposal,source:{observation_index:2,stop_index:0,trip_id:trips[0].id}},foreign]);
  await page.getByText(/Matches local observation · 2 identical copies/).waitFor();
  await page.getByText(/Source trip unavailable in this browser/).waitFor();
  assert.equal(await page.locator('#preview-items li').count(),2);
  await upload([altered]);
  await page.getByText(/Local source differs/).waitFor();
  await upload([proposal,altered]);
  await page.getByText(/Conflicting proposals/).waitFor();
  assert.equal(await page.locator('#preview-items li').count(),0);
  await upload([{...proposal,observation:{...proposal.observation,date:'2026-02-31'}}]);
  await page.getByText(/Invalid observation/).waitFor();
  await upload([proposal]);
  await page.getByText(/Matches local observation/).waitFor();
  await page.getByRole('button',{name:'Clear preview'}).click();
  assert.equal(await page.locator('#preview-items li').count(),0);
  const afterPreview=page.waitForEvent('download');
  await page.locator('#export').click();
  const after=JSON.parse(await readFile(await (await afterPreview).path(),'utf8'));
  assert.deepEqual(after.trips,trips);
  assert.match(observations[0].date,/^\d{4}-\d{2}-\d{2}$/);
});

test('finished outing report matches planned occurrences and preserves unknown spending', async t => {
  const {page,origin}=await sessionPage(t);
  await page.goto(origin+'/trip-session.html');
  await page.evaluate(()=>sessionStorage.setItem('setu.session-outing',JSON.stringify({
    title:'Practice outing',date:'2026-11-26',stops:[{name:'Library',type:'spot',id:'first'},{name:'Library',type:'spot',id:'second'},{name:'Old stop',unavailable:true}]
  })));
  await page.goto(origin+'/trip-session.html#outing');
  await page.reload();
  await page.getByLabel('Starting place').fill('Station');
  await page.locator('#submit').click();
  await page.locator('#planned-choice').selectOption('1');
  await page.locator('#submit').click();
  await page.getByText('Current stop: Library',{exact:true}).waitFor();
  await page.locator('#stop').fill('Park');
  await page.locator('#submit').click();
  await page.getByText('Current stop: Park',{exact:true}).waitFor();
  await page.locator('#wrap-up summary').click();
  await page.locator('#transport').fill('Missed the bus.');
  await page.locator('#finish').click();
  await page.getByText('Planned vs recorded · trip report').waitFor();
  await page.reload();
  await page.getByText('Planned vs recorded · trip report').click();
  await page.getByText('No spending amount recorded.').waitFor();
  await page.getByText('Transport issues · Missed the bus.').waitFor();
  await page.getByRole('button',{name:'Add observation for Park'}).click();
  await page.locator('#outcome').selectOption('Visited');
  await page.locator('#spend').fill('0');
  await page.locator('#save-observation').click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByText('Planned vs recorded · trip report').click();
  await page.getByText('Sum of recorded spending entries: ¥0').waitFor();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export this trip report'}).click();
  const report=JSON.parse(await readFile(await (await downloaded).path(),'utf8'));
  assert.deepEqual(report.planned.map(s=>s.recorded),[false,true,false]);
  assert.deepEqual(report.recorded_stops.map(s=>s.name),['Station','Library','Park']);
  assert.equal(report.recorded_stops[2].kind,'detour');
  assert.deepEqual(report.spending,{known_yen:'0',known_entries:1,unknown_entries:0,stops_without_observations:2});
  assert.deepEqual(report.notes,{transport:'Missed the bus.',recovery:null,future:null});
  await page.getByRole('button',{name:'Add observation for Library'}).click();
  await page.locator('#outcome').selectOption('Passed nearby');
  await page.locator('#save-observation').click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByText('Planned vs recorded · trip report').click();
  await page.getByText('Prepare place update draft').click();
  await page.getByRole('checkbox',{name:/Library.*Passed nearby/}).check();
  const draftDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export selected observations as draft'}).click();
  const draft=JSON.parse(await readFile(await (await draftDownload).path(),'utf8'));
  assert.equal(draft.proposals.length,1);
  assert.deepEqual(draft.proposals[0].place_ref,{type:'spot',id:'second'});
  assert.equal(draft.proposals[0].observation.outcome,'Passed nearby');
  assert.equal(JSON.stringify(draft).includes('Missed the bus.'),false);
});

async function startNoteTrip(page,origin,name) {
  await page.goto(origin+'/trip-session.html');
  await page.getByLabel('Starting place').fill(name);
  await page.locator('#submit').click();
  await page.getByText('Current stop: '+name,{exact:true}).waitFor();
}
async function tripDownload(page,selector) {
  const downloaded=page.waitForEvent('download');
  await page.locator(selector).click();
  return JSON.parse(await readFile(await (await downloaded).path(),'utf8'));
}

test('unfinished wrap-up notes survive reload and unrelated stop save; successful finish consumes only their draft',async t=>{
  const {page,origin}=await sessionPage(t);
  await startNoteTrip(page,origin,'Station');
  await page.locator('#wrap-up summary').click();
  await page.locator('#transport').fill('Last bus cancelled');
  await page.locator('#recovery').fill('Waited at the station');
  await page.locator('#future').fill('Check last departure');
  const draft=await tripDownload(page,'#download-active-notes');
  assert.equal(draft.format,'setu_trip_note_draft');
  assert.deepEqual(draft.notes,{transport:'Last bus cancelled',recovery:'Waited at the station',future:'Check last departure'});
  const before=await tripDownload(page,'#export');
  assert.equal(draft.trip_id,before.trips[0].id);
  assert.equal(before.trips[0].report_notes,undefined);
  await page.reload();
  await page.getByText('Current stop: Station',{exact:true}).waitFor();
  for(const [field,note] of Object.entries(draft.notes)) assert.equal(await page.locator('#'+field).inputValue(),note);
  await page.locator('#stop').fill('Shelter');
  await page.locator('#submit').click();
  await page.getByText('Current stop: Shelter',{exact:true}).waitFor();
  for(const [field,note] of Object.entries(draft.notes)) assert.equal(await page.locator('#'+field).inputValue(),note);
  await page.locator('#finish').click();
  await page.getByText('No active trip.',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('No active trip.',{exact:true}).waitFor();
  assert.equal(await page.locator('#recovered-notes').isHidden(),true);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('setu.trip-note-drafts.v1')),null);
  const after=await tripDownload(page,'#export');
  assert.deepEqual(after.trips[0].report_notes,draft.notes);
});

test('competing finish preserves the losing tab’s original-trip notes through reload and a new trip',async t=>{
  const {page,origin,context}=await sessionPage(t);
  await startNoteTrip(page,origin,'Original station');
  await page.locator('#wrap-up summary').click();
  await page.locator('#transport').fill('Last bus cancelled');
  await page.locator('#recovery').fill('Found a shelter');
  const own=await tripDownload(page,'#download-active-notes');

  const other=await context.newPage();
  await other.goto(origin+'/trip-session.html');
  await other.getByText('Current stop: Original station',{exact:true}).waitFor();
  await other.locator('#wrap-up summary').click();
  assert.equal(await other.locator('#transport').inputValue(),'');
  await other.locator('#transport').fill('Other tab finished first');
  await other.locator('#finish').click();
  await other.getByText('No active trip.',{exact:true}).waitFor();

  await page.locator('#finish').click();
  await page.getByText(/Another tab changed the history/).waitFor();
  await page.locator('#recovered-notes').waitFor();
  assert.match(await page.locator('#recovered-note-list').innerText(),/Last bus cancelled/);
  assert.match(await page.locator('#recovered-note-list').innerText(),/Found a shelter/);
  assert.deepEqual(await tripDownload(page,'#recovered-note-list button:first-of-type'),own);
  const completed=await tripDownload(page,'#export');
  assert.equal(completed.trips[0].report_notes.transport,'Other tab finished first');
  assert.equal(completed.trips[0].report_notes.recovery,null);

  await other.getByLabel('Starting place').fill('New trip');
  await other.locator('#submit').click();
  await other.getByText('Current stop: New trip',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('Current stop: New trip',{exact:true}).waitFor();
  assert.equal(await page.locator('#transport').inputValue(),'');
  assert.equal(await page.locator('#recovery').inputValue(),'');
  assert.deepEqual(await tripDownload(page,'#recovered-note-list button:first-of-type'),own);

  // Cancelling a discard preserves the notes. Only explicit confirmation removes them.
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Discard recovered notes'}).click();
  assert.equal(await page.locator('#recovered-notes').isVisible(),true);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Discard recovered notes'}).click();
  await page.locator('#recovered-notes').waitFor({state:'hidden'});
  await page.reload();
  await page.getByText('Current stop: New trip',{exact:true}).waitFor();
  assert.equal(await page.locator('#recovered-notes').isHidden(),true);
  const final=await tripDownload(page,'#export');
  assert.deepEqual(final.trips[0],completed.trips[0]);
  assert.equal(final.trips[1].report_notes,undefined);
});
