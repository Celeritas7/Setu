# Live Trip Companion — resumable development checkpoint

**Last prepared:** 2026-11-22. **Source of truth:** `main` plus accepted/merged PRs; this document may be ahead of `main` while its own PR is under review.

## Current phase

- **L0 — Permanent specifications and Ogose fixture:** verified merged in PR #32, commit `f74bc76`.
- **L1–L5:** not started as the six new live-trip phases. Existing related capabilities remain available (see `README.md` and `ROADMAP.md`).
- **Production:** no live-trip feature, database migration, Github Pages deployment or import has been performed by L0.
- **Branch:** `docs/live-trip-companion-phase0-20261121`.
- **L0 PR:** [#32 — Phase L0 specification and fixture](https://github.com/Celeritas7/Setu/pull/32) (merged).
- **Next Live Trip phase:** L1 — five safety-ranked next-place suggestions.
- **Research baseline refreshed:** `50af3b7` (merged PR #34) before R1 publication; existing prompt updates preserved.
- **R1:** merged in PR #35 (`ee9c7a0`); user upload/preview/export verified with exact research preservation.
- **R2:** merged in PR #36, with usability correction #37 (`1a73704`). Individual accept/skip controls were user-verified.
- **R3:** merged #38/#39 (`2229c03`). User verified decision recovery, duplicate prevention, offline reopening through Reopen Research Import, portable backup restoration (37 candidates/one local suggestion) and readiness after normal reload/check. Manual two-tab and Android/iPad checks remain pending.
- **Current supporting track:** R4 code merged in #40 (`21524b5`). Reuses Setu's authenticated client for explicit cloud backup/publishing, owner-isolated SQL workspaces/evidence/identities/receipts, revision conflicts and durable retries. The exact merged tree previously passed 315 tests, including eleven disposable SQL-engine cases. New suggestions remain unvisited Browse entries; selected research attachments preserve personal reviews/pins/confirmations. Read-only metadata preflight on 22 November found compatible core schema and no installed R4 objects. A General_apps backup archive is reported, but checksum/content and isolated restore evidence remain pending. The additive migration is unapplied and `RELEASE_ENABLED=false`; separate SQL/activation/write approvals remain required. Hosted/browser/device acceptance is pending. See `docs/research-import.md` and `docs/research-r4-readiness.md`. L1–L5 remain separate work.

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
| L1 | — | Not started | Ranked next-five rules, source/unknown handling |
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
