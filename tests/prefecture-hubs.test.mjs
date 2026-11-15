import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the shipped runtime, not a second copy of its grouping logic.
const template = process.env.SETU_TEST_TEMPLATE
  ? fs.readFileSync(process.env.SETU_TEST_TEMPLATE,'utf8')
  : JSON.parse(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
    .match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
const runtime = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/)?.[1];
assert.ok(runtime?.includes('PREFECTURE_HUB_HELPERS_START'),'prefecture helpers must be in the actual runtime');
const script = new vm.Script(`${runtime}\n;globalThis.__prefectureTest = {SETU_PREFECTURES,setuPrefectureEvidence,setuHubPrefecture,setuPrefectureHierarchy};`);
const calls = [];
class DCLogic {}
const ctx = vm.createContext({DCLogic,Date,Intl,URL,URLSearchParams,console,
  window:{setu:{save(){calls.push('save');throw new Error('Grouping must not write records');}}},
  localStorage:{getItem(){calls.push('get');return null;},setItem(){calls.push('set');}},
  document:{},navigator:{},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},
  fetch(){calls.push('fetch');throw new Error('Grouping must be pure');}});
script.runInContext(ctx);
const api = ctx.__prefectureTest;
const plain = x => JSON.parse(JSON.stringify(x));
const frozen = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(frozen); Object.freeze(x); } return x; };
const hub = (id,extra={}) => ({id,name:`Hub ${id}`,...extra});
const place = (id,hubId,extra={}) => ({id,hubId,name:`Place ${id}`,accepted:true,status:'try',_t:'spot',...extra});
const resolve = (row,options) => api.setuPrefectureEvidence(row,options);
const hierarchy = options => api.setuPrefectureHierarchy(options);

test('embedded runtime parses and exposes the pure hierarchy API', () => {
  new Function(runtime);
  for (const key of ['setuPrefectureEvidence','setuHubPrefecture','setuPrefectureHierarchy']) assert.equal(typeof api[key],'function');
});

test('all 47 standard prefectures have unique Japanese, English and code aliases', () => {
  assert.equal(api.SETU_PREFECTURES.length,47);
  assert.equal(new Set(Array.from(api.SETU_PREFECTURES,p=>p.id)).size,47);
  assert.equal(new Set(Array.from(api.SETU_PREFECTURES,p=>p.ja)).size,47);
  for (const p of api.SETU_PREFECTURES) {
    for (const value of [p.id,p.label,p.ja,p.ja.replace(/[都府県]$/,''),`JP-${p.code}`,`${p.label} Prefecture`]) {
      assert.equal(resolve({prefecture:value}).id,p.id,`${p.id}: ${value}`);
    }
    assert.equal(resolve({address:`${p.ja}架空市1丁目`}).id,p.id,`${p.id} in Japanese address`);
    assert.equal(resolve({address:`1-2 Fictional Street, ${p.label}, Japan`}).id,p.id,`${p.id} in English address`);
  }
});

test('case, full-width letters, macrons, prefectural suffixes and postal segments normalize safely', () => {
  for (const [value,id] of [['Tōkyō','tokyo'],['Ōsaka','osaka'],['Kyōto','kyoto'],['Hyōgo','hyogo'],
    ['Ōita','oita'],['Kōchi','kochi'],['Hokkaidō','hokkaido'],['ＳＡＩＴＡＭＡ','saitama'],['Tokyo Metropolis','tokyo']]) {
    assert.equal(resolve({prefecture:value}).id,id);
  }
  for (const [value,id] of [['Tokyo-to','tokyo'],['Kyoto-fu','kyoto'],['Osaka fu','osaka'],['Saitama-ken','saitama']]) {
    assert.equal(resolve({address:`1 Fictional Street, ${value}`}).id,id);
  }
  for (const value of ['Example, Saitama 330-0000, Japan','Example Saitama 3300000 Japan','Saitama Japan']) {
    assert.equal(resolve({address:value}).id,'saitama');
  }
});

test('English business-name substrings never become prefecture evidence', () => {
  for (const text of ['Soup Stock Tokyo ルミネ大宮','Soup Stock Tokyo, Omiya','Tokyo Camera Shop 1F',
    'Saitama University','Tokyo DisneySea','New Tokyo Restaurant','Osaka Coffee Building','Tokyometropolis']) {
    for (const field of ['address','geoQuery','geo_query','area']) assert.equal(resolve({[field]:text}).id,'unassigned',`${field}: ${text}`);
  }
  assert.equal(resolve({name:'Soup Stock Tokyo',geo_query:'Soup Stock Tokyo ルミネ大宮',address:'Lumine 2 B1, 630 Nishikichō, Omiya'}).id,'unassigned');
  assert.equal(resolve({name:'Soup Stock Tokyo',geo_query:'Soup Stock Tokyo ルミネ大宮',address:'埼玉県さいたま市大宮区'}).id,'saitama');
});

test('known literal place names are stripped from address-like fields before matching', () => {
  assert.equal(resolve({name:'Osaka Prefecture Cafe',geoQuery:'Osaka Prefecture Cafe, Tokyo, Japan'}).id,'tokyo');
  assert.equal(resolve({name:'東京都美術館',geoQuery:'東京都美術館'}).id,'unassigned');
  assert.equal(resolve({name:'北海道ラーメン',address:'北海道ラーメン, 神奈川県横浜市'}).id,'kanagawa');
});

test('Japanese prefecture words inside a differently named business require an actual address boundary', () => {
  for (const query of ['北海道キッチン ルミネ大宮','東京都美術館','京都府立カフェ','大阪府民レストラン']) {
    assert.equal(resolve({name:'Translated business name',geoQuery:query}).id,'unassigned',query);
  }
  assert.equal(resolve({name:'North Kitchen',geoQuery:'北海道キッチン ルミネ大宮',address:'埼玉県さいたま市大宮区'}).id,'saitama');
  for (const [address,id] of [['北海道札幌市中央区','hokkaido'],['北海道虻田郡ニセコ町','hokkaido'],
    ['東京都 新宿区西新宿1丁目','tokyo'],['神奈川県横浜市西区','kanagawa'],['京都府京都市下京区','kyoto']]) {
    assert.equal(resolve({address}).id,id,address);
  }
});

test('full Japanese prefectures bounded by whitespace or punctuation are valid before or after a POI', () => {
  for (const query of ['上尾運動公園 埼玉県','川越公園 埼玉県','埼玉県 上尾運動公園',
    '埼玉県　川越公園','公園（埼玉県）','公園 / 埼玉県 / 日本','公園・埼玉県']) {
    assert.equal(resolve({geoQuery:query}).id,'saitama',query);
    assert.equal(api.setuHubPrefecture(hub('h'),[place('p','h',{geoQuery:query})]).id,'saitama',`linked: ${query}`);
  }
  for (const p of api.SETU_PREFECTURES) {
    assert.equal(resolve({geoQuery:`架空公園 ${p.ja}`}).id,p.id);
    assert.equal(resolve({geoQuery:`${p.ja} 架空公園`}).id,p.id);
  }
  for (const query of ['北海道キッチン','架空カフェ北海道','東京都美術館','神奈川区']) {
    assert.equal(resolve({geoQuery:query}).id,'unassigned',query);
  }
  const conflict=resolve({geoQuery:'公園 埼玉県 東京都'});
  assert.equal(conflict.id,'unassigned'); assert.equal(conflict.reason,'conflicting');
});

test('bare Japanese prefixes, private notes, descriptions and business names supply no location', () => {
  for (const text of ['埼玉大学','東京カフェ','京都風レストラン','神奈川カメラ']) {
    assert.equal(resolve({geoQuery:text}).id,'unassigned');
  }
  assert.equal(resolve({name:'Tokyo',notes:'埼玉県',why:'神奈川県',intro:'東京都',text:'Osaka',review:'Chiba',url:'https://example.com/saitama'}).id,'unassigned');
  assert.equal(resolve({name:'Urawa-Okubo (Saitama Univ.)'},{hub:true}).id,'unassigned');
  assert.equal(resolve({name:'Saitama'},{hub:true}).id,'saitama');
  assert.equal(resolve({name:'Saitama'}).id,'unassigned');
});

test('one row with conflicting explicit prefectures stays Unassigned', () => {
  for (const row of [
    {address:'東京都新宿区 / 埼玉県さいたま市'},
    {address:'Example, Tokyo, Japan',geo_query:'Example, Saitama, Japan'},
    {prefecture:'Saitama',address:'東京都新宿区'},
    {prefecture_name:'Chiba',prefectureCode:'JP-14'}
  ]) {
    const result=resolve(row);
    assert.equal(result.id,'unassigned'); assert.equal(result.reason,'conflicting');
  }
  assert.equal(resolve({address:'東京都新宿区',geoQuery:'Shinjuku, Tokyo, Japan'}).id,'tokyo');
});

test('explicit hub geography takes precedence over linked places, but never overrides its own conflict', () => {
  const linked=[place('a','h',{address:'東京都新宿区'})];
  assert.equal(api.setuHubPrefecture(hub('h',{geoQuery:'埼玉県さいたま市'}),linked).id,'saitama');
  assert.equal(api.setuHubPrefecture(hub('h',{name:'Saitama'}),linked).id,'saitama');
  const conflict=api.setuHubPrefecture(hub('h',{address:'東京都新宿区',geoQuery:'埼玉県さいたま市'}),linked);
  assert.equal(conflict.id,'unassigned'); assert.equal(conflict.reason,'conflicting');
});

test('linked address consensus ignores unknown rows, unrelated links and deleted evidence', () => {
  const linked=[place('known','h',{address:'埼玉県さいたま市'}),place('unknown','h'),
    place('foreign','other',{address:'東京都新宿区'}),place('deleted','h',{address:'神奈川県横浜市',deleted_at:'2026-01-01'})];
  const result=api.setuHubPrefecture(hub('h'),linked);
  assert.equal(result.id,'saitama'); assert.equal(result.reason,'consensus'); assert.equal(result.source,'linked-places');
  assert.equal(api.setuHubPrefecture(hub('h'),[place('unknown','h')]).id,'unassigned');
});

test('conflicting child rows and multi-prefecture child sets invalidate inference', () => {
  const known=place('known','h',{address:'埼玉県さいたま市'});
  const crossPrefecture=api.setuHubPrefecture(hub('h'),[known,place('other','h',{address:'東京都新宿区'})]);
  assert.equal(crossPrefecture.id,'unassigned'); assert.equal(crossPrefecture.reason,'conflicting');
  const badRow=api.setuHubPrefecture(hub('h'),[known,place('bad','h',{address:'東京都新宿区',geo_query:'神奈川県横浜市'})]);
  assert.equal(badRow.id,'unassigned'); assert.equal(badRow.reason,'conflicting');
});

test('coordinates and unsourced station or municipality guesses cannot classify a hub', () => {
  assert.equal(api.setuHubPrefecture(hub('h',{name:'Fictional local station',geoQuery:'同名駅',lat:35.8,lng:139.6})).id,'unassigned');
  assert.equal(api.setuHubPrefecture(hub('h',{name:'Omiya'})).id,'unassigned');
  assert.equal(api.setuHubPrefecture(hub('h',{geoQuery:'Unknown city'})).id,'unassigned');
});

test('only exact sourced public station and campus queries provide last-resort geography', () => {
  for (const [query,id] of [['船橋駅','chiba'],['川口駅','saitama'],['中浦和駅','saitama'],['西川口駅','saitama'],
    ['与野駅','saitama'],['横浜駅','kanagawa'],['みなとみらい駅','kanagawa'],['埼玉大学','saitama']]) {
    const result=api.setuHubPrefecture(hub('h',{geoQuery:query}));
    assert.equal(result.id,id); assert.equal(result.source,'public-query'); assert.equal(result.reason,'reference');
    assert.equal(result.referenceUrls.length,1); assert.match(result.referenceUrls[0],/^https:\/\//);
    assert.equal(api.setuHubPrefecture(hub('h',{geo_query:query})).id,id);
    assert.equal(api.setuHubPrefecture(hub('h',{name:query})).id,'unassigned','never use private/display hub names for public lookup');
  }
  for (const query of ['船橋','船橋駅前のカフェ','川口駅 店内','山下公園','Unknown 川口駅','横浜駅前の店']) {
    assert.equal(api.setuHubPrefecture(hub('h',{geoQuery:query})).id,'unassigned',query);
  }
  assert.equal(api.setuHubPrefecture(hub('h',{notes:'横浜駅',name:'Shop near 横浜駅'})).id,'unassigned');
});

test('public query fallback never overrides own evidence, child consensus or a conflict', () => {
  const publicHub=hub('h',{geoQuery:'川口駅'});
  assert.equal(api.setuHubPrefecture({...publicHub,address:'東京都新宿区'}).id,'tokyo');
  assert.equal(api.setuHubPrefecture(publicHub,[place('child','h',{address:'神奈川県横浜市'})]).id,'kanagawa');
  const conflict=api.setuHubPrefecture(publicHub,[place('a','h',{address:'東京都新宿区'}),place('b','h',{address:'埼玉県さいたま市'})]);
  assert.equal(conflict.id,'unassigned'); assert.equal(conflict.reason,'conflicting');
  const directConflict=api.setuHubPrefecture({...publicHub,prefecture:'Saitama',address:'東京都新宿区'});
  assert.equal(directConflict.id,'unassigned'); assert.equal(directConflict.reason,'conflicting');
  const twoQueries=api.setuHubPrefecture(hub('h',{geoQuery:'川口駅',geo_query:'船橋駅'}));
  assert.equal(twoQueries.id,'unassigned'); assert.equal(twoQueries.reason,'conflicting');
});

test('hierarchy exposes only prefecture roots while preserving real hub IDs and empty hubs', () => {
  const hubs=[hub('saitama-a',{geoQuery:'埼玉県さいたま市',name:'Alpha'}),hub('saitama-b',{prefecture:'Saitama',name:'Beta'}),
    hub('tokyo-empty',{prefecture:'Tokyo'}),hub('unknown')];
  const places=[place('one','saitama-a'),place('two','saitama-a',{_t:'food'}),place('three','unknown')];
  const model=hierarchy({hubs,places});
  assert.deepEqual(Array.from(model.prefectures,p=>p.id),['saitama','tokyo','unassigned']);
  const saitama=model.prefectures.find(p=>p.id==='saitama');
  assert.equal(saitama.hubCount,2); assert.equal(saitama.placeCount,2);
  assert.deepEqual(Array.from(saitama.hubs,h=>h.id),['saitama-a','saitama-b']);
  assert.equal(saitama.hubs[0].hub,hubs[0]);
  assert.equal(saitama.hubs[0].places[0],places[0]);
  assert.equal(model.prefectures.find(p=>p.id==='tokyo').hubs[0].placeCount,0);
  assert.equal(model.hubPrefectures['saitama-a'].id,'saitama');
  assert.equal(Object.getPrototypeOf(model.hubPrefectures),null);
});

test('unlinked and dangling-hub places remain reachable in an explicit null-ID bucket', () => {
  const places=[place('unlinked',null),place('dangling','no-longer-present'),place('blank','')];
  const model=hierarchy({hubs:[],places});
  assert.equal(model.prefectures.length,1);
  const group=model.prefectures[0];
  assert.equal(group.id,'unassigned'); assert.equal(group.hubCount,0); assert.equal(group.placeCount,3);
  assert.equal(group.hubs.length,1);
  const bucket=group.hubs[0];
  assert.equal(bucket.id,null); assert.equal(bucket.hub,null); assert.equal(bucket.unassigned,true);
  assert.equal(bucket.key,'unassigned-places');
  assert.deepEqual(Array.from(bucket.places,x=>x.id),['unlinked','dangling','blank']);
  assert.equal(places[1].hubId,'no-longer-present');
});

test('a hubless place with explicit geography stays in that prefecture without gaining a fabricated hub link', () => {
  const places=frozen([place('tokyo',null,{address:'東京都新宿区'}),place('tokyo-dangling','missing',{geo_query:'Example, Tokyo, Japan'}),
    place('saitama',null,{address:'埼玉県さいたま市'}),place('unknown',null),
    place('conflicting',null,{address:'東京都新宿区',geo_query:'神奈川県横浜市'})]);
  const model=hierarchy({hubs:[],places});
  assert.deepEqual(Array.from(model.prefectures,p=>p.id),['saitama','tokyo','unassigned']);
  const tokyo=model.prefectures.find(p=>p.id==='tokyo');
  assert.equal(tokyo.hubCount,0); assert.equal(tokyo.placeCount,2);
  assert.equal(tokyo.hubs[0].id,null); assert.equal(tokyo.hubs[0].hub,null);
  assert.equal(tokyo.hubs[0].key,'unassigned-places:tokyo');
  assert.equal(tokyo.hubs[0].name,'Places without an area hub');
  assert.deepEqual(Array.from(tokyo.hubs[0].places,x=>x.id),['tokyo','tokyo-dangling']);
  const unknown=model.prefectures.find(p=>p.id==='unassigned');
  assert.equal(unknown.placeCount,2); assert.equal(unknown.hubs[0].key,'unassigned-places');
  assert.deepEqual(Array.from(unknown.hubs[0].places,x=>x.id),['unknown','conflicting']);
  assert.equal(places[1].hubId,'missing');
  assert.deepEqual(Object.keys(model.hubPrefectures),[]);
});

test('deleted hubs become missing references, not silently lost places', () => {
  const model=hierarchy({hubs:[hub('retired',{deleted_at:'2026-01-01',prefecture:'Tokyo'})],places:[place('keep','retired')]});
  assert.equal(model.prefectures[0].id,'unassigned');
  assert.equal(model.prefectures[0].placeCount,1);
  assert.equal(model.hubPrefectures.retired,undefined);
});

test('suggested, deleted and skipped places are excluded without mutating acceptance or status', () => {
  const places=frozen([place('saved','h'),place('suggestion','h',{accepted:false}),place('deleted','h',{deleted_at:'2026-01-01'}),place('skipped','h',{status:'skip'})]);
  const model=hierarchy({hubs:[hub('h',{prefecture:'Saitama'})],places});
  assert.equal(model.prefectures[0].placeCount,1);
  assert.deepEqual(Array.from(model.prefectures[0].hubs[0].places,x=>x.id),['saved']);
  assert.equal(places[1].accepted,false); assert.equal(places[3].status,'skip');
});

test('food and spot records with the same UUID both survive with their original typed identity', () => {
  const places=[place('shared','h',{_t:'food'}),place('shared','h',{_t:'spot'})];
  const model=hierarchy({hubs:[hub('h',{prefecture:'Saitama'})],places});
  const entry=model.prefectures[0].hubs[0];
  assert.equal(entry.placeCount,2);
  assert.deepEqual(Array.from(entry.places,x=>x._t),['food','spot']);
});

test('snake_case hub links work alongside normalized state fields', () => {
  const model=hierarchy({hubs:[hub('h')],places:[{id:'raw',hub_id:'h',address:'神奈川県横浜市',status:'try',accepted:true}]});
  assert.equal(model.prefectures[0].id,'kanagawa');
  assert.equal(model.prefectures[0].hubs[0].placeCount,1);
});

test('separate geography rows keep grouping stable when accepted visits change status', () => {
  const geography=[place('visited','h',{address:'埼玉県さいたま市',status:'done'}),place('suggested','h',{address:'埼玉県さいたま市',accepted:false})];
  const first=hierarchy({hubs:[hub('h')],places:[place('planned','h')],geographyPlaces:geography});
  const later=hierarchy({hubs:[hub('h')],places:[],geographyPlaces:geography});
  assert.equal(first.hubPrefectures.h.id,'saitama');
  assert.equal(later.hubPrefectures.h.id,'saitama');
  assert.equal(first.prefectures[0].placeCount,1);
  assert.equal(later.prefectures[0].placeCount,0);
});

test('hierarchy is deterministic, handles opaque IDs safely and never mutates input', () => {
  const input=frozen({hubs:[hub('__proto__',{prefecture:'Tokyo',name:'Zulu'}),hub('constructor',{prefecture:'Tokyo',name:'Alpha'}),hub('u')],
    places:[place('one','__proto__'),place('two','constructor'),place('three',null)]});
  const before=JSON.stringify(input), a=hierarchy(input), b=hierarchy(input);
  assert.deepEqual(plain(a),plain(b));
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(Array.from(a.prefectures[0].hubs,h=>h.id),['constructor','__proto__']);
  assert.equal(a.hubPrefectures.__proto__.id,'tokyo');
  assert.equal(a.prefectures.at(-1).id,'unassigned');
  assert.deepEqual(calls,[],'hierarchy must not fetch, save, or read/write local storage');
});

test('empty and malformed containers are safe, with no fabricated locations', () => {
  for (const input of [undefined,null,{}, {hubs:null,places:null}, {hubs:[null,{},hub('')],places:[null]}]) {
    assert.deepEqual(plain(hierarchy(input)),{prefectures:[],hubPrefectures:{}});
  }
  assert.equal(resolve(null).id,'unassigned');
  assert.equal(api.setuHubPrefecture(null,[]).id,'unassigned');
});
