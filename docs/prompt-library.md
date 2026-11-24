# Setu Prompt Library

## Purpose

The same four-stage journey-planning method should work for Ogose, Kawagoe or
any new destination without having to manually rewrite a long prompt.

**Little World research revision (2026-11-24.1):** [four complete replacement prompt documents](research-prompts/little-world/README.md) add automatic cultural food discovery, its optional v1-compatible authoring extensions, verification checklist and separately scoped future app requirements. This document-only revision leaves the application and shared catalog below unchanged; the current Copy prompt buttons still use catalog `2026-11-22.1`. Use the replacement documents for Little World research until a separate prompt-content release adopts them in the app.

## Entry and workflow

1. From Setu Home or the menu, open `prompt-library.html`.
2. Enter a destination, starting station, travel date (optional) and travel style.
3. Select a template: discover, transport, itinerary or live review.
4. Inspect the generated text, then use **Copy prompt**.
5. Open ChatGPT and start a *new conversation in the Travel project*. Paste and send the copied prompt.
6. Proceed through steps 1–4. Each prompt now specifies an optional, **versioned Google Drive research handoff** where connected Drive access permits it. Research still requires explicit Setu import review; writing Drive files does not update Setu.

An optional URL `prompt-library.html?destination=Ogose` pre-fills a place name,
so future hub or saved-place cards can open the same workflow directly.

Opening ChatGPT does **not** send the prompt automatically. There is no
unverified deep link or third-party token exchange. No OpenAI API charges,
Supabase writes or changes to authentication are introduced by this feature.


## Research handoff in Google Drive (revision 2026-11-22.1)

The existing four prompts now support a shared research-folder convention. This is prompt wording only: Setu does **not** read or sync Drive folders by itself.

**Verified parent convention:** `My Drive/Claude_Workspace/#Data_storage/Setu_research/<destination>/`, e.g. `Ogose/`. Find and verify the exact folder rather than trusting a newly typed path. Never write into unrelated language-study/storage folders. For a new destination, create a folder only after the user authorizes it. Leave existing files intact.

- **Discover**: generate a complete draft candidate inventory conforming to `setu_research_handoff_v1.schema.json`, not merely five displayed suggestions. Preserve Japanese names, hub, address, map links, source URLs/check dates, distinct evidence for estimated/published/unknown prices and facilities, no-beef caveats and potential-only experiential tags.
- **Transport**: if and only if the trip date is confirmed, research current operator service calendars and dated departure/return chains. Save **separate date-scoped transport evidence**; do not make an old timetable appear current for a new date.
- **Itinerary**: produce readable alternatives plus a **new version** of the research JSON and a concise change log; reuse earlier verified findings rather than repeating all prior place prose. Undated trip = untimed provisional plan.
- **Live review**: create an **additive review-change draft** only from the user's explicit observations, scoped to the actual room/space entered. Do not revise research claims into personal confirmations. No automatic review imports.

**Schema applicability:** the existing `setu_research_handoff_v1.schema.json` governs the **place-research JSON**. Transport snapshots and review-change drafts are **separate supplemental records** whose dedicated validated schema/import support is *not yet implemented*. They must be labelled as non-importable drafts until the developer chat approves contracts. Never masquerade as the v1 place JSON schema.

**File naming guidance:** use `<destination>_research_vYYYYMMDD_N.json`, `<destination>_transport_<travel-date>_checked_<YYYYMMDD>.json`, and `<destination>_review-draft_<YYYYMMDD_N>.json`. Check the folder for existing files first and increment a unique version; don't overwrite a previous version even if its contents are stale. Store readable reports separately. Once uploaded, read back the Drive parent ID and file ID before claiming success. If upload is impossible (unconnected Drive, permissions, storage full), return downloadable files and disclose that no upload occurred.

**Security boundary:** a user's explicit instruction to prepare research does not authorize edits to GitHub code, live Supabase tables or approved Setu reviews. Imported place records begin as suggested, unvisited, `accepted_into_setu=false` and no personally confirmed experience tags. Setu's future importer must validate, deduplicate, show conflicts and ask for approval.

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
