// A Geocoder (src/data/geocoder.js) backed by Photon, an open-source geocoder
// over OpenStreetMap data, called straight from the browser: no proxy, no
// server of ours, no API key. Address text goes only to Photon, with no
// cookies, no referrer and no browser cache. Photon's public instance asks for
// fair use and promises no availability, so every failure becomes a
// GeocoderUnavailableError and the lookup offers "Use my location" and the
// county's official lookup instead. A match is never stretched into a guess:
// only results with a house number count, and typed text must match that
// number and a word of the street.
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

// Street words that say nothing about which street it is.
const GENERIC = new Set(
  (
    'st street rd road ave av avenue dr drive blvd boulevard ln lane ct court pl place way ' +
    'ter terrace pkwy parkway hwy highway cir circle trl trail sq square n s e w north south ' +
    'east west ne nw se sw saint the of'
  ).split(' '),
);

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

// Lower-case words, with ordinals as bare numbers (63rd -> 63) and "saint" as "st".
function words(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (word === 'saint' ? 'st' : word.replace(/^(\d+)(st|nd|rd|th)$/, '$1')));
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
  if (props.state === 'Missouri' && words(props.city).join(' ') === 'st louis') {
    return 'St. Louis city';
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

// Typed text names a feature when it starts with the feature's house number,
// its street part (before the first comma) has every telling word of the
// feature's street, and a typed ZIP, if any, is the feature's. Only the street
// part counts, so a typed city that shares a word with another street (8025
// Maryland Ave, Clayton vs 8025 Clayton Road) is no match.
function matchesTyped(text, props) {
  const [streetPart] = text.split(',');
  const [number, ...rest] = words(streetPart);
  if (!number || !/^\d/.test(number) || !hasNumber(props.housenumber, number)) return false;
  const zip =
    text.slice(streetPart.length).match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ??
    streetPart.match(/\s(\d{5})(?:-\d{4})?\s*$/)?.[1];
  if (zip && props.postcode && String(props.postcode).slice(0, 5) !== zip) return false;
  const typed = new Set(rest);
  const street = words(props.street);
  const telling = street.filter((w) => !GENERIC.has(w));
  return telling.length ? telling.every((w) => typed.has(w)) : street.some((w) => typed.has(w));
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
      const match = features.find((f) => matchesTyped(text, f.properties));
      return match ? placeOf(match) : null;
    },
  });
}
