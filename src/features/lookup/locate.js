// Turns a geocoded place into either its precinct or the office to send the
// voter to instead. It takes no geocoder's own format: any geocoder (or
// "Use my location", with coordinates only) can fill a place.
import { getPrecinctAtPoint, isInCountyBoundary } from '../../data/arcgis.js';

/**
 * @typedef {object} Place
 * @property {number} lat WGS 84 latitude.
 * @property {number} lng WGS 84 longitude.
 * @property {string} [state] The geocoder's state, as `MO`, `Missouri` or the
 *   FIPS code `29`.
 * @property {string} [county] The geocoder's county name, like
 *   `Saint Louis County` or `St. Louis city`.
 */

/**
 * @typedef {{ kind: 'precinct', precinct: object }
 *   | { kind: 'county-unmatched' | 'stl-city' | 'missouri' | 'out-of-state' | 'unknown' }}
 *   Location
 */

// Lower case, punctuation dropped, "saint" as "st", single spaces.
function normalizeName(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

const CITY_NAMES = new Set(['st louis city', 'city of st louis']);
const COUNTY_NAMES = new Set(['st louis county']);
// 29 is Missouri's FIPS code, which the Census geocoder returns as STATE.
const MISSOURI = new Set(['mo', 'missouri', '29']);

/**
 * What a place's geocoder fields say about it, without the map. St. Louis City
 * is an independent city with no namesake elsewhere, so its name alone is
 * enough unless the state says otherwise.
 * @param {Place} place
 * @returns {'stl-city' | 'st-louis-county' | 'missouri' | 'out-of-state' | 'unknown'}
 */
export function classifyPlace({ state, county } = {}) {
  const stateName = normalizeName(state);
  const countyName = normalizeName(county);
  if (stateName && !MISSOURI.has(stateName)) return 'out-of-state';
  if (CITY_NAMES.has(countyName)) return 'stl-city';
  if (!stateName) return 'unknown';
  if (COUNTY_NAMES.has(countyName)) return 'st-louis-county';
  return 'missouri';
}

/**
 * Where a place is. No precinct at the point is the main sign it is outside the
 * county; the county boundary confirms it. When the boundary query fails, the
 * geocoder's fields decide alone.
 * @param {Place} place
 * @returns {Promise<Location>}
 * @throws {TypeError} When the place has no numeric lat and lng.
 */
export async function locate(place) {
  const { lat, lng } = place ?? {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError('locate needs a place with numeric lat and lng');
  }
  const precinct = await getPrecinctAtPoint({ lat, lng });
  if (precinct) return { kind: 'precinct', precinct };

  let inCounty = null;
  try {
    inCounty = await isInCountyBoundary({ lat, lng });
  } catch {
    // The geocoder's fields are the fallback below.
  }
  const kind = classifyPlace(place);
  if (inCounty === true) return { kind: 'county-unmatched' };
  if (inCounty === null && kind === 'st-louis-county') return { kind: 'county-unmatched' };
  // Outside the boundary, a geocoder that still says St. Louis County is wrong
  // about the county, not the state.
  if (kind === 'st-louis-county') return { kind: 'missouri' };
  return { kind };
}
