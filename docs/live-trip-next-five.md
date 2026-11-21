# Live Trip Companion L1 — Next five preview

**State:** stacked PR on top of unmerged L0 PR #32. Not deployed or merged. This is a read-only **provisional nearby recommendation preview**, not a complete live travel companion or verified safety planner.

## Where to see it after review and approved deployment

1. Open **Map** in Setu.
2. Select a saved area using the map's area control, or tap **Near me** and grant a fresh foreground location. **Plan trip · No limit** alone has no meaningful distance anchor and intentionally returns no ranked options.
3. Tap **✦ Next five · preview**; the existing five-result panel becomes an opt-in ranking panel. Tap the same button to return to original browse ordering.
4. Tap **Mood** to cycle Balanced → Quiet → Nature → Budget. Tap **Rain** to prefer recorded shelter information. The preview displays at most five existing, pinned places within **3 km straight-line** of the selected anchor. Unknown coordinates remain in the unchanged **Browse names** view outside preview.
5. Open a result or its Google Maps link normally. Nothing is written to a day, review, account or GPS history.

## Ranking and evidence contract

- The ranker is a pure helper in `js/next-five.js` and is also embedded in the self-contained `index.html`. This is intentional because the deployed app is a packed runtime. When modifying the helper, update the embedded copy **and** its Node test, and ensure the packed script parses. Keep the packed file under GitHub's 1 MiB contents API reading limit.
- Existing map source, tags, area and saved-coordinate filters are respected. The preview uses existing saved place records only; it does not retrieve new businesses, query real-time timetables or import the eight Ogose Phase L0 test candidates.
- Skip/deleted/sick-day rules remain in the existing map pipeline; beef-focused meals are removed using existing `sitBeefFocused` before ranking. Unknown dish ingredients remain unverified.
- Up to five eligible cards are chosen using proximity, regular hours, the minimum assumed worthwhile stay, an **optimistic straight-line travel lower bound**, recorded visit budgets/unknowns, quiet evidence if recorded, mood and shelter evidence. This is deliberately not turn-by-turn walk routing. No fake extra cards to reach five.
- Known closed and clearly too-short regular-hour options are omitted; hours not supplied are **unknown** and can be listed with warning. Holiday exceptions, temporary closure, weather and crowds are not verified automatically. Uses **Asia/Tokyo** time independent of device time zone. If an unknown price or cost type exists it is not called free; a recorded visit budget (even ¥0) is **not** a quoted admission fee.
- **Return is UNVERIFIED on every card.** L1 has no dated, sourced end-to-end operator service chain, street-route walking time or sunset/terrain assessment. Even when a destination is nearby, the UI never says the traveller can safely return. L3 must connect this to the existing pending Phase E4 Getting back card before a true safe-return deadline is offered.
- The preview does not handle unpinned recommendations, live transportation or actual cycling/walking routes, personalized budget ceiling, reviewed experience tags, GPS background monitoring, trip sessions or syncing. Those remain future phases.

## Acceptance and regression

`tests/next-five.test.mjs` covers Japan-local Saturday, missing location anchor, at-most-five behavior, unknown versus recorded ¥0, regular closing and overnight hours, distance lower bounds, unverified return, rain ranking, no-beef integration and the packed UI markers.

Run before merge:

```sh
node --test tests/*.test.mjs
node scripts/sync-planning-menu-examples.mjs --check
git diff --check
```

Manual browser verification is also needed at mobile widths and desktop: open Map, choose area, toggle Next five, cycle all four moods, toggle rain, open cards/Maps, switch back to ordinary map ordering, confirm no saved-trip changes, and test location denied/offline/empty results. A source snippet inspection or contract test is **not** a successful real-browser test.

## Dependency and approvals

**PR #32 L0 is not merged.** L1 is stacked on that branch, should only merge after L0, and must not modify Supabase, deploy Pages or mark L1 completed before its tests and review are accepted.
