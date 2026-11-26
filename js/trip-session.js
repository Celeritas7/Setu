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
  function render() {
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
      for (const stop of trip.stops) {
        const item=document.createElement('li');
        item.textContent=clock.format(new Date(stop.at))+' · '+stop.name+(stop.kind==='detour'?' · Detour':'');
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
