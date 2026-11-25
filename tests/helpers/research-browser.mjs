// Own Chromium profile + actual app modules/IndexedDB + the isolated HTTP API.
// It never loads the production bootstrap, account, browser profile or URL.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {freshResearchApi} from './research-http-gateway.mjs';
import {verifiedChrome} from './research-browser-binary.mjs';
import {A,B} from './research-cloud-fixture.mjs';

const modules=['research-import-schema','research-import','research-local','research-storage','research-cloud','research-cloud-ui','research-cloud-loader'];
const script=`(async()=>{
  const c=window.__researchFixture;
  const original=window.SetuResearchCloud;window.__originalReleaseGate=original.RELEASE_ENABLED;
  if(c.enabled)window.SetuResearchCloud={...original,RELEASE_ENABLED:true,create:options=>original.create({...options,enabled:true})};
  const sb=window.supabase.createClient(location.origin,'synthetic-public-key',{
    auth:{storageKey:'setu-browser-rehearsal',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>{if(new URL(input).origin!==location.origin)throw Error('Non-fixture API blocked');return fetch(input,init);}}
  });
  await new Promise((resolve,reject)=>{
    const r=indexedDB.open('setu-research-local-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('workspaces',{keyPath:'id'});r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces');
      for(const payload of c.workspaces){const get=store.get(payload.id);get.onsuccess=()=>{if(!get.result)store.put({id:payload.id,rev:1,saved_at:'2026-11-25T00:00:00.000Z',payload,previous:null});};}
      tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>reject(tx.error);
    };
  });
  const listeners=new Set(),hub={sb,user:null,onAuth(fn){listeners.add(fn);fn(this.user);return()=>listeners.delete(fn);}};
  const update=user=>{hub.user=user?{...user,email:user.id===c.ownerA?'owner-a@example.invalid':'owner-b@example.invalid'}:null;for(const fn of listeners)fn(hub.user);};
  const existing=await sb.auth.getSession();
  if(existing.data.session)update(existing.data.session.user);
  else{const result=await sb.auth.setSession({access_token:c.tokenA,refresh_token:'synthetic-not-used'});if(result.error)throw result.error;update(result.data.user);}
  sb.auth.onAuthStateChange((_event,session)=>update(session?.user));
  window.__researchTest={hub,listeners,
    async switchTo(owner){const result=await sb.auth.setSession({access_token:owner===c.ownerA?c.tokenA:c.tokenB,refresh_token:'synthetic-not-used'});if(result.error)throw result.error;update(result.data.user);},
    async outbox(owner,destination){const store=await SetuResearchStorage.open(undefined,'setu-research-cloud-outbox-v1');try{return await store.read(owner+'/'+destination);}finally{store.close();}},
    async bumpLocal(destination){const store=await SetuResearchStorage.open();try{const r=await store.read(destination);await store.write(r.id,r.rev,r.payload);}finally{store.close();}}
  };
  document.querySelector('#open').onclick=()=>c.enabled?SetuResearchCloudUI.open({hub}):SetuOpenResearchCloud({hub});
  for(const [id,owner] of [['account-a',c.ownerA],['account-b',c.ownerB]])document.getElementById(id).onclick=()=>window.__researchTest.switchTo(owner);
  document.querySelector('#ready').textContent='Fixture ready';
})().catch(error=>{document.querySelector('#ready').textContent='Fixture failed: '+error.message;throw error;});`;

export async function freshResearchBrowser(){
  const executablePath=await verifiedChrome();let browser,api;
  const contexts=new Set(),blocked=[],errors=[];
  try{
    browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    api=await freshResearchApi();
    await api.db.admin.query(await readFile(new URL('../../supabase/operations/research_core_revoke_truncate.sql',import.meta.url),'utf8'));
    const bundle=await readFile(new URL('../../index.html',import.meta.url),'utf8');
    const template=JSON.parse(bundle.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
    const appCss=[...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
    const assets=new Map();
    assets.set('/fixture/supabase.js',{type:'text/javascript',body:await readFile(new URL('../../node_modules/@supabase/supabase-js/dist/umd/supabase.js',import.meta.url))});
    for(const name of modules)assets.set('/Setu/js/'+name+'.js',{type:'text/javascript',body:await readFile(new URL('../../js/'+name+'.js',import.meta.url))});
    assets.set('/Setu/css/research-cloud.css',{type:'text/css',body:await readFile(new URL('../../css/research-cloud.css',import.meta.url))});
    assets.set('/fixture/setup.js',{type:'text/javascript',body:script});
    assets.set('/Setu/index.html',{type:'text/html',body:'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>'+appCss+'</style><link rel="stylesheet" href="css/research-cloud.css"><body><h1>Fictional local research rehearsal</h1><p id="ready">Loading fixture</p><button id="open">Open Research cloud</button><button id="account-a">Use fictional account A</button><button id="account-b">Use fictional account B</button><script src="/fixture/supabase.js"></script>'+modules.map(n=>'<script src="js/'+n+'.js"></script>').join('')+'<script src="/fixture/setup.js"></script></body></html>'});
    return {api,browser,contexts,blocked,errors,
      async open(workspaces,{enabled=true,width=1280,height=900}={}){
        const context=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Tokyo',serviceWorkers:'block',acceptDownloads:true});contexts.add(context);
        await context.addInitScript(c=>{window.__researchFixture=c;},{enabled,workspaces,ownerA:A,ownerB:B,tokenA:await api.token(A),tokenB:await api.token(B)});
        await context.route('**/*',async route=>{
          const u=new URL(route.request().url());
          if(u.origin!==api.url){blocked.push(u.origin);await route.abort();return;}
          const asset=assets.get(u.pathname);
          if(asset){await route.fulfill({status:200,contentType:asset.type,body:asset.body,headers:{'cache-control':'no-store','content-security-policy':"connect-src 'self'; frame-src 'none'; object-src 'none'"}});return;}
          if(u.pathname.startsWith('/rest/v1/')||u.pathname==='/auth/v1/user'){await route.continue();return;}
          blocked.push(u.pathname);await route.abort();
        });
        const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
        await page.goto(api.url+'/Setu/index.html');await page.getByText('Fixture ready',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>window.__originalReleaseGate),false,'The product gate must remain disabled.');
        return {page,context,async secondTab(){const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(api.url+'/Setu/index.html');await other.getByText('Fixture ready',{exact:true}).waitFor();return other;}};
      },
      async closeContexts(){for(const context of contexts)await context.close();contexts.clear();},
      async close(){await this.closeContexts();await browser.close();await api.close();},
    };
  }catch(error){await browser?.close();await api?.close();throw error;}
}
