# DAY OFF source in Setu — 2026-11-14

- Map → **Source**: choose **All places** or **📺 DAY OFF**. Source filtering is independent of the existing **Show** theme chips, so a place retains its other tags.
- DAY OFF venues use a purple sun marker on the street map and globe. Suggested places retain dashed markers.
- With DAY OFF selected, the map displays five destinations per page. The list remains useful before geocoding completes; **Map** and **Episode** links are always offered. A selected marker shows its episode link.
- The first batch was sourced from the official TRAIN TV DAY OFF backnumber pages: 56 places from 27 numbered episodes (episode 14 was not present). Loaded into Supabase as 34 `setu_spots` and 22 `setu_food_notes`, all `accepted=false` for user review, with official `source_url` and `suggested_by='DAY OFF · TRAIN TV #N'`.
- Where the official page omitted a street address, the place and area are used as the geocoding query. Coordinates, opening hours and prices were **not** invented. Map pins appear as coordinates resolve in the background.
- The source marker is recognized by its `suggested_by`, official URL, or `dayoff` theme; existing tags and place information remain intact.

## Verification

Run `node tests/dayoff-source.test.mjs`. Manual verification after deployment: sign in, open Map, select **📺 DAY OFF**, confirm five-row pagination, choose a venue, open Maps/episode, and verify that **All places** restores the ordinary map. Review unaccepted places in Browse.
