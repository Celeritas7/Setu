import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {verifiedChrome} from './research-browser-binary.mjs';
import {research,copy} from './research-cloud-fixture.mjs';

export const importerAssets=['research-import.html','css/research-import.css','js/research-import-schema.js','js/research-import.js','js/research-local.js','js/research-storage.js','js/research-offline.js','js/research-import-ui.js','icons/icon-192.png'];
export function fictionalResearch({region='A',count=37}={}){
  const data=research(),base=copy(data.places[0]),sizes=count===37?[13,4,4,5,5,5,1]:[count];
  data.destination.name_ja='架空の研究先 '+region;data.hubs=sizes.map((_,i)=>({id:'hub-'+(i+1),name_ja:'架空の拠点 '+region+' '+(i+1)}));
  let n=0;data.places=sizes.flatMap((size,hub)=>Array.from({length:size},()=>{
    const place=copy(base),number=String(++n).padStart(2,'0');place.research_id=region+'-'+number;place.name_ja='架空スポット '+region+' '+number;place.hub_id=data.hubs[hub].id;
    place.location.address_ja='Fictional '+region+' address '+number;place.source_links=[{url:'https://example.org/'+region+'/'+number,checked_at:'2026-11-20'}];return place;
  }));
  return data;
}

export async function freshImporterBrowser(){
  const assets=new Map(),requests=[],rejected=[],errors=[],contexts=new Set(),held=new Set();
  const control={stall:false,fail:new Set(),version:null};let browser,server;
  for(const path of [...importerAssets,'research-import-sw.js'])assets.set('/Setu/'+path,await readFile(new URL('../../'+path,import.meta.url)));
  function release(){for(const send of [...held])send();held.clear();}
  try{
    server=createServer((req,res)=>{
      const path=new URL(req.url,'http://127.0.0.1').pathname;requests.push({path,method:req.method});
      const send=()=>{
        held.delete(send);if(res.destroyed||res.writableEnded)return;
        if(path==='/Setu/index.html'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Unrelated scope fixture</title><link rel="icon" href="data:,"><h1>Unrelated scope fixture</h1>');return;}
        const source=assets.get(path);if(!source){rejected.push(path);res.writeHead(404);res.end();return;}
        if(control.fail.has(path)){res.writeHead(503);res.end('Fictional static-file failure');return;}
        let body=source;
        if(control.version&&['/Setu/research-import-sw.js','/Setu/js/research-offline.js'].includes(path)){
          const text=source.toString();assert.match(text,/const VERSION = '[^']+';/);
          body=text.replace(/const VERSION = '[^']+';/,"const VERSION = '"+control.version+"';");
        }
        const type=path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':'text/javascript';
        res.writeHead(200,{'content-type':type,'cache-control':'no-store','content-security-policy':"connect-src 'self'; frame-src 'none'; object-src 'none'"});res.end(body);
      };
      if(control.stall&&assets.has(path)){held.add(send);res.once('close',()=>held.delete(send));return;}
      send();
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin='http://127.0.0.1:'+server.address().port,url=origin+'/Setu/research-import.html';
    browser=await chromium.launch({executablePath:await verifiedChrome(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    return {browser,origin,url,control,requests,rejected,errors,release,
      async open({width=1280,height=950,context}={}){
        if(!context){context=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Tokyo',serviceWorkers:'allow',acceptDownloads:true});contexts.add(context);
          context.on('request',request=>{const outside=new URL(request.url()).origin;if(outside!==origin)rejected.push(outside);});
          context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));}
        const page=await context.newPage();
        await page.goto(url);await page.locator('#storage-status').filter({hasText:'Local storage ready'}).waitFor();return {page,context};
      },
      async closeContexts(){release();for(const context of contexts)await context.close();contexts.clear();},
      async close(){await this.closeContexts();await browser.close();const done=new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));server.closeAllConnections();await done;}
    };
  }catch(error){release();await browser?.close();if(server?.listening){const done=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await done;}throw error;}
}
