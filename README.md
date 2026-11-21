# Setu

Day trips, places to eat and long trips. Prototype.

**Live:** https://celeritas7.github.io/Setu/

## Files
- `index.html`: home page (search, day trips, places to eat, long trips).
- `Setu.dc.html`: the long-trip planner (fare year, carriers, route lab, last mile, climate, rules). Opened from Home → Long trips.
- `prompt-library.html`: reusable destination-research prompts, reachable from Home and ☰. The editable source text is `data/travel-prompt-templates.js`.

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

## Prompt Library — trip-planning templates

Open **Home → Plan a place with ChatGPT** or **☰ → Prompt Library**. Enter a destination, starting station, date (optional) and travel style, then select one of four steps: discover places, verify transport, construct a flexible itinerary, or collect live reviews. **Copy prompt** produces text with those fields filled in; **Open new ChatGPT chat** opens ChatGPT, where you paste and send the copied text, ideally inside your Travel project. Setu does **not** auto-submit to your personal ChatGPT account.

Shared templates are maintained in one file: `data/travel-prompt-templates.js`. Update its text and revision in a reviewed code change; on subsequent visits the library requests the current catalog (with a cache-busting URL). It retains the most recent successful catalog in local browser storage to use if offline. **Edit template** saves an optional *personal browser-only override* and labels it separately; **Restore latest Setu version** removes that override. Browser edits are not synchronized across devices or to Supabase, and the catalog never rewrites saved trips, reviews, or personal experience tags. See [`docs/prompt-library.md`](docs/prompt-library.md).

## Prefecture navigation and seating finder

Home now starts with **Prefectures → Area hubs → Places**, including when a theme is selected. Choose a prefecture to reveal its hubs, search within it, and browse five hubs per page. The hub page has a prefecture breadcrumb and an **Area hubs** return button.

**My plan → Plan a day** uses dependent prefecture and hub selectors instead of a wall of area buttons. Changing the area keeps the date, existing stops and unsaved settings. **Want to visit** also requires a prefecture and hub selection and shows five places per page, rather than rendering every saved place at once.

The grouping is view-only: existing IDs, hub links, reviews and tags are not rewritten. Explicit geographic fields are used first, followed by consistent linked-place address evidence. A small documented exact public-location lookup handles station/campus queries that omit the prefecture; ambiguous or contradictory geography stays **Unassigned**. Places with missing hub links remain reachable in a null-ID grouping and never acquire a fabricated database hub ID.

**Find a place to sit** is available directly on Home and in the menu. It opens without creating a day. Select a prefecture, hub, date and Japan-local start time, then optionally filter recorded price amounts. Results remain limited to five cards per page.

- **Minimum order** comes only from a recorded minimum-order amount.
- **Estimated visit budget** comes from the saved spend estimate; it is not a confirmed seating fee, minimum order or guaranteed total.
- Missing prices remain unknown. Recorded-price filters exclude them and say how many were left out. Zero remains distinct from unknown.
- Expand **Price, seating & sources** for price dates/staleness, seating policy, opening hours, facilities and source details. A 90-minute check does not reserve a seat or confirm holiday exceptions.
- **Plan with this place** creates a draft for the checked date/time only after an explicit click. If a draft already exists, the app opens it without replacing its stops. **Save day** remains required.

No database migration or record updates are required for this interface change. The DAY OFF map's all-area/no-radius behavior and the separate `Setu.dc.html` long-trip app are unchanged.

## Sit long with food — Phase G1–G3

Open an area hub and select **Sit long with food · 90 min** for a stay starting now. In **My plan → Plan a day**, choose an area and date, open the same chooser, and set a check time in **Japan time**. This time checks the venue's recorded weekly opening hours; it does not assign an arrival time to the itinerary or verify holiday exceptions.

- Only saved/accepted, non-skipped sit-long places appear. Suggestions still need review in Browse. Sick-day items keep their existing visibility rules, and visibly beef-focused venues are excluded; this is not a menu-level dietary guarantee.
- Known closed venues, opening periods with less than 90 continuous minutes, and recorded stay limits below 90 minutes are excluded. Unknown hours/limits remain clearly marked; unknown hours sort last. Lunch breaks are not bridged, overnight opening is evaluated in Japan time, and 24-hour schedules have no invented closing time.
- Results show recorded minimum order/cost, seating policy, stay limit, facilities, quietness, source/check-date status and nearest explicitly saved toilet when usable coordinates exist. Unknown does not mean free, no limit, Wi-Fi available, or outside food allowed. Distances are straight-line, and toilet access is not confirmed.
- Five cards per page keep the chooser compact. Add to day changes the draft only; **Save day** is still required. Opening Plan from a hub preserves any existing draft, and a new draft first asks for the intended date/time rather than automatically adding a venue checked only for now.
- The DAY OFF map keeps its all-area, no-radius-limit trip-planning behavior. No subjective Igloo/Cocoon/Hideout tags are introduced.

The additive migration `supabase/migrations/20261115045758_setu_sit_long_fields.sql` adds the optional seating fields to both existing place tables. It was applied on 2026-11-15 without changing stored row values, ownership policies or grants. Existing null facts remain unknown. The full older G–I SQL file is a prepared plan, not evidence that later-phase tables or fields are live.

**G4 in review:** the next phase adds **Visited / Confirm seating details** on saved food-place details, hub sit-long cards,
the standalone seating finder, planned-day seating results and sit-long spots in a hub. Previously saved facts are
prefilled but not automatically confirmed. Each personally checked field receives its own actual observation date;
unknown, ¥0, unlimited stay, visit budgets and menu examples remain distinct. These confirmations never mark a day
visited or create personal Cocoon/Igloo/Hideout tags. See [`docs/visited-seating.md`](docs/visited-seating.md).

Signed-in G4 writes remain **disabled until the separately prepared `seating_checks` migration is explicitly approved
and deployed**; local browser-only food confirmations work without it. No G4 migration is applied automatically by
opening a PR. The long-trip `Setu.dc.html` app and integration bootstrap are unchanged.

## Research Import — Phase R1 review candidate

**Home → Research Import** (also in ☰) opens the local research validator and dry-run preview. Upload or paste a
`setu_research_handoff` v1.0.0 JSON for any destination. See field errors, hub counts, five candidate cards at a time,
possible existing-place matches and saved-versus-research differences. **Download review JSON** preserves the complete
research and pending comparison. Reopen from Home to refresh the snapshot of already loaded saved places.

R1 provides preview/export only. Decisions and saving are later phases. The preview clears on reload, and comparison
is limited to records already loaded by Setu. Source dates, unknown prices, estimates, potential tags and historical
evidence remain separate. See [`docs/research-import.md`](docs/research-import.md) for the four-phase plan and pending
browser/device acceptance checks. The four research prompts remain independently maintained.
