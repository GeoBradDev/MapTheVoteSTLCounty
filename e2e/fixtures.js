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
  // The early voting line counts (#102, #104), recorded at 9:00 a.m. Central
  // on 2026-10-22: the County's fresh reports and the City's rows from the
  // day before, which the app never shows.
  countyWaits: fixture('county-waits-fresh'),
  cityWaits: fixture('city-waits-stale'),
};

/** When the wait fixtures were recorded: 9:05 a.m. Central, 2026-10-22. */
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
 * @returns {string | null}
 */
export function fixtureBody(href, form = null) {
  const url = new URL(href);
  const params = new URLSearchParams([...url.searchParams, ...new URLSearchParams(form ?? '')]);
  const { county, city } = election.waitTimes;
  if (href.startsWith(waitLayer(county)))
    return JSON.stringify(shape(FIXTURES.countyWaits, params));
  if (href.startsWith(waitLayer(city))) return JSON.stringify(shape(FIXTURES.cityWaits, params));
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
