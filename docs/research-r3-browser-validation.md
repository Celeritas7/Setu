# R3 native browser acceptance — offline loading and recovery

**Result: eight importer browser checks pass. Cached startup no longer waits for an unresponsive network. Physical Android/iPad acceptance remains open.**

This follow-up starts from merged [PR #48](https://github.com/Celeritas7/Setu/pull/48), `53f2bb4`. It exercises the standalone importer while the existing General_apps recovery workflow continues separately. It does not install or activate R4, repeat the completed core permission repair or start another backup/restore exercise.

## Reproduced problem and correction

With all nine required files cached and readiness verified, the owned test server accepted requests but left them unanswered. A new importer tab timed out after five seconds: the old worker awaited the network before using its cache.

The worker now returns a cached static asset without waiting for the network and refreshes successful responses in the background through `FetchEvent.waitUntil`. An uncached asset still needs a successful network response. A cache-storage error does not discard a usable online response. The same stalled-network browser check now loads the importer and resumes its stored review within the five-second test deadline.

The matching shell versions in `research-import-sw.js` and `js/research-offline.js` advance from `r4-1` to `r4-2`. The exact nine-file allowlist, filename-level importer scope and IndexedDB format remain unchanged. Background refresh and worker installation fetch static app files only; uploaded research and Supabase responses are outside the cache handler.

## Actual test boundary

| Component | Exercised behavior |
| --- | --- |
| Renderer | Pinned official Chrome for Testing **151.0.7922.34 headless shell**, development-only **playwright-core 1.62.1** |
| Page | Actual `research-import.html`, stylesheet, scripts, icon and worker under an owned loopback `/Setu/` origin |
| Storage | Native IndexedDB and Cache Storage in fresh browser contexts; native JSON file uploads and Blob downloads |
| Research | Fictional destination with **37 places in seven hubs**, counts **13/4/4/5/5/5/1**; smaller fictional records for failure/recovery cases |
| Connectivity | Browser offline mode, a deliberate 503/missing cached file, and unanswered requests for all static files including the worker script |
| Upgrade | A fixture-only served version change, followed by closing the old importer and reopening it in the same context; no forced activation command |
| Other pages | Minimal unrelated-page fixture verifies the importer worker does not control another Setu URL; an unrelated cache survives upgrade |

The fixture loads no production Home bootstrap, auth client, hosted API, private research, existing browser profile or real account. The original page CSP remains in effect; the owned worker's response permits same-origin static fetches. All observed browser requests remain on the fixture origin. Every new page is monitored for runtime errors. Browser contexts and the owned server close on completion; held requests are released during cleanup.

## Eight browser checks

1. Upload the 37-place handoff, stage a hub, accept one place and skip another. Confirm autosave and one approved local suggestion. A repeated save adds zero duplicates. Native backup download preserves the complete original research. Reload/resume retains **35 pending, one accepted, one skipped**. A second fresh browser context previews the backup without writing, then restores it only after explicit confirmation.
2. Verify actual worker control and all nine cache entries. A new tab opens while offline, resumes the same decisions and downloads the complete original source. Normal reload keeps the saved local suggestion. The unrelated page has no importer controller.
3. Two actual tabs open the same revision. A later save in the stale tab fails without overwriting the winning decisions. Its losing in-memory choice remains exportable. Explicitly resuming the winner permits a new save.
4. Deliberately corrupt only the fixture's latest workspace. **Recover previous checkpoint** opens a valid preview without replacing that stored payload. Explicit **Restore review locally** recovers the original source, decisions and approved suggestion.
5. Delete one static cache entry and return 503 for that file. **Check offline setup** cannot advertise readiness or offer reopening. Once the file returns, repair verifies readiness without changing saved research.
6. Install a new served worker version, close the importer and reopen it. The old importer cache retires, the new cache verifies, and both stored research and an unrelated application cache survive. This checks activation across a normal revisit, not an in-place hot-update guarantee.
7. Leave static network requests unanswered after a verified installation. A new tab still loads and resumes its local review without waiting for those responses.
8. Invalid JSON leaves existing records intact. Importing a distinct second destination creates its own workspace without altering the first destination's source or approved suggestion.

Three additional worker regressions cover never-answering network requests, online operation with unavailable cache storage and successful background refresh. The eight browser cases use real DOM, transactions, worker/controller messages, uploads and downloads; small adapters remain in the default regression suite for other failure paths.

## Reproduce

Use Linux x64, Node 22+, `curl`, `unzip` and the shared libraries required by the pinned headless shell:

```sh
npm ci
npm run setup:research-browser
npm run test:research-import-browser
```

The browser setup and its integrity pins are documented in the [R4 browser report](research-r4-browser-validation.md#reproduce). This importer-only command needs no PostgreSQL, PostgREST, sign-in or hosted credentials. Missing/mismatched browser binaries fail explicitly; there is no live-service fallback. `npm test` downloads or launches no browser. Existing cached development binaries were reused for this phase; no new dependency was added.

For the complete combined regression run, also prepare the pinned local gateway with `npm run setup:research-api`, then run `npm test`, `npm run test:research-postgres`, `npm run test:research-api` and `npm run test:research-browser`.

## Validation recorded

| Suite | Passed |
| --- | ---: |
| Default app/import regressions | 319 |
| Native PostgreSQL | 20 |
| HTTP/JWT | 19 |
| Actual browser: R4 cloud (13) + R3 importer (8) | 21 |
| **Total** | **379** |

No failures, cancellations or skips occurred in the final runs. The R4 migration fingerprint remains `a72ab87055330d4c09eabb0a4bef4f0c212fdd864a8d6da6dae2d2e6d1683790`; `RELEASE_ENABLED=false`. The native database and HTTP suites use disposable local fixtures only. No hosted SQL, production data, auth settings or travel prompt was changed. This branch is prepared for review without merging or deploying it.

## Remaining acceptance

These are headless Chromium tests with temporary contexts. A page reload or new tab does not establish physical-device cold-start, browser-process restart, iPad storage eviction, forced-refresh bypass, the packaged Home/Browse lifecycle or real Auth/RLS behavior. Native multi-tab rejection is now automated; physical Android/iPad checks remain pending before closing R3. Existing user-verified desktop offline/portable restore results remain recorded in the [import contract](research-import.md#r3-offline-correction-after-user-testing).

After this PR is merged, a device check can use the existing review: download a backup; reopen online and verify offline readiness; disconnect and use **Reopen Research Import** or normal reload; resume and verify the decisions and saved suggestion. Avoid a forced refresh. Record the device/browser and result; do not clear browser data to test recovery.

R4 installation still waits for the already tracked recovery workflow's exact comparison-input/archive linkage and relevant Auth/permission/configuration evidence, followed by a fresh preflight and exact separate approval under the [release plan](research-r4-release-plan.md). This local acceptance report does not close those gates.

## Primary references

- [Playwright service workers](https://playwright.dev/docs/service-workers)
- [Service-worker controller and force-refresh behavior](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/controller)
- [Background static refresh](https://developer.chrome.com/docs/workbox/modules/workbox-strategies#stale-while-revalidate)
