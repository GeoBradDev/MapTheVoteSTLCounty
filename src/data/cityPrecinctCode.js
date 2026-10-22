// The one place a City precinct's URL code and its layer ID convert (#86,
// #87): W01P12 in a URL is `W 1 P 12` in the City precincts layer.
import { NotFound } from './arcgis.js';

/**
 * City precinct codes: ward and precinct, two digits each, like W01P12 for the
 * City layer's `W 1 P 12`. A County code (letters then 3 digits) never matches.
 */
export const CITY_PRECINCT_CODE = /^W\d{2}P\d{2}$/;

// The layer's form exactly, numbers 1 to 99 without padding: the form
// cityPrecinctId writes, so a code made from an ID always finds it again.
const CITY_PRECINCT_ID = /^W ([1-9]\d?) P ([1-9]\d?)$/;

/**
 * The City precincts layer's ID for a City code: W01P12 is `W 1 P 12`.
 * @param {string} code
 * @throws {NotFound} When the code is not a City code.
 */
export function cityPrecinctId(code) {
  if (typeof code !== 'string' || !CITY_PRECINCT_CODE.test(code)) {
    throw new NotFound(`Not a City precinct code: ${JSON.stringify(code)}`);
  }
  return `W ${Number(code.slice(1, 3))} P ${Number(code.slice(4))}`;
}

/**
 * The URL code for a City precincts layer ID: `W 1 P 12` is W01P12. Null for
 * anything else, spacing included: the lookup by code asks for the exact ID.
 * @param {unknown} id
 * @returns {string | null}
 */
export function cityPrecinctCode(id) {
  if (typeof id !== 'string') return null;
  const match = CITY_PRECINCT_ID.exec(id);
  if (!match) return null;
  const [, ward, precinct] = match;
  return `W${ward.padStart(2, '0')}P${precinct.padStart(2, '0')}`;
}

/**
 * The ward and precinct numbers of a City code, for the page's header line
 * (#89): W01P12 is ward 1, precinct 12.
 * @param {unknown} code
 * @returns {{ ward: number, precinct: number } | null}
 */
export function cityWardPrecinct(code) {
  if (typeof code !== 'string' || !CITY_PRECINCT_CODE.test(code)) return null;
  return { ward: Number(code.slice(1, 3)), precinct: Number(code.slice(4)) };
}
