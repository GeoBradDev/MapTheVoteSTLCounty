// The polling places nearest a point, for the "Polling places near you" card.
// County data assigns no polling place to a precinct, and a registered County
// voter may vote at any County polling place (#152), so the card lists the
// closest ones by straight-line distance.
import election from '../../config/election.js';

/** Mean Earth radius in miles (IUGG mean radius, 6371.0088 km). */
const EARTH_RADIUS_MILES = 3958.7613;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle (haversine) distance in miles. Within 0.1 mi of the WGS 84
 * geodesic distance across the county.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number}
 */
export function distanceMiles(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Initialisms in the layer's names that stay upper case.
const UPPER = new Set([
  'BOE',
  'CC',
  'JFK',
  'MRH',
  'PAT',
  'STL',
  'STLCC',
  'UCC',
  'UMSL',
  'VFW',
  'YMCA',
]);
// Compass points in street addresses, like "300 N NEW BALLAS RD".
const COMPASS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
// Short words that stay lower case except at the start.
const SMALL = new Set(['a', 'an', 'and', 'at', 'de', 'for', 'in', 'of', 'on', 'the', 'to']);

function capitalize(word) {
  const lower = word.toLowerCase();
  // Ordinals: 1ST, 82ND.
  if (/^\d+(st|nd|rd|th)$/.test(lower)) return lower;
  if (/^mc[a-z]{2,}$/.test(lower)) return `Mc${lower[2].toUpperCase()}${lower.slice(3)}`;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * One word in careful title case: initialisms and compass points upper case,
 * short words lower case unless `first`, each hyphenated part cased.
 * @param {string} word
 * @param {boolean} first Whether it starts the text.
 */
export function caseWord(word, first) {
  const upper = word.toUpperCase();
  if (UPPER.has(upper) || COMPASS.has(upper)) return upper;
  const lower = word.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  // Hyphenated parts each get cased: EUREKA-PACIFIC, 2184-GEN.
  return word
    .split('-')
    .map((part) => (UPPER.has(part.toUpperCase()) ? part.toUpperCase() : capitalize(part)))
    .join('-');
}

/**
 * Careful title case for the layer's all-caps names and addresses: keeps
 * initialisms like STLCC, UMSL and JFK, and reads McCluer and 1st right.
 * @param {unknown} text
 * @returns {string | null} Null when there is no text.
 */
export function titleCase(text) {
  if (typeof text !== 'string') return null;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word, i) => caseWord(word, i === 0)).join(' ');
}

function pointOf(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) return null;
  const [lng, lat] = geometry.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function zipOf(value) {
  if (value === null || value === undefined) return null;
  const zip = String(value).trim();
  return /^\d{5}$/.test(zip) ? zip : null;
}

/**
 * @typedef {object} NearbyPoll
 * @property {string | null} loc The layer's location number.
 * @property {string | null} name Title-cased name (the County's), or as
 *   published when already in mixed case (the City's).
 * @property {string | null} address Likewise.
 * @property {string | null} zip Five-digit ZIP.
 * @property {number} lat
 * @property {number} lng
 * @property {number | null} miles Straight-line distance from the origin; null
 *   from pollRows, which has none.
 * @property {string | null} absType The layer's `abs_type`: `none`, or the
 *   kind of in-person absentee site.
 * @property {string | null} absNote The layer's voter-facing `notes_abs`.
 * @property {string | null} waitKey The early voting site's key in the
 *   County's line count reports (the polls layer's `absentee`, #103).
 * @property {string | null} dayKey The polling place's key in the County's
 *   Election Day line count reports (the polls layer's `username`, #107).
 * @property {string | null} absLoc The early voting site's location number
 *   (the polls layer's `loc_abs`), which its room is keyed by (#100).
 * @property {string | null} entry The City Board's entrance note (#89).
 * @property {string | null} accessibleEntry The City Board's accessible
 *   entrance note (#89).
 */

const textOrNull = (value) => (typeof value === 'string' && value !== '' ? value : null);

// The County's layer is all caps, so its names and addresses are title-cased;
// the City's is published in mixed case (#89), initialisms like VPA and MB
// included, so text with any lower-case letter is kept as published.
const displayText = (value) =>
  typeof value === 'string' && /[a-z]/.test(value) ? textOrNull(value.trim()) : titleCase(value);

/**
 * Every site with coordinates, in layer order, with no distance.
 * @param {{ features: object[] }} collection GeoJSON from getPolls() or
 *   getAbsenteeSites().
 * @returns {NearbyPoll[]}
 */
export function pollRows(collection) {
  const rows = [];
  for (const feature of collection?.features ?? []) {
    const point = pointOf(feature);
    if (!point) continue;
    const props = feature.properties ?? {};
    rows.push({
      loc: typeof props.loc === 'string' ? props.loc : null,
      name: displayText(props.name),
      address: displayText(props.address),
      zip: zipOf(props.zipcode),
      absType: typeof props.abs_type === 'string' ? props.abs_type : null,
      absNote: typeof props.notes_abs === 'string' ? props.notes_abs : null,
      waitKey: textOrNull(props[election.waitTimes.county.pollsField]),
      dayKey: textOrNull(props[election.waitTimes.county.electionDay.pollsField]),
      absLoc: textOrNull(props.loc_abs),
      entry: textOrNull(props.entry),
      accessibleEntry: textOrNull(props.accessibleEntry),
      lat: point.lat,
      lng: point.lng,
      miles: null,
    });
  }
  return rows;
}

/**
 * Every polling place with coordinates, nearest the origin first. Every
 * feature in the layer is an Election Day polling place: the absentee sites
 * carry Election Day location numbers too, and the county's own Election Day
 * app shows the whole layer.
 * @param {{ features: object[] }} collection GeoJSON from getPolls().
 * @param {{ lat: number, lng: number }} origin
 * @returns {NearbyPoll[]}
 */
export function nearestPolls(collection, origin) {
  return pollRows(collection)
    .map((row) => ({ ...row, miles: distanceMiles(origin, row) }))
    .sort((a, b) => a.miles - b.miles || String(a.loc).localeCompare(String(b.loc)));
}

// Signed area and area-weighted centroid of one ring, in planar lon/lat. At a
// precinct's size the distortion is far below the 0.1 mi the card shows.
function ringMoments(ring) {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  area /= 2;
  if (area === 0 || !Number.isFinite(area)) return null;
  return { area, cx: x / (6 * area), cy: y / (6 * area) };
}

/**
 * The area-weighted center of a GeoJSON Polygon or MultiPolygon in lat/lng,
 * with holes subtracted. Null for anything else, or a shape with no area.
 * @param {object | null | undefined} geometry
 * @returns {{ lat: number, lng: number } | null}
 */
export function polygonCenter(geometry) {
  let polygons;
  if (geometry?.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry?.type === 'MultiPolygon') polygons = geometry.coordinates;
  else return null;
  let total = 0;
  let sumX = 0;
  let sumY = 0;
  for (const rings of polygons ?? []) {
    (rings ?? []).forEach((ring, i) => {
      if (!Array.isArray(ring)) return;
      const m = ringMoments(ring);
      if (!m) return;
      // The first ring is the outline, the rest are holes, whatever their
      // winding.
      const weight = i === 0 ? Math.abs(m.area) : -Math.abs(m.area);
      total += weight;
      sumX += m.cx * weight;
      sumY += m.cy * weight;
    });
  }
  if (!(total > 0)) return null;
  const center = { lat: sumY / total, lng: sumX / total };
  return Number.isFinite(center.lat) && Number.isFinite(center.lng) ? center : null;
}

const coordinate = (value) => String(Number(value.toFixed(6)));

/**
 * Directions links built from a polling place's coordinates. Google's universal
 * link opens the Google Maps app where it is installed (and Android's default
 * maps app); Apple's opens Apple Maps on iOS.
 * @param {{ lat: number, lng: number }} point
 * @returns {{ google: string, apple: string }}
 */
export function directionsLinks({ lat, lng }) {
  const destination = `${coordinate(lat)},${coordinate(lng)}`;
  return {
    google: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`,
    apple: `https://maps.apple.com/?${new URLSearchParams({ daddr: destination })}`,
  };
}

/**
 * Whether the device is an iPhone, iPad or iPod, where Apple Maps is the
 * built-in maps app. iPadOS reports itself as a Mac, so a Mac with a touch
 * screen counts too.
 * @param {Navigator | undefined} nav
 * @returns {boolean}
 */
export function isAppleMobile(nav) {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(nav.userAgent ?? '')) return true;
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}
