import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {verifiedChrome} from './research-browser-binary.mjs';
import {runtime,css,fonts,place,hub} from './next-places-fixture.mjs';

export const dataset=(count=8)=>({setu_hubs:[hub],setu_food_notes:[],setu_spots:Array.from({length:count},(_,i)=>place('p'+i,{name:'Fictional place '+i,lat:35.001+i/10000}))});
const setup=`
const listeners=new Set();window.__checks={writes:0,gps:0};
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){__checks.gps++;throw Error('No GPS allowed');},watchPosition(){__checks.gps++;throw Error('No GPS allowed');},clearWatch(){}}});
window.DCLogic=class {setState(patch){this.state={...this.state,...patch};}};
window.setu={onAuth(fn){listeners.add(fn);fn(app.state.user);return()=>listeners.delete(fn);},save(){__checks.writes++;throw Error('No writes allowed');}};
`+runtime+`
const app=new Component(), fixture=window.__fixture;
app.state={...app.state,user:{id:'fictional-A'},cloud:true,hubId:'h1'};
app.researchComparison={userId:'fictional-A',tables:fixture.tables};
const before=JSON.stringify({tables:fixture.tables,outings:app.state.outings,foods:app.state.foods,spots:app.state.spots});
window.__nextFixture={app,listeners,unchanged:()=>before===JSON.stringify({tables:fixture.tables,outings:app.state.outings,foods:app.state.foods,spots:app.state.spots}),
 switchAccount(){app.state={...app.state,user:{id:'fictional-B'}};for(const listener of [...listeners])listener(app.state.user);},
 signOut(){app.state={...app.state,user:null,cloud:false,foods:[{id:'local1',name:'Local starting place',accepted:true,status:'try'},{id:'local2',name:'Local second place',accepted:true,status:'try'}]};for(const listener of [...listeners])listener(null);}};
document.getElementById('open').onclick=()=>app.openNextPlaces();
document.getElementById('ready').textContent='Fixture ready';
`;
export async function freshNextPlacesBrowser(){
  let browser,server;const contexts=new Set(),blocked=[],errors=[];
  try{
    const assets=new Map();for(const [path,type] of [['js/next-places.js','text/javascript'],['js/next-places-ui.js','text/javascript'],['css/next-places.css','text/css']])assets.set('/Setu/'+path,{type,body:await readFile(new URL('../../'+path,import.meta.url))});
    for(const [path,asset] of fonts)assets.set('/Setu/'+path,asset);
    assets.set('/fixture/setup.js',{type:'text/javascript',body:setup});
    assets.set('/Setu/index.html',{type:'text/html',body:'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>'+css+'</style><body><h1>Fictional local next-place rehearsal</h1><p id="ready">Loading fixture</p><button id="open">Open next-place preview</button><script src="/fixture/setup.js"></script></body></html>'});
    server=createServer((req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname,asset=assets.get(path);if(!asset){blocked.push(path);res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':asset.type,'cache-control':'no-store','content-security-policy':"connect-src 'none'; frame-src 'none'; object-src 'none'"});res.end(asset.body);});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({executablePath:await verifiedChrome(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    return {browser,blocked,errors,async open(tables=dataset(),{width=1280,height=900}={}){
      const context=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});contexts.add(context);context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
      await context.addInitScript(data=>{window.__fixture=data;},{tables});
      await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blocked.push(route.request().url());return route.abort();}return route.continue();});
      const page=await context.newPage();await page.goto(origin+'/Setu/index.html');await page.getByText('Fixture ready',{exact:true}).waitFor();await page.locator('#open').click();await page.getByRole('dialog').waitFor();return {page,context};
    },async closeContexts(){for(const context of contexts)await context.close();contexts.clear();},async close(){await this.closeContexts();await browser.close();const done=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await done;}};
  }catch(error){await browser?.close();if(server?.listening){const done=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await done;}throw error;}
}
