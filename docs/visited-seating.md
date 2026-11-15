# G4 — Visited-place seating confirmation (review candidate)

G4 adds a single **Visited / Confirm seating details** sheet for observations made
at an individual saved place. It does not create a day, mark a day or place
visited, submit a review, or assign Cocoon, Igloo or Hideout tags.

## Where to open it

- **Find a place to sit** → a result → **Visited / Confirm seating**.
- **Hubs** → choose a hub → **Sit long with food · 90 min** → a result → **Visited / Confirm seating**.
- **My plan** → **Plan a day** → **Sit long with food · 90 min** → a result → **Visited / Confirm seating**.
- **Places to eat** → open a saved place → **Visited / Confirm seating details**. A saved sit-long spot also has a confirmation action under its hub's **Shops & sights**.

The panel pre-fills previously recorded facts but selects **nothing** for
confirmation. Editing a field selects only that field. Alternatively, tap
**Mark checked this visit** to affirm an unchanged known value. Choose the
actual date when the check occurred in Japan; it can be before today, not a
future date. An unknown value cannot be confirmed as a known fact. To correct
an old recorded value to unknown, clear that value explicitly and save.

The four independently checked fields are:

| Observation | Existing stored field | Unknown | Explicit known value |
| --- | --- | --- | --- |
| Seating policy | `seating_type` | null / unknown | `free_seating`, `buy_to_sit`, `own_food_ok` |
| Purchase rule in words | `min_order` | null | e.g. one drink per person |
| Minimum-order amount | `min_order_yen` | null | integer yen, including 0 |
| Permitted stay limit | `stay_limit_min` | null | positive minutes; **0 means explicitly no stated limit** |

**Minimum order is not a visit-budget estimate.** G4 never writes
`spend_yen`, `spend_seen`, or `setu_menu_items`. A checked drink cost does
not prove a stay of 90 minutes or outside-food permission. G4 also leaves
reviews, saved days, day drafts, and subjective experience tags alone.

## Database prerequisite — not applied

The actual hosted G1 schema already contains the four existing fields on
`setu_food_notes` and `setu_spots`, with `rev`-protected writes. It has only
the legacy *record-wide* `confidence` and `last_checked` metadata. Updating
those after confirming one drink would misleadingly imply that the other
seating facts were checked on the same visit.

The **prepared, unexecuted** migration
`supabase/migrations/20261115144051_g4_seating_field_confirmations.sql`
adds one optional `seating_checks` JSONB object per table. Its entries hold
actual Japan-local check dates separately, for example:

```json
{
  "min_order_yen": "2026-11-15",
  "stay_limit_min": "2026-11-14"
}
```

Missing keys are **not confirmed**. Older rows start with an empty object;
existing `confidence`, `last_checked`, owner, `rev`, policies, triggers,
permissions, and other fields are not changed by G4. The app writes a
minimal patch through the existing signed-in `window.setu.save()` path,
including the current revision. Existing unknowns, source provenance, and
unrelated JSON keys are preserved. Canceled forms make no writes; failures
retain entries for a retry. Duplicate submissions are guarded.

**Approval gate:** when signed in and the new column is absent, the sheet
explains that saving is disabled. A subsequent separately approved migration
deployment and app reload will enable it. The PR does **not** run SQL or
change production records. Signed-out users can still confirm a locally saved
food record in the existing browser store; saved spots require sign-in.

## Verification

```sh
node --test tests/*.test.mjs
node scripts/sync-planning-menu-examples.mjs --check
git diff --check
```

Optional real Chromium test (requires Playwright, with Chrome if needed):

```sh
SETU_CHROMIUM_PATH=/path/to/chromium node tests/visited-seating-ui-smoke.mjs
```

This browser test uses invented places with account/GPS/HTTP mutations
disabled, checks 320, 390 and 1280 px, and includes a failed save/cancel.
The existing budget-card browser smoke test remains separate.

### Manual acceptance after review, migration approval and deployment

1. On Android/iPad/desktop, open each entry point. Check that the sheet fits
   its viewport and remains scrollable even with the keyboard open.
2. With an older place, open then Cancel: verify it saved nothing. Reopen and
   confirm a single recorded value without editing; other fields remain
   unconfirmed.
3. Test unknown versus explicit ¥0 and unknown versus explicit no-limit (0).
   Verify a short stay disappears from 90-minute results after an approved
   save, and a missing limit remains marked unknown.
4. Confirm only the minimum amount. Reopen: the date should appear only for
   that amount. Check My plan budgets, menu examples and saved day drafts.
5. Try an invalid/future date and an invalid amount: no write. Simulate a
   network failure; entries must survive and retry must work once.
6. Confirm another saved spot. Its outing must remain planned; the visit
   review/status and personal experience tags must remain unchanged.
7. Recheck pref/hub paging, Map planning/no-limit and explicit nearby modes,
   DAY OFF picks, no-beef filtering and the separate long-trip app.

Real-browser and physical-device GPS checks must not be called **passed**
unless actually run. G4 does not add automatic travel detection or GPS access.
