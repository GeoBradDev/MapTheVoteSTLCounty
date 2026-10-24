// The county's ArcGIS layers, the City Board's election layers (#89), and the
// County and City wait time layers, answered from recorded fixtures, for the
// browser runs: the accessibility checks (a11y.e2e.js), the failure states
// (failures.e2e.js) and the Lighthouse run (lighthouse.js). None calls a live
// service, so an outage cannot fail a pull request.
import { readFileSync } from 'node:fs';
import election from '../src/config/election.js';
import { asElectionDay, ELECTION_DAY_SHIFT_MS } from '../src/data/waitTimes.fixtures.js';
import { BASEMAP_DARK_STYLE_URL, BASEMAP_STYLE_URL } from '../src/features/lookup/basemap.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../docs/raw/fixtures/${name}.json`, import.meta.url), 'utf8'));

const FIXTURES = {
  polls: fixture('polls'),
  absentee: fixture('absentee-sites'),
  // The room inside each polling place (#100).
  rooms: fixture('poll-rooms'),
  geometry: fixture('precinct-geometry'),
  byId: fixture('precinct-by-id'),
  none: fixture('precinct-at-city'),
};

// The City precinct the fixtures hold (#89), and its layers.
const CITY_FIXTURES = {
  polls: fixture('city-polls'),
  earlyVoting: fixture('city-early-voting-sites'),
  byId: fixture('city-precinct-by-id'),
  geometry: fixture('city-precinct-geometry'),
  districts: fixture('city-districts-at-point'),
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

// Election Day (#107): no Election Day report has been published. The County's
// is the fresh recording moved to 9:00 a.m. on Election Day and renamed from
// each site's absentee username to its Election Day one (asElectionDay in
// src/data/waitTimes.fixtures.js). Most City reports in its fresh recording are
// from the evening before, so moved by the same span they would be a day old:
// the City's keeps each site's recorded count and reports it at 8:50 a.m. on
// Election Day instead, so City counts show too.
const CITY_DAY_REPORT = Date.UTC(2026, 10, 3, 14, 50);
function electionDayCopy(body, jurisdiction) {
  const attributes = body.features.map((f) => f.attributes);
  const { timeField, valueField } = election.waitTimes[jurisdiction];
  const rows =
    jurisdiction === 'county'
      ? asElectionDay(attributes, jurisdiction, FIXTURES.polls.features)
      : attributes.map((row) =>
          row[valueField] === null ? row : { ...row, [timeField]: CITY_DAY_REPORT },
        );
  return { ...body, features: rows.map((row) => ({ attributes: row })) };
}

/**
 * The early voting line counts (#102, #104, #106) for each board, by state.
 * Recorded on 2026-10-22: the County at 9:00 a.m. Central (fresh) and while
 * closed (empty); the City at 9:26 a.m. (fresh) and 7:44 a.m. (stale: every
 * report from the day before). The fresh City recording has no hours field and
 * the stale one's reports are a day old, so no City count shows in any state,
 * although the page lists the City's sites (#91); the City states prove the
 * page does not depend on them.
 */
const WAIT_FIXTURES = {
  county: {
    fresh: countyFresh,
    stale: staleCopy(countyFresh, election.waitTimes.county.timeField, STALE_SHIFT_MS),
    empty: fixture('county-waits-empty'),
    electionDay: electionDayCopy(countyFresh, 'county'),
    // Today's view on Election Day: the fresh early voting reports, moved to
    // Election Day morning but still named by absentee username, as the view
    // filtered to `abs%` would serve them. They match no polling place.
    absenteeOnElectionDay: staleCopy(
      countyFresh,
      election.waitTimes.county.timeField,
      -ELECTION_DAY_SHIFT_MS,
    ),
  },
  city: {
    fresh: fixture('city-waits-fresh'),
    stale: cityStale,
    empty: { ...cityStale, features: [] },
    electionDay: electionDayCopy(fixture('city-waits-fresh'), 'city'),
  },
};

/**
 * Which wait fixture each board answers with, unless a call picks another.
 * `electionDay` (#107) is the fresh recording moved to Election Day morning.
 * `absenteeOnElectionDay` is the County's early voting reports moved to then, unrenamed.
 * @typedef {{ county?: 'fresh' | 'stale' | 'empty' | 'electionDay' | 'absenteeOnElectionDay',
 *   city?: 'fresh' | 'stale' | 'empty' | 'electionDay' }} WaitStates
 */
export const DEFAULT_WAITS = Object.freeze({ county: 'fresh', city: 'stale' });

/** A time just after the wait fixtures were recorded: 9:05 a.m. Central, 2026-10-22. */
export const WAITS_RECORDED_AT = new Date(Date.UTC(2026, 9, 22, 14, 5));

/** 9:05 a.m. Central on Election Day, just after the Election Day wait fixtures (#107). */
export const ELECTION_DAY_AT = new Date(Date.UTC(2026, 10, 3, 15, 5));

/**
 * 8 p.m. Central on Monday, November 2, 2026: early voting has closed and
 * Election Day has not begun, so the results summary has no early voting part.
 */
export const AFTER_EARLY_VOTING_AT = new Date(Date.UTC(2026, 10, 3, 2, 0));

/** 7:30 p.m. Central on 2026-10-22: every early voting site has closed for the night (#184). */
export const EARLY_VOTING_CLOSED_AT = new Date(Date.UTC(2026, 9, 23, 0, 30));

/** 5 a.m. Central on Election Day: the polls have not opened yet (#184). */
export const BEFORE_POLLS_AT = new Date(Date.UTC(2026, 10, 3, 11, 0));

/** 7:30 p.m. Central on Election Day: the polls have closed (#184). */
export const AFTER_POLLS_AT = new Date(Date.UTC(2026, 10, 4, 1, 30));

/** No line counts from either board, as while every site is closed. */
export const NO_WAITS = Object.freeze({ county: 'empty', city: 'empty' });

/** The wait fixtures for Election Day: both boards' Election Day states. */
export const ELECTION_DAY_WAITS = Object.freeze({ county: 'electionDay', city: 'electionDay' });

const waitLayer = (source) => `${source.serviceRoot}/${source.layer}/`;

/** The one precinct the fixtures hold. */
export const CODE = 'CC007';

/** The one City precinct the fixtures hold (#89). */
export const CITY_CODE = 'W01P12';

const cityBlock = election.jurisdictions.city;

/**
 * Whether a request is for one of the City Board's election layers (its
 * precincts, districts or voting locations), not its wait time query, which
 * asks the voting locations layer too, with the early voting sites' own
 * filter: the wait query asks for rows (f=json), the sites query (#91) for
 * GeoJSON.
 * @param {string} href
 * @param {URLSearchParams} params The URL's and a POST body's parameters.
 */
export function isCityElectionLayer(href, params) {
  if (!href.startsWith(`${cityBlock.serviceRoot}/`)) return false;
  const wait = href.startsWith(waitLayer(election.waitTimes.city));
  // The early voting or, on Election Day (#107), the Election Day filter.
  const { where, electionDay } = election.waitTimes.city;
  const waitQuery =
    [where, electionDay.where].includes(params.get('where')) && params.get('f') !== 'geojson';
  return !(wait && waitQuery);
}

// The City layers' answer: the Election Day or early voting locations, the
// districts at a point, or CITY_CODE's precinct and outline; nothing for any
// other precinct or layer.
function cityBody(url, params) {
  if (url.pathname.includes(cityBlock.layers.sites)) {
    const where = params.get('where');
    if (where === cityBlock.pollsWhere) return CITY_FIXTURES.polls;
    return where === cityBlock.earlyVotingWhere ? CITY_FIXTURES.earlyVoting : { features: [] };
  }
  // The districts at a point (#90); the same layer's City outline query
  // (boundaryWhere) gets nothing.
  if (url.pathname.includes(cityBlock.layers.districts) && !params.get('where')) {
    return CITY_FIXTURES.districts;
  }
  const id = CITY_FIXTURES.byId.features[0].attributes[cityBlock.precinctField];
  const ours = params.get('where') === `${cityBlock.precinctField}='${id}'`;
  if (!url.pathname.includes(cityBlock.layers.precincts) || !ours) return { features: [] };
  return params.get('f') === 'geojson' ? CITY_FIXTURES.geometry : CITY_FIXTURES.byId;
}

export { BASEMAP_DARK_STYLE_URL, BASEMAP_STYLE_URL };

/** Whether `href` is one of the basemap's styles, light or dark (#77). */
export function isBasemapStyle(href) {
  return href === BASEMAP_STYLE_URL || href === BASEMAP_DARK_STYLE_URL;
}

/**
 * A style with no sources or layers. MapLibre loads it and renders an empty
 * map with no further requests, so the map runs its real code with no tiles.
 */
export const BLANK_STYLE = JSON.stringify({ version: 8, sources: {}, layers: [] });

/**
 * Gray background only, a light one for the light style and a dark one for
 * the dark style (#77): still no tiles, but the canvas shows which style it
 * drew. The channel value of each, the same in red, green and blue.
 */
export const TINT = { light: 200, dark: 40 };
export function tintedStyle(href) {
  const v = href === BASEMAP_DARK_STYLE_URL ? TINT.dark : TINT.light;
  return JSON.stringify({
    version: 8,
    sources: {},
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': `rgb(${v},${v},${v})` } },
    ],
  });
}

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
 * The JSON body for a request to the county's or the City Board's ArcGIS
 * layers, or null for a
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
  if (isCityElectionLayer(href, params))
    return JSON.stringify(shape(cityBody(url, params), params));
  for (const key of ['county', 'city']) {
    const source = election.waitTimes[key];
    // The County's Election Day layer (#107) may be another view.
    const day = source.electionDay?.layer ? { ...source, ...source.electionDay } : source;
    if (!href.startsWith(waitLayer(source)) && !href.startsWith(waitLayer(day))) continue;
    const body = WAIT_FIXTURES[key][states[key]];
    if (!body) throw new Error(`No ${key} wait fixture ${JSON.stringify(states[key])}`);
    return JSON.stringify(shape(body, params));
  }
  if (!href.startsWith(election.serviceRoot)) return null;
  let body;
  if (url.pathname.includes(election.layers.pollRooms)) {
    body = FIXTURES.rooms;
  } else if (url.pathname.includes(election.layers.polls)) {
    body = params.get('where') === election.absenteeWhere ? FIXTURES.absentee : FIXTURES.polls;
  } else if (params.get('where') === `precinct='${CODE}'`) {
    body = params.get('f') === 'geojson' ? FIXTURES.geometry : FIXTURES.byId;
  } else {
    body = FIXTURES.none;
  }
  return JSON.stringify(shape(body, params));
}
