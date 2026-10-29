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
- [ ] C1 · Move the old Musashi-Urawa café cards (S PRESS CAFE, Saint Marc Café) from spots to places to eat
- [ ] C2 · Set pin from a map link also updates `verified`
- [ ] C3 · Indoor benches near Musashi-Urawa: building name + exact pin (needs the user)
- [ ] C4 · Overnight hours (e.g. 17:00–02:00) instead of ending at 24:00

## Phase D — More areas
- [ ] D1 · Area searches: Minami-Urawa, Warabi, Urawa, Kita-Urawa, Omiya (each fills Browse)
- [ ] D2 · "Search this area" button in a hub that queues a request for Claude

## Phase E — Day trips
- [ ] E1 · Weather on day-trip pages (Akatsuki weather view)
- [ ] E2 · "Eat there" lists saved places nearby plus sourced suggestions
- [ ] E3 · Fares, once there is a real source

## Phase F — Other apps (need the user's OK; touch the hub)
- [ ] F1 · Contlas hub card shows places to eat and hides sick-day items
- [ ] F2 · Setu ↔ Contlas read each other through Akatsuki views, not tables
- [ ] F3 · Akatsuki acknowledges R048 (prompt given to the user)
