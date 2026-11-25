-- R4 PREPARED ONLY. Do not apply to a hosted project without separate approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.setu_research_workspaces (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  destination_id text not null check (destination_id ~ '^destination-[a-f0-9]{64}$'),
  rev integer not null check (rev > 0), payload jsonb not null, destination_name text not null default '',
  updated_at timestamptz not null default now(), previous_payload jsonb,
  primary key (user_id,destination_id),
  check (octet_length(payload::text) <= 26214400)
);
create table public.setu_research_requests (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id uuid not null, request_hash text not null, response jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,request_id)
);
create table public.setu_research_identities (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  local_id text not null, destination_id text not null,
  target_table text not null check (target_table in ('setu_hubs','setu_food_notes','setu_spots')),
  target_id uuid not null, original jsonb not null,
  primary key(user_id,local_id), unique(user_id,target_table,target_id)
);
create index setu_research_identities_destination on public.setu_research_identities(user_id,destination_id);
create table public.setu_research_evidence (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  attachment_key text not null, destination_id text not null,
  target_table text not null check (target_table in ('setu_food_notes','setu_spots')),
  target_id uuid not null, source jsonb not null, evidence jsonb not null,
  selected_fields text[] not null, created_at timestamptz not null default now(),
  primary key(user_id,attachment_key)
);
create index setu_research_evidence_target on public.setu_research_evidence(user_id,target_table,target_id);

alter table public.setu_research_workspaces enable row level security;
alter table public.setu_research_requests enable row level security;
alter table public.setu_research_identities enable row level security;
alter table public.setu_research_evidence enable row level security;
create policy research_workspaces_own on public.setu_research_workspaces to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy research_requests_read on public.setu_research_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy research_requests_insert on public.setu_research_requests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy research_identities_read on public.setu_research_identities for select to authenticated using ((select auth.uid()) = user_id);
create policy research_identities_insert on public.setu_research_identities for insert to authenticated with check ((select auth.uid()) = user_id);
create policy research_evidence_read on public.setu_research_evidence for select to authenticated using ((select auth.uid()) = user_id);
create policy research_evidence_insert on public.setu_research_evidence for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.setu_research_workspaces,public.setu_research_requests,public.setu_research_identities,public.setu_research_evidence from public,anon,authenticated;
grant select,insert,update on public.setu_research_workspaces to authenticated;
grant select,insert on public.setu_research_requests,public.setu_research_identities,public.setu_research_evidence to authenticated;

create function public.setu_research_workspace_touch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.rev <> 1 then raise exception 'RESEARCH_CONFLICT: initial revision must be 1' using errcode='40001'; end if;
  elsif new.user_id is distinct from old.user_id or new.destination_id is distinct from old.destination_id or new.rev <> old.rev+1 then
    raise exception 'RESEARCH_CONFLICT: workspace revision changed' using errcode='40001';
  end if;
  new.updated_at := now(); return new;
end $$;
create trigger research_workspace_touch before insert or update on public.setu_research_workspaces
  for each row execute function public.setu_research_workspace_touch();

create function public.setu_research_norm(p_text text) returns text language sql immutable security invoker set search_path='' as $$
  select lower(regexp_replace(normalize(coalesce(p_text,''),NFKC),'[[:space:][:punct:]]','','g'))
$$;
-- Nonunique: these accelerate review checks without collapsing distinct venues.
create index setu_research_hub_name on public.setu_hubs(user_id,public.setu_research_norm(name)) where deleted_at is null;
create index setu_research_spot_identity on public.setu_spots(user_id,public.setu_research_norm(name),public.setu_research_norm(address)) where deleted_at is null;
create index setu_research_food_identity on public.setu_food_notes(user_id,public.setu_research_norm(name),public.setu_research_norm(address)) where deleted_at is null;
create index setu_research_spot_external on public.setu_spots(user_id,place_ref) where deleted_at is null;
create index setu_research_food_external on public.setu_food_notes(user_id,place_ref) where deleted_at is null;
create function public.setu_research_lock_target(p_table text,p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
  if p_table not in ('setu_hubs','setu_spots','setu_food_notes') then raise exception 'Invalid research target'; end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 and deleted_at is null for update',p_table)
    into r using p_id,auth.uid();
  if r is null then raise exception 'RESEARCH_CONFLICT: target unavailable' using errcode='40001'; end if;
  return r;
end $$;
create function public.setu_research_require_check(p_checks jsonb,p_table text,p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from jsonb_array_elements(p_checks) c where c->>'table'=p_table and c->>'id'=p_id::text) then
    raise exception 'RESEARCH_CONFLICT: preview this target before publishing' using errcode='40001';
  end if;
end $$;
create function public.setu_research_attach(p_destination text,p_table text,p_id uuid,p_source jsonb,p_evidence jsonb,p_fields jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare fields text[]; attachment text; changed integer; link jsonb;
begin
  if p_table not in ('setu_spots','setu_food_notes') or jsonb_typeof(p_fields) is distinct from 'array' then raise exception 'Invalid research attachment'; end if;
  perform public.setu_research_lock_target(p_table,p_id);
  select array_agg(distinct f order by f) into fields from jsonb_array_elements_text(p_fields) f;
  if coalesce(array_length(fields,1),0)=0 or not fields <@ array['name_ja','name_en','address_text','maps_url','cost','hours','access','practical_tags','potential_experiences','discovery_sources','facility_facts','safety_flags'] then
    raise exception 'Invalid research fact selection';
  end if;
  if p_source->>'visit_status' is distinct from 'suggested' or p_source->'accepted_into_setu' is distinct from 'false'::jsonb
    or coalesce(p_source->'personal_observation','null'::jsonb) is distinct from 'null'::jsonb
    or p_source#>'{tags,personal_confirmed_experiences}' is distinct from '[]'::jsonb then
    raise exception 'Research cannot supply personal confirmations';
  end if;
  if jsonb_typeof(p_source->'source_links') is distinct from 'array' or jsonb_array_length(p_source->'source_links')=0 then raise exception 'Research source links are required'; end if;
  for link in select l from jsonb_array_elements(p_source->'source_links') l loop
    if (link->>'url') is null or (link->>'url') !~ '^https?://[^/?#@[:space:]]+([/?#]|$)'
      or (link->>'checked_at') is null or (link->>'checked_at') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid research source URL or checked date'; end if;
    perform (link->>'checked_at')::date;
  end loop;
  attachment := encode(sha256(convert_to(jsonb_build_object('table',p_table,'id',p_id,'source',p_source,'evidence',p_evidence,'fields',fields)::text,'UTF8')),'hex');
  insert into public.setu_research_evidence(user_id,attachment_key,destination_id,target_table,target_id,source,evidence,selected_fields)
    values(auth.uid(),attachment,p_destination,p_table,p_id,p_source,p_evidence,fields) on conflict do nothing;
  get diagnostics changed = row_count;
  if changed > 0 then
    execute format('update public.%I set rev=rev+1 where id=$1 and user_id=$2',p_table) using p_id,auth.uid();
  end if;
  return changed > 0;
end $$;

create function public.setu_research_capabilities() returns text language sql stable security invoker set search_path='' as $$ select '4.0.0'::text $$;
create function public.setu_research_commit(p_owner uuid,p_destination text,p_expected_revision integer,p_request_id uuid,
  p_workspace jsonb,p_publish boolean,p_checks jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_rev integer; fingerprint text; receipt public.setu_research_requests%rowtype; mapping public.setu_research_identities%rowtype;
  item jsonb; draft jsonb; source jsonb; envelope jsonb; target jsonb; choice jsonb; doc jsonb; candidate jsonb;
  target_table text; target_id uuid; hub uuid; row_data jsonb; created_count integer:=0; attached_count integer:=0; hub_count integer:=0;
  response jsonb; base_fields jsonb:='["name_ja","name_en","address_text","maps_url","cost","hours","access","practical_tags","potential_experiences","discovery_sources","facility_facts","safety_flags"]';
begin
  if auth.uid() is null or auth.uid() is distinct from p_owner or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Research account changed or is not signed in' using errcode='28000';
  end if;
  if p_expected_revision < 0 or p_expected_revision is null or p_request_id is null or p_publish is null
    or p_workspace->>'id' is distinct from p_destination or p_destination !~ '^destination-[a-f0-9]{64}$'
    or octet_length(p_workspace::text)>26214400 or jsonb_typeof(p_workspace->'reviews') is distinct from 'object'
    or p_workspace#>array['reviews',p_workspace->>'active'] is null
    or jsonb_typeof(p_workspace#>'{catalog,places}') is distinct from 'array' or jsonb_array_length(p_workspace#>'{catalog,places}')>1000
    or jsonb_typeof(p_workspace#>'{catalog,hubs}') is distinct from 'array' or jsonb_array_length(p_workspace#>'{catalog,hubs}')>200
    or jsonb_typeof(p_checks) is distinct from 'array' or jsonb_array_length(p_checks)>3000 then raise exception 'Invalid research workspace'; end if;
  if (select count(*) from jsonb_object_keys(p_workspace->'reviews'))>200 then raise exception 'Too many research versions'; end if;
  for doc in select value from jsonb_each(p_workspace->'reviews') loop
    if doc->>'format' is distinct from 'setu_research_preview' or doc->>'schema_version' is distinct from '1.0.0'
      or doc->>'review_version' is distinct from '2.0.0' or doc#>>'{research,format}' is distinct from 'setu_research_handoff'
      or doc#>>'{research,schema_version}' is distinct from '1.0.0'
      or jsonb_typeof(doc#>'{research,places}') is distinct from 'array' or jsonb_array_length(doc#>'{research,places}')>1000
      or jsonb_typeof(doc#>'{research,hubs}') is distinct from 'array' or jsonb_array_length(doc#>'{research,hubs}')>200 then
      raise exception 'Unsupported or invalid cloud research version';
    end if;
  end loop;
  -- Serializes imports for this owner across destinations, including first inserts.
  perform pg_advisory_xact_lock(hashtextextended('setu-research:'||p_owner::text,0));
  fingerprint := encode(sha256(convert_to(jsonb_build_object('destination',p_destination,'revision',p_expected_revision,'workspace',p_workspace,'publish',p_publish,'checks',p_checks)::text,'UTF8')),'hex');
  select * into receipt from public.setu_research_requests where user_id=p_owner and request_id=p_request_id;
  if found then
    if receipt.request_hash<>fingerprint then raise exception 'Research request ID reused with different content' using errcode='22023'; end if;
    return receipt.response;
  end if;
  select rev into current_rev from public.setu_research_workspaces where user_id=p_owner and destination_id=p_destination for update;
  if coalesce(current_rev,0)<>p_expected_revision then raise exception 'RESEARCH_CONFLICT: cloud workspace changed; preview again' using errcode='40001'; end if;
  if p_publish then
    -- Lock/check every existing target in a deterministic order before attaching anything.
    for item in select c from jsonb_array_elements(p_checks) c order by c->>'table',c->>'id' loop
      row_data:=public.setu_research_lock_target(item->>'table',(item->>'id')::uuid);
      if (row_data->>'rev')::integer is distinct from (item->>'rev')::integer then raise exception 'RESEARCH_CONFLICT: saved place changed; review again' using errcode='40001'; end if;
    end loop;
    for item in select h from jsonb_array_elements(p_workspace#>'{catalog,hubs}') h loop
      select * into mapping from public.setu_research_identities where user_id=p_owner and local_id=item->>'id';
      if found then
        if mapping.target_table<>'setu_hubs' or mapping.original->>'name' is distinct from item->>'name' then raise exception 'Research hub identity changed'; end if;
        perform public.setu_research_require_check(p_checks,'setu_hubs',mapping.target_id);
      else
        if nullif(trim(item->>'name'),'') is null or (item->>'id') not like p_destination||'/hub/%' then raise exception 'Invalid draft hub'; end if;
        if exists(select 1 from public.setu_hubs where user_id=p_owner and deleted_at is null and public.setu_research_norm(name)=public.setu_research_norm(item->>'name')) then
          raise exception 'RESEARCH_DUPLICATE: choose the existing hub in Research Import' using errcode='40001'; end if;
        insert into public.setu_hubs(name,user_id,accepted,added_by,geo_query,lat,lng) values(item->>'name',p_owner,false,'claude',null,null,null) returning id into hub;
        insert into public.setu_research_identities values(p_owner,item->>'id',p_destination,'setu_hubs',hub,item);
        hub_count:=hub_count+1;
      end if;
    end loop;
    for draft in select d from jsonb_array_elements(p_workspace#>'{catalog,places}') d loop
      source:=draft->'source';envelope:=draft->'evidence';
      if draft->'accepted' is distinct from 'false'::jsonb or draft->>'status' is distinct from 'try'
        or draft->'lat' is distinct from 'null'::jsonb or draft->'lng' is distinct from 'null'::jsonb
        or draft->'personal_confirmed_experiences' is distinct from '[]'::jsonb
        or nullif(trim(source->>'name_ja'),'') is null or (draft->>'id') not like p_destination||'/place/%'
        or draft->>'record_kind' not in ('food','shop','see','other') then raise exception 'Invalid draft defaults'; end if;
      target_table:=case when draft->>'record_kind'='food' then 'setu_food_notes' else 'setu_spots' end;
      select * into mapping from public.setu_research_identities where user_id=p_owner and local_id=draft->>'id';
      if found then
        if mapping.target_table<>target_table or mapping.original->'source' is distinct from source or mapping.original->'hub' is distinct from draft->'hub'
          or mapping.original->'linked_location' is distinct from draft->'linked_location' then raise exception 'Research draft changed; use a selective merge or edit the saved place'; end if;
        target_id:=mapping.target_id;perform public.setu_research_require_check(p_checks,target_table,target_id);
      else
        -- Recheck both owned tables, across every destination. Shared URLs alone are not identity.
        if exists(select 1 from (
          select name,address,place_ref from public.setu_spots where user_id=p_owner and deleted_at is null
          union all select name,address,place_ref from public.setu_food_notes where user_id=p_owner and deleted_at is null
        ) r where (nullif(source->>'external_place_id','') is not null and r.place_ref=source->>'external_place_id')
          or (nullif(source#>>'{location,address_ja}','') is not null and public.setu_research_norm(r.name) in
            (select public.setu_research_norm(n) from jsonb_array_elements_text(coalesce(source->'aliases','[]'::jsonb)||jsonb_build_array(source->>'name_ja')) n)
            and public.setu_research_norm(r.address)=public.setu_research_norm(source#>>'{location,address_ja}'))) then
          raise exception 'RESEARCH_DUPLICATE: saved place exists; merge or skip it' using errcode='40001'; end if;
        if draft->'linked_location' is not null and draft->'linked_location'<>'null'::jsonb and
          exists(select 1 from public.setu_research_identities i where i.user_id=p_owner and i.original->'linked_location'=draft->'linked_location') then
          raise exception 'RESEARCH_DUPLICATE: linked location already imported' using errcode='40001'; end if;
        if draft#>>'{hub,table}'='setu_hubs' then
          hub:=(draft#>>'{hub,id}')::uuid;perform public.setu_research_require_check(p_checks,'setu_hubs',hub);
        elsif draft#>>'{hub,table}'='setu_research_local_hubs' then
          select i.target_id into hub from public.setu_research_identities i where i.user_id=p_owner and i.local_id=draft#>>'{hub,id}' and i.target_table='setu_hubs';
          if not found then raise exception 'Draft hub unavailable'; end if;
        else raise exception 'Invalid hub reference'; end if;
        if target_table='setu_food_notes' then
          insert into public.setu_food_notes(user_id,name,address,hub_id,source_url,intro,accepted,status,added_by,verified,lat,lng,geo_query,spend_yen,place_ref)
          values(p_owner,source->>'name_ja',source#>>'{location,address_ja}',hub,source#>>'{source_links,0,url}',
            'Research suggestion; not personally confirmed. Price evidence: '||coalesce(source#>>'{research_fields,cost,raw_text}','Unknown')||'. Full sources, checked dates and potential tags: Research cloud.',
            false,'try','claude','Research snapshot; unverified',null,null,null,null,source->>'external_place_id') returning id into target_id;
        else
          insert into public.setu_spots(user_id,name,address,hub_id,kind,source_url,intro,accepted,status,added_by,verified,lat,lng,geo_query,spend_yen,place_ref)
          values(p_owner,source->>'name_ja',source#>>'{location,address_ja}',hub,draft->>'record_kind',source#>>'{source_links,0,url}',
            'Research suggestion; not personally confirmed. Price evidence: '||coalesce(source#>>'{research_fields,cost,raw_text}','Unknown')||'. Full sources, checked dates and potential tags: Research cloud.',
            false,'try','claude','Research snapshot; unverified',null,null,null,null,source->>'external_place_id') returning id into target_id;
        end if;
        insert into public.setu_research_identities values(p_owner,draft->>'id',p_destination,target_table,target_id,draft);
        created_count:=created_count+1;
      end if;
      if public.setu_research_attach(p_destination,target_table,target_id,source,envelope,base_fields) then attached_count:=attached_count+1; end if;
      for item in select s from jsonb_array_elements(draft->'supplements') s loop
        if public.setu_research_attach(p_destination,target_table,target_id,item->'source',item->'evidence',item->'fields') then attached_count:=attached_count+1; end if;
      end loop;
    end loop;
    doc:=p_workspace#>array['reviews',p_workspace->>'active'];
    for candidate in select c from jsonb_array_elements(doc->'candidates') c where c->>'decision'='merge_selected' loop
      choice:=candidate#>'{decision_details,target}';
      if choice->>'kind'<>'existing' or choice->>'table'='setu_research_local_drafts' then continue; end if;
      target_table:=choice->>'table';target_id:=(choice->>'id')::uuid;
      perform public.setu_research_require_check(p_checks,target_table,target_id);
      if not exists(select 1 from jsonb_array_elements(p_checks) c where c->>'table'=target_table and c->>'id'=target_id::text and c->'rev'=choice->'rev')
        or candidate#>'{decision_details,same_place_acknowledged}' is distinct from 'true'::jsonb then raise exception 'Review changed merge target' using errcode='40001'; end if;
      select p into source from jsonb_array_elements(doc#>'{research,places}') p where p->>'research_id'=candidate->>'research_id';
      select jsonb_build_object('destination',doc#>'{research,destination}','provenance',doc#>'{research,provenance}',
        'import_contract',doc#>'{research,import_contract}','original_hub',h) into envelope
        from jsonb_array_elements(doc#>'{research,hubs}') h where h->>'id'=source->>'hub_id';
      if public.setu_research_attach(p_destination,target_table,target_id,source,envelope,candidate#>'{decision_details,fields}') then attached_count:=attached_count+1; end if;
    end loop;
  end if;
  if current_rev is null then
    insert into public.setu_research_workspaces(user_id,destination_id,rev,payload,updated_at,destination_name) values(p_owner,p_destination,1,p_workspace,now(),
      coalesce(p_workspace#>>array['reviews',p_workspace->>'active','research','destination','name_ja'],p_workspace#>>array['reviews',p_workspace->>'active','research','destination','name_en'],'Saved destination'));
  else
    update public.setu_research_workspaces set rev=rev+1,previous_payload=payload,payload=p_workspace,
      destination_name=coalesce(p_workspace#>>array['reviews',p_workspace->>'active','research','destination','name_ja'],p_workspace#>>array['reviews',p_workspace->>'active','research','destination','name_en'],'Saved destination')
      where user_id=p_owner and destination_id=p_destination;
  end if;
  response:=jsonb_build_object('owner',p_owner,'destination',p_destination,'rev',coalesce(current_rev,0)+1,'request_id',p_request_id,
    'created',created_count,'hubs_created',hub_count,'evidence_added',attached_count);
  insert into public.setu_research_requests(user_id,request_id,request_hash,response) values(p_owner,p_request_id,fingerprint,response);
  return response;
end $$;

revoke all on function public.setu_research_workspace_touch(),public.setu_research_norm(text),public.setu_research_lock_target(text,uuid),
  public.setu_research_require_check(jsonb,text,uuid),public.setu_research_attach(text,text,uuid,jsonb,jsonb,jsonb),
  public.setu_research_capabilities(),public.setu_research_commit(uuid,text,integer,uuid,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.setu_research_workspace_touch(),public.setu_research_norm(text),public.setu_research_lock_target(text,uuid),
  public.setu_research_require_check(jsonb,text,uuid),public.setu_research_attach(text,text,uuid,jsonb,jsonb,jsonb),
  public.setu_research_capabilities(),public.setu_research_commit(uuid,text,integer,uuid,jsonb,boolean,jsonb) to authenticated;
commit;
