# Setu fill guide (for Claude.ai)

Paste this into a Claude.ai chat that has the Supabase connector, then ask it, for example, "Fill sit-long details for Warabi",
"Find shrines, gurdwaras and ISKCON temples near Omiya" or "Add this year's festivals for Urawa".

## Where things go
Supabase project **General_apps** (`wylxvmkcrexwfpjpbhyy`), owner user id `e91a5f37-e63a-4fd0-8488-4d7a51d56822`.
Areas are rows in `setu_hubs` (`select id, name from setu_hubs where deleted_at is null`). Places to eat are `setu_food_notes`,
shops / sights / places to sit / shrines / temples are `setu_spots` (with `hub_id`), festivals are `setu_festivals`.

Every write runs in one transaction as the owner, and an update must bump `rev`:
```sql
begin;
select set_config('request.jwt.claims', '{"sub":"e91a5f37-e63a-4fd0-8488-4d7a51d56822","role":"authenticated"}', true);
insert into setu_spots (...) values (...);          -- or: update setu_spots set ..., rev = rev + 1 where id = '...';
commit;
```

## Rules (always)
- **Never invent** prices, timings, hours, dates, ratings or coordinates. Unknown stays null. Every fact needs a source.
- Your own finds: `added_by = 'claude'`, `accepted = false` (they wait in Browse for the user to accept).
- Every row: `source_url`, `suggested_by` (who / which site), `last_checked` (today), `confidence`:
  `confirmed` (official page or the place itself), `reviews` (Google / blog reviews only), `unverified` (search snippet only).
  Also a one-line `verified` text, e.g. "Langar times from the gurdwara's Facebook page, 2026-11-04".
- No duplicates: search `setu_food_notes.name`, `setu_spots.name`, `setu_festivals.name` (English and Japanese) first; update instead.
- Coordinates: fill `geo_query` (address or station) and leave `lat/lng` null; the app pins it from OpenStreetMap.
- Never hard-delete (`deleted_at = now()`), and never delete or overwrite a spot with `status = 'done'` (the user went there):
  add to `verified` instead.
- No beef in `dish`. ¥3,000+ per person → add the `group-visit` theme.
- Opening hours go in `hours` (Asia/Tokyo) as `{"mon":[["11:00","20:00"]], ...}`; `[]` = closed that day; missing day = unknown;
  past midnight as `26:00`. Set `hours_seen` to the date the hours were seen.

## G · Sit long with food (places to eat, and sit-long spots)
Add the `sit-long` theme (plus `rain-ok` if covered), then fill what a source says:

| column | values |
|---|---|
| `seating_type` | `free_seating` (sit without buying) · `buy_to_sit` (order needed) · `own_food_ok` (bring your own) · `unknown` |
| `min_order` / `min_order_yen` | e.g. "one drink per person" / 300 |
| `stay_limit_min` | minutes; `0` = no limit; null = unknown |
| `outlets`, `wifi` | true / false / null |
| `quiet` | 1 busy · 2 normal · 3 quiet |
| `smoke_free` | `yes` · `no` · `partly` |
| `setting` | `indoor` · `outdoor` · `both` |
| `feel` | one line, e.g. "Bright, big tables, students working for hours" |
| `spend_yen` + `spend_seen` | typical spend per person, dated |

A policy only from reviews → `confidence = 'reviews'` (the app shows "policy unverified").

## H · Religious and community places (spots)
`kind = 'see'`, theme `jinja`, `gurdwara`, `iskcon` or `free-meal` (a free or donation meal anywhere also gets `free-meal`).
Opening hours in `hours`; type facts in `details` (jsonb, only keys a source supports):

- **jinja** (shrine): `{"shamusho": true, "shamusho_hours": "9:00-16:00", "goshuin": true, "goshuin_yen": 500, "toilet": true, "benches": true}`
  plus `quiet` (1–3).
- **gurdwara**: `{"langar": [{"days": ["sun"], "from": "11:00", "to": "14:00"}], "langar_free": true, "langar_veg": true,
  "dress": "Cover your head (scarves at the door), shoes off", "contact": "phone / email / page"}`
- **iskcon**: `{"feast": [{"days": ["sun"], "from": "16:00", "to": "19:00", "what": "Sunday feast"}], "prasad_cost": "donation", "veg": true}`
- **free-meal**: `{"meal": [{"days": ["sat"], "from": "12:00", "to": "13:00"}], "cost": "free", "veg": true}`

Days are `mon`…`sun`. Re-check timings every 60 days: update `last_checked` (and `rev`).

## I · Festivals (`setu_festivals`)
One row per festival per year: `hub_id`, `kind` (`matsuri` · `sikh` · `iskcon` · `other`), `name`, `starts_on`, `ends_on`
(null = one day), `date_status` (`confirmed` = this year's date from a source; `guess` = from past years), `location`
(text, or `spot_id` when it is a saved spot), `what` (what happens, one or two lines), `crowd` (`low` · `medium` · `high`),
`cost` / `cost_yen`, `source_url`, `last_checked`, `added_by 'claude'`, `accepted false`.
`near` links places for the day: `[{"t":"food","id":"<setu_food_notes.id>"},{"t":"spot","id":"<setu_spots.id>"}]`
(food, toilets, sit-long places). Refresh monthly; when a guessed date is confirmed, set `date_status = 'confirmed'`.

## Afterwards
Tell the user how many rows you added or updated per area, and list anything you couldn't source.
