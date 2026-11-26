(async function () {
  'use strict';
  const el=id=>document.getElementById(id);
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'});
  const status=el('status'), form=el('edit'), input=el('stop');
  let store, record, busy=false;
  const history=()=>record?.payload || [];
  const active=()=>history().at(-1)?.state==='active';
  let pending=null;
  if (location.hash==='#outing') {
    try {
      const data=JSON.parse(sessionStorage.getItem('setu.session-outing'));
      if (data && Array.isArray(data.stops) && data.stops.every(stop=>typeof stop?.name==='string')) pending=data;
    } catch (_) { /* Manual start remains available. */ }
  }
  const choice=el('planned-choice');
  function renderPlan(trip) {
    const plan=trip?.outing || (!trip && pending);
    el('plan').hidden=!plan;el('choice').hidden=!plan || !trip;
    choice.replaceChildren(new Option('Unplanned stop / detour',''));
    el('planned').replaceChildren();
    if (!plan) return;
    el('plan-title').textContent=plan.title+' · '+plan.date;
    plan.stops.forEach((stop,index)=>{
      const recorded=trip?.stops.some(entry=>entry.planIndex===index);
      const item=document.createElement('li');
      item.textContent=stop.name+' · '+(recorded?'Recorded':stop.unavailable?'Unavailable':'Planned');
      el('planned').append(item);
      if (!recorded && !stop.unavailable) choice.add(new Option(stop.name,String(index)));
    });
    choice.value='';
  }
  const locate=el('locate'), locationResult=el('location-result');
  let locationWatch=null, requestNumber=0;
  function clearLocation(message='') {
    requestNumber++;
    if (locationWatch!==null) navigator.geolocation.clearWatch(locationWatch);
    locationWatch=null;
    locate.disabled=false;
    locationResult.textContent=message;
  }
  locate.onclick=()=>{
    if (!active() || document.hidden || locationWatch!==null) return;
    const fallback='You can still record a stop manually.';
    if (!navigator.geolocation) {
      clearLocation('Location is unavailable. '+fallback);
      return;
    }
    const request=++requestNumber;
    locate.disabled=true;
    locationResult.textContent='Checking location…';
    function complete(message) {
      if (request===requestNumber) clearLocation(document.hidden?'':message);
    }
    try {
      locationWatch=navigator.geolocation.watchPosition(position=>{
        const {latitude,longitude,accuracy}=position.coords;
        complete(latitude.toFixed(5)+', '+longitude.toFixed(5)+' · accuracy about '+
          Math.ceil(accuracy)+' m · '+clock.format(new Date(position.timestamp))+' JST');
      },error=>{
        const reason=error.code===1?'Location permission denied.':error.code===3?'Location check timed out.':'Location is unavailable.';
        complete(reason+' '+fallback);
      },{maximumAge:0,timeout:10000});
    } catch (_) { complete('Location is unavailable. '+fallback); }
  };
  document.addEventListener('visibilitychange',()=>{if (document.hidden) clearLocation();});
  window.addEventListener('pagehide',()=>clearLocation());
  const dialog=el('observation'), observationForm=el('observation-form');
  const japanDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
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
  const comfortDetails=el('comfort-details');
  for (const [key,label,options] of comfortQuestions) {
    const control=document.createElement('select'), wrapper=document.createElement('label');
    control.name=key;
    control.id='comfort-'+key;
    wrapper.htmlFor=control.id;
    control.add(new Option('Unknown',''));
    for (const option of options) control.add(new Option(option,option));
    wrapper.textContent=label;
    el('comfort-questions').append(wrapper,control);
  }
  function updateComfortQuestions() {
    comfortDetails.hidden=el('outcome').value!=='Personally reviewed';
    if (comfortDetails.hidden) {
      comfortDetails.open=false;
      for (const [key] of comfortQuestions) observationForm.elements.namedItem(key).value='';
    }
  }
  el('outcome').addEventListener('change',updateComfortQuestions);
  let selectedTripId, selectedStopIndex;
  function openObservation(trip,index) {
    if (busy) return;
    selectedTripId=trip.id;
    selectedStopIndex=index;
    observationForm.reset();
    updateComfortQuestions();
    el('observation-title').textContent='Observation for '+trip.stops[index].name;
    el('space').value=trip.stops[index].name;
    el('observed').value=japanDate.format(new Date(trip.stops[index].at));
    el('observed').max=japanDate.format(new Date());
    el('observation-status').textContent='';
    dialog.showModal();
  }
  el('cancel-observation').onclick=()=>dialog.close();
  dialog.oncancel=event=>{if (busy) event.preventDefault();};
  observationForm.onsubmit=async event=>{
    event.preventDefault();
    if (busy) return;
    const space=el('space').value.trim(), outcome=el('outcome').value, note=el('note').value.trim();
    const feedback=el('observation-status');
    if (!space || (outcome==='Personally reviewed' && !note)) {
      feedback.textContent=space?'Describe what you personally experienced.':'Enter a place or room.';
      (space?el('note'):el('space')).focus();
      return;
    }
    const observation={space,outcome,date:el('observed').value,note:note||null,
      spend_yen:el('spend').value===''?null:el('spend').valueAsNumber};
    if (outcome==='Personally reviewed') {
      observation.comfort_answers=Object.fromEntries(comfortQuestions.map(([key])=>
        [key,observationForm.elements.namedItem(key).value || null]));
    }
    const trips=history().slice(), index=trips.findIndex(trip=>trip.id===selectedTripId);
    const trip=trips[index], stop=trip?.stops[selectedStopIndex];
    if (!stop) { feedback.textContent='This stop is no longer available.';return; }
    const stops=trip.stops.slice();
    stops[selectedStopIndex]={...stop,observations:[...(stop.observations||[]),observation]};
    trips[index]={...trip,stops};
    busy=true;
    el('save-observation').disabled=el('cancel-observation').disabled=true;
    try {
      record=await store.write('trips',record.rev,trips);
      dialog.close();
      render();
      status.textContent+=' Observation saved.';
    } catch(error) {
      feedback.textContent='Observation could not be saved. Your entries are still here.';
      if (error.code==='CONFLICT') {
        try {
          record=await store.read('trips');
          render();
          feedback.textContent='Another tab changed the history. Cancel to review it or save this observation to the same stop.';
        } catch (_) { feedback.textContent='Reopen trip sessions to load the latest history.'; }
      }
    } finally {
      busy=false;
      el('save-observation').disabled=el('cancel-observation').disabled=false;
    }
  };
  const noteFields=['transport','recovery','future'];
  let notesTripId=null;
  function tripReport(trip) {
    const recordedIndices=new Set(trip.stops.map(stop=>stop.planIndex));
    const planned=trip.outing?.stops.map((stop,index)=>({
      ...stop,recorded:recordedIndices.has(index)
    })) ?? null;
    let knownYen=0n, knownEntries=0, unknownEntries=0, stopsWithoutObservations=0;
    for (const stop of trip.stops) {
      if (!stop.observations?.length) stopsWithoutObservations++;
      for (const observation of stop.observations||[]) {
        if (Number.isSafeInteger(observation.spend_yen) && observation.spend_yen>=0) {
          knownYen+=BigInt(observation.spend_yen);
          knownEntries++;
        } else unknownEntries++;
      }
    }
    return {
      format:'setu_trip_report',version:1,trip_id:trip.id,started_at:trip.started_at,
      finished_at:trip.finished_at,outing:trip.outing||null,planned,recorded_stops:trip.stops,
      spending:{known_yen:knownEntries?knownYen.toString():null,known_entries:knownEntries,
        unknown_entries:unknownEntries,stops_without_observations:stopsWithoutObservations},
      notes:trip.report_notes||{}
    };
  }
  function reportPanel(trip) {
    const report=tripReport(trip), panel=document.createElement('details');
    function line(tag,text) {
      const node=document.createElement(tag);
      node.textContent=text;
      panel.append(node);
      return node;
    }
    line('summary','Planned vs recorded · trip report');
    if (report.outing) line('h4',report.outing.title+' · '+report.outing.date);
    if (report.planned?.length) {
      const list=line('ol','');
      for (const stop of report.planned) {
        const row=document.createElement('li');
        row.textContent=stop.name+' · '+(stop.recorded?'Recorded':'Not recorded')+(stop.unavailable?' · Unavailable in plan':'');
        list.append(row);
      }
    } else line('p',report.outing?'Outing has no planned stops.':'No saved outing for this trip.');
    line('h4','Recorded order');
    const order=line('ol','');
    for (const stop of report.recorded_stops) {
      const row=document.createElement('li');
      row.textContent=clock.format(new Date(stop.at))+' · '+stop.name+(stop.kind==='detour'?' · Detour':'');
      order.append(row);
    }
    const spend=report.spending;
    line('p',spend.known_yen===null?'No spending amount recorded.':'Sum of recorded spending entries: ¥'+spend.known_yen);
    line('p','Unknown spending entries: '+spend.unknown_entries+' · Stops without observations: '+spend.stops_without_observations);
    for (const [key,label] of [['transport','Transport issues'],['recovery','Detours and recovery'],['future','Next time']]) {
      line('p',label+' · '+(report.notes[key]||'Not recorded'));
    }
    const download=line('button','Export this trip report');
    download.type='button';
    download.onclick=()=>downloadJSON(report,'setu-trip-report-'+trip.id+'.json');
    if (trip.stops.some(stop=>stop.observations?.length)) {
      const draft=document.createElement('details'), title=document.createElement('summary');
      title.textContent='Prepare place update draft';
      draft.append(title);
      draft.addEventListener('toggle',()=>{
        if (draft.open && draft.childElementCount===1) buildDraftChoices(draft,trip);
      });
      panel.append(draft);
    }
    return panel;
  }
  function buildDraftChoices(panel,trip) {
    const help=document.createElement('p'), download=document.createElement('button');
    help.textContent='Choose observations to include in a local draft for later review. Each checkbox includes the details shown below it.';
    download.type='button';
    download.textContent='Export selected observations as draft';
    download.disabled=true;
    panel.append(help);
    const selected=new Set();
    for (const [stopIndex,stop] of trip.stops.entries()) {
      const planned=trip.outing?.stops[stop.planIndex];
      const placeRef=planned?.type && planned.id!=null ? {type:planned.type,id:planned.id} : null;
      for (const [observationIndex,observation] of (stop.observations||[]).entries()) {
        const proposal={
          source:{trip_id:trip.id,stop_index:stopIndex,observation_index:observationIndex},
          stop_name:stop.name,place_ref:placeRef,observation
        };
        const label=document.createElement('label'), check=document.createElement('input');
        label.className='check-label';
        check.type='checkbox';
        label.append(check,document.createTextNode([stop.name,observation.space,observation.outcome,observation.date].join(' · ')));
        const detail=document.createElement('p');
        const facts=[placeRef?'Saved place '+placeRef.type+' '+placeRef.id:'Place match needed',
          observation.note,observation.spend_yen==null?'Spending unknown':'¥'+observation.spend_yen];
        for (const [key,question] of comfortQuestions) {
          if (observation.comfort_answers?.[key]) facts.push(question+' · '+observation.comfort_answers[key]);
        }
        detail.textContent=facts.filter(Boolean).join(' · ');
        panel.append(label,detail);
        check.onchange=()=>{
          if (check.checked) selected.add(proposal);
          else selected.delete(proposal);
          download.disabled=selected.size===0;
        };
      }
    }
    download.onclick=()=>{
      if (selected.size) downloadJSON({format:'setu_place_update_draft',version:1,status:'draft',
        proposals:Array.from(selected)},'setu-place-update-draft-'+trip.id+'.json');
    };
    panel.append(download);
  }
  function render() {
    clearLocation();
    el('location-check').hidden=!active();
    const trips=history();
    const tripId=active()?trips.at(-1).id:null;
    el('wrap-up').hidden=!active();
    if (notesTripId!==tripId) {
      for (const key of noteFields) el(key).value='';
      el('wrap-up').open=false;
      notesTripId=tripId;
    }
    renderPlan(active()?trips.at(-1):null);
    input.disabled=false;
    form.hidden=false;el('finish').hidden=!active();el('log').hidden=!trips.length;
    el('label').textContent=active()?'New current stop':'Starting place';
    el('submit').textContent=active()?'Record stop':'Start trip';
    status.textContent=active()?'Current stop: '+trips.at(-1).stops.at(-1).name:'No active trip.';
    if (active() && pending) status.textContent+=' Finish this trip before starting the selected outing.';
    el('trips').replaceChildren();
    for (const trip of trips.slice().reverse()) {
      const heading=document.createElement('h3'), list=document.createElement('ol');
      heading.textContent=trip.stops[0].name+' · '+trip.state;
      for (const [index,stop] of trip.stops.entries()) {
        const item=document.createElement('li');
        item.textContent=clock.format(new Date(stop.at))+' · '+stop.name+(stop.kind==='detour'?' · Detour':'');
        for (const observation of stop.observations||[]) {
          const detail=document.createElement('p');
          detail.textContent=[observation.space,observation.outcome,observation.date,
            observation.spend_yen===null?'Spending unknown':'¥'+observation.spend_yen,
            observation.note].filter(Boolean).join(' · ');
          item.append(detail);
          if (observation.comfort_answers) {
            const answers=document.createElement('ul');
            for (const [key,label] of comfortQuestions) {
              const answer=observation.comfort_answers[key];
              if (!answer) continue;
              const line=document.createElement('li');
              line.textContent=label+' · '+answer;
              answers.append(line);
            }
            if (answers.childElementCount) item.append(answers);
          }
        }
        const add=document.createElement('button');
        add.type='button';
        add.textContent='Add observation';
        add.setAttribute('aria-label','Add observation for '+stop.name);
        add.onclick=()=>openObservation(trip,index);
        item.append(' ',add);
        list.append(item);
      }
      el('trips').append(heading,list);
      if (trip.state==='completed') el('trips').append(reportPanel(trip));
    }
  }
  async function save(finish) {
    if (busy) return;
    const plannedIndex=active() && choice.value!==''?Number(choice.value):null;
    const name=plannedIndex===null?input.value.trim():history().at(-1).outing.stops[plannedIndex].name;
    if (!finish && !name) {status.textContent='Enter a place name.';return;}
    busy=true;el('submit').disabled=el('finish').disabled=true;
    try {
      const trips=history().slice(), now=new Date().toISOString(), stop={name,at:now};
      if (active()) {
        const last=trips.at(-1);
        if (last.outing && !finish) {
          stop.kind=plannedIndex===null?'detour':'planned';
          if (plannedIndex!==null) stop.planIndex=plannedIndex;
        }
        if (finish) {
          const notes=Object.fromEntries(noteFields.map(key=>[key,el(key).value.trim()||null]));
          trips[trips.length-1]={...last,state:'completed',finished_at:now,report_notes:notes};
        } else trips[trips.length-1]={...last,stops:[...last.stops,stop]};
      } else if (!finish) trips.push({id:crypto.randomUUID(),state:'active',started_at:now,stops:[stop],...(pending?{outing:pending}:{})});
      else return;
      record=await store.write('trips',record?.rev || 0,trips);
      if (pending && trips.at(-1).outing===pending) {
        pending=null;sessionStorage.removeItem('setu.session-outing');
      }
      input.value='';render();
    } catch(error) {
      if (error.code==='CONFLICT') {
        try {record=await store.read('trips');render();status.textContent+=' Another tab changed the history. Review it before retrying.';}
        catch (_) {status.textContent='Reopen trip sessions to load the latest history.';}
      } else status.textContent='Trip could not be saved: '+error.message;
    } finally {busy=false;el('submit').disabled=el('finish').disabled=false;}
  }
  try {
    store=await SetuResearchStorage.open(undefined,'setu-trip-sessions-v1');
    record=await store.read('trips');render();
  } catch(error) {status.textContent='Trip storage unavailable: '+error.message;return;}
  choice.onchange=()=>{input.disabled=choice.value!=='';};
  form.onsubmit=event=>{event.preventDefault();void save(false);};
  el('finish').onclick=()=>save(true);
  function downloadJSON(data,filename) {
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  el('export').onclick=()=>downloadJSON({format:'setu_trip_history',version:1,trips:history()},'setu-trip-history.json');
})();
