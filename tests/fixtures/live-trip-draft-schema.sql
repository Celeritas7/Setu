-- Disposable database fixture for L5B/L5C.
create function public.setu_draft_valid_index(value jsonb) returns boolean
language sql immutable strict set search_path = pg_catalog as $$
  select case when jsonb_typeof(value) = 'number' then
    value::numeric between 0 and 9007199254740991 and trunc(value::numeric) = value::numeric
  else false end
$$;

create function public.setu_draft_valid_observation(value jsonb) returns boolean
language plpgsql stable strict set search_path = pg_catalog as $$
declare
  answers jsonb := value->'comfort_answers';
  choices constant jsonb := '{
    "noise":["Quiet","Moderate","Loud"], "crowding":["Few people","Moderately busy","Crowded"],
    "comfort":["Comfortable","Mixed","Uncomfortable"], "seating":["Seat available","All seats taken","No seats"],
    "access":["Free","Purchase required","Entry fee"], "stay":["Under 30 minutes","30–59 minutes","60–89 minutes","90 minutes or longer"],
    "study":["Studied here","Study prohibited"], "laptop":["Used a laptop","Laptop use prohibited"],
    "wifi":["Connected successfully","Could not connect"], "food":["Allowed","Prohibited"],
    "drink":["Allowed","Prohibited"], "return":["Yes","Maybe","No"]}';
begin
  if jsonb_typeof(value) <> 'object' then return false; end if;
  if answers is not null then
    if value->>'outcome' is distinct from 'Personally reviewed' or jsonb_typeof(answers) <> 'object' then
      return false;
    end if;
    if exists (select from jsonb_each(answers) as answer(key, val)
               where not (choices ? key) or (val <> 'null'::jsonb
                 and (jsonb_typeof(val) <> 'string' or not ((choices->key) @> jsonb_build_array(val))))) then
      return false;
    end if;
  end if;
  return value ?& array['space','date','outcome','spend_yen','note']
    and value - array['space','date','outcome','spend_yen','note','comfort_answers'] = '{}'::jsonb
    and jsonb_typeof(value->'space') = 'string' and value->>'space' ~ '[^[:space:]]'
    and value->>'outcome' in ('Suggested','Passed nearby','Visited','Did not enter','Personally reviewed')
    and value->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(value->>'date','date')
    and jsonb_typeof(value->'note') in ('string','null')
    and (value->>'outcome' <> 'Personally reviewed' or value->>'note' ~ '[^[:space:]]')
    and (value->'spend_yen' = 'null'::jsonb or public.setu_draft_valid_index(value->'spend_yen'));
end
$$;

create table public.setu_place_update_drafts (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null,
  stop_index integer not null check (stop_index >= 0),
  observation_index integer not null check (observation_index >= 0),
  stop_name text not null check (stop_name ~ '[^[:space:]]'),
  place_ref jsonb check (place_ref is null or (jsonb_typeof(place_ref) = 'object'
    and place_ref ?& array['type','id'] and place_ref - array['type','id'] = '{}'::jsonb
    and jsonb_typeof(place_ref->'type') = 'string' and place_ref->>'type' ~ '[^[:space:]]'
    and ((jsonb_typeof(place_ref->'id') = 'string' and place_ref->>'id' ~ '[^[:space:]]')
         or public.setu_draft_valid_index(place_ref->'id'))) is true),
  observation jsonb not null check (public.setu_draft_valid_observation(observation) is true),
  primary key (owner_id, trip_id, stop_index, observation_index)
);

alter table public.setu_place_update_drafts enable row level security;
revoke all on public.setu_place_update_drafts from public, anon, authenticated;
grant select, insert on public.setu_place_update_drafts to authenticated;

create policy read_own_drafts on public.setu_place_update_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy insert_own_drafts on public.setu_place_update_drafts
  for insert to authenticated with check (owner_id = (select auth.uid()));
