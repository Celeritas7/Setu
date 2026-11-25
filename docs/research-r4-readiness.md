# R4 database readiness — 22 November 2026

**25 November follow-up:** [the isolated native PostgreSQL rehearsal](research-r4-isolated-validation.md), merged in #44 (`c939c1c`), passed 18 native tests plus 316 regressions and corrected the unapplied migration's handling of an omitted optional observation. The subsequent [local API/JWT report](research-r4-api-validation.md) records 19 passing real-HTTP checks and its full Auth/hosted/device limits. Those reports give the **current migration fingerprint**. The backup observations and fingerprint below describe the original 22 November inspection; they must not be presented as a new verification or a reason to repeat existing backup work. Reconcile the separately tracked recovery evidence before a release proposal. Production installation/activation remain unapproved.

**Current release preparation:** #45 is merged (`a535ddf`). [The release plan](research-r4-release-plan.md) now reconciles the closed recovery exercise and verified-archive report, retaining their provenance/Auth limits; adds tested metadata-only pre/post checks; and records six legacy core TRUNCATE grants found read-only. Its separate revoke proposal remains unapplied. The historical “archive reported” status below is superseded by that dated reconciliation, not erased or treated as proof of full recovery. Installation and activation remain on hold.

**Decision: schema preflight passed; installation and activation remain on hold.**
The existing database is compatible with the R4 inputs inspected below. A General_apps backup archive has been reported, but its checksum/content verification and an isolated restore have not yet been evidenced. No hosted migration or production write is authorized by this report.

## Reviewed baseline

- Application implementation: merged [PR #40](https://github.com/Celeritas7/Setu/pull/40), `main` commit `21524b5e363fef125f5d617ab02368b7e9264541`.
- That commit has the same tree as the tested R4 implementation: `479daeb18bcf968b86e9944a39b3cc982a88bb27`.
- Proposed migration: [`20261122065058_research_import_cloud.sql`](../supabase/migrations/20261122065058_research_import_cloud.sql).
- Migration SHA-256: `a5e8dd65841802816932201c7c206c9a3e8cc381206adfb2b1165b8ea9d06cce`.
- Inspection: the existing configured **General_apps** project, read-only metadata queries, migration history and health/security advisors on 22 November 2026. Final constraint inspection: **17:51 JST**.
- Application gate: `SetuResearchCloud.RELEASE_ENABLED=false`. Merging #40 did not install SQL or enable uploads.

## Read-only findings

| Check | Observed result | Implication |
| --- | --- | --- |
| Database prerequisites | PostgreSQL 17.6, UTF-8; NFKC normalization and `sha256(bytea)` available; `auth.uid()` and `auth.jwt()` present | Required SQL helpers are available |
| Core columns and defaults | UUID IDs/owners, integer revisions, nullable research source/address/price fields and the inserted hub/food/spot columns match the migration | No missing core column or incompatible required default found |
| Existing constraints | `added_by='claude'`, `status='try'`, spot kinds `shop/see/other`, nullable food `shop_id` with a supplied name, and hub foreign keys permit the proposed insert shapes | No conflicting enum/check/unique constraint found in these insert paths |
| Owner isolation | RLS enabled on all three core tables; authenticated policies use `user_id=auth.uid()` for visibility and writes | R4 can reuse existing owner policies |
| Existing permissions | Authenticated SELECT/INSERT/UPDATE available on the core tables | Invoker functions have the required core privileges |
| Existing revision trigger | `setu_touch` requires `old.rev+1`, initializes inserts and retains the owner on updates | The migration's locked target updates match existing revision rules |
| R4 object collisions | No public `setu_research_*` relations/indexes or functions found; target migration absent from hosted history | R4 has not been installed; no name collision found at inspection time |
| Health advisors | No health notices returned | No health notice blocked this inspection; this does not establish security or restore readiness |
| Security advisors | Existing shared-project warnings remain, including mutable search paths on older `setu_distance_m` and `setu_comfort_match` functions | No security-clearance claim; unrelated functions/settings were left unchanged |

The metadata reads did not fetch personal place/review rows. Existing grants, policies, triggers, Auth settings and rows were not changed. This is a point-in-time inspection: rerun it if the schema or migration changes before installation. It does not verify hosted API exposure or gateway behavior for objects that do not yet exist.

The older Setu function search-path warning is described in the [Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable). R4's proposed functions use invoker privileges and a fixed empty search path. They still need post-install advisor and effective-permission checks.

## Backup and recovery evidence

The earlier private readiness record had no verified General_apps backup. Newer user-reported evidence on 22 November says a General_apps archive, table-of-contents file and checksum file exist, and no `pg_dump` process remains. This advances the status to **archive reported**, not **restore verified**. No private backup path, account identifier or archive contents are published here.

Before approving installation, retain the actual results of:

1. Matching a freshly computed archive SHA-256 to the recorded checksum, and successfully reading the complete archive with `pg_restore --list`.
2. Confirming the archive belongs to **General_apps**, predates the proposed change and covers the required Setu schema/data, policies/functions, migration state and owner/Auth dependencies. A table-of-contents listing alone does not establish successful data restoration.
3. Restoring into an isolated target, recording errors and validating representative Setu tables, owner references and access rules. Never restore over General_apps as a test. The Technical project's separate backup is not evidence for General_apps.
4. Recording the backup's accessible location/retention and any separate Auth/configuration/Storage recovery requirements. A database archive does not include Storage object files or all service configuration.

Reuse the ongoing General_apps backup work; no duplicate export was started for this review. This report did not access the Windows archive or perform an export/restore.

## Verification already available

The exact merged application tree previously passed **315 tests**, including **11 disposable PGlite SQL-engine cases** for migration execution, owner isolation, fixed suggestion defaults, evidence preservation, idempotent receipts, stale revisions and atomic failure. The existing successful run was checked against the merged tree; no application code or SQL changed in this documentation update.

Those SQL cases use a synthetic schema and one embedded engine. They do not establish separate-connection locking under hosted load, a complete General_apps restore, PostgREST/JWT behavior, or physical-device compatibility. The user's screenshot confirms the R4 panel opens with a signed-in account and a local destination while uploads remain disabled; it does not establish cloud persistence.

## Remaining release steps

| Step | Completion evidence | Approval boundary |
| --- | --- | --- |
| Backup verification and isolated restore | Archive checks, restore log, representative schema/data and owner checks | No production restore or mutation |
| Isolated R4 rehearsal | Apply the exact migration to an isolated compatible baseline; exercise independent accounts/connections, stale saves and retries | Production is not the rehearsal target |
| Hosted installation | Recheck current metadata/history, review the exact migration and apply only this R4 file; confirm objects, RLS, grants, function search paths, API exposure and advisors | **Separate approval for hosted SQL required** |
| Application activation and controlled test writes | Review the release-gate change and explicit synthetic test scope; verify backup-only save, publish twice, selective evidence merge, stale-target rejection, uncertain-response retry and account isolation | **Separate approval for activation and production test writes required** |
| Device acceptance | Desktop, Android/iPad, two-tab/two-device checks and current/previous cloud-backup restoration | R4 remains incomplete until acceptance is recorded |

The migration creates four owner-isolated tables, helper/RPC functions and seven indexes, including **five ordinary nonunique indexes on existing core tables**. Those core indexes may block concurrent writes while building. The transaction uses a 5-second lock timeout and 60-second statement timeout; a timeout is a failed installation to inspect, not a reason to remove safeguards or rerun a bulk push.

Do **not** bulk-apply the migration directory. The older G4 `seating_checks` migration is separate work. After any approved R4 installation, keep uploads disabled until database acceptance and the separate activation decision. Do not drop new tables, delete research, restore a shared database or clean up test records automatically.

The travel research prompts and the companion transport-calculation workflow remain separate and unchanged.
