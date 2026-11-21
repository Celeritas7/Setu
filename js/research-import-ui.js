(function () {
  'use strict';
  const model = window.SetuResearchImport;
  const byId = id => document.getElementById(id);
  let result = null, page = 0, uploadSequence = 0, comparison = null;
  const forms = new Map();
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
    result = null; page = 0; forms.clear();
    byId('preview').hidden = true;
    byId('candidates').replaceChildren();
    byId('errors').replaceChildren();
    byId('decision-status').textContent = '';
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
    page = 0; forms.clear();
    byId('errors').replaceChildren();
    byId('preview').hidden = false;
    byId('decision-filter').value = '';
    byId('decision-status').textContent = '';
    byId('upload-status').textContent = 'Valid v1.0.0 research. Ready for local review. Download your decisions before reloading.';
    renderHubs();
    const select = byId('hub-filter');
    select.replaceChildren(node('option', 'All hubs'));
    select.options[0].value = '';
    result.hubs.forEach(hub => { const option = node('option', hub.name); option.value = hub.id; select.append(option); });
    byId('candidate-search').value = '';
    const {places, ...documentEvidence} = result.research;
    byId('document-evidence').textContent = pretty(documentEvidence);
    render();
  }

  function option(select, label, value) {
    const item = node('option', label); item.value = value; select.append(item);
  }
  function checkbox(label, checked, change) {
    const wrapper = node('label', undefined, 'check-label'), input = node('input');
    input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', () => change(input.checked));
    wrapper.append(input, node('span', label)); return wrapper;
  }
  function message(text, error = false, feedback = null) {
    byId('decision-status').textContent = text;
    byId('decision-status').className = error ? 'warning' : 'decision-message';
    if (error) {
      if (feedback) {feedback.textContent = text;feedback.focus();}
      else byId('decision-status').focus();
    }
  }
  function renderHubs() {
    byId('hub-counts').replaceChildren(...result.hubs.map(hub => {
      const box = node('div', undefined, 'hub-count'), details = node('details');
      const resolved = model.resolvedHub(result, hub.id);
      box.append(node('strong', hub.name + ' · ' + hub.count + ' candidates'), node('p',
        resolved ? (resolved.kind === 'existing' ? 'Use saved hub: ' : 'Draft hub: ') + resolved.name : 'Hub requires review'));
      details.append(node('summary', 'Choose hub'));
      const label = node('label', 'Hub destination'), select = node('select');
      option(select, 'Pending', ''); option(select, 'Propose a new draft hub', 'new');
      const choices = new Map();
      result.review_targets.filter(target => target.table === 'setu_hubs').forEach(target => {
        const key = model.reference(target.table, target.id); choices.set(key, {kind: 'existing', id: target.id});
        option(select, 'Saved: ' + target.name + (hub.matches.some(match => String(match.id) === String(target.id)) ? ' · name match' : ''), key);
      });
      result.hubs.filter(other => other.id !== hub.id).forEach(other => {
        const key = 'research:' + other.id; choices.set(key, {kind: 'research_hub', id: other.id});
        option(select, 'Share research hub: ' + other.name, key);
      });
      select.value = !hub.resolution ? '' : hub.resolution.kind === 'new' ? 'new' :
        hub.resolution.kind === 'existing' ? model.reference('setu_hubs', hub.resolution.id) : 'research:' + hub.resolution.id;
      label.append(select); details.append(label);
      let distinct = hub.resolution?.distinct_acknowledged || false;
      if (hub.matches.length) details.append(node('p', 'Possible saved hubs: ' + hub.matches.map(match => match.name).join(', '), 'warning'));
      details.append(checkbox('If proposing a separate hub, I checked the similar hub names.', distinct, value => {distinct = value;}));
      const apply = node('button', 'Use hub choice'); apply.type = 'button';
      const feedback = node('p', '', 'warning'); feedback.role = 'alert'; feedback.tabIndex = -1;
      apply.addEventListener('click', () => {
        const outcome = model.resolveHub(result, hub.id, !select.value ? null : select.value === 'new' ? {kind: 'new'} : choices.get(select.value), distinct);
        if (!outcome.ok) {message(outcome.error, true, feedback);return;}
        outcome.value.candidates.forEach((candidate, i) => {
          if (candidate.decision === 'pending' && result.candidates[i].decision !== 'pending') forms.delete(candidate.research_id);
        });
        result = outcome.value; renderHubs(); render();
        message('Hub choice updated.' + (outcome.reset_count ? ' ' + outcome.reset_count + ' affected decisions reset to pending.' : ''));
      });
      details.append(feedback, apply); box.append(details); return box;
    }));
  }

  function applyDecision(candidate, action, options, feedback) {
    const outcome = model.setDecision(result, candidate.research_id, action, options);
    if (!outcome.ok) {message(outcome.error, true, feedback); return;}
    outcome.value.candidates.forEach((item, i) => {
      if (item.decision === 'pending' && result.candidates[i].decision !== 'pending') forms.delete(item.research_id);
    });
    if (['skip','pending'].includes(action)) forms.delete(candidate.research_id);
    result = outcome.value;
    render();
    message(candidate.name + ' · ' + ({pending:'reset to pending',accept_suggestion:'accepted as a suggestion in this review',skip:'skipped in this review',merge_selected:'selected fact merge staged'}[action]) + '. Download review JSON to keep your choices.');
  }

  function invalidateEditedDecision(candidate, action) {
    const current = result.candidates.find(item => item.research_id === candidate.research_id);
    if (current.decision !== action) return;
    const outcome = model.setDecision(result, candidate.research_id, 'pending');
    outcome.value.candidates.forEach((item, i) => {
      if (item.research_id !== candidate.research_id && item.decision === 'pending' && result.candidates[i].decision !== 'pending') forms.delete(item.research_id);
    });
    result = outcome.value; render();
    message('Choices changed for ' + candidate.name + '. Review and stage this decision again.');
  }

  function reviewControls(card, candidate, place) {
    const prior = candidate.decision_details;
    if (!forms.has(candidate.research_id)) forms.set(candidate.research_id, {distinct: prior?.distinct_acknowledged || false,
      kind: prior?.record_kind || model.suggestedKind(place),
      linked: prior?.linked_location ? model.reference(prior.linked_location.table, prior.linked_location.id) : '', target: '', fields: new Set(), same: false});
    const draft = forms.get(candidate.research_id);
    const panel = node('div', undefined, 'review-actions');
    panel.tabIndex = -1;
    const feedback = node('p', '', 'warning'); feedback.role = 'alert'; feedback.tabIndex = -1;
    panel.append(node('h4', 'Your review decision'), node('p', {
      pending:'Pending',accept_suggestion:'Accepted as suggestion · staged for a later save',skip:'Skipped · original evidence retained',merge_selected:'Selected research facts staged for merge'
    }[candidate.decision], 'decision-message'), feedback);
    const resolved = model.resolvedHub(result, candidate.hub_id);
    panel.append(node('p', resolved ? 'New suggestion hub: ' + resolved.name : 'Choose a hub above before accepting a new suggestion.', 'muted'));
    const kindLabel = node('label', 'Suggestion category'), kindSelect = node('select');
    [['Choose a category',''],['Food place','food'],['Shop','shop'],['Sight','see'],['Other','other']].forEach(([label,value]) => option(kindSelect,label,value));
    kindSelect.value = draft.kind; kindSelect.addEventListener('change', () => {draft.kind = kindSelect.value;invalidateEditedDecision(candidate,'accept_suggestion');});
    kindLabel.append(kindSelect); panel.append(kindLabel);
    if (candidate.needs_distinct_review) panel.append(checkbox(
      'I reviewed the overlaps. This needs a separate Setu suggestion rather than merging into a saved or staged Setu place.', draft.distinct, value => {draft.distinct = value;invalidateEditedDecision(candidate,'accept_suggestion');}));
    const links = result.review_targets.filter(target => ['akatsuki_places','akatsuki_shops'].includes(target.table));
    if (links.length) {
      const label = node('label', 'Link an existing location when accepting (optional)'), select = node('select');
      option(select, 'No linked location selected', '');
      links.forEach(target => option(select, target.name + ' · ' + target.table, model.reference(target.table, target.id)));
      select.value = draft.linked; select.addEventListener('change', () => {draft.linked = select.value;invalidateEditedDecision(candidate,'accept_suggestion');});
      label.append(select); panel.append(label, node('p', 'A location link is a proposal for the Setu suggestion. Location registries are read-only.', 'muted'));
    }
    const actions = node('div', undefined, 'actions');
    [['Accept as suggestion','accept_suggestion'],['Skip','skip'],['Reset decision','pending']].forEach(([label, action]) => {
      const button = node('button', label); button.type = 'button'; button.className = action === 'accept_suggestion' ? '' : 'secondary';
      button.addEventListener('click', () => applyDecision(candidate, action, {record_kind: draft.kind, distinct_acknowledged: draft.distinct, linked_location: draft.linked || null}, feedback));
      actions.append(button);
    });
    panel.append(actions);
    const merge = node('details'); merge.append(node('summary', 'Merge selected research facts into an existing place'));
    merge.open = candidate.decision === 'merge_selected' || !!draft.target;
    const searchLabel = node('label', 'Find a merge target'), search = node('input');
    search.type = 'search'; search.placeholder = 'Saved name, alias, address or research ID';
    searchLabel.append(search); merge.append(searchLabel);
    const targetLabel = node('label', 'Same-place target'), targetSelect = node('select');
    targetLabel.append(targetSelect); merge.append(targetLabel);
    const targets = result.review_targets.filter(target => target.merge_allowed).map(target => ({key:model.reference(target.table,target.id),
      label: target.name + ' · ' + target.table, searchable: JSON.stringify(target.facts),
      target:{kind:'existing',table:target.table,id:target.id}, facts:target.facts}));
    result.candidates.filter(other => other.research_id !== candidate.research_id && other.decision === 'accept_suggestion').forEach(other => {
      targets.push({key:'research:' + other.research_id,label:other.name + ' · accepted research suggestion',searchable:other.name + ' ' + other.research_id,
        target:{kind:'research_candidate',id:other.research_id},facts:result.research.places.find(item => item.research_id === other.research_id)});
    });
    const fields = node('fieldset'); fields.append(node('legend', 'Select research facts to merge'));
    model.mergeFields(place).forEach(field => {
      const item = node('div', undefined, 'fact-choice');
      item.append(checkbox(field.label, draft.fields.has(field.key), checked => {
        if (checked) draft.fields.add(field.key);else draft.fields.delete(field.key);
        invalidateEditedDecision(candidate,'merge_selected');
      }));
      evidence(item, 'Research value', field.value); fields.append(item);
    });
    const targetEvidence = node('div'), targetCount = node('p', '', 'muted');
    function showTargets() {
      const query = search.value.normalize('NFKC').toLocaleLowerCase('ja');
      const filtered = targets.filter(target => target.searchable.normalize('NFKC').toLocaleLowerCase('ja').includes(query));
      const visible = filtered.slice(0, 20);
      const selected = targets.find(target => target.key === draft.target);
      if (selected && !visible.includes(selected)) visible.push(selected);
      targetSelect.replaceChildren(); option(targetSelect, 'Choose the same place', '');
      visible.forEach(target => option(targetSelect, target.label, target.key)); targetSelect.value = draft.target;
      targetCount.textContent = filtered.length + ' targets match · showing up to 20. Search to narrow.';
    }
    showTargets();
    const selectedTarget = targets.find(target => target.key === draft.target);
    if (selectedTarget) evidence(targetEvidence, 'Selected target facts (personal fields protected)', selectedTarget.facts);
    search.addEventListener('input', showTargets);
    targetSelect.addEventListener('change', () => {
      draft.target = targetSelect.value; draft.same = false;
      targetEvidence.replaceChildren();
      const target = targets.find(item => item.key === draft.target);
      if (target) evidence(targetEvidence, 'Selected target facts (personal fields protected)', target.facts);
      // Changing the target requires a fresh same-place confirmation.
      sameInput.checked = false;
      invalidateEditedDecision(candidate,'merge_selected');
    });
    merge.append(targetCount, targetEvidence, fields);
    const same = checkbox('I checked that the selected target and this research candidate are the same place.', draft.same, checked => {draft.same = checked;invalidateEditedDecision(candidate,'merge_selected');});
    const sameInput = same.children[0]; merge.append(same);
    const stage = node('button', 'Stage selected fact merge'); stage.type = 'button';
    stage.addEventListener('click', () => applyDecision(candidate, 'merge_selected', {
      target: targets.find(target => target.key === draft.target)?.target, fields:[...draft.fields], same_place_acknowledged:draft.same}, feedback));
    merge.append(stage, node('p', 'Sources, checked dates and restrictions accompany every selected merge. Personal reviews, pins and confirmations stay protected.', 'muted'));
    panel.append(merge); card.append(panel);
    return panel;
  }

  function render() {
    if (!result) return;
    const counts = model.reviewSummary(result);
    byId('summary').textContent = result.candidates.length + ' candidates · ' + result.hubs.length + ' hubs · ' +
      counts.pending + ' pending · ' + counts.accept_suggestion + ' accepted suggestions · ' + counts.skip + ' skipped · ' + counts.merge_selected + ' selected merges';
    const hub = byId('hub-filter').value, query = byId('candidate-search').value.normalize('NFKC').toLocaleLowerCase('ja');
    const decision = byId('decision-filter').value;
    const filtered = result.candidates.filter(candidate => (!hub || candidate.hub_id === hub) &&
      (!decision || candidate.decision === decision) &&
      (candidate.name + ' ' + candidate.research_id).normalize('NFKC').toLocaleLowerCase('ja').includes(query));
    page = Math.max(0, Math.min(page, Math.ceil(filtered.length / 5) - 1));
    const fragment = document.createDocumentFragment();
    filtered.slice(page * 5, page * 5 + 5).forEach(candidate => {
      const place = result.research.places.find(item => item.research_id === candidate.research_id);
      const card = node('article');
      card.append(node('small', candidate.research_id + ' · ' + result.hubs.find(item => item.id === candidate.hub_id).name), node('h3', candidate.name));
      card.append(node('span', candidate.matches.length ? 'Possible existing place' : comparison ? 'No match in loaded snapshot' : 'Existing-place check unavailable', 'chip'));
      card.append(node('span', {pending:'Review pending',accept_suggestion:'Accepted as suggestion · staged',skip:'Skipped in review',merge_selected:'Selected facts staged'}[candidate.decision], 'chip'));
      card.append(node('span', 'Research source · unvisited', 'chip'));
      const jump = node('button', 'Review decision ↓', 'secondary'); jump.type = 'button';card.append(jump);
      card.append(node('p', place.location.address_ja + ' · Unverified location text', 'muted'));
      if (candidate.possible_file_duplicates.length) card.append(node('p', 'Possible overlap within this file: ' + candidate.possible_file_duplicates.join(', '), 'warning'));
      if (candidate.shared_source_references.length) card.append(node('p', 'Shared research pages with ' + candidate.shared_source_references.join(', ') + '. Several places can appear on the same page.', 'muted'));
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
        'Showing the first ' + candidate.matches.length + ' of ' + candidate.match_count + ' possible matches. Use merge-target search to find another loaded place.', 'warning'));
      candidate.matches.forEach(match => {
        const details = node('details');
        details.append(node('summary', match.name + ' · ' + match.table + ' · ' + match.reasons.join(', ')));
        details.append(node('p', 'Saved-versus-research comparison. Select research facts in the decision form below.'));
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
      const panel = reviewControls(card, candidate, place);
      jump.addEventListener('click', () => {panel.scrollIntoView({behavior:'smooth',block:'start'});panel.focus({preventScroll:true});});
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
  ['hub-filter', 'candidate-search', 'decision-filter'].forEach(id => byId(id).addEventListener('input', () => { page = 0; render(); }));
  byId('previous').addEventListener('click', () => { page--; render(); });
  byId('next').addEventListener('click', () => { page++; render(); });
  byId('export').addEventListener('click', () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([pretty(model.reviewExport(result))], {type: 'application/json'}));
    const link = node('a'); link.href = url; link.download = 'setu-research-preview-' + today() + '.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
