import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Setu is shipped as a self-contained HTML bundle. Test the actual embedded
// template so an incorrect pack step cannot silently lose DAY OFF UI changes.
const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const encoded = page.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
assert.ok(encoded, 'bundled template script is present');
const template = JSON.parse(encoded[1]);
const code = template.match(/<script type="text\/x-dc" data-dc-script="">([\s\S]*?)<\/script>/);
assert.ok(code, 'Setu runtime is present');
new Function(code[1]); // parse the entire shipped DC runtime

const sourceFns = code[1].match(/^const isDayOff = .*;\nconst dayOffEpisode = .*;/m);
assert.ok(sourceFns, 'source classification helpers are present');
const classify = vm.runInNewContext(`${sourceFns[0]}\n({isDayOff,dayOffEpisode});`);
assert.equal(classify.isDayOff({ by:'DAY OFF · TRAIN TV #28', themes:['cafe'] }), true);
assert.equal(classify.isDayOff({ url:'https://ttv.jeki.co.jp/dayoff/backnumber/19/' }), true);
assert.equal(classify.isDayOff({ themes:['sit-long','dayoff'] }), true);
assert.equal(classify.isDayOff({ themes:['sit-long'], by:'User' }), false);
assert.equal(classify.dayOffEpisode({ by:'DAY OFF · TRAIN TV #28' }), '28');
assert.equal(classify.dayOffEpisode({ url:'https://ttv.jeki.co.jp/dayoff/backnumber/7/' }), '7');

for (const name of ['mapSources','mapDayoffRows','mapDayoffHasNext','msHasSource','msSourceUrl']) {
  assert.ok(template.includes(`{{ ${name} }}`), `${name} renders in the template`);
}
assert.ok(code[1].includes('source === \'all\' || isDayOff(x)'), 'source filter applies to places');
assert.ok(code[1].includes("icon = L.divIcon"), 'special DAY OFF pin is rendered in street map');
assert.ok(code[1].includes("p.dayoff ? '#7755C8'"), 'special DAY OFF pin is rendered on globe');
console.log('PASS DAY OFF source, episodes, UI, bundled JS, and pin styling');
