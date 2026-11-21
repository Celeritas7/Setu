import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../research-import-sw.js',import.meta.url),'utf8');
function worker() {
  const handlers={},entries=new Map(),deleted=[];let fail=false,networkStatus=200;
  const cache={async addAll(requests){for(const request of requests)entries.set(request.url,new Response(request.url));},
    async match(key){return entries.get(key)?.clone();},async put(key,response){entries.set(key,response);}};
  vm.runInNewContext(source,{URL,Request,Response,
    self:{registration:{scope:'https://example.org/Setu/research-import.html'},addEventListener(name,handler){handlers[name]=handler;},async skipWaiting(){},clients:{async claim(){}}},
    caches:{async open(){return cache;},async keys(){return ['setu-research-import-%2FSetu%2F-old','setu-research-import-other-app-old','unrelated-pwa'];},async delete(key){deleted.push(key);}},
    async fetch(request){if(fail)throw new Error('Offline');return new Response(request.url,{status:networkStatus});}});
  async function lifecycle(name){let pending;handlers[name]({waitUntil(promise){pending=promise;}});await pending;}
  async function request(url,method='GET'){let pending;handlers.fetch({request:new Request(url,{method}),respondWith(promise){pending=promise;}});return pending;}
  return {entries,deleted,lifecycle,request,offline(){fail=true;},serverError(){networkStatus=503;}};
}
test('research shell precaches local assets and only retires its own old cache',async()=>{
  const w=worker();await w.lifecycle('install');await w.lifecycle('activate');
  for(const url of w.entries.keys())assert.ok(fs.existsSync(new URL('../'+new URL(url).pathname.replace('/Setu/',''),import.meta.url)));
  assert.equal(w.entries.size,8);assert.deepEqual(w.deleted,['setu-research-import-%2FSetu%2F-old']);
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
