// The app's geocoder: turns typed address text into a place. The landing
// screen knows only this interface, so the provider is chosen here and can be
// swapped by changing this module alone. The provider is Photon
// (src/data/photon.js, issue #7), at VITE_GEOCODER_URL when that is set at
// build time. Address text goes only to the provider: never into the URL,
// storage, logs or analytics.
import { createPhotonGeocoder } from './photon.js';

export { GeocoderUnavailableError } from './geocoderError.js';

/**
 * A suggestion for partly typed text. A provider may add its own fields (for
 * example a magic key) that only its own geocode() reads.
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
export { attribution } from './photon.js';

/**
 * Created once, so it is the same object on every render: a new one each
 * render would restart the suggestion request.
 * @type {Readonly<Geocoder>}
 */
const geocoder = createPhotonGeocoder({ baseUrl: import.meta.env?.VITE_GEOCODER_URL });

export default geocoder;
