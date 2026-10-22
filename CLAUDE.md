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
                       dish, rating 1–5, review, go_back, reviewed_on, source_url, verified
   ↑ note_id
setu_menu_items        dishes at a place to eat: name (as on the menu), name_en, price_yen + price_seen, tried, rating, note, has_beef
setu_day_trips         places to visit: name, place_id, date, notes
setu_hubs              an area worth half a day (Kichijoji, Ebisu…): name, geo_query, lat/lng, radius_m, notes, themes[]
   ↑ hub_id
setu_spots             shops/sights in a hub: kind 'shop'|'see'|'other', name, address, geo_query, why, status 'try'|'done'|'skip',
                       suggested_by, suggested_contact (→ contacts.id), source_url, verified, accepted
contacts               Contlas's friends (name, city, lat, lon). Setu reads them for the Friends layer; Contlas owns writes.
team_requests          notes for other teams (team = 'neurology' | 'psychology' | …), never shown in Setu
```

Restaurants, cafés and food stalls always go in `setu_food_notes` (with `hub_id` when they belong to a hub), never `setu_spots`. A hub shows the restaurants linked by `hub_id`, plus saved ones within 1.5 × `radius_m` or whose `area` contains the hub name.

Themes are short slugs shared by hubs, places to eat and spots: `sick-day`, `camera`. The app shows them as filter chips (Sick-day food, Camera hunt). Reuse an existing slug before inventing one.

Menus: one `setu_menu_items` row per dish. Never invent prices; set `price_seen` to the date the price was seen. Set `has_beef` when the name contains 牛 / ビーフ / beef / ハンバーグ / ミートソース.

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
- Coordinates: `geo_source` is one of `nominatim`, `owntracks`, `manual`, `link` (from a pasted map URL).

## Editing the HTML bundles

`index.html` and `Setu.dc.html` are bundler exports. The page lives in `<script type="__bundler/template">` as a JSON string (every `</` is written as `<` followed by the JSON escape backslash-u002F); scripts and fonts are gzip+base64 in `__bundler/manifest`. Decode, edit, re-encode with the same escaping, and check it round-trips before writing.
