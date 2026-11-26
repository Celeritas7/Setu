/* R3 local-only recovery and materialization. No database client or network. */
(function (root) {
  'use strict';
  const model = typeof module !== 'undefined' && module.exports ? require('./research-import.js') : root.SetuResearchImport;
  const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
  const copy = value => JSON.parse(JSON.stringify(value));
  function requireValue(condition, message) {if (!condition) throw new Error(message);}
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  async function digest(value) {
    requireValue(root.crypto?.subtle, 'Local saving needs a secure browser page. You can still download the review JSON.');
    const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s\p{P}\p{S}]/gu,'');
  async function destinationId(research) {
    const d = research.destination;
    // Trip dates and origin changes do not create a new destination namespace.
    const name = normalize(d.name_ja || d.name_en || d.name);
    const identity = [normalize(d.country || d.country_code || 'Japan'), normalize(d.prefecture_ja || d.prefecture),
      name || research.hubs.map(hub => normalize(hub.name_ja)).sort()];
    return 'destination-' + await digest(identity);
  }
  const placeId = (scope, id) => scope + '/place/' + encodeURIComponent(id);
  const hubId = (scope, id) => scope + '/hub/' + encodeURIComponent(id);
  const emptyCatalog = () => ({hubs: [], places: []});
  function ensureResearch(data) {
    const valid = model.validateText(JSON.stringify(data));
    requireValue(valid.ok, valid.errors.map(error => error.path + ' — ' + error.message).join('\n'));
    return valid.data;
  }
  function sourceEnvelope(research, source) {
    return {destination: copy(research.destination), provenance: copy(research.provenance), import_contract: copy(research.import_contract),
      original_hub: copy(research.hubs.find(hub => hub.id === source.hub_id))};
  }
  function validateSource(source, envelope) {
    requireValue(envelope && envelope.original_hub, 'Draft source hub is missing.');
    ensureResearch({format:'setu_research_handoff',schema_version:'1.0.0',destination:envelope.destination,
      provenance:envelope.provenance,import_contract:envelope.import_contract,hubs:[envelope.original_hub],places:[source]});
  }
  function effectiveSource(draft) {
    const source = copy(draft.source);
    for (const supplement of draft.supplements) {
      for (const field of model.mergeFields(supplement.source).filter(field => supplement.fields.includes(field.key))) {
        const path = field.path.split('.');let target = source;
        for (const part of path.slice(0,-1)) target = target[part];
        target[path[path.length - 1]] = copy(field.value);
      }
    }
    return source;
  }
  function snapshotWithCatalog(comparison, catalog) {
    const tables = Object.fromEntries(model.TABLES.map(table => [table, comparison?.tables?.[table] || []]));
    tables[model.LOCAL_HUBS] = catalog.hubs.map(hub => ({id:hub.id,name:hub.name,rev:hub.rev}));
    tables[model.LOCAL_PLACES] = catalog.places.map(draft => {
      const source = effectiveSource(draft);
      return {id:draft.id,rev:draft.rev,name:source.name_ja,address:source.location.address_ja,aliases:source.aliases || [],
        source_url:source.source_links[0]?.url,place_ref:source.external_place_id,hub_id:draft.hub.id};
    });
    return {scope:comparison?.scope || 'saved browser-local drafts', captured_at:comparison?.captured_at || new Date().toISOString(),complete:false,tables};
  }
  function archivedComparison(review) {
    const tables = Object.fromEntries(model.TABLES.map(table => [table, []]));
    requireValue(review.review_targets === undefined || (Array.isArray(review.review_targets) && review.review_targets.length <= 10000), 'Invalid or excessive saved comparison targets.');
    for (const target of review.review_targets || []) {
      requireValue(target && [...model.TABLES,model.LOCAL_PLACES,model.LOCAL_HUBS].includes(target.table) && target.id != null && target.facts && typeof target.facts === 'object', 'Invalid saved comparison target.');
      if (tables[target.table]) tables[target.table].push({...target.facts,id:target.id});
    }
    return {scope:'historical comparison from saved review · recheck before cloud sync',captured_at:review.comparison?.captured_at || review.generated_on,complete:false,tables};
  }
  function prepare(research, comparison, catalog, today, scope) {
    const snapshot = snapshotWithCatalog(comparison, catalog), review = model.preview(research, snapshot, today);
    review.hubs.forEach(hub => {hub.matches = hub.matches.filter(match => match.id !== hubId(scope,hub.id));});
    for (const candidate of review.candidates) {
      const source = research.places.find(place => place.research_id === candidate.research_id);
      const own = catalog.places.find(draft => draft.id === placeId(scope,candidate.research_id) && stable(draft.source) === stable(source));
      if (!own) continue;
      candidate.local_draft_id = own.id;
      candidate.matches = candidate.matches.filter(match => !(match.table === model.LOCAL_PLACES && match.id === own.id));
      candidate.match_count = Math.max(0, candidate.match_count - 1);
      candidate.needs_distinct_review = candidate.possible_file_duplicates.length > 0 || review.review_targets.some(target =>
        !['setu_hubs',model.LOCAL_HUBS].includes(target.table) && !(target.table === model.LOCAL_PLACES && target.id === own.id) &&
        model.matchReasons(source,target.facts).some(reason => !reason.startsWith('Source URL')));
    }
    return review;
  }
  function restoredReview(exported, catalog, today, scope, freshComparison = null) {
    requireValue(exported.format === 'setu_research_preview' && exported.schema_version === '1.0.0' &&
      [undefined,'2.0.0'].includes(exported.review_version), 'Unsupported review export version.');
    const research = ensureResearch(exported.research);
    requireValue(Array.isArray(exported.hubs) && exported.hubs.length === research.hubs.length &&
      new Set(exported.hubs.map(hub => hub.id)).size === research.hubs.length && exported.hubs.every(hub => research.hubs.some(original => original.id === hub.id)), 'Saved review hub IDs do not match the research.');
    requireValue(Array.isArray(exported.candidates) && exported.candidates.length === research.places.length &&
      new Set(exported.candidates.map(candidate => candidate.research_id)).size === research.places.length &&
      exported.candidates.every(candidate => research.places.some(place => place.research_id === candidate.research_id)), 'Saved review candidate IDs do not match the research.');
    let review = prepare(research, freshComparison || archivedComparison(exported), catalog, today, scope);
    const warnings = [];
    let pending = exported.hubs.filter(hub => hub.resolution);
    while (pending.length) {
      const next = [];
      for (const hub of pending) {
        const savedHub = hub.resolution.kind === 'existing' && review.review_targets.find(target => target.table === (hub.resolution.table || 'setu_hubs') && String(target.id) === String(hub.resolution.id));
        if (freshComparison && hub.resolution.kind === 'existing' && (!savedHub || hub.resolution.rev !== savedHub.facts.rev)) {
          warnings.push(hub.name + ' needs a new hub choice because its saved hub changed.');continue;
        }
        const outcome = model.resolveHub(review,hub.id,hub.resolution,hub.resolution.distinct_acknowledged === true);
        if (outcome.ok) review = outcome.value;else next.push(hub);
      }
      if (freshComparison && next.length === pending.length) {warnings.push('Some hub choices need review against the fresh comparison.');break;}
      requireValue(next.length < pending.length, 'Saved hub choices are invalid, unavailable or cyclic.');pending = next;
    }
    const ordered = [...exported.candidates.filter(candidate => candidate.decision !== 'merge_selected'),
      ...exported.candidates.filter(candidate => candidate.decision === 'merge_selected')];
    for (const candidate of ordered) {
      const details = candidate.decision_details || {}, options = {...details};
      if (details.linked_location) options.linked_location = model.reference(details.linked_location.table,details.linked_location.id);
      // External rows are only deferred proposals. Local targets require a fresh
      // revision check, so a later local edit cannot inherit an old approval.
      const localTarget = details.target?.table === model.LOCAL_PLACES ? catalog.places.find(draft => draft.id === details.target.id) : null;
      if (freshComparison && candidate.decision === 'merge_selected' && details.target?.kind === 'existing' && details.target.table !== model.LOCAL_PLACES) {
        const target = review.review_targets.find(item => item.table === details.target.table && String(item.id) === String(details.target.id));
        if (!target || target.facts.rev !== details.target.rev) {warnings.push(candidate.name + ' needs merge approval again because its saved target changed.');continue;}
      }
      const source = research.places.find(place => place.research_id === candidate.research_id);
      const alreadyApplied = localTarget?.supplements.some(item => item.research_id === candidate.research_id &&
        stable(item.fields) === stable(details.fields) && stable(item.source) === stable(source) && stable(item.evidence) === stable(sourceEnvelope(research,source)));
      if (localTarget && details.target.rev !== localTarget.rev && !alreadyApplied) {
        warnings.push(candidate.name + ' needs review because its local target changed.');continue;
      }
      const outcome = model.setDecision(review,candidate.research_id,candidate.decision || 'pending',options);
      if (freshComparison && !outcome.ok) {warnings.push(candidate.name + ' needs review: ' + outcome.error);continue;}
      requireValue(outcome.ok, candidate.research_id + ' — ' + outcome.error);review = outcome.value;
    }
    return {review,warnings};
  }

  async function validateCatalog(input, scope) {
    requireValue(input && Array.isArray(input.hubs) && Array.isArray(input.places) && input.hubs.length <= 200 && input.places.length <= 1000, 'Invalid local draft catalog.');
    const catalog = copy(input), ids = new Set(), hubNames = new Set(), checkedPlaces = [];
    for (const hub of catalog.hubs) {
      requireValue(hub.id === hubId(scope,hub.research_hub_id) && typeof hub.name === 'string' && hub.name.trim() && Number.isSafeInteger(hub.rev) && hub.rev > 0 && !ids.has(hub.id) && !hubNames.has(normalize(hub.name)), 'Invalid or duplicate local hub.');ids.add(hub.id);hubNames.add(normalize(hub.name));
    }
    for (const draft of catalog.places) {
      requireValue(draft.id === placeId(scope,draft.research_id) && !ids.has(draft.id) && ['food','shop','see','other'].includes(draft.record_kind) &&
        draft.accepted === false && draft.status === 'try' && draft.lat === null && draft.lng === null &&
        Array.isArray(draft.personal_confirmed_experiences) && draft.personal_confirmed_experiences.length === 0 &&
        Number.isSafeInteger(draft.rev) && draft.rev > 0 && Array.isArray(draft.supplements), 'Invalid or personally confirmed local draft.');ids.add(draft.id);
      validateSource(draft.source,draft.evidence);
      requireValue(draft.research_id === draft.source.research_id, 'Draft research identity does not match its source.');
      requireValue(await destinationId({destination:draft.evidence.destination,hubs:[draft.evidence.original_hub]}) === scope ||
        !normalize(draft.evidence.destination.name_ja || draft.evidence.destination.name_en || draft.evidence.destination.name), 'Draft belongs to another destination.');
      requireValue(draft.hub && (draft.hub.table === 'setu_hubs' || (draft.hub.table === model.LOCAL_HUBS && catalog.hubs.some(hub => hub.id === draft.hub.id))), 'Local draft hub is unavailable.');
      const supplements = new Set();
      for (const supplement of draft.supplements) {
        validateSource(supplement.source,supplement.evidence);
        requireValue(Array.isArray(supplement.fields) && supplement.fields.length && supplement.fields.every(key => model.mergeFields(supplement.source).some(field => field.key === key)) &&
          supplement.id === await digest({source:supplement.source,evidence:supplement.evidence,fields:supplement.fields}) && !supplements.has(supplement.id), 'Invalid or duplicate local research supplement.');supplements.add(supplement.id);
      }
      const facts = effectiveSource(draft);
      requireValue(!checkedPlaces.some(other => samePlace(facts,other.source) ||
        (draft.linked_location && stable(draft.linked_location) === stable(other.linked_location))), 'Backup contains duplicate local places. Existing saved data was preserved.');
      checkedPlaces.push({source:facts,linked_location:draft.linked_location});
    }
    return catalog;
  }

  function samePlace(source, existing) {
    const reasons = model.matchReasons(source,{...existing,address:existing.location.address_ja});
    return !!(source.external_place_id && source.external_place_id === existing.external_place_id) ||
      (reasons.includes('Name or alias') && reasons.includes('Address text'));
  }

  async function materialize(review, catalog, scope) {
    const next = copy(catalog), proposals = model.reviewExport(review).proposed_changes;
    const sourceFor = id => review.research.places.find(place => place.research_id === id);
    let added = 0, merged = 0, updated = 0;
    for (const proposal of proposals.filter(item => item.action === 'accept_suggestion')) {
      const source = sourceFor(proposal.research_id), id = placeId(scope,source.research_id);
      const existing = next.places.find(draft => draft.id === id);
      if (existing) requireValue(stable(existing.source) === stable(source), 'A local draft exists for ' + source.name_ja + '. Merge selected facts into it instead.');
      requireValue(!next.places.some(draft => {
        if (draft.id === id) return false;
        const facts = effectiveSource(draft);
        return samePlace(source,facts) ||
          (proposal.linked_location && stable(proposal.linked_location) === stable(draft.linked_location));
      }), 'A local draft already represents ' + source.name_ja + '. Merge into it or skip the duplicate.');
      let hub;
      requireValue(proposal.hub, 'Resolve the suggestion hub before saving.');
      if (proposal.hub.kind === 'new') {
        const hId = hubId(scope,proposal.hub.research_hub_id);
        requireValue(!next.hubs.some(item => item.id !== hId && normalize(item.name) === normalize(proposal.hub.name)), 'A local hub with this name exists. Choose the saved local hub or share its choice.');
        if (!next.hubs.some(item => item.id === hId)) next.hubs.push({id:hId,research_hub_id:proposal.hub.research_hub_id,name:proposal.hub.name,rev:1});
        hub = {table:model.LOCAL_HUBS,id:hId};
      } else hub = {table:proposal.hub.table || 'setu_hubs',id:proposal.hub.id};
      if (existing) {
        const classification = {record_kind:proposal.destination_record.kind || 'food',hub,linked_location:proposal.linked_location};
        if (stable(classification) !== stable({record_kind:existing.record_kind,hub:existing.hub,linked_location:existing.linked_location})) {
          Object.assign(existing,classification);existing.rev++;updated++;
        }
        continue;
      }
      next.places.push({id,research_id:source.research_id,rev:1,record_kind:proposal.destination_record.kind || 'food',hub,
        linked_location:proposal.linked_location,source:copy(source),evidence:sourceEnvelope(review.research,source),supplements:[],
        accepted:false,status:'try',lat:null,lng:null,personal_confirmed_experiences:[]});added++;
    }
    for (const proposal of proposals.filter(item => item.action === 'merge_selected')) {
      // Cloud-target merges remain in the saved review and backup for R4.
      if (proposal.target.kind !== 'research_candidate' && proposal.target.table !== model.LOCAL_PLACES) continue;
      const id = proposal.target.kind === 'research_candidate' ? placeId(scope,proposal.target.id) : proposal.target.id;
      const draft = next.places.find(item => item.id === id);
      requireValue(draft, 'Save the base local suggestion before merging research into it.');
      const source = sourceFor(proposal.research_id);
      const supplement = {research_id:source.research_id,source:copy(source),evidence:sourceEnvelope(review.research,source),fields:proposal.selected_research_facts.map(field => field.key)};
      supplement.id = await digest({source:supplement.source,evidence:supplement.evidence,fields:supplement.fields});
      if (draft.supplements.some(item => item.id === supplement.id)) continue;
      const original = catalog.places.find(item => item.id === id);
      requireValue(proposal.target.kind === 'research_candidate' || proposal.target.rev === original?.rev, 'Local merge target changed. Reset the merge and review its current facts.');
      draft.supplements.push(supplement);draft.rev++;merged++;
    }
    await validateCatalog(next,scope);
    return {catalog:next,added,merged,updated,deferred:proposals.filter(item => item.action === 'merge_selected' && item.target.kind === 'existing' && item.target.table !== model.LOCAL_PLACES).length};
  }

  function parse(text) {
    requireValue(typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_BACKUP_BYTES, 'Choose JSON up to 25 MiB (research handoffs up to 5 MiB).');
    try {
      return JSON.parse(text.replace(/^\uFEFF/,''),(key,value) => {
        requireValue(!['__proto__','prototype','constructor'].includes(key), 'Reserved key in imported JSON.');
        requireValue(typeof value !== 'number' || (Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))), 'Number cannot be represented safely.');return value;
      });
    } catch (error) {if (error instanceof SyntaxError) throw new Error('Invalid JSON. Check commas, quotes and brackets.');throw error;}
  }
  async function inspectInput(text) {
    const data = parse(text);
    if (data?.format === 'setu_research_handoff') {
      requireValue(new TextEncoder().encode(text).length <= model.MAX_BYTES, 'Choose a research handoff up to 5 MiB.');
      const research = ensureResearch(data);return {kind:'research',research,scope:await destinationId(research),report:await digest(research)};
    }
    if (data?.format === 'setu_research_preview') {
      const research = ensureResearch(data.research);return {kind:'review',research,exported:data,scope:await destinationId(research),report:await digest(research)};
    }
    requireValue(data?.format === 'setu_research_local_backup' && data.schema_version === '1.0.0' && data.workspace, 'Unsupported research or backup format/version.');
    const workspace = await validateWorkspace(data.workspace);
    const research = workspace.reviews[workspace.active].research;
    return {kind:'backup',research,workspace,scope:workspace.id,report:workspace.active};
  }
  async function validateWorkspace(input) {
    requireValue(input && typeof input.id === 'string' && input.reviews && typeof input.reviews === 'object' && !Array.isArray(input.reviews) && input.reviews[input.active] && Object.keys(input.reviews).length <= 200, 'Invalid saved workspace or more than 200 research versions.');
    const catalog = await validateCatalog(input.catalog,input.id), reviews = {}, warnings = [];
    for (const [id, exported] of Object.entries(input.reviews)) {
      requireValue(await destinationId(exported.research) === input.id && await digest(exported.research) === id, 'Workspace research identity does not match.');
      const restored = restoredReview(exported,catalog,exported.generated_on || new Date().toISOString().slice(0,10),input.id);
      reviews[id] = restored.review;warnings.push(...restored.warnings);
    }
    return {id:input.id,active:input.active,reviews,catalog,restore_warnings:warnings};
  }
  async function mergeWorkspace(existing, incoming, chooseConflicts) {
    if (!existing) return validateWorkspace(incoming);
    requireValue(existing.id === incoming.id, 'Backup destination does not match.');
    const catalog = {hubs:[...existing.catalog.hubs],places:[...existing.catalog.places]};
    const conflicts = [];
    for (const key of ['hubs','places']) {
      const indices = new Map(catalog[key].map((item,index) => [item.id,index]));
      for (const item of incoming.catalog[key]) {
        const index = indices.get(item.id);
        if (index === undefined) catalog[key].push(item);
        else if (stable(catalog[key][index]) !== stable(item))
          conflicts.push({key,index,device:catalog[key][index],backup:item});
      }
    }
    if (conflicts.length) {
      requireValue(chooseConflicts, 'Choose a version for each conflicting draft.');
      const choices = await chooseConflicts(conflicts);
      if (choices === null) return null;
      conflicts.forEach(({key,index,backup},i) => {
        requireValue(['device','backup'].includes(choices[i]), 'Each conflicting draft needs a choice.');
        if (choices[i] === 'backup') catalog[key][index] = backup;
      });
    }
    return validateWorkspace({id:existing.id,active:incoming.active,reviews:{...existing.reviews,...incoming.reviews},catalog});
  }
  function backup(workspace) {return {format:'setu_research_local_backup',schema_version:'1.0.0',exported_at:new Date().toISOString(),workspace:copy(workspace)};}
  const personalUUID=value=>typeof value==='string' && value.length===36 &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
  const personalDate=value=>model.validDate(value) && value.length===10 && !value.startsWith('0000');
  const japanDateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
  function japanDate(instant) {
    const parts=Object.fromEntries(japanDateFormat.formatToParts(instant).map(part=>[part.type,part.value]));
    return parts.year.padStart(4,'0')+'-'+parts.month+'-'+parts.day;
  }
  function personalRecordedTime(value) {
    // Exported timestamps are ISO instants. Check the calendar date separately
    // because Date.parse can normalize an impossible day into the next month.
    if (typeof value!=='string') return null;
    const match=value.match(/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
    if (!match || match[0]!==value || !personalDate(match[1])) return null;
    const time=Date.parse(value);
    return Number.isFinite(time)?time:null;
  }
  function personalAdditions(file, destination, placeId, existing, now=new Date()) {
    requireValue(file?.format === 'setu_personal_space_reviews' && file.version === 1 &&
      Array.isArray(file.reviews) && file.reviews.length, 'Choose a personal space review export.');
    requireValue(Number.isFinite(now.valueOf()), 'Cannot check the current recording time.');
    const today=japanDate(now);
    // Keep existing records untouched. UUID letter case is not a new identity.
    const idKey=id=>typeof id==='string'?id.toLowerCase():id;
    const comparable=row=>stable({...row,id:idKey(row.id)});
    const known=new Map(existing.map(row=>[idKey(row.id),row])), added=[];
    for (const row of file.reviews) {
      requireValue(row?.destination === destination && row.place_id === placeId, 'This export belongs to another place or destination.');
      requireValue(personalUUID(row.id) &&
        typeof row.space === 'string' && row.space.trim() && row.space.length <= 160 &&
        typeof row.observation === 'string' && row.observation.trim() && row.observation.length <= 2000 &&
        typeof row.place_name === 'string' && typeof row.address === 'string' && typeof row.source_hash === 'string' &&
        /^[0-9a-f]{64}$/.test(row.source_hash) && row.status === 'personally_confirmed' &&
        ['Igloo','Cocoon','Hideout'].includes(row.tag), 'This export contains an invalid space review.');
      requireValue(personalDate(row.observed_on) && row.observed_on<=today,
        'Invalid space review: visit date must be a real date on or before today in Japan.');
      const recorded=personalRecordedTime(row.recorded_at);
      requireValue(recorded!==null, 'Invalid space review: recording time must be a valid ISO timestamp with a time zone.');
      requireValue(recorded<=now.valueOf(), 'Invalid space review: recording time is in the future.');
      requireValue(row.observed_on<=japanDate(new Date(recorded)),
        'Invalid space review: visit date is after the recording date in Japan.');
      const key=idKey(row.id), previous=known.get(key);
      if (previous) requireValue(comparable(previous) === comparable(row), 'A review ID has conflicting observations. Restore cancelled.');
      else {known.set(key,row);added.push(row);}
    }
    return added;
  }
  function serializeBackup(envelope) {
    const text = JSON.stringify(envelope);
    requireValue(new TextEncoder().encode(text).length <= MAX_BACKUP_BYTES,
      'Backup exceeds 25 MiB. Export the current review separately.');
    return text;
  }
  const api = {personalAdditions,serializeBackup,MAX_BACKUP_BYTES,stable,digest,destinationId,placeId,emptyCatalog,effectiveSource,prepare,restoredReview,
    materialize,inspectInput,validateWorkspace,mergeWorkspace,backup};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;else root.SetuResearchLocal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
