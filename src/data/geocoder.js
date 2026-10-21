// The app's geocoder: turns typed address text into a place. The landing
// screen knows only this interface, so the provider (#7) can be chosen or
// swapped by changing this module alone. Address text goes only to the
// provider: never into the URL, storage, logs or analytics.

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

/** No geocoder is configured, or the configured one cannot be reached. */
export class GeocoderUnavailableError extends Error {
  constructor(message = 'Address search is not available') {
    super(message);
    this.name = 'GeocoderUnavailableError';
  }
}

/**
 * Stands in until a provider is chosen (#7): it suggests nothing and cannot
 * geocode, so the landing screen offers "Use my location" and the county's
 * official lookup instead.
 * @type {Geocoder}
 */
const unconfigured = Object.freeze({
  async suggest() {
    return [];
  },
  async geocode() {
    throw new GeocoderUnavailableError();
  },
});

export default unconfigured;
