import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const fixture = JSON.parse(readFileSync(new URL('../data/trip-research/ogose-phase0.json', import.meta.url), 'utf8'));
const placeIds = fixture.candidates.map(p => p.id);

test('Ogose fixture is illustrative, undated and has no personal visit claims', () => {
  assert.equal(fixture.schema_version, 1);
  assert.equal(fixture.fixture_kind, 'representative_not_live');
  assert.match(fixture.trip_context.origin, /南浦和/);
  assert.equal(fixture.trip_context.selected_date, null);
  assert.equal(fixture.trip_context.former_candidate_date_confirmed, false);
  assert.equal(fixture.trip_context.return_plan.status, 'unverified');
  assert.equal(fixture.trip_context.return_plan.safe_leave_by, null);
  for (const candidate of fixture.candidates) {
    assert.equal(candidate.observation.visit_status, 'suggested');
    assert.equal(candidate.observation.reviewed, false);
    assert.equal(candidate.observation.entered, 'unknown');
    assert.notEqual(candidate.experience.status, 'personally_confirmed');
  }
});

test('Ogose fixture has uniquely identified, sourced and hubbed candidates', () => {
  assert.ok(placeIds.length >= 5);
  assert.equal(new Set(placeIds).size, placeIds.length);
  for (const candidate of fixture.candidates) {
    assert.ok(candidate.name_ja && /[^\\x00-\\x7F]/.test(candidate.name_ja));
    assert.ok(candidate.hub && candidate.address_ja);
    assert.match(candidate.source.url, /^https:\/\//);
    assert.match(candidate.source.checked_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isInteger(candidate.visit_duration_min_est) && candidate.visit_duration_min_est > 0);
    assert.ok(Array.isArray(candidate.practical_tags));
  }
});

test('unknown prices are not free and approximate budgets are not published quotes', () => {
  const known = new Set(['published', 'published_conditional', 'estimated', 'unknown']);
  for (const p of fixture.candidates) {
    assert.ok(known.has(p.cost_evidence), p.id);
    if (p.cost_evidence === 'unknown') assert.equal(p.cost_yen, null, p.id);
    else assert.ok(Number.isInteger(p.cost_yen) && p.cost_yen >= 0, p.id);
  }
  assert.equal(fixture.candidates.find(p => p.id === 'ogose-satonoe').cost_yen, null);
  assert.equal(fixture.candidates.find(p => p.id === 'ogose-yamabuki').cost_yen, 0);
  assert.equal(fixture.candidates.find(p => p.id === 'ogose-beisia').cost_evidence, 'estimated');
});

test('library seating and personal experience remain distinct', () => {
  const lib = fixture.candidates.find(p => p.id === 'ogose-library');
  assert.equal(lib.independent_study_permission, 'unknown');
  assert.equal(lib.laptop_permission, 'unknown');
  assert.equal(lib.wifi, 'unknown');
  assert.equal(lib.experience.status, 'potential');
  const welcafe = fixture.candidates.find(p => p.id === 'ogose-welcafe');
  assert.equal(welcafe.cost_evidence, 'published_conditional');
  assert.equal(welcafe.study_permission, 'unknown');
});

test('remote route and commuter pass require verification', () => {
  const falls = fixture.candidates.find(p => p.id === 'ogose-kuroyama');
  assert.equal(falls.return_status, 'unverified');
  assert.equal(falls.walk_from_ogose_station_min_est, null);
  assert.match(falls.transport, /unverified/);
  const pass = fixture.trip_context.commuter_pass;
  assert.equal(pass.registered_route_confirmed, false);
  assert.equal(pass.validity_on_trip_confirmed, false);
  assert.equal(pass.rail_coverage_yen, null);
  assert.equal(pass.tobu_coverage, false);
  assert.equal(pass.bus_coverage, false);
});

test('fixture documents core safety, review and ranking cases', () => {
  const scenarioIds = fixture.scenarios.map(s => s.id);
  assert.equal(new Set(scenarioIds).size, scenarioIds.length);
  for (const id of ['undated-remote','library-not-study-approved','passed-without-entry','estimate-not-free','rainy-detour','unverified-pass']) {
    assert.ok(scenarioIds.includes(id), id);
  }
});
