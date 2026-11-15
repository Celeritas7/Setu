-- G4: field-specific personal seating observations. PREPARED FOR REVIEW ONLY.
-- Apply only after the user explicitly approves the migration. No changes to
-- existing data values, access policies, privileges, auth, triggers or rev logic.
-- confidence/last_checked are legacy source-wide evidence and must not be
-- rewritten when only one seating fact was personally checked.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.setu_food_notes
  add column if not exists seating_checks jsonb not null default '{}'::jsonb
  check (jsonb_typeof(seating_checks) = 'object');

alter table public.setu_spots
  add column if not exists seating_checks jsonb not null default '{}'::jsonb
  check (jsonb_typeof(seating_checks) = 'object');

comment on column public.setu_food_notes.seating_checks is
  'Personal visit-check dates per known fact: seating_type, min_order, min_order_yen, stay_limit_min -> YYYY-MM-DD. Empty means none. Unknown values must not be marked confirmed.';
comment on column public.setu_spots.seating_checks is
  'Personal visit-check dates per known fact: seating_type, min_order, min_order_yen, stay_limit_min -> YYYY-MM-DD. Empty means none. Unknown values must not be marked confirmed.';
commit;
