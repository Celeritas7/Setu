import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import {workspace,A,B,local,model,Store} from './helpers/research-cloud-fixture.mjs';
const source=fs.readFileSync(new URL('../js/research-cloud-ui.js',import.meta.url),'utf8');
class Element {
  children=[];listeners={};value='';checked=false;disabled=false;
  constructor(tag,text=''){this.tagName=tag;this.textContent=text;}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
  addEventListener(name,fn){this.listeners[name]=fn;}setAttribute(name,value){this[name]=value;}
  showModal(){this.modal=true;}close(){this.closed=true;}remove(){this.removed=true;}
  async fire(name){return this.listeners[name]?.();}click(){return this.fire('click');}
}
const walk=el=>[el,...el.children.flatMap(walk)],text=el=>walk(el).map(node=>node.textContent).join('\n');
const button=(el,name)=>walk(el).find(node=>node.tagName==='button' && node.textContent===name);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(enabled=false){
  const localStore=new Store(),outbox=new Store(),data=await workspace();await localStore.write(data.id,0,data);
  let authCallback,uploads=0,resolvePrepare;
  const hub={user:{id:A,email:'test@example.org'},sb:{},onAuth(fn){authCallback=fn;fn(this.user);return()=>{};}};
  const body=new Element('body');
  const client={async prepare(){if(resolvePrepare)await new Promise(resolve=>{resolvePrepare=resolve;});return {payload:data,remote_rev:0,publish:true,differences:[],summary:{created:1,reused:0,merges:0,local_suggestions:1}};},async commit(){uploads++;return {rev:1,created:1,evidence_added:1};},async list(){return[];},async evidence(){return[];}};
  const context=vm.createContext({document:{body,createElement:tag=>new Element(tag)},SetuResearchLocal:local,SetuResearchImport:model,
    SetuResearchCloud:{RELEASE_ENABLED:enabled,create:()=>client},SetuResearchStorage:{async open(_,name){return name?outbox:localStore;}},URL,Blob,setTimeout});
  vm.runInContext(source,context);const dialog=context.SetuResearchCloudUI.open({hub});await tick();
  return {dialog,get uploads(){return uploads;},switchAccount(){hub.user={id:B,email:'other@example.org'};authCallback(hub.user);},delay(){resolvePrepare=true;},release(){resolvePrepare();}};
}
test('cloud panel previews an explicit batch but keeps upload and retry disabled in the prepared release',async()=>{
  const h=await harness();assert.match(text(h.dialog),/Cloud saving is not enabled/);
  await button(h.dialog,'Preview cloud batch').fire('click');assert.match(text(h.dialog),/Preview ready/);assert.match(text(h.dialog),/Admission price unknown/);
  const confirmation=walk(h.dialog).filter(node=>node.tagName==='input')[1];confirmation.checked=true;await confirmation.fire('change');
  assert.equal(button(h.dialog,'Upload reviewed batch').disabled,true);assert.equal(button(h.dialog,'Retry pending upload').disabled,true);assert.equal(h.uploads,0);
});
test('the enabled UI requires preview plus explicit approval; sign-in changes clear the preview',async()=>{
  const h=await harness(true);await button(h.dialog,'Preview cloud batch').fire('click');
  const commit=button(h.dialog,'Upload reviewed batch');assert.equal(commit.disabled,true);
  const confirmation=walk(h.dialog).filter(node=>node.tagName==='input')[1];confirmation.checked=true;await confirmation.fire('change');assert.equal(commit.disabled,false);
  await commit.fire('click');assert.equal(h.uploads,1);assert.match(text(h.dialog),/Cloud save confirmed/);
  h.switchAccount();await tick();assert.match(text(h.dialog),/other@example.org/);assert.equal(button(h.dialog,'Upload reviewed batch').disabled,true);assert.doesNotMatch(text(h.dialog),/Test park/);
});
test('changing the account during an asynchronous preview cannot display the previous account’s batch',async()=>{
  const h=await harness(true);h.delay();const pending=button(h.dialog,'Preview cloud batch').fire('click');h.switchAccount();await tick();h.release();await pending;
  assert.match(text(h.dialog),/other@example.org/);assert.doesNotMatch(text(h.dialog),/Preview ready/);assert.doesNotMatch(text(h.dialog),/Test park/);
});
