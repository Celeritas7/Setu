// LIVE_NEXT_FIVE_START — Phase L1, pure, browser/Node-testable; no network or writes.
const nextFiveJapanClock = (at = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Tokyo', weekday:'short', year:'numeric', month:'2-digit',
    day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(at).filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
  return { weekday:String(parts.weekday || '').toLowerCase(), minute:Number(parts.hour)*60+Number(parts.minute),
    date:[parts.year,parts.month,parts.day].join('-'), time:parts.hour+':'+parts.minute };
};
const nextFiveHHMM = value => {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m || Number(m[1]) > 30) return null;
  return Number(m[1])*60+Number(m[2]);
};
const nextFiveHours = (hours, clock, minVisit) => {
  const days = ['sun','mon','tue','wed','thu','fri','sat'], di=days.indexOf(clock.weekday);
  if (!hours || typeof hours !== 'object' || di < 0) return {status:'unknown',text:'Hours unknown'};
  const today=hours[clock.weekday], yesterday=hours[days[(di+6)%7]];
  const intervals=[];
  if (Array.isArray(yesterday)) yesterday.forEach(p => {
    if (Array.isArray(p)) {
      const o=p[0]==null ? 0 : nextFiveHHMM(p[0]), c=nextFiveHHMM(p[1]);
      if (o != null && c != null && c>1440) intervals.push([o-1440,c-1440]);
    }
  });
  if (Array.isArray(today)) today.forEach(p => {
    if (Array.isArray(p)) {
      const o=p[0]==null ? 0 : nextFiveHHMM(p[0]), c=nextFiveHHMM(p[1]);
      if (o != null && c != null && c>o) intervals.push([o,c]);
    }
  });
  const current=intervals.filter(p => clock.minute >= p[0] && clock.minute < p[1]).sort((a,b)=>b[1]-a[1])[0];
  if (current) {
    const left=current[1]-clock.minute;
    if (left < minVisit+10) return {status:'too_short',minutesLeft:left,text:'Only '+left+' min until regular closing'};
    const h=(current[1] % 1440), label=String(Math.floor(h/60)).padStart(2,'0')+':'+String(h%60).padStart(2,'0');
    return {status:'regular_open',minutesLeft:left,text:'Regular hours until '+label+' · '+left+' min left'};
  }
  if (!Array.isArray(today)) return {status:'unknown',text:'Today’s hours unknown'};
  return {status:'closed',text:today.length ? 'Outside recorded hours' : 'Recorded closed today'};
};
const nextFivePrice = row => {
  const amount=v => (typeof v==='number' && Number.isInteger(v) && v>=0) ? v : null;
  const spend=amount(row.spend), minimum=amount(row.min_order_yen ?? row.minOrderYen);
  if (spend != null) return {known:spend,text:'Recorded visit budget ¥'+spend.toLocaleString('ja-JP')+' (not an admission quote)'};
  if (minimum != null) return {known:null,text:'Minimum order ¥'+minimum.toLocaleString('ja-JP')+' recorded; total cost unknown'};
  return {known:null,text:'Price unknown — not free'};
};
const nextFiveTagged = (row,needle) => (row.themes || []).some(t => String(t).toLowerCase().includes(needle));
const nextFiveCategory = row => row._t==='food' ? 'food' :
  (nextFiveTagged(row,'sit-long') ? 'rest' : (nextFiveTagged(row,'park') || nextFiveTagged(row,'garden') || nextFiveTagged(row,'nature') ? 'nature' : 'other'));
const nextFiveRank = (rows, options={}) => {
  const anchor=options.anchor, clock=nextFiveJapanClock(options.now || new Date());
  if (!anchor || !Number.isFinite(Number(anchor.lat)) || !Number.isFinite(Number(anchor.lng)))
    return {rows:[],reason:'Choose a saved area or use Near me for a real distance anchor. No safety ranking for all-Japan browsing.',clock};
  const mood=['balanced','quiet','nature','budget'].includes(options.mood) ? options.mood : 'balanced';
  const rainy=options.rainy===true;
  const limit=typeof options.budget==='number' && Number.isFinite(options.budget) && options.budget>=0 ? options.budget : null;
  const evaluated=(rows || []).flatMap(row => {
    const km=Number(row.distanceKm);
    if (!Number.isFinite(km) || km < 0 || km > 3 || row.status==='skip' || row.deleted_at) return [];
    const category=nextFiveCategory(row), duration=category==='food' ? 45 : category==='rest' ? 45 : 25;
    // Straight-line at 80 m/min is an optimistic lower bound, NOT a walking itinerary.
    // Use it only to eliminate destinations that cannot fit even this lower bound.
    const travelLowerBound=Math.ceil(km*1000/80);
    const hrs=nextFiveHours(row.hours,clock,duration+travelLowerBound), price=nextFivePrice(row);
    if (hrs.status==='closed' || hrs.status==='too_short') return [];
    if (limit!=null && price.known!=null && price.known>limit) return [];
    const shelter=row.setting==='indoor'||nextFiveTagged(row,'rain-ok');
    const quiet=Number.isInteger(row.quiet) && row.quiet>=1 && row.quiet<=3 ? row.quiet : null;
    const remote=km>1.5;
    let score=km*20+(hrs.status==='unknown'?15:0)+(price.known==null?9:Math.min(price.known/250,14))+
      (rainy && !shelter ? 24 : 0)+(remote?4:0);
    if (mood==='quiet') score += quiet==null?12:(3-quiet)*8-16;
    if (mood==='nature') score += category==='nature'?-22:8;
    if (mood==='budget') score += price.known==null?14:Math.min(price.known/120,30);
    if (mood==='balanced') score += category==='rest'?-5:0;
    const next = {...row,_next:{
      price:price.text, hours:hrs.text+' · holiday/temporary closures not checked',
      travel:km.toFixed(1)+' km straight-line · walk route/time unverified (minimum '+travelLowerBound+' min geometric lower bound)',
      reason:(category==='nature'?'Nature option':category==='rest'?'Possible rest stop':category==='food'?'Food option':'Saved place')+
        (rainy?(shelter?' · shelter recorded':' · rain protection unknown'):'')+
        (mood==='quiet'?(quiet==null?' · quietness unknown':' · recorded quiet '+quiet+'/3'):''),
      risk:remote?'Return and pedestrian access UNVERIFIED; do not rely on a remote bus or walk':'Return UNVERIFIED; check walking route and onward services',
      category,score,shelter,quiet
    }};
    return [next];
  });
  const remaining=evaluated.sort((a,b)=>a._next.score-b._next.score || a.name.localeCompare(b.name));
  const chosen=[], cats=new Map();
  while (remaining.length && chosen.length<5) {
    let bestIndex=0, best=Infinity;
    for(let i=0;i<remaining.length;i++){
      const x=remaining[i], adjusted=x._next.score+ (cats.get(x._next.category)||0)*10;
      if(adjusted<best){best=adjusted;bestIndex=i;}
    }
    const x=remaining.splice(bestIndex,1)[0];
    cats.set(x._next.category,(cats.get(x._next.category)||0)+1);
    chosen.push(x);
  }
  return {rows:chosen,clock,reason:chosen.length?'':(limit!=null?'No eligible nearby options within this recorded budget / hours window. Unknown costs are not assumed free.':'No eligible pinned options within 3 km of this anchor at the recorded regular hours.')};
};
// LIVE_NEXT_FIVE_END
