import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The app is a self-contained bundle. Keep its embedded, display-only examples
// in sync with the reviewable JSON without introducing a runtime network fetch.
const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const check = args.includes('--check');
const templateIndex = args.indexOf('--template');
assert.ok(args.every((arg, i) => arg === '--check' || arg === '--template' || i === templateIndex + 1 && templateIndex !== -1), 'Usage: node scripts/sync-planning-menu-examples.mjs [--check] [--template path]');
assert.ok(templateIndex === -1 || args[templateIndex + 1] && !args[templateIndex + 1].startsWith('--'), '--template needs a path');
const target = templateIndex === -1 ? fileURLToPath(new URL('index.html', root)) : args[templateIndex + 1];
const data = JSON.parse(await fs.readFile(new URL('data/planning-menu-examples.json', root), 'utf8'));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const aliases = values => Array.isArray(values) && values.length > 0 && values.every(nonempty);
const normalize = value => value.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
assert.equal(data.schemaVersion, 1);
assert.ok(Array.isArray(data.entries), 'entries must be an array');
const ids = new Set(), matches = new Set();
for (const entry of data.entries) {
  assert.ok(nonempty(entry.id) && !ids.has(entry.id), 'entry IDs must be nonempty and unique');
  ids.add(entry.id);
  assert.ok(aliases(entry.names) && aliases(entry.hubNames), entry.id + ': explicit place and hub aliases required');
  for (const name of entry.names) for (const hub of entry.hubNames) {
    const key = normalize(name) + '\u0000' + normalize(hub);
    assert.ok(!matches.has(key), entry.id + ': duplicate normalized name/hub match');
    matches.add(key);
  }
  assert.match(entry.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
  const date = new Date(entry.checkedOn + 'T00:00:00Z');
  assert.ok(Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === entry.checkedOn, 'Invalid check date');
  assert.equal(typeof entry.taxIncluded, 'boolean');
  assert.ok(nonempty(entry.notes));
  assert.ok(Array.isArray(entry.sources) && entry.sources.length > 0, 'Official sources required');
  for (const source of entry.sources) {
    assert.ok(nonempty(source.label));
    const url = new URL(source.url);
    assert.ok(url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.'), 'Only credential-free HTTPS sources are supported');
  }
  assert.ok(Array.isArray(entry.examples) && entry.examples.length > 0);
  const exampleIds = new Set();
  for (const example of entry.examples) {
    assert.ok(nonempty(example.id) && !exampleIds.has(example.id));
    exampleIds.add(example.id);
    assert.ok(['drink','light_food_drink'].includes(example.kind));
    assert.ok(nonempty(example.label));
    assert.ok(Array.isArray(example.items) && example.items.length > 0);
    for (const item of example.items) assert.ok(nonempty(item.name) && Number.isSafeInteger(item.yen) && item.yen >= 0, 'Menu items need nonnegative integer yen amounts');
    assert.ok(Number.isSafeInteger(example.items.reduce((sum,item) => sum + item.yen, 0)), 'Example total is too large');
  }
}

const original = await fs.readFile(target, 'utf8');
const bundleTag = /(<script type="__bundler\/template">\s*)([\s\S]*?)(\s*<\/script>)/;
const bundled = templateIndex === -1;
assert.ok(!bundled || bundleTag.test(original), 'Bundled template was not found');
const template = bundled ? JSON.parse(original.match(bundleTag)[2]) : original;
const block = /\/\/ PLANNING_MENU_EXAMPLES_START\n[\s\S]*?\n\/\/ PLANNING_MENU_EXAMPLES_END/g;
assert.equal([...template.matchAll(block)].length, 1, 'Exactly one catalog block is required');
const json = JSON.stringify(data, null, 2).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const updated = template.replace(block, () => '// PLANNING_MENU_EXAMPLES_START\nconst PLANNING_MENU_EXAMPLES = ' + json + ';\n// PLANNING_MENU_EXAMPLES_END');
if (check) {
  assert.equal(template, updated, 'Embedded menu examples are stale: run this script without --check');
  console.log('Menu examples validated and synchronized (' + data.entries.length + ' places).');
} else if (updated === template) {
  console.log('Menu examples already synchronized.');
} else {
  const encoded = JSON.stringify(updated).replaceAll('</', '<\\u002F');
  const output = bundled ? original.replace(bundleTag, (_, before, _body, after) => before + encoded + after) : updated;
  if (bundled) assert.equal(JSON.parse(output.match(bundleTag)[2]), updated, 'Bundle round-trip failed');
  await fs.writeFile(target, output);
  console.log('Embedded ' + data.entries.length + ' reviewed menu examples.');
}
