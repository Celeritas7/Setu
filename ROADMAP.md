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
- [x] A5 · "When?" on Add to plan (Browse and hub cards): Someday / This weekend / pick a date; a date puts it on that day's plan
- [ ] A6 · Send a planned day to the Calendar app (Akatsuki route `setu → cal trip.segment`, proposed)
- [x] A7 · Real weather for the planned date (Akatsuki `akatsuki_weather`) to switch the rain plan on automatically (7 days ahead)

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
- [x] E1 · Weather on day-trip pages (hub forecast R042, up to 15 days ahead; trips get a pin from OpenStreetMap)
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

## Phase G — Sit long with food (G1–G3 merged in PR #26)
- [x] G1 · Optional seating fields on `setu_food_notes` and `setu_spots`, with `sit-long` themes:
      `seating_type` (`free_seating` | `buy_to_sit` | `own_food_ok` | `unknown`), `min_order` (text) + `min_order_yen`,
      `stay_limit_min` (null = unknown, 0 = explicitly no limit), `outlets`, `wifi`, `quiet` 1–3, `smoke_free` (yes / no / partly),
      `setting` (indoor / outdoor / both), `feel`, `confidence` (confirmed / reviews / unverified) + `last_checked` (#26)
- [x] G2 · "Sit long with food" filter on the hub page and in Plan a day: open now and for 90+ more minutes
      (unknown hours shown last, marked), sorted by cost to sit, then quiet, then distance; smoke-free first;
      beef-focused places hidden while no-beef is on (#26)
- [x] G3 · Result card: cost to sit, one-line feel, seating type, closing time, nearest toilet (`toilet` theme spot),
      source confidence and actual checked date (#26)
- [ ] G4 · "Visited / Confirm seating details": date individual personally verified policy, order requirement,
      minimum order amount and stay limit without confirming untouched facts. Requires a separately approved additive
      `seating_checks` migration; does not change outing status, visit budget, reviews or personal experience tags.

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

**Database status:** the G-only optional fields migration `supabase/migrations/20261115045758_setu_sit_long_fields.sql`
was verified present in `General_apps` and powers G1–G3. The older `sql/setu_g_to_i_fields.sql` is a preparation,
not evidence that H or I fields/tables were deployed. G4's field-specific check-date migration is prepared for
separate approval and has **not** been applied. H7, I3–I5 and J remain future work.

## Phase K — Reusable Travel Prompt Library
- [ ] K1 · Four reusable planning templates in a single versioned source file: destination discovery, transport/return backups, flexible itineraries, live trip reviews. Code prepared for PR review.
- [ ] K2 · Home/menu launch, editable destination/origin/date/style, prompt preview/copy, direct link to new ChatGPT chat. Code prepared for PR review.
- [ ] K3 · Personal browser-only wording overrides, reset to updated shared templates, offline fallback, regression checks. Code prepared for PR review.
- [ ] K4 · Optional future cross-device template sync and importing sourced research as Setu drafts; requires a separate access-control design and approval before any new database work.

**Little World — Food Hideouts research wording:** [four upgraded prompts and authoring contracts](docs/research-prompts/little-world/README.md), text revision `2026-11-24.1`, merged in #42 (`a18774d`). Prompt-content adoption is prepared in shared catalog `2026-11-25.1`, preserving the exact document bodies, existing instructions, four steps and personal overrides. Filters and profile-specific validation/merges remain future work; this adds no fifth prompt, changes no UI behavior and does not activate R4. Merge/publication and live revision checks remain separate.

### Open questions for G–J
- Reminders (H7, I4): Setu has no push. Options: a Home strip when the app opens, or send to the Calendar app via A6.
- Pre-fetch (J1): the browser can't run Claude. A hub add can queue the request; a scheduled task (or the next session)
  runs it. Needs the user's OK for a recurring task.
- "No-beef setting" (G2): today no-beef is always on (dishes flagged); a toggle would be new.
- Suggested order: G (fits existing places to eat) → H → I → J.

## Phase L — Live Trip Companion (reusable, Ogose pilot)

**Scope:** independent of the four ChatGPT travel prompts in Phase K. Source-of-truth requirements, acceptance cases and resume status:
[`docs/live-trip-requirements.md`](docs/live-trip-requirements.md),
[`docs/live-trip-test-cases.md`](docs/live-trip-test-cases.md),
[`docs/live-trip-checkpoint.md`](docs/live-trip-checkpoint.md).
`data/trip-research/ogose-phase0.json` is a **synthetic/non-live** reference fixture, not a production import or a confirmed Saturday itinerary.

- [x] **L0 · Permanent requirements and fixture:** merged in PR #32 (`f74bc76`). Safety/reviews/data contracts, Ogose fixture and test gates. No runtime or production changes.
- [ ] **L1 · Five safety-ranked next places:** **L1A preview prepared for review** from merged #49 (`f8073e3`): Home/menu read-only next-place comparison, up to five conditional candidates, existing Japan-time hours/travel-estimate helpers, budget/rain/quiet/rest checks, source dates, exclusions and paging. **412 checks pass**; [guide and acceptance limits](docs/live-trip-l1-preview.md). All returns remain unverified, with no leave-by time. **L1B remains open:** use the user's forthcoming Solitro handoff to establish dated route/access and verified return eligibility, plus source-backed holiday exceptions. L1 is not complete; do not replace companion transport calculations with a new Setu engine.
- [ ] **L2 · Practical and experience tags:** multiple practical tags and separate Potential vs Personally Confirmed Igloo/Cocoon/Hideout, scoped to the room actually reviewed; preserve existing G4 seating confirmations. L2A adds practical-tag and potential-experience filters to Research Import. Both use the current report’s recorded tags. L2B adds a device-local personal history panel on research candidates. Each confirmation requires a named space, visit date, observation and explicit tag confirmation. Export personal history per place. L2C adds preview and explicit restore of a matching place’s personal export. Identical events are deduplicated and conflicting IDs block the restore. L2D previews one sourced research point on the Setu street map using numeric location.coordinates.lat/lng and a coordinate source_url. Candidate tags retain their potential status; a matching personal review can show its named space and confirmed tag. The removable pin is temporary. L2E maps sourced coordinates across all matching candidate pages. Use the street-map Research tag selector for practical or potential tags. Physical-device acceptance remains pending.
- [ ] **L3 · Explicit trip sessions, detours and safe return:** manual Start Trip, current stop, optional foreground GPS, safer return deadline and separate missed-bus/train/offline fallbacks. Integrate the already-pending **E4 Getting back** design; no made-up last departures. L3A adds explicit browser-local Start trip, manual current stop, resume, finish and JSON history export through Home → Next places → Open trip session. L3B previews a saved planned outing in a local session and records planned stops or detours while keeping remaining stops in order. L3C adds an optional foreground location check during an active session. Coordinates and accuracy appear temporarily and are excluded from history and export.
- [ ] **L4 · Personal observations and report drafts:** Suggested / Passed nearby / Visited / Did not enter / Personally reviewed, actual spending, truthful study/seating/comfort fields, planned-vs-actual report and local export without cloud writes. L4A adds dated, per-space observations to individual recorded stops in active or completed local trips, including optional notes and actual yen. Planned-vs-actual reports remain pending.
- [ ] **L5 · Approved import and sync:** review additive schema/RLS, auth and revision conflicts, deduplicated unaccepted research imports, privacy, cross-device sync and trip reports. **Production migrations and writes require separate approval.**

**Release rhythm:** one reviewable PR per phase, with tests and checkpoint updates; no automatic merge, deploy or SQL. Continue from the first eligible unchecked item after verifying the previous phase is actually merged. A prepared PR is not implemented functionality.

## Phase R — Reusable Research Import

Separate from the four research prompts. Detailed contract, audit and acceptance status are in
[`docs/research-import.md`](docs/research-import.md). This is the research preparation track for K4/L5, with E4/L3 retaining return-safety ownership.

- [x] **R1 · Validator and local dry-run preview:** merged in PR #35 (`ee9c7a0`). User verified basic upload/preview/export; original research preservation checked.
- [x] **R2 · Deduplication and decisions:** merged in PR #36 (`1f3876b`). In-memory accept/skip/selective merges and review export. Usability correction #37 is merged (`1a73704`); remaining manual checks are tracked in `docs/research-import.md`.
- [ ] **R3 · Local drafts and backup:** merged #38/#39 and offline correction #49 (`f8073e3`). User verified decision recovery, duplicate prevention, offline reopening via the link, portable restore and readiness after normal reload. The [native browser follow-up](docs/research-r3-browser-validation.md) passes **eight importer checks**, including two-tab rejection, explicit backup/checkpoint recovery and offline cache repair. It corrects cached startup when the network never answers; its original **379-check** baseline remains recorded. Physical Android/iPad acceptance remains pending.
- [ ] **R4 · Approved cloud persistence:** code/native/API/release validation merged #40/#44/#45/#46; permission-repair verification merged #47 (`1d88752`). Local browser fixes merged #48 (`53f2bb4`): **13 real-browser checks**, phone overflow and stale preview/approval controls; its **368-check** baseline is recorded in `docs/research-r4-browser-validation.md`. The verified six-grant repair stays complete and must not be repeated. Original comparison-input linkage and relevant Auth/recovery evidence still need the existing workflow's final results. Next: reconcile those results and seek exact separate R4 installation approval under `docs/research-r4-release-plan.md`. Migration is unapplied; release writes stay disabled; full hosted/device acceptance remains pending. No repeat full restore or automatic production change.

Each phase gets a reviewable PR. R1 preview is not a completed persisted import. No automatic merge or deployment.
