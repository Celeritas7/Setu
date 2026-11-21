/* Pure dry-run model. No storage, network, geocoding or database writes. */
(function (root) {
  'use strict';
  const schema = typeof module !== 'undefined' && module.exports
    ? require('./research-import-schema.js') : root.SetuResearchSchema;
  const MAX_BYTES = 5 * 1024 * 1024;
  const SNAPSHOT_KEY = 'setu.research-comparison.v1';
  const TABLES = ['setu_hubs', 'setu_spots', 'setu_food_notes', 'akatsuki_places', 'akatsuki_shops'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function matchesType(value, type) {
    if (type === 'null') return value === null;
    if (type === 'object') return object(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'integer') return Number.isSafeInteger(value);
    return typeof value === type;
  }

  // Only the trusted bundled schema is evaluated. These are all validation
  // keywords used by that schema, including constraints on nullable numbers.
  function schemaErrors(value, rule, path, add) {
    if (rule.type && ![rule.type].flat().some(type => matchesType(value, type))) {
      add(path, 'Expected ' + [rule.type].flat().join(' or '));
      return;
    }
    if (own(rule, 'const') && value !== rule.const) add(path, 'Expected ' + JSON.stringify(rule.const));
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) add(path, 'Must not be empty');
      if (rule.pattern && !new RegExp(rule.pattern).test(value)) add(path, 'Invalid format');
    }
    if (typeof value === 'number' && rule.minimum !== undefined && value < rule.minimum) add(path, 'Must be at least ' + rule.minimum);
    if (Array.isArray(value)) {
      if (rule.minItems && value.length < rule.minItems) add(path, 'Needs at least ' + rule.minItems + ' item(s)');
      if (rule.maxItems !== undefined && value.length > rule.maxItems) add(path, 'Allows at most ' + rule.maxItems + ' item(s)');
      if (rule.items) value.forEach((item, i) => schemaErrors(item, rule.items, path + '/' + i, add));
    }
    if (object(value)) {
      (rule.required || []).forEach(key => { if (!own(value, key)) add(path + '/' + key, 'Required field'); });
      Object.entries(rule.properties || {}).forEach(([key, child]) => {
        if (own(value, key)) schemaErrors(value[key], child, path + '/' + key, add);
      });
    }
  }

  function validateText(text) {
    const errors = [];
    const add = (path, message) => { if (errors.length < 100) errors.push({path: path || '/', message}); };
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) {
      add('/', 'Choose a JSON file up to 5 MiB');
      return {ok: false, errors};
    }
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (_) { add('/', 'Invalid JSON. Check commas, quotes and brackets.'); return {ok: false, errors}; }
    // Bound nested extension fields before evaluating the contract or rendering.
    function inspect(value, path, depth) {
      if (depth > 32) { add(path, 'Nesting exceeds 32 levels'); return; }
      if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
        add(path, 'Number cannot be represented safely');
      }
      if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) add(path + '/' + key, 'Reserved key');
        else inspect(child, path + '/' + key, depth + 1);
      });
    }
    inspect(data, '', 0);
    if (!errors.length) schemaErrors(data, schema, '', add);
    if (errors.length) return {ok: false, errors};
    if (data.places.length > 1000 || data.hubs.length > 200) add('/', 'Limit is 1,000 places and 200 hubs per file');
    const hubIds = new Set(), placeIds = new Set();
    function unique(value, seen, path) {
      if (!value.trim()) add(path, 'Must not be blank');
      if (seen.has(value)) add(path, 'Duplicate ID in this file');
      seen.add(value);
    }
    data.hubs.forEach((hub, i) => {
      unique(hub.id, hubIds, '/hubs/' + i + '/id');
      if (!hub.name_ja.trim()) add('/hubs/' + i + '/name_ja', 'Must not be blank');
    });
    const date = data.destination.travel_date;
    if (date !== null && !validDate(date)) add('/destination/travel_date', 'Expected a calendar date YYYY-MM-DD or null');
    if (data.destination.date_confirmed && date === null) add('/destination/travel_date', 'A confirmed date must be supplied');
    data.places.forEach((place, i) => {
      const path = '/places/' + i;
      unique(place.research_id, placeIds, path + '/research_id');
      if (!place.name_ja.trim()) add(path + '/name_ja', 'Must not be blank');
      if (!hubIds.has(place.hub_id)) add(path + '/hub_id', 'Unknown hub ID');
      if (!safeUrl(place.location.maps_url)) add(path + '/location/maps_url', 'Expected a valid web URL without credentials');
      place.source_links.forEach((source, j) => {
        if (!safeUrl(source.url)) add(path + '/source_links/' + j + '/url', 'Expected a valid web URL without credentials');
        if (!validDate(source.checked_at)) add(path + '/source_links/' + j + '/checked_at', 'Expected a calendar date YYYY-MM-DD');
      });
      ['practical_candidates', 'experiential_candidates'].forEach(key => {
        place.tags[key].forEach((tag, j) => {
          if (!(typeof tag === 'string' && tag.trim()) && !(object(tag) && typeof tag.tag === 'string' && tag.tag.trim())) {
            add(path + '/tags/' + key + '/' + j, 'Expected a tag name or an object with a tag name');
          }
          if (key === 'experiential_candidates' && object(tag) &&
              ((tag.status !== undefined && tag.status !== 'potential') || tag.personal_confirmation === true)) {
            add(path + '/tags/' + key + '/' + j, 'Research experience tags must remain potential');
          }
        });
      });
      const cost = place.research_fields.cost;
      if (cost.price_checked_at != null && !validDate(cost.price_checked_at)) add(path + '/research_fields/cost/price_checked_at', 'Expected a calendar date YYYY-MM-DD');
      if (cost.meal_budget_yen != null) {
        const budget = cost.meal_budget_yen;
        if (!object(budget) || !Number.isSafeInteger(budget.min) || !Number.isSafeInteger(budget.max) || budget.min < 0 || budget.max < budget.min) {
          add(path + '/research_fields/cost/meal_budget_yen', 'Expected a nonnegative min/max estimate range');
        }
      }
      if (cost.sample_prices !== undefined && (!Array.isArray(cost.sample_prices) || cost.sample_prices.some(price =>
        !object(price) || !Number.isSafeInteger(price.yen) || price.yen < 0 || typeof price.scope !== 'string' || typeof price.evidence !== 'string'))) {
        add(path + '/research_fields/cost/sample_prices', 'Expected scoped nonnegative prices with evidence');
      }
    });
    return errors.length ? {ok: false, errors} : {ok: true, data, errors: []};
  }

  function normalized(value) {
    return typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s\p{P}\p{S}]/gu, '') : '';
  }

  function names(row) {
    const aliases = Array.isArray(row.aliases) ? row.aliases : [];
    return [row.name, row.label, row.name_ja, row.name_en, ...aliases].map(normalized).filter(Boolean);
  }

  function normalizedUrl(value) {
    const safe = safeUrl(value);
    if (!safe) return '';
    const url = new URL(safe);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href.replace(/\/$/, '');
  }

  function urls(row) {
    return [row.source_url, row.url, row.location?.maps_url, ...(row.source_links || []).map(source => source.url)]
      .map(normalizedUrl).filter(Boolean);
  }

  function matchReasons(candidate, existing) {
    const reasons = [];
    if (names(candidate).some(name => names(existing).includes(name))) reasons.push('Name or alias');
    const address = normalized(candidate.location?.address_ja || candidate.address);
    if (address && address === normalized(existing.address)) reasons.push('Address text');
    if (urls(candidate).some(url => urls(existing).includes(url))) reasons.push('Source URL (may describe several places)');
    if (candidate.external_place_id && candidate.external_place_id === existing.place_ref) reasons.push('External place ID');
    return reasons;
  }

  function fieldDifferences(place, row) {
    // No automatic mapping from admission to spend_yen, research tags to
    // confirmed themes, or research coordinates to the saved pin.
    const comparisons = [
      ['Name', row.name || row.label || null, place.name_ja],
      ['Address text', row.address || null, place.location.address_ja],
      ['Source URLs', row.source_url || row.url || null, place.source_links],
      ['Opening hours', row.hours || null, place.research_fields.hours],
      ['Prices and estimates (different concepts)', {spend_yen: row.spend_yen ?? row.spend ?? null, spend_seen: row.spend_seen ?? row.spendSeen ?? null}, place.research_fields.cost],
      ['Research tags (require separate review)', row.themes || [], place.tags],
    ];
    return comparisons.map(([field, existing, research]) => ({field, existing, research,
      differs: JSON.stringify(existing) !== JSON.stringify(research)}));
  }

  function priceSummary(cost) {
    const published = cost.admission_evidence === 'published' && cost.admission_yen !== null;
    return {
      admission: published ? (cost.admission_yen === 0 ? 'Published ¥0 admission' : 'Published admission ¥' + cost.admission_yen) : 'Admission price unknown / unconfirmed',
      estimate: cost.meal_budget_yen ? 'Spending estimate ¥' + cost.meal_budget_yen.min + '–' + cost.meal_budget_yen.max : 'Spending estimate unknown',
      samples: (cost.sample_prices || []).map(price => ({...price,
        classification: /historical|not_future/.test(price.evidence) ? 'Historical price' : /if_permitted/.test(price.scope) ? 'Conditional seating price' : 'Scoped source price'})),
    };
  }

  function sourceState(source, today) {
    const checked = new Date(source.checked_at + 'T00:00:00Z').getTime();
    const now = new Date(today + 'T00:00:00Z').getTime();
    if (checked > now) return 'Future checked date — verify';
    return now - checked > 60 * 86400000 ? 'May be stale (over 60 days)' : 'Snapshot only — recheck for travel date';
  }

  function preview(data, snapshot = null, today = new Date().toISOString().slice(0, 10)) {
    const rows = snapshot?.tables || {};
    const records = TABLES.filter(table => table !== 'setu_hubs').flatMap(table =>
      (rows[table] || []).map(row => ({table, row})));
    return {
      format: 'setu_research_preview', schema_version: '1.0.0', generated_on: today,
      mode: 'dry_run', comparison: snapshot ? {scope: snapshot.scope, captured_at: snapshot.captured_at, complete: snapshot.complete === true} : null,
      // The complete original document is the lossless evidence boundary.
      research: clone(data),
      hubs: data.hubs.map(hub => ({id: hub.id, name: hub.name_ja,
        count: data.places.filter(place => place.hub_id === hub.id).length,
        matches: (rows.setu_hubs || []).filter(row => matchReasons(hub, row).length).map(row => ({id: row.id, name: row.name}))})),
      candidates: data.places.map((place, i) => {
        const leads = records.map(({table, row}) => ({table, row, reasons: matchReasons(place, row)}))
          .filter(match => match.reasons.length);
        // Broad directory URLs can match many rows. Bound the expanded diff
        // payload while explicitly retaining the total number of review leads.
        const matches = leads.slice(0, 20).map(({table, row, reasons}) => ({table, id: row.id, name: row.name || row.label,
          reasons, differences: fieldDifferences(place, row)}));
        const withinFile = data.places.slice(0, i).filter(other => matchReasons(place, {
          ...other, address: other.location.address_ja
        }).length).map(other => other.research_id);
        return {research_id: place.research_id, hub_id: place.hub_id, name: place.name_ja,
          state: matches.length ? 'possible_existing' : snapshot ? 'no_match_in_snapshot' : 'comparison_unavailable',
          matches, match_count: leads.length, possible_file_duplicates: withinFile, price: priceSummary(place.research_fields.cost),
          sources: place.source_links.map(source => ({...source, warning: sourceState(source, today)})),
          proposed_state: {accepted: false, status: 'try', lat: null, lng: null, personal_confirmed_experiences: []},
          decision: 'pending'};
      }),
    };
  }

  const api = {MAX_BYTES, SNAPSHOT_KEY, TABLES, validateText, preview, priceSummary, safeUrl, matchReasons, validDate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SetuResearchImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
