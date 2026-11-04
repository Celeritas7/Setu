-- Setu phases G–I: fields Claude.ai fills (see docs/fill-guide.md). Additive only; nothing existing changes.

-- G · Sit long with food (places to eat and spots). H reuses quiet, confidence and last_checked.
alter table setu_food_notes
  add column if not exists seating_type text check (seating_type in ('free_seating','buy_to_sit','own_food_ok','unknown')),
  add column if not exists min_order text,
  add column if not exists min_order_yen integer check (min_order_yen >= 0),
  add column if not exists stay_limit_min integer check (stay_limit_min >= 0),   -- null = unknown, 0 = no limit
  add column if not exists outlets boolean,
  add column if not exists wifi boolean,
  add column if not exists quiet smallint check (quiet between 1 and 3),       -- 1 busy · 3 quiet
  add column if not exists smoke_free text check (smoke_free in ('yes','no','partly')),
  add column if not exists setting text check (setting in ('indoor','outdoor','both')),
  add column if not exists feel text,                                          -- one line: what it feels like to sit there
  add column if not exists confidence text check (confidence in ('confirmed','reviews','unverified')),
  add column if not exists last_checked date;

alter table setu_spots
  add column if not exists seating_type text check (seating_type in ('free_seating','buy_to_sit','own_food_ok','unknown')),
  add column if not exists min_order text,
  add column if not exists min_order_yen integer check (min_order_yen >= 0),
  add column if not exists stay_limit_min integer check (stay_limit_min >= 0),
  add column if not exists outlets boolean,
  add column if not exists wifi boolean,
  add column if not exists quiet smallint check (quiet between 1 and 3),
  add column if not exists smoke_free text check (smoke_free in ('yes','no','partly')),
  add column if not exists setting text check (setting in ('indoor','outdoor','both')),
  add column if not exists feel text,
  add column if not exists confidence text check (confidence in ('confirmed','reviews','unverified')),
  add column if not exists last_checked date,
  -- H · per-type facts for jinja / gurdwara / iskcon / free-meal spots (keys in docs/fill-guide.md)
  add column if not exists details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object');

-- I · Festival tracking
create table if not exists setu_festivals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  hub_id uuid references setu_hubs(id),
  spot_id uuid references setu_spots(id),            -- where it happens, when that place is a saved spot
  kind text not null default 'other' check (kind in ('matsuri','sikh','iskcon','other')),
  name text not null,
  starts_on date not null,
  ends_on date,
  date_status text not null default 'guess' check (date_status in ('confirmed','guess')),   -- confirmed for this year, or a guess from past years
  location text,
  what text,
  crowd text check (crowd in ('low','medium','high')),
  cost text,
  cost_yen integer check (cost_yen >= 0),
  near jsonb not null default '[]'::jsonb check (jsonb_typeof(near) = 'array'),   -- [{t:'food'|'spot', id}] food, toilets, sit-long nearby
  source_url text,
  last_checked date,
  notes text,
  added_by text not null default 'me' check (added_by in ('me','claude')),
  accepted boolean not null default true,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists setu_festivals_user_date on setu_festivals (user_id, starts_on) where deleted_at is null;
alter table setu_festivals enable row level security;
drop policy if exists setu_festivals_own on setu_festivals;
create policy setu_festivals_own on setu_festivals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists setu_festivals_touch on setu_festivals;
create trigger setu_festivals_touch before insert or update on setu_festivals for each row execute function setu_touch();
revoke all on setu_festivals from anon;
grant select, insert, update, delete on setu_festivals to authenticated;
