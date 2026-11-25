-- PROPOSED ONLY: separate approval is required before using this on General_apps.
-- Exactly six existing browser-role grants; preserve CRUD, RLS, data and defaults.
-- This is a separate permission repair, not part of the R4 migration directory.
revoke truncate on table public.setu_hubs, public.setu_food_notes, public.setu_spots from anon, authenticated;
