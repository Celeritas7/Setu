import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const offline = createRequire(import.meta.url)('../js/research-offline.js');
const base = 'https://example.org/Setu/research-import.html';
function setup({controlled=true,active=true,reply=true,ready=true,registerFails=false}={}) {
  const events={},workerEvents={},registrationEvents={},sent=[],timers=[],requests=[];
  const controller={scriptURL:new URL('research-import-sw.js',base).href,postMessage(data,[port]) {
    sent.push(data.type);if(reply)port.send({type:offline.STATUS,version:offline.VERSION,ready});
  }};
  const worker={...controller,state:active?'activated':'installing',addEventListener(name,fn){workerEvents[name]=fn;}};
  const registration={scope:base,active:active?worker:null,installing:active?null:worker,async update(){},addEventListener(name,fn){registrationEvents[name]=fn;}};
  const serviceWorker={controller:controlled?controller:null,
    async register(url,options){requests.push({url,options});if(registerFails)throw Error('Offline');return registration;},
    async getRegistration(){return registration;},addEventListener(name,fn){events[name]=fn;}};
  const status={},check={listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}},reopen={};
  const init=offline.start({serviceWorker,secure:true,base,status,check,reopen,
    createChannel(){const port1={close(){}};return {port1,port2:{send(data){port1.onmessage?.({data});}}};},
    schedule(fn){timers.push(fn);return timers.length;},cancel(){}});
  return {init,status,check,reopen,serviceWorker,registration,controller,worker,events,workerEvents,sent,timers,requests,setReady(value){ready=value;}};
}
test('installed worker alone cannot report readiness without current-page control',async()=>{
  const h=setup({controlled:false});await h.init;
  assert.match(h.status.textContent,/not controlled/);assert.equal(h.reopen.hidden,true);assert.deepEqual(h.sent,[]);
  h.serviceWorker.controller=h.controller;await h.events.controllerchange();await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.status.textContent,/ready offline/);assert.equal(h.reopen.hidden,false);
  assert.equal(h.requests[0].options.scope,base);assert.equal(h.requests[0].options.updateViaCache,'none');
});
test('readiness requires all cached assets and Check offline setup requests repair',async()=>{
  const h=setup({ready:false});await h.init;assert.match(h.status.textContent,/not verified/);assert.equal(h.reopen.hidden,true);
  h.setReady(true);await h.check.listeners.click();
  assert.equal(h.sent.at(-1),offline.PREPARE);assert.equal(h.reopen.hidden,false);
});
test('old or unresponsive workers time out without a ready message',async()=>{
  const h=setup({reply:false});await new Promise(resolve=>setImmediate(resolve));h.timers[0]();await h.init;
  assert.match(h.status.textContent,/not verified/);assert.equal(h.reopen.hidden,true);
});
test('offline registration failure can verify an already installed exact-scope worker',async()=>{
  const h=setup({registerFails:true});await h.init;assert.match(h.status.textContent,/ready offline/);
});
test('activation and controller changes recheck setup instead of leaving an installing label',async()=>{
  const h=setup({active:false});await h.init;assert.match(h.status.textContent,/Installing/);
  h.worker.state='activated';h.registration.active=h.worker;h.registration.installing=null;h.workerEvents.statechange();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(h.reopen.hidden,false);
});
test('unsupported browsers keep local work available without an offline-ready claim',async()=>{
  const status={},check={},reopen={};await offline.start({serviceWorker:null,secure:false,base,status,check,reopen});
  assert.equal(check.disabled,true);assert.equal(reopen.hidden,true);assert.match(status.textContent,/needs a supported browser/);
});
test('another worker controlling the page cannot establish importer readiness',async()=>{
  const h=setup();await h.init;
  h.serviceWorker.controller={...h.controller,scriptURL:'https://example.org/another-app-sw.js'};
  await h.check.listeners.click();assert.equal(h.reopen.hidden,true);assert.match(h.status.textContent,/not controlled/);
});
test('failed installation leaves a repair instruction instead of an endless installing message',async()=>{
  const h=setup({active:false});await h.init;h.worker.state='redundant';h.workerEvents.statechange();
  assert.match(h.status.textContent,/installation failed/);assert.equal(h.reopen.hidden,true);
});
