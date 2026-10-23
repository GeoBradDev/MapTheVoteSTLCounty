// Reads the City Board's election layers (#87): precincts, districts, voting
// locations and the City outline. The same rules as the County client in
// ./arcgis.js, whose request code it shares: plain fetch, only the fields the
// app reads, a voter's coordinates only in a POST body (#38), one retry of a
// transient failure, and the same TimeoutError, ServiceError and NotFound.
// Layers, fields and filters come from the City block of the election config;
// docs/data.md ("St. Louis City") says why each one.
//
// Loaded on demand (src/data/jurisdictions.js), so it stays out of the first load.
import { jurisdictions } from '../config/election.js';
import { NotFound, ServiceError, normalize, pointParams, query, sharedLayer } from './arcgis.js';
import { cityPrecinctCode, cityPrecinctId } from './cityPrecinctCode.js';
import { interiorPoint } from './interiorPoint.js';

const city = jurisdictions.city;
const { siteFields, districtLayerFields } = city;

const layer = (key) => ({ serviceRoot: city.serviceRoot, layer: city.layers[key] });

/** The precincts layer fields the app reads: the code only. */
export const CITY_PRECINCT_FIELDS = Object.freeze([city.precinctField]);

/**
 * The voting locations layer fields the app reads: id, name, address, ZIP and
 * the City Board's entrance notes (#89).
 */
export const CITY_POLL_FIELDS = Object.freeze([
  siteFields.id,
  siteFields.name,
  siteFields.address,
  siteFields.zip,
  siteFields.entry,
  siteFields.accessibleEntry,
]);

/**
 * The districts layer fields the app reads: the office, and the district's
 * name and ID. Never an officeholder's name, photo, party or contact field.
 */
export const CITY_DISTRICT_FIELDS = Object.freeze([
  districtLayerFields.office,
  districtLayerFields.name,
  districtLayerFields.id,
]);

/**
 * @typedef {object} CityPrecinct
 * @property {string} code The URL code, like W01P12.
 * The layer's code field (`precinctField`, like `W 1 P 12`) is kept as well.
 */

// A precinct row with its URL code. A row whose ID is not in the exact form
// cityPrecinctId writes is a broken layer, not a missing precinct: its code
// would open no precinct.
function toPrecinct(attributes) {
  // The ID as stored, before trimming: the lookup by code asks for it exactly.
  const id = attributes[city.precinctField];
  const code = cityPrecinctCode(id);
  if (!code) throw new ServiceError(`Not a City precinct ID: ${JSON.stringify(id)}`);
  const precinct = normalize(attributes);
  return { ...precinct, code };
}

/**
 * The City precinct containing a point, or null outside the City.
 * @param {{ lat: number, lng: number }} point WGS 84 coordinates.
 * @returns {Promise<CityPrecinct | null>}
 */
export async function getCityPrecinctAtPoint({ lat, lng }) {
  const body = await query(
    layer('precincts'),
    pointParams('getCityPrecinctAtPoint', { lat, lng }, CITY_PRECINCT_FIELDS.join(',')),
    { private: true },
  );
  const feature = body.features[0];
  return feature ? toPrecinct(feature.attributes) : null;
}

/**
 * The City precinct with this code, for shareable links.
 * @param {string} code A City precinct code like W01P12.
 * @returns {Promise<CityPrecinct>}
 * @throws {NotFound} When the code is malformed or no precinct has it.
 */
export async function getCityPrecinctById(code) {
  const id = cityPrecinctId(code);
  const body = await query(layer('precincts'), {
    where: `${city.precinctField}='${id}'`,
    outFields: CITY_PRECINCT_FIELDS.join(','),
    returnGeometry: 'false',
    f: 'json',
  });
  const feature = body.features[0];
  if (!feature) throw new NotFound(`No City precinct ${code}`);
  return toPrecinct(feature.attributes);
}

async function fetchPrecinctGeometry(code, id) {
  const body = await query(layer('precincts'), {
    where: `${city.precinctField}='${id}'`,
    outFields: city.precinctField,
    returnGeometry: 'true',
    outSR: '4326',
    // In degrees, since outSR is 4326.
    maxAllowableOffset: '0.0001',
    f: 'geojson',
  });
  const feature = body.features[0];
  if (!feature) throw new NotFound(`No City precinct ${code}`);
  return feature;
}

// The latest City precinct's outline request, shared by the map, the
// distances and the districts for a share link, so one page asks once.
let outline;

/**
 * A City precinct's outline, simplified to about 10 m. The latest precinct's
 * request is shared by every caller; a failed fetch is not kept.
 * @param {string} code A City precinct code like W01P12.
 * @returns {Promise<object>} A GeoJSON Feature in lat/lng.
 * @throws {NotFound} When the code is malformed or no precinct has it.
 */
export async function getCityPrecinctGeometry(code) {
  const id = cityPrecinctId(code);
  if (outline?.code !== code) {
    const entry = { code, promise: fetchPrecinctGeometry(code, id) };
    outline = entry;
    entry.promise.catch(() => {
      if (outline === entry) outline = undefined;
    });
  }
  return outline.promise;
}

/**
 * @typedef {object} CityDistrict
 * @property {string | null} office The office elected there, like "State Senate".
 * @property {string | null} name The district, like "Missouri Senate District 5".
 * @property {string | null} id The district's ID; offices elected citywide share one.
 */

/**
 * Every district containing a point, one per office, in the layer's order.
 * @param {{ lat: number, lng: number }} point WGS 84 coordinates.
 * @returns {Promise<CityDistrict[]>}
 */
export async function getCityDistrictsAtPoint({ lat, lng }) {
  const body = await query(
    layer('districts'),
    pointParams('getCityDistrictsAtPoint', { lat, lng }, CITY_DISTRICT_FIELDS.join(',')),
    { private: true },
  );
  return body.features.map(({ attributes }) => {
    const row = normalize(attributes);
    return {
      office: row[districtLayerFields.office] ?? null,
      name: row[districtLayerFields.name] ?? null,
      id: row[districtLayerFields.id] ?? null,
    };
  });
}

/**
 * A precinct's districts, for its districts card (#90), never asked at the
 * voter's own point. Every City precinct lies inside one district per office
 * (checked on all 207, docs/data.md), so the districts at a point inside its
 * outline are its districts. Not a polygon intersect, which also returns the neighbors it
 * touches, and not the centroid, which can fall outside the precinct.
 * @param {string} code A City precinct code like W01P12.
 * @returns {Promise<CityDistrict[]>}
 * @throws {NotFound} When the code is malformed or no precinct has it.
 */
export async function getCityDistrictsForPrecinct(code) {
  const feature = await getCityPrecinctGeometry(code);
  const point = interiorPoint(feature.geometry);
  if (!point) throw new ServiceError(`City precinct ${code} has no inside to ask at`);
  return getCityDistrictsAtPoint(point);
}

// A voting location in the shape the County cards read (src/features/lookup/
// nearbyPolls.js): `loc` is its id, then name, address and ZIP, plus the
// entrance notes the City publishes.
function toSite(properties) {
  const row = normalize(properties);
  return {
    loc: row[siteFields.id] ?? null,
    name: row[siteFields.name] ?? null,
    address: row[siteFields.address] ?? null,
    zipcode: row[siteFields.zip] ?? null,
    entry: row[siteFields.entry] ?? null,
    accessibleEntry: row[siteFields.accessibleEntry] ?? null,
  };
}

/**
 * The City's Election Day voting locations (`pollsWhere`), shared by all
 * callers until older than the max age (#84), like the County's `getPolls`.
 * The City Board's page says any City voter may vote at any of them on
 * Election Day (docs/data.md).
 * @returns {Promise<object>} A GeoJSON FeatureCollection in lat/lng, with
 *   `loc`, `name`, `address`, `zipcode`, `entry` and `accessibleEntry`
 *   properties, and `loadedAt`.
 */
export const getCityPolls = sharedLayer(layer('sites'), city.pollsWhere, CITY_POLL_FIELDS, toSite);

/**
 * The City's early voting (No Excuse Absentee) sites (`earlyVotingWhere`),
 * shared and refreshed like getCityPolls.
 * @returns {Promise<object>} A GeoJSON FeatureCollection like getCityPolls'.
 */
export const getCityEarlyVotingSites = sharedLayer(
  layer('sites'),
  city.earlyVotingWhere,
  CITY_POLL_FIELDS,
  toSite,
);

/**
 * Whether a point is inside the City's outline. A backup to
 * getCityPrecinctAtPoint, whose null answer is the main sign a point is
 * outside the City.
 * @param {{ lat: number, lng: number }} point WGS 84 coordinates.
 * @returns {Promise<boolean>}
 */
export async function isInCityBoundary({ lat, lng }) {
  const body = await query(
    layer('boundary'),
    { where: city.boundaryWhere, ...pointParams('isInCityBoundary', { lat, lng }, 'OBJECTID') },
    { private: true },
  );
  return body.features.length > 0;
}
