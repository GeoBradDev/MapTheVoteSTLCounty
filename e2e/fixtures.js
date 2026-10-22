// The county's ArcGIS layers (and the County and City wait time layers)
// answered from recorded fixtures, for the browser
// runs: the accessibility checks (a11y.e2e.js), the failure states
// (failures.e2e.js) and the Lighthouse run (lighthouse.js). Neither calls a live service, so an outage cannot fail a
// pull request.
import { readFileSync } from 'node:fs';
import election from '../src/config/election.js';
import { BASEMAP_STYLE_URL } from '../src/features/lookup/basemap.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../docs/raw/fixtures/${name}.json`, import.meta.url), 'utf8'));

const FIXTURES = {
  polls: fixture('polls'),
  absentee: fixture('absentee-sites'),
  geometry: fixture('precinct-geometry'),
  byId: fixture('precinct-by-id'),
  none: fixture('precinct-at-city'),
};

const countyFresh = fixture('county-waits-fresh');
const cityStale = fixture('city-waits-stale');

// The County's view keeps only the last 2 hours of reports, so it never
// served a stale report to record. This one is the fresh recording with every
// report moved back an hour past the max age: what the app would see if the
// view stopped dropping old reports, or the device clock ran ahead.
function staleCopy(body, timeField, shiftMs) {
  const stale = structuredClone(body);
  for (const { attributes } of stale.features) attributes[timeField] -= shiftMs;
  return stale;
}
const STALE_SHIFT_MS = (election.waitTimes.maxAgeMinutes + 60) * 60_000;

/**
 * The early voting line counts (#102, #104, #106) for each board, by state.
 * Recorded on 2026-10-22: the County at 9:00 a.m. Central (fresh) and while
 * closed (empty); the City at 9:26 a.m. (fresh) and 7:44 a.m. (stale: every
 * report from the day before). The fresh City recording has no hours field,
 * the stale one's reports are a day old, and the page lists no City sites yet
 * (#91), so no City count shows in any state; the City states prove the page
 * does not depend on them.
 */
const WAIT_FIXTURES = {
  county: {
    fresh: countyFresh,
    stale: staleCopy(countyFresh, election.waitTimes.county.timeField, STALE_SHIFT_MS),
    empty: fixture('county-waits-empty'),
  },
  city: {
    fresh: fixture('city-waits-fresh'),
    stale: cityStale,
    empty: { ...cityStale, features: [] },
  },
};

/**
 * Which wait fixture each board answers with, unless a call picks another.
 * @typedef {{ county?: 'fresh' | 'stale' | 'empty', city?: 'fresh' | 'stale' | 'empty' }} WaitStates
 */
export const DEFAULT_WAITS = Object.freeze({ county: 'fresh', city: 'stale' });

/** A time just after the wait fixtures were recorded: 9:05 a.m. Central, 2026-10-22. */
export const WAITS_RECORDED_AT = new Date(Date.UTC(2026, 9, 22, 14, 5));

const waitLayer = (source) => `${source.serviceRoot}/${source.layer}/`;

/** The one precinct the fixtures hold. */
export const CODE = 'CC007';

export { BASEMAP_STYLE_URL };

/**
 * A style with no sources or layers. MapLibre loads it and renders an empty
 * map with no further requests, so the map runs its real code with no tiles.
 */
export const BLANK_STYLE = JSON.stringify({ version: 8, sources: {}, layers: [] });

// Keeps only the requested fields, as the service does for an outFields list.
function pick(fields, wanted) {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => wanted.has(key)));
}

// Rounds every coordinate, as the service does for geometryPrecision.
function round(coordinates, digits) {
  return Array.isArray(coordinates)
    ? coordinates.map((c) => round(c, digits))
    : Number(coordinates.toFixed(digits));
}

function shape(body, params) {
  const outFields = params.get('outFields');
  const precision = params.get('geometryPrecision');
  if ((!outFields || outFields === '*') && !precision) return body;
  const wanted = new Set(outFields && outFields !== '*' ? outFields.split(',') : []);
  const shaped = structuredClone(body);
  for (const feature of shaped.features ?? []) {
    for (const key of ['attributes', 'properties']) {
      if (wanted.size && feature[key]) feature[key] = pick(feature[key], wanted);
    }
    if (precision && feature.geometry?.coordinates) {
      feature.geometry.coordinates = round(feature.geometry.coordinates, Number(precision));
    }
  }
  if (wanted.size && Array.isArray(shaped.fields)) {
    shaped.fields = shaped.fields.filter((f) => wanted.has(f.name));
  }
  return shaped;
}

/**
 * The JSON body for a request to the county's ArcGIS layers, or null for a
 * request that is not one (the caller blocks it). The fixture is shaped to the
 * request's `outFields` and `geometryPrecision`, so a browser run sees only
 * the fields the app asked for.
 * @param {string} href The request URL.
 * @param {string | null} [form] A POST request's form body: the point queries
 *   send their parameters there, not in the URL (#38).
 * @param {{ waits?: WaitStates }} [options] `waits` picks fresh, stale or
 *   empty line counts per board; the rest stay as in DEFAULT_WAITS.
 * @returns {string | null}
 */
export function fixtureBody(href, form = null, { waits = {} } = {}) {
  const url = new URL(href);
  const params = new URLSearchParams([...url.searchParams, ...new URLSearchParams(form ?? '')]);
  // A board left out, or given as undefined, keeps its default.
  const states = { ...DEFAULT_WAITS };
  for (const [key, state] of Object.entries(waits)) if (state !== undefined) states[key] = state;
  for (const key of ['county', 'city']) {
    if (!href.startsWith(waitLayer(election.waitTimes[key]))) continue;
    const body = WAIT_FIXTURES[key][states[key]];
    if (!body) throw new Error(`No ${key} wait fixture ${JSON.stringify(states[key])}`);
    return JSON.stringify(shape(body, params));
  }
  if (!href.startsWith(election.serviceRoot)) return null;
  let body;
  if (url.pathname.includes(election.layers.polls)) {
    body = params.get('where') === election.absenteeWhere ? FIXTURES.absentee : FIXTURES.polls;
  } else if (params.get('where') === `precinct='${CODE}'`) {
    body = params.get('f') === 'geojson' ? FIXTURES.geometry : FIXTURES.byId;
  } else {
    body = FIXTURES.none;
  }
  return JSON.stringify(shape(body, params));
}
