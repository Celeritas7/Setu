# Prompt: "Places to live" in Setu

Paste everything below the line into a new Setu session.

---

Build a new Setu feature, **Places to live**: it compares places anywhere in the world where I might live, scores them on basics
that stay the same in every country, and shows them on Setu's map. Read `CLAUDE.md`, `README.md` and `ROADMAP.md` first and
follow their rules (bundle editing, `setu_touch` trigger, `added_by 'claude'`, soft delete, no invented numbers, no beef).

## 1. Learn the selection logic from Sigma (don't link to it, copy the method)

Sigma (`Celeritas7/Sigma`, `index.html`, section `// CALCULATIONS`, plus `WeightsPanel`, `BlindOverlay` and `CrossCheck`) is my
decision tool. Read that code and reuse its method in Setu, so a place's score means the same as a Sigma score:

- **Scores** are 0–10 per option (place) per parameter (basic need), each with raw evidence (`notes`, a `unit`).
- **Weights** are 0–10 per parameter. The weights UI defaults to **tiers**: Must-have 10, Important 8, Nice to have 5, Minor 2,
  Doesn't matter 0, with a "Fine" slider view. A weight of 0 drops the parameter.
- **Total** = Σ(score × weight) / Σ(weight) over the parameters that have a score, so a missing score is skipped instead of
  counted as 0 (`weightedTotal`). Rank by total; unscored places go last (`rankedOptions`).
- **Contribution** of each parameter = score × weight (`paramContribution`), drawn as a stacked bar per place.
- **Completeness** = filled cells / (places × parameters). Show it next to the ranking so a half-scored place doesn't look like
  a winner.
- **Robustness**: 100 deterministic runs with each weight moved ±2 (`Math.sin(i*31 + w*7)*2`, clamped 0–10). Report how often
  the leader stays first. **Sensitivity**: for each parameter, sweep its weight 0→10 in 0.5 steps and report the weight at which
  the leader changes (`perWeightSensitivity`).
- **What-if weights**: moving a weight re-ranks straight away and shows rank changes; "Save weights" keeps them.
- **Blind score mode**: score one parameter at a time across all places, in a shuffled order, without seeing totals.
- **Cross-check**: Sigma's `cross-check` edge function asks Claude to push back on one score against its evidence and the other
  places' scores (anchoring, halo, recency, motivated reasoning). Reuse the same prompt shape for Places to live. Check whether
  that function lives in the hub project and can be called from Setu; if not, propose how, and don't put an API key in the page.

Don't write to `sigma_*` tables. Setu keeps its own tables.

## 2. The basic needs (default parameters)

Each parameter has a key, a name, a default tier, whether **Setu can compute it**, and how it maps raw evidence to 0–10 (write the
mapping down so every place is scored the same way, e.g. "grocery shops within 800 m: 0 → 0, 1 → 4, 3 → 7, 6+ → 10").

| key | Basic need | Default tier | Source |
|---|---|---|---|
| `safety` | Safety, walking at night | Must-have | researched (source + date) |
| `cost` | Rent + food vs. income | Must-have | researched |
| `health` | Hospital / clinic time, care in a language I speak | Must-have | researched + OSM |
| `daily` | Groceries, pharmacy, station within ~10 min walk | Important | **computed**: `setu_spots` `local-grocery`, distance |
| `food` | Food I can eat (no beef), comfort food for sick days | Important | **computed**: `setu_food_notes`, `setu_menu_items.has_beef`, `sick_effect` |
| `transit` | Getting around, commute time | Important | **computed** where on `setu_routes` 'commute'; else researched |
| `quiet` | Air, water, noise, sleep | Important | researched |
| `sit` | Places to sit and stay (dry and rainy) | Nice to have | **computed**: `sit-long`, `rain-ok` spots |
| `climate` | Heat, cold, rain I can live with | Nice to have | hub climate data if any, else researched |
| `disaster` | Flood, earthquake, typhoon risk | Important | researched (hazard maps) |
| `people` | Friends or community nearby | Nice to have | **computed**: Contlas `contacts` within N km |
| `familiar` | How well I know it already | Minor | **computed**: `akatsuki_visit_points` stays within radius |
| `legal` | Visa / residency, how hard to keep | Must-have abroad | researched |
| `language` | Daily life without the local language | Nice to have | researched |

Computed scores are recalculated on load and labelled "from Setu data"; researched and manual scores carry `source_url` and
`seen` date. A computed score is only as good as the data: when an area has never had an area search, show it as "not searched"
(no score) rather than a low score, and offer the hub's **Search this area**.

## 3. Data (propose the migration, then apply it)

- `setu_live_places`: a candidate place. `hub_id` (reuse a hub when the place is one, e.g. Urawa) or its own `name`, `country`,
  `geo_query`, `lat/lng`, `geo_source`, `radius_m`, `notes`, `status` 'considering' | 'shortlist' | 'ruled_out', `added_by`.
- `setu_live_params`: per-user parameter list with `key`, `name`, `weight`, `unit`, `input_type`, `computed` bool, `scale` jsonb
  (the raw → 0–10 mapping), `display_order`. Seed the table above.
- `setu_live_scores`: `place_id`, `param_key`, `value` 0–10, `raw` (evidence text/number), `source` 'computed' | 'researched' |
  'manual', `source_url`, `seen`. Manual beats researched beats computed when more than one exists; keep all of them.
- Same conventions as other `setu_*` tables: `user_id` via `setu_touch`, `rev`, `deleted_at`, RLS per user.

## 4. Screens (in the bundle, Setu's style)

1. **☰ → Places to live**: ranked list with total, completeness, a stacked contribution bar, rank change in what-if mode,
   robustness ("leader holds in 87 of 100 weight shakes") and the parameter the result is most sensitive to.
2. **Weights** panel: tiers by default, fine sliders optional, Save.
3. **Place page**: every parameter with score, evidence, source and date; edit a score; Cross-check button; for computed ones,
   "see the 7 grocery shops" opening the hub.
4. **Map**: a "Places to live" Show chip and layer: pins coloured by total, tap for the score card; jump chips for each place.
5. **Compare**: two or three places side by side, highlighting where each one wins.
6. **Blind score mode** for researched parameters.

## 5. Research rules (when I say "score <place> for living")

Same as area searches in `CLAUDE.md`: never invent numbers, give every researched score a source and a seen date, say when the
source is an advert or a ranking site, and leave the score empty when nothing reliable is found. Write the raw evidence first,
then convert it with the parameter's `scale`. Private notes (health, feelings) go to `team_requests`, not into scores.

## 6. How to ship

- Add a **Phase E · Places to live** to `ROADMAP.md` with lines E1 (tables + seed parameters), E2 (scoring engine copied from
  Sigma + computed scores), E3 (list, weights, place page), E4 (map layer + compare), E5 (cross-check + blind mode), E6 (first
  research run). Ship each as its own PR.
- Before writing code, show me the parameter table with your proposed `scale` for each one and ask me to confirm the tiers.
- First places to compare: my current hubs (Ageo, Omiya, Saitama-Shintoshin, Kita-Urawa, Urawa, Minami-Urawa). Ask me which
  places abroad to add.
- Check that the bundle round-trips before writing it, and test the scoring functions against Sigma's on the same numbers.
