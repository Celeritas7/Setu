# Setu roadmap

Phases agreed with the user. Each phase ships as its own PR. Mark a line `[x]` when it is merged.
Data rules and the schema live in `CLAUDE.md`; this file is only the plan.

## Done (Oct 24–25, 2026)
- [x] Home order: Hubs → Places to eat → Day trips (#7)
- [x] Opening hours and Open / Closed badges on shops (#7)
- [x] Save where I am (#8)
- [x] Edit / hours / Hide on shops and places to eat; hub cards count shops, sights, places to sit (#9)
- [x] Location history: Fix pin from a stay, "Last here", Right now fallback (#9, Akatsuki R048)
- [x] Browse suggestions with group visits ¥3,000+ (#9); first area search: Musashi-Urawa + Higashi-Urawa (66 places)
- [x] Map links read dropped pins (#10); review fixes (#11)

## Phase A — Plan a day
- [x] A1 · `setu_outings` table (date, area, ordered stops, rain plan, status)
- [x] A2 · My plan screen: planned days + everything you want to visit, grouped by area, with cost
- [x] A3 · Plan a day: date + area → Suggest stops (open that day, nearest-first walking order), reorder / remove / add,
      walk times, total cost, group-visit and closed-that-day warnings, rain plan swaps outdoor stops for covered ones,
      one "Route in Maps" link, Save, Mark visited, Delete
- [x] A4 · Home strip: next planned day, or "My plan · N places to visit"
- [ ] A5 · "When?" on Add to plan (Browse and cards): Someday / This weekend / pick a date
- [ ] A6 · Send a planned day to the Calendar app (Akatsuki route `setu → cal trip.segment`, proposed)
- [ ] A7 · Real weather for the planned date (Akatsuki `akatsuki_weather`) to switch the rain plan on automatically

## Phase B — Map: globe to street
- [x] B1 · Zoom on the globe (pinch, scroll, + / −)
- [x] B2 · Jump chips: regions (Saitama, Tokyo, Japan, abroad), hubs, tags (Sit long, Camera hunt, Local grocery…)
- [x] B3 · Close zoom switches to the street map with every saved place pinned (food / shop / sit colours, suggestions faint)
- [x] B4 · "Where am I" button (phone location or last stay)
- [x] B5 · Pick places on the map → "Plan a day with these"

## Phase C — Tidy-up
- [x] C1 · Move the old Musashi-Urawa café cards (S PRESS CAFE, Saint Marc Café) from spots to places to eat
- [x] C2 · Set pin from a map link also updates `verified`
- [ ] C3 · Indoor benches near Musashi-Urawa: building name + exact pin (needs the user)
- [x] C4 · Overnight hours (e.g. 17:00–02:00) instead of ending at 24:00

## Phase D — More areas
- [x] D1 · Area searches: Minami-Urawa, Warabi, Urawa, Kita-Urawa, Omiya (each fills Browse) — 136 places on 2026-10-29; grocery shops thin, search again later
- [x] D2 · "Search this area" button in a hub that queues a request for Claude

## Phase E — Day trips
- [ ] E1 · Weather on day-trip pages (Akatsuki weather view)
- [ ] E2 · "Eat there" lists saved places nearby plus sourced suggestions
- [ ] E3 · Fares, once there is a real source
- [ ] E4 · "Getting back" card on every day trip (requested 2026-11-01, after a friend's train home from Otaki turned out
      to be suspended): last train and last bus home, each with `source_url` + checked date (operator's own page, not only
      Google Maps; watch for 運休 / 廃止 / 代行バス); a backup way back (the other mode, or a local taxi phone number and a
      sourced fare); a "Leave by" time that aims for the second-to-last departure; a stale warning after 60 days;
      a short checklist (ask at the station on arrival, photo of the stop timetable, cash for the bus, power bank).
      Never fill a time without a source.

## Phase F — Other apps (need the user's OK; touch the hub)
- [ ] F1 · Contlas hub card shows places to eat and hides sick-day items
- [ ] F2 · Setu ↔ Contlas read each other through Akatsuki views, not tables
- [ ] F3 · Akatsuki acknowledges R048 (prompt given to the user)

## Phase G — Sit long with food (requested 2026-11-01, not started)
- [ ] G1 · Fields on `setu_food_notes` (and `setu_spots` for sit-long spots), themes keep `sit-long`:
      `seating_type` (`free_seating` | `buy_to_sit` | `own_food_ok` | `unknown`), `min_order` (text) + `min_order_yen`,
      `stay_limit_min` (null = unknown, 0 = no limit), `outlets`, `wifi`, `quiet` 1–3, `smoke_free` (yes / no / partly),
      `indoor` (indoor / outdoor / both), `policy_source` (`confirmed` | `from reviews` | `unverified`) + `policy_seen`
- [ ] G2 · "Sit long with food" filter on the hub page and in Plan a day: open now and for 90+ more minutes
      (unknown hours shown last, marked), sorted by cost to sit, then quiet, then distance; smoke-free first;
      beef-focused places hidden while no-beef is on
- [ ] G3 · Result card: cost to sit, one-line feel, seating type, closing time, nearest toilet (`toilet` theme spot),
      "Policy unverified" badge when it comes from reviews only
- [ ] G4 · "Visited" button that corrects seating type, stay limit and cost (sets `policy_source 'confirmed'`, `policy_seen` today)

## Phase H — Pre-saved religious and community places (requested 2026-11-01, not started)
- [ ] H1 · Spot fields: `last_checked`, `confidence` (`confirmed` | `from reviews` | `unverified`), `details` jsonb per type;
      new theme slugs `jinja`, `gurdwara`, `iskcon`, `free-meal`
- [ ] H2 · Shrines (`jinja`): name, address, hours, staffed office (shamusho), goshuin, toilet, benches, quiet level
- [ ] H3 · Gurdwaras: langar days and hours, free, vegetarian, dress rules (head covering), visitor contact
- [ ] H4 · ISKCON temples: Sunday feast / prasad times, cost or donation, vegetarian
- [ ] H5 · Other free or donation meals (temple meals, community kitchens) tagged `free-meal`
- [ ] H6 · Every row has `source_url`, `last_checked`, `confidence`; timings never filled without a source
- [ ] H7 · "May be stale" notice when hours or langar times are older than 60 days (badge on the card + a Home strip line)

## Phase I — Festival tracking (requested 2026-11-01, not started)
- [ ] I1 · `setu_festivals` table: hub_id, name, starts_on, ends_on, location (spot or text), what happens, crowd level, cost,
      `date_status` (`confirmed` for this year | `guess` from previous years), `source_url`, `last_checked`, `accepted`
- [ ] I2 · Cover local matsuri, Sikh festival days at the gurdwara, ISKCON festivals (each needs a source)
- [ ] I3 · "Coming up" strip on each hub: next 30 days
- [ ] I4 · Reminders 7 days and 1 day before a festival on the commute (Warabi → Ageo) or at a saved hub
- [ ] I5 · Link a festival to nearby food, toilets and sit-long spots; "Plan this day" opens Plan a day with them as stops

## Phase J — Pre-fetch and refresh (with G–I)
- [ ] J1 · Adding a hub queues all three searches (sit long with food, religious / community places, festivals) by setting
      `search_requested_at`; results land as suggestions (`accepted = false`) until confirmed
- [ ] J2 · Refresh festivals monthly and religious timings every 60 days (a scheduled Claude task; bumps `last_checked`)
- [ ] J3 · A refresh never deletes or overwrites a spot the user marked visited (`status 'done'`); it only adds a note
      or flags it stale

### Open questions for G–J
- Reminders (H7, I4): Setu has no push. Options: a Home strip when the app opens, or send to the Calendar app via A6.
- Pre-fetch (J1): the browser can't run Claude. A hub add can queue the request; a scheduled task (or the next session)
  runs it. Needs the user's OK for a recurring task.
- "No-beef setting" (G2): today no-beef is always on (dishes flagged); a toggle would be new.
- Suggested order: G (fits existing places to eat) → H → I → J.
