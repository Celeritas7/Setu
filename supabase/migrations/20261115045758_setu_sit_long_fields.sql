-- Phase G only. Optional facts; null means unknown, never false or free.
-- Filename matches the applied hosted migration version.
-- No existing rows, ownership, RLS policies, triggers or permissions change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.setu_food_notes
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
  add column if not exists last_checked date;

alter table public.setu_spots
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
  add column if not exists last_checked date;

comment on column public.setu_food_notes.stay_limit_min is 'null: unknown; 0: explicitly no limit; positive: maximum stay in minutes';
comment on column public.setu_spots.stay_limit_min is 'null: unknown; 0: explicitly no limit; positive: maximum stay in minutes';
comment on column public.setu_food_notes.seating_type is 'Free seating does not imply permission to bring outside food';
comment on column public.setu_spots.seating_type is 'Free seating does not imply permission to bring outside food';
commit;
