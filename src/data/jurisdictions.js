// The jurisdictions the results page serves (#86), each a config block from
// src/config/election.js plus a data adapter. One route, /p/:code, serves both:
// the code's shape picks the jurisdiction (owner decision, 2026-10-22,
// docs/data.md).
import { jurisdictions } from '../config/election.js';
import referrals from '../config/referrals.js';
import * as arcgis from './arcgis.js';
import { CITY_PRECINCT_CODE } from './cityPrecinctCode.js';

export {
  CITY_PRECINCT_CODE,
  cityPrecinctCode,
  cityPrecinctId,
  cityWardPrecinct,
} from './cityPrecinctCode.js';

/**
 * @typedef {object} Jurisdiction
 * @property {'county' | 'city'} id
 * @property {import('../config/election.js').JurisdictionConfig} config
 * @property {RegExp} code Its precinct code shape.
 * @property {string} officialLookupUrl The board's own lookup, the fallback
 *   when ours fails.
 * @property {string} boardSiteUrl The board's website.
 * @property {(code: string) => Promise<object>} getPrecinct The precinct's
 *   attributes; rejects with NotFound when no precinct has the code.
 * @property {() => Promise<object>} getPolls Every polling place, as GeoJSON.
 * @property {() => Promise<object>} getEarlyVotingSites The early voting sites, as GeoJSON.
 * @property {(code: string) => Promise<object>} getOutline The precinct's outline.
 * @property {() => Promise<object>} [getPollRooms] The room inside each polling
 *   place and early voting site, as GeoJSON with no geometry (#100). The
 *   County's only: the City's sites carry their own entrance notes (#89).
 */

/**
 * @type {Jurisdiction} The County: today's data code in ./arcgis.js. Each
 * function calls through to it when called, not when this module loads, so a
 * test that replaces part of ./arcgis.js (the cards' tests do) still works.
 */
export const county = Object.freeze({
  id: 'county',
  config: jurisdictions.county,
  get code() {
    return arcgis.PRECINCT_CODE;
  },
  officialLookupUrl: jurisdictions.county.officialLookupUrl,
  boardSiteUrl: jurisdictions.county.boardSiteUrl,
  getPrecinct: (code) => arcgis.getPrecinctById(code),
  getPolls: () => arcgis.getPolls(),
  getEarlyVotingSites: () => arcgis.getAbsenteeSites(),
  getOutline: (code) => arcgis.getPrecinctGeometry(code),
  getPollRooms: () => arcgis.getPollRooms(),
});

let cityClient;

/**
 * The City chunk (src/cityChunk.js): the City's data code (./cityArcgis.js,
 * #87), the City-only results UI and src/config/cityResults.js (#91), loaded
 * on first use so they stay out of the first load (#147). A failed load is not
 * kept, so the next call tries again.
 * @returns {Promise<typeof import('../cityChunk.js')>}
 */
export function loadCityClient() {
  cityClient ??= import('../cityChunk.js').then(
    (chunk) => {
      loadedCity = chunk;
      return chunk;
    },
    (error) => {
      cityClient = undefined;
      throw error;
    },
  );
  return cityClient;
}

let loadedCity = null;

/**
 * The City chunk once it has loaded, else null, so a City component can render
 * at once instead of suspending for a chunk already here (#81: a summary at
 * the top of the page that suspended would push the page down).
 * @returns {typeof import('../cityChunk.js') | null}
 */
export function loadedCityClient() {
  return loadedCity;
}

/**
 * @type {Jurisdiction} The City (#89): its data code in ./cityArcgis.js, from
 * the City chunk, loaded on first use.
 */
export const city = Object.freeze({
  id: 'city',
  config: jurisdictions.city,
  code: CITY_PRECINCT_CODE,
  // Stable official pages, kept in referrals.js (see the City block).
  officialLookupUrl: referrals.stlCityLookup.url,
  boardSiteUrl: referrals.stlCityBoard.url,
  getPrecinct: (code) => loadCityClient().then((c) => c.getCityPrecinctById(code)),
  getPolls: () => loadCityClient().then((c) => c.getCityPolls()),
  getEarlyVotingSites: () => loadCityClient().then((c) => c.getCityEarlyVotingSites()),
  getOutline: (code) => loadCityClient().then((c) => c.getCityPrecinctGeometry(code)),
});

/**
 * The jurisdiction a precinct code belongs to, by its shape, or null for
 * anything that is not a precinct code.
 * @param {unknown} code
 * @returns {Jurisdiction | null}
 */
export function jurisdictionFor(code) {
  if (typeof code !== 'string') return null;
  return [county, city].find((j) => j.code.test(code)) ?? null;
}

/**
 * Whether a value is a County or City precinct code. The one test for "is this
 * a precinct code" in a URL or a share link. Analytics (#69) reports every
 * precinct page, /p/ and one path segment, as /p/:precinct, code or not
 * (src/analytics/ga.js).
 * @param {unknown} code
 */
export function isPrecinctCode(code) {
  return jurisdictionFor(code) !== null;
}

/**
 * The jurisdiction when a path is a precinct's page, like /p/CC007 or
 * /p/W01P12, for the app's error screen (#89, #93); else undefined.
 * @param {string} path
 * @returns {Jurisdiction | undefined}
 */
export function jurisdictionOnPath(path) {
  // As the /p/:precinct route matches it: any case, an optional trailing slash.
  return jurisdictionFor(/^\/p\/([^/]+?)\/?$/i.exec(path)?.[1]) ?? undefined;
}
