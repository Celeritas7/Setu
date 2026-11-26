-- Disposable follow-up to the draft schema and batch fixtures.
begin;
alter table public.setu_place_update_drafts
  add column revision bigint not null default 1 check (revision > 0);
grant update (observation, revision) on public.setu_place_update_drafts to setu_trip_draft_writer;
create policy correct_own_observation on public.setu_place_update_drafts
  for update to setu_trip_draft_writer using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- A point lookup exposes only the occurrence the caller wants to review.
create function public.setu_rehearse_review_observation(expected_owner uuid, trip uuid, stop integer, occurrence integer)
returns table(stop_name text, place_ref jsonb, observation jsonb, revision bigint)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select d.stop_name,d.place_ref,d.observation,d.revision
  from public.setu_place_update_drafts d
  where d.owner_id=auth.uid() and d.owner_id=expected_owner
    and coalesce(auth.jwt()->>'is_anonymous','false')='false'
    and d.trip_id=trip and d.stop_index=stop and d.observation_index=occurrence
$$;

create function public.setu_rehearse_correct_observation(expected_owner uuid, trip uuid, stop integer,
  occurrence integer, reviewed_revision bigint, replacement jsonb)
returns bigint language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  current_revision bigint;
  current_observation jsonb;
begin
  if expected_owner is null or auth.uid() is distinct from expected_owner
      or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then
    raise exception 'Account changed' using errcode='42501';
  end if;
  if reviewed_revision is null or reviewed_revision < 1
      or public.setu_draft_valid_observation(replacement) is not true then
    raise exception 'Invalid correction' using errcode='22023';
  end if;
  select d.revision,d.observation into current_revision,current_observation
    from public.setu_place_update_drafts d where d.owner_id=expected_owner
      and d.trip_id=trip and d.stop_index=stop and d.observation_index=occurrence for update;
  if not found then raise exception 'Draft unavailable' using errcode='PT404'; end if;
  if current_observation=replacement and reviewed_revision in (current_revision,current_revision-1) then
    return current_revision;
  end if;
  if current_revision<>reviewed_revision then
    raise exception 'Draft changed. Review its current revision.' using errcode='PT409';
  end if;
  update public.setu_place_update_drafts d set observation=replacement,revision=current_revision+1
    where d.owner_id=expected_owner and d.trip_id=trip and d.stop_index=stop and d.observation_index=occurrence;
  return current_revision+1;
end
$$;

grant create on schema public to setu_trip_draft_writer;
alter function public.setu_rehearse_review_observation(uuid,uuid,integer,integer) owner to setu_trip_draft_writer;
alter function public.setu_rehearse_correct_observation(uuid,uuid,integer,integer,bigint,jsonb) owner to setu_trip_draft_writer;
revoke create on schema public from setu_trip_draft_writer;
revoke all on function public.setu_rehearse_review_observation(uuid,uuid,integer,integer),
  public.setu_rehearse_correct_observation(uuid,uuid,integer,integer,bigint,jsonb) from public,anon;
grant execute on function public.setu_rehearse_review_observation(uuid,uuid,integer,integer),
  public.setu_rehearse_correct_observation(uuid,uuid,integer,integer,bigint,jsonb) to authenticated;
commit;
