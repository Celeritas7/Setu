(async function () {
  'use strict';
  const el=id=>document.getElementById(id);
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'});
  const status=el('status'), form=el('edit'), input=el('stop');
  let store, record, busy=false;
  const history=()=>record?.payload || [];
  const active=()=>history().at(-1)?.state==='active';
  function render() {
    const trips=history();
    form.hidden=false;el('finish').hidden=!active();el('log').hidden=!trips.length;
    el('label').textContent=active()?'New current stop':'Starting place';
    el('submit').textContent=active()?'Record stop':'Start trip';
    status.textContent=active()?'Current stop: '+trips.at(-1).stops.at(-1).name:'No active trip.';
    el('trips').replaceChildren();
    for (const trip of trips.slice().reverse()) {
      const heading=document.createElement('h3'), list=document.createElement('ol');
      heading.textContent=trip.stops[0].name+' · '+trip.state;
      for (const stop of trip.stops) {
        const item=document.createElement('li');
        item.textContent=clock.format(new Date(stop.at))+' · '+stop.name;
        list.append(item);
      }
      el('trips').append(heading,list);
    }
  }
  async function save(finish) {
    if (busy) return;
    const name=input.value.trim();
    if (!finish && !name) {status.textContent='Enter a place name.';return;}
    busy=true;el('submit').disabled=el('finish').disabled=true;
    try {
      const trips=history().slice(), now=new Date().toISOString(), stop={name,at:now};
      if (active()) {
        const last=trips.at(-1);
        trips[trips.length-1]=finish?{...last,state:'completed',finished_at:now}:{...last,stops:[...last.stops,stop]};
      } else if (!finish) trips.push({id:crypto.randomUUID(),state:'active',started_at:now,stops:[stop]});
      else return;
      record=await store.write('trips',record?.rev || 0,trips);
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
  form.onsubmit=event=>{event.preventDefault();void save(false);};
  el('finish').onclick=()=>save(true);
  el('export').onclick=()=>{
    const blob=new Blob([JSON.stringify({format:'setu_trip_history',version:1,trips:history()})],{type:'application/json'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='setu-trip-history.json';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
})();
