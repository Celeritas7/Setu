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

## Sit long with food — Phase G1–G3

Open an area hub and select **Sit long with food · 90 min** for a stay starting now. In **My plan → Plan a day**, choose an area and date, open the same chooser, and set a check time in **Japan time**. This time checks the venue's recorded weekly opening hours; it does not assign an arrival time to the itinerary or verify holiday exceptions.

- Only saved/accepted, non-skipped sit-long places appear. Suggestions still need review in Browse. Sick-day items keep their existing visibility rules, and visibly beef-focused venues are excluded; this is not a menu-level dietary guarantee.
- Known closed venues, opening periods with less than 90 continuous minutes, and recorded stay limits below 90 minutes are excluded. Unknown hours/limits remain clearly marked; unknown hours sort last. Lunch breaks are not bridged, overnight opening is evaluated in Japan time, and 24-hour schedules have no invented closing time.
- Results show recorded minimum order/cost, seating policy, stay limit, facilities, quietness, source/check-date status and nearest explicitly saved toilet when usable coordinates exist. Unknown does not mean free, no limit, Wi-Fi available, or outside food allowed. Distances are straight-line, and toilet access is not confirmed.
- Five cards per page keep the chooser compact. Add to day changes the draft only; **Save day** is still required. Opening Plan from a hub preserves any existing draft, and a new draft first asks for the intended date/time rather than automatically adding a venue checked only for now.
- The DAY OFF map keeps its all-area, no-radius-limit trip-planning behavior. No subjective Igloo/Cocoon/Hideout tags are introduced.

The additive migration `supabase/migrations/20261115045758_setu_sit_long_fields.sql` adds the optional seating fields to both existing place tables. It was applied on 2026-11-15 without changing stored row values, ownership policies or grants. Existing null facts remain unknown. The full older G–I SQL file is a prepared plan, not evidence that later-phase tables or fields are live.

**Still pending: G4**, a visited-place policy-confirmation form. No seating-policy editing or automatic confirmation is part of G1–G3. This release changes `index.html`; the separate `Setu.dc.html` long-trip app is unchanged.
