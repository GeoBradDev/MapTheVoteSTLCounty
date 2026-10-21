// Its own module so a provider module and src/data/geocoder.js,
// which picks the provider, can both use it without importing each other.

/** No geocoder is configured, or the configured one cannot be reached. */
export class GeocoderUnavailableError extends Error {
  constructor(message = 'Address search is not available') {
    super(message);
    this.name = 'GeocoderUnavailableError';
  }
}
