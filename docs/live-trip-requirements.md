# Live Trip Companion — permanent requirements

**Status:** design specification only (Phase L0 review candidate, 2026-11-21). No app feature or production data is created by this document.  
**Scope:** reusable for every Setu destination; Ogose is only the first acceptance fixture.

## Existing code to reuse, not reimplement

- `README.md` / `CLAUDE.md`: signed-in `setu_hubs`, `setu_spots`, `setu_food_notes`, `setu_outings`; browser-local behavior when signed out.
- `My plan` already saves ordered stops, budgets, rain swaps and Google Maps walking links. It is **not** a timed, live safety navigator.
- The map already has **five-item paging**, nearby GPS mode and a **Plan trip · No limit** mode. Five map results are not five safety-ranked suggestions.
- G1–G3 seating fields, filters, confidence and per-place sources exist. G4's `seating_checks` migration is prepared **but not approved/applied**; signed-in G4 confirmation remains gated. See `docs/visited-seating.md`.
- Four editable destination/transport/itinerary/live-review **ChatGPT prompts** already ship in `data/travel-prompt-templates.js`. They open an external chat and do **not** automatically send results into Setu.
- `ROADMAP.md` Phase E4's source-backed Getting back card remains outstanding. Live return planning must extend/reuse E4 instead of creating another contradictory last-service store.

## User journey, with explicit control

1. **Research import review:** offer sourced place candidates under a prefecture > hub > sub-hub, starting `suggested` / not accepted. Ask before saving them; never infer a real visit from imported prose, a photo of a sign or a GPS fix.
2. **Prepare trip:** choose origin, destination, date (may remain null), pass route and validity, mood, spending limit, mode (walking/transit/cycle), and a personal return target. Preserve existing planned stops.
3. **Start Trip:** explicit user action starts a local trip session. Browser GPS is optional, foreground-only and not a prerequisite. No background location tracking is promised.
4. **Current stop / five next places:** manual selection, or a user-confirmed location. Show five usable candidates and a quieter/sheltered choice where possible. If fewer than five satisfy safety/opening rules, show fewer and state why.
5. **Detour:** keep its entry, travel time, expense and effect on protected return slack visible. Never silently replace a plan or confirmed visit.
6. **Review:** distinguish `Suggested`, `Passed nearby`, `Visited`, `Did not enter`, `Personally reviewed` per place **and per relevant space** (e.g., building versus library reading room). A user can visit a site and not enter a particular room.
7. **Finish Trip:** compare planned vs actual, spending with known/unknown values, worthwhile detours, missed spots, transport failures, free/quiet recovery stops and future notes. Prepare draft Setu updates for explicit user approval.

## Proposed data contracts (not deployed SQL)

These are **logical contracts**, to be mapped onto existing tables/local drafts during implementation; names below are not guaranteed existing columns.

- `TripSession`: session ID, current Japan-local date/time, origin, optional selected date, trip/outing reference, preferred mood, current stop, planned stops, observed stops, return target, transport strategy, offline availability, state (`draft|active|completed|abandoned`).
- `PlaceCandidate`: stable typed ID (`spot:<id>`, `food:<id>` or draft ID), `hub_id` and sub-hub, Japanese name, precise address / Maps URL, setting, facilities, costs with type (admission, minimum order, meal estimate), hours/exception dates, coordinates **only if sourced**, accessibility, tags, source URL, evidence class, checked timestamp, stale flag, acceptance status.
- `TravelLeg`: origin/destination stop IDs, walking distance and time **with method**, elevation/difficulty if supplied, rail/bus operator, service ID, departures and direction, fare, transfer assumptions, source URL, checked date, applicable service date, cancellation note. `null` is unknown; no invented service.
- `ReturnPlan`: planned and later viable service chains, **last** verified chain, walking-back-to-stop time, transfer/boarding buffers, sunset and terrain cutoff, end-to-end return target, alternatives, verification status and source evidence.
- `ReviewEvent`: user-observed stop and space, Japan-local observation time, `suggested|passed_nearby|visited|did_not_enter|personally_reviewed`, original user observation and optional photo reference, individual observation confidence; missing answers remain unknown. Treat entering grounds and entering a building as separate observations.
- `ExperienceTag`: tag (`Igloo|Cocoon|Hideout`), status (`potential|personally_confirmed`), supporting review event ID, observation date. **Never auto-confirm** from third-party sources, GPS, general visitation, or an assistant recommendation.
- `PracticalFact`: individual facts for Quiet, Indoor, Free, Long-stay, Wi-Fi, Study-friendly, Rain shelter, seating, toilets, food permissions, weather protection, minimum charge, permitted duration, outlets. Each fact may be `confirmed|reported|estimated|unknown` with provenance; private observations remain distinct from venue claims.
- `SpendEntry`: `amount_yen` nullable, `kind` (rail/bus/food/entry/etc.), `actual|verified_quote|estimate|unknown`. **Unknown is not ¥0**. A commuter pass reduces costs only over its verified covered JR segments; never extends automatically to Tobu/buses.

## Next-five ranking contract (Phase L1)

**First apply hard exclusions / safety constraints**, then rank: place not skipped/deleted, verified accessible route, operating/closing uncertainty visible, duration to make a useful stop, verified onward return safety, and budget ceiling. A destination without enough return evidence cannot be described as `safe`, even when nearby.

For eligible candidates, consider (in order):
1. Time-to-close and usable visit window (including holiday exceptions and source freshness).
2. Realistic walk/transit duration, transfer/wait, elevation and weather exposure; straight-line distance must be labelled as such.
3. Return slack: time until planned **and** second-to-last viable return, walking back to the stop, transfers, daylight/terrain cutoff and explicit buffers.
4. Mood, quiet/crowd evidence, opportunities for recovery, indoor shelter, seat availability, no-beef food, and spending including unknowns.
5. Variety and geographic hubs so five cards do not all repeat one category.

Output each card with why it ranked, travel-time source or estimate, cost separated from unknowns, known regular/exception hours and closure risk, weather/quiet evidence, stay duration, return status (`verified_with_margin|conditional|unverified|unsafe`), and actionable Maps link. Never fabricate five just to fill a quota. Manual override may show an unsafe suggestion with a hard warning, but cannot label it safe.

## Return safety is a gate, not a decorative badge (Phases L1/L3)

- A *verified service* needs provider, route, service-day calendar, direction, departure/arrival, transfer chain, `source_url`, `checked_at`, travel date and cancellation/seasonal applicability. Re-check current operator notices on the day; old schedule data is not current truth.
- A *safe leave-by* derives from the earlier planned viable departure, not the final departure. It subtracts walking-to-stop time, boarding buffer, transfer risk and trail/sunset margin. If any critical input is missing, return deadline is **unverified**, never an invented clock time.
- Explicitly distinguish missed bus, broken train connection and offline/battery/weather contingency. 24-hour convenience shops are not overnight shelters unless permitted waiting is documented. Taxi availability and hotel vacancies are never presumed.
- A remote detour must not turn a daylight route into a nighttime walk; where transport evidence is absent, present a town fallback, ask for verification, and block an affirmative safety claim.
- Calendar changes, railway operator changes and fare-pass validity changes trigger recalculation. Scheduled frequencies and opening times are estimates until the correct **date** is supplied.

## Review semantics and truthfulness (L2/L4)

- **Suggested** is discovery only; **Passed nearby** is not a visit; **Visited** is access or presence only; **Did not enter** applies to a particular venue/room; **Personally reviewed** requires actual user-described experience.
- Review prompts can ask *quiet/crowded, comfort, seating, free versus paid, 30–90 minute stay, independent study/laptop, Wi-Fi, own food/drink, return?* Ask only relevant follow-ups; unanswered fields remain null.
- Personal experience labels may be suggested as `potential` on research evidence. Only the user's explicit positive on-site review can confirm Cocoon/Igloo/Hideout.
- Never overwrite a reviewed fact because an online source changed; display both and flag conflict.

## Storage, auth, privacy and approvals (L4/L5)

- **L0–L4:** start with explicit local drafts and JSON export; an eventual signed-in write requires an approved additive schema plus RLS tests, `rev` handling, backups and conflict-aware sync. No production SQL or automated writes in L0.
- Import of ChatGPT research must be user-reviewed (`accepted=false` first) and deduplicated in Japanese/English and by stable location; include source checked date and confidence. Published app files must not contain personal GPS trails, contact details, card/pass identifiers or private reviews.
- Location is requested only in explicit Near me/Trip interactions and tracked only in the foreground. Provide manual selection and offline fallback; no browser-only feature claims background monitoring.
- Preserve existing `setu_outings`, saved stop ordering, prior reviews, G4 confirmation gate, DAY OFF source tag, no-beef filtering, station/hub browsing and the separate `Setu.dc.html` app.
- Future phases: code in dedicated reviewable PRs; **do not merge, deploy, apply migrations, use service credentials or modify live data without explicit separate approval**.

## Phase gate

Phase L0 delivers only docs, a synthetic Ogose fixture and fixture-contract tests. Completion means this spec is reviewed and merged; it does **not** mean L1–L5 UI or database behavior is implemented. Resume instructions and evidence belong in `docs/live-trip-checkpoint.md`.
