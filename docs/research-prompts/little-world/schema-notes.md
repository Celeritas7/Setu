# Optional Little World authoring extensions

The [authoring overlay](little-world-authoring.schema.json) is JSON Schema draft 2020-12. Validate a document against **both** the existing v1 handoff schema and this overlay. It does not resolve or replace the base schema, and Setu does not load it. It deliberately leaves additional fields open so future research is not discarded.

No breaking or required base-schema extension is necessary: the current v1 objects accept additional fields. The profile is optional for ordinary places; if a Little World profile is supplied, its listed keys are required so unavailable facts are recorded as unknown rather than silently absent. An old v1 document without either extension remains valid.

## Existing fields to reuse

| Existing path | Use |
| --- | --- |
| `research_id`, `hub_id`, `aliases`, `place_type` | Stable branch identity, real geographic hub, alternate names; keep restaurant as the existing food kind |
| `name_ja`, `name_en` | Sourced names; annotate official versus transliteration versus unknown in the profile |
| `location.address_ja`, `coordinates`, `maps_url` | Published address, sourced coordinates or null, Maps URL; no guessed pin |
| `research_fields.hours` | Regular opening, holidays, exceptions, lunch/last-order windows with uncertainty; future-day availability remains separate |
| `research_fields.access` | Station, exit, walking distance/time and source/estimate confidence; optional claim-shaped keys are described by the overlay |
| `research_fields.cost` | Original text and scoped published `sample_prices`; meal estimates stay estimates and admission remains separate |
| `source_links` | Required URL/checked date; optional local `id` lets all profile claims reference the existing source list |
| `tags.practical_candidates` | Multiple supported research category/tag candidates; no promotion into personal confirmations |

An unknown dish price **cannot** be put in `cost.sample_prices[].yen`, because the current importer requires a nonnegative integer there. Keep that dish's null price in the new profile. Do not force it to zero or make the whole import fail. The synthetic example demonstrates known set/drink components alongside an unknown soup price.

## Optional search ledger

`provenance.little_world_search` contains `version=1`, `scope`, `checked_at`, search `queries`, `candidate_ids`, `qualifying_ids`, `limits` and `unresolved`.

- `searched_with_results`: a completed search produced at least one qualifying ID.
- `searched_no_suitable_results`: the checked scope produced no qualifying option; useful unresolved leads can still appear in `candidate_ids` and the inventory.
- `not_completed`: research could not be completed. Record inaccessible sources/coverage gaps; do not claim absence of restaurants.

The ledger prevents every prompt from repeating the same cuisine/menu research and preserves honest negative or partial results. It does not prove a real search happened: queries and source evidence must be reviewed.

## Optional place profile

`research_fields.little_world` holds:

| Field(s) | Shape and meaning |
| --- | --- |
| `version`, `primary_category`, `researched_at`, `name_en_status` | `1`; exact Little World category; checked date; official/transliteration/unknown |
| `cuisines` | Country and region claims; multiple cuisines permitted, unknown region explicit |
| `special_features`, `lunch_offers` | Attributable claims about distinctive dishes/traditions and offer terms |
| `dishes` | Local dish ID; English/Japanese name claims; signature/description; scoped individual price; component-level non-beef evidence; recommendation flag |
| `meal_budget` | Chosen complete meal/dish ID; payable JPY total; verified-quote and tax/extras-complete flags; band or null; source/date/conditions; exceptional justification |
| `venue_size`, `seating_capacity`, `crowd_expectation`, `solo_suitability` | Separate claims; a small restaurant does not imply quietness or a known seat count |
| `independence`, `community_context`, `rarity` | Sourced descriptions; no assumption about ownership, diners' nationality or nationwide rarity |
| `nearby_attraction_ids` | References to the same inventory, not another duplicate place list |
| `tag_evidence` | One support claim for each applied supplementary tag |
| `unresolved` | Missing/conflicting facts and practical questions for later checks |

Claims use `value`, `verification` (`official`, `reported`, `estimated`, `unknown`), `source_ids`, `checked_at` and `notes`. Unknown claims have a null value. These labels describe research evidence, not the user's personal visit status. A source's checked date is not proof that a meal will be available on a future date.

A dish price preserves amount or null, scope, tax, mandatory extras, offer restrictions and evidence. `non_beef` separates meat, broth/stock, sauces and cooking fat, plus `supported` / `unconfirmed` / `contains_beef` and unresolved staff questions. A recommended non-beef dish must be `supported`; the evidence still requires human review.

The meal band uses the complete payable quote, not the cheapest component. Unknown/unverified totals and ranges spanning bands use `band=null`. Economy is ≤¥800; Affordable is ¥801–1,200; Moderate is ¥1,201–1,500; Exceptional is ≥¥1,501 with an attributable distinctive-cultural-experience justification. The supplementary **Affordable** tag includes Economy meals too. A band is not a current availability guarantee or an actual-spend field.

## Semantic checks beyond the overlay

The schema checks structure, dates, nonnegative prices, basic band thresholds, supported-dish recommendations and Exceptional justification. It cannot establish real-world truth. Review these separately:

1. Local source IDs are unique per place, and every claim's reference resolves to the retained URL/date record. Dish IDs are unique, and the meal basis resolves to a complete meal.
2. Search IDs and nearby attraction IDs resolve to the inventory; qualifying IDs are a subset of candidate IDs and have an evidenced cuisine/distinctiveness basis. A no-results ledger may retain unqualified leads, but no qualifying IDs.
3. The payable total includes all mandatory charges/tax and offer eligibility. A positive `price_verified` flag needs checked evidence; arithmetic and scope cannot be inferred from that flag alone. Unknown extras invalidate classification.
4. Non-beef support covers the proposed dish's relevant components. Unresolved stock/sauce/fat questions prevent a confirmed dietary recommendation. No inference from halal, a chicken dish title or diners' identity.
5. Every applied supplementary practical tag has a matching support claim; Affordable and Non-beef Options meet their explicit conditions. Do not add a personally confirmed Hideout experience.
6. Seat count and distance/time are sensible numbers when known; unknown/estimated values are labelled. Branch identity, source credibility, field conflicts and evidence freshness remain human review duties.
7. Full profile, search ledger and source mappings survive export/local-backup round-trip exactly. Dedicated Little World validation, filtering/display and selective merge are future application requirements.

[synthetic-handoff.example.json](synthetic-handoff.example.json) is explicitly fictional, uses only `example.org` sources and demonstrates the format. It is not restaurant research, a real destination or a proposed production import. Never upload it to production just to test the document.
