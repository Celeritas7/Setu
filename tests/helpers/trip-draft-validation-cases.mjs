// Shared version 1 cases for the actual local preview and owned PostgreSQL rehearsal.
// All identifiers and observations are fictional. No production account or place.
export const TRIP='abcdef12-3456-4789-8abc-def012345678';
export const OTHER_TRIP='fedcba98-7654-4321-8fed-cba987654321';
const entry=(index=0)=>({
  source:{trip_id:TRIP,stop_index:0,observation_index:index},
  stop_name:'図書館 🪴',
  place_ref:null,
  observation:{space:'Reading room',date:'2026-11-26',outcome:'Visited',note:null,spend_yen:null}
});
const envelope=(proposals=[entry()])=>({format:'setu_place_update_draft',version:1,status:'draft',proposals});
export function draftCases() {
  const cases=[];
  const valid=(name,data,distinct=data.proposals.length)=>cases.push({name,data,valid:true,distinct,identical:data.proposals.length-distinct});
  const invalid=(name,data)=>cases.push({name,data,valid:false});
  function alter(change) {const data=envelope();change(data.proposals[0],data);return data;}
  valid('unknown spending and unmatched place',envelope());
  valid('explicit zero and numeric zero place ID',alter(p=>{p.observation.spend_yen=0;p.place_ref={type:'spot',id:0};}));
  valid('maximum safe spending and numeric place ID',alter(p=>{p.observation.spend_yen=Number.MAX_SAFE_INTEGER;p.place_ref={type:'spot',id:Number.MAX_SAFE_INTEGER};}));
  valid('typed string place ID and nonempty note',alter(p=>{p.place_ref={type:'food',id:'fictional-restaurant'};p.observation.note='First-hand note';}));
  valid('maximum PostgreSQL occurrence indices',alter(p=>{p.source.stop_index=2147483647;p.source.observation_index=2147483647;}));
  valid('valid leap day with personal review and nullable comfort',alter(p=>Object.assign(p.observation,{date:'2024-02-29',outcome:'Personally reviewed',note:'Uncomfortable bench',spend_yen:0,comfort_answers:{comfort:'Uncomfortable',wifi:null,return:'No'}})));
  valid('personal review without optional comfort answers',alter(p=>Object.assign(p.observation,{outcome:'Personally reviewed',note:'Used the reading room'})));
  valid('personal review with empty optional comfort answers',alter(p=>Object.assign(p.observation,{outcome:'Personally reviewed',note:'Visited',comfort_answers:{}})));
  valid('nullable note may be an empty string for ordinary visit',alter(p=>{p.observation.note='';}));
  valid('four-digit calendar lower bound',alter(p=>{p.observation.date='0001-01-01';}));
  valid('four-digit calendar upper bound',alter(p=>{p.observation.date='9999-12-31';}));
  valid('case-insensitive UUID identity and JSON member order',envelope([entry(),{observation:entry().observation,place_ref:null,stop_name:entry().stop_name,source:{observation_index:0,stop_index:0,trip_id:TRIP.toUpperCase()}}]),1);
  valid('distinct occurrence keys and unknown versus zero spending',envelope([entry(),{...entry(1),observation:{...entry(1).observation,spend_yen:0}},{...entry(),source:{trip_id:OTHER_TRIP,stop_index:0,observation_index:0}}]));
  invalid('nonobject envelope',[]);
  invalid('wrong format',alter((p,d)=>{d.format='other';}));
  invalid('string version',alter((p,d)=>{d.version='1';}));
  invalid('wrong status',alter((p,d)=>{d.status='approved';}));
  invalid('unexpected envelope owner field',alter((p,d)=>{d.owner_id=OTHER_TRIP;}));
  invalid('missing envelope status',alter((p,d)=>{delete d.status;}));
  invalid('empty proposals',envelope([]));
  invalid('nonarray proposals',alter((p,d)=>{d.proposals={};}));
  invalid('null proposal',envelope([null]));
  invalid('unexpected proposal field',alter(p=>{p.accepted=true;}));
  invalid('missing place reference',alter(p=>{delete p.place_ref;}));
  invalid('nonobject source',alter(p=>{p.source=[];}));
  invalid('unexpected source owner field',alter(p=>{p.source.owner_id=OTHER_TRIP;}));
  invalid('missing observation occurrence',alter(p=>{delete p.source.observation_index;}));
  invalid('malformed trip ID',alter(p=>{p.source.trip_id='not-a-uuid';}));
  invalid('compact trip ID is not the version 1 representation',alter(p=>{p.source.trip_id=TRIP.replace(/-/g,'');}));
  invalid('trip ID with trailing whitespace',alter(p=>{p.source.trip_id=TRIP+' ';}));
  invalid('negative stop index',alter(p=>{p.source.stop_index=-1;}));
  invalid('fractional observation index',alter(p=>{p.source.observation_index=0.5;}));
  invalid('string stop index',alter(p=>{p.source.stop_index='0';}));
  invalid('stop index exceeds PostgreSQL integer',alter(p=>{p.source.stop_index=2147483648;}));
  invalid('observation index exceeds PostgreSQL integer',alter(p=>{p.source.observation_index=2147483648;}));
  invalid('blank stop name',alter(p=>{p.stop_name=' \t\n';}));
  invalid('nonstring stop name',alter(p=>{p.stop_name=42;}));
  invalid('missing observation',alter(p=>{delete p.observation;}));
  invalid('null observation',alter(p=>{p.observation=null;}));
  invalid('unexpected observation approval field',alter(p=>{p.observation.accepted=true;}));
  invalid('blank space',alter(p=>{p.observation.space='  ';}));
  invalid('unknown outcome',alter(p=>{p.observation.outcome='Confirmed';}));
  invalid('impossible calendar date',alter(p=>{p.observation.date='2026-02-29';}));
  invalid('year zero',alter(p=>{p.observation.date='0000-01-01';}));
  invalid('missing note',alter(p=>{delete p.observation.note;}));
  invalid('nonstring note',alter(p=>{p.observation.note=0;}));
  invalid('personal review requires a note',alter(p=>{p.observation.outcome='Personally reviewed';}));
  invalid('personal review requires a nonblank note',alter(p=>Object.assign(p.observation,{outcome:'Personally reviewed',note:' \t'})));
  invalid('missing spending',alter(p=>{delete p.observation.spend_yen;}));
  invalid('spending cannot be a string',alter(p=>{p.observation.spend_yen='0';}));
  invalid('negative spending',alter(p=>{p.observation.spend_yen=-1;}));
  invalid('fractional spending',alter(p=>{p.observation.spend_yen=0.5;}));
  invalid('unsafe spending integer',alter(p=>{p.observation.spend_yen=9007199254740992;}));
  invalid('comfort answers on ordinary visit',alter(p=>{p.observation.comfort_answers={noise:'Quiet'};}));
  invalid('null comfort object',alter(p=>Object.assign(p.observation,{outcome:'Personally reviewed',note:'Observed',comfort_answers:null})));
  invalid('array comfort object',alter(p=>Object.assign(p.observation,{outcome:'Personally reviewed',note:'Observed',comfort_answers:[]})));
  invalid('unknown comfort key',alter(p=>Object.assign(p.observation,{outcome:'Personally reviewed',note:'Observed',comfort_answers:{unexpected:null}})));
  invalid('unknown comfort value',alter(p=>Object.assign(p.observation,{outcome:'Personally reviewed',note:'Observed',comfort_answers:{noise:'Silent'}})));
  invalid('place reference missing ID',alter(p=>{p.place_ref={type:'spot'};}));
  invalid('place reference extra field',alter(p=>{p.place_ref={type:'spot',id:'a',accepted:true};}));
  invalid('blank place reference type',alter(p=>{p.place_ref={type:' ',id:'a'};}));
  invalid('negative place ID',alter(p=>{p.place_ref={type:'spot',id:-1};}));
  invalid('object place ID',alter(p=>{p.place_ref={type:'spot',id:{}};}));
  invalid('NUL is not PostgreSQL text',alter(p=>{p.observation.note='A\u0000B';}));
  invalid('unpaired surrogate is not PostgreSQL UTF-8',alter(p=>{p.observation.note='\uD800';}));
  invalid('conflicting same-source contents including UUID case and spending',envelope([entry(),{...entry(),source:{...entry().source,trip_id:TRIP.toUpperCase()},observation:{...entry().observation,spend_yen:0}}]));
  invalid('mixed batch with valid first and invalid later is rejected atomically',envelope([entry(),{...entry(1),observation:{...entry(1).observation,spend_yen:-1}}]));
  return cases;
}
