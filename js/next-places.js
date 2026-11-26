/* Read-only L1 preview. Transport/return verification is supplied by a future companion integration. */
(function (root) {
  'use strict';
  const MINUTE = 60000, DAY = 86400000;
  const JST = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
  const text = value => typeof value === 'string' ? value.trim() : '';
  const amount = value => (typeof value === 'number' || (typeof value === 'string' && value.trim())) && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const keyDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return null;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : null;
  };
  function instant(date, clock) {
    if (!keyDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(text(clock))) return null;
    return new Date(date + 'T' + clock + ':00+09:00');
  }
  function dateEvidence(value, date, now) {
    const parts = {};for(const p of JST.formatToParts(now))parts[p.type]=p.value;
    const checked = keyDate(value), today = parts.year+'-'+parts.month+'-'+parts.day;
    if (!checked) return {fresh:false,label:'Checked date unknown'};
    if (checked > today) return {fresh:false,label:'Future checked date ' + checked + ' — verify the record'};
    const target = date && date > today ? date : today;
    const old = (Date.parse(target)-Date.parse(checked))/DAY > 60;
    return {fresh:!old,label:'Checked ' + checked + (old ? ' · over 60 days old — recheck' : '')};
  }
  function project(data, helpers) {
    const hubs = Array.isArray(data.hubs) ? data.hubs : [], byHub = new Map(hubs.map(h => [h.id,h]));
    const records = [], seen = new Set();
    for (const [type, rows] of [['food',data.foods],['spot',data.spots]]) for (const row of rows || []) {
      if (!row || !['string','number'].includes(typeof row.id) || !String(row.id).trim()) continue;
      const key = type + ':' + row.id, themes = Array.isArray(row.themes) ? row.themes.filter(t => typeof t === 'string') : [];
      if (seen.has(key) || row.deleted_at || row.status === 'skip' || row.accepted === false || (!data.sick && themes.includes('sick-day'))) continue;
      seen.add(key);
      const repeat = themes.some(t => ['sit-long','local-grocery'].includes(t)) || row.go_back === true || row.again === 'yes';
      if (row.status === 'done' && !repeat) continue;
      const facts = helpers.facts(row), hubId = row.hubId ?? row.hub_id ?? null, hub = byHub.get(hubId);
      const kind = type === 'food' ? (themes.includes('cafe') ? 'cafe' : 'food') : themes.includes('sit-long') ? 'rest' : row.kind === 'see' ? 'sight' : 'shop';
      records.push({key,type,kind,name:text(row.name) || 'Unnamed place',hubId,hubName:text(hub?.name),
        address:text(row.address),lat:row.lat,lng:row.lng,hours:row.hours || null,hoursSeen:row.hoursSeen ?? row.hours_seen,
        cost:amount(row.spend ?? row.spend_yen),costSeen:row.spendSeen ?? row.spend_seen,minimum:amount(facts.min_order_yen),
        stayLimit:amount(facts.stay_limit_min),setting:facts.setting,quiet:facts.quiet,themes,
        source:helpers.safeUrl(row.url || row.source_url),checked:facts.last_checked,confidence:facts.confidence || 'unverified',
        maps:helpers.maps(row,hub),beefFocused:type === 'food' && helpers.beef(row),dayOff:helpers.dayOff(row),
        accessBlocked:row.access_state === 'prohibited' || row.access_state === 'blocked',
        remote:row.remote===true || themes.some(t=>['remote','trail','hiking'].includes(t))});
    }
    return {records,hubs:hubs.map(h => ({key:'hub:'+h.id,name:text(h.name) || 'Unnamed area',hubId:h.id,lat:h.lat,lng:h.lng}))};
  }
  function rank(data, query, helpers, now = new Date()) {
    const at = instant(query.date,query.time), origin = [...data.hubs,...data.records].find(x => x.key === query.origin);
    const visit = amount(query.visitMin), ceiling = text(String(query.budget ?? '')) === '' ? null : amount(query.budget);
    const radius = Number(query.radiusKm), errors = [];
    if (!origin) errors.push('Choose a current stop or station hub.');
    if (!visit || visit > 480) errors.push('Choose a stay between 1 and 480 minutes.');
    if (query.date && !at) errors.push('Choose a valid date and Japan-local time.');
    if (text(String(query.budget ?? '')) && ceiling === null) errors.push('Enter a whole-yen budget of zero or more, or leave it blank.');
    if (![1,3,5,10,25].includes(radius)) errors.push('Choose a search distance.');
    const result = {errors,rows:[],excluded:[],total:0,selectedDate:at ? query.date : null,returnStatus:'unverified',leaveBy:null};
    if (errors.length) return result;
    for (const record of data.records) {
      if (record.key === origin.key || (query.hubId && String(record.hubId) !== query.hubId)) continue;
      const distance = helpers.distance(origin,record), estimate = distance===null?null:helpers.walk(origin,record), travel = amount(estimate);
      const excluded = [], warnings = ['Route/access and return are unverified. No leave-by time is available.'];
      if (record.beefFocused) excluded.push('Beef-focused food option');
      if (record.accessBlocked) excluded.push('Recorded access restriction');
      if (record.remote) excluded.push('Remote/trail access and return are unverified — check transport first; prefer a local alternative');
      if (distance !== null && distance > radius) excluded.push('Beyond the selected straight-line distance');
      const lowerCost = Math.max(record.cost ?? 0,record.minimum ?? 0);
      if (ceiling !== null && lowerCost > ceiling) excluded.push('Recorded minimum or visit estimate exceeds this stop’s budget');
      const sheltered = record.setting === 'indoor' || record.themes.includes('rain-ok');
      const outdoor = record.setting === 'outdoor';
      if (query.weather === 'rain' && outdoor && !sheltered) excluded.push('Recorded outdoor stop without rain cover');
      const arrival = at && travel !== null ? new Date(at.getTime()+travel*MINUTE) : null;
      const evidence = dateEvidence(record.hoursSeen,query.date,now);
      const hours = arrival ? helpers.availability(record.hours,arrival) : {state:'unknown',remainingMinutes:null,alwaysOpen:false,closesAt:null};
      let hoursText = !at ? 'Hours unchecked — select a date and time' : !arrival ? 'Arrival time and opening window unknown' :
        hours.state === 'closed' ? 'Regular hours indicate closed at estimated arrival' : hours.state === 'unknown' ? 'Opening window unknown' :
        hours.alwaysOpen ? 'Recorded weekly hours are continuous; confirm exceptions' : Math.floor(hours.remainingMinutes)+' min until regular closing at estimated arrival';
      const short = hours.remainingMinutes !== null && hours.state !== 'closed' && hours.remainingMinutes < visit;
      if (evidence.fresh && hours.state === 'closed') excluded.push('Regular hours indicate closed at estimated arrival');
      if (evidence.fresh && short) excluded.push('The planned stay does not fit regular opening hours');
      if (record.stayLimit !== null && record.stayLimit !== 0 && record.stayLimit < visit) excluded.push('Recorded stay limit is shorter than the planned stay');
      if (!evidence.fresh && record.hours) hoursText += ' · old or undated record — recheck';
      warnings.push('Weekly hours do not verify holiday exceptions, entry permission or seating.');
      if (travel !== null) warnings.push('Travel is a straight-line walking estimate; paths, terrain, crossings and delays are unchecked.');
      else warnings.push('Travel time and distance are unknown. This place is not established as nearby.');
      if (record.type === 'food') warnings.push('Non-beef ingredients, stocks and broths need a menu/restaurant check.');
      if (query.weather === 'rain') warnings.push(sheltered ? 'Cover is recorded; route exposure and an available seat are unverified.' : 'Rain protection is unknown.');
      if (ceiling !== null) warnings.push('This budget is for one stop. Travel costs and extra fees are unknown.');
      const quiet = record.quiet === 1 || record.themes.some(t => ['quiet','less-crowded'].includes(t));
      const rest = record.themes.includes('sit-long');
      const knownWindow = evidence.fresh && ['open','short'].includes(hours.state) && !short;
      const costText = record.cost === null ? 'Visit budget unknown' : 'Recorded visit estimate ¥'+record.cost.toLocaleString('en-US');
      const minimumText = record.minimum === null ? 'Minimum order unknown' : 'Recorded minimum order ¥'+record.minimum.toLocaleString('en-US');
      const reasons = [knownWindow ? 'Planned stay fits recorded regular hours' : 'Opening window needs checking'];
      if (query.weather === 'rain' && sheltered) reasons.push('Recorded cover for rain');
      if (query.quiet && quiet) reasons.push('Recorded quiet/less-crowded information');
      if (query.rest && rest) reasons.push('Recorded sit-long option');
      if (record.cost !== null) reasons.push('Visit estimate is recorded');
      const row = {...record,distanceKm:distance,travelMin:travel,arrival:arrival?.toISOString() || null,visitMin:visit,
        hoursText,hoursEvidence:evidence.label,closesAt:hours.closesAt || null,priceEvidence:dateEvidence(record.costSeen,query.date,now).label,
        costText,minimumText,quietText:quiet ? 'Quiet/less-crowded information recorded; conditions may change' : 'Quietness unknown or not preferred',
        shelterText:sheltered ? 'Cover recorded; access/seating unverified' : outdoor ? 'Recorded outdoor setting' : 'Weather protection unknown',
        warnings,reasons,returnStatus:'unverified',leaveBy:null,eligibility:'needs_checks',excluded,
        _tier:knownWindow ? 0 : 1,
        _score:(travel ?? 180)+(query.weather === 'rain' && !sheltered ? 30 : 0)+(query.quiet && !quiet ? 12 : 0)+(query.rest && !rest ? 8 : 0)+
          (record.cost === null ? 5 : 0)+(knownWindow && hours.remainingMinutes !== null && hours.remainingMinutes-visit < 30 ? -3 : 0)};
      if (excluded.length) result.excluded.push(row);else result.rows.push(row);
    }
    const compare = (a,b) => a._tier-b._tier || a._score-b._score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    result.rows.sort(compare);result.excluded.sort(compare);
    // Add variety only within the same opening-evidence tier; exclusions always win.
    const remaining = result.rows.slice(), chosen = [], kinds = new Map(), hubs = new Map();
    while (remaining.length && chosen.length < 5) {
      remaining.sort((a,b) => a._tier-b._tier ||
        (a._score+(kinds.get(a.kind)||0)*15+(hubs.get(a.hubId)||0)*3)-(b._score+(kinds.get(b.kind)||0)*15+(hubs.get(b.hubId)||0)*3) || compare(a,b));
      const row = remaining.shift();chosen.push(row);kinds.set(row.kind,(kinds.get(row.kind)||0)+1);hubs.set(row.hubId,(hubs.get(row.hubId)||0)+1);
    }
    result.rows=[...chosen,...remaining.sort(compare)];result.total=result.rows.length;return result;
  }
  const api = {project,rank,instant,keyDate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;else root.SetuNextPlaces = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
