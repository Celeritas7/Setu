# Future Setu support for Little World — Food Hideouts

**Planning for application capabilities; no database migration.** Shared prompt-text adoption is prepared separately in catalog `2026-11-25.1`. The data/UI capabilities below remain future work and do not unblock or activate R4 cloud persistence.

## Existing compatibility

- Keep the v1 handoff envelope. Its open objects retain optional extension data; the current importer preserves complete original research, approved local draft source evidence and backups.
- Route restaurants as ordinary `place_type=restaurant` → Food place → existing food-record workflow. Little World is a primary food-discovery classification, with multiple supplementary tags, rather than a new core place kind.
- Existing base fields carry names, address/maps, source URLs/checked dates, hours/access, practical candidates and unknown versus published price evidence. Keep admission separate from meal prices and estimates. Current cloud publication deliberately leaves `spend_yen` null; a source menu price is not the user's actual spending.
- Unknown extension fields are not fully schema-checked or exposed as dedicated merge groups. A complete-original-evidence view/export is preservation, not a claim that cuisine filters or dish-level dietary checks already work.

## Candidate work to scope separately

| Capability | Additional data/behavior | Acceptance requirement |
| --- | --- | --- |
| Shared prompt content — prepared | Catalog `2026-11-25.1` adopts the exact four document bodies, preserving IDs and placeholders; no UI logic changes | After publication, four buttons generate the new text; existing older-override warnings remain; no fifth step or runtime redesign |
| Optional extension validation | Validate `little_world_search`, source-reference integrity, profile evidence, price bands and related IDs | Retain unknown future fields; report semantic errors without discarding the original document |
| Evidence presentation | Show country/region, signature dishes, why distinctive, English-name/transliteration status, venue size, seats, crowds/solo suitability and checked dates | Clearly separate official, third-party, estimated and unknown claims; show disagreements/history |
| Dietary review | Dish-specific beef meat/broth/stock/sauce/fat evidence, open questions and later staff/user observations | No blanket non-beef guarantee or dietary certification inferred from cuisine, halal status or a dish name |
| Scoped meal pricing | Item/set, size/portion, currency, tax and mandatory extras, weekday/lunch/holiday eligibility and evidence freshness | Classify a complete payable meal; unknown stays unclassified; a snack price never stands in for lunch |
| Categories and filters | Little World primary food-discovery category and supported supplementary practical tags; multi-category membership without duplicate places | `Hideout` in the category title never becomes a personal experience confirmation; Affordable requires the policy's evidenced meal threshold |
| Geographical planning | Station/exit, path distance/time and confidence; nearby attraction IDs and access constraints | No invented coordinates, straight-line walk claims, or unverified late-return guarantee |
| Selective merges | A dedicated optional Little World evidence group, with field/source history and per-change preview | Existing names, meal evidence, personal reviews, visit state, pins and confirmed tags survive; decline is lossless |
| Cross-version/branch identity | Stable research IDs, explicit same-branch review, aliases and address/source comparison | One restaurant can serve multiple itinerary roles; chains/branches and shared source pages do not auto-collapse |
| Search coverage | Store checked scope, queries, completed/no-result/partial status and coverage limitations | Absence of a match or inaccessible sources does not prove absence of restaurants |
| Personal review draft | Actual ordered dish/price, broth questions answered, solo/seating/crowd observations and date/space scope | Only the user's explicit observations become review proposals; original research and previous personal reviews remain intact |

No new application fields are mandatory simply to retain the research now. Decide whether future normalized fields/indices are warranted only after reviewing real research and query needs. Any migration, app release or production import needs its own review and the user's existing separate approval; keep the current Drive organization and existing R4 gate intact.

## Release checks for a future implementation

1. Import old v1 files without a Little World profile and new v1 files with one; preserve both exactly in original evidence.
2. Exercise unknown and conflicting prices, crossed budget bands, compulsory extras, exceptional-meal justification, unavailable coordinates and unresolved beef broth.
3. Compare/merge against a food place with a personal review, actual spend, visit state and confirmed experience tags; prove those fields cannot be overwritten by research metadata.
4. Import a repeated file and a changed version, including restaurant aliases and two branches; check stable identities and explicit conflict review.
5. Verify full preservation through review export, browser-local approved drafts and portable backup/restore. Test cloud behavior only after R4's separate installation/activation approvals.
6. Verify any filter/display labels against actual evidence, then perform desktop and mobile acceptance; do not equate model tests with physical-device checks.
