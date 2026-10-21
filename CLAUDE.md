# Setu

Day trips, places to eat and long trips. Two self-contained HTML bundles, no build step (see README.md).

## Adding places for the user (Supabase)

Data lives in the hub Supabase project **General_apps** (`wylxvmkcrexwfpjpbhyy`). Owner user id: `e91a5f37-e63a-4fd0-8488-4d7a51d56822`.
The Home page (`index.html`) reads these tables when the user is signed in, so a row inserted here shows in the app on reload.

```
akatsuki_places        one row per real location (id slug, label, aliases, lat/lng, radius_m, class)
   ↑ place_id
cost_management_shops  one row per restaurant/café (name, category 'Restaurant' | 'Café', region 'JPY', place_id)
   ↑ shop_id
setu_food_notes        user's status for a shop: status 'try' | 'done', dish, area, rating 1–5, review, go_back, reviewed_on
setu_day_trips         places to visit: name, place_id, date, notes
team_requests          notes for other teams (team = 'neurology' | 'psychology' | …), never shown in Setu
```

### Rules

1. **No duplicates.** Before inserting, search `cost_management_shops.name`, `akatsuki_places.label` and `akatsuki_places.aliases` case-insensitively, in English and Japanese. If it exists, update it.
2. **One location record.** If the location is known, add it to `akatsuki_places` once (`added_by 'setu'`, class must be in the `place_class` vocab: home, office, transit, cafe, out) and point `cost_management_shops.place_id` / `setu_day_trips.place_id` at it. Use the user's OwnTracks visits (`akatsuki_visits`) for coordinates when they are at the place; never guess coordinates.
3. **Mark Claude's rows.** `added_by = 'claude'` on `setu_food_notes` and `setu_day_trips`.
4. **Status.** A restaurant the user wants to visit is `status 'try'`. One they have been to is `'done'` with `reviewed_on`. Don't invent a rating; leave it null and ask.
5. **Never hard-delete.** Set `deleted_at = now()`.
6. **Short reviews.** One or two lines, the facts the user needs at the door (meal-only vs. work-OK, price, closing time). Date prices and rules ("seen 2026-10-18").
7. **Private notes stay out of the app.** Health, feelings, anything for the neurology/psychology teams goes to `team_requests`, not into a review or note.
8. **Dietary:** the user eats no beef (牛肉 / ビーフ, hamburg steak, meat sauce). Flag it on dishes.

### Writing via SQL

- `setu_*` tables have a trigger (`setu_touch`) that sets `user_id := auth.uid()` on insert and requires `rev = old.rev + 1` on update. When inserting with the service connection, run in one transaction:
  ```sql
  begin;
  select set_config('request.jwt.claims', '{"sub":"e91a5f37-e63a-4fd0-8488-4d7a51d56822","role":"authenticated"}', true);
  insert into setu_food_notes (...) values (...);
  commit;
  ```
- Updates: `set ..., rev = rev + 1`.
- `cost_management_shops.id` is an identity column; don't pass it.

## Editing the HTML bundles

`index.html` and `Setu.dc.html` are bundler exports. The page lives in `<script type="__bundler/template">` as a JSON string (every `</` is written as `<` followed by the JSON escape backslash-u002F); scripts and fonts are gzip+base64 in `__bundler/manifest`. Decode, edit, re-encode with the same escaping, and check it round-trips before writing.
