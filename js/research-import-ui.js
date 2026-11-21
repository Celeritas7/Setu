(function () {
  'use strict';
  const model = window.SetuResearchImport;
  const byId = id => document.getElementById(id);
  let result = null, page = 0, uploadSequence = 0, comparison = null;
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const pretty = value => JSON.stringify(value, null, 2);

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function evidence(parent, title, value) {
    const details = node('details');
    details.append(node('summary', title), node('pre', pretty(value)));
    parent.append(details);
  }

  // One-use same-tab snapshot from the app. No personal review text is sent.
  // A direct visit still validates files but explicitly lacks a comparison.
  try {
    const raw = sessionStorage.getItem(model.SNAPSHOT_KEY);
    sessionStorage.removeItem(model.SNAPSHOT_KEY);
    const snapshot = raw && JSON.parse(raw);
    const age = snapshot && Date.now() - Date.parse(snapshot.captured_at);
    if (snapshot?.format === 'setu_research_comparison' && age >= 0 && age < 120000 && snapshot.tables &&
        model.TABLES.every(table => Array.isArray(snapshot.tables[table]))) comparison = snapshot;
  } catch (_) { /* Storage restrictions leave validation available. */ }
  byId('comparison-status').textContent = comparison
    ? 'Comparing with ' + comparison.scope + ' · loaded ' + comparison.captured_at + '. Coverage is limited to the records loaded by Setu.'
    : 'Existing-place comparison unavailable. Open Research Import from Setu Home after your places finish loading to include a fresh snapshot.';

  function resetPreview() {
    result = null; page = 0;
    byId('preview').hidden = true;
    byId('candidates').replaceChildren();
    byId('errors').replaceChildren();
  }
  function fail(errors) {
    resetPreview();
    const list = node('ul');
    errors.forEach(error => list.append(node('li', error.path + ' — ' + error.message)));
    byId('errors').append(node('p', 'Research could not be validated.'), list);
    byId('errors').focus();
    byId('upload-status').textContent = 'Correct the listed fields and validate again. Up to 100 errors are shown.';
  }
  function validate(text) {
    const validated = model.validateText(text);
    if (!validated.ok) { fail(validated.errors); return; }
    result = model.preview(validated.data, comparison, today());
    page = 0;
    byId('errors').replaceChildren();
    byId('preview').hidden = false;
    const matches = result.candidates.filter(candidate => candidate.matches.length).length;
    byId('summary').textContent = result.candidates.length + ' candidates · ' + result.hubs.length + ' hubs · ' + matches + ' possible existing places · all decisions pending';
    byId('upload-status').textContent = 'Valid v1.0.0 research. Preview ready. Reloading this page clears the preview.';
    byId('hub-counts').replaceChildren(...result.hubs.map(hub => node('div', hub.name + ' · ' + hub.count + ' candidates' +
      (hub.matches.length ? ' · possible saved hub: ' + hub.matches.map(match => match.name).join(', ') : ' · hub requires review'), 'hub-count')));
    const select = byId('hub-filter');
    select.replaceChildren(node('option', 'All hubs'));
    select.options[0].value = '';
    result.hubs.forEach(hub => { const option = node('option', hub.name); option.value = hub.id; select.append(option); });
    byId('candidate-search').value = '';
    const {places, ...documentEvidence} = result.research;
    byId('document-evidence').textContent = pretty(documentEvidence);
    render();
  }

  function render() {
    if (!result) return;
    const hub = byId('hub-filter').value, query = byId('candidate-search').value.normalize('NFKC').toLocaleLowerCase('ja');
    const filtered = result.candidates.filter(candidate => (!hub || candidate.hub_id === hub) &&
      (candidate.name + ' ' + candidate.research_id).normalize('NFKC').toLocaleLowerCase('ja').includes(query));
    page = Math.max(0, Math.min(page, Math.ceil(filtered.length / 5) - 1));
    const fragment = document.createDocumentFragment();
    filtered.slice(page * 5, page * 5 + 5).forEach(candidate => {
      const place = result.research.places.find(item => item.research_id === candidate.research_id);
      const card = node('article');
      card.append(node('small', candidate.research_id + ' · ' + result.hubs.find(item => item.id === candidate.hub_id).name), node('h3', candidate.name));
      card.append(node('span', candidate.matches.length ? 'Possible existing place' : comparison ? 'No match in loaded snapshot' : 'Existing-place check unavailable', 'chip'));
      card.append(node('span', 'Suggested · unvisited · not accepted', 'chip'));
      card.append(node('p', place.location.address_ja + ' · Unverified location text', 'muted'));
      if (candidate.possible_file_duplicates.length) card.append(node('p', 'Possible overlap within this file: ' + candidate.possible_file_duplicates.join(', '), 'warning'));
      card.append(node('h4', 'Prices & estimates'), node('p', candidate.price.admission), node('p', candidate.price.estimate));
      candidate.price.samples.forEach(price => card.append(node('p', price.classification + ' · ¥' + price.yen + ' · ' + price.scope + ' · ' + price.evidence)));
      card.append(node('p', place.research_fields.cost.raw_text));
      card.append(node('p', 'Price checked: ' + (place.research_fields.cost.price_checked_at || 'unknown') + '. Source claims are snapshots.'));
      card.append(node('h4', 'Potential experience tags'));
      const potential = place.tags.experiential_candidates.map(tag => typeof tag === 'string' ? tag : tag.tag);
      card.append(node('p', potential.length ? potential.join(' · ') + ' — potential only' : 'None suggested'));
      card.append(node('p', 'Personally confirmed experiences: none'));
      evidence(card, 'Practical tags, discovery sources & facilities', {tags: place.tags, facility_facts: place.facility_facts || {}});
      card.append(node('p', 'Opening and study permissions require a current check. Library reading and visitor laptop study are separate permissions.', 'muted'));
      card.append(node('div', 'Return transport is unverified for your travel date. Historical departures cannot establish a safe return.', 'notice'));
      if (place.safety_flags?.length) evidence(card, 'Access restrictions & safety flags', place.safety_flags);
      card.append(node('h4', 'Sources & checked dates'));
      candidate.sources.forEach(source => {
        const line = node('div', undefined, 'source');
        const link = node('a', source.label || source.url);
        link.href = model.safeUrl(source.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
        line.append(link, node('p', source.checked_at + ' · ' + source.warning)); card.append(line);
      });
      if (candidate.match_count > candidate.matches.length) card.append(node('p',
        'Showing the first ' + candidate.matches.length + ' of ' + candidate.match_count + ' possible matches. Narrow this broad match in the next review phase.', 'warning'));
      candidate.matches.forEach(match => {
        const details = node('details');
        details.append(node('summary', match.name + ' · ' + match.table + ' · ' + match.reasons.join(', ')));
        details.append(node('p', 'Read-only comparison. Different price and tag structures require explicit mapping in the review phase.'));
        const wrapper = node('div', undefined, 'table-wrap'), table = node('table');
        const head = node('thead'), heading = node('tr');
        ['Field / concept', 'Saved value', 'Research value'].forEach(label => heading.append(node('th', label)));
        head.append(heading); table.append(head);
        const body = node('tbody');
        match.differences.forEach(diff => {
          const row = node('tr'); row.append(node('th', diff.field + (diff.differs ? ' · differs' : ' · same')));
          [diff.existing, diff.research].forEach(value => { const cell = node('td'); cell.append(node('pre', pretty(value))); row.append(cell); });
          body.append(row);
        });
        table.append(body); wrapper.append(table); details.append(wrapper); card.append(details);
      });
      evidence(card, 'Complete candidate evidence (preserved)', place);
      card.append(node('p', 'Decision pending. Accept as suggestion, Skip and Merge selected facts are planned for Phase R2.', 'muted'));
      fragment.append(card);
    });
    byId('candidates').replaceChildren(fragment);
    byId('page-status').textContent = filtered.length ? (page * 5 + 1) + '–' + Math.min(page * 5 + 5, filtered.length) + ' of ' + filtered.length : 'No matching candidates';
    byId('previous').disabled = page === 0;
    byId('next').disabled = (page + 1) * 5 >= filtered.length;
  }

  byId('research-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const sequence = ++uploadSequence;
    resetPreview();
    byId('research-text').value = '';
    if (file.size > model.MAX_BYTES) { fail([{path: '/', message: 'Choose a JSON file up to 5 MiB'}]); return; }
    byId('upload-status').textContent = 'Reading ' + file.name + '…';
    try { const text = await file.text(); if (sequence === uploadSequence) validate(text); }
    catch (_) { if (sequence === uploadSequence) fail([{path: '/', message: 'File could not be read. Choose it again.'}]); }
    finally { if (sequence === uploadSequence) event.target.value = ''; }
  });
  byId('validate').addEventListener('click', () => { uploadSequence++; validate(byId('research-text').value); });
  byId('research-text').addEventListener('input', () => { uploadSequence++; resetPreview(); byId('upload-status').textContent = 'Pasted JSON changed. Validate to refresh the preview.'; });
  byId('clear').addEventListener('click', () => {
    uploadSequence++; resetPreview(); byId('research-file').value = ''; byId('research-text').value = '';
    byId('upload-status').textContent = 'Preview cleared. Choose another research JSON.';
  });
  ['hub-filter', 'candidate-search'].forEach(id => byId(id).addEventListener('input', () => { page = 0; render(); }));
  byId('previous').addEventListener('click', () => { page--; render(); });
  byId('next').addEventListener('click', () => { page++; render(); });
  byId('export').addEventListener('click', () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([pretty(result)], {type: 'application/json'}));
    const link = node('a'); link.href = url; link.download = 'setu-research-preview-' + today() + '.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
