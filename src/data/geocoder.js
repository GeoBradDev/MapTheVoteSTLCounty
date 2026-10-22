// The app's geocoder: turns typed address text into a place. The landing
// screen knows only this interface, so the sources are chosen here and can be
// swapped by changing this module alone. Issue #49: St. Louis County's own
// address points first (src/data/countyAddress.js), the live county layer and
// then its hosted copy when the live one is unavailable; Photon
// (src/data/photon.js, issue #7, at VITE_GEOCODER_URL when that is set at
// build time) when the county has no match, as for a St. Louis City address,
// or is unavailable. Issue #58: every answer outside St. Louis City is checked
// against the City of St. Louis's own geocoder (src/data/cityAddress.js)
// unless the text holds a ZIP entirely outside the City, so a City voter whose
// address also exists in the county never gets a county precinct. Issue #88:
// the same City geocoder is an address source too, asked after a county no
// match and before Photon, and its parcels are suggested next to the county's,
// so a City address opens its City precinct. Address text goes only to those services: never into the URL, storage, logs or
// analytics.
import {
  attribution as countyAttribution,
  createCountyAddressSource,
  HOSTED_TIMEOUT_MS,
  HOSTED_URL,
  LIVE_URL,
} from './countyAddress.js';
import { CITY_COUNTY, typedZip, words } from './addressMatch.js';
import {
  attribution as cityAttribution,
  createCityAddressCheck,
  needsCityCheck,
  streetOf,
} from './cityAddress.js';
import { attribution as photonAttribution, createPhotonGeocoder } from './photon.js';

import { GeocoderUnavailableError } from './geocoderError.js';

export { GeocoderUnavailableError };

/**
 * A suggestion for partly typed text. A source may add its own fields
 * (Photon's add `place`), but the app geocoder geocodes a pick again by its
 * label, so the county's rules apply to every pick.
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
 * @property {(query: string | Suggestion, options?: {
 *   signal?: AbortSignal, reportUnavailable?: boolean }) =>
 *   Promise<GeocodedPlace | null>} geocode The best match for typed text or a
 *   suggestion, or null when nothing matches. Rejects when the provider cannot
 *   answer. With `reportUnavailable` (#18), a null that only a failed step
 *   caused rejects with a GeocoderUnavailableError instead, so the voter
 *   hears "try again", not "no such address": the City check failing, the
 *   county's precinct check failing (find() answers `unavailable`), the
 *   fallback down after a county no match, no county source answering and
 *   the fallback finding nothing, or the City source failing and the
 *   fallback finding nothing. It never turns a failure into a place.
 */

/** Who to credit for address search, shown next to the address box. */
export const attribution = Object.freeze({
  county: countyAttribution,
  fallback: photonAttribution,
  city: cityAttribution,
});

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

// The names a provider gives St. Louis County, in words() form. A place a
// provider puts in another county gets no county precinct, so it needs no
// City check.
const ST_LOUIS_COUNTY = new Set(['st louis county', 'st louis']);

// A picked suggestion's label without its ZIPs, as the City check sees it:
// the ZIP in a county label is the county record's own, not one the voter
// typed, so it must neither skip the check nor rule out a City parcel in
// another ZIP (6135 Washington Ave 63134 in the county, 63112 in the City).
function withoutZip(label) {
  return label.replace(
    /^(\s*\S+)(.*)$/,
    (_, first, rest) => first + rest.replace(/\b\d{5}(?:-\d{4})?\b/g, ' '),
  );
}

// Whether a place could get a county precinct: not the City, and not named
// as another county by its provider.
function couldBeCounty(place) {
  if (place.county === CITY_COUNTY) return false;
  const county = words(place.county).join(' ');
  return !county || ST_LOUIS_COUNTY.has(county);
}

/**
 * The county-first lookup.
 * @param {{
 *   sources: Array<{ find: Function, suggest: Function }>,
 *   fallback: Geocoder,
 *   cityCheck: { find: Function, lookup?: Function, suggest?: Function },
 * }} options `sources` are county address sources in order: each later one
 *   is asked only when the one before is unavailable. `fallback` answers when
 *   the county has no match, or no county source is available. `cityCheck`
 *   (createCityAddressCheck in src/data/cityAddress.js) says whether St. Louis
 *   City has the address too; it is required, since without it a City voter
 *   could get a county precinct. Its `lookup` and `suggest`, when given,
 *   make the City an address source as well (#88).
 * @returns {Readonly<Geocoder>}
 */
export function createGeocoder({ sources, fallback, cityCheck }) {
  if (typeof cityCheck?.find !== 'function') {
    throw new TypeError('createGeocoder needs a cityCheck');
  }

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

  // The place itself, or what St. Louis City has at the same address. The
  // county's address points leave out almost every City address, and Photon
  // misses many, so an answer that could get a county precinct is checked
  // with the City's own geocoder, unless the text holds a ZIP entirely
  // outside the City. A City address that fits is the answer (its City
  // precinct, #88; the City referral before), unless it is in the same ZIP as the place found; that, one
  // the text could mean but not exactly, is no match; a City geocoder that
  // fails or is slow is no match too, or with reportUnavailable a
  // GeocoderUnavailableError (#18). Never the county place then.
  async function checkedForCity(text, place, signal, reportUnavailable) {
    // What a failed or unreadable City check answers: no match, or with
    // reportUnavailable a rejection. Never the county place.
    const failed = () => {
      if (reportUnavailable) throw new GeocoderUnavailableError('The City check did not answer');
      return null;
    };
    if (!place || !couldBeCounty(place) || !needsCityCheck(text)) return place;
    try {
      const city = await cityCheck.find(text, streetOf(place.label), { signal });
      if (signal?.aborted) throw abortError();
      if (city?.status === 'city') {
        // The county (or Photon) and the City both list this number and
        // street in one ZIP: the lookup cannot tell which the voter means, so
        // no match (owner decision, #58), never the county precinct.
        const zip = typedZip(place.label ?? '');
        return zip && zip === typedZip(city.place?.label ?? '') ? null : city.place;
      }
      if (city?.status === 'none') return place;
      if (city?.status === 'ambiguous') return null;
      return failed();
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error instanceof GeocoderUnavailableError && reportUnavailable) throw error;
      return failed();
    }
  }

  return Object.freeze({
    async suggest(input, { signal } = {}) {
      const text = String(input ?? '').trim();
      if (!text) return [];
      // The City's parcels (#88) are asked alongside the county; a City
      // request that fails just adds none.
      // Its answer is dropped while no county source answers: a picked City
      // label could not then be found again (the City is asked as a source
      // only after a county no match). The request starts alongside the
      // county's, so suggestions do not wait for one after the other.
      const cityAsk =
        typeof cityCheck.suggest === 'function'
          ? cityCheck.suggest(text, { signal }).catch(() => [])
          : Promise.resolve([]);
      const county = await firstAnswer((source) => source.suggest(text, { signal }), signal);
      const city = county ? await cityAsk : [];
      if (signal?.aborted) throw abortError();
      const official = [
        ...(county ?? []),
        ...city.filter((c) => !county?.some((s) => s.label === c.label)),
      ];
      if (official.length) return official;
      try {
        return await fallback.suggest(text, { signal });
      } catch (error) {
        if (signal?.aborted) throw abortError();
        // The county answered (with none), so there is simply nothing to show.
        if (county) return [];
        throw error;
      }
    },

    async geocode(query, { signal, reportUnavailable = false } = {}) {
      // A picked suggestion is geocoded again by its label, county first, so
      // every rule applies to it as to typed text; a Photon suggestion's own
      // place could be one house of two the county knows.
      const picked = typeof query === 'object';
      const text = String((picked ? query?.label : query) ?? '').trim();
      if (!text) return null;
      // What the voter typed, for the City check.
      const typed = picked ? withoutZip(text) : text;
      // The option goes to a source only when set, as it changes what find()
      // may answer.
      const findOptions = reportUnavailable ? { signal, reportUnavailable } : { signal };
      const county = await firstAnswer((source) => source.find(text, findOptions), signal);
      if (signal?.aborted) throw abortError();
      // The official data has two addresses that fit: ask for a ZIP.
      if (county?.status === 'ambiguous') return null;
      // The county has the address but could not check which precinct its
      // records are in (#18): no place, and no other source.
      if (county?.status === 'unavailable') {
        if (!reportUnavailable) return null;
        throw new GeocoderUnavailableError('The county precinct check did not answer');
      }
      // A county record in the City is a City place: locate() asks the City's
      // precinct layer for it (#88).
      if (county?.status === 'match') {
        return checkedForCity(typed, county.place, signal, reportUnavailable);
      }
      // The county answered no match: the City's own geocoder is asked next
      // (#88), ahead of Photon, which misses many City house numbers. Not
      // when no county source answered: the county could have the address
      // in the same ZIP (#58). A City geocoder that fails leaves Photon,
      // whose county answer still needs the City check.
      let cityFailed = false;
      if (county && typeof cityCheck.lookup === 'function' && needsCityCheck(typed)) {
        try {
          const city = await cityCheck.lookup(text, { signal });
          if (signal?.aborted) throw abortError();
          if (city?.status === 'city') return city.place;
          if (city?.status === 'ambiguous') return null;
        } catch {
          if (signal?.aborted) throw abortError();
          cityFailed = true;
        }
      }
      let place;
      try {
        place = await fallback.geocode(text, { signal });
      } catch (error) {
        if (signal?.aborted) throw abortError();
        // The county answered no match; with Photon down, that is the answer,
        // unless the caller wants to know the search could not finish.
        if (county && !reportUnavailable) return null;
        throw error;
      }
      if (signal?.aborted) throw abortError();
      // No county source answered and Photon has nothing: the official list
      // was never asked, so the search could not finish.
      if (!place && !county && reportUnavailable) {
        throw new GeocoderUnavailableError('No county source answered');
      }
      // Nothing found, and the City, which has many addresses Photon lacks,
      // could not answer: the search could not finish.
      if (!place && cityFailed && reportUnavailable) {
        throw new GeocoderUnavailableError('The City did not answer');
      }
      return checkedForCity(typed, place, signal, reportUnavailable);
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
  cityCheck: createCityAddressCheck(),
});

export default geocoder;
