import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';

// Optional browser check for the actual packed renderer. Only fictional records;
// no authentication, database, GPS, external scripts, or network mutations.
//   SETU_CHROMIUM_PATH=/path/to/chromium node tests/visited-seating-ui-smoke.mjs
//   SETU_SMOKE_SERVE=1 node tests/visited-seating-ui-smoke.mjs  # shared-browser inspection
const bundle=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const tag=/(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/;
const original=process.env.SETU_TEST_TEMPLATE ? await fs.readFile(process.env.SETU_TEST_TEMPLATE,'utf8') : JSON.parse(bundle.match(tag)[2]);
const manifest=JSON.parse(bundle.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1]);
const rendererId=original.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/)?.[1];
assert.ok(manifest[rendererId],'use the actual packaged renderer');
const asset=manifest[rendererId],bytes=Buffer.from(asset.data,'base64');
assert.match((asset.compressed?gunzipSync(bytes):bytes).toString(),/DCLogic/);
const hub={id:'fictional-hub',name:'Fictional Saitama hub',geoQuery:'埼玉県',prefecture:'Saitama',lat:35.8,lng:139.6,themes:[],radius_m:700};
const food={id:'fictional-food',rev:3,name:'Fictional quiet café',hubId:hub.id,area:'Fictional area',accepted:true,status:'try',
  themes:['sit-long','cafe'],lat:35.801,lng:139.601,spend:1100,min_order:'One drink',min_order_yen:400,
  stay_limit_min:null,seating_type:'buy_to_sit',seatingChecks:{},seatingChecksSupported:true,
  confidence:'reviews',last_checked:'2026-09-01',hours:{sun:[['09:00','18:00']]}};
const spot={...food,id:'fictional-spot',name:'Fictional covered benches',kind:'other',status:'try',min_order:'',min_order_yen:null,seating_type:null};
const state={screen:'place',placeId:food.id,hubId:hub.id,user:{id:'fixture-user'},cloud:true,
  hubs:[hub],foods:[food],spots:[spot],foodSugg:[],menu:[],outings:[],days:[],friends:[],stays:[],wx:[],fc:{}};
const replaceOnce=(s,needle,replacement)=>{assert.equal(s.split(needle).length,2,'fixture point '+needle);return s.replace(needle,replacement);};
let t=replaceOnce(original,'...this.loadAll() };','...this.loadAll(), ...'+JSON.stringify(state)+' };');
t=replaceOnce(t,'componentDidMount(){','componentDidMount(){ window.__g4SmokeApp=this; return; // fictional fixture\n');
t=replaceOnce(t,'componentDidUpdate(){','componentDidUpdate(){ return; // isolated fixture\n');
t=t.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,(script,attrs)=>
  /type="text\/x-dc"/.test(attrs) || attrs.match(/src="([^"]+)"/)?.[1]===rendererId ? script : '');
const fixture=bundle.replace(tag,(_,start,_payload,end)=>start+JSON.stringify(t).replaceAll('</','<\\u002F')+end);
const server=http.createServer((req,res)=>{
  if(req.url!=='/fixture'){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"connect-src 'none'; frame-src 'none'; img-src 'self' data: blob:");
  res.end(fixture);
});
const serveOnly=process.env.SETU_SMOKE_SERVE==='1';
await new Promise(resolve=>server.listen(serveOnly?Number(process.env.SETU_SMOKE_PORT||4174):0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
console.log('Fictional G4 UI fixture: '+origin+'/fixture');
if(serveOnly){
  process.on('SIGINT',()=>server.close());
}else{
  let browser;
  try {
    const {chromium}=await import('playwright').catch(()=>{throw new Error('Playwright is required for the optional browser check.');});
    browser=await chromium.launch({headless:true,...(process.env.SETU_CHROMIUM_PATH?{executablePath:process.env.SETU_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
    const artifacts=process.env.SETU_SMOKE_ARTIFACTS || await fs.mkdtemp(path.join(os.tmpdir(),'setu-g4-ui-'));
    const errors=[];
    for(const width of [320,390,1280]){
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      await context.addInitScript(()=>{window.setu={save(){throw new Error('Fictional write rejected: smoke test');}};});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(width+': '+e.message));
      try {
        await page.goto(origin+'/fixture');
        const open=page.getByRole('button',{name:'Visited / Confirm seating details'});
        await open.click();
        const dialog=page.getByRole('dialog',{name:/Confirm seating details/});await dialog.waitFor();
        assert.equal(await dialog.getByLabel('Seating policy').inputValue(),'buy_to_sit');
        assert.equal(await dialog.getByLabel('Minimum purchase amount (¥, if known)').inputValue(),'400');
        assert.equal(await dialog.getByLabel('Permitted stay duration').inputValue(),'unknown');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow at '+width);
        assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false,'dialog overflow at '+width);
        await page.screenshot({path:path.join(artifacts,'g4-'+width+'.png')});
        await dialog.getByLabel('Minimum purchase amount (¥, if known)').fill('0');
        await dialog.getByRole('button',{name:'Save checked details'}).click();
        await dialog.getByRole('alert').getByText(/Not saved/).waitFor();
        assert.equal(await dialog.getByLabel('Minimum purchase amount (¥, if known)').inputValue(),'0','failed save retains entry');
        await dialog.getByRole('button',{name:'Cancel'}).first().click();
        assert.equal(await page.getByRole('dialog').count(),0);
        assert.equal(await page.evaluate(()=>window.__g4SmokeApp.state.foods[0].min_order_yen),400,'cancel preserves recorded value');
        console.log('PASS '+width+'px: G4 dialog, prefill, no overflow, failed-save retention, cancel');
      }catch(e){errors.push(width+': '+e.stack);}
      finally{await context.close();}
    }
    assert.deepEqual(errors,[],'all responsive browser checks');
    console.log('Screenshots: '+artifacts);
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
