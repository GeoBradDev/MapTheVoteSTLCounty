// The City check (issue #58): asks the City of St. Louis's own geocoder
// whether St. Louis City has the address the lookup found in the county. The
// county's address points leave out almost every City address and
// OpenStreetMap misses many City house numbers, so without this a City voter
// whose house number and street also exist in the county could get a county
// precinct. Called straight from the browser: no proxy, no server of ours, no
// key. Only the house number and street go, in a POST body (never a URL), with
// no cookies, no referrer and no browser cache. Every failure becomes a
// GeocoderUnavailableError; src/data/geocoder.js then answers no match (or,
// with reportUnavailable, rejects as unavailable, #18), never the county place.
import { CITY_COUNTY, labelOf, matchesStreet, typedZip, UNIT } from './addressMatch.js';
import { GeocoderUnavailableError } from './geocoderError.js';

/** The City of St. Louis's composite geocoder (parcels, then streets). */
export const CITY_GEOCODER_URL =
  'https://maps6.stlouis-mo.gov/arcgis/rest/services/GEOCODERS/COMPOSITE_GEOCODE/GeocodeServer';

/** Who runs the City check, credited next to the address box. */
export const attribution = Object.freeze({
  by: 'City of St. Louis',
  service: 'address search',
});

/**
 * How long the City check may take; longer is no match, or with
 * reportUnavailable an unavailable search (#18). Never the county place.
 */
export const TIMEOUT_MS = 4000;

/**
 * ZIPs entirely outside St. Louis City: every Census 2020 ZIP Code Tabulation
 * Area that touches St. Louis County and does not come within 500 m of the
 * City (TIGERweb, 2026-10-21; docs/data.md, City check). Text with one of
 * these ZIPs cannot be a City address, so it skips the check. Any other ZIP,
 * one that crosses the City line (63133, 63130, 63136, 63120, 63147 ...) or one
 * not listed, gets the check.
 */
export const COUNTY_ONLY_ZIPS = Object.freeze(
  new Set(
    (
      '63005 63010 63011 63017 63021 63025 63026 63031 63033 63034 63038 63040 63042 ' +
      '63043 63044 63045 63049 63069 63073 63074 63088 63114 63122 63124 63126 63127 ' +
      '63128 63129 63131 63132 63134 63135 63140 63141 63144 63146 63301 63303 63304 63386'
    ).split(' '),
  ),
);

/**
 * Whether typed text needs the City check: unless it holds a ZIP that is
 * entirely outside the City. A typed town does not skip it.
 * @param {string} text
 */
export function needsCityCheck(text) {
  const zip = typedZip(String(text ?? ''));
  return !zip || !COUNTY_ONLY_ZIPS.has(zip);
}

/**
 * The house number and street of a place's label, without its town, ZIP or
 * unit: what the City geocoder is asked for. "6135 Washington Ave Apt 2,
 * Saint Louis, MO 63134" gives "6135 Washington Ave".
 * @param {string} label
 */
export function streetOf(label) {
  const parts = String(label ?? '')
    .split(',')[0]
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const unitAt = parts.findIndex(
    (part, i) => i > 1 && (UNIT.has(part.toLowerCase()) || part.startsWith('#')),
  );
  return (unitAt === -1 ? parts : parts.slice(0, unitAt)).join(' ');
}

const OUT_FIELDS = 'Addr_type,AddNum,StPreDir,StPreType,StName,StType,StDir,ZIP';
// Enough for every spelling the geocoder offers for one number and street.
const MAX_LOCATIONS = '20';

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function titleCase(value) {
  return text(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (/^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// A City parcel address from one candidate: an exact PointAddress (a parcel),
// never a StreetAddress, which only says a street's number range covers it.
function cityAddressOf(candidate) {
  const a = candidate?.attributes;
  const { x, y } = candidate?.location ?? {};
  if (!a || a.Addr_type !== 'PointAddress' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const number = text(a.AddNum);
  if (!/^\d+$/.test(number) || !text(a.StName)) return null;
  const direction = text(a.StPreDir).toUpperCase();
  const rest = [titleCase(a.StPreType), titleCase(a.StName), titleCase(a.StType)];
  const suffix = text(a.StDir).toUpperCase();
  const street = [direction, ...rest, suffix].filter(Boolean).join(' ');
  const props = {
    housenumber: number,
    street,
    postcode: text(a.ZIP) || undefined,
    city: 'St. Louis',
    state: 'Missouri',
    county: CITY_COUNTY,
  };
  const bare = [...rest, suffix].filter(Boolean).join(' ');
  return { props, direction, bare, lat: y, lng: x };
}

/**
 * @typedef {{ status: 'city', place: import('./geocoder.js').GeocodedPlace }
 *   | { status: 'none' } | { status: 'ambiguous' }} CityResult
 */

/**
 * @param {{ url?: string, fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createCityAddressCheck({
  url = CITY_GEOCODER_URL,
  fetch = (...args) => globalThis.fetch(...args),
  timeoutMs = TIMEOUT_MS,
} = {}) {
  const findUrl = `${url.replace(/\/+$/, '')}/findAddressCandidates`;

  async function candidates(street, signal) {
    if (signal?.aborted) throw abortError();
    const body = new URLSearchParams({
      SingleLine: street,
      outFields: OUT_FIELDS,
      maxLocations: MAX_LOCATIONS,
      outSR: '4326',
      f: 'json',
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
      const response = await fetch(findUrl, {
        method: 'POST',
        body,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) {
        throw new GeocoderUnavailableError(`City addresses answered HTTP ${response.status}`);
      }
      const json = await response.json();
      if (json?.error || !Array.isArray(json?.candidates)) {
        throw new GeocoderUnavailableError('City addresses gave an unexpected answer');
      }
      return json.candidates;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error instanceof GeocoderUnavailableError) throw error;
      // Never the original error: its message could carry the address.
      throw new GeocoderUnavailableError(
        timedOut ? 'City addresses timed out' : 'City addresses could not be reached',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return Object.freeze({
    /**
     * Whether St. Louis City has the address the typed text names.
     * - `city`: a City parcel has the typed house number and whole street
     *   (strict rules) and, when a ZIP is typed, that ZIP. Its place.
     * - `ambiguous`: a City parcel the text could mean, but not by the strict
     *   rules (its street has a direction the text left out).
     * - `none`: no City parcel fits.
     * Rejects with a GeocoderUnavailableError when the City cannot answer.
     * @param {string} typed The text the voter typed or picked.
     * @param {string} street The house number and street to ask for
     *   (streetOf the found place's label).
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<CityResult>}
     */
    async find(typed, street, { signal } = {}) {
      const input = String(typed ?? '').trim();
      const query = String(street ?? '').trim();
      if (!input || !query) {
        if (signal?.aborted) throw abortError();
        return { status: 'none' };
      }
      const found = (await candidates(query, signal)).map(cityAddressOf).filter(Boolean);
      const zip = typedZip(input);
      // A typed ZIP rules out a City parcel in another ZIP; a parcel with no
      // ZIP cannot be ruled out.
      const inZip = found.filter((c) => !zip || !c.props.postcode || c.props.postcode === zip);
      const exact = inZip.find((c) => matchesStreet(input, c.props));
      if (exact) {
        const { props, lat, lng } = exact;
        return {
          status: 'city',
          place: { lat, lng, state: props.state, county: props.county, label: labelOf(props) },
        };
      }
      const loose = inZip.some(
        (c) => c.direction && matchesStreet(input, { ...c.props, street: c.bare }),
      );
      return loose ? { status: 'ambiguous' } : { status: 'none' };
    },
  });
}
