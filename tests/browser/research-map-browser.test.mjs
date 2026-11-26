import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {verifiedChrome} from '../helpers/research-browser-binary.mjs';
import {researchPins,researchTagOptions} from '../helpers/research-map-fixture.mjs';

// Load the shipped HTML, including its unpacker and renderer. Stub only the
// external Leaflet boundary; the real application decides which markers to add.
const leafletFixture = `
window.L={
  map(el){
    let center={lat:35,lng:139},zoom=16;
    return {
      el,on(){return this;},off(){return this;},
      setView(coords,z){center={lat:coords[0],lng:coords[1]};zoom=z;return this;},
      flyTo(coords,z){return this.setView(coords,z);},
      fitBounds(coords){if(coords.length) center={lat:coords[0][0],lng:coords[0][1]};return this;},
      getCenter(){return center;},getZoom(){return zoom;},
      invalidateSize(){return this;},
      remove(){el.querySelectorAll('[data-fixture-marker]').forEach(node=>node.remove());}
    };
  },
  tileLayer(){return {addTo(){return this;}};},
  layerGroup(){
    return {
      addTo(map){this.map=map;return this;},
      clearLayers(){this.map.el.querySelectorAll('[data-fixture-marker]').forEach(node=>node.remove());return this;}
    };
  },
  circleMarker(coords,options){
    const marker=document.createElement('span');
    marker.dataset.fixtureMarker=options.color==='#432477'?'research':'other';
    marker.dataset.coords=JSON.stringify(coords);
    return {bindTooltip(node){marker.textContent=node.textContent;return this;},
      addTo(layer){layer.map.el.append(marker);return this;},on(){return this;}};
  },
  marker(coords,options){return this.circleMarker(coords,options);},
  divIcon(options){return options;}
};`;

test('packaged research-tag selector filters six pins to one potential Cocoon, resets and clears',async t=>{
  const browser=await chromium.launch({executablePath:await verifiedChrome(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const origin='http://127.0.0.1',errors=[],writes=[],requests=[];
  const assets=new Map();
  for(const [path,type] of [['index.html','text/html'],['js/research-cloud-loader.js','text/javascript'],['icons/icon-192.png','image/png'],['icons/apple-touch-icon.png','image/png']]){
    assets.set('/'+path,{contentType:type,body:await readFile(new URL('../../'+path,import.meta.url))});
  }
  await context.addInitScript(pins=>{
    if(location.origin!=='http://127.0.0.1') return;
    sessionStorage.setItem('setu.research-map',JSON.stringify({pins}));
    window.__researchGps=0;
    Object.defineProperty(navigator,'geolocation',{value:{
      getCurrentPosition(){window.__researchGps++;throw Error('Unexpected GPS request');},
      watchPosition(){window.__researchGps++;throw Error('Unexpected GPS request');},clearWatch(){}
    }});
  },researchPins);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    requests.push(req.url());
    if(req.method()!=='GET'){writes.push(req.method()+' '+url.origin);return route.abort();}
    if(url.origin===origin&&assets.has(url.pathname))return route.fulfill(assets.get(url.pathname));
    if(req.url()==='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')return route.fulfill({contentType:'text/javascript',body:leafletFixture});
    if(req.url()==='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')return route.fulfill({contentType:'text/css',body:''});
    if(req.url()==='https://celeritas7.github.io/Akatsuki/js/akatsuki-broadcast.js')return route.fulfill({contentType:'text/javascript',body:''});
    // All other traffic is denied; no real map tiles, auth or service requests.
    return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/index.html#research-map');
  const selector=page.getByRole('combobox',{name:'Research tag',exact:true});
  const pins=page.locator('#setuStreet [data-fixture-marker="research"]');
  const label=page.getByText('6 of 6 research places',{exact:false});
  await selector.waitFor({timeout:20000});
  await label.first().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#setuStreet [data-fixture-marker="research"]').length===6);
  assert.deepEqual(await selector.locator('option').evaluateAll(options=>options.map(option=>option.value)),['',...researchTagOptions]);
  assert.equal(await selector.inputValue(),'');
  assert.deepEqual((await pins.allTextContents()).sort(),researchPins.map(pin=>pin.label).sort());
  await selector.selectOption('Potential · Cocoon');
  await page.getByText('1 of 6 research places',{exact:false}).first().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#setuStreet [data-fixture-marker="research"]').length===1);
  assert.deepEqual(await pins.allTextContents(),['Fictional reading room']);
  assert.equal(await selector.inputValue(),'Potential · Cocoon');
  await selector.selectOption('Practical · Cocoon');
  await page.waitForFunction(()=>document.querySelector('#setuStreet [data-fixture-marker="research"]')?.textContent==='Fictional tag contrast');
  assert.equal(await pins.count(),1);
  assert.equal(await selector.inputValue(),'Practical · Cocoon');
  await selector.selectOption('');
  await page.getByText('6 of 6 research places',{exact:false}).first().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#setuStreet [data-fixture-marker="research"]').length===6);
  assert.equal(await selector.inputValue(),'');
  assert.deepEqual((await pins.allTextContents()).sort(),researchPins.map(pin=>pin.label).sort());
  await page.getByRole('button',{name:'Clear research pins',exact:true}).click();
  await selector.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelectorAll('#setuStreet [data-fixture-marker="research"]').length===0);
  assert.equal(await page.getByRole('button',{name:'Clear research pins',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('setu.research-map')),null);
  assert.equal(await page.evaluate(()=>window.__researchGps),0);
  assert.deepEqual(writes,[]);
  assert.deepEqual(errors,[]);
  assert.ok(requests.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'),'the real map used the fixture boundary');
});
