# R4 isolated browser validation — 25 November 2026

**Result: 13 real-browser checks pass. Three UI defects are corrected; production cloud saving stays disabled.**

This phase starts from merged [PR #47](https://github.com/Celeritas7/Setu/pull/47), `1d88752`. The owner selected local Research cloud screen testing while the existing General_apps recovery work continues. The completed production permission repair is not repeated. No hosted database/Auth change, R4 installation, activation, merge or deployment occurs in this phase.

## Actual browser and data boundary

| Component | Rehearsal |
| --- | --- |
| Renderer | Official Chrome for Testing **151.0.7922.34 headless shell**, driven by pinned development-only **playwright-core 1.62.1** |
| Frontend | Actual cloud UI/model/storage/transport modules and stylesheet, actual packaged app CSS, pinned Supabase JS **2.119.2** browser bundle; default-gate case exercises the actual cloud loader under a `/Setu/` path |
| Storage | Native browser IndexedDB and SDK session storage; fresh isolated browser contexts with fictional accounts only |
| Backend | The existing owned loopback PostgreSQL 17.12 / PostgREST 16.6 fixture, with signed ES256 test JWTs and the exact prepared R4 migration |
| Core permissions | The reference TRUNCATE repair is applied only inside that new disposable fixture, matching the intended post-repair permission boundary |
| Enabled cases | Fixture-only wrapper passes the existing transport's `enabled:true` option; the product's original `RELEASE_ENABLED` is asserted false |
| Network | All browser requests restricted to the owned fixture origin. Static test assets are supplied locally; REST/Auth requests go to the actual local gateway. Service workers are blocked |

The production bootstrap, real sign-in/session, existing browser profile, production API URL and private research are never loaded. The API's identity endpoint remains the controlled signed-token fixture described in the [HTTP report](research-r4-api-validation.md), not GoTrue. No real archive, Auth identity or user review is copied into the test data.

## Reproduced issues and fixes

The original UI passed seven of the initial twelve browser checks and failed five: two phone widths, one completed preview and two stale approval paths.

| Issue | Before | Corrected behavior |
| --- | --- | --- |
| Long destination names on phones | A long fictional destination made dialog content scroll to 788px inside 278/348px phone containers | Dialog, selector and action widths stay within the viewport; long text wraps. Verified at **320, 390, 768 and 1280px** |
| Completed save retains old preview actions | The plan was cleared but its export/paging controls remained attached to that cleared plan | A confirmed save clears its preview/approval. Saved research remains downloadable through **List my cloud reviews → Download cloud backup** |
| Rejected upload retains old approval | After a second-tab local revision or competing cloud save, the old approval/upload remained active | Failed commits clear preview and approval. A new preview and confirmation are required; cloud revision conflicts show an action-oriented message |

These are UI state/layout corrections. The existing SQL owner, revision, receipt and evidence guards are unchanged. Uncertain uploads still retain their exact IndexedDB request and use **Retry pending upload**; clearing the preview does not clear the outbox.

## Browser cases exercised

- Default release gate blocks upload/retry even after a real preview and checked confirmation.
- Explicit approval publishes one suggestion; a repeat creates zero duplicates. Native proposed-workspace and saved-cloud downloads preserve the complete original research, sources and unknown price values.
- A genuinely discarded committed HTTP response remains pending in native IndexedDB after page reload. Retry retains the request ID and identical HTTP body hash, returns the original receipt and creates no duplicate place.
- Dialog content and long selectors fit four viewport widths, including a tablet-sized width. The fictional phone rendering was also visually inspected.
- A real second-tab IndexedDB revision change rejects the old plan, resets approval and permits a fresh reviewed save.
- Two separate browser contexts for the same fictional owner produce an explicit stale-cloud conflict; a fresh preview then saves revision 2.
- A real SDK session change in a second tab during an asynchronous preview cannot expose the previous account's batch.
- An account change after the actual commit leaves the pending request with its original owner. The other account cannot retry it; returning to the original account recovers its receipt.
- Native Escape/Close remove the modal and unsubscribe its account listener before reopening.
- The browser previews and approves a selected evidence merge while every existing personal/core value except revision/update time remains identical.

No page runtime errors or outside-origin browser requests occurred in the passing run. These checks use actual DOM, native dialogs, IndexedDB, downloads and SDK BroadcastChannel/session behavior, rather than the small DOM doubles in the default unit suite.

## Reproduce

Use a normal Linux x64 development user, Node 22+, `curl`, `tar`/xz, `unzip` and the shared libraries required by Chrome headless shell:

```sh
npm ci
npm run setup:research-api
npm run setup:research-browser
npm test
npm run test:research-postgres
npm run test:research-api
npm run test:research-browser
```

The explicit browser setup downloads the fixed [official Chrome for Testing asset](https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.34/linux64/chrome-headless-shell-linux64.zip), verifies its archive hash, requires the expected archive prefix and checks the extracted executable. It caches the bundle only under ignored `node_modules/.cache/setu-research-browser/`. The official asset's published object MD5 also matched during initial preparation. No binary is committed and ordinary `npm test` does not launch/download a browser. A clean `npm ci` removes these caches; run both setup commands again.

| Integrity pin | SHA-256 |
| --- | --- |
| Headless shell archive | `3cfc2bd00d1bafcf8a68dc74c9c92bb7150ddc8d26ade948a776316e1cec4f14` |
| `chrome-headless-shell` | `e11fc9ce65c96313476f7ee9844b6fb6a9220fb048693cfe9eee00acf4170a9f` |
| Unchanged R4 migration | `a72ab87055330d4c09eabb0a4bef4f0c212fdd864a8d6da6dae2d2e6d1683790` |

The headless-shell build uses the browser control pipe and avoids the full desktop browser's process-singleton socket requirement in this execution environment. The fixture starts its own process/contexts; it never attaches to an existing browser. Missing/mismatched binaries, dependencies or failed startup fail the command; there is no live-service fallback or silent skip. Browser contexts, owned services and temporary data close on completion. Enabled fixture configuration stays under tests and is never loaded by the app.

## Validation recorded

- Clean dependency install and uncached checksum-verified API/browser preparation.
- **316 default regressions**, **20 native PostgreSQL checks**, **19 HTTP/JWT checks**, **13 browser checks**: **368 passed**, zero failures/skips.
- The product gate remains false, the original migration fingerprint is unchanged, and app bootstrap/auth, travel prompts and the G4 migration are untouched.

The subsequent [R3 offline/recovery browser report](research-r3-browser-validation.md) adds eight importer cases and three worker regressions. `npm run test:research-import-browser` runs only those importer cases without the local database/gateway; `npm run test:research-browser` now runs both browser files (**21 cases**). The 368-check count above records this R4 phase's original result; the combined follow-up total is **379**.

## Remaining acceptance

This is local headless Chromium module/loader acceptance with fictional records. Viewport widths are not physical Android/iPad tests. It does not execute the full packaged Home/Browse lifecycle, real OAuth/GoTrue/refresh/revocation, a real-device cold reopen, R3 offline-worker loading, shared-project recovery, hosted gateway configuration or production load. IndexedDB was tested across a page reload in the same isolated browser context, not a physical browser restart.

The existing recovery workflow's final exact comparison-input/archive linkage and relevant Auth/permission/configuration results remain the next R4 installation gate. Reuse that work; do not start a duplicate backup/restore. The [release plan](research-r4-release-plan.md) still requires a fresh preflight and exact separate approval for R4 SQL, then separate activation/test-write and hosted/device acceptance. The [verified core permission repair](research-r4-permission-repair-verification.md) stays complete.

## Primary references

- [Chrome for Testing availability and distribution](https://github.com/GoogleChromeLabs/chrome-for-testing)
- [Playwright isolated browser contexts](https://playwright.dev/docs/browser-contexts)
- [Playwright request interception](https://playwright.dev/docs/network)
- [Playwright downloads](https://playwright.dev/docs/downloads)
