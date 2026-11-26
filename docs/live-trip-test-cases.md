# Live Trip Companion — acceptance tests and release gates

**Status:** test plan and fixture-contract checks, not proof of a functioning live companion. Read `docs/live-trip-requirements.md` and `data/trip-research/ogose-phase0.json` first.

The [L1A preview report](live-trip-l1-preview.md) records 20 model/adapter checks, one map-watch regression and 12 actual browser cases. It covers quota/unknown-value/dietary behavior and partial time/rain ranking. All cards still need route/return checks; this is not full L1 verified-eligibility or physical-device acceptance. L1B requires the user's actual companion handoff and source-backed holiday/return data.

## How to verify each pull request

1. Compare changed files with `ROADMAP.md` and confirm the PR targets **one** live-trip phase.
2. Run `node --test tests/*.test.mjs`, `node scripts/sync-planning-menu-examples.mjs --check`, and `git diff --check` when a complete repository checkout is available; report actual results and failures, never presumed passes.
3. Verify no surprise changes to bundled `index.html` / `Setu.dc.html`, authentication, Supabase policies, trip history or user reviews unless that phase explicitly approved them.
4. Manual Android/iPad/desktop testing is separate from unit tests, including narrow widths (320/390 px), offline, denied GPS, logged-out/local draft and signed-in cases.
5. For migrations: request user approval, test backup + RLS + cross-account reads/writes, and confirm rollback before any production application.

## Acceptance matrix

| ID | Phase | Scenario | Required behavior |
| --- | --- | --- | --- |
| L0-1 | L0 | Ogose sample loaded | Valid JSON fixture with Japanese name, hubs, source metadata, no user information, date still unconfirmed. |
| L0-2 | L0 | Prior app capabilities | Document reuse of five-page map, existing rain planning, budget semantics, G4 migration prerequisite and existing prompt library. |
| L0-3 | L0 | Scope safety | Only docs/fixture/tests/roadmap change; no app behavior, SQL, account write or deployment. |
| L1-1 | L1 | Five or more candidates | Show up to five **eligible**, diverse places with time, cost, closure, rain and return status; remaining candidates stay browseable. |
| L1-2 | L1 | Three eligible candidates | Show three, never invent two. |
| L1-3 | L1 | Unknown fees/hours | Display **unknown** (not free or open); an actual ¥0 remains ¥0. |
| L1-4 | L1 | Known closing time | Rank or exclude venue based on travel + visit duration + remaining open time; handle local date, overnight hours, holidays and stale sources. |
| L1-5 | L1 | No verified remote return | Never say safe, never show a fake leave-by clock time; suggest a closer/local alternative. |
| L1-6 | L1 | No beef | Exclude beef-focused meals, and show unknown ingredients without claiming safe. |
| L2-1 | L2 | Multiple tags | Practical flags and Potential Cocoon coexist; third-party comfort claims cannot become Confirmed Cocoon. |
| L2-2 | L2 | User reviewed a room | Confirm only the reviewed space/tag, not every area of the building. |
| L2-3 | L2 | Old existing review | Preserve experience history and original source; source refresh flags conflict rather than rewriting. |
| L3-1 | L3 | Explicit Start Trip | No automatic trip or background location history from opening the app. |
| L3-2 | L3 | Detour added | Recalculate travel/return slack; preserve uncompleted planned stops; no background or automatic saves. |
| L3-3 | L3 | Date or operator change | Invalidate stale last-service claims, preserve source URLs and require fresh verification. |
| L3-4 | L3 | Late bus / remote trail | Earlier planned departure, second-to-last and last viable connections are distinct; safe leave-by accounts for approach and buffers. |
| L3-5 | L3 | Missed bus vs missed train | Distinct backups with supported route/service/contact; no invented overnight shelter. |
| L3-6 | L3 | No internet, battery or bicycle | Manual maps/printed contact/return options remain; unavailable rental is not assumed. |
| L4-1 | L4 | Passed near temple | No entry/review claim. |
| L4-2 | L4 | Entered building but not study room | Building may be Visited; study-room entry, laptop/Wi-Fi and 90-minute stay remain unconfirmed. |
| L4-3 | L4 | User describes poor comfort | Record exactly that; do not assign Confirmed Cocoon even if research suggested Potential. |
| L4-4 | L4 | Explicit review and spend | Record observed date, specific answers and actual yen; unknown fields remain unknown. |
| L4-5 | L4 | Ending trip | Planned vs actual, missed/detoured, spending with unknowns and transport issues; no invented stops. |
| L5-1 | L5 | Local vs cloud | Browser-local drafts survive reload/export; cross-device sync only after approved migration. |
| L5-2 | L5 | Two accounts | RLS prevents access to another user's trip, reviews and preferences. |
| L5-3 | L5 | Retry/conflict | Idempotent approved save, revision conflict shown, no duplicate places or silent overwrites. |
| L5-4 | L5 | Cancel or failed import | No approved-place status or reviewed-data mutation. |

## Specific Ogose fixture scenarios

- **No selected date:** candidate weekday/weekend opening metadata can be shown as documented, but no verified departure or sunset countdown can be computed; the return status is `unverified`.
- **Minami-Urawa origin with Ageo–Warabi pass:** route and validity not confirmed, so fare savings cannot be asserted and no Tobu/bus coverage is assumed.
- **Yamabuki park:** explicit documented free admission is different from the unverified price of temple indoor access.
- **Ogose library:** public reading/self-study corner evidence does **not** establish visitor laptop or Wi-Fi permission.
- **Kuroyama waterfall:** no verified return service for the unselected trip date means a hard warning and a town alternative; do not silently adopt a previous day's bus time.
- **Unentered place:** seeing Hōonji from outside records `passed_nearby` and room `not_entered` only if stated by the user. No automatic personally reviewed tag.

## Test fixtures vs current reality

`data/trip-research/ogose-phase0.json` is a **non-live, representative fixture**, not a current operator timetable, weather report, user's visited-location record, vetted import or statement that every candidate is open. Official-looking URLs are provenance pointers to recheck; stale evidence should be clearly labelled. The fixture tests check contract invariants only. App behavior tests begin in L1.

## Reviewer sign-off

- [ ] Phase-specific automated checks run and logged
- [ ] No unapproved application, schema or live-data changes
- [ ] User-tested mobile flow and return-safety warnings where applicable
- [ ] PR reviewed and merged explicitly
- [ ] `docs/live-trip-checkpoint.md` and `ROADMAP.md` updated with the **actual merged PR** and next incomplete phase
