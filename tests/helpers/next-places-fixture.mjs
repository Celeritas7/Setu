import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

export const model=createRequire(import.meta.url)('../../js/next-places.js');
const bundle=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
export const template=JSON.parse(bundle.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
export const runtime=template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)[1];
export const css=[...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const manifest=JSON.parse(bundle.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1]);
export const fonts=Object.entries(manifest).filter(([,asset])=>asset.mime==='font/woff2').map(([path,asset])=>{
  if(asset.compressed)throw Error('The native fixture needs a decoder for compressed fonts.');
  return [path,{type:asset.mime,body:Buffer.from(asset.data,'base64')}];
});
export const now=new Date('2026-11-26T03:00:00Z');
export const query={origin:'hub:h1',hubId:'h1',date:'2026-11-26',time:'12:00',visitMin:30,budget:'',radiusKm:3,weather:'unknown',quiet:true,rest:true};
export const hub={id:'h1',name:'Fictional station',lat:35,lng:139};
export const place=(id,extra={})=>({id,name:'Fictional '+id,hub_id:'h1',lat:35.001,lng:139,accepted:true,status:'try',kind:'see',
  hours:{thu:[['09:00','18:00']]},hours_seen:'2026-11-25',source_url:'https://example.org/'+id,spend_yen:null,quiet:null,themes:[],...extra});
export function appHarness(){
  const writes=[],storage=new Map(),requests=[],window={SetuNextPlaces:model,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{writes.push(key);storage.set(key,value);}},addEventListener(){},removeEventListener(){},scrollTo(){},alert(message){throw Error(message);},
    setu:{save(){throw Error('Read-only preview must not save');},onAuth(){return ()=>{};}}};
  const document={getElementById:()=>null,querySelector:()=>null,addEventListener(){},removeEventListener(){}};
  class DCLogic{setState(patch){this.state={...this.state,...patch};}}
  const context=vm.createContext({DCLogic,window,document,localStorage:window.localStorage,console,Date,Intl,URL,URLSearchParams,navigator:{},setTimeout,clearTimeout,setInterval,clearInterval,
    fetch(){requests.push('fetch');throw Error('No fixture network');}});
  new vm.Script(runtime+'\nglobalThis.__nextTest={Component};').runInContext(context);
  const app=new context.__nextTest.Component();return {app,window,document,context,writes,requests,storage,helpers:app.nextPlacesHelpers()};
}
