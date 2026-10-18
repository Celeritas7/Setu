# Setu

Day trips, places to eat and long trips. Prototype.

**Live:** https://celeritas7.github.io/Setu/

## Files
- `index.html`: home page (search, day trips, places to eat, long trips).
- `Setu.dc.html`: the long-trip planner (fare year, carriers, route lab, last mile, climate, rules). Opened from Home → Long trips.

Both are self-contained; no build step.

## Data
- **Signed in** (header → Sign in, Google, hub user): trips, bags and rules save to the hub Supabase (`setu_*` tables). ¥→₹ and climate come from the hub.
- **Signed out:** everything is saved in this browser only.
- Home page day trips and places to eat are still browser-only.
- Fares, carriers, schedules and the day-trip suggestions are MODELLED (hand-entered, not live).

## Update
Replace both HTML files with a new export and commit. Pages redeploys in about a minute.
