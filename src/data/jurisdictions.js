// The jurisdictions the results page serves (#86), each a config block from
// src/config/election.js plus a data adapter. One route, /p/:code, serves both:
// the code's shape picks the jurisdiction (owner decision, 2026-10-22,
// docs/data.md).
import { jurisdictions } from '../config/election.js';
import referrals from '../config/referrals.js';
import * as arcgis from './arcgis.js';

/**
 * City precinct codes: ward and precinct, two digits each, like W01P12 for the
 * City layer's `W 1 P 12`. A County code (letters then 3 digits) never matches.
 */
export const CITY_PRECINCT_CODE = /^W\d{2}P\d{2}$/;

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

// Until #87 reads the City's layers, every City answer is "not found".
const notYet = () =>
  Promise.reject(new arcgis.NotFound('City precinct data is not served yet (#87)'));

/** @type {Jurisdiction} The City: a stub until #87. */
export const city = Object.freeze({
  id: 'city',
  config: jurisdictions.city,
  code: CITY_PRECINCT_CODE,
  // Stable official pages, kept in referrals.js (see the City block).
  officialLookupUrl: referrals.stlCityLookup.url,
  boardSiteUrl: referrals.stlCityBoard.url,
  getPrecinct: notYet,
  getPolls: notYet,
  getEarlyVotingSites: notYet,
  getOutline: notYet,
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

/**
 * The City precincts layer's ID (its `precinctField`) for a City code: W01P12 is `W 1 P 12`.
 * @param {string} code
 * @throws {NotFound} When the code is not a City code.
 */
export function cityPrecinctId(code) {
  if (!CITY_PRECINCT_CODE.test(code))
    throw new arcgis.NotFound(`Not a City precinct code: ${code}`);
  return `W ${Number(code.slice(1, 3))} P ${Number(code.slice(4))}`;
}
