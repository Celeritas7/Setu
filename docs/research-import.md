# Research Import

## Reviewable phases

| Phase | Scope | State |
| --- | --- | --- |
| R1 | Bundled v1 validator, local dry-run preview, advisory matches and differences, review export | Merged in PR #35, `ee9c7a0`; basic user upload/preview/export verified |
| R2 | Resolve duplicate hubs and linked places, explicit Accept as suggestion / Skip / Merge selected research facts, field-group decisions | Prepared for review |
| R3 | Browser-local accepted drafts, backup/restore, stable destination-scoped identities, repeat-import idempotency and recovery | Pending |
| R4 | Separately approved additive schema/RLS, authenticated persistence, isolation, revisions, retry/concurrency and multi-device sync | Pending, requires separate approval |

R1/R2 are the import preparation portion of K4/L5. It does not depend on the L1 recommendation engine. R2/R3 should reuse the L2 potential/personal tag contract and L4 observation boundaries. E4/L3 continue to own current dated transport and return safety. The four travel research prompts remain a separate workflow.

## Validator and preview (R1)

1. Open Setu Home and wait for saved places to load. Select **Research Import** on Home or in the menu.
2. Choose a research handoff `.json` file, or expand **Or paste JSON** and select **Validate & preview pasted JSON**.
3. Read field errors or the candidate/hub counts. Filter by hub or name and browse five candidates per page. Expand possible matches for saved-versus-research comparisons and expand complete candidate evidence for all original fields.
4. Select **Download review JSON** to save the full research document plus the dry-run comparison. R1 exports have all decisions pending. R2 exports include explicit review decisions and proposals. Keep the original handoff JSON for subsequent imports. The review export has the format `setu_research_preview`, so it cannot be mistaken for a fresh research handoff.

The page can also open directly at `research-import.html`, with validation and preview available and existing-place comparison explicitly unavailable. It supports any destination using `setu_research_handoff` version `1.0.0`; it has no Ogose names, IDs, counts or destination-specific rules in its runtime.

R1/R2 hold research, preview and review decisions in memory. Reloading clears them. Validation and export work without network access once this page and its three local scripts have loaded. R1 does not install an offline cache or persist accepted drafts. Physical Android/iPad, offline reopening and persistent drafts are acceptance work for the subsequent phases.

## Contract and evidence

- The supplied JSON Schema is bundled in `js/research-import-schema.js`. It is evaluated locally, with no remote schema resolution and no uploaded schema execution. Only its declared validation keywords are supported, guarded by a contract test. Updating the schema requires code review and a versioned adapter.
- Additional guards check unique/nonblank IDs, hub references, real calendar dates, HTTP(S) source URLs without credentials, potential-only experience tags, safe numeric ranges, price range shapes, 5 MiB input size, 1,000 places, 200 hubs and nesting depth 32. Errors use JSON-pointer-style field paths and are capped at 100. The whole document must validate before preview is created.
- Unknown extension fields remain in the complete original document in the preview/export. Source URLs, original checked dates, qualifications, dietary flags, facility uncertainties, restrictions, aliases and historical evidence are retained. Raw transport evidence stays in this original research boundary and never becomes a return-safety calculation.
- Admission, spending estimates, scoped sample prices, historical fees and conditional seating prices are separate. Numeric zero is displayed as published admission only with explicit published evidence. Unknown admission remains unknown even when another service at the venue has a zero-price sample. Every source has a checked date and snapshot/staleness warning. Source links open only on a user's click.
- Proposed suggestion defaults are `accepted=false`, `status=try`, no coordinates and no personally confirmed experiences. Existing personal reviews, ratings, visit states, seating confirmations and pins have no import setter. Research coordinates and Maps/address text remain unverified original evidence.
- Candidate details preserve practical tags, potential experiences, DAY OFF discovery provenance and unknown facility permissions independently. The preview never infers study permission from free reading or a comfortable-sounding venue name.

## Comparison boundary

Opening the importer explicitly transfers a one-use snapshot of the records already loaded by the current Setu session. A field allowlist excludes review text, ratings, seating confirmations, precise coordinates and account identifiers. It passes only names/aliases, addresses, sources, external place references, opening hours, budget fields and themes. R2 also includes row revisions and existing hub/shop/place foreign-key references for target resolution. The snapshot expires after two minutes before consumption and is deleted from session storage when the importer opens. Refreshing or direct opening needs a fresh handoff from Home.

The app captures `setu_hubs`, `setu_spots`, `setu_food_notes`, `akatsuki_places` and read-only `akatsuki_shops` results from its existing RLS-scoped reads. `aliases` is added to the existing linked-location projection. An account switch cannot reuse a prior account's comparison. Signed-out comparison includes browser-local food records only. Failed/missing cloud table results disable the cloud snapshot rather than label all records new.

Coverage is always marked incomplete. Existing app reads may be limited by the server's result cap, matching is advisory. R2 resolves linked food rows through existing shop IDs and names; the snapshot remains limited to the rows loaded by the app. NFKC/case/spacing/punctuation normalization supports Japanese names and explicit aliases. Equal address text, source URLs (ignoring tracking/hash), or external IDs also produce review leads. A source page or address may describe several places, so these signals never auto-merge. Similar candidates inside the file are flagged. Broad source-page matches expand the first 20 comparisons per candidate and explicitly report the full lead count to bound preview/export size. Absence of a match means only **no match in the loaded snapshot**.

Hub IDs in a handoff are file-local references, not production UUIDs. R1 preserves their grouping and suggests name matches without minting database identities. R2 explicitly resolves existing or shared draft hubs. R3 must create stable destination-scoped identities and demonstrate repeat-import behavior before saving is enabled.

The standalone importer loads no auth, Supabase or broadcast client. Its CSP forbids network connections, and its DOM uses text nodes for imported text. The browser download includes the supplied research and allowed comparison fields, so treat it as a personal backup.

## Audit checkpoint

Initially audited `main` at `f74bc76`, the merge of PR #32, and refreshed/rebased onto `50af3b7` (PR #34) before publication. The concurrent prompt-only changes are preserved. The L0 checkpoint text was stale and is reconciled in this PR. The open-PR search returned no open PRs at audit time. Existing G4 code and migrations were inspected.

Read-only `information_schema.columns` inspection confirmed the existing public tables and field types. Food/spots hold `source_url`, `verified`, `hours`, `hours_seen`, `spend_yen`, `spend_seen`, `accepted`, `status`, `rev` and optional seating facts. Hubs use UUID IDs; linked locations use text IDs and aliases. The current tables do not have lossless research-document/provenance, separate admission/estimate, potential-experience, import batch or idempotency fields. `seating_checks` was absent from the inspected food/spot schema. No SQL, policies, permissions or production rows were changed.

Source inputs were read directly from the provided Drive folder, which contained the development handoff, reusable JSON schema, Ogose research JSON and the separate research-output contract. No private research payload, originating journey details or saved Library links are committed to this public repository. Tests use synthetic places. Travel prompt files are untouched.

## Verification

Run `node --test tests/*.test.mjs`. New checks execute the shipped pure model, bundled Component entry and event/DOM UI script. They cover malformed/version/field rejection, ID/reference/date validation, URL and markup safety, price semantics, aliases and differences, deterministic no-write previews, review preservation, one-use snapshots and account switching, cancellation, stale asynchronous file reads, clearing and review export. The UI adapter cannot establish browser compatibility or visual layout.

The actual supplied file was also exercised locally without committing it. It validated as 37 unique candidates in seven hubs with counts 13/4/4/5/5/5/1. Full research round-tripped exactly. Assertions covered unknown temple admission, published free park/waterfall admission, historical festival prices, grocery estimates, conditional Welcafe seating, library laptop uncertainty, entry prohibition, empty personal confirmations and the separate Hanno hub. Repeating the dry run was identical. This proves dry-run repeatability, not persisted-import idempotency, which belongs to R3/R4.

The full regression suite passed with 247 tests after rebasing onto the concurrent prompt updates. That baseline exposed an existing prompt-test wording mismatch; its assertion now accepts the equivalent phrase “cannot be verified.” No prompt content changed. Browser launch was attempted using installed Playwright and system Chromium. The environment denied Chromium's local socket creation, and the permission policy rejected escalation. Responsive visual checks, actual browser file/download behavior, Android/iPad and offline physical-device checks remain pending. No merge, deployment, migration or production import occurred.


## Review decisions (R2)

R2 starts from verified merged R1, `ee9c7a0`. It records choices and proposed research facts for later saving. It does not write saved places, local draft storage or Supabase. The four travel prompts remain separate and unchanged.

1. Import the original research handoff JSON. Under **Choose hubs for new suggestions**, expand **Choose hub**. Select an existing saved hub, **Propose a new draft hub**, or share another research hub's resolved choice. Then select **Use hub choice**. Similar hub names need an explicit separate-hub acknowledgment before proposing another draft. Shared choices cannot form cycles.
2. On a candidate, choose its **Suggestion category**. Known place types prefill Food place, Shop or Sight; unfamiliar types require a choice. Restaurants, cafés, bakeries and food stalls route to `setu_food_notes`; Shop/Sight/Other route to `setu_spots`. If overlaps exist, review them and acknowledge that a separate Setu suggestion is needed. Optional existing location/shop links preserve registry references. Select **Accept as suggestion** to stage the decision. Its future saved defaults remain `accepted=false`, `status=try`, with no generated coordinates or personal confirmations.
3. **Skip** excludes a candidate from the proposed changes while retaining its full original evidence. **Reset decision** returns it to pending and clears its form selections.
4. To update a saved Setu place, expand **Merge selected research facts into an existing place**. Search the loaded target names, aliases or addresses. Targets include saved food places/spots and other research candidates already accepted in this review. Inspect the selected target, choose fact groups, confirm it is the same place and select **Stage selected fact merge**. No fact is preselected.
5. Filter **Decision** to review pending, accepted, skipped or merged candidates. Paging and filters retain current choices. **Download review JSON** saves the full research, hub resolutions, decision details, counts and proposed changes. Reload clears the in-memory work. Restore/import of these decisions is R3 work; the current uploader accepts original research handoffs only.

### Merge and duplicate rules

- Merge targets must be loaded saved Setu food/spot records or another accepted research candidate. Manual target search can reach candidates outside the first 20 advisory matches. Linked `akatsuki_places` and `akatsuki_shops` are read-only; selecting one as a suggestion's location link proposes no registry update or new location record.
- Names, unverified address/Maps text, complete price evidence, hours evidence, access evidence, practical tags, potential experience tags, discovery-source tags, facility facts and safety flags are independently selectable groups. Price/hour/tag groups keep their associated scopes and uncertainty together. Source URLs, checked dates, provenance, safety restrictions and dietary evidence accompany each proposal. The entire original document remains in the export, including unselected fields and historical transport.
- Personal review/rating/visit/accepted fields, seating confirmations, confirmed experiences, pins, ownership and IDs have no merge selection. A research merge is an evidence attachment proposal, not a database column patch. Mapping to supported storage fields and handling revisions is later work.
- The same linked location cannot produce two accepted suggestion proposals. Duplicate research sources can instead merge into one accepted base suggestion. Overlapping fact groups staged for the same target are blocked; non-overlapping groups can share the target. Self-merge, unknown targets and merge chains are blocked.
- Editing a staged category, location link, merge target, same-place confirmation or selected facts resets that decision for fresh approval. Changing hub resolution resets affected accepted suggestions and their dependent merges. Skipping/resetting a base suggestion or changing its category/link resets dependent merge decisions. Existing saved places keep their hub association; choosing a research hub does not reassign a merge target.
- Snapshot matches remain advisory and incomplete. Creating a separate suggestion after an overlap requires explicit acknowledgment. Full rechecks and idempotent local persistence belong to R3, followed by owner-scoped cloud writes and conflict checks in R4.

### R2 verification and remaining checks

`node --test tests/*.test.mjs` passes 259 tests. Added checks cover hub resolution/sharing/cycles, explicit category and overlap review, food/shop linkage, selected fact allowlists, read-only registry boundaries, duplicate and overlapping merge decisions, dependency resets, immutable review preservation, UI accept/skip/reset/filter controls and exact selected-fact exports.

The actual 37-location/seven-hub handoff was exercised with simulated accept, skip and merge decisions against a synthetic existing target. The export preserved the research exactly, kept temple admission unknown, retained the no-beef preference and excluded a protected synthetic review. No private research file was committed.

The user verified R1 upload, field errors, candidate preview and download, and the uploaded review JSON was checked for exact original evidence preservation. Those checks do not establish R2 browser acceptance. A fresh system Chromium launch was attempted for R2 but still failed with `socket() failed: Operation not permitted`. R2 responsive visual, actual browser, Android/iPad, source link and download checks remain pending. No merge, deployment or production mutation was performed for R2.
