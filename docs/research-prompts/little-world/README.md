# Little World — Food Hideouts: four-prompt revision

**Revision:** `2026-11-24.1` · **Scope:** research prompt documents and authoring contracts only.

These are complete replacements for the four existing research prompts, with the original destination, transport, itinerary and review capabilities retained. Use the four documents in order; their shared policy is included in each, so it is not a fifth prompt. When pasting directly into a chat, replace `{{destination}}`, `{{origin}}`, `{{travel_date}}` and `{{travel_style}}` before sending. When saving a personal template as below, leave these placeholders intact so the existing Prompt Library fills them.

| Existing step | Replacement | Little World responsibility |
| --- | --- | --- |
| Discover | [01-discover.md](01-discover.md) | Own the broad cuisine search and detailed venue/menu/dietary/price investigation; create one sourced inventory |
| Transport | [02-transport.md](02-transport.md) | Reuse that inventory; verify stations/exits, walking routes, service/meal windows and return feasibility |
| Itinerary | [03-itinerary.md](03-itinerary.md) | Group restaurants with attractions/rest stops; consolidate one versioned inventory, sources, category and uncertainties without duplicate places |
| Live review | [04-live-review.md](04-live-review.md) | Keep the category in live choices; record only explicit personal observations in the existing separate review draft |

Every prompt includes Little World automatically for its destination. A later step opened without earlier research performs one bounded catch-up food search, records it and reuses it thereafter. Search status is recorded even when no suitable restaurant is found or research could not be completed. The cuisine list is broad search coverage, not a quota requiring a restaurant from every country.

## Boundaries and adoption

The actual existing catalog has **no separate food-only prompt**. Detailed food research belongs to Discover; geographical planning and final consolidation belong to Itinerary. Transport and Live review retain their original roles.

Per the instruction to leave the app untouched, `data/travel-prompt-templates.js`, application JavaScript/HTML/CSS, the bundled import schema, migrations and databases are unchanged. The app's current **Copy prompt** buttons still return the older catalog. Use these replacement documents for the enhanced research. Updating the shared in-app prompt text is a separate content release; do not claim it happened here. Previously copied prompts, old conversations, browser-specific overrides and arbitrary new chats are not automatically rewritten by these documents.

You can use the revised text through the **existing** personal-template feature without a code release:

1. Open Setu's Prompt Library and choose the corresponding step.
2. Select **Edit template**, replace its text with the matching document's complete prompt **below the horizontal divider**, and keep the four placeholders intact.
3. Select **Save my version**. Repeat for the other three steps.
4. Enter the destination/origin/date/style normally, then **Copy prompt**. Check that Little World appears and the placeholders are filled.

These personal versions are stored in that browser only. Repeat the adoption on another device if needed; **Restore latest Setu version** returns to the current shared catalog and removes that step's local revision. No personal template has been changed automatically by this documentation task.

No deployment, Drive reorganization, extra destination folder, live restaurant research, production import or fifth prompt is part of this revision. The Potohar visit motivates the research policy; these documents do not assert additional facts about that restaurant or infer a personal Hideout experience from its size.

## Storage and output stay compatible

Continue using `My Drive/Claude_Workspace/#Data_storage/Setu_research/<destination>/`, after verifying the real parent folder. Keep existing versions and user notes. Increment `<destination>_research_vYYYYMMDD_N.json`; transport and personal review drafts remain separate date-scoped supplemental records. Preserve existing IDs, hubs, source URLs, checked dates, unknown prices, potential tags and historical evidence. Upload readback must establish the file and parent before claiming success; otherwise return downloadable files and say they were not uploaded.

The place envelope stays `format=setu_research_handoff`, `schema_version=1.0.0`. A restaurant remains `place_type=restaurant`, which the current importer routes to **Food place**. **Little World — Food Hideouts** is its primary *food-discovery* category inside research metadata, not a new core table, an importer record kind, or a personally confirmed `Hideout` tag. A restaurant has one place record even when it also qualifies as a cheap lunch, regional attraction or rain stop.

The inspected v1 schema allows additional fields. It already stores English/Japanese names, location/maps, hours, access, source links and candidate tags. No new required base field or base version is needed for lossless storage. The following **optional authoring extensions** organize the extra evidence:

| Path | Purpose |
| --- | --- |
| `provenance.little_world_search` | Versioned search coverage, queries, checked date, result IDs, limits and explicit no-results/not-completed status |
| `places[].source_links[].id` | Stable local source references; retain the required URL and checked date |
| `places[].research_fields.little_world` | Category, cuisine, dishes, qualified meal prices, non-beef checks, seating/crowds/solo evidence, nearby IDs and per-tag evidence |

See [the schema field guide](schema-notes.md), [the optional authoring overlay](little-world-authoring.schema.json), [the synthetic v1 example](synthetic-handoff.example.json) and [future application requirements](future-setu-requirements.md). The overlay supplements the existing v1 validator; it is **not installed in Setu**. Passing the current importer validates the base envelope, not these new profile semantics. New fields remain in complete original evidence and backups; dedicated display, filtering and selective merge of the full Little World profile are future app work. Do not silently omit an unsupported field or translate it into an unrelated confirmed/core field.

## Research verification checklist

Run the following against research generated with the replacement prompts; a text-policy check alone does not prove the research was performed.

- [ ] A normal request for an area, without the words Little World or ethnic food, includes a Little World search and records coverage/results/limits. Repeat with two different destinations and once starting directly at a later prompt.
- [ ] The search spans the specified cuisines and uncommon regional food, side streets/residential areas/station approaches and independent venues; no popularity, tourist ranking or chain-only shortcut is used.
- [ ] Missing results say **no suitable restaurants found in the checked scope**. An incomplete search says **not completed**, not no results. Neither triggers invented candidates or an unannounced expansion to distant cities.
- [ ] Every candidate records both names (unknown/labelled transliteration where needed), cuisine/region, signature dishes, distinctiveness, individual prices, lunch terms, hours/holidays, size/seats, crowd and solo evidence, station/exit/walk, address/coordinates/maps, sources, checked date, verification and nearby attraction IDs. Unavailable values remain explicitly unknown.
- [ ] The cuisine list is coverage guidance; no requirement to fill every cuisine with an invented or distant venue. Claims about tradition, independence, rarity or community clientele have evidence and uncertainty, without inferring diners' nationality from appearance, names or language.
- [ ] A qualifying complete meal's payable total, including evidenced mandatory extras/tax, determines its band. Test ¥800/801/1,200/1,201/1,500/1,501 and an unknown total. A cheap snack does not classify a costly meal as Economy; a range crossing bands stays unclassified.
- [ ] Non-beef evidence is dish-specific and distinguishes meat from broth, stock, sauces and cooking fat. Chicken/halal/vegetarian-sounding names alone do not establish the ingredients; unresolved dishes are not presented as confirmed suitable.
- [ ] Supported supplementary tags carry evidence. Little World does not automatically confer Affordable, Independent Restaurant, Quiet, Small Restaurant or a personally confirmed Hideout.
- [ ] Each real branch appears once; shared names, menus, buildings or source URLs do not cause automatic merging. Existing personal reviews and research IDs remain intact.
- [ ] Transport reuses menus and investigates only access/timing gaps; itinerary links restaurants to real hubs/attractions; live review adds only explicit observations. Closed/unverified/inaccessible restaurants are not promoted as available choices.
- [ ] Validate the base v1 envelope and, separately, the optional overlay plus its semantic checks. Preview/export and an explicitly approved local draft/backup round-trip preserve the entire profile; no production write is needed.
- [ ] Original four-stage capabilities, date/return safeguards, Drive folder/version rules and the separate transport/review boundaries remain present. No app update, automatic import or globally automatic ChatGPT behavior is claimed.

## Review evidence

Baseline: `Celeritas7/Setu` main `c00db72` (merged #41), `data/travel-prompt-templates.js` catalog `2026-11-22.1`, the bundled v1 schema/model, and the existing Drive research-output contract were inspected. The Drive destination organization was confirmed read-only. An exact-name Drive search did not locate a standalone schema file at inspection time; compatibility is grounded in the existing bundled v1 contract, not a claim of finding a newer Drive schema. No existing Drive file was edited.

Validation completed: all **315 existing tests pass**. Standalone checks validated the authoring overlay and fictional example, old v1 documents without the extension, all six budget boundaries and incorrect bands, unknown/unchecked totals or extras, unconfirmed broth recommendations, explicit no-result/incomplete searches, calendar dates and reference integrity. The unchanged importer/model demonstrated exact preservation through preview, review export, approved local materialization and portable backup/restore; a repeated local save added zero duplicates. All four original prompt bodies and the existing placeholders were preserved around the inserted policy. Document links and whitespace were checked.

These checks do not prove the truth of a restaurant claim, that a future chat follows the policy, physical-device editor behavior or production cloud acceptance. No new runtime code or permanent app test was needed. Human acceptance of generated restaurant research remains the checklist above, not a fabricated completed search.
