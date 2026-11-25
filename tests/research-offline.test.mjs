import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../research-import-sw.js',import.meta.url),'utf8');
function worker() {
  const handlers={},entries=new Map(),deleted=[],background=[];let fail=false,networkStatus=200,cacheFail=false,stalled=false,openFail=false;
  const cache={async addAll(requests){if(cacheFail)throw new Error('Cache unavailable');for(const request of requests)entries.set(request.url,new Response(request.url));},
    async match(key){return entries.get(key)?.clone();},async put(key,response){entries.set(key,response);}};
  vm.runInNewContext(source,{URL,Request,Response,
    self:{registration:{scope:'https://example.org/Setu/research-import.html'},addEventListener(name,handler){handlers[name]=handler;},async skipWaiting(){},clients:{async claim(){}}},
    caches:{async open(){if(openFail)throw new Error('Cache unavailable');return cache;},async keys(){return ['setu-research-import-%2FSetu%2F-old','setu-research-import-other-app-old','unrelated-pwa'];},async delete(key){deleted.push(key);}},
    async fetch(request){if(stalled)return new Promise(()=>{});if(fail)throw new Error('Offline');return new Response('Refreshed '+request.url,{status:networkStatus});}});
  async function lifecycle(name){let pending;handlers[name]({waitUntil(promise){pending=promise;}});await pending;}
  async function request(url,method='GET'){let pending;handlers.fetch({request:new Request(url,{method}),respondWith(promise){pending=promise;},waitUntil(promise){background.push(promise);}});return pending;}
  async function message(type,url='https://example.org/Setu/research-import.html') {
    let pending,result;handlers.message({data:{type},source:{url},ports:[{postMessage(value){result=value;}}],waitUntil(promise){pending=promise;}});
    await pending;return result;
  }
  return {entries,deleted,lifecycle,request,message,async refreshed(){await Promise.all(background);},offline(){fail=true;},serverError(){networkStatus=503;},cacheError(){cacheFail=true;},stall(){stalled=true;},unavailableCache(){openFail=true;}};
}
test('research shell precaches local assets and only retires its own old cache',async()=>{
  const w=worker();await w.lifecycle('install');await w.lifecycle('activate');
  for(const url of w.entries.keys())assert.ok(fs.existsSync(new URL('../'+new URL(url).pathname.replace('/Setu/',''),import.meta.url)));
  assert.equal(w.entries.size,9);assert.deepEqual(w.deleted,['setu-research-import-%2FSetu%2F-old']);
});
test('offline navigation/assets fall back to cache while research JSON and other apps stay outside the handler',async()=>{
  const w=worker();await w.lifecycle('install');w.offline();
  const response=await w.request('https://example.org/Setu/research-import.html?resume=1');assert.ok(response.ok);
  assert.equal(await w.request('https://example.org/Setu/private-research.json'),undefined);
  assert.equal(await w.request('https://example.org/Setu/index.html'),undefined);
  assert.equal(await w.request('https://example.org/Setu/research-import.html','POST'),undefined);
});
test('temporary server errors keep the cached research shell usable',async()=>{
  const w=worker();await w.lifecycle('install');w.serverError();assert.equal((await w.request('https://example.org/Setu/research-import.html')).status,200);
});
test('a cached shell does not wait for a network request that never answers',async()=>{
  const w=worker();await w.lifecycle('install');w.stall();let timer;
  try {
    const response=await Promise.race([w.request('https://example.org/Setu/research-import.html'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Cached startup waited for the network')),200);})]);
    assert.equal(response.status,200);
  }finally{clearTimeout(timer);}
});
test('a usable online response survives unavailable cache storage',async()=>{
  const w=worker();w.unavailableCache();assert.equal((await w.request('https://example.org/Setu/research-import.html')).status,200);
});
test('cached startup still refreshes successful static responses in the background',async()=>{
  const w=worker(),url='https://example.org/Setu/research-import.html';await w.lifecycle('install');
  const cached=await w.request(url);assert.equal(await cached.text(),url);await w.refreshed();
  assert.equal(await w.entries.get(url).clone().text(),'Refreshed '+url);
});
test('offline verification detects evicted files and explicit setup repairs the cache',async()=>{
  const w=worker();await w.lifecycle('install');
  assert.equal((await w.message('SETU_RESEARCH_OFFLINE_STATUS')).ready,true);
  w.entries.delete('https://example.org/Setu/research-import.html');
  const incomplete=await w.message('SETU_RESEARCH_OFFLINE_STATUS');
  assert.equal(incomplete.ready,false);assert.deepEqual(Array.from(incomplete.missing),['/Setu/research-import.html']);
  assert.equal((await w.message('SETU_RESEARCH_OFFLINE_PREPARE')).ready,true);
  assert.equal(await w.message('SETU_RESEARCH_OFFLINE_PREPARE','https://example.org/another-app/'),undefined);
});
test('failed repair preserves an existing cache and cannot advertise missing files as ready',async()=>{
  const w=worker();await w.lifecycle('install');w.entries.delete('https://example.org/Setu/js/research-local.js');w.cacheError();
  assert.equal((await w.message('SETU_RESEARCH_OFFLINE_PREPARE')).ready,false);
  assert.equal(w.entries.size,8);
});
