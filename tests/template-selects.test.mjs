import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';

const bundle=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const template=process.env.SETU_TEST_TEMPLATE ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE,'utf8')
  : JSON.parse(bundle.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const manifest=JSON.parse(bundle.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1]);
const resource=Object.values(manifest).filter(x=>/javascript/.test(x.mime)).map(x=>{
  const bytes=Buffer.from(x.data,'base64');return (x.compressed?zlib.gunzipSync(bytes):bytes).toString();
}).find(x=>x.includes('var RAW_WRAP =') && x.includes('function walkElement('));
assert.ok(resource,'test the renderer actually delivered with the app');

test('dynamic option loops survive the bundle parser by using the renderer raw-select wrapper',()=>{
  // Native HTML parsing ignores unknown tags inside <select>. The outer bundle
  // parses before the renderer can encode native controls, so a sc-for in a
  // native select would disappear despite renderVals-only tests passing.
  assert.match(bundle,/new DOMParser\(\)\.parseFromString\(template, 'text\/html'\)/);
  const selectors=Array.from(template.matchAll(/<sc-raw-select\b([^>]*)>([\s\S]*?)<\/sc-raw-select>/g));
  assert.equal(selectors.length,9);
  for(const name of ['seatPrefecture','seatHubId','odPrefecture','odHubId','wvPrefecture','wvHubKey','researchTag']){
    const control=selectors.find(m=>m[1].includes(`value="{{ ${name} }}"`));
    assert.ok(control,name+' uses a parser-safe wrapper');
    assert.match(control[1],/sc-camel-on-change="\{\{ \w+ \}\}"/);
    assert.match(control[2],/<sc-for\b[^>]*>[\s\S]*<option\b[^>]*>[\s\S]*<\/option>[\s\S]*<\/sc-for>/);
  }
  for(const [name,values] of [['wvBudgetLimit',['all','0','500','1000','1500','2000','3000']],['wvBudgetSort',['original','price']]]){
    const control=selectors.find(m=>m[1].includes(`value="{{ ${name} }}"`));
    assert.ok(control,name+' uses the same controlled-select wrapper');
    assert.match(control[1],/sc-camel-on-change="\{\{ \w+ \}\}"/);
    assert.deepEqual(Array.from(control[2].matchAll(/<option value="([^"]+)"/g),m=>m[1]),values);
  }
  const research=selectors.find(m=>m[1].includes('value="{{ researchTag }}"'));
  assert.match(research[1],/aria-label="Research tag"/);
  assert.match(research[1],/sc-camel-on-change="\{\{ changeResearchTag \}\}"/);
  assert.match(research[2],/<option value="">All research tags<\/option>/);
  assert.match(research[2],/list="\{\{ researchTagOptions \}\}"/);
  for(const control of template.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g))
    assert.doesNotMatch(control[1],/<sc-(?:for|if)\b/,'custom control flow cannot be placed inside a native select before bundle parsing');
});

test('the packaged renderer leaves raw selectors intact and unwraps them into real controlled selects',()=>{
  const encoding=resource.slice(resource.indexOf('// src/encode.ts'),resource.indexOf('// src/compile.ts'));
  const element=resource.slice(resource.indexOf('var NEVER_CONTENT_KEYED ='),resource.indexOf('// src/logic.ts'));
  const change=()=>{};
  const factory=new Function('h','collectProps','walkChildren','isDeckMountTag','renderDeckKids',encoding+element+'\nreturn {encodeCase,walkElement};');
  const api=factory((tag,props,...children)=>({tag,props,children}),
    ()=>({propGetters:[['value',v=>v.selected],['onChange',()=>change],['disabled',v=>v.disabled]],pseudoClasses:[]}),
    ()=>[],()=>false,()=>[]);
  const encoded=api.encodeCase('<sc-raw-select><sc-for list="{{ rows }}" as="r"><option>{{ r.name }}</option></sc-for></sc-raw-select>');
  assert.ok(encoded.startsWith('<sc-raw-select>'));
  assert.equal((encoded.match(/sc-raw-select/g)||[]).length,2);
  assert.ok(encoded.includes('<sc-for'));
  const node={localName:'sc-raw-select',childNodes:[],getAttribute:()=>null,querySelector:()=>null};
  const build=api.walkElement(node,{}), enabled=build({selected:'saitama',disabled:false},{},0), disabled=build({selected:'',disabled:true},{},0);
  assert.equal(enabled.tag,'select');assert.equal(enabled.props.value,'saitama');assert.equal(enabled.props.onChange,change);assert.equal(enabled.props.disabled,false);
  assert.equal(disabled.props.disabled,true);assert.equal(disabled.props.value,'');
});
