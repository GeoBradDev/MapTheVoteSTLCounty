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
 * The City outline's river side (its citywide district polygon, as recorded for #144),
 * as [lat, lng] from its northeast corner at Chain of Rocks to the mouth of
 * the River des Peres, simplified with Douglas-Peucker at 0.001 degrees
 * (#144); no City point is more than 0.0012 degrees east of it. East of it is
 * the river and Illinois: never the City or the county. Its ends leave about
 * 500 m of the extent box north and south uncovered (river and floodplain). A
 * re-recorded outline that moves east fails the test over its vertices.
 */
const RIVER_EDGE = [
  [38.7727, -90.1664],
  [38.7603, -90.1751],
  [38.7545, -90.1763],
  [38.7469, -90.1834],
  [38.743, -90.1913],
  [38.7322, -90.2052],
  [38.7261, -90.2099],
  [38.718, -90.2119],
  [38.7118, -90.212],
  [38.7028, -90.2092],
  [38.6935, -90.2022],
  [38.6876, -90.1952],
  [38.6748, -90.1864],
  [38.6596, -90.1811],
  [38.6428, -90.1777],
  [38.6338, -90.178],
  [38.6116, -90.1845],
  [38.5945, -90.196],
  [38.5788, -90.2167],
  [38.5751, -90.2242],
  [38.532, -90.2578],
];
// About 175 m: more than the simplification, so no City point is east of it.
const RIVER_MARGIN = 0.002;

/**
 * Whether a point is clearly east of the City's river edge, on the river or
 * the Illinois bank. False for a point north or south of the edge's ends,
 * which it says nothing about.
 * @param {{ lat: number, lng: number }} point
 */
export function eastOfCity({ lat, lng }) {
  let edge = -Infinity;
  for (let i = 1; i < RIVER_EDGE.length; i += 1) {
    const [aLat, aLng] = RIVER_EDGE[i - 1];
    const [bLat, bLng] = RIVER_EDGE[i];
    if ((lat - aLat) * (lat - bLat) > 0) continue;
    const t = aLat === bLat ? 0 : (lat - aLat) / (bLat - aLat);
    edge = Math.max(edge, aLng + t * (bLng - aLng));
  }
  return edge > -Infinity && lng > edge + RIVER_MARGIN;
}

/**
 * Where a place is. A place the geocoder names as the City is asked of the
 * City's precinct layer first; any other is asked of the county's, then of
 * the City's when the county has none and the point is near the City. No
 * precinct at the point is the main sign it is outside both; the county
 * boundary confirms it. When the boundary query fails, the geocoder's fields
 * decide alone. A City place whose City precinct cannot be found gets the
 * City referral (`stl-city`), and so do coordinates alone or a place the
 * geocoder puts in the county, near the City, west of its river edge and not
 * known to be in the county, when the City's layer fails.
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
  // Coordinates alone, or a place the geocoder puts in the county, near the
  // City, not known to be in the county, and the City could not answer: never
  // told it is outside the City and County. The extent box also takes in
  // some of the Illinois bank, which is never the City (#144).
  if (cityFailed && couldBeCity && nearCity(point) && !eastOfCity(point)) {
    return { kind: 'stl-city' };
  }
  if (inCounty === null && kind === 'st-louis-county') return { kind: 'county-unmatched' };
  // Outside the boundary, a geocoder that still says St. Louis County is wrong
  // about the county, not the state.
  if (kind === 'st-louis-county') return { kind: 'missouri' };
  return { kind };
}
