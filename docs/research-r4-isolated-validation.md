# R4 isolated PostgreSQL validation — 25 November 2026

**Result: native database rehearsal passed. Production installation and activation remain unapproved.**

The next R4 step after the merged prompt-content upgrade (#43, `22d4c4a`) was to validate the research migration with independent PostgreSQL connections. The earlier PGlite suite uses one embedded engine and could not establish native lock contention. This change adds an explicit, reproducible native rehearsal and fixes one compatibility defect it exposed. The travel prompts are unchanged.

## What ran

| Item | Evidence |
| --- | --- |
| Native engine | PostgreSQL **17.12**, Linux x64; Node **24.22.3** |
| Cluster | Newly generated private temporary directory, random available TCP port, `127.0.0.1` only, Unix sockets disabled, generated temporary credentials |
| Core baseline | Read-only metadata inspection of the three configured Setu core tables on 25 November: **109 columns**, **33 constraints**, owner policies and the existing revision trigger. No application/review rows read |
| Synthetic dependencies | Empty `contacts` FK stub, minimal test `auth.users`, test claim helpers, two fixed fictional owner UUIDs and non-superuser login roles |
| Proposed migration | Only `20261122065058_research_import_cloud.sql`, executed in the new local cluster; the older G4 migration was not applied |
| Default regression | **316 passed**, including **12 PGlite SQL-engine cases** |
| Native rehearsal | **18 passed**, zero failures/skips; PostgreSQL backend IDs are captured before starting concurrent queries, and lock waits are observed via `pg_locks` / `pg_blocking_pids` |
| Hosted state | Read-only check found no R4 tables or migration-history entry. No hosted DDL, data, Auth setting or deployment changed |

The committed baseline is a synthetic test fixture with the inspected core shapes. It is not a full database export, an Auth implementation, or a replacement for the shared General_apps recovery work. Only generated test identities and fictional places are inserted. The existing Windows PostgreSQL services and Solitro restore targets are not used or changed.

## Cases exercised

| Area | Native evidence |
| --- | --- |
| Privileges | Effective function/table privileges, RLS enabled, no anonymous execution/read path for new storage, invoker functions with fixed search paths, no authenticated truncate or append-only update/delete grants |
| Account isolation | Different non-superuser connections; another owner cannot read or forge any of the four research tables. Anonymous role, missing user and anonymous sign-in are rejected |
| Backup and checkpoints | Backup-only commits create no core places. A later revision retains the complete prior workspace and restores through the existing portable-backup validator |
| New/repeated publication | Fixed unaccepted/unvisited defaults, unknown prices, complete source evidence, repeat publication with zero new places/evidence and preservation of existing personal fields |
| Little World | The labelled fictional handoff's full optional food profile, source references and unknown values survive publication and portable backup exactly |
| First-insert contention | Two connections publishing the same destination actually wait on the owner's advisory lock; one wins, the stale request fails without partial records |
| Exact request contention | Two simultaneous copies of one request wait, then receive the identical receipt with one published place and one request record |
| Later revisions | Competing revision updates preserve the winner and previous checkpoint. Different owners progress independently |
| Cross-destination identity | Same-owner publications for two destinations wait on the same owner lock; the duplicate loses and its partial hub/workspace is rolled back |
| Selected merges | Evidence-only changes preserve every existing core/personal value except revision/update time. An actual concurrent manual edit blocks the importer and then causes stale-target rejection |
| Atomic failure | A failure in the second place rolls back earlier hubs, places, identities, evidence, workspace and receipt |
| Before-commit interruption | A controlled receipt trigger pauses the import late in its transaction. Terminating that test backend rolls the batch back; retrying the same request succeeds once |
| After-commit response loss | The real JS transport calls a native-SQL adapter. Its successful response is deliberately discarded; the test outbox stays pending and retry recovers the original receipt even after the workspace advances |
| Optional personal field | An absent optional `personal_observation` is accepted without adding/changing source fields; non-null personal observations still reject the whole batch |

The native outbox adapter uses the existing in-memory test Store. Browser IndexedDB, UI and transport regressions remain in the default suite; this is not a new claim of physical-browser persistence or an HTTP fault-injection test.

## Compatibility defect and correction

The existing v1 handoff schema permits `personal_observation` to be absent, or explicitly null. Its omission passed the client validator but failed the SQL attachment guard with **Research cannot supply personal confirmations**. The guard compared SQL NULL (missing key) to JSON null as different values.

The unapplied migration now treats an absent observation as no observation **for the guard only**. It neither inserts a null key into original evidence nor permits a non-null observation. Added PGlite and native regressions prove both the accepted omitted-field case and the unchanged protection of personal review/visit defaults.

**Current migration SHA-256:** `a72ab87055330d4c09eabb0a4bef4f0c212fdd864a8d6da6dae2d2e6d1683790`.

This supersedes the migration fingerprint in the dated 22 November readiness inspection. No new migration file was needed: the existing R4 file remains unapplied in the configured hosted project. Review the current file, not an older downloaded copy, before any separately approved installation. Do not bulk-apply the migration directory.

## Reproduce without touching an existing database

Use Node **20 or newer** and a normal, non-root development user:

```sh
npm ci
npm test
npm run test:research-postgres
```

The pinned development-only dependencies are `embedded-postgres@17.12.0-beta.19` and `pg@8.23.1`, alongside the existing PGlite. The lockfile records the native platform package. The wrapper verifies/recreates its packaged symlinks when necessary; no system account, Docker service or global PostgreSQL install is created.

The native command always creates its own cluster. It accepts no database URL or external host configuration; client host, port, database, user, password, SSL and connection options are explicit. Before creating test tables, the harness verifies the server's data directory is the one it created and its major version is 17. Shutdown closes test connections, stops that server and removes only its generated temporary directory. A startup failure fails the test; it never falls back to a real database or silently skips the rehearsal.

Native startup was tested on Linux x64 only. Windows/macOS package support is not a claim that those platforms or user devices passed acceptance. The ordinary `npm test` command remains separate from native startup.

## Remaining acceptance boundaries

- **JWT / hosted API:** tests deliberately supply local claim settings and Auth helpers; no real tokens, signature validation, sign-in, PostgREST, API schema exposure or API limits were exercised. Native role/RLS checks with known test claims do not establish real Supabase Auth acceptance.
- **Recovery:** this phase did not export or restore the General_apps archive or revalidate external source-archive linkage, Auth recovery, private Storage or service configuration. Reuse the existing backup/recovery workflow; do not start a duplicate backup or treat this synthetic cluster as its replacement.
- **Concurrency limits:** tested the specific interleavings above, not hosted load or every possible schedule. Unrelated manual creation outside the research RPC can still race its duplicate check, as already documented.
- **Current snapshots:** the fixture reflects the inspected core schema and a controlled locale; it does not establish complete shared-schema/collation parity. Recheck hosted metadata and the exact migration before installation.
- **Devices:** desktop/Android/iPad, physical two-tab/two-device acceptance and live prompt revision checks remain separate.
- **Release:** `RELEASE_ENABLED=false` remains unchanged. Hosted SQL, release activation, production test writes, merge and deployment still require their existing separate approval.

The next backend acceptance work is an isolated API/JWT rehearsal and recovery-evidence reconciliation before proposing a concrete hosted installation. This phase alone is not permission to apply production SQL.

## References

- [PostgreSQL 17 explicit locking and lock inspection](https://www.postgresql.org/docs/17/explicit-locking.html)
- [PostgreSQL 17 cluster initialization](https://www.postgresql.org/docs/17/app-initdb.html)
- [Supabase RLS: grants and owner policies](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [node-postgres client connection configuration](https://node-postgres.com/apis/client)
- [Pinned native-cluster wrapper project](https://github.com/leinelissen/embedded-postgres)
