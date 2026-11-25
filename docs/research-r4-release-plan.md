# R4 recovery reconciliation and release proposal — 25 November 2026

**Decision: preparation complete; hosted installation and activation remain on hold.**

**Permission-repair follow-up, 23:16 JST:** #46 is merged (`d31bcfe`). After the owner's reported execution, [read-only verification](research-r4-permission-repair-verification.md) confirms all six effective core browser-role TRUNCATE privileges denied, with other reported grants and owner policies retained. The post-repair fingerprints are recorded there. The original precheck below remains dated evidence; its grant repair is now verified and must not be repeated. R4 installation/activation remain on hold.

This phase starts from merged [PR #45](https://github.com/Celeritas7/Setu/pull/45), `a535ddf`. It reconciles existing recovery evidence, refreshes Setu's read-only catalog inspection and prepares exact, separate change scopes. It performs no hosted SQL changes, Auth changes, production data writes, activation or deployment. Merging this proposal authorizes none of those actions.

## Recovery evidence reconciled

| Evidence reviewed | Established result | Remaining boundary |
| --- | --- | --- |
| Existing General_apps local recovery assessment, dated 25 November | The bounded local exercise is closed. Its reported public-data comparison matched all 302 captured COPY blocks / 20,889 rows. The selected index/publication repairs are recorded separately. | The original restore had 117 Auth-dependent constraints absent; matching referenced identities did not install or validate those constraints. Full Auth/RLS and service recovery were not established. Closing the exercise did not mean activation passed. |
| Protected General_apps archive-integrity review, dated 25 November | The retained database and roles files matched checksum sidecars. The separate Storage archive's 409 object files matched their manifest. | The exact input to the earlier COPY comparison has not been linked to this verified archive. Recorded sizes differ; this identifies a provenance question, not corruption. Inventory/integrity checks are not a restore. |
| Protected recovery review, dated 25 November | Preserves the successful comparison and distinguishes report-to-input association, an independent expected hash and a later operator assertion. | Original input identity, restored Auth relationships, effective permissions, private Storage retrieval and service configuration still need the existing recovery workflow's final evidence. |
| Setu #44 / #45 | The synthetic native and actual HTTP rehearsals passed their documented cases. | These generated fixtures do not establish archive identity, restore real accounts, or replace the existing recovery work. |

The protected reports were read in this phase; the dump, Storage objects, roles SQL, Windows databases and original comparison files were **not** downloaded, executed, restored or changed. Archive digests, retention URLs, account identifiers and private report contents stay in protected evidence. No new backup/export, repeat full restore or additional recovery checkpoint was started.

The smallest outstanding provenance action is to associate the unchanged comparison report with its exact original input hash, preserving whether that association is contemporaneous evidence or later operator identification. If the files represent different snapshots, retain both and scope each result accordingly. Continue the already tracked Auth/recovery work and use its final observations; preparation or a roles-file checksum is not completion. RPO/cutoff, retention, recovery owner and required Auth/configuration recovery must be explicit before relying on a backup for the proposed change.

This record does not transfer Solitro/Commonplace production approvals to Setu, or declare those applications' current release status. Their broader service requirements remain in their own workflows. Setu does not consume Storage or Realtime for this R4 import, but a restore of the shared database must account for the other services it would affect. An unrelated service repair is outside this proposal.

## Refreshed hosted metadata

The selected project was cross-checked as **General_apps**, healthy, PostgreSQL 17.6.1.063 / SQL server 17.6. Catalog-only observations on **25 November, 22:54–23:01 JST**, with advisors checked at 22:55, found:

| Check | Result |
| --- | --- |
| SQL prerequisites | UTF-8, NFKC normalization, SHA-256, `auth.users`, `auth.uid()` and `auth.jwt()` available |
| Existing core | Three tables, 109 columns / 33 constraints; owner RLS and one revision trigger per table; zero unvalidated constraints on these three tables |
| R4 objects | None of the four proposed tables, matching relations/indexes or functions installed |
| Migration history | No R4 target version or research-import-cloud name in the inspected hosted history |
| Browser roles | Neither `anon` nor `authenticated` is a superuser or has `BYPASSRLS` |
| Legacy excess grant | **Both browser roles have direct `TRUNCATE` grants on all three core tables**; six grants total |
| Health | No health lints returned |
| Existing Setu advisor warnings | Mutable search paths remain on the older `setu_distance_m` and `setu_comfort_match`; those functions were not changed |

No personal place/review or Auth identity rows were read. Table cardinalities and protected catalog captures are not published here. Catalog availability is not proof of gateway exposure, real Auth recovery or physical-device behavior. Recheck immediately before any approved change; this dated inspection is not a standing authorization.

### Separate permission-repair proposal

PostgreSQL [does not apply row security to `TRUNCATE`](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). The observed grants are effective database privileges, not proof of an exposed REST truncation route or a live exploit. No production truncation was attempted.

The exact proposed repair is [research_core_revoke_truncate.sql](../supabase/operations/research_core_revoke_truncate.sql):

```sql
revoke truncate on table public.setu_hubs, public.setu_food_notes, public.setu_spots from anon, authenticated;
```

This removes only those six grants. It changes no row, owner, CRUD grant, policy, trigger, default privilege, service-role grant, Auth setting or R4 object. It is outside the migration directory and requires **its own separate production approval**. The R4 migration below remains unchanged.

Native tests apply the exact repair twice to a disposable cluster. Both browser roles lose effective `TRUNCATE`; owner reads/inserts/updates/deletes, later personal edits, existing reviews and subsequent R4 publication continue to work. B/anonymous still cannot read A's record. An inherited extra grant deliberately remains effective after the direct revoke and is visible in the catalog: a successful statement must not be reported as successful denial without checking effective privileges. If that happens on the real target, record the residual route and stop; do not change other memberships or grants under this six-grant scope. Do not automatically restore the removed privilege as a rollback.

## Read-only pre/post-install check

[research_import_catalog.sql](../supabase/checks/research_import_catalog.sql) is one catalog-only `SELECT`, with no DDL, application/Auth rows or external targets. It can run before or after installation, including inside a read-only transaction. It inventories:

- Named core and research table shapes, owner-policy expressions, foreign-key destinations/actions, RLS flags and effective browser-role privileges, including inherited access.
- Core shape fingerprints covering columns, constraints, policies, triggers, ownership and ACLs; the separate core revision-function fingerprint.
- All public `setu_research_*` relation/function/index names, including unexpected objects/overloads, function body hashes/settings/grants and index validity/definitions.

Core fingerprints compare **the same target before/after an operation**. They are not archive fingerprints or cross-version/cross-cluster equivalence proofs. Index additions and approximate sizes/statistics are outside the shape hash; role memberships and column-specific grants require separate inspection when relevant. Compare the reported effective grants too. A change in role inheritance must not be hidden by an unchanged direct ACL.

The probe always reports `migration_history_checked=false`, `gateway_verified=false`, `recovery_verified=false` and `activation_authorized=false`. Check those matters separately. No count, hash or empty object list is a GO decision. Missing dependencies, an SQL error, unexpected objects or a permission difference require review rather than automatic repair.

## Exact proposed R4 installation scope

| Item | Reviewed scope |
| --- | --- |
| Source baseline | Merged #45, `a535ddf27953d61669a6984d6db96f63f4077372` |
| SQL payload | Only [`20261122065058_research_import_cloud.sql`](../supabase/migrations/20261122065058_research_import_cloud.sql) |
| SHA-256 | `a72ab87055330d4c09eabb0a4bef4f0c212fdd864a8d6da6dae2d2e6d1683790` |
| Tables | `setu_research_workspaces`, `setu_research_requests`, `setu_research_identities`, `setu_research_evidence` |
| Ownership links | Four new validated `user_id → auth.users(id)` foreign keys with `ON DELETE CASCADE`; existing Auth/core constraints are unchanged |
| Functions | Seven invoker functions, fixed empty search paths; authenticated execution and no PUBLIC/anonymous execution |
| Policies / trigger | Seven owner policies; one new workspace revision trigger |
| Indexes | Seven explicit nonunique indexes, including five on core tables; five additional indexes back primary/unique constraints, so the complete R4 index inventory is **12** |
| Transaction | File's own `BEGIN`/`COMMIT`, 5-second lock timeout and 60-second statement timeout |
| Unchanged components | Existing core schema/policies/triggers, Auth/providers/keys, G4 SQL, app/bootstrap/browser SDK, travel prompts and transport companion |
| App gate | `SetuResearchCloud.RELEASE_ENABLED=false` throughout installation |

Ordinary index creation can block concurrent core writes. Review current activity, table sizes and an appropriate maintenance window; a small historical size is not a lock guarantee. A timeout is a failed attempt to inspect, not permission to increase limits or retry blindly.

### Ordered approval and verification boundaries

| Step | Concrete action / observed evidence | Boundary |
| --- | --- | --- |
| 1 — Review this PR | Read the recovery limits, catalog probe and separate grant proposal; preserve the existing evidence | Merge changes repository preparation only |
| 2 — Close release prerequisites | Reconcile exact snapshot/provenance and relevant Auth/permission/configuration recovery; record the chosen recovery cutoff and final bounded outcome. Review the six-grant repair independently | No duplicate full restore, synthetic users in a real database, shared Auth change or automatic permission repair |
| 3 — Grant repair verified | Owner reported execution; read-only postchecks confirm all six effective privileges denied and other reported grants/policies retained. Post-repair fingerprints are recorded in the verification report | Do not repeat it. This does not approve R4 installation; refresh the new baseline before any later approved operation |
| 4 — Ask for exact R4 SQL approval | Present selected project, pinned payload/hash, the fresh preflight, recovery decision and maintenance/stop plan | Approval applies only to this file; activation and test data remain separate |
| 5 — Install only the approved payload | Use the migration tool's single-query route with name `research_import_cloud`, selected project and the exact reviewed file bytes; record returned outcome and actual history version/name | Do not use bulk `db push`/`migration up`, apply older G4, or rewrite/reset shared history |
| 6 — Database acceptance while disabled | Rerun the catalog probe, compare the baseline, inspect history and advisors, then verify actual REST schema/RPC exposure with the approved scope | Catalog success alone does not authorize uploads; no automatic synthetic production writes |
| 7 — Separate activation/test approval | Review the exact gate/configuration change, named synthetic dataset/accounts, approved surface/devices and retention/cleanup scope | Requires new approval; do not create accounts or change providers/redirects speculatively |
| 8 — Hosted/device acceptance | Record real Auth, owner isolation, publish/repeat, selective merge with retained review, stale revision/target, uncertain retry, current/previous restore and desktop/Android/iPad/two-device results | R4 remains incomplete until the observed results are recorded |

The single-query migration tool assigns/records its migration history entry. **Do not assume its generated version equals the repository filename timestamp.** Retain the actual version/name plus the reviewed payload digest in protected installation evidence. Future collision checks must consider both object state and history name/version; no local or shared history repair is implied. If tooling cannot execute the reviewed payload as intended, stop for an explicit route decision rather than editing the SQL during application.

### Post-install expectations

All four research tables must exist with RLS enabled and validated owner foreign keys; the seven policies must show the intended owner comparison and authenticated role. Anonymous effective table privileges must be false. Authenticated workspace SELECT/INSERT/UPDATE and append-only SELECT/INSERT on the other three must match the file, with no DELETE/TRUNCATE/REFERENCES/TRIGGER privileges. Verify the seven exact function signatures, invoker flags, fixed search paths and effective PUBLIC/anonymous denial. All 12 expected indexes must be valid/ready and there must be no unexpected R4 object or overload.

Core column/constraint/policy/trigger/owner/ACL fingerprints and the revision-function fingerprint must match the **immediately preceding approved-operation baseline**, except an explicitly reviewed grant repair. Verify the five intended new core indexes separately. Do not compare a pre-repair hash to post-install state and dismiss the ACL difference. Record the actual history entry and separate REST/Auth checks.

The current gate is a client feature flag. Installing the SQL makes authenticated owner-scoped database interfaces callable even while the UI stays disabled; the flag is not backend containment. This fact and the direct table/helper grants must be reviewed before approval. No server pause/control is added by this phase.

### Stop and recovery behavior

- A collision, changed fingerprint, unresolved snapshot identity, partial installation, unexpected privilege path or failed acceptance keeps activation on hold. Do not create dummy owner identities, remap owners or disable RLS to make checks pass.
- If installation acknowledgement is lost, inspect **both** schema and migration history before doing anything else. The SQL transaction and an API acknowledgement/history result are distinct evidence. Never rerun the file blindly, mark history manually, or drop objects to make a rerun succeed.
- Keep local reviews and downloadable backups available. Existing personal reviews and evidence are not cleanup targets. No DROP/TRUNCATE/DELETE or shared-database restore is a rollback step in this proposal.
- If database acceptance fails after a commit, preserve the evidence and prepare a separately reviewed scope for the observed failure. Leaving the UI gate false does not revoke API access. An emergency permission change requires its own precise scope and effective postcondition checks; there is no bundled automatic containment script.
- Do not re-enable the legacy TRUNCATE grant automatically, revoke unrelated core CRUD, change shared role memberships, alter Auth, deploy functions or restore production under this proposal.

## Verification of this preparation

```sh
npm ci
npm run setup:research-api
npm test
npm run test:research-postgres
npm run test:research-api
```

Use the existing Linux x64 / Node 22+ rehearsal requirements. **316 regressions + 20 native PostgreSQL tests + 19 HTTP/JWT tests pass.** The two new native lifecycle checks exercise the probe inside a read-only transaction, before/after the exact migration; detect disabled RLS, a permissive policy, PUBLIC/inherited privilege drift, unexpected routines and a missing index; preserve a personal row; and verify the separate TRUNCATE proposal with normal owner CRUD and R4 publication. The previous test reports remain dated records of their 18-test native and 19-test HTTP phases.

These checks and the read-only hosted observations do not establish the outstanding full Auth, snapshot recovery or physical-device results. App behavior and travel prompts are unchanged.

## References

- [Native rehearsal and migration correction](research-r4-isolated-validation.md)
- [HTTP/JWT rehearsal and full Auth limits](research-r4-api-validation.md)
- [Original dated readiness inspection](research-r4-readiness.md)
- [PostgreSQL row security and table-wide operations](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- [PostgreSQL effective privilege functions](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE)
- [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)
- [Existing function search-path warning guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
