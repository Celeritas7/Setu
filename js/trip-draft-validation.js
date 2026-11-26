/* Version 1 place-update draft preview contract, matching the disposable SQL rehearsal. */
(function(root) {
  'use strict';
  const outcomes=['Suggested','Passed nearby','Visited','Did not enter','Personally reviewed'];
  const comfortQuestions=[
    ['noise','Noise level',['Quiet','Moderate','Loud']],
    ['crowding','Crowding',['Few people','Moderately busy','Crowded']],
    ['comfort','Comfort',['Comfortable','Mixed','Uncomfortable']],
    ['seating','Seat availability',['Seat available','All seats taken','No seats']],
    ['access','Cost to use this space',['Free','Purchase required','Entry fee']],
    ['stay','Time you actually stayed',['Under 30 minutes','30–59 minutes','60–89 minutes','90 minutes or longer']],
    ['study','Independent study',['Studied here','Study prohibited']],
    ['laptop','Laptop use',['Used a laptop','Laptop use prohibited']],
    ['wifi','Wi-Fi',['Connected successfully','Could not connect']],
    ['food','Own food',['Allowed','Prohibited']],
    ['drink','Own drink',['Allowed','Prohibited']],
    ['return','Would you return?',['Yes','Maybe','No']]
  ];
  const comfortChoices=new Map(comfortQuestions.map(([key,,choices])=>[key,choices]));
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  function fields(value,required,optional=[]) {
    return object(value) && required.every(key=>own(value,key)) &&
      Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
  }
  // PostgreSQL UTF-8 text/jsonb cannot hold NUL or unpaired UTF-16 surrogates.
  const pgText=value=>typeof value==='string' && !/[\u0000\uD800-\uDFFF]/u.test(value);
  // The disposable database is initialized with LC_CTYPE=C, so match its
  // [^[:space:]] predicate rather than silently changing the database contract.
  const nonblank=value=>pgText(value) && /[^\t\n\v\f\r ]/.test(value);
  const safeIndex=value=>Number.isSafeInteger(value) && value>=0;
  const occurrenceIndex=value=>safeIndex(value) && value<=2147483647;
  const uuid=value=>typeof value==='string' && value.length===36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  function validDate(value) {
    if (typeof value!=='string' || value.length!==10 || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10)===value;
  }
  function validRef(ref) {
    return ref===null || (fields(ref,['type','id']) && nonblank(ref.type) &&
      (nonblank(ref.id)||safeIndex(ref.id)));
  }
  function validObservation(observation) {
    return fields(observation,['space','date','outcome','note','spend_yen'],['comfort_answers']) &&
      nonblank(observation.space) && outcomes.includes(observation.outcome) && validDate(observation.date) &&
      (observation.note===null || pgText(observation.note)) &&
      (observation.outcome!=='Personally reviewed' || nonblank(observation.note)) &&
      (observation.spend_yen===null || safeIndex(observation.spend_yen));
  }
  function validComfort(observation) {
    if (!own(observation,'comfort_answers')) return true;
    return observation.outcome==='Personally reviewed' && object(observation.comfort_answers) &&
      Object.entries(observation.comfort_answers).every(([key,value])=>
        comfortChoices.has(key) && (value===null || comfortChoices.get(key).includes(value)));
  }
  // UUID case and JSON member order do not change PostgreSQL identity.
  // Keep the original proposal for evidence/display; normalize only comparison keys.
  function signature(proposal) {
    const normalized={...proposal,source:{...proposal.source,trip_id:proposal.source.trip_id.toLowerCase()}};
    return JSON.stringify(normalized,(_,item)=>object(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
  }
  function validateDraft(data) {
    if (!fields(data,['format','version','status','proposals']) || data.format!=='setu_place_update_draft' ||
        data.version!==1 || data.status!=='draft' || !Array.isArray(data.proposals) || !data.proposals.length) {
      throw Error('Choose a version 1 place update draft.');
    }
    const rows=new Map();
    for (const proposal of data.proposals) {
      const source=proposal?.source, observation=proposal?.observation;
      if (!fields(proposal,['source','stop_name','place_ref','observation']) ||
          !fields(source,['trip_id','stop_index','observation_index']) || !uuid(source.trip_id) ||
          !occurrenceIndex(source.stop_index) || !occurrenceIndex(source.observation_index) ||
          !nonblank(proposal.stop_name) || !validRef(proposal.place_ref) || !validObservation(observation)) {
        throw Error('Invalid observation or source reference in the draft.');
      }
      if (!validComfort(observation)) throw Error('Invalid comfort answers in the draft.');
      const key=JSON.stringify([source.trip_id.toLowerCase(),source.stop_index,source.observation_index]);
      const signed=signature(proposal), previous=rows.get(key);
      if (previous) {
        if (previous.signature!==signed) throw Error('Conflicting proposals for the same source. Review the original draft.');
        previous.copies++;
      } else rows.set(key,{proposal,signature:signed,copies:1});
    }
    return rows;
  }
  const api={outcomes,comfortQuestions,validateDraft,signature};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.SetuTripDraftValidation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
