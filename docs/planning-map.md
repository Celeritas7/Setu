# Planning map and nearby mode

## Where to find this phase

Open **Map** from the app navigation. This phase changes the Map screen, not
the **My Plan → Want to visit** cards introduced in the preceding budget-first
phase. Those budget cards, menu examples, filters and day totals are preserved.

The map now starts in **Plan trip · No limit**. It shows eligible saved places
across all areas, with no circle around a previously cached phone location.
The camera initially fits matching destinations, including places that arrive
after cloud loading. Moving, zooming or explicitly choosing a view stops that
automatic fit so it does not keep fighting the user's navigation.

## Choosing the search area

| Control | Result | Phone location required? |
| --- | --- | --- |
| Plan trip · No limit | Removes the spatial restriction and shows matching destinations across all areas | No |
| Near me | Uses a fresh phone fix for a nearby radius and enables foreground location updates | Yes; permission is requested only through the existing explicit nearby action |
| Saved area | Searches within the selected radius of that saved area's coordinates | No |
| A kilometre choice while planning | Searches around the visible map centre, or asks for a saved area if no centre is available | No |
| Search this area | Restricts results to the visible map bounds, without a circular distance limit | No |

**Filters** includes **No limit, 1, 3, 5, 10, 25, 50 and 100 km**. In Near me
mode, kilometre choices remain relative to the phone. In a manual-area search,
they remain relative to the chosen area or map centre. The displayed hint states
which origin is in use. Invalid radius values are ignored.

There is no automatic "at home versus travelling" detector. The user chooses
the mode. The app does not infer a trip from movement, create a GPS history or
save new place records when these controls are used. Existing home-screen
location behaviour is unchanged; planning itself does not start a map location
watch. Nearby updates stop when the user leaves or hides the map and may resume
when that same nearby view becomes active again with permission.

If GPS is denied, unavailable, stale or too imprecise, the map explains the
condition. **Plan trip** and manual-area searches remain available. A late GPS
callback cannot move the user back into nearby mode after choosing planning.
Distances remain straight-line estimates, not walking or cycling routes.

## What "No limit" does not remove

- Source and place-type filters still apply. It does not display every business
  on the internet or perform a new place-discovery search.
- Existing skipped/deleted and sick-day eligibility rules remain in effect.
- Places without usable coordinates remain reachable through **Browse names**;
  the app does not invent map pins or distances for them.
- Choosing **DAY OFF** retains its trip-discovery behaviour: all DAY OFF regions,
  no inherited nearby radius, and its existing type reset. Choosing **Plan trip**
  alone preserves the current source, type filter and picked stops.
- Five-item result pagination remains unchanged. **Fit matches** adjusts the
  camera without changing the selected search scope.

## Planning and navigation safeguards

- Picked places use both their record type and ID as their identity. A food and
  a sight with the same ID remain separate selections.
- **Plan a day** appends unique picks to an existing planned draft. It preserves
  its date, settings, earlier stops and unresolved saved references. With no
  draft open, it creates a new unsaved draft.
- A busy, visited or cancelled day is not overwritten. Picks remain available
  and a message explains how to continue. No changes are saved until the user
  uses the existing **Save day** action.
- Opening a place or hub and returning with Back restores the previous street
  map camera and scope. Explicitly opening Map again starts a fresh planning
  view.
- A wide destination fit or zooming in from a wide map no longer switches to
  the globe. Zooming out across the existing street-to-globe threshold still
  does, and the explicit Globe control remains available.
- Map Google Maps links reuse the validated link helper from budget-first
  planning. Unsafe saved links fall back to a generated Maps search. They do
  not add a Setu stop or write to a Google account.
- Saved place names are supplied to Leaflet tooltips as literal DOM text,
  rather than HTML. Mode and radius buttons expose their selected state.

## Compatibility and scope

This phase changes UI and transient map state. It does not change database
schemas, authentication, access rules, the integration bootstrap, saved place
coordinates, budgets or existing outings automatically. Existing selected-area
recents and explicit draft-saving behaviour remain in place. External map tiles
and map-library loading still require a connection; this is not an offline-map
release.

## Automated verification

Run from the repository root:

```sh
node --test tests/*.test.mjs
node scripts/sync-planning-menu-examples.mjs --check
git diff --check
```

For a decoded-template development workflow, the Node tests also accept
`SETU_TEST_TEMPLATE=/absolute/path/to/template.html`. Repack and rerun the tests
against the committed `index.html` before publishing.

The release passed **200 Node tests**, including 32 planning-map tests and 37
nearby-map tests, against both the decoded template and packed app. All 168
preceding tests remain present. Tests exercise the shipped runtime with fake
browser, geolocation and Leaflet boundaries; they prohibit network and database
writes. They cover mode changes, late data/GPS callbacks, permission failure,
manual radii, draft preservation, typed selections, Back camera restoration,
zoom direction, safe external links and literal tooltips. The embedded menu
catalog and canonical catalog still match, and the bundle manifest and outer
bootstrap are unchanged.

## Browser/device acceptance still required

Real-browser rendering and real-device GPS were not verified in this development
environment. Chromium startup was refused by the environment's socket
permissions before a page could load; that restriction was not bypassed.
Automated model tests do not establish responsive visual quality or real GPS
accuracy. This work is prepared for PR review, not a claim of deployment.

Before marking the phase fully accepted, test a branch preview or the approved
deployment at 320 px, 390 px and a desktop width:

1. Open Map with location denied. Confirm **Plan trip · No limit**, distant
   saved options and no nearby circle. Check mode/radius labels and overflow.
2. Try source/type filters, pagination and **Browse names** for unpinned records.
3. Select a saved area, try 50 and 100 km, then **No limit**. Confirm the origin
   and result scope agree with the hint.
4. Choose **Near me**, grant or deny permission, then return to planning while
   location is pending. Confirm late updates do not reinstate nearby mode.
5. Pan/zoom, open a place, and return with Back. Check that the camera is restored.
   Zoom in from a wide fit, then separately zoom out across the globe threshold.
6. Add picks to a dated existing draft. Confirm the original stops/settings remain
   and the budget subtotal still distinguishes unknown amounts. Do not save test
   changes into a real day unless intended.
7. Check map links open Google Maps separately, and confirm the preceding
   budget-first **My Plan → Want to visit** cards still work.
