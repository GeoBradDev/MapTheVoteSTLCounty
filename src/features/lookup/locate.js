// Turns a geocoded place into either its precinct, County or City (#88), or
// the office to send the voter to instead. It takes no geocoder's own format:
// any geocoder (or "Use my location", with coordinates only) can fill a place.
import { getPrecinctAtPoint, isInCountyBoundary } from '../../data/arcgis.js';
import { loadCityClient } from '../../data/jurisdictions.js';

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
 * @typedef {{ kind: 'precinct', jurisdiction: 'county' | 'city', precinct: object }
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
// 29 is Missouri's FIPS code, which some geocoders return as the state.
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
 * The City's outline extent (its boundary layer, 2026-10-22), widened by
 * about 500 m. Only a point inside it is sent to the City's precinct layer
 * when the geocoder does not name the City, so a point far from the City
 * never goes to the City.
 */
export const CITY_EXTENT = Object.freeze({
  west: -90.3256,
  south: 38.5275,
  east: -90.1614,
  north: 38.7789,
});

const nearCity = ({ lat, lng }) =>
  lat >= CITY_EXTENT.south &&
  lat <= CITY_EXTENT.north &&
  lng >= CITY_EXTENT.west &&
  lng <= CITY_EXTENT.east;

/**
 * Where a place is. A place the geocoder names as the City is asked of the
 * City's precinct layer first; any other is asked of the county's, then of
 * the City's when the county has none and the point is near the City. No
 * precinct at the point is the main sign it is outside both; the county
 * boundary confirms it. When the boundary query fails, the geocoder's fields
 * decide alone. A City place, or a point near the City outside the county,
 * whose City precinct cannot be found gets the City referral (`stl-city`).
 * @param {Place} place
 * @returns {Promise<Location>}
 * @throws {TypeError} When the place has no numeric lat and lng.
 */
export async function locate(place) {
  const { lat, lng } = place ?? {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError('locate needs a place with numeric lat and lng');
  }
  const point = { lat, lng };
  const kind = classifyPlace(place);
  const named = kind === 'stl-city';
  let cityAsked = false;
  let cityFailed = false;
  // The City precinct at the point, or null when it has none or fails. The
  // City's data code loads only now, so it stays out of the first load.
  async function cityPrecinct() {
    cityAsked = true;
    try {
      const client = await loadCityClient();
      const precinct = await client.getCityPrecinctAtPoint(point);
      return precinct ? { kind: 'precinct', jurisdiction: 'city', precinct } : null;
    } catch {
      cityFailed = true;
      return null;
    }
  }

  if (named) {
    const city = await cityPrecinct();
    if (city) return city;
  }
  let precinct;
  try {
    precinct = await getPrecinctAtPoint(point);
  } catch (error) {
    // The geocoder named the City, and the City had no precinct for it.
    if (named) return { kind: 'stl-city' };
    throw error;
  }
  if (precinct) return { kind: 'precinct', jurisdiction: 'county', precinct };
  // Only a place the geocoder could put in St. Louis (coordinates alone, or
  // the county): never one it puts out of state or in another county.
  const couldBeCity = kind === 'unknown' || kind === 'st-louis-county';
  if (!cityAsked && couldBeCity && nearCity(point)) {
    const city = await cityPrecinct();
    if (city) return city;
  }

  let inCounty = null;
  try {
    inCounty = await isInCountyBoundary(point);
  } catch {
    // The geocoder's fields are the fallback below.
  }
  if (inCounty === true) return { kind: 'county-unmatched' };
  // Coordinates alone near the City, outside the county, and the City could
  // not answer. (The extent box also takes in some of the Illinois bank.)
  if (cityFailed && kind === 'unknown' && inCounty === false && nearCity(point)) {
    return { kind: 'stl-city' };
  }
  if (inCounty === null && kind === 'st-louis-county') return { kind: 'county-unmatched' };
  // Outside the boundary, a geocoder that still says St. Louis County is wrong
  // about the county, not the state.
  if (kind === 'st-louis-county') return { kind: 'missouri' };
  return { kind };
}
