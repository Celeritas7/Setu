# L5B private draft storage rehearsal

One row represents one selected observation from an L4D place update draft. The key combines the signed-in owner with the exported trip ID, stop index and observation index. Those indices refer to occurrences in the append-only local trip history. A future editor that can reorder or remove occurrences needs stable observation IDs before syncing those records.

The fixture stores the recorded stop name, optional typed place reference and original observation JSON. Use SQL NULL for an unmatched place reference. The observation preserves its named space, outcome, date, optional note, unknown spending and optional comfort answers. A place reference from a file is a proposed match. Saving a draft confers no approval on a place, review, tag or research suggestion.

## Rehearsal

Run `node --test tests/live-trip-draft-schema.test.mjs` after installing the repository dependencies. The test creates an in-memory PostgreSQL database, two fictional users and a stand-in for the Supabase identity function. It loads [the fixture](../tests/fixtures/live-trip-draft-schema.sql) under simulated broad default grants, then exercises it under the authenticated and anonymous roles.

The rehearsal starts with owner-scoped insert and read. On a source-key collision, leave the first row intact and compare all three stored values (stop name, place reference and observation) using JSONB equality and null-aware comparison. An identical retry reuses the original draft. A changed retry requires an explicit conflict decision. The rehearsal covers a changed amount, stop name and place reference separately.

## L5C storage validation

The fixture checks each inserted draft at the table boundary. It requires a named space, a supported outcome, a valid calendar date, an explicit note or null, and spending in whole nonnegative yen or null. A personal review needs a first-hand note. Optional comfort answers belong to personal reviews and use the choices offered in Trip session. Extra observation and place-reference fields are rejected. A supplied place reference needs a type and ID; its existence and ownership still require separate verification before use.

The regression sends invalid rows directly to PostgreSQL as the authenticated owner. It also reads back a leap-day personal review with zero spending, negative comfort feedback and an unknown Wi-Fi answer.

## L5D concurrent saves

Run `node --test tests/postgres/live-trip-draft-concurrency.test.mjs` with the repository dependencies. The test opens independent sessions in an isolated PostgreSQL 17 cluster. It checks the server’s lock graph before releasing the first same-owner transaction. Under READ COMMITTED, an identical retry sees the committed draft, a changed retry reports a conflict, and a waiting insert succeeds if the first writer rolls back. Two different owners can submit the same source key independently and read back their own values. Both database rehearsals exercise the same insert-and-compare helper.

## Remaining release work

The fixture covers stored row fields. Before exposing any write path, design and test request-envelope validation, explicit signed-in selection and consent, correction/deletion and revision handling, and backup/recovery against the proposed target. Test real Supabase Auth and PostgREST with two accounts. Add installation SQL to the migration path only as a separately reviewed change. Production installation and enabling cloud saving each need their own approval.
