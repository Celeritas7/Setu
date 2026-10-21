# Setu

Day trips, places to eat and long trips. Prototype.

**Live:** https://celeritas7.github.io/Setu/

## Files
- `index.html`: home page (search, day trips, places to eat, long trips).
- `Setu.dc.html`: the long-trip planner (fare year, carriers, route lab, last mile, climate, rules). Opened from Home → Long trips.

Both are self-contained; no build step.

## Data
- **Signed in** (header → Sign in, Google, hub user): trips, bags and rules save to the hub Supabase (`setu_*` tables). ¥→₹ and climate come from the hub.
  Home page places to eat (`setu_food_notes` → `cost_management_shops` → `akatsuki_places`) and day trips (`setu_day_trips`) load from and save to the hub too. Rows with `added_by = 'claude'` show "Added by Claude".
  Hubs (`setu_hubs` + `setu_spots`): areas worth a visit with the shops in them, a street map (Leaflet + OpenStreetMap) and the saved restaurants nearby. Home → Hubs, or Map → globe with Places and Friends (from Contlas `contacts`) layers.
- **Signed out:** everything is saved in this browser only.
- Fares, carriers, schedules and the day-trip suggestions are MODELLED (hand-entered, not live).

## Update
Replace both HTML files with a new export and commit. Pages redeploys in about a minute.
