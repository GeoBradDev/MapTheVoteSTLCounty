// Its own module so a provider module and src/data/geocoder.js,
// which picks the provider, can both use it without importing each other.

/** The geocoder cannot answer: unreachable, slow, rate limited or broken. */
export class GeocoderUnavailableError extends Error {
  constructor(message = 'Address search is not available') {
    super(message);
    this.name = 'GeocoderUnavailableError';
  }
}
