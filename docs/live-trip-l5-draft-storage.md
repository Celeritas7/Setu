# L5B private draft storage rehearsal

One row represents one selected observation from an L4D place update draft. The key combines the signed-in owner with the exported trip ID, stop index and observation index. Those indices refer to occurrences in the append-only local trip history. A future editor that can reorder or remove occurrences needs stable observation IDs before syncing those records.

The fixture stores the recorded stop name, optional typed place reference and original observation JSON. Use SQL NULL for an unmatched place reference. The observation preserves its named space, outcome, date, optional note, unknown spending and optional comfort answers. A place reference from a file is a proposed match. Saving a draft confers no approval on a place, review, tag or research suggestion.

## Rehearsal

Run `node --test tests/live-trip-draft-schema.test.mjs` after installing the repository dependencies. The test creates an in-memory PostgreSQL database, two fictional users and a stand-in for the Supabase identity function. It loads [the fixture](../tests/fixtures/live-trip-draft-schema.sql) under simulated broad default grants, then exercises it under the authenticated and anonymous roles.

The rehearsal starts with owner-scoped insert and read. On a source-key collision, leave the first row intact and compare all three stored values (stop name, place reference and observation) using JSONB equality and null-aware comparison. An identical retry reuses the original draft. A changed retry requires an explicit conflict decision. The rehearsal covers a changed amount, stop name and place reference separately.

## Remaining release work

The fixture assumes validated L4D input. Before exposing any write path, design and test server-side payload validation, explicit signed-in selection and consent, concurrent retries, correction/deletion and revision handling, and backup/recovery against the proposed target. Test real Supabase Auth and PostgREST with two accounts. Add installation SQL to the migration path only as a separately reviewed change. Production installation and enabling cloud saving each need their own approval.
