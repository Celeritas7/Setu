# Live Trip Companion — resumable development checkpoint

**Last prepared:** 2026-11-26. **Source of truth:** `main` plus accepted/merged PRs; this document may be ahead of `main` while its own PR is under review.

## Current phase

PRs #50–#53 merged, covering L1A, its ranking corrections, backup sizing and restore conflict choices. L2A adds practical-tag and potential-experience filters to Research Import. Both use the current report’s recorded tags. L2B adds a device-local personal history panel on research candidates. Each confirmation requires a named space, visit date, observation and explicit tag confirmation. Export personal history per place. L2C adds preview and explicit restore of a matching place’s personal export. Identical events are deduplicated and conflicting IDs block the restore. L2D previews one sourced research point on the Setu street map using numeric location.coordinates.lat/lng and a coordinate source_url. Candidate tags retain their potential status; a matching personal review can show its named space and confirmed tag. The removable pin is temporary. L2E maps sourced coordinates across all matching candidate pages. Use the street-map Research tag selector for practical or potential tags. Physical-device acceptance remains pending.

- **L0 — Permanent specifications and Ogose fixture:** verified merged in PR #32, commit `f74bc76`.
- **L1A:** read-only Next places preview prepared for review; L1B's verified route/return eligibility is still open. L2A merged in #54. L2B merged in #55. L2C merged in #56. L2D merged in #57. L2E merged in #58. L3A merged in #59. L3B saved outings and detours are in review. L4–L5 remain pending. Existing related capabilities remain available (see `README.md` and `ROADMAP.md`).
- **Production:** no live-trip SQL, data writes, merge or deployment performed by this phase.
- **Branch:** `feature/live-trip-l1-next-places`, from merged #49 (`f8073e3`).
- **L0 PR:** [#32 — Phase L0 specification and fixture](https://github.com/Celeritas7/Setu/pull/32) (merged).
- **Current Live Trip work:** L1A — Home/menu preview from a manual stop, date/time, budget, weather and quiet/rest preferences. Reuses existing hours, price, Maps and walking-estimate helpers. All cards remain conditional with unverified return and no leave-by. **340 default + 20 native PostgreSQL + 19 HTTP + 33 browser = 412 checks pass.** See `docs/live-trip-l1-preview.md`. Await review/merge, then physical Home/menu testing. Next L1B needs the actual Solitro handoff before dated route/access/return integration; no companion API or new transport engine is invented here.
- **Research baseline refreshed:** `50af3b7` (merged PR #34) before R1 publication; existing prompt updates preserved.
- **R1:** merged in PR #35 (`ee9c7a0`); user upload/preview/export verified with exact research preservation.
- **R2:** merged in PR #36, with usability correction #37 (`1a73704`). Individual accept/skip controls were user-verified.
- **R3:** merged #38/#39 (`2229c03`). User verified decision recovery, duplicate prevention, offline reopening through Reopen Research Import, portable backup restoration (37 candidates/one local suggestion) and readiness after normal reload/check. Automated native-browser two-tab and offline/recovery acceptance now passes in the follow-up below; physical Android/iPad checks remain pending.
- **Current supporting track:** R4 code merged #40 (`21524b5`), native validation #44 (`c939c1c`), HTTP validation #45 (`a535ddf`), release preparation #46 (`d31bcfe`); the latter passed **316 regressions + 20 native PostgreSQL tests + 19 HTTP tests**. The owner subsequently reported success after the separate core TRUNCATE repair. Read-only verification at **25 November, 23:16 JST** confirms all six effective permissions denied; other reported browser grants, owner-policy expressions, core counts/triggers and revision-function fingerprint match the precheck. `docs/research-r4-permission-repair-verification.md` retains the new post-repair catalog baseline. **Do not re-propose/repeat the repair.** R4 objects/history remain absent and `RELEASE_ENABLED=false`. **Next:** obtain the already tracked recovery workflow's final exact comparison-input/archive linkage and relevant Auth/permission/configuration results, then present a fresh, exact R4 installation approval request under `docs/research-r4-release-plan.md`. No new backup/repeat full restore, R4 SQL, activation or production test writes under a generic “next”. The permission-verification step changed no app/travel prompts; full hosted/device acceptance and L1–L5 remain separate work.
- **Local cloud browser follow-up:** confirmed merged in #48 (`53f2bb4`). The owner's selected local screen tests pass **13 isolated browser checks / 368 checks total** using actual IndexedDB, DOM, downloads, SDK sessions and the owned HTTP gateway. They fix long-destination phone overflow and clear preview/approval controls after completed or rejected uploads; cloud conflicts ask for a fresh preview. Four viewport widths and second-tab/account/reload/merge paths pass. See `docs/research-r4-browser-validation.md`; real Auth, full Home integration and physical Android/iPad acceptance remain separate.
- **Local importer acceptance follow-up:** confirmed merged in #49 (`f8073e3`). **Eight actual importer browser cases** cover 37-place/seven-hub upload, idempotent materialization, explicit portable/checkpoint restore, offline new-tab/reload, stale-tab rejection/export/resume, missing-cache repair, worker upgrade/reopening and a second destination. It fixes network-first startup hanging on unanswered requests: cached files load immediately with background refresh, shell version `r4-2`. Its **379-check** baseline remains recorded in `docs/research-r3-browser-validation.md`; physical Android/iPad acceptance remains pending and R3 stays unchecked. The original migration/travel prompts are unchanged, `RELEASE_ENABLED=false`, and the next R4 installation gate remains the existing recovery evidence above.

## Baseline found on main, 2026-11-21

- Four copyable travel prompts present in `data/travel-prompt-templates.js` (revision `2026-11-19.1`).
- Existing map five-item paging, saved hubs/spots, Plan a day/rain adjustments, food budgets, and some seating data; NOT a real-time next-five safety planner.
- G4 UI and documentation exist as review candidate. Its field-specific `seating_checks` migration is prepared and **not applied**. Do not misstate cloud confirmations as ready.
- E4 — operator-sourced Getting back card — remains pending; L3 must build on it.
- `ROADMAP.md` K1–K3 show unchecked status even though Prompt Library files are present in `main`; separately reconcile the checklist before claiming their release status.

## Reliable resume recipe for every future chat

1. Inspect `https://github.com/Celeritas7/Setu` **main**, then read `ROADMAP.md`, this checkpoint, `docs/live-trip-requirements.md`, `docs/live-trip-test-cases.md`, and recent PRs.
2. **Check actual merge state** of the previous phase. A prepared branch, draft PR or comment is not a merge. If this L0 file is still only on a PR branch, review it there first.
3. Select the **first unchecked L-phase whose dependencies are merged and approved**, not an arbitrary phase number. Read affected modules and avoid duplicating current features.
4. Implement a single reviewable branch/PR, run and report tests actually executed, clearly list unknowns and manual acceptance checks.
5. Update both `ROADMAP.md` and this checkpoint **in that same PR**, but keep phase unchecked until after merge. A follow-up after confirmed merge can mark it complete.
6. Never merge/deploy/apply SQL/import private reviews without user approval. Do not let ChatGPT research prompts be mistaken for app features.

### Short continuation prompt

> Continue `Celeritas7/Setu` from `docs/live-trip-checkpoint.md`. Inspect latest `main` and actual PR merge status, then implement only the next **eligible** Live Trip Companion phase with tests in a reviewable PR. Preserve existing data and APIs. Do not merge, deploy or apply SQL.

## Phase ledger

| Phase | PR / merge commit | State | Next verification |
| --- | --- | --- | --- |
| L0 | [#32](https://github.com/Celeritas7/Setu/pull/32), `f74bc76` | Merged | Source files and fixture checks verified |
| L1 | L1A preview prepared for review | In progress; not complete | Merge/device preview checks; Solitro handoff, dated route/holiday/return eligibility for L1B |
| L2 | L2A merged #54; L2B personal space reviews | L2B merged #55; L2C merged #56; L2D merged #57; L2E merged #58 | Physical-device checks and map integration |
| L3 | L3A merged #59; L3B outing sessions | In review | Device acceptance and verified return after the Solitro handoff |
| L4 | — | Not started | Per-space visits and review truthfulness |
| L5 | — | Not started | Approved schema, RLS, sync and reporting |

## Historical Ogose planning context, not live facts

- Corrected origin: **Minami-Urawa Station (南浦和)**, not Ageo.
- Candidate trip date: **Saturday, 2026-11-21**, *tentative*, never silently treat this as a confirmed journey.
- Existing commuter pass: Ageo–Warabi, exact covered route/validity unconfirmed; bus and Tobu not automatically covered.
- Desired style: balanced nature/culture/quiet plus spontaneous detours, low-cost food, no beef and sheltered/resting choices.
- Reports saved separately in the user's ChatGPT Library; no automatic Setu import or confirmation of a real visit. The public fixture deliberately contains **no private review or location history**.
