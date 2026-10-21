// A Geocoder (src/data/geocoder.js) backed by Photon, an open-source geocoder
// over OpenStreetMap data, called straight from the browser: no proxy, no
// server of ours, no API key. Address text goes only to Photon, with no
// cookies, no referrer and no browser cache. Photon's public instance asks for
// fair use and promises no availability, so every failure becomes a
// GeocoderUnavailableError and the lookup offers "Use my location" and the
// county's official lookup instead. A match is never stretched into a guess:
// only results with a house number count, and typed text must name that
// number and the whole street (direction, name and type).
import { GeocoderUnavailableError } from './geocoderError.js';

export const DEFAULT_BASE_URL = 'https://photon.komoot.io';

/** Who to credit, shown next to the address box. */
export const attribution = Object.freeze({
  service: 'Photon',
  serviceBy: 'komoot',
  serviceUrl: 'https://photon.komoot.io',
  data: 'OpenStreetMap contributors',
  dataUrl: 'https://www.openstreetmap.org/copyright',
});

/**
 * St. Louis County's extent (docs/data.md) as minLon, minLat, maxLon, maxLat.
 * It also covers St. Louis City, so a City address still resolves and gets the
 * City's own referral (#8).
 */
export const COUNTY_BBOX = Object.freeze([-90.74, 38.39, -90.11, 38.89]);
// Near the middle of the county, to rank its addresses first.
const BIAS = Object.freeze({ lat: 38.6, lon: -90.4 });
/** How long one request may take before the lookup gives up on Photon. */
export const TIMEOUT_MS = 8000;
// Photon's results include streets and places we drop, so ask for more than we show.
const REQUEST_LIMIT = 10;
const MAX_SUGGESTIONS = 5;

const STATE_ABBR = { Missouri: 'MO', Illinois: 'IL' };

// Spellings that name the same thing, so typed text and OSM names compare as
// one form. "saint" and "street" both become "st" on both sides alike.
const CANONICAL = {
  street: 'st',
  saint: 'st',
  road: 'rd',
  avenue: 'ave',
  av: 'ave',
  drive: 'dr',
  boulevard: 'blvd',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  terrace: 'ter',
  parkway: 'pkwy',
  highway: 'hwy',
  circle: 'cir',
  trail: 'trl',
  square: 'sq',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
  mount: 'mt',
  fort: 'ft',
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
};
// The county name locate() reads as St. Louis City.
const CITY_COUNTY = 'St. Louis city';
// St. Louis in words() form.
const ST_LOUIS = 'st louis';
const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
// Street types, leaving out "st", which may start a city ("St. Louis").
const STREET_TYPES = new Set('rd ave dr blvd ln ct pl ter pkwy hwy cir trl sq way'.split(' '));

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

// Lower-case words in one spelling: ordinals as bare numbers (63rd -> 63),
// then the CANONICAL forms.
function words(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.replace(/^(\d+)(st|nd|rd|th)$/, '$1'))
    .map((word) => CANONICAL[word] ?? word);
}

function isAddress(feature) {
  const props = feature?.properties;
  const coords = feature?.geometry?.coordinates;
  return (
    props?.countrycode === 'US' &&
    Boolean(props.housenumber) &&
    Boolean(props.street) &&
    Array.isArray(coords) &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1])
  );
}

function labelOf(props) {
  const region = [STATE_ABBR[props.state] ?? props.state, props.postcode].filter(Boolean).join(' ');
  return [
    `${props.housenumber} ${props.street}`,
    props.city ?? props.district ?? props.county,
    region,
  ]
    .filter(Boolean)
    .join(', ');
}

// Photon gives St. Louis City, an independent city, as a city with no county.
function countyOf(props) {
  if (props.county) return props.county;
  if (props.state === 'Missouri' && words(props.city).join(' ') === ST_LOUIS) {
    return CITY_COUNTY;
  }
  return undefined;
}

/** @returns {import('./geocoder.js').GeocodedPlace} */
function placeOf(feature) {
  const { properties: props, geometry } = feature;
  const [lng, lat] = geometry.coordinates;
  return { lat, lng, state: props.state, county: countyOf(props), label: labelOf(props) };
}

// Whether a typed number names this house number: equal, one of a list
// ("12;14") or inside a range ("1200-1206").
function hasNumber(housenumber, typed) {
  return String(housenumber)
    .toLowerCase()
    .split(/[;,]/)
    .some((part) => {
      const value = part.trim();
      if (value === typed) return true;
      const range = value.match(/^(\d+)\s*-\s*(\d+)$/);
      const n = Number(typed);
      return Boolean(range) && /^\d+$/.test(typed) && n >= +range[1] && n <= +range[2];
    });
}

// The last ZIP typed after the house number, if any.
function typedZip(text) {
  const zips = [...text.replace(/^\s*\S+/, '').matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  return zips.at(-1)?.[1];
}

const NOT_TOWN = new Set(['mo', 'missouri', 'usa', 'us', 'united', 'states']);
// Unit words; when a unit number or letter follows one, both are dropped.
const UNIT = new Set('apt apartment unit ste suite bldg building fl floor rm room lot'.split(' '));
// Typed towns that name St. Louis, the mailing city for much of the county.
const ST_LOUIS_NAMES = new Set([ST_LOUIS, `${ST_LOUIS} city`]);

const isUnitNumber = (word) => /^\d/.test(word ?? '') || word?.length === 1;

// The town in the words typed after the street, with or without commas:
// what is left once units ("Apt 2", "Unit 2-B"), the state, the country and
// numbers are dropped. "Ste Genevieve" is a town, not a suite, because no unit
// number follows "Ste"; a direction stays ("East St. Louis" is not St. Louis).
function typedTown(after) {
  const kept = [];
  for (let i = 0; i < after.length; i += 1) {
    const word = after[i];
    if (UNIT.has(word) && isUnitNumber(after[i + 1])) {
      i += 1;
      // The letter of a unit like "2-B".
      if (/^\d/.test(after[i]) && after[i + 1]?.length === 1) i += 1;
    } else if (!/^\d/.test(word) && !NOT_TOWN.has(word)) kept.push(word);
  }
  return kept.join(' ');
}

// Typed text names a feature when:
// - its street part (before the first comma) starts with the feature's house
//   number and then the feature's whole street, word for word, with no
//   direction or street type after it ("100 S Lindbergh Blvd" is not "100
//   Lindbergh Blvd", "8025 Maryland Ave Clayton" is not "8025 Clayton Rd");
// - a typed ZIP is the feature's postcode (a feature with no postcode cannot
//   confirm one unless its own town, not St. Louis, is typed), and a town
//   typed after the street, with or
//   without a comma, is the feature's town unless it is St. Louis;
// - a feature in a named town other than St. Louis has that town or its ZIP
//   typed, since the same address can exist in two towns. St. Louis is the
//   mailing city for much of the county, so it confirms nothing.
// Typing a suggestion's own label back always matches.
// geocode() also needs every match to be one place (see samePlace).
function matchesTyped(text, props) {
  if (words(text).join(' ') === words(labelOf(props)).join(' ')) return true;
  const [streetPart] = text.split(',');
  const [number, ...typed] = words(streetPart);
  if (!number || !/^\d/.test(number) || !hasNumber(props.housenumber, number)) return false;
  const street = words(props.street);
  if (!street.length || !street.every((word, i) => typed[i] === word)) return false;
  const next = typed[street.length];
  if (next && (DIRECTIONS.has(next) || STREET_TYPES.has(next))) return false;
  // "Elm St Louis" could be Elm Street in St. Louis or Elm (any type) in St. Louis.
  if (street.at(-1) === 'st' && next === 'louis') return false;

  const zip = typedZip(text);
  const postcode = props.postcode ? String(props.postcode).slice(0, 5) : null;
  if (zip && postcode && zip !== postcode) return false;
  const town = words(props.city ?? props.district).join(' ');
  // A house with no postcode cannot confirm a typed ZIP unless its own town,
  // other than St. Louis, is typed too.
  if (zip && !postcode && (!town || town === ST_LOUIS)) return false;
  const typedPlace = typedTown(words(text).slice(1 + street.length));
  // "St. Louis City" says the City, so a county result is not it.
  if (typedPlace === `${ST_LOUIS} city` && countyOf(props) !== CITY_COUNTY) return false;
  if (typedPlace && town && typedPlace !== town && !ST_LOUIS_NAMES.has(typedPlace)) return false;
  const confirmed = (zip && zip === postcode) || (typedPlace && typedPlace === town);
  return !town || town === ST_LOUIS || Boolean(confirmed);
}

// About 50 m: one house that OSM lists twice, as a point and a building.
const SAME_HOUSE_DEGREES = 0.0005;

// Whether two matching features are one address, not two houses Photon ranks
// in some order: the same county, and the same postcode or about 50 m apart.
// A number and street in one ZIP is one address, even on a large site that
// OSM lists at points far apart.
function samePlace(a, b) {
  const [pa, pb] = [a.properties, b.properties];
  if (countyOf(pa) !== countyOf(pb)) return false;
  if (pa.postcode && pb.postcode && String(pa.postcode) === String(pb.postcode)) return true;
  const [[lngA, latA], [lngB, latB]] = [a.geometry.coordinates, b.geometry.coordinates];
  return Math.abs(latA - latB) <= SAME_HOUSE_DEGREES && Math.abs(lngA - lngB) <= SAME_HOUSE_DEGREES;
}

/**
 * @param {{ baseUrl?: string, fetch?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Readonly<import('./geocoder.js').Geocoder>}
 */
export function createPhotonGeocoder({
  baseUrl = DEFAULT_BASE_URL,
  fetch = (...args) => globalThis.fetch(...args),
  timeoutMs = TIMEOUT_MS,
} = {}) {
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

  async function search(text, signal) {
    if (signal?.aborted) throw abortError();
    const params = new URLSearchParams({
      q: text,
      limit: String(REQUEST_LIMIT),
      lang: 'en',
      bbox: COUNTY_BBOX.join(','),
      lat: String(BIAS.lat),
      lon: String(BIAS.lon),
    });
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(`${root}/api/?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) {
        throw new GeocoderUnavailableError(`Address search answered HTTP ${response.status}`);
      }
      const body = await response.json();
      if (!Array.isArray(body?.features)) {
        throw new GeocoderUnavailableError('Address search gave an unexpected answer');
      }
      return body.features.filter(isAddress);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error instanceof GeocoderUnavailableError) throw error;
      // Never the original error: its message could carry the request URL.
      throw new GeocoderUnavailableError(
        timedOut ? 'Address search timed out' : 'Address search could not be reached',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return Object.freeze({
    async suggest(text, { signal } = {}) {
      const trimmed = String(text ?? '').trim();
      if (!trimmed) return [];
      const features = await search(trimmed, signal);
      const seen = new Set();
      const suggestions = [];
      for (const feature of features) {
        const place = placeOf(feature);
        if (seen.has(place.label)) continue;
        seen.add(place.label);
        const { osm_type: type, osm_id: id } = feature.properties;
        suggestions.push({
          id: `${type ?? ''}${id ?? ''}-${suggestions.length}`,
          label: place.label,
          place,
        });
        if (suggestions.length === MAX_SUGGESTIONS) break;
      }
      return suggestions;
    },

    async geocode(query, { signal } = {}) {
      if (query && typeof query === 'object' && query.place) {
        if (signal?.aborted) throw abortError();
        return { ...query.place };
      }
      const text = String((typeof query === 'object' ? query?.label : query) ?? '').trim();
      if (!text) return null;
      const features = await search(text, signal);
      const matches = features.filter((f) => matchesTyped(text, f.properties));
      if (!matches.length) return null;
      // Two places fit what was typed, so asking for a ZIP beats guessing.
      if (!matches.every((match) => samePlace(match, matches[0]))) return null;
      return placeOf(matches[0]);
    },
  });
}
