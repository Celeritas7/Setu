/* Pure dry-run model. No storage, network, geocoding or database writes. */
(function (root) {
  'use strict';
  const schema = typeof module !== 'undefined' && module.exports
    ? require('./research-import-schema.js') : root.SetuResearchSchema;
  const MAX_BYTES = 5 * 1024 * 1024;
  const SNAPSHOT_KEY = 'setu.research-comparison.v1';
  const TABLES = ['setu_hubs', 'setu_spots', 'setu_food_notes', 'akatsuki_places', 'akatsuki_shops'];
  const LOCAL_PLACES = 'setu_research_local_drafts', LOCAL_HUBS = 'setu_research_local_hubs';
  const SNAPSHOT_FIELDS = ['id','name','label','aliases','address','source_url','url','place_ref','hours','spend_yen','spend','spend_seen','spendSeen','themes','rev','hub_id','shop_id','place_id'];
  const MERGE_FIELDS = [
    ['name_ja', 'Japanese name', ['name_ja']], ['name_en', 'English browsing name', ['name_en']],
    ['address_text', 'Unverified address text', ['location','address_ja']],
    ['maps_url', 'Unverified Maps URL', ['location','maps_url']],
    ['cost', 'Prices, scopes and estimates', ['research_fields','cost']],
    ['hours', 'Opening-hours evidence', ['research_fields','hours']],
    ['access', 'Access evidence', ['research_fields','access']],
    ['practical_tags', 'Practical tag candidates', ['tags','practical_candidates']],
    ['potential_experiences', 'Potential experience tags', ['tags','experiential_candidates']],
    ['discovery_sources', 'Discovery-source tags', ['tags','discovery_source_tags']],
    ['facility_facts', 'Facility facts and unknowns', ['facility_facts']],
    ['safety_flags', 'Access restrictions and safety flags', ['safety_flags']],
  ];
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

  function identityOverlap(reasons) {
    return reasons.some(reason => reason !== 'Source URL (may describe several places)');
  }

  function comparisonTargets(snapshot) {
    const rows = snapshot?.tables || {};
    const shops = rows.akatsuki_shops || [];
    return [...TABLES, LOCAL_PLACES, LOCAL_HUBS].flatMap(table => (rows[table] || []).filter(row => row.id != null).map(row => {
      const facts = {};
      SNAPSHOT_FIELDS.forEach(key => { if (own(row, key) && row[key] !== undefined) facts[key] = clone(row[key]); });
      if (table === 'setu_food_notes' && !facts.name) facts.name = shops.find(shop => String(shop.id) === String(row.shop_id))?.name || 'Unnamed food place';
      return {table, id: row.id, name: facts.name || facts.label || String(row.id), facts,
        merge_allowed: ['setu_food_notes','setu_spots', LOCAL_PLACES].includes(table)};
    }));
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
    const targets = comparisonTargets(snapshot);
    const records = targets.filter(target => !['setu_hubs', LOCAL_HUBS].includes(target.table)).map(target => ({table: target.table, row: target.facts}));
    return {
      format: 'setu_research_preview', schema_version: '1.0.0', generated_on: today,
      mode: 'dry_run', comparison: snapshot ? {scope: snapshot.scope, captured_at: snapshot.captured_at, complete: snapshot.complete === true} : null,
      review_version: '2.0.0', review_targets: targets,
      // The complete original document is the lossless evidence boundary.
      research: clone(data),
      hubs: data.hubs.map(hub => ({id: hub.id, name: hub.name_ja,
        count: data.places.filter(place => place.hub_id === hub.id).length,
        resolution: null,
        matches: [...(rows.setu_hubs || []), ...(rows[LOCAL_HUBS] || [])].filter(row => matchReasons(hub, row).length).map(row => ({id: row.id, name: row.name}))})),
      candidates: data.places.map((place, i) => {
        const leads = records.map(({table, row}) => {
          const reasons = matchReasons(place, row);
          if (table === 'setu_food_notes' && row.shop_id != null) {
            const linkedShop = (rows.akatsuki_shops || []).find(shop => String(shop.id) === String(row.shop_id));
            if (linkedShop && matchReasons(place, linkedShop).length) reasons.push('Linked shop');
          }
          return {table, row, reasons};
        })
          .filter(match => match.reasons.length);
        // Broad directory URLs can match many rows. Bound the expanded diff
        // payload while explicitly retaining the total number of review leads.
        const matches = leads.slice(0, 20).map(({table, row, reasons}) => ({table, id: row.id, name: row.name || row.label,
          reasons, differences: fieldDifferences(place, row)}));
        const fileLeads = data.places.filter((other, j) => j !== i).map(other => ({id:other.research_id,
          reasons:matchReasons(place, {...other, address:other.location.address_ja})}));
        const withinFile = fileLeads.filter(lead => identityOverlap(lead.reasons)).map(lead => lead.id);
        return {research_id: place.research_id, hub_id: place.hub_id, name: place.name_ja,
          state: matches.length ? 'possible_existing' : snapshot ? 'no_match_in_snapshot' : 'comparison_unavailable',
          matches, match_count: leads.length, possible_file_duplicates: withinFile, price: priceSummary(place.research_fields.cost),
          shared_source_references: fileLeads.filter(lead => lead.reasons.length && !identityOverlap(lead.reasons)).map(lead => lead.id),
          needs_distinct_review: leads.some(lead => identityOverlap(lead.reasons)) || withinFile.length > 0,
          sources: place.source_links.map(source => ({...source, warning: sourceState(source, today)})),
          proposed_state: {accepted: false, status: 'try', lat: null, lng: null, personal_confirmed_experiences: []},
          decision: 'pending'};
      }),
    };
  }

  function reference(table, id) { return table + ':' + String(id); }

  function resolvedHub(review, id, visited = new Set()) {
    if (visited.has(id)) return null;
    visited.add(id);
    const hub = review.hubs.find(item => item.id === id), choice = hub?.resolution;
    if (!choice) return null;
    if (choice.kind === 'research_hub') return resolvedHub(review, choice.id, visited);
    return choice;
  }

  function resolveHub(review, id, choice, acknowledgeDistinct = false) {
    acknowledgeDistinct = acknowledgeDistinct === true;
    const hub = review.hubs.find(item => item.id === id);
    if (!hub) return {ok: false, error: 'Choose a research hub.'};
    let resolution = null;
    if (choice?.kind === 'existing') {
      const table = choice.table || 'setu_hubs';
      const target = review.review_targets.find(item => ['setu_hubs',LOCAL_HUBS].includes(table) && item.table === table && String(item.id) === String(choice.id));
      if (!target) return {ok: false, error: 'The saved hub is unavailable in this comparison.'};
      resolution = {kind: 'existing', id: target.id, name: target.name, rev: target.facts.rev ?? null};
      if (table === LOCAL_HUBS) resolution.table = LOCAL_HUBS;
    } else if (choice?.kind === 'new') {
      const overlaps = hub.matches.length || review.hubs.some(other => other.id !== id && normalized(other.name) === normalized(hub.name));
      if (overlaps && !acknowledgeDistinct) return {ok: false, error: 'A hub with this name may already exist. Choose it, share another research hub, or confirm this is a separate hub.'};
      resolution = {kind: 'new', research_hub_id: id, name: hub.name, distinct_acknowledged: acknowledgeDistinct};
    } else if (choice?.kind === 'research_hub') {
      if (choice.id === id || !review.hubs.some(other => other.id === choice.id)) return {ok: false, error: 'Choose another research hub.'};
      resolution = {kind: 'research_hub', id: choice.id};
    } else if (choice !== null) return {ok: false, error: 'Unknown hub choice.'};
    const next = {...review, hubs: review.hubs.map(item => item.id === id ? {...item, resolution} : item)};
    if (resolution?.kind === 'research_hub' && !resolvedHub(next, id)) return {ok: false, error: 'Resolve the other hub first. Hub choices must not form a cycle.'};
    // Hub changes invalidate already-approved creation decisions, including
    // candidates that share this research hub through another hub choice.
    const resetIds = new Set(review.candidates.filter(candidate => candidate.decision === 'accept_suggestion' &&
      JSON.stringify(resolvedHub(review, candidate.hub_id)) !== JSON.stringify(resolvedHub(next, candidate.hub_id))).map(candidate => candidate.research_id));
    next.candidates = review.candidates.map(candidate => resetIds.has(candidate.research_id) ||
      (candidate.decision === 'merge_selected' && candidate.decision_details?.target.kind === 'research_candidate' && resetIds.has(candidate.decision_details.target.id))
      ? {...candidate, decision: 'pending', decision_details: null} : candidate);
    return {ok: true, value: next, reset_count: next.candidates.filter((candidate, i) => candidate.decision !== review.candidates[i].decision).length};
  }

  function mergeFields(place) {
    return MERGE_FIELDS.map(([key, label, path]) => {
      const value = path.reduce((current, part) => current?.[part], place);
      return {key, label, path: path.join('.'), value};
    }).filter(field => field.value !== undefined);
  }

  function suggestedKind(place) {
    const type = place.place_type;
    if (['restaurant_cafe','restaurant','cafe','bakery','food_stall'].includes(type)) return 'food';
    if (['market','supermarket','convenience_store','shop'].includes(type)) return 'shop';
    if (['park','waterfall','temple','shrine_temple','museum','mountain_viewpoint','river_walk'].includes(type)) return 'see';
    return '';
  }

  function setDecision(review, id, action, options = {}) {
    const candidate = review.candidates.find(item => item.research_id === id);
    if (!candidate) return {ok: false, error: 'Choose a research candidate.'};
    let details = null;
    if (action === 'accept_suggestion') {
      if (!['food','shop','see','other'].includes(options.record_kind)) return {ok: false, error: 'Choose Food place, Shop, Sight or Other for the suggestion.'};
      if (!resolvedHub(review, candidate.hub_id)) return {ok: false, error: 'Choose a hub resolution above before accepting this suggestion.'};
      if (candidate.needs_distinct_review && options.distinct_acknowledged !== true) {
        return {ok: false, error: 'Review the possible matches and confirm this is a separate place, or merge/skip it.'};
      }
      let linkedLocation = null;
      if (options.linked_location) {
        const target = review.review_targets.find(item => reference(item.table,item.id) === options.linked_location && ['akatsuki_places','akatsuki_shops'].includes(item.table));
        if (!target) return {ok: false, error: 'Choose an available linked location.'};
        if (review.candidates.some(other => other.research_id !== id && other.decision === 'accept_suggestion' &&
            other.decision_details?.linked_location && reference(other.decision_details.linked_location.table,other.decision_details.linked_location.id) === options.linked_location)) {
          return {ok: false, error: 'This linked location already has a staged suggestion. Merge into that research candidate or skip the duplicate.'};
        }
        linkedLocation = {table: target.table, id: target.id};
      }
      details = {record_kind: options.record_kind, distinct_acknowledged: options.distinct_acknowledged === true, linked_location: linkedLocation};
    } else if (action === 'merge_selected') {
      if (options.same_place_acknowledged !== true) return {ok: false, error: 'Confirm the selected target is the same place.'};
      let target;
      if (options.target?.kind === 'research_candidate') {
        const other = review.candidates.find(item => item.research_id === options.target.id && item.research_id !== id && item.decision === 'accept_suggestion');
        if (!other) return {ok: false, error: 'Choose another accepted research suggestion as the merge target.'};
        target = {kind: 'research_candidate', id: other.research_id};
      } else {
        const saved = review.review_targets.find(item => item.merge_allowed && options.target?.table === item.table && String(options.target.id) === String(item.id));
        if (!saved) return {ok: false, error: 'Choose a saved Setu food place or spot. Linked location registries are read-only; link them when accepting a suggestion.'};
        target = {kind: 'existing', table: saved.table, id: saved.id, rev: saved.facts.rev ?? null};
      }
      const place = review.research.places.find(item => item.research_id === id);
      if (!Array.isArray(options.fields)) return {ok: false, error: 'Select the research facts to merge.'};
      const fields = [...new Set(options.fields)];
      const allowed = mergeFields(place);
      if (!fields.length || fields.some(key => !allowed.some(field => field.key === key))) return {ok: false, error: 'Select at least one available research fact. Personal fields and coordinates cannot be merged.'};
      const conflict = review.candidates.find(other => other.research_id !== id && other.decision === 'merge_selected' &&
        JSON.stringify(other.decision_details.target) === JSON.stringify(target) && other.decision_details.fields.some(key => fields.includes(key)));
      if (conflict) return {ok: false, error: 'Overlapping facts are already staged for this target by ' + conflict.research_id + '. Reset that decision or select different facts.'};
      details = {target, fields: allowed.filter(field => fields.includes(field.key)).map(field => field.key), same_place_acknowledged: true};
    } else if (!['pending','skip'].includes(action)) return {ok: false, error: 'Unknown review decision.'};
    const next = {...review, candidates: review.candidates.map(item => item.research_id === id ? {...item, decision: action, decision_details: details} : item)};
    // Removing/replacing a base suggestion also clears dependent merge choices.
    if (candidate.decision === 'accept_suggestion' && (action !== 'accept_suggestion' || JSON.stringify(details) !== JSON.stringify(candidate.decision_details))) next.candidates = next.candidates.map(item =>
      item.decision === 'merge_selected' && item.decision_details.target.kind === 'research_candidate' && item.decision_details.target.id === id
        ? {...item, decision: 'pending', decision_details: null} : item);
    return {ok: true, value: next};
  }

  function reviewSummary(review) {
    return Object.fromEntries(['pending','accept_suggestion','skip','merge_selected'].map(action => [action, review.candidates.filter(candidate => candidate.decision === action).length]));
  }

  function reviewExport(review) {
    const proposals = review.candidates.filter(candidate => ['accept_suggestion','merge_selected'].includes(candidate.decision)).map(candidate => {
      const place = review.research.places.find(item => item.research_id === candidate.research_id);
      const evidence = {source_links: clone(place.source_links), provenance: clone(review.research.provenance),
        source_quality: clone(place.source_quality || {}), safety_flags: clone(place.safety_flags || []),
        dietary_evidence: {destination_no_beef: review.research.destination.does_not_eat_beef ?? null,
          place: clone(place.dietary || place.dietary_flags || {})},
        original_research_id: candidate.research_id};
      if (candidate.decision === 'accept_suggestion') return {research_id: candidate.research_id, action: 'accept_suggestion',
        hub: resolvedHub(review, candidate.hub_id), linked_location: candidate.decision_details.linked_location,
        destination_record: {table: candidate.decision_details.record_kind === 'food' ? 'setu_food_notes' : 'setu_spots',
          kind: candidate.decision_details.record_kind === 'food' ? null : candidate.decision_details.record_kind},
        suggestion_defaults: clone(candidate.proposed_state), evidence};
      const fields = mergeFields(place).filter(field => candidate.decision_details.fields.includes(field.key));
      return {research_id: candidate.research_id, action: 'merge_selected', target: clone(candidate.decision_details.target),
        selected_research_facts: fields.map(field => ({key: field.key, path: field.path, value: clone(field.value)})), evidence};
    });
    return {...review, review_summary: reviewSummary(review), proposed_changes: proposals};
  }

  const api = {MAX_BYTES, SNAPSHOT_KEY, TABLES, validateText, preview, priceSummary, safeUrl, matchReasons, validDate,
    reference, resolvedHub, resolveHub, mergeFields, suggestedKind, setDecision, reviewSummary, reviewExport, LOCAL_PLACES, LOCAL_HUBS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SetuResearchImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
