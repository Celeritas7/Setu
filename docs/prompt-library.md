# Setu Prompt Library

## Purpose

The same four-stage journey-planning method should work for Ogose, Kawagoe or
any new destination without having to manually rewrite a long prompt.

## Entry and workflow

1. From Setu Home or the menu, open `prompt-library.html`.
2. Enter a destination, starting station, travel date (optional) and travel style.
3. Select a template: discover, transport, itinerary or live review.
4. Inspect the generated text, then use **Copy prompt**.
5. Open ChatGPT and start a *new conversation in the Travel project*. Paste and send the copied prompt.
6. Proceed through steps 1–4; research and import into Setu remain manually reviewed tasks.

An optional URL `prompt-library.html?destination=Ogose` pre-fills a place name,
so future hub or saved-place cards can open the same workflow directly.

Opening ChatGPT does **not** send the prompt automatically. There is no
unverified deep link or third-party token exchange. No OpenAI API charges,
Supabase writes or changes to authentication are introduced by this feature.

## Updating templates centrally

`data/travel-prompt-templates.js` is the one shared source of truth. Edit the
`body`, `title` or `description` there and bump `revision` when releasing a
change. The app loads that file when opened with a timestamp query parameter,
which avoids stale normal HTTP cache entries. After deployment, a subsequent
visit uses the new version; it does not rewrite prompts previously sent in
ChatGPT conversations.

The Catalog revision is shown in the UI. The last successfully loaded catalog
is cached per browser so it can be reused if the next visit is offline.

## Personal edits

**Edit template** lets the user save wording changes in this browser's local
storage. These remain personal to this browser and are not synchronized to
other devices. A personal version shows its status explicitly; if the shared
catalog advances, the UI warns that the personal edit uses an older base.
**Restore latest Setu version** deletes the local override for that step.

The destination fields and selected step are also saved locally. No saved
place, review, hub, trip, or personally confirmed experience tag is modified.

## Data contract

- `schema`: 1
- `revision`: release version string
- `templates[]`: unique `id`, `step`, `title`, `description`, `body`
- Allowed placeholders: `{{destination}}`, `{{origin}}`, `{{travel_date}}`, `{{travel_style}}`

If a new variable is needed, update the editor and replacement logic in
`js/prompt-library.js`, add UI input, and extend the tests. Treat templates as
plain text: user-supplied destinations are inserted literally, not executed.

## Checks

`node --test tests/prompt-library.test.mjs` validates catalog shape, distinct
steps, interpolation, central updates and the main-app integration markers.
Full regression: `node --test tests/*.test.mjs`.

## Possible later phase

If the user approves cloud synchronization, design authenticated per-user
template preferences and RLS separately. Never add unguarded public write
policies or auto-import unverified research as approved personal reviews.
