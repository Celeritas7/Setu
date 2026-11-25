# R4 isolated HTTP and JWT validation — 25 November 2026

**Result: 19 real-HTTP integration checks passed. Cloud saving remains disabled; hosted installation and activation remain separate decisions.**

This phase starts from merged [PR #44](https://github.com/Celeritas7/Setu/pull/44), `c939c1c`. It follows the [native PostgreSQL rehearsal](research-r4-isolated-validation.md) with a real PostgREST server, signed fictional JWTs and the actual Supabase JavaScript client. It changes development tests, fixtures and documentation. It does not change the app, travel prompts or migration.

## Rehearsal stack and scope

| Component | What ran |
| --- | --- |
| Database | Fresh PostgreSQL **17.12** cluster, independent connections, loopback TCP only; the inspected synthetic core baseline and exact proposed R4 migration |
| REST gateway | Official Linux x64 **PostgREST 16.6**, pinned archive and executable checksums; generated local connection, non-superuser/non-bypass login with membership only in `authenticated` and `anon` |
| Client | Development-only **`@supabase/supabase-js@2.119.2`**, calling the existing `js/research-cloud.js` transport over HTTP |
| Signing | Development-only **`jose@6.2.18`**, ephemeral **ES256** key pair and fictional accounts; public JWKS passed to PostgREST |
| Identity endpoint | A small `/auth/v1/user` fixture verifies the test signature, issuer, audience and time claims and returns only fictional users; it is **not Supabase Auth / GoTrue** |
| Fault injection | Loopback proxy forwards actual REST requests; can discard an already committed response or change the session/token at a controlled point |
| API limits | Real PostgREST `db-max-rows=2`; client must finish comparison paging using actual count headers |
| Runtime | Linux x64, Node **24.22.3**; all data, credentials and signing keys generated for the rehearsal |

The native baseline's `auth.uid()` and `auth.jwt()` SQL helpers now reproduce the legacy-plus-JSON claim lookup inspected read-only in the configured project. Native tests can supply claim settings directly; HTTP tests receive JSON claims from PostgREST after signature validation. This adjusts only the synthetic fixture, not any hosted function. Two minimal owner-scoped registry tables let the existing comparison projection execute; they do not reproduce the entire shared registry.

Only the local fixture enables the transport through its existing test option. `SetuResearchCloud.RELEASE_ENABLED=false` remains unchanged in app code. No hosted database, Auth setting, production record, Windows PostgreSQL service or Solitro restore target is used or changed. This is not a General_apps archive restore or verification of the separately tracked recovery evidence.

## Cases exercised

| Area | HTTP evidence |
| --- | --- |
| Signed identity | A real SDK session reaches the identity fixture and the actual PostgREST capability RPC |
| Invalid tokens | Mutating requests with no token, tampering, wrong signing key, `alg=none`, expiry, future `nbf` or wrong audience fail without writes |
| Role escalation | Even a correctly signed fictional token cannot select the database's `postgres` role; the gateway has no such membership |
| Anonymous / wrong owner | Anonymous sign-ins and a valid token for a different expected owner are rejected by the SQL owner guard |
| Backup-only save | Real prepare/commit/download retains a portable workspace and creates no core places |
| Publication and repeat | Suggestions remain unvisited/unaccepted; unknown spend and coordinates remain null. Repeat publication creates no duplicate place/evidence and preserves later personal edits |
| Account isolation | Another account cannot read owner records, even with an explicit owner filter, or forge an insert into any of the four research tables |
| Effective REST permissions | Receipt updates and evidence deletion are denied; the private `auth` schema is not exposed through the configured REST schemas |
| Truncated pages | Five owned comparison hubs require three actual HTTP pages under the two-row server limit; another owner's hub is excluded |
| Stale workspace | A competing device receives an explicit revision conflict and must preview again |
| Selective merge | Attaches only the chosen research group and advances revision; all other existing core/personal values remain identical |
| Stale merge target | A real REST manual edit after preview rejects the stale import and retains the manual review |
| Switch before dispatch | Changing the actual SDK session to account B blocks account A's prepared request before dispatch |
| Switch at dispatch | Injecting B's wire token while client identity checks still see A is rejected by the RPC's expected-owner guard |
| Switch after commit | A completed A request remains uncertain when the SDK switches to B before the response; B cannot replay A's outbox, and returning to A recovers the original receipt |
| Lost committed response | The proxy drops an actual successful HTTP response. The pending request retains an identical body hash and recovers the original receipt even after another device advances the workspace |
| Disabled / unavailable identity | Identity lookup failure and the default disabled release gate prevent writes |
| Little World | Full optional food profile, sources, unknown dish prices and original research survive REST JSON, evidence reads and both current/previous portable downloads |

The outbox in this integration suite uses the existing in-memory test Store. The default suite separately covers IndexedDB and UI adapters. These HTTP results do not prove physical-browser persistence, tab coordination or device acceptance.

## Reproduce

Use a normal, non-root **Linux x64** development user, **Node 22 or newer**, and `curl`, `tar` with xz support:

```sh
npm ci
npm run setup:research-api
npm test
npm run test:research-postgres
npm run test:research-api
```

`setup:research-api` is an explicit, development-only download from the [official PostgREST 16.6 release](https://github.com/PostgREST/postgrest/releases/tag/v16.6). It validates the archive before extraction, requires its single expected executable, then verifies the binary. It caches only the executable under ignored `node_modules/.cache/setu-research-api/`. A clean `npm ci` removes that cache, so run setup again. No binary is committed, downloaded automatically by the app, or required by ordinary `npm test`.

| Integrity check | SHA-256 |
| --- | --- |
| `postgrest-v16.6-linux-static-x86-64.tar.xz` | `335ea29f00145705fb569b1268b9c8e53d062f8f6f9188192e92ea3781d2dca1` |
| Extracted `postgrest` | `b8ce4b8e51df68feb73d6b848a2798b76aaf0b15aee83a257a3c4acc9e228768` |
| Unchanged R4 migration | `a72ab87055330d4c09eabb0a4bef4f0c212fdd864a8d6da6dae2d2e6d1683790` |

The test command refuses a missing or mismatched binary and never substitutes an external gateway. All database/server URLs are generated internally; inherited `PGRST_*`, PostgreSQL environment options and `DATABASE_URL` cannot redirect the gateway. The database helper verifies its owned data directory before creating fixtures. The SDK rejects requests outside the generated local origin. Temporary configuration contains generated local credentials, has restrictive permissions and is removed after stopping the test services. Traces retain only paths, methods, response status and body hashes, not tokens or credentials.

The rehearsal fails rather than silently skipping on unsupported platforms or failed startup. Shutdown stops only its children and removes only its generated temporary directories. It never creates a system account or modifies a global PostgreSQL installation. The pinned wrapper can restore its packaged native symlinks without changing global npm policy.

## Verification recorded

- Clean `npm ci` and uncached, checksum-verified gateway setup.
- **316 default regressions**, including **12 PGlite SQL cases**.
- **18 native PostgreSQL tests** after the fixture claim-helper adjustment.
- **19 HTTP/JWT tests**, zero failures or skips.
- HTTP suite also passes with conflicting `PG*`, `PGRST_*` and `DATABASE_URL` settings; the generated local endpoints remain authoritative.
- Manual startup checks reject a changed executable checksum and clean up an executable-permission failure; the verified cache is restored and no new temporary cluster roots remain.
- App release gate remains false and the migration fingerprint is unchanged.

## Remaining release boundaries

- **Full Auth:** the identity endpoint is a fixture. No real sign-in, refresh, logout/revocation, email confirmation, production issuer or signing-key rotation was tested. A valid signature alone is not evidence of a live, unrevoked production session.
- **Hosted gateway:** this standalone pinned server is not the project's deployed gateway version/configuration, TLS, API-key router, schema cache or production row limit. Production API exposure, privileges, advisors and configuration need acceptance after a separately approved installation.
- **Application client:** the pinned npm SDK is development-only. The browser's existing SDK/bootstrap and authentication bundle are unchanged; this phase does not assert they were upgraded or physically exercised.
- **Recovery:** reconcile the existing General_apps source/archive/restore and Auth recovery evidence before proposing release. Do not repeat the external backup process or treat this empty synthetic cluster as its replacement.
- **Devices and load:** no new desktop/Android/iPad, two-tab/two-device, full-browser crash or hosted-load acceptance is claimed. Native contention results and their manual-create race limitation remain in the earlier report.
- **Approval:** no hosted SQL, activation, production test writes, merge or deployment occurs in this phase. R4 stays incomplete until those separate steps and acceptance are recorded.

The next release-preparation step is to reconcile recovery evidence and prepare the exact installation/acceptance proposal. It does not authorize executing that proposal.

## Primary references

- [PostgREST 16.6 release and official asset](https://github.com/PostgREST/postgrest/releases/tag/v16.6)
- [PostgREST authentication and database role switching](https://docs.postgrest.org/en/stable/references/auth.html)
- [PostgREST configuration, including row limits and JWT audience](https://docs.postgrest.org/en/stable/references/configuration.html)
- [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase JavaScript client source](https://github.com/supabase/supabase-js)
