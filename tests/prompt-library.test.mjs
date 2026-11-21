import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderPrompt, validCatalog } = require('../js/prompt-library.js');

function catalogFromSource() {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../data/travel-prompt-templates.js', import.meta.url), 'utf8'), context);
  return context.window.SetuTravelPromptCatalog;
}

test('catalog contains four editable, versioned planning steps', () => {
  const catalog = catalogFromSource();
  assert.ok(validCatalog(catalog));
  assert.equal(catalog.templates.length, 4);
  assert.deepEqual(Array.from(catalog.templates, t => t.id), ['discover', 'transport', 'itinerary', 'live-review']);
  assert.ok(catalog.revision.length > 0);
});

test('each trip prompt replaces the selected destination and user preferences', () => {
  const vars = {
    destination: 'Ogose (越生)',
    origin: 'Ageo Station',
    travel_date: '2026-11-28',
    travel_style: 'Quiet and inexpensive',
  };
  for (const template of catalogFromSource().templates) {
    const result = renderPrompt(template.body, vars);
    assert.ok(result.includes('Ogose (越生)'), template.id);
    assert.ok(result.includes('Ageo Station'), template.id);
    assert.ok(result.includes('2026-11-28'), template.id);
    assert.ok(result.includes('Quiet and inexpensive'), template.id);
    assert.ok(!/{{\s*[a-z_]+\s*}}/.test(result), template.id);
  }
});

test('editing source text updates generated prompts with no UI code changes', () => {
  const body = catalogFromSource().templates[0].body;
  const modified = body.replace('Group places', 'Cluster places');
  const values = { destination: 'Chichibu', origin: 'Urawa', travel_date: 'Not chosen', travel_style: 'Balanced' };
  assert.match(renderPrompt(modified, values), /Cluster places/);
  assert.doesNotMatch(renderPrompt(body, values), /Cluster places/);
});

test('new page is linked in unpacked Home and menu; existing bundle stays parseable', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const library = readFileSync(new URL('../prompt-library.html', import.meta.url), 'utf8');
  const template = JSON.parse(page.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
  const manifest = JSON.parse(page.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)<\/script>/)[1]);
  assert.ok(template.includes('        <!-- search results -->'));
  assert.ok(template.includes('        <sc-for list="{{ menuLinks }}"'));
  assert.ok(Object.keys(manifest).length > 0);
  assert.match(page, /promptMenuLink/);
  assert.match(page, /promptHomeLink/);
  assert.match(library, /id="prompt-preview"/);
  assert.match(library, /data\/travel-prompt-templates\.js|js\/prompt-library\.js/);
});

test('invalid catalog revisions and duplicate ids are rejected', () => {
  const catalog = catalogFromSource();
  assert.equal(validCatalog({ ...catalog, revision: null }), false);
  assert.equal(validCatalog({ ...catalog, templates: [...catalog.templates, catalog.templates[0]] }), false);
});


test('research prompts use the actual Drive destination folder and review-only export safeguards', () => {
  const catalog=catalogFromSource();
  assert.equal(catalog.revision,'2026-11-22.1');
  for (const template of catalog.templates) {
    assert.match(template.body, /Claude_Workspace\/\#Data_storage\/Setu_research\//, template.id);
    assert.match(template.body, /GitHub or Supabase/, template.id);
    assert.match(template.body, /unknown|unverified/i, template.id);
    assert.match(template.body, /Drive/, template.id);
  }
  assert.match(catalog.templates[0].body, /setu_research_handoff_v1.schema.json/);
  assert.match(catalog.templates[0].body, /accepted=false/);
  assert.match(catalog.templates[1].body, /SEPARATE versioned transport JSON/);
  assert.match(catalog.templates[1].body, /registered route and validity/);
  assert.match(catalog.templates[2].body, /NEW versioned JSON/);
  assert.match(catalog.templates[3].body, /SEPARATE versioned review-change file/);
});

test('a missing travel date must not trigger current schedules or weather verification', () => {
  const templates=catalogFromSource().templates;
  for (const i of [0,1,2]) {
    assert.match(templates[i].body, /date (is not chosen|is undecided|remains undecided)/i);
  }
  const out=renderPrompt(templates[1].body,{
    destination:'越生',origin:'南浦和駅',travel_date:'Not chosen yet',travel_style:'Balanced'
  });
  assert.match(out,/南浦和駅/);
  assert.match(out,/Not chosen yet/);
  assert.match(out,/no.*date-specific|do not present date-specific/i);
});
