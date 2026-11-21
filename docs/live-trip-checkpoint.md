# Live Trip Companion — resumable development checkpoint

**Last prepared:** 2026-11-21. **Source of truth:** `main` plus accepted/merged PRs; this document may be ahead of `main` while its own PR is under review.

## Current phase

- **L0 — Permanent specifications and Ogose fixture:** **in PR review, not yet merged**.
- **L1:** first read-only next-five preview implemented in [stacked draft PR #33](https://github.com/Celeritas7/Setu/pull/33), branch `feature/live-next-five-l1-20261121` (not merged/deployed). **L2–L5:** not started as new Live Trip Companion phases.
- **Production:** no live-trip feature, database migration, Github Pages deployment or import has been performed by L0.
- **Branch:** `docs/live-trip-companion-phase0-20261121`.
- **L0 PR:** [#32 — Phase L0 specification and fixture](https://github.com/Celeritas7/Setu/pull/32) (draft, open, not merged).
- **Next review gate:** review and merge L0 #32 first, then review L1 stacked PR. L1 remains unchecked until approved and merged; L3/E4 must add verified return-service safety later.

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
| L0 | [#32](https://github.com/Celeritas7/Setu/pull/32) — open draft, not merged | In review | Source files, fixture checks and scope |
| L1 | [#33](https://github.com/Celeritas7/Setu/pull/33) (stacked on #32) | In review, not merged | Ranked preview, source/unknown handling, tests, manual mobile checks |
| L2 | — | Not started | Practical + personal tag separation |
| L3 | — | Not started | Explicit sessions, detours and verified return |
| L4 | — | Not started | Per-space visits and review truthfulness |
| L5 | — | Not started | Approved schema, RLS, sync and reporting |

## Historical Ogose planning context, not live facts

- Corrected origin: **Minami-Urawa Station (南浦和)**, not Ageo.
- Candidate trip date: **Saturday, 2026-11-21**, *tentative*, never silently treat this as a confirmed journey.
- Existing commuter pass: Ageo–Warabi, exact covered route/validity unconfirmed; bus and Tobu not automatically covered.
- Desired style: balanced nature/culture/quiet plus spontaneous detours, low-cost food, no beef and sheltered/resting choices.
- Reports saved separately in the user's ChatGPT Library; no automatic Setu import or confirmation of a real visit. The public fixture deliberately contains **no private review or location history**.

## L1 preview notes (not production)

- New `js/next-five.js` pure ranker and opt-in Map `Next five · preview`; mood-cycle and rain preference. Existing five-result map unchanged when preview off.
- Source: existing saved pinned places within 3 km of a **chosen anchor**, not an automatic Ogose dataset import. If Plan trip · No limit has no anchor, show no ranked choices and ask the user to select an area/Near me.
- Ranking uses Asia/Tokyo local regular hours, estimated minimum straight-line walk, recorded visit budget or unknown, quietness and rain-shelter evidence. Holiday exceptions and route walking time unverified.
- All cards state return **UNVERIFIED**. Dated operator services/second-to-last buses and leave-by times are separate E4/L3 work. No return safety certification is claimed in L1.
- Backend, Supabase and `Setu.dc.html` remain unchanged. Packed `index.html` must remain below GitHub's 1 MiB contents API limit; see `docs/live-trip-next-five.md`.
- Automated Node suite and real-device checks still need to be **run**, not presumed to pass.
