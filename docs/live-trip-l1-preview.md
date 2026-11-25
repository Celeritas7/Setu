# L1A — Next-place preview

**Prepared 26 November 2026 from merged [PR #49](https://github.com/Celeritas7/Setu/pull/49), `f8073e3`.**

This is the first usable part of L1: a read-only, evidence-aware preview of existing saved places. L1 remains incomplete. Existing records do not provide date-specific accessible routes and verified return chains, and the user's Solitro integration handoff is still pending. Every card therefore says **Needs route & return check**. The preview supplies no verified departure, safe-return claim or leave-by time.

## Use in the app

1. Open **Home → Next places · Preview**, or the same entry in **☰**.
2. Choose a **Current stop or station hub** and area. A selected map place or area is offered when it is available in the current account. This is a manual starting point, not a GPS fix or evidence of a visit.
3. Expand **Time, budget & weather**. Choose an optional date and Japan-local start time, planned stay, per-stop budget and straight-line search distance. Rain/quiet/rest preferences affect the preview. **Use today & now** explicitly fills the check time. On phones these settings start collapsed so candidates are easier to reach.
4. Select **Update preview**. Editing a setting clears the previous results until it is applied. Inspect up to five cards, their source details and Google Maps links. **All matching candidates** pages through the rest in fives; **Excluded by these checks** explains omissions. Fewer than five remain fewer.

Nothing here changes a planned day, current location, visit status, review, personal tag or saved record. **Browse saved places on the map** uses the existing planning-map entry. Selecting a date does not start or schedule a trip.

The preview uses accepted saved food places and spots, excluding skipped/deleted/sick-day records under the existing visibility rules. Ordinary completed visits stay out; repeatable rest/grocery places and explicit go-back food places remain possible choices. Importer-only local research drafts remain under Research Import until the separate reviewed publishing workflow is available.

## Ranking and evidence

| Input | Current behavior |
| --- | --- |
| Identity and area | Stable typed `food:`/`spot:` keys; selected origin omitted; hub and distance filters do not rewrite stored links |
| Opening window | Reuses the shipped G1–G3 Japan-time hours checker, including overnight intervals, split periods and continuous weeks. Adds the existing straight-line walking estimate before checking the requested stay |
| Stale/partial hours | More than 60 days old, future-dated, undated or incomplete data cannot establish a current opening window; weekly hours always retain a holiday-exception warning |
| Exclusions | Recorded access restrictions, explicitly remote/trail places without verified transport, beef-focused food, distance beyond the selected limit, recorded minimum/estimate over budget, short stays, fresh regular-hours closure, and explicitly exposed outdoor stops in rain |
| Unknown data | Unplaced records have no invented distance or arrival. Unknown prices stay unknown; a recorded ¥0 estimate remains an estimate. Missing travel/access/return evidence stays unverified |
| Prices | Visit estimate and minimum order are shown separately. The larger recorded amount is a budget filter floor, not a sum or guaranteed total. Travel, extra fees, admission scope and current menu prices are not established by it |
| Preferences | Recorded quiet/rest/cover facts affect ordering. Source confidence and dates stay visible. Food cards require an ingredient/stock/broth check; no non-beef guarantee is inferred |
| Variety | Applied within the same opening-evidence tier, with deterministic category/hub repetition penalties. It never reinstates an excluded place |
| Return and weather | Return is always `unverified`, leave-by is always `null`. Weather is the user's planning selection, not a fetched forecast. Remote/trail exclusions direct the user toward a local alternative and transport verification |

All remaining rows are **tentative candidates needing checks**, not certified eligible recommendations. A regular-hours fit based on a straight-line estimate cannot establish route access, arrival, holiday opening or return safety. Excluded rows remain inspectable; a Maps link is an external lookup, not an instruction that the route is safe.

## Implementation boundary

- `js/next-places.js` projects display fields and ranks without persistence, network calls or mutation. It omits reviews, ratings, personal observations and experience confirmations.
- `js/next-places-ui.js` renders a native dialog with text nodes and existing URL validation. Account changes remove the old dialog and its listener. Changed controls invalidate old results; Escape/Close clean up synchronously.
- `index.html` adds Home/menu callbacks and supplies the existing hours, seating facts, beef filtering, distance, walking estimate and Maps helpers. It uses the same already-loaded identity-bound raw comparison snapshot as Research Import. Signed-out previews use local food records only; stale cloud rows are not reused.
- Opening the preview pauses an existing nearby-map watch. Closing resumes only an already selected nearby mode under its existing permission rules. The preview requests no location and writes no history. Unmount cancels pending opens and closes the dialog.
- Scripts/styles load on demand. This dialog adds no service-worker scope or offline-readiness promise. Research Import's existing offline installation remains separate.

No new backend read, authentication client, database schema, RPC, transport calculator, timetable store, personal confirmation or travel prompt is introduced. The bundler manifest/bootstrap outside the template is byte-identical to the base; `Setu.dc.html`, existing integration configuration, the four prompt catalog and R4 SQL are unchanged. The original R4 migration still hashes to `a72ab87055330d4c09eabb0a4bef4f0c212fdd864a8d6da6dae2d2e6d1683790`; its release gate stays false. No production SQL, data change, merge or deployment was performed.

## Validation

**412 checks pass**, zero failures/cancellations/skips:

| Suite | Passed |
| --- | ---: |
| Default regressions, including 20 new L1 model/adapter checks and a map-watch lifecycle check | 340 |
| Native PostgreSQL | 20 |
| HTTP/JWT | 19 |
| Browser: 12 L1 + 13 Research cloud + 8 importer | 33 |

The twelve L1 browser cases exercise the actual bundled `Component.openNextPlaces` method, existing helper functions, packaged stylesheet/fonts and actual dialog modules in an owned loopback fixture. They cover five/fewer candidates, zero/unknown prices, changes invalidating results, exclusions, paging, literal hostile text and safe links, Close/Escape cleanup, account changes, local-only data, and **320/390/768/1280px** widths. The 390px case also expands the compact settings and applies a budget. A fictional phone rendering was visually inspected. No GPS request, save or outside-origin request occurred.

The fixture instantiates the actual Component with a minimal state adapter; it does not load the production bootstrap or full bundled renderer, real OAuth, hosted services or a user's browser profile. Physical Android/iPad acceptance and full packaged Home/menu interaction remain separate. The preceding R3 user's device checks are still pending; headless viewport widths do not close them.

Reproduce with the existing pinned Linux x64 development setup:

```sh
npm ci
npm run setup:research-browser
node --test tests/next-places.test.mjs tests/nearby-map.test.mjs
npm run test:next-places-browser
npm test
node scripts/sync-planning-menu-examples.mjs --check
```

The importer/L1 browser commands need no database or sign-in. The combined browser command also runs the R4 local gateway fixture, so prepare it with `npm run setup:research-api`, then run `npm run test:research-postgres`, `npm run test:research-api` and `npm run test:research-browser`. Existing development caches were reused; no dependency was added. Missing/mismatched binaries fail explicitly, with no hosted fallback.

## L1 completion and next work

This phase satisfies the preview/quota, unknown-value and conservative dietary cases, and part of the date/closure/rain cases in the [acceptance matrix](live-trip-test-cases.md). It does **not** close L1-1's verified eligibility or L1-4/L1-5's full dated route/holiday/return requirements. L1 remains unchecked.

L1B must consume a separately supplied Solitro handoff for dated route/access and onward return evidence, invalidate assessments after the date/origin/conditions change, and expose only genuinely eligible recommendations. Review the actual companion contract before choosing API fields; do not create a second Setu transport engine or invent departures/fares. Source-backed holiday exceptions and current research attachments also need a reviewed mapping. Trip sessions and personal observations remain L3/L4 work.

R4 installation still waits for the existing General_apps recovery evidence and exact separate approval under the [release plan](research-r4-release-plan.md). Continue that existing exercise; neither another full restore nor the already completed permission repair is part of L1.
