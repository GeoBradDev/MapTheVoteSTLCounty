// Reads precincts and polling places from ArcGIS REST with plain fetch.
// Layer paths come from the election config. Only coordinates or a validated
// precinct code ever go into a query: never address text. A query with a
// voter's coordinates is a POST with the coordinates in its body, never its
// URL, kept out of the browser's HTTP cache, with no cookies and no referrer
// (#38). Queries by precinct code or for a whole layer stay cacheable GETs.
import election from '../config/election.js';
import { isFresh, layerMaxAgeMs } from './freshness.js';
import { selectCityWaits, selectCountyWaits } from './waitTimes.js';

/** Precinct codes: a 2 or 3 letter township prefix plus 3 digits, like CC007. */
export const PRECINCT_CODE = /^[A-Z]{2,3}\d{3}$/;

/**
 * The precinct fields the app reads (#27): the code, the status, the sample
 * ballot link and every field the districts card lists. Queries ask for these
 * only, not `*`. scripts/check-config.mjs checks the live layer has them.
 */
export const PRECINCT_FIELDS = Object.freeze([
  ...new Set([
    'precinct',
    'in_election',
    'html',
    election.congressionalField,
    ...election.districtFields.map((d) => d.field),
  ]),
]);

/**
 * The polling place fields the app reads (#27). The last is the early voting
 * site's key in the County's wait time reports (#103).
 */
export const POLL_FIELDS = Object.freeze([
  'loc',
  'name',
  'address',
  'zipcode',
  'abs_type',
  'notes_abs',
  election.waitTimes.county.pollsField,
]);

/** How long one attempt may take before it is aborted. */
export const TIMEOUT_MS = 8000;

/** The wait before the one retry of a transient failure. */
export const RETRY_DELAY_MS = 500;

/** The request took longer than the timeout, on every attempt. */
export class TimeoutError extends Error {
  name = 'TimeoutError';
}

/** The service failed: a network error, an HTTP error, or an ArcGIS error body. */
export class ServiceError extends Error {
  name = 'ServiceError';

  /**
   * @param {string} message
   * @param {{ status?: number, code?: number, cause?: unknown }} [details] `status` is the
   *   HTTP status, `code` the ArcGIS error code. Neither is set for a network failure.
   */
  constructor(message, { status, code, cause } = {}) {
    super(message, { cause });
    this.status = status;
    this.code = code;
  }
}

/** No precinct has this code. */
export class NotFound extends Error {
  name = 'NotFound';
}

// Trims strings and turns empty values into null, so callers check one thing.
// A polling place's `loc` is always a 3-digit string, like 007.
function normalize(attributes) {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => {
      if (key === 'loc' && typeof value === 'number') value = String(value);
      if (typeof value === 'string') value = value.trim();
      if (value === '') value = null;
      if (key === 'loc' && value !== null) value = value.padStart(3, '0');
      return [key, value];
    }),
  );
}

function checkCode(code) {
  if (typeof code !== 'string') throw new NotFound(`Not a precinct code: a ${typeof code}`);
  if (!PRECINCT_CODE.test(code)) throw new NotFound(`Not a precinct code: ${JSON.stringify(code)}`);
}

// A layer is a key of `election.layers`, or a wait time source from the
// config, which names its own service root.
function layerUrl(layer) {
  return typeof layer === 'string'
    ? `${election.serviceRoot}/${election.layers[layer]}`
    : `${layer.serviceRoot}/${layer.layer}`;
}

function queryUrl(layer, params) {
  return `${layerUrl(layer)}/query?${new URLSearchParams(params)}`;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

// One attempt. The timeout covers reading the body too. `fieldsKey` is where
// each feature keeps its fields: `attributes` for f=json, `properties` for
// f=geojson.
async function fetchOnce(url, fieldsKey, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const fail = (error, message, details) =>
    controller.signal.aborted
      ? new TimeoutError(`No answer in ${TIMEOUT_MS} ms`, { cause: error })
      : new ServiceError(message, { ...details, cause: error });
  try {
    let res;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw fail(error, 'Network request failed');
    }
    if (!res.ok) throw new ServiceError(`HTTP ${res.status}`, { status: res.status });
    let body;
    try {
      body = await res.json();
    } catch (error) {
      // Only a SyntaxError means a bad body. Anything else is the connection
      // dropping mid-download, a network failure worth retrying.
      if (error instanceof SyntaxError) {
        throw new ServiceError('Response is not JSON', { status: res.status, cause: error });
      }
      throw fail(error, 'Network request failed');
    }
    // ArcGIS reports query errors as HTTP 200 with an error body.
    if (body?.error) {
      throw new ServiceError(body.error.message ?? 'ArcGIS error', { code: body.error.code });
    }
    if (!Array.isArray(body?.features)) {
      throw new ServiceError('Response has no features list', { status: res.status });
    }
    if (!body.features.every((f) => isObject(f?.[fieldsKey]))) {
      throw new ServiceError('Response has a feature without fields', { status: res.status });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// Worth one more try: a timeout, a network failure, a 5xx or a 429.
function isTransient(error) {
  if (error instanceof TimeoutError) return true;
  if (!(error instanceof ServiceError)) return false;
  const status = error.status ?? error.code;
  return status === undefined || status === 429 || status >= 500;
}

// The fetch options of a query that carries a voter's coordinates (#38): the
// parameters go in a form body, which ArcGIS's query accepts and which needs
// no CORS preflight, and the browser keeps neither request nor answer.
const PRIVATE_INIT = Object.freeze({
  method: 'POST',
  cache: 'no-store',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
});

// A GET query, or with `private` set a POST whose parameters are in the body
// and out of the URL, the HTTP cache and the referrer.
async function query(layer, params, { private: isPrivate = false } = {}) {
  const url = isPrivate ? `${layerUrl(layer)}/query` : queryUrl(layer, params);
  const init = isPrivate ? { ...PRIVATE_INIT, body: new URLSearchParams(params) } : {};
  const fieldsKey = params.f === 'geojson' ? 'properties' : 'attributes';
  try {
    return await fetchOnce(url, fieldsKey, init);
  } catch (error) {
    if (!isTransient(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchOnce(url, fieldsKey, init);
  }
}

// A point query's parameters. Only the coordinates come from the caller.
function pointParams(caller, { lat, lng }, outFields) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError(`${caller} needs numeric lat and lng`);
  }
  return {
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'false',
    f: 'json',
  };
}

/**
 * The precinct containing a point, or null when the point is outside the county.
 * @param {{ lat: number, lng: number }} point WGS 84 coordinates.
 * @returns {Promise<object | null>} The precinct's attributes.
 */
export async function getPrecinctAtPoint({ lat, lng }) {
  const body = await query(
    'precincts',
    pointParams('getPrecinctAtPoint', { lat, lng }, PRECINCT_FIELDS.join(',')),
    { private: true },
  );
  const feature = body.features[0];
  return feature ? normalize(feature.attributes) : null;
}

/**
 * The codes of the precincts containing any of the points, in one query.
 * Address search (src/data/countyAddress.js) uses it to see whether every
 * record of one address is in one precinct.
 * @param {{ lat: number, lng: number }[]} points WGS 84 coordinates.
 * @returns {Promise<Set<string>>}
 */
export async function getPrecinctCodesAtPoints(points) {
  const coordinates = points.map(({ lat, lng }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new TypeError('getPrecinctCodesAtPoints needs numeric lat and lng');
    }
    return [lng, lat];
  });
  const body = await query(
    'precincts',
    {
      geometry: JSON.stringify({ points: coordinates, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryMultipoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'precinct',
      returnGeometry: 'false',
      f: 'json',
    },
    { private: true },
  );
  return new Set(body.features.map((f) => normalize(f.attributes).precinct).filter(Boolean));
}

/**
 * Whether a point is inside the county outline. A backup to getPrecinctAtPoint,
 * whose null answer is the main sign that a point is outside the county.
 * @param {{ lat: number, lng: number }} point WGS 84 coordinates.
 * @returns {Promise<boolean>}
 */
export async function isInCountyBoundary({ lat, lng }) {
  const body = await query(
    'countyBoundary',
    pointParams('isInCountyBoundary', { lat, lng }, 'OBJECTID'),
    { private: true },
  );
  return body.features.length > 0;
}

/**
 * The precinct with this code, for shareable links.
 * @param {string} code A precinct code like CC007.
 * @returns {Promise<object>} The precinct's attributes.
 * @throws {NotFound} When the code is malformed or no precinct has it.
 */
export async function getPrecinctById(code) {
  checkCode(code);
  const body = await query('precincts', {
    where: `precinct='${code}'`,
    outFields: PRECINCT_FIELDS.join(','),
    returnGeometry: 'false',
    f: 'json',
  });
  const feature = body.features[0];
  if (!feature) throw new NotFound(`No precinct ${code}`);
  return normalize(feature.attributes);
}

async function fetchPrecinctGeometry(code) {
  const body = await query('precincts', {
    where: `precinct='${code}'`,
    outFields: 'precinct',
    returnGeometry: 'true',
    outSR: '4326',
    // In degrees, since outSR is 4326.
    maxAllowableOffset: '0.0001',
    f: 'geojson',
  });
  const feature = body.features[0];
  if (!feature) throw new NotFound(`No precinct ${code}`);
  return feature;
}

// The latest precinct's outline request, shared by the polling places card
// and the map so one page asks once.
let outline;

/**
 * A precinct's outline for the map, simplified to about 10 m. The latest
 * precinct's request is shared by every caller; a failed fetch is not kept, so
 * the next call tries again.
 * @param {string} code A precinct code like CC007.
 * @returns {Promise<object>} A GeoJSON Feature in lat/lng.
 * @throws {NotFound} When the code is malformed or no precinct has it.
 */
export async function getPrecinctGeometry(code) {
  checkCode(code);
  if (outline?.code !== code) {
    const entry = { code, promise: fetchPrecinctGeometry(code) };
    outline = entry;
    entry.promise.catch(() => {
      if (outline === entry) outline = undefined;
    });
  }
  return outline.promise;
}

// A whole-layer GeoJSON query, shared by all callers while it is younger than
// the max age (#84), so a call after that sees a moved polling place. A
// request in flight is shared too; a failed fetch is not kept, so the
// next call tries again. The answer carries `loadedAt`, when it arrived (ms).
// Only the fields the app reads, with coordinates to 6 decimals (about 0.1 m).
function sharedLayer(layer, where, fields) {
  let entry;
  return () => {
    if (entry && (entry.loadedAt === undefined || isFresh(entry.loadedAt, layerMaxAgeMs()))) {
      return entry.promise;
    }
    const next = {};
    next.promise = query(layer, {
      where,
      outFields: fields.join(','),
      outSR: '4326',
      geometryPrecision: '6',
      f: 'geojson',
    })
      .then((body) => {
        next.loadedAt = Date.now();
        return {
          ...body,
          features: body.features.map((f) => ({ ...f, properties: normalize(f.properties) })),
          loadedAt: next.loadedAt,
        };
      })
      .catch((error) => {
        if (entry === next) entry = undefined;
        throw error;
      });
    entry = next;
    return next.promise;
  };
}

/**
 * Every polling place, shared by all callers until it is older than the max
 * age (`layerMaxAgeMs`), then fetched again. A failed fetch is not kept, so
 * the next call tries again.
 * @returns {Promise<object>} A GeoJSON FeatureCollection in lat/lng with
 *   normalized properties and `loadedAt`.
 */
export const getPolls = sharedLayer('polls', '1=1', POLL_FIELDS);

/**
 * The in-person absentee (early voting) sites: the polls layer filtered by
 * `absenteeWhere` from the election config. Shared and refreshed like
 * getPolls.
 * @returns {Promise<object>} A GeoJSON FeatureCollection in lat/lng with
 *   normalized properties, including `abs_type` and `notes_abs`.
 */
export const getAbsenteeSites = sharedLayer('polls', election.absenteeWhere, POLL_FIELDS);

// The rows of a wait time layer: attributes only, no geometry. A plain GET:
// the query carries no voter data, and the layers send max-age=30.
async function waitRows(source, params) {
  const body = await query(source, { ...params, returnGeometry: 'false', f: 'json' });
  return body.features.map((f) => f.attributes);
}

/**
 * The County's current early voting line counts (#103): the newest fresh
 * report per absentee site that is open now. The County's view holds only the
 * last 2 hours of early voting reports, so it is empty while the sites are
 * closed.
 * @returns {Promise<import('./waitTimes.js').WaitEntry[]>}
 */
export async function getCountyWaits() {
  const county = election.waitTimes.county;
  const [reports, sites] = await Promise.all([
    waitRows(county, {
      where: county.where,
      outFields: [county.siteField, county.timeField, county.valueField].join(','),
      orderByFields: `${county.timeField} DESC`,
    }),
    getAbsenteeSites(),
  ]);
  return selectCountyWaits(reports, sites.features, Date.now());
}

/**
 * The City's current early voting line counts (#103), by the City Board's
 * own dashboard rules. Never `outFields=*`: the layer also holds staff
 * contact fields.
 * @returns {Promise<import('./waitTimes.js').WaitEntry[]>}
 */
export async function getCityWaits() {
  const city = election.waitTimes.city;
  const rows = await waitRows(city, {
    where: city.where,
    outFields: [
      city.siteField,
      city.valueField,
      city.timeField,
      city.commentsField,
      city.hoursField,
    ].join(','),
    orderByFields: `${city.timeField} DESC`,
  });
  return selectCityWaits(rows, Date.now());
}
