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

## L5E atomic draft submission

Run `node --test tests/postgres/live-trip-draft-batch.test.mjs` to exercise the test-only SQL function with a version 1 place update draft. It derives the owner from the caller, validates the envelope and source keys, and submits every proposal in one statement. An identical occurrence is counted as a retry. Any invalid or conflicting entry aborts the statement, including earlier inserts. The test verifies this by reading back the original rows after failures. Anonymous sessions are denied by the function.

The standalone L5B table fixture retains direct grants for the earlier row-level rehearsals. Applying the L5I batch fixture replaces those grants in the disposable API database. The SQL call alone does not establish end-user consent.

## L5F signed-in consent rehearsal

The browser fixture starts with an empty selection, displays the destination account and previews the complete selected envelope. It verifies the account again on confirmation. Changing the selection invalidates the preview. Cancellation, account switch, sign-out or anonymous identity prevents a pending confirmation from reaching the capture callback. The test compares the captured envelope to the displayed envelope. Run the repository browser setup, then `node --test tests/browser/trip-draft-consent.test.mjs`.

Identity and transport are simulated. The fixture assumes validated proposals and captures the confirmed data locally. Future integration must bind the actual HTTP request to the same verified account even if identity changes during dispatch.

## L5G HTTP account verification

Run `npm run setup:research-api` and `npm run test:research-api`. The disposable RPC now requires the account ID from the review alongside the draft. PostgreSQL compares that ID with the signed request identity before processing any proposal. A Supabase JS client switching from account A to B receives HTTP 403 when submitting A’s review. An anonymous identity is also denied. Returning to the matching identity in the transport test exercises success and retry. The L5F screen independently requires a fresh review after an account switch.

PostgREST and PostgreSQL are real local processes. The identity endpoint uses signed fictional accounts. L5H covers end-to-end browser dispatch in the local rehearsal. Hosted Auth remains open.

## L5H browser confirmation through PostgREST

Run `npm run setup:research-browser` and `npm run setup:research-api`, then `npm run test:trip-draft-browser-api`. Chromium loads the consent fixture and the pinned Supabase JS browser client. Its requests go to the local gateway. Cancelling sends no draft. Confirming sends the displayed selection, shows a pending message, and reports success after the response. A signed identity swap on the outgoing RPC yields HTTP 403 and an unconfirmed-save message. The test checks database contents after both paths. The sign-in identity endpoint remains synthetic.

## L5I direct table permissions

The batch fixture removes direct table privileges from browser roles and transfers the submission function to a dedicated non-login role. This role has SELECT and INSERT on the draft table, uses the caller’s identity for row policies, and has neither table ownership nor an RLS bypass. The function has a fixed search path. Run the native batch, API and browser-to-API rehearsals to check effective privileges, denied direct reads and mutations, and successful reviewed saves. The isolated configuration still requires verification against the intended target before any installation.

## L5J revision-checked observation corrections

Run `npm run setup:research-api` and `npm run test:research-api`. A separate disposable fixture adds a revision starting at 1. The point lookup returns the named stop, place reference, observation and current revision for the reviewed account. A correction replaces just the observation, validated with the same rule as the original. The source occurrence and place reference remain fixed. The function locks the row and checks the reviewed revision before updating. An immediate identical retry returns the current revision. A competing change receives HTTP 409 and requires a fresh review. The HTTP test exercises concurrent edits, a successful re-review and an independent owner with the same source key.

This is a rehearsal of the correction API. The L5K browser rehearsal covers note and spending corrections. Deletion and target recovery remain open.

## L5K browser correction review

Run `npm run test:trip-draft-browser-api` after the local browser and API setup. The test-only editor loads one observation and shows its saved revision. A reviewer can edit the note and actual yen, inspect the proposed observation and confirm. After a competing edit, the editor requires the latest revision and a new comparison. Locally edited fields survive that refresh and the replacement includes other fields from the latest observation. Cancellation discards the proposal. The Chromium rehearsal reads the disposable database back after conflict, confirmation and cancellation.

## Remaining release work

The fixture covers stored row fields. Before exposing any write path, integrate and verify consent with the actual signed-in client, and design and test the correction interface, deletion and backup/recovery against the proposed target. Test real Supabase Auth and PostgREST with two accounts. Add installation SQL to the migration path only as a separately reviewed change. Production installation and enabling cloud saving each need their own approval.
