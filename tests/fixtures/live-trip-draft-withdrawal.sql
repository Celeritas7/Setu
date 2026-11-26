-- Disposable follow-up to the correction rehearsal. Withdraw only the selected occurrence.
begin;
alter table public.setu_place_update_drafts add column withdrawn boolean not null default false;
create role setu_trip_draft_withdrawer nologin noinherit nosuperuser nobypassrls;
grant usage on schema public,auth to setu_trip_draft_withdrawer;
grant execute on function auth.uid(),auth.jwt() to setu_trip_draft_withdrawer;
grant select (owner_id,trip_id,stop_index,observation_index,revision,withdrawn),
  update (withdrawn,revision) on public.setu_place_update_drafts to setu_trip_draft_withdrawer;
create policy inspect_withdrawal on public.setu_place_update_drafts for select to setu_trip_draft_withdrawer
  using (owner_id=(select auth.uid()));
create policy withdraw_current on public.setu_place_update_drafts for update to setu_trip_draft_withdrawer
  using (owner_id=(select auth.uid()) and not withdrawn)
  with check (owner_id=(select auth.uid()) and withdrawn);

-- The source key remains occupied. Existing read, correction and retry comparisons
-- see active rows only; the unique index still prevents re-import of withdrawn rows.
alter policy read_own_drafts on public.setu_place_update_drafts
  using (owner_id=(select auth.uid()) and not withdrawn);

create function public.setu_rehearse_withdraw_observation(expected_owner uuid, trip uuid,
  stop integer, occurrence integer, reviewed_revision bigint)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  current_revision bigint;
begin
  if expected_owner is null or auth.uid() is distinct from expected_owner
      or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then
    raise exception 'Account changed' using errcode='42501';
  end if;
  if reviewed_revision is null or reviewed_revision < 1 then
    raise exception 'Review a current draft revision' using errcode='22023';
  end if;
  select d.revision into current_revision from public.setu_place_update_drafts d
    where d.owner_id=expected_owner and d.trip_id=trip and d.stop_index=stop
      and d.observation_index=occurrence and not withdrawn for update;
  if not found then raise exception 'Draft unavailable' using errcode='PT404'; end if;
  if current_revision<>reviewed_revision then
    raise exception 'Draft changed. Review it again before withdrawing.' using errcode='PT409';
  end if;
  update public.setu_place_update_drafts d set withdrawn=true,revision=current_revision+1
    where d.owner_id=expected_owner and d.trip_id=trip and d.stop_index=stop and d.observation_index=occurrence;
end
$$;
grant create on schema public to setu_trip_draft_withdrawer;
alter function public.setu_rehearse_withdraw_observation(uuid,uuid,integer,integer,bigint) owner to setu_trip_draft_withdrawer;
revoke create on schema public from setu_trip_draft_withdrawer;
revoke all on function public.setu_rehearse_withdraw_observation(uuid,uuid,integer,integer,bigint) from public,anon;
grant execute on function public.setu_rehearse_withdraw_observation(uuid,uuid,integer,integer,bigint) to authenticated;
commit;
