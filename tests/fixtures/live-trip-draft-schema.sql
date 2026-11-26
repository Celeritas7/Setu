-- L5B disposable rehearsal. Input is one already validated L4D proposal.
create table public.setu_place_update_drafts (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null,
  stop_index integer not null check (stop_index >= 0),
  observation_index integer not null check (observation_index >= 0),
  stop_name text not null check (length(trim(stop_name)) > 0),
  place_ref jsonb check (jsonb_typeof(place_ref) = 'object'),
  observation jsonb not null check (jsonb_typeof(observation) = 'object'),
  primary key (owner_id, trip_id, stop_index, observation_index)
);

alter table public.setu_place_update_drafts enable row level security;
revoke all on public.setu_place_update_drafts from public, anon, authenticated;
grant select, insert on public.setu_place_update_drafts to authenticated;

create policy read_own_drafts on public.setu_place_update_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy insert_own_drafts on public.setu_place_update_drafts
  for insert to authenticated with check (owner_id = (select auth.uid()));
