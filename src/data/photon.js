// A Geocoder (src/data/geocoder.js) backed by Photon, an open-source geocoder
// over OpenStreetMap data, called straight from the browser: no proxy, no
// server of ours, no API key. src/data/geocoder.js asks it after the county's
// address points (issue #49). Requests carry no cookies, no referrer and no
// browser cache. Photon's public instance asks for
// fair use and promises no availability, so every failure becomes a
// GeocoderUnavailableError and the lookup offers "Use my location" and the
// county's official lookup instead. A match is never stretched into a guess:
// only results with a house number count, and typed text must name that
// number and the whole street (direction, name and type).
import { countyOf, labelOf, matchesTyped } from './addressMatch.js';
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

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
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

/** @returns {import('./geocoder.js').GeocodedPlace} */
function placeOf(feature) {
  const { properties: props, geometry } = feature;
  const [lng, lat] = geometry.coordinates;
  return { lat, lng, state: props.state, county: countyOf(props), label: labelOf(props) };
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

  async function findMatches(text, signal) {
    const features = await search(text, signal);
    return features.filter((f) => matchesTyped(text, f.properties));
  }

  return Object.freeze({
    /**
     * Every place that fits the text under the strict rules, in Photon's
     * order. Not part of the Geocoder interface: the county-first lookup in
     * src/data/geocoder.js uses it to see whether St. Louis City, which the
     * county's address points leave out, also has the typed address.
     * @param {string} text
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<import('./geocoder.js').GeocodedPlace[]>}
     */
    async findPlaces(text, { signal } = {}) {
      const trimmed = String(text ?? '').trim();
      if (!trimmed) return [];
      return (await findMatches(trimmed, signal)).map(placeOf);
    },

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
      const matches = await findMatches(text, signal);
      if (!matches.length) return null;
      // Two places fit what was typed, so asking for a ZIP beats guessing.
      if (!matches.every((match) => samePlace(match, matches[0]))) return null;
      return placeOf(matches[0]);
    },
  });
}
