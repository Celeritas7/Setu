-- Disposable rehearsal only. Keep table ownership and identity under caller RLS.
create function public.setu_rehearse_trip_draft(expected_owner uuid, batch jsonb)
returns table(inserted integer, identical integer)
language plpgsql security invoker set search_path = pg_catalog as $$
declare
  proposal jsonb;
  src jsonb;
  item_trip uuid;
  item_stop integer;
  item_observation integer;
  ref jsonb;
begin
  if expected_owner is null or auth.uid() is distinct from expected_owner or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then
    raise exception 'Reviewed account does not match the signed-in account' using errcode = '42501';
  end if;
  if jsonb_typeof(batch) is distinct from 'object' then
    raise exception 'Invalid draft envelope' using errcode = '22023';
  end if;
  if batch - array['format','version','status','proposals'] <> '{}'::jsonb
     or batch->>'format' is distinct from 'setu_place_update_draft'
     or batch->'version' is distinct from '1'::jsonb or batch->>'status' is distinct from 'draft'
     or jsonb_typeof(batch->'proposals') is distinct from 'array' then
    raise exception 'Invalid draft envelope' using errcode = '22023';
  end if;
  if jsonb_array_length(batch->'proposals') = 0 then
    raise exception 'No proposals selected' using errcode = '22023';
  end if;
  inserted := 0;
  identical := 0;
  -- Canonical key order for overlapping batches of exporter-generated source IDs.
  for proposal in select value from jsonb_array_elements(batch->'proposals')
    order by lower(value#>>'{source,trip_id}') collate "C",
      value#>'{source,stop_index}', value#>'{source,observation_index}'
  loop
    src := proposal->'source';
    if jsonb_typeof(proposal) is distinct from 'object' or jsonb_typeof(src) is distinct from 'object' then
      raise exception 'Invalid proposal or source' using errcode = '22023';
    end if;
    if not (proposal ?& array['source','stop_name','place_ref','observation'])
       or proposal - array['source','stop_name','place_ref','observation'] <> '{}'::jsonb
       or src - array['trip_id','stop_index','observation_index'] <> '{}'::jsonb
       or (src->>'trip_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') is not true
       or public.setu_draft_valid_index(src->'stop_index') is not true
       or public.setu_draft_valid_index(src->'observation_index') is not true
       or jsonb_typeof(proposal->'stop_name') is distinct from 'string' then
      raise exception 'Invalid proposal fields' using errcode = '22023';
    end if;
    item_trip := (src->>'trip_id')::uuid;
    item_stop := (src->'stop_index')::numeric::integer;
    item_observation := (src->'observation_index')::numeric::integer;
    ref := nullif(proposal->'place_ref','null'::jsonb);
    insert into public.setu_place_update_drafts(trip_id,stop_index,observation_index,stop_name,place_ref,observation)
      values(item_trip,item_stop,item_observation,proposal->>'stop_name',ref,proposal->'observation')
      on conflict (owner_id,trip_id,stop_index,observation_index) do nothing;
    if found then
      inserted := inserted + 1;
    elsif exists (select from public.setu_place_update_drafts d
        where d.owner_id=auth.uid() and d.trip_id=item_trip and d.stop_index=item_stop and d.observation_index=item_observation
          and d.stop_name=proposal->>'stop_name' and d.place_ref is not distinct from ref
          and d.observation=proposal->'observation') then
      identical := identical + 1;
    else
      raise exception 'Draft source already has different contents' using errcode = 'P0001';
    end if;
  end loop;
  return next;
end
$$;

revoke all on function public.setu_rehearse_trip_draft(uuid,jsonb) from public,anon;
grant execute on function public.setu_rehearse_trip_draft(uuid,jsonb) to authenticated;
