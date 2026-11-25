import assert from 'node:assert/strict';
import test,{before,after,beforeEach,afterEach} from 'node:test';
import {freshResearchBrowser} from '../helpers/research-browser.mjs';
import {A,B,workspace,research,local,model,snapshot} from '../helpers/research-cloud-fixture.mjs';

let h;
const all=['setu_research_workspaces','setu_research_requests','setu_research_identities','setu_research_evidence','setu_hubs','setu_food_notes','setu_spots','akatsuki_places','akatsuki_shops'];
before(async()=>{h=await freshResearchBrowser();console.log('Isolated browser: '+await h.browser.version()+'; real IndexedDB/HTTP; fictional owners only.');},{timeout:60000});
after(async()=>{await h?.close();},{timeout:20000});
beforeEach(async()=>{Object.assign(h.api.control,{dropCommitResponses:false,swapCommitToken:null,identityFailure:false,afterCommit:null});h.api.requests.length=0;h.blocked.length=0;h.errors.length=0;await h.api.db.admin.query('truncate '+all.map(t=>'public.'+t).join(',')+' cascade');});
afterEach(async()=>{await h.closeContexts();assert.deepEqual(h.blocked,[],'Browser requests must stay inside the own fixture.');assert.deepEqual(h.errors,[],'No browser runtime errors.');});
const button=(page,name)=>page.getByRole('button',{name,exact:true});
async function open(page){await button(page,'Open Research cloud').click();await page.getByRole('dialog',{name:'Research cloud'}).waitFor();await page.getByLabel('Local destination').waitFor();}
async function preview(page,publish=true){if(publish)await page.getByRole('checkbox').nth(0).check();await button(page,'Preview cloud batch').click();await page.getByRole('status').filter({hasText:'Preview ready.'}).waitFor();}
async function approve(page){await page.getByRole('checkbox').nth(1).check();await button(page,'Upload reviewed batch').click();}
async function count(table){assert.ok(all.includes(table));return Number((await h.api.db.admin.query('select count(*) as n from public.'+table)).rows[0].n);}

test('the production loader opens a native dialog but the unchanged release gate blocks upload and retry',async()=>{
  const data=await workspace(),{page}=await h.open([data],{enabled:false});await open(page);await preview(page);
  await page.getByRole('checkbox').nth(1).check();assert.equal(await button(page,'Upload reviewed batch').isDisabled(),true);assert.equal(await button(page,'Retry pending upload').isDisabled(),true);
  assert.match(await page.getByRole('dialog').innerText(),/Cloud saving is not enabled/);assert.equal(await count('setu_research_requests'),0);
});

test('real preview approval publishes once and downloads the original source through native browser downloads',async()=>{
  const data=await workspace(),{page}=await h.open([data]);await open(page);await preview(page);
  assert.equal(await button(page,'Upload reviewed batch').isDisabled(),true);
  const downloading=page.waitForEvent('download');await button(page,'Download proposed workspace backup').click();const download=await downloading;
  const chunks=[];for await(const part of await download.createReadStream())chunks.push(part);
  const restored=await local.inspectInput(Buffer.concat(chunks).toString());assert.deepEqual(restored.research,data.reviews[data.active].research);
  await approve(page);await page.getByRole('status').filter({hasText:'Cloud save confirmed'}).waitFor();assert.equal(await count('setu_spots'),1);
  assert.equal(await button(page,'Download proposed workspace backup').count(),0,'Completed preview actions must be cleared.');
  await button(page,'List my cloud reviews').click();const cloudDownloading=page.waitForEvent('download');await button(page,'Download cloud backup').click();const cloudDownload=await cloudDownloading;
  const cloudChunks=[];for await(const part of await cloudDownload.createReadStream())cloudChunks.push(part);
  assert.deepEqual((await local.inspectInput(Buffer.concat(cloudChunks).toString())).research,data.reviews[data.active].research);
  await preview(page);await approve(page);await page.getByRole('status').filter({hasText:'0 new suggestions'}).waitFor();assert.equal(await count('setu_spots'),1);assert.equal(await count('setu_research_evidence'),1);
});

test('a committed response loss stays pending in actual IndexedDB across reload and the UI retries the same request',async()=>{
  const data=await workspace(),{page}=await h.open([data]);await open(page);await preview(page);h.api.control.dropCommitResponses=true;
  await approve(page);await page.getByRole('status').filter({hasText:'Upload result unconfirmed'}).waitFor();assert.equal(await count('setu_spots'),1);
  const pending=await page.evaluate(([owner,id])=>window.__researchTest.outbox(owner,id),[A,data.id]);assert.equal(pending.payload.state,'pending');
  await page.reload();await page.getByText('Fixture ready',{exact:true}).waitFor();await open(page);
  assert.equal((await page.evaluate(([owner,id])=>window.__researchTest.outbox(owner,id),[A,data.id])).payload.args.p_request_id,pending.payload.args.p_request_id);
  h.api.control.dropCommitResponses=false;await button(page,'Retry pending upload').click();await page.getByRole('status').filter({hasText:'Pending cloud save confirmed'}).waitFor();
  const done=await page.evaluate(([owner,id])=>window.__researchTest.outbox(owner,id),[A,data.id]);assert.equal(done.payload.state,'done');assert.equal(done.payload.args.p_request_id,pending.payload.args.p_request_id);assert.equal(await count('setu_spots'),1);
  const commits=h.api.requests.filter(r=>r.path==='/rest/v1/rpc/setu_research_commit');assert.equal(commits.at(-1).bodyHash,commits.find(r=>r.dropped).bodyHash);
});

for(const width of [320,390,768,1280])test('the actual dialog and long destination selector fit a '+width+'px viewport',async()=>{
  const data=research();data.destination.name_ja='架空のとても長い研究先の名称・周辺の街と駅から歩く静かな目的地';const {page}=await h.open([await workspace(data)],{width,height:850});await open(page);await preview(page);
  const layout=await page.getByRole('dialog').evaluate(el=>({width:innerWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,scroll:el.scrollWidth,client:el.clientWidth}));
  assert.ok(layout.left>=0&&layout.right<=layout.width,JSON.stringify(layout));assert.ok(layout.scroll<=layout.client+1,JSON.stringify(layout));
});

test('a real second-tab local revision change invalidates upload and requires a fresh preview and approval',async()=>{
  const data=await workspace(),device=await h.open([data]),page=device.page;await open(page);await preview(page);
  const other=await device.secondTab();await other.evaluate(id=>window.__researchTest.bumpLocal(id),data.id);
  await approve(page);await page.getByRole('status').filter({hasText:'Local review changed after preview'}).waitFor();
  assert.equal(await button(page,'Upload reviewed batch').isDisabled(),true);assert.equal(await page.getByRole('checkbox').nth(1).isChecked(),false);assert.equal(await count('setu_research_requests'),0);
  await preview(page);assert.equal(await button(page,'Upload reviewed batch').isDisabled(),true);await approve(page);await page.getByRole('status').filter({hasText:'Cloud save confirmed'}).waitFor();
});

test('a stale cloud preview clears the old approval and a fresh preview can save again',async()=>{
  const data=await workspace(),a=(await h.open([data])).page,b=(await h.open([data])).page;
  await open(a);await open(b);await preview(a,false);await preview(b,false);await approve(a);await a.getByRole('status').filter({hasText:'Cloud save confirmed'}).waitFor();
  await approve(b);await b.getByRole('status').filter({hasText:'Cloud records changed after this preview'}).waitFor();
  assert.equal(await button(b,'Upload reviewed batch').isDisabled(),true);assert.equal(await b.getByRole('checkbox').nth(1).isChecked(),false);
  await preview(b,false);await approve(b);await b.getByRole('status').filter({hasText:'revision 2'}).waitFor();assert.equal(await count('setu_spots'),0);
});

test('a real SDK account change in a second tab cannot display an earlier asynchronous preview',async()=>{
  const data=await workspace(),device=await h.open([data]),page=device.page;await open(page);const other=await device.secondTab();
  let release,seen;const gate=new Promise(resolve=>{release=resolve;}),arrived=new Promise(resolve=>{seen=resolve;});
  await page.route(h.api.url+'/rest/v1/rpc/setu_research_capabilities',async route=>{seen();await gate;await route.continue();});
  try{
    await button(page,'Preview cloud batch').click();await arrived;await button(other,'Use fictional account B').click();
    await page.getByRole('status').filter({hasText:'owner-b@example.invalid'}).waitFor();
    const response=page.waitForResponse(r=>r.url().endsWith('/rpc/setu_research_capabilities'));release();await response;
    assert.equal(await page.getByRole('dialog').getByText('Test park',{exact:true}).count(),0);assert.equal(await button(page,'Upload reviewed batch').isDisabled(),true);assert.equal(await count('setu_research_requests'),0);
  }finally{release();}
});

test('an account switch after the actual commit keeps its IndexedDB retry with the original account',async()=>{
  const data=await workspace(),device=await h.open([data]),page=device.page;await open(page);await preview(page);const other=await device.secondTab();
  h.api.control.afterCommit=async()=>{await button(other,'Use fictional account B').click();await page.getByRole('status').filter({hasText:'owner-b@example.invalid'}).waitFor();};
  await approve(page);await page.getByRole('status').filter({hasText:'owner-b@example.invalid'}).waitFor();
  await page.waitForFunction(([owner,id])=>window.__researchTest.outbox(owner,id).then(r=>r?.payload.state==='pending'),[A,data.id]);
  await button(page,'Retry pending upload').click();await page.getByRole('status').filter({hasText:'No uncertain upload'}).waitFor();assert.equal(await count('setu_research_requests'),1);
  await button(other,'Use fictional account A').click();await page.getByRole('status').filter({hasText:'owner-a@example.invalid'}).waitFor();
  await button(page,'Retry pending upload').click();await page.getByRole('status').filter({hasText:'Pending cloud save confirmed'}).waitFor();assert.equal(await count('setu_spots'),1);
});

test('native Escape and Close release the dialog and its account listener before reopening',async()=>{
  const {page}=await h.open([await workspace()]);
  for(const way of ['escape','close','escape']){await open(page);assert.equal(await page.evaluate(()=>window.__researchTest.listeners.size),1);
    if(way==='escape')await page.keyboard.press('Escape');else await button(page,'Close').click();
    await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__researchTest.listeners.size),0);}
});

test('the browser previews selected evidence and preserves an existing personal review when approving the merge',async()=>{
  const actor=await h.api.db.actor(A);const {rows:[before]}=await actor.query("insert into public.setu_food_notes(name,address,review,rating,status,accepted) values('Test park','Test address 1','Retained fictional review',5,'done',true) returning *");
  const data=research(),input=await local.inspectInput(JSON.stringify(data));
  let review=local.prepare(data,snapshot({setu_food_notes:[before]}),local.emptyCatalog(),'2026-11-25',input.scope);
  review=model.setDecision(review,'P1','merge_selected',{target:{table:'setu_food_notes',id:before.id},fields:['cost'],same_place_acknowledged:true}).value;
  const payload={id:input.scope,active:input.report,reviews:{[input.report]:model.reviewExport(review)},catalog:local.emptyCatalog()};
  const {page}=await h.open([payload]);await open(page);await preview(page);await page.getByText('Selected merge evidence',{exact:true}).waitFor();
  await approve(page);await page.getByRole('status').filter({hasText:'Cloud save confirmed'}).waitFor();
  const after=(await actor.query('select * from public.setu_food_notes where id=$1',[before.id])).rows[0];assert.deepEqual({...after,rev:before.rev,updated_at:before.updated_at},before);
});
