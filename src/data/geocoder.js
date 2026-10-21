// The app's geocoder: turns typed address text into a place. The landing
// screen knows only this interface, so the sources are chosen here and can be
// swapped by changing this module alone. Issue #49: St. Louis County's own
// address points first (src/data/countyAddress.js), the live county layer and
// then its hosted copy when the live one is unavailable; Photon
// (src/data/photon.js, issue #7, at VITE_GEOCODER_URL when that is set at
// build time) when the county has no match, as for a St. Louis City address,
// or is unavailable. Address text goes only to those services: never into the
// URL, storage, logs or analytics.
import {
  attribution as countyAttribution,
  createCountyAddressSource,
  HOSTED_TIMEOUT_MS,
  HOSTED_URL,
  LIVE_URL,
} from './countyAddress.js';
import { CITY_COUNTY } from './addressMatch.js';
import { attribution as photonAttribution, createPhotonGeocoder } from './photon.js';

export { GeocoderUnavailableError } from './geocoderError.js';

/**
 * A suggestion for partly typed text. A source may add its own fields that
 * only geocode() reads (both sources add `place`, the geocoded place, so a
 * pick needs no second request).
 * @typedef {object} Suggestion
 * @property {string} id Unique among one suggest() result.
 * @property {string} label What the voter sees.
 */

/**
 * A geocoded address, ready for locate() (#8).
 * @typedef {object} GeocodedPlace
 * @property {number} lat WGS 84 latitude.
 * @property {number} lng WGS 84 longitude.
 * @property {string} [state] The provider's state, as `MO`, `Missouri` or `29`.
 * @property {string} [county] The provider's county name.
 * @property {string} label The matched address, for display only.
 */

/**
 * @typedef {object} Geocoder
 * @property {(text: string, options?: { signal?: AbortSignal }) => Promise<Suggestion[]>} suggest
 *   Up to a few suggestions for partly typed text. Rejects with an AbortError
 *   when the signal aborts.
 * @property {(query: string | Suggestion, options?: { signal?: AbortSignal }) =>
 *   Promise<GeocodedPlace | null>} geocode The best match for typed text or a
 *   suggestion, or null when nothing matches. Rejects when the provider cannot
 *   answer.
 */

/** Who to credit for address search, shown next to the address box. */
export const attribution = Object.freeze({
  county: countyAttribution,
  fallback: photonAttribution,
});

/**
 * How long a county match waits for Photon to say whether St. Louis City has
 * the same address too, before the match stands.
 */
export const CROSS_CHECK_MS = 3000;

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

// A signal that aborts with the caller's signal or after `ms`.
function withTimeout(signal, ms) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, ms);
  return {
    signal: controller.signal,
    done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}

/**
 * The county-first lookup.
 * @param {{
 *   sources: Array<{ find: Function, suggest: Function }>,
 *   fallback: Geocoder & { findPlaces: Function },
 * }} options `sources` are county address sources in order: each later one
 *   is asked only when the one before is unavailable. `fallback` answers when
 *   the county has no match, or no county source is available.
 * @returns {Readonly<Geocoder>}
 */
export function createGeocoder({ sources, fallback }) {
  // The first county answer, skipping sources that are unavailable; null when
  // none is available. An abort always rejects.
  async function firstAnswer(ask, signal) {
    for (const source of sources) {
      try {
        return await ask(source);
      } catch {
        // Unavailable (or broken in some other way): try the next source.
        if (signal?.aborted) throw abortError();
      }
    }
    return null;
  }

  // Whether Photon finds the text in St. Louis City, which the county's
  // address points leave out. Unknown (Photon down or slow) counts as no.
  async function alsoInCity(text, signal) {
    const timeout = withTimeout(signal, CROSS_CHECK_MS);
    try {
      const places = await fallback.findPlaces(text, { signal: timeout.signal });
      return places.some((place) => place.county === CITY_COUNTY);
    } catch {
      if (signal?.aborted) throw abortError();
      return false;
    } finally {
      timeout.done();
    }
  }

  return Object.freeze({
    async suggest(input, { signal } = {}) {
      const text = String(input ?? '').trim();
      if (!text) return [];
      const county = await firstAnswer((source) => source.suggest(text, { signal }), signal);
      if (signal?.aborted) throw abortError();
      if (county?.length) return county;
      try {
        return await fallback.suggest(text, { signal });
      } catch (error) {
        if (signal?.aborted) throw abortError();
        // The county answered (with none), so there is simply nothing to show.
        if (county) return [];
        throw error;
      }
    },

    async geocode(query, { signal } = {}) {
      if (query && typeof query === 'object' && query.place) {
        if (signal?.aborted) throw abortError();
        return { ...query.place };
      }
      const text = String((typeof query === 'object' ? query?.label : query) ?? '').trim();
      if (!text) return null;
      const county = await firstAnswer((source) => source.find(text, { signal }), signal);
      if (signal?.aborted) throw abortError();
      // The official data has two addresses that fit: ask for a ZIP.
      if (county?.status === 'ambiguous') return null;
      if (county?.status === 'match') {
        if (!county.confirmed && (await alsoInCity(text, signal))) return null;
        return county.place;
      }
      try {
        return await fallback.geocode(text, { signal });
      } catch (error) {
        if (signal?.aborted) throw abortError();
        // The county answered no match; with Photon down, that is the answer.
        if (county) return null;
        throw error;
      }
    },
  });
}

/**
 * Created once, so it is the same object on every render: a new one each
 * render would restart the suggestion request.
 * @type {Readonly<Geocoder>}
 */
const geocoder = createGeocoder({
  sources: [
    createCountyAddressSource({ url: LIVE_URL }),
    createCountyAddressSource({ url: HOSTED_URL, timeoutMs: HOSTED_TIMEOUT_MS }),
  ],
  fallback: createPhotonGeocoder({ baseUrl: import.meta.env?.VITE_GEOCODER_URL }),
});

export default geocoder;
