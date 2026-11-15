# Budget-first planning cards

## Where to find the change

Open **My Plan → Want to visit**, then choose a prefecture and area hub. Each
place now shows its visit budget (or an explicit unknown), any separately saved
minimum order, available menu examples, opening-hours information, and a
**Google Maps** link before **+ Day**. The existing five-place pagination and
saved-order default remain intact.

The price limit and lowest-price sort use **saved visit estimates per person**.
They do not treat a minimum purchase or the cost of a sample drink as the cost
of a visit. The **Budget unknown** group remains accessible even with a price
limit selected; its notice explains that the limit does not apply in that group.
An explicit saved zero remains distinct from a missing value and is never
described as proof of free food, admission, or permission to sit.

## Price meaning and limitations

- Saved estimates are shown without altering them. The disclosure explains that
  their food/drink/entry coverage has not been recorded and shows the separate
  budget observation date when available.
- Minimum orders remain separate and are not added to a saved visit estimate.
- Menu examples have item-level yen amounts, tax status, official source links,
  and a check date. They are display-only examples, not a quote or a guaranteed
  minimum order. They never populate a saved budget or a day total.
- No seating duration or current opening claim is inferred from a price. Missing
  opening hours and 90-minute-stay evidence are labeled unverified. Saved hours
  and seating rules still need confirmation for holidays and current policies.
- Dates older than 60 days, future dates, and unknown observation dates are
  disclosed. This is a review reminder, not an expiry or a fresh-price guarantee.
- Planned-day totals are explicitly **recorded place-spend subtotals per person**,
  disclose unpriced stops, and exclude transport. Unknown is never silently zero.

The initial public examples cover the exact named Musashi-Urawa branches of
Saint Marc Café and S PRESS CAFE, checked on 2026-11-15. Matching requires both
an exact normalized place alias and hub alias; prices are not inherited by
other branches. S PRESS has a drink example only because its official meal
menus differ. The sources and amounts are in
[`data/planning-menu-examples.json`](../data/planning-menu-examples.json).

## Google Maps

The per-card button opens Google Maps separately and does not add a stop to a
Setu draft. A saved Google Maps HTTPS URL is used only after host and path
validation; otherwise a search URL is built from the place's address,
coordinates, or name and area. The user can use **Save** inside Google Maps to
choose a personal list. Setu does not write to Google lists, synchronize them,
or require Gemini or a Google API key for this link-out feature.

## Data and compatibility

This change does not modify database schemas, authentication, access rules, saved
place fields, or existing outings automatically. Filters and sorting are view
state. Adding/removing stops changes the existing draft only; **Save day** keeps
its existing behavior. External network requests are not used to load prices.

An unresolved saved stop remains visible as an unavailable placeholder and an
unknown budget. Its original index is retained, so removing or moving a later
stop cannot act on the wrong saved reference. Such placeholders are omitted
from Maps routes with a warning; **Suggest stops** asks the user to review them
instead of silently removing them. This does not migrate or repair saved data.

The subsequent map-radius/planning-mode phase is documented separately in
[`planning-map.md`](planning-map.md); it preserves this budget-card behaviour.

## Updating public menu examples

1. Recheck official branch menus. Update item prices, sources, aliases and the
   actual check date in `data/planning-menu-examples.json`. Keep conflicting or
   unknown facts explicit; do not infer stay permissions or minimum orders.
2. Run `node scripts/sync-planning-menu-examples.mjs` to validate and embed the
   catalog in the self-contained app. No runtime fetch is introduced.
3. Run `node scripts/sync-planning-menu-examples.mjs --check` and
   `node --test tests/*.test.mjs` before publishing.

When working on a decoded template, the synchronization script also accepts
`--template /absolute/path/to/template.html`; repack the app afterward. The unit
tests support `SETU_TEST_TEMPLATE` for the same development workflow.

## Verification scope

Regression tests cover price semantics, zero/malformed values, date warnings,
safe Maps URLs, exact branch matching, canonical/embedded catalog equality,
filtering, stable sorting, pagination, draft actions and unresolved saved stops.
All automated fixtures use invented records and prohibit database writes or
price-fetch requests. Production data and real Google account saves are not
exercised by these tests.

`tests/budget-ui-smoke.mjs` is an optional, separate Playwright check for the
actual bundled renderer at 320, 390, and 1280 pixels. With Playwright and Chromium
available, run `node tests/budget-ui-smoke.mjs`; use `SETU_CHROMIUM_PATH` for an
existing browser and `SETU_SMOKE_ARTIFACTS` for screenshots. It checks the cards,
disclosures, filters, Maps/add separation, draft actions, and horizontal overflow.
It is not part of `node --test tests/*.test.mjs`.

For this change, 168 Node regression tests passed and both maintenance/smoke
scripts passed syntax checks. Visual verification remains outstanding: the
development environment refused Chromium startup with a socket permission
error, before any UI assertions or screenshots. Run the optional smoke test in
a browser-capable environment before treating the responsive layout as verified.
