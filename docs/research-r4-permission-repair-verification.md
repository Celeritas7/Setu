# Setu core permission repair — 25 November 2026

**Result: all six effective browser-role TRUNCATE permissions are denied. R4 installation and activation remain on hold.**

The owner reported “Success. No rows returned” after the exact permission statement presented in chat. This record independently verifies the resulting privilege state with read-only catalog queries; it does not claim the assistant executed the production repair.

## Scope and provenance

- Reviewed baseline: merged [PR #46](https://github.com/Celeritas7/Setu/pull/46), `d31bcfec505e947bb66c7dc61f487dcbc58ac915`; the tree matches the tested release preparation.
- Statement: [research_core_revoke_truncate.sql](../supabase/operations/research_core_revoke_truncate.sql), removing TRUNCATE from `anon` and `authenticated` on `setu_hubs`, `setu_food_notes` and `setu_spots`.
- Precheck: all six grants were both direct and effective. The selected target was cross-checked as General_apps, healthy.
- Postcheck: **25 November, 23:16:36 JST**, using [the metadata-only catalog probe](../supabase/checks/research_import_catalog.sql).
- This verification ran no production mutation, repeated REVOKE, data-row query, Auth/configuration change, restore, deployment or R4 installation.

## Observed postcondition

| Core table | anon TRUNCATE | authenticated TRUNCATE | RLS |
| --- | --- | --- | --- |
| `setu_food_notes` | Denied | Denied | Enabled |
| `setu_hubs` | Denied | Denied | Enabled |
| `setu_spots` | Denied | Denied | Enabled |

Effective denial accounts for inherited privileges, not merely the absence of a direct ACL entry. All other six reported table privileges for both roles match the precheck, including SELECT/INSERT/UPDATE/DELETE. The existing authenticated owner-policy expressions match exactly; the three tables still have 109 columns, 33 constraints, one trigger each and zero unvalidated constraints. The core revision-function fingerprint is unchanged.

The verification did not read personal place/review rows or attempt production TRUNCATE. A REVOKE changes privileges, not stored reviews. Normal owner CRUD, personal-edit preservation, denial and subsequent R4 publication were exercised in the isolated native fixture; they are not new live workflow tests.

## Post-repair catalog baseline

The ACL repair intentionally changes each table's combined catalog fingerprint. Retain this post-repair state rather than treating the older pre-repair hashes as the next installation baseline.

| Object | Same-target SHA-256 |
| --- | --- |
| `setu_food_notes` | `d2fc1901a32f0a20cce9f324d56303541ce676ced06c34db81bd2f5e34a027c8` |
| `setu_hubs` | `5e8018df42bb0c870443f04e994f47f4f0bc1017dd0faa6ddb0735e24e688e69` |
| `setu_spots` | `44fdead0d048f839f6efc789208d4da6b3b87e126c27d0fe31e7effa5a411be9` |
| `public.setu_touch()` | `41305fd77aba18014c019a5d57f6c9eb80df385c2097c8ca1eaa4eb5317e6f8a` |

These hashes cover metadata as defined by the probe, not application data or backup bytes. Refresh the same-target baseline immediately before any later approved operation; they are not standing evidence of recovery or future schema equivalence.

## Remaining boundaries

- The postcheck found **zero R4 tables/functions/relations**. A separate history read found no target R4 version or research-import-cloud name. The migration remains unapplied.
- `SetuResearchCloud.RELEASE_ENABLED=false` remains unchanged. Cloud import saving is not enabled by this permission repair.
- The [release proposal](research-r4-release-plan.md) still requires exact comparison-input/archive linkage and the already tracked recovery workflow's final relevant Auth/permission/configuration evidence before an R4 installation decision.
- Do not repeat the grant repair or restore the removed privilege automatically. Any new production operation needs its own existing approval scope; this reported repair does not authorize the R4 migration, activation or production test data.
- App code, travel prompts, the prepared R4 migration and the separate G4 workflow are unchanged.

The scoped repair lifecycle test passed against the merged tree in an owned temporary PostgreSQL cluster before the reported execution. The previous release preparation's 355 passing tests remain its software-validation record; this documentation-only follow-up adds the actual read-only hosted postcondition and does not claim a new full-suite or physical-device run.
