/* Unsubmitted wrap-up notes belong to one trip in one tab, not to trip history. */
(function (root) {
  'use strict';
  const KEY='setu.trip-note-drafts.v1';
  const fields=['transport','recovery','future'];
  const blank=()=>Object.fromEntries(fields.map(key=>[key,'']));
  const hasText=notes=>fields.some(key=>notes[key].trim()!=='');
  function open(storage) {
    const drafts=new Map();
    let writable=true, saved=true;
    try {
      const raw=storage.getItem(KEY);
      if (raw!==null) {
        const entries=JSON.parse(raw);
        if (!Array.isArray(entries) || entries.some(entry=>
          !entry || typeof entry.trip_id!=='string' || !entry.trip_id ||
          !entry.notes || !fields.every(key=>typeof entry.notes[key]==='string'))) throw Error('Invalid note drafts');
        for (const {trip_id,notes} of entries) drafts.set(trip_id,Object.fromEntries(fields.map(key=>[key,notes[key]])));
      }
    } catch (_) {writable=false;saved=false;}
    function persist() {
      if (!writable) return false;
      try {
        if (drafts.size) storage.setItem(KEY,JSON.stringify(entries()));
        else storage.removeItem(KEY);
        saved=true;
      } catch (_) {saved=false;}
      return saved;
    }
    function entries() {return [...drafts].map(([trip_id,notes])=>({trip_id,notes:{...notes}}));}
    return {
      get(id) {return {...(drafts.get(id)||blank())};},
      entries,
      set(id,notes) {
        if (!id) return false;
        const copy=Object.fromEntries(fields.map(key=>[key,notes[key]]));
        if (hasText(copy)) drafts.set(id,copy);else drafts.delete(id);
        return persist();
      },
      remove(id) {drafts.delete(id);return persist();},
      saved:()=>saved
    };
  }
  const api={open,KEY,fields,hasText};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.SetuTripNoteDrafts=api;
})(typeof globalThis!=='undefined'?globalThis:this);
