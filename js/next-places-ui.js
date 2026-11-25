/* Native, read-only dialog. No GPS request, persistence, auth client or automatic trip. */
(function (root) {
  'use strict';
  let current;
  function open(options) {
    current?.();
    const doc=root.document, initial=options.getData(), owner=initial.scope;
    const dialog=doc.createElement('dialog');dialog.className='next-places';dialog.setAttribute('aria-labelledby','np-title');
    const node=(tag,value,className)=>{const x=doc.createElement(tag);if(value!==undefined)x.textContent=value;if(className)x.className=className;return x;};
    const button=(label,action,style)=>{const b=node('button',label,style);b.type='button';b.addEventListener('click',action);return b;};
    const heading=node('header'), title=node('h2','Next places · Preview');title.id='np-title';
    let unsubscribe,closed=false;const cleanup=()=>{if(closed)return;closed=true;unsubscribe?.();root.removeEventListener('focus',scopeChanged);dialog.remove();if(current===cleanup)current=null;options.onClose?.();};
    const close=()=>{dialog.close();cleanup();};
    heading.append(title,button('Close',close));dialog.append(heading,node('p','Choose a starting point and compare up to five places at a time. This does not start a trip or change your plan.'));
    dialog.append(node('p','Route and return are unverified for every preview. Check access and transport before deciding to go; there is no verified leave-by time.','np-notice'));
    const form=node('form');let grid=node('div',undefined,'np-grid');form.append(grid);dialog.append(form);
    function input(label,id,type='text',value='') {const wrap=node('label',label),field=node('input');field.id=id;field.type=type;field.value=value;wrap.htmlFor=id;wrap.append(field);grid.append(wrap);return field;}
    function select(label,id,values,selected) {const wrap=node('label',label),field=node('select');field.id=id;wrap.htmlFor=id;for(const [value,name] of values){const item=node('option',name);item.value=value;field.append(item);}field.value=selected ?? values[0]?.[0] ?? '';wrap.append(field);grid.append(wrap);return field;}
    const origin=select('Current stop or station hub','np-origin',[['','Choose a starting point'],...initial.data.hubs.map(x=>[x.key,x.name]),...initial.data.records.map(x=>[x.key,x.name])],options.origin || '');
    const area=select('Area','np-area',[['','All saved areas'],...initial.data.hubs.map(x=>[String(x.hubId),x.name])],options.hubId || '');
    const settings=node('details');settings.id='np-settings';settings.open=root.matchMedia?.('(min-width: 600px)')?.matches ?? true;
    settings.append(node('summary','Time, budget & weather'));grid=node('div',undefined,'np-grid');settings.append(grid);form.append(settings);
    const date=input('Date for this check (optional)','np-date','date'), time=input('Start time · Japan','np-time','time','12:00');
    const stay=select('Planned stay','np-stay',[[20,'20 minutes'],[30,'30 minutes'],[60,'60 minutes'],[90,'90 minutes']],30);
    const budget=input('Budget for this stop (¥, optional)','np-budget','number');budget.min='0';budget.step='1';
    const radius=select('Straight-line search distance','np-radius',[[1,'1 km'],[3,'3 km'],[5,'5 km'],[10,'10 km'],[25,'25 km']],3);
    const weather=select('Weather to plan for','np-weather',[['unknown','Unknown'],['dry','Dry (your selection)'],['rain','Rain (your selection)']]);
    function check(label,id) {const wrap=node('label',undefined,'np-check'),field=node('input');field.id=id;field.type='checkbox';field.checked=true;wrap.append(field,node('span',label));grid.append(wrap);return field;}
    const quiet=check('Prefer quieter places','np-quiet'), rest=check('Prefer a place to rest','np-rest');
    const actions=node('div',undefined,'np-actions');form.append(actions);
    actions.append(button('Use today & now',()=>{const parts=options.helpers.japan(new Date());date.value=parts.key;time.value=parts.clock;render();}));
    const update=node('button','Update preview','np-primary');update.type='submit';actions.append(update);
    const status=node('p',undefined,'np-muted');status.id='np-status';status.setAttribute('role','status');dialog.append(status);
    const controls=node('div',undefined,'np-grid');dialog.append(controls);
    const modeWrap=node('label','Show'), mode=node('select');mode.id='np-mode';for(const [value,label] of [['top','Top five to check'],['all','All matching candidates'],['excluded','Excluded by these checks']]){const item=node('option',label);item.value=value;mode.append(item);}modeWrap.append(mode);controls.append(modeWrap);
    const results=node('section');results.id='np-results';results.setAttribute('aria-label','Next-place preview');dialog.append(results);
    const paging=node('div',undefined,'np-actions');dialog.append(paging);
    const foot=node('p','Saved records can be incomplete. Estimates are not route directions, quotes, holiday confirmations or personally verified experiences.','np-muted');dialog.append(foot);
    if(options.browse)dialog.append(button('Browse saved places on the map',()=>{close();options.browse();}));
    let page=0;
    function scopeChanged(){if(options.getData().scope!==owner)close();}
    function query(){return {origin:origin.value,hubId:area.value,date:date.value,time:time.value,visitMin:Number(stay.value),budget:budget.value,radiusKm:Number(radius.value),weather:weather.value,quiet:quiet.checked,rest:rest.checked};}
    function invalidate(){status.className='np-muted';status.textContent='Settings changed. Update preview to apply these checks.';results.replaceChildren();paging.replaceChildren();page=0;}
    function card(row) {
      const article=node('article'), h=node('h3',row.name);article.append(node('p',[row.kind,row.hubName,row.dayOff?'DAY OFF':''].filter(Boolean).join(' · '),'np-muted'),h,node('span','Needs route & return check','np-badge'));
      article.append(node('p',row.address || 'Address unknown'),node('p',row.distanceKm===null?'Distance unknown — not established as nearby':row.distanceKm.toFixed(2)+' km straight-line · ~'+row.travelMin+' min walking estimate'));
      article.append(node('p',row.visitMin+' min planned stay · '+row.hoursText),node('p',row.costText+' · '+row.minimumText),node('p','These are separate recorded amounts; neither establishes a complete visit total.','np-muted'));
      if(row.arrival){const arrival=options.helpers.japan(row.arrival),closing=row.closesAt?options.helpers.japan(row.closesAt):null;article.append(node('p','Estimated arrival '+arrival.key+' '+arrival.clock+' JST'+(closing?' · recorded regular closing '+closing.key+' '+closing.clock+' JST':''),'np-muted'));}
      article.append(node('p',row.shelterText+' · '+row.quietText),node('p',row.excluded.length?'Excluded: '+row.excluded.join('; '):'Why shown: '+row.reasons.join('; ')));
      const maps=node('a','Open place in Google Maps ↗','np-link');maps.href=row.maps;maps.target='_blank';maps.rel='noopener noreferrer';article.append(maps);
      const facts=node('details');facts.append(node('summary','Recorded facts, sources & checks'),node('p','Hours: '+row.hoursEvidence),node('p','Visit estimate: '+row.priceEvidence),node('p','Minimum order needs a current price/policy check.'),node('p','Place facts: '+row.confidence+' · '+(row.checked || 'checked date unknown')));
      if(row.source){const source=node('a','Recorded source ↗');source.href=row.source;source.target='_blank';source.rel='noopener noreferrer';facts.append(source);}
      const warnings=node('ul');for(const warning of row.warnings)warnings.append(node('li',warning));facts.append(warnings);article.append(facts);return article;
    }
    function render() {
      const snapshot=options.getData();if(snapshot.scope!==owner){close();return;}
      if(snapshot.loading){status.textContent=snapshot.message;results.replaceChildren();paging.replaceChildren();return;}
      const setChoices=(field,items)=>{const selected=field.value;field.replaceChildren();for(const [value,label] of items){const item=node('option',label);item.value=value;field.append(item);}field.value=selected;};
      setChoices(origin,[['','Choose a starting point'],...snapshot.data.hubs.map(x=>[x.key,x.name]),...snapshot.data.records.map(x=>[x.key,x.name])]);
      setChoices(area,[['','All saved areas'],...snapshot.data.hubs.map(x=>[String(x.hubId),x.name])]);
      const model=root.SetuNextPlaces.rank(snapshot.data,query(),options.helpers), view=mode.value;
      const rows=view==='excluded'?model.excluded:view==='all'?model.rows:model.rows.slice(0,5);
      page=Math.min(page,Math.max(0,Math.ceil(rows.length/5)-1));results.replaceChildren();paging.replaceChildren();
      status.className=model.errors.length?'np-error':'np-muted';
      status.textContent=model.errors.length?model.errors.join(' '):model.total+' candidates need checks · '+model.excluded.length+' excluded · return unverified'+(snapshot.message?' · '+snapshot.message:'');
      if(!model.errors.length) {
        for(const row of rows.slice(page*5,page*5+5))results.append(card(row));
        if(!rows.length)results.append(node('p',view==='excluded'?'No places were excluded by these checks.':'No places fit these checks. Change the area, budget or time; no extra places are invented.','np-empty'));
      }
      const previous=button('← Previous',()=>{page--;render();}),next=button('Next →',()=>{page++;render();});previous.disabled=page===0;next.disabled=(page+1)*5>=rows.length;
      paging.append(previous,node('span',rows.length?(page*5+1)+'–'+Math.min((page+1)*5,rows.length)+' of '+rows.length:'0 places'),next);
    }
    form.addEventListener('submit',event=>{event.preventDefault();page=0;render();});
    form.addEventListener('input',invalidate);
    form.addEventListener('invalid',()=>{invalidate();status.className='np-error';status.textContent='Correct the highlighted setting before updating.';},true);
    origin.addEventListener('change',()=>{const data=options.getData().data,start=[...data.hubs,...data.records].find(x=>x.key===origin.value);area.value=start?.hubId?String(start.hubId):'';});
    mode.addEventListener('change',()=>{page=0;render();});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',cleanup);doc.body.append(dialog);current=cleanup;dialog.showModal();
    root.addEventListener('focus',scopeChanged);unsubscribe=options.subscribe?.(scopeChanged);if(closed){unsubscribe?.();return {close};}render();origin.focus();
    return {close};
  }
  root.SetuNextPlacesUI={open};
})(globalThis);
