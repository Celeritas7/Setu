/* R4 transport. Reuses Setu's authenticated client. No automatic uploads. */
(function (root) {
  'use strict';
  const local = typeof module !== 'undefined' && module.exports ? require('./research-local.js') : root.SetuResearchLocal;
  const model = typeof module !== 'undefined' && module.exports ? require('./research-import.js') : root.SetuResearchImport;
  // Enable only in a separately approved release after the migration and production acceptance.
  const RELEASE_ENABLED = false;
  const fields = {
    setu_hubs:'id,name,rev',setu_food_notes:'id,name,address,source_url,place_ref,rev,hub_id,shop_id',
    setu_spots:'id,name,address,source_url,place_ref,rev,hub_id',akatsuki_places:'id,label,aliases',akatsuki_shops:'id,name',
  };
  const fail = (message,code='REVIEW_REQUIRED') => {throw Object.assign(new Error(message),{code});};
  const key = (owner,destination) => owner+'/'+destination;
  async function combine(remote,incoming) {
    if(!remote)return {payload:incoming,differences:[]};
    remote=await local.validateWorkspace(remote);
    if(remote.id!==incoming.id)fail('Cloud destination does not match.');
    const catalog={hubs:[...remote.catalog.hubs],places:[...remote.catalog.places]},differences=[];
    for(const type of ['hubs','places'])for(const item of incoming.catalog[type]) {
      const index=catalog[type].findIndex(row=>row.id===item.id);
      if(index<0){catalog[type].push(item);continue;}
      const old=catalog[type][index];
      if(local.stable({...old,rev:0})===local.stable({...item,rev:0}))continue;
      if(type==='hubs')fail('Local and cloud hub choices conflict. Download the cloud backup and review them locally.');
      const base=value=>({...value,rev:0,evidence:null,supplements:[]});
      if(local.stable(base(old))!==local.stable(base(item)))fail('Local and cloud versions of a draft conflict. Restore the cloud backup and merge selected facts locally.');
      const prefix=(a,b)=>a.every((value,i)=>local.stable(value)===local.stable(b[i]));
      if(prefix(old.supplements,item.supplements))catalog[type][index]={...item,evidence:old.evidence,rev:Math.max(old.rev,item.rev)};
      else if(!prefix(item.supplements,old.supplements))fail('Local and cloud research supplements diverged. Review a cloud backup before uploading.');
    }
    for(const [id,review] of Object.entries(incoming.reviews)) {
      const previous=remote.reviews[id];if(!previous)continue;
      for(const candidate of review.candidates) {
        const old=previous.candidates.find(row=>row.research_id===candidate.research_id);
        if(old && local.stable([old.decision,old.decision_details])!==local.stable([candidate.decision,candidate.decision_details]))differences.push({research_id:candidate.research_id,cloud:old.decision,local:candidate.decision,cloud_details:old.decision_details,local_details:candidate.decision_details});
      }
      for(const hub of review.hubs){const old=previous.hubs.find(row=>row.id===hub.id);if(old && local.stable(old.resolution)!==local.stable(hub.resolution))differences.push({hub:hub.name,cloud:old.resolution,local:hub.resolution});}
    }
    return {payload:await local.validateWorkspace({id:incoming.id,active:incoming.active,reviews:{...remote.reviews,...incoming.reviews},catalog}),differences};
  }
  async function build(workspace,snapshot,identities,publish) {
    let payload = await local.validateWorkspace(workspace);
    const checks = new Map();let created=0,reused=0,merges=0;
    function target(table,id,expected) {
      const row = snapshot.tables[table]?.find(row => String(row.id) === String(id));
      if (!row || !Number.isSafeInteger(row.rev)) fail('A saved target is unavailable. Refresh comparison from Setu Home.');
      if (expected != null && expected !== row.rev) fail('A saved target changed. Refresh comparison and approve the merge again.');
      checks.set(table+':'+id,{table,id:String(id),rev:row.rev});return row;
    }
    if (publish) {
      const materialized = await local.materialize(payload.reviews[payload.active],payload.catalog,payload.id);
      payload = {...payload,catalog:materialized.catalog};
      for (const hub of payload.catalog.hubs) {
        const mapped = identities.find(item => item.local_id === hub.id);
        if (mapped) target('setu_hubs',mapped.target_id);
        else if (snapshot.tables.setu_hubs.some(row => model.matchReasons({name_ja:hub.name},row).includes('Name or alias'))) fail('A saved hub already has this name. Choose that hub in Research Import.');
      }
      for (const draft of payload.catalog.places) {
        const mapped = identities.find(item => item.local_id === draft.id);
        if (mapped) {
          if (local.stable(mapped.original.source)!==local.stable(draft.source) || local.stable(mapped.original.hub)!==local.stable(draft.hub) ||
            local.stable(mapped.original.linked_location)!==local.stable(draft.linked_location) || mapped.original.record_kind!==draft.record_kind) fail('A published draft changed. Use selected evidence merges or edit its saved Setu place.');
          target(mapped.target_table,mapped.target_id);reused++;
        }
        else {
          for (const table of ['setu_spots','setu_food_notes']) for (const row of snapshot.tables[table]) {
            const reasons = model.matchReasons(draft.source,row);
            if ((reasons.includes('Name or alias') && reasons.includes('Address text')) ||
              (draft.source.external_place_id && draft.source.external_place_id === row.place_ref)) fail('A saved place already matches '+draft.source.name_ja+'. Merge or skip it in Research Import.');
          }
          created++;
        }
        if (draft.hub.table === 'setu_hubs') target('setu_hubs',draft.hub.id);
      }
      for (const proposal of model.reviewExport(payload.reviews[payload.active]).proposed_changes) {
        if (proposal.action === 'merge_selected' && proposal.target.kind === 'existing' && proposal.target.table !== model.LOCAL_PLACES) {
          target(proposal.target.table,proposal.target.id,proposal.target.rev);merges++;
        }
      }
    }
    if (new TextEncoder().encode(JSON.stringify(payload)).length > local.MAX_BACKUP_BYTES) fail('Cloud workspace exceeds 25 MiB. Keep a local backup.');
    return {payload,checks:[...checks.values()].sort((a,b)=>(a.table+a.id).localeCompare(b.table+b.id)),summary:{created,reused,merges,local_suggestions:payload.catalog.places.length},publish};
  }
  function create({sb,owner,isCurrent,localStore,outbox,enabled=RELEASE_ENABLED,uuid=()=>root.crypto.randomUUID()}) {
    async function guard() {
      if (!owner || !isCurrent()) fail('Signed-in account changed. Reopen Research cloud.','AUTH_CHANGED');
      const {data,error}=await sb.auth.getUser();
      if (error || data?.user?.id!==owner || !isCurrent()) fail('Your signed-in session could not be verified.','AUTH_CHANGED');
    }
    async function query(run) {
      await guard();const response=await run();await guard();
      if(response.error)throw Object.assign(new Error(response.error.message),{code:response.error.code,
        rejected:/^[0-9A-Z]{5}$/.test(response.error.code || '') || /^PGRST\d+$/.test(response.error.code || '')});
      return response;
    }
    async function all(table,projection,filter=()=>{}) {
      const rows=[];let total=null;
      do {
        const response=await query(()=>{
          const order={setu_research_identities:'local_id',setu_research_evidence:'attachment_key'}[table] || 'id';
          let q=sb.from(table).select(projection,{count:'exact'}).order(order).range(rows.length,rows.length+499);
          const filtered=filter(q);return filtered || q;
        });
        if (!Number.isSafeInteger(response.count) || response.count<0 || response.count>50000 || (total!==null && total!==response.count)) fail('Comparison changed or exceeded its limit. Preview again.');
        total=response.count;
        if (!response.data?.length && rows.length<total) fail('Comparison is incomplete. No cloud changes were made.');
        rows.push(...(response.data || []));
      } while(rows.length<total);
      return rows;
    }
    async function current(destination) {
      const r=await query(()=>sb.from('setu_research_workspaces').select('destination_id,rev,payload,previous_payload,updated_at').eq('user_id',owner).eq('destination_id',destination).maybeSingle());
      return r.data;
    }
    async function prepare(record,publish=false) {
      record=await localStore.read(record.id);
      if(!record)fail('Local review is unavailable. Restore its backup first.');
      const pending=await outbox.read(key(owner,record.id));
      if (pending?.payload.state==='pending') fail('A previous upload has no confirmed result. Retry that exact request first.','PENDING');
      const capability=await query(()=>sb.rpc('setu_research_capabilities'));
      if(capability.data!=='4.0.0')fail('R4 database setup is not installed. Keep using local drafts.','SCHEMA_REQUIRED');
      const cloud=await current(record.id);
      const snapshot={tables:{},scope:'fresh signed-in comparison',complete:true,captured_at:new Date().toISOString()};
      let identities=[];
      if(publish) {
        for(const [table,projection] of Object.entries(fields)) snapshot.tables[table]=await all(table,projection,q=>['setu_hubs','setu_spots','setu_food_notes'].includes(table)?q.is('deleted_at',null):table==='akatsuki_places'?q.is('retired_at',null):q);
        identities=await all('setu_research_identities','local_id,target_table,target_id,original',q=>q.eq('user_id',owner));
      }
      const merged=await combine(cloud?.payload,await local.validateWorkspace(record.payload));
      const plan=await build(merged.payload,snapshot,identities,publish);
      return {...plan,differences:merged.differences,owner,destination:record.id,local_rev:record.rev,remote_rev:cloud?.rev || 0};
    }
    async function send(pending,stored) {
      if (!enabled) fail('Cloud writes are disabled until a separately approved release.','NOT_ENABLED');
      const args=pending.args;
      if(args.p_owner!==owner)fail('This pending request belongs to another account.','AUTH_CHANGED');
      try {
        const r=await query(()=>sb.rpc('setu_research_commit',args)),response=r.data;
        if(response?.owner!==owner || response.request_id!==args.p_request_id || response.destination!==args.p_destination || !Number.isSafeInteger(response.rev)) fail('Cloud receipt could not be verified. Retry the same request.','UNCERTAIN');
        await outbox.write(stored.id,stored.rev,{...pending,state:'done',response});return response;
      } catch(error) {
        if(error.rejected)await outbox.write(stored.id,stored.rev,{...pending,state:'conflict',error:error.message});
        else error.uncertain=true;
        throw error;
      }
    }
    async function commit(plan,confirmed) {
      if(!enabled)fail('Cloud writes are disabled until a separately approved release.','NOT_ENABLED');
      if(confirmed!==true || plan.owner!==owner)fail('Confirm this batch and signed-in account before uploading.');
      await guard();
      const localRecord=await localStore.read(plan.destination);
      if(localRecord?.rev!==plan.local_rev)fail('Local review changed after preview. Preview again.');
      const outboxId=key(owner,plan.destination),before=await outbox.read(outboxId);
      if(before?.payload.state==='pending')fail('Retry the existing pending request first.','PENDING');
      const pending={state:'pending',args:{p_owner:owner,p_destination:plan.destination,p_expected_revision:plan.remote_rev,p_request_id:uuid(),
        p_workspace:JSON.parse(JSON.stringify(plan.payload)),p_publish:plan.publish,p_checks:JSON.parse(JSON.stringify(plan.checks))}};
      const saved=await outbox.write(outboxId,before?.rev || 0,pending);
      return send(pending,saved);
    }
    async function retry(destination) {
      await guard();const stored=await outbox.read(key(owner,destination));
      if(stored?.payload.state!=='pending')fail('No uncertain upload needs retrying.');return send(stored.payload,stored);
    }
    async function list() {
      const r=await query(()=>sb.from('setu_research_workspaces').select('destination_id,destination_name,rev,updated_at').eq('user_id',owner).order('updated_at',{ascending:false}).limit(200));return r.data || [];
    }
    async function download(destination,previous=false) {const row=await current(destination),payload=previous?row?.previous_payload:row?.payload;if(!payload)fail('Cloud review/checkpoint is unavailable.');return local.backup(await local.validateWorkspace(payload));}
    async function evidence() {return all('setu_research_evidence','attachment_key,destination_id,target_table,target_id,source,evidence,selected_fields',q=>q.eq('user_id',owner));}
    return {prepare,commit,retry,list,download,evidence,guard};
  }
  const api={create,build,combine,RELEASE_ENABLED};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.SetuResearchCloud=api;
})(typeof globalThis!=='undefined'?globalThis:this);
