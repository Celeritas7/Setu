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

## Nearby map
Open **☰ → Map → Near me** and allow location. Nearby saved places and suggestions are sorted by distance, five at a time.
**Filters** adjusts distance and type. **DAY OFF** opens trip-planning mode: all saved DAY OFF destinations, all regions, no radius limit. It clears inherited nearby/type filters, stops GPS following and fits the destination pins. **All DAY OFF destinations** restores this view after narrowing your search.
Choose **Near me** explicitly to apply a radius to DAY OFF. **Search this area** uses the visible map bounds, not a hidden 3 km circle; it is available after either panning or zooming. The area picker also supports manual browsing without GPS.
Locations missing coordinates are listed separately under **Browse names**, rather than shown as nearby.
Map location updates stop when you leave or hide the map; they do not create location-history records.

Run the bundled-runtime regression checks with `node --test tests/*.test.mjs` (Node 18+; no extra dependencies).
