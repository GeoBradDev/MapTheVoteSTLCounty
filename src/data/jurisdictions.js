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
});

let cityClient;

/**
 * The City's data code (./cityArcgis.js, #87), loaded on first use so it stays
 * out of the first load. A failed load is not kept, so the next call tries
 * again.
 * @returns {Promise<typeof import('./cityArcgis.js')>}
 */
export function loadCityClient() {
  cityClient ??= import('./cityArcgis.js').catch((error) => {
    cityClient = undefined;
    throw error;
  });
  return cityClient;
}

// The City early voting card is not built yet (#91), so its sites are "not
// found" without a request: the page asks for them before the precinct
// answers, and fetching them would load a layer no card shows.
const earlyVotingNotYet = () =>
  Promise.reject(new arcgis.NotFound('City early voting sites are not served yet (#91)'));

/**
 * @type {Jurisdiction} The City (#89): its data code in ./cityArcgis.js, loaded
 * on first use.
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
  getEarlyVotingSites: earlyVotingNotYet,
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
 * a precinct code" in a URL, a share link or an analytics path (#69).
 * @param {unknown} code
 */
export function isPrecinctCode(code) {
  return jurisdictionFor(code) !== null;
}
