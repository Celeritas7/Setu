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
  let selectedTripId, selectedStopIndex;
  function openObservation(trip,index) {
    if (busy) return;
    selectedTripId=trip.id;
    selectedStopIndex=index;
    observationForm.reset();
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
  function render() {
    clearLocation();
    el('location-check').hidden=!active();
    const trips=history();
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
        trips[trips.length-1]=finish?{...last,state:'completed',finished_at:now}:{...last,stops:[...last.stops,stop]};
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
  el('export').onclick=()=>{
    const blob=new Blob([JSON.stringify({format:'setu_trip_history',version:1,trips:history()})],{type:'application/json'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='setu-trip-history.json';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
})();
