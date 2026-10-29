# Setu

Day trips, places to eat and long trips. Two self-contained HTML bundles, no build step (see README.md).

## Adding places for the user (Supabase)

Data lives in the hub Supabase project **General_apps** (`wylxvmkcrexwfpjpbhyy`). Owner user id: `e91a5f37-e63a-4fd0-8488-4d7a51d56822`.
The Home page (`index.html`) reads these tables when the user is signed in, so a row inserted here shows in the app on reload.

```
akatsuki_places        one row per real location (id slug, label, aliases, lat/lng, radius_m, class)
   ↑ place_id
akatsuki_shops         Cost's shop list (view, read-only for Setu). cost_management_shops is Cost's table: Setu never writes it.
   ↑ shop_id (optional link)
setu_food_notes        a place to eat: name, area, address, geo_query, lat/lng, geo_source, hub_id, themes[], status 'try' | 'done',
                       dish, rating 1–5, review, go_back, reviewed_on, source_url, verified, hours, hours_seen, sick_effect, sick_effect_on,
                       accepted (false = suggestion), intro, spend_yen + spend_seen, suggested_by
   ↑ note_id
setu_menu_items        dishes at a place to eat: name (as on the menu), name_en, price_yen + price_seen, tried, rating, note, has_beef
setu_day_trips         places to visit: name, place_id, date, notes
setu_routes            saved routes: name ('commute'), stops = setu_hubs ids in travel order
setu_hubs              an area worth half a day (Kichijoji, Ebisu…): name, geo_query, lat/lng, radius_m, notes, themes[]
   ↑ hub_id
setu_spots             shops/sights in a hub: kind 'shop'|'see'|'other', name, address, geo_query, why, status 'try'|'done'|'skip',
                       suggested_by, suggested_contact (→ contacts.id), source_url, verified, accepted, hours, hours_seen,
                       intro, spend_yen + spend_seen
setu_outings           a planned day out: date, hub_id, title, stops jsonb [{t:'food'|'spot', id}] in visiting order, rainy, status
                       'planned'|'done'|'cancelled'
contacts               Contlas's friends (name, city, lat, lon). Setu reads them for the Friends layer; Contlas owns writes.
team_requests          notes for other teams (team = 'neurology' | 'psychology' | …), never shown in Setu
```

Restaurants, cafés and food stalls always go in `setu_food_notes` (with `hub_id` when they belong to a hub), never `setu_spots`. A hub shows the restaurants linked by `hub_id`, plus saved ones within 1.5 × `radius_m` or whose `area` contains the hub name.

Themes are short slugs shared by hubs, places to eat and spots: `sick-day`, `camera`, `local-grocery`, `cafe`, `group-visit` (costs ¥3,000+ per person: only with friends), `sit-long` (somewhere to sit for a while: benches, gardens, cafés that let you stay), `rain-ok` (covered; add it next to `sit-long`). Reuse an existing slug before inventing one. Ordinary themes (`camera`) show as filter chips. `sick-day` is special: anything tagged with it is hidden everywhere in the app unless the user turns on Sick-day mode from the ☰ menu, so tag sick-only places with it and nothing else.

Menus: one `setu_menu_items` row per dish. Never invent prices; set `price_seen` to the date the price was seen. Set `has_beef` when the name contains 牛 / ビーフ / beef / ハンバーグ / ミートソース.

Comfort food (HealthLog → Setu, Akatsuki R045, route `setu → healthlog comfort.spots`, proposed until HealthLog's first real call).
Two functions, signed-in users only (no anon), security invoker so RLS limits each user to their own rows. `setu_spot_id` = `setu_food_notes.id`.
- `setu_comfort_spots_near(p_lat, p_lng, p_km = 2, p_themes = '{comfort,remedy}', p_ids = null, p_at = now(), p_limit = 6)` →
  setu_spot_id, kind ('food'), name, address, station, distance_m, open_state, hours_today, suggested_dish, map_link, helped, status.
  Themes: `remedy` = helped before (`sick_effect` some/good), `comfort` = tagged `sick-day`, other values literal; `p_ids` skips themes.
  Order: helped first, then known hours, then nearest.
- `setu_comfort_spots(p_at = now(), p_route = 'commute', p_limit = 6)` → setu_spot_id, name, address, station, stop_no, open_state,
  hours_today, suggested_dish, map_link, helped, status, why. Helped first, then the best open place at each station in route order.
- `open_state` returned: `open`, `closes_soon` (closes within 45 min), `unknown` (no hours for that day, or only a closing time
  and it's before 10:00). Closed places are never returned, and neither is a beef dish. To keep it right:
- `setu_food_notes.hours` (Asia/Tokyo): `{"mon":[["11:00","20:00"]], ...}`; `[]` = closed that day; a missing day = unknown;
  `[null,"21:00"]` = only the closing time is known. Set `hours_seen` to the date the hours were seen.
  A closing time past midnight is stored past 24:00 (`["17:00","26:00"]` = 17:00–02:00, up to `30:00`) and shown as the clock
  time; `setu_open_state` / the app treat last night's slot as open in the early hours. Type `17:00-02:00` in the editor.
  `setu_spots.hours` / `hours_seen` use the same shape; shops show the same Open / Closed badge in a hub and on the theme board.
- `sick_effect` / `sick_effect_on`: whether eating there helped when unwell, as last logged (HealthLog's `healthlog_food_remedies.effect`).
- `dish`: a no-beef suggestion; a tried, rated, no-beef `setu_menu_items` row wins over it.
- `setu_routes`: `commute` = Ageo → Omiya → Saitama-Shintoshin → Kita-Urawa → Urawa → Minami-Urawa (hub ids in order).

### Searching an area ("search <area> for local shops")

When the user asks for an area, record **everything worth knowing in that circle**, not a sample:
cafés (`setu_food_notes`, theme `cafe`), places to eat, big vegetable / grocery shops (spot `kind 'shop'`, `local-grocery`),
famous places to visit (`kind 'see'`), and places to sit for a long time, both covered for rainy days (`sit-long` + `rain-ok`:
cafés that let you stay, station concourses, libraries, malls with seating) and outdoors for dry days (`sit-long`: parks, gardens,
benches). Go wide: places up to 1–2 hours' walk from the station are welcome; say the walk time in the intro.
Make the hub first if the area has none (rule 4 for its coordinates).

Every row: `added_by 'claude'`, **`accepted = false`** (so it waits in Browse, not in the plan), `intro` (2–3 lines: what it is,
what it's like inside, how long you can stay, anything to know at the door), `dish` = what it's known for (no beef), `spend_yen` =
typical spend per person with `spend_seen` (from a source, never invented; leave null if unknown), `hours` + `hours_seen` when a source
gives them, `suggested_by` + `source_url` (rule 5), `verified` with the date. **¥3,000 or more per person → add `group-visit`**:
the user goes to those only with friends. Check duplicates first (rule 1). Afterwards tell the user how many landed in Browse.

### Browse (the "screensaver")

Home → **Browse suggestions** (also in ☰) shows every `accepted = false` place to eat and spot full-screen, one at a time, every 15 s:
kind, hub + walk from the station, name, "Known for", intro, cost per person (gold at ¥3,000+ with a Group visit badge), open now,
source. Holding the card pauses it. **+ Add to plan / Add to try list** sets `accepted = true, status 'try'`; **Group visit** toggles
the `group-visit` tag; **Not for me** sets a spot to `status 'skip'` and soft-deletes a place to eat. Suggestions never show in the
plan lists, hubs' Eat nearby, Right now or the comfort-food functions until accepted.

### My plan / Plan a day

Home strip and ☰ → **My plan**: planned days (`setu_outings`) and everything you want to visit (accepted places to eat with
status `try`, accepted spots with status `try`) grouped by hub. **Plan a day**: pick a date and an area; **Suggest stops** picks up
to 5 places open that day (a day with `hours` `[]` is closed; unknown hours are allowed), about 2 sights, a café, a meal under
¥3,000, a place to sit, then shops, in nearest-first walking order from the hub station. **Rain plan** drops outdoor stops (sights or
`sit-long` without `rain-ok`). Suggest also swaps out stops that are closed that day. The day shows walk times (80 m/min), total
cost from `spend_yen`, warnings, and one Google Maps walking route. **Mark visited** sets the outing `done` and its spots `done`;
places to eat stay `try` until reviewed. Phases and what's next: `ROADMAP.md`.

### Rules

1. **No duplicates.** Before inserting, search `setu_food_notes.name`, `setu_spots.name`, `akatsuki_shops.name`, `akatsuki_places.label` and `.aliases` case-insensitively, in English and Japanese. If it exists, update it.
2. **One location record.** A place to eat, hub or spot keeps its own `lat/lng`. For day trips, add the location to `akatsuki_places` once (`added_by 'setu'`, class in the `place_class` vocab: home, office, transit, cafe, out) and point `setu_day_trips.place_id` at it. Use the user's OwnTracks visits (`akatsuki_visits`) for coordinates when they are at the place; never guess coordinates.
3. **Mark Claude's rows.** `added_by = 'claude'` on `setu_food_notes`, `setu_day_trips`, `setu_hubs` and `setu_spots`. A spot Claude found itself (not from the user or a friend) is `accepted = false`, so the user sees Accept / Dismiss.
4. **Coordinates for hubs and spots.** Fill `geo_query` (an address or station name) and leave `lat/lng` null. The browser geocodes it with OpenStreetMap on next load and saves `geo_source 'nominatim'`. Fill `lat/lng` directly only from OwnTracks visits (`geo_source 'owntracks'`). Record what was checked in `verified`, with a date.
5. **Source quality.** Say where a spot came from in `suggested_by` and `source_url`. Note it when the source is the shop's own advert.
6. **Status.** A restaurant the user wants to visit is `status 'try'`. One they have been to is `'done'` with `reviewed_on`. Don't invent a rating; leave it null and ask.
7. **Never hard-delete.** Set `deleted_at = now()`.
8. **Short reviews.** One or two lines, the facts the user needs at the door (meal-only vs. work-OK, price, closing time). Date prices and rules ("seen 2026-10-18").
9. **Private notes stay out of the app.** Health, feelings, anything for the neurology/psychology teams goes to `team_requests`, not into a review or note.
10. **Dietary:** the user eats no beef (牛肉 / ビーフ, hamburg steak, meat sauce). Flag it on dishes.

### Writing via SQL

- `setu_*` tables have a trigger (`setu_touch`) that sets `user_id := auth.uid()` on insert and requires `rev = old.rev + 1` on update. When inserting with the service connection, run in one transaction:
  ```sql
  begin;
  select set_config('request.jwt.claims', '{"sub":"e91a5f37-e63a-4fd0-8488-4d7a51d56822","role":"authenticated"}', true);
  insert into setu_food_notes (...) values (...);
  commit;
  ```
- Updates: `set ..., rev = rev + 1`.
- Coordinates: `geo_source` is one of `nominatim`, `owntracks`, `manual`, `link` (from a pasted map URL), `places` (Google Places via Discover).

### Map links

The app takes a pasted Google / Apple Maps link in the Home search (save as a place to eat, or as a shop in a hub within 3 km),
in a hub's "Add a shop" form, and in "Set pin from map link" on places and shops without a pin. Full links are read in the browser:
`!3d<lat>!4d<lng>` is the place itself; `@lat,lng` is only the camera; `/maps/place/<name>/` is the name. A dropped pin (no place name)
shares as `/maps/search/<lat>,<lng>`, `/maps/place/35°50'39.6"N 139°38'50.0"E` or `/maps/dir/…/<lat>,<lng>`; those coordinates are the pin. Short share links
(`maps.app.goo.gl/…`) are followed by the Setu edge function **`setu-map-link`** (POST `{url}`, signed-in only, map hosts only,
no API key) which returns `{status, name, lat, lng, precise, final_url}`. Pins from a link are saved with `geo_source 'link'` and the
link in `source_url` (places to eat). When you have a Google Maps link for a place, prefer it over geocoding an address.

### Save where I am

Home → Right now → **+ Save where I am** takes a fresh high-accuracy phone fix and saves it with `geo_source 'manual'` and
`verified` = "Pinned from phone GPS ±N m, <date>". Types: Sit long outdoors / covered (spot `kind 'other'`, `sit-long` [+ `rain-ok`]),
Café / place to eat (`setu_food_notes`, status `try`), Grocery / veg (spot `kind 'shop'`, `local-grocery`), Sight (`kind 'see'`),
Other shop. Spots go to the nearest hub within 3 km, status `done`. Right now keeps listing `sit-long` and `local-grocery` spots
after a visit, since they're for going back to.
**Edit** on a hub's spot card and **Edit · hours** on a place-to-eat page change the name, note (spots) or address (places to eat),
type (spots), the `sit-long` / `rain-ok` / `local-grocery` tags and the hours (one line per day: `10:00-20:00`, `11:30-14:00, 17:00-22:00`,
`closed`, `-21:00`, `17:00-02:00` past midnight, empty = unknown). Changing hours sets `hours_seen` to today. **Hide** (tap twice) sets `deleted_at`.
Hub cards count shops, sights and places to sit (`sit-long`) separately.
Location history: Setu reads Akatsuki's **`akatsuki_visit_points`** (R048, route `hub → setu visit.points`; own stays with lat/lng,
last 90 days, signed-in only). Other apps keep `akatsuki_visits_recent` (no coordinates). Setu uses it for: **Set pin / Fix pin**
(spots and places to eat with no pin or a rough `nominatim` pin list the stays within 1.5 km; picking one saves `geo_source 'owntracks'`
and "Pinned from your stay <date> <times> (OwnTracks ±N m)" in `verified`), **Last here <date>** on spots and places to eat (a stay
within ~100 m), and the **Right now** fallback when the phone won't share location (latest stay, "<hub> area").

### Map (☰ → Map)

A d3 globe that zooms (wheel, two fingers, + / −) and, past `GLOBE_MAX` (60×), switches to a Leaflet street map at the same
centre; zooming the street map out to level 5 returns to the globe. Jump chips: 📍 Where am I (phone location or last stay),
World / Japan (globe), Kanto / Saitama / Tokyo (street), friends' cities abroad (globe), every hub (street, zoom 15). **Show** chips
filter by theme. Pins: hubs white, places to eat red, shops and sights yellow, `sit-long` green, suggestions faint and dashed,
friends teal, you blue; on the globe places appear from 8× zoom. Tap a pin for details; accepted to-visit places can be
**picked**, then **Plan a day with these** opens the day editor with them as stops.

### Discover around a hub

A hub's "Discover around here" calls the hub's edge function `akatsuki-places-nearby` with `{lat, lng, mode:'explore', types, radius_m}`
(Akatsuki route `setu → hub place.explore`). Food = `restaurant`,`cafe`; Sights = `tourist_attraction`. It uses the shared monthly Google
Places budget and is cached 30 days per spot. Saved results get `geo_source 'places'`, `place_ref` = the Google place id (used to spot
duplicates) and `source_url` = `https://www.google.com/maps/place/?q=place_id:<id>`. Camera shops aren't an explore type: add them by hand,
by map link, or as Claude suggestions (`accepted = false`, sourced). Hub area links search the hub's `geo_query` (its station name).

## Editing the HTML bundles

`index.html` and `Setu.dc.html` are bundler exports. The page lives in `<script type="__bundler/template">` as a JSON string (every `</` is written as `<` followed by the JSON escape backslash-u002F); scripts and fonts are gzip+base64 in `__bundler/manifest`. Decode, edit, re-encode with the same escaping, and check it round-trips before writing.
