import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export const local=require('../../js/research-local.js'),model=require('../../js/research-import.js'),cloud=require('../../js/research-cloud.js');
export const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
export const copy=value=>JSON.parse(JSON.stringify(value));
export function research() {
  return {format:'setu_research_handoff',schema_version:'1.0.0',destination:{name_ja:'Cloud test town',origin_station_ja:'Example',travel_date:null,date_confirmed:false},
    provenance:{checked_at:'2026-11-20'},import_contract:{},hubs:[{id:'town',name_ja:'Test town hub'}],places:[{
      research_id:'P1',name_ja:'Test park',hub_id:'town',location:{address_ja:'Test address 1',coordinates:null,maps_url:'https://example.org/map'},
      research_fields:{cost:{raw_text:'Admission unknown',admission_yen:null,admission_evidence:'unknown'},hours:{raw_summary:'Unknown',weekly_intervals:null,date_specific_open:null},access:{}},
      tags:{practical_candidates:[],experiential_candidates:[{tag:'Cocoon',status:'potential'}],personal_confirmed_experiences:[]},
      source_links:[{url:'https://example.org/park',checked_at:'2026-11-20'}],visit_status:'suggested',accepted_into_setu:false,review_status:'not_reviewed',personal_observation:null,
    }]};
}
export async function workspace(data=research(),kind='see') {
  const input=await local.inspectInput(JSON.stringify(data));let review=local.prepare(data,null,local.emptyCatalog(),'2026-11-22',input.scope);
  review=model.resolveHub(review,'town',{kind:'new'},true).value;
  review=model.setDecision(review,'P1','accept_suggestion',{record_kind:kind,distinct_acknowledged:true}).value;
  const saved=await local.materialize(review,local.emptyCatalog(),input.scope);
  return {id:input.scope,active:input.report,reviews:{[input.report]:review},catalog:saved.catalog};
}
export function snapshot(tables={}) {return {tables:Object.fromEntries(model.TABLES.map(table=>[table,tables[table] || []]))};}
export class Store {
  records=new Map();
  async read(id){return copy(this.records.get(id) || null);}
  async list(){return copy([...this.records.values()]);}
  async write(id,rev,payload){const before=this.records.get(id);if((before?.rev || 0)!==rev)throw Error('Local revision conflict');const next={id,rev:rev+1,payload:copy(payload)};this.records.set(id,next);return copy(next);}
}
