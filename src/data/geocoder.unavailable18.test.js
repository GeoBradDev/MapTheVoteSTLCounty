// Issue #18: with `reportUnavailable`, a lookup that is "no match" only because
// a step failed (the City check, or Photon after a county no match) rejects as
// unavailable, so the voter is told to try again instead of that the address
// does not exist. It never turns a failure into a county place (#58).
import { createGeocoder, GeocoderUnavailableError } from './geocoder.js';

const ROSS = Object.freeze({
  lat: 38.6822,
  lng: -90.4581,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '1318 Ross Ave, Saint Louis, MO 63146',
});
const CITY = Object.freeze({
  ...ROSS,
  lat: 38.62,
  lng: -90.2,
  county: 'St. Louis city',
  label: '1318 Ross Ave, Saint Louis, MO 63110',
});

const unavailable = () => Promise.reject(new GeocoderUnavailableError('down'));
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

function chain({ county, fallback, city } = {}) {
  const source = { find: vi.fn(county ?? (async () => ({ status: 'none' }))), suggest: vi.fn() };
  return createGeocoder({
    sources: [source],
    fallback: { geocode: vi.fn(fallback ?? (async () => null)), suggest: vi.fn() },
    cityCheck: { find: vi.fn(city ?? (async () => ({ status: 'none' }))) },
  });
}

const countyMatch = async () => ({ status: 'match', place: ROSS, confirmed: true });
const strict = { reportUnavailable: true };

describe('geocode with reportUnavailable (#18)', () => {
  it('rejects as unavailable, never the county place, when the City check fails', async () => {
    const geocoder = chain({ county: countyMatch, city: unavailable });
    await expect(geocoder.geocode('1318 Ross Ave', strict)).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
  });

  it('rejects as unavailable when the City check gives an unexpected answer', async () => {
    const geocoder = chain({ county: countyMatch, city: async () => undefined });
    await expect(geocoder.geocode('1318 Ross Ave', strict)).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
  });

  it('rejects as unavailable when the City check fails on a Photon answer', async () => {
    const geocoder = chain({ fallback: async () => ROSS, city: unavailable });
    await expect(geocoder.geocode('1318 Ross Ave', strict)).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
  });

  it('rejects as unavailable when the county has no match and Photon is down', async () => {
    const geocoder = chain({ fallback: unavailable });
    await expect(geocoder.geocode('1 Nowhere Ln', strict)).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
  });

  it('keeps a real no match as null', async () => {
    await expect(chain().geocode('1 Nowhere Ln', strict)).resolves.toBeNull();
    const twoFit = chain({ county: async () => ({ status: 'ambiguous' }) });
    await expect(twoFit.geocode('100 Main St', strict)).resolves.toBeNull();
    const cityUnsure = chain({ county: countyMatch, city: async () => ({ status: 'ambiguous' }) });
    await expect(cityUnsure.geocode('1318 Ross Ave', strict)).resolves.toBeNull();
    const sameZip = chain({
      county: countyMatch,
      city: async () => ({ status: 'city', place: { ...CITY, label: ROSS.label } }),
    });
    await expect(sameZip.geocode('1318 Ross Ave', strict)).resolves.toBeNull();
  });

  it('still answers the City place or the county place when every step answers', async () => {
    const city = chain({
      county: countyMatch,
      city: async () => ({ status: 'city', place: CITY }),
    });
    await expect(city.geocode('1318 Ross Ave', strict)).resolves.toEqual(CITY);
    await expect(chain({ county: countyMatch }).geocode('1318 Ross Ave', strict)).resolves.toEqual(
      ROSS,
    );
  });

  it('rejects with AbortError, not unavailable, when aborted during the City check', async () => {
    const controller = new AbortController();
    const geocoder = chain({
      county: countyMatch,
      city: (_text, _street, { signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(abortError()))),
    });
    const answer = geocoder.geocode('1318 Ross Ave', { ...strict, signal: controller.signal });
    controller.abort();
    await expect(answer).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('without the option, keeps answering no match as before (#58)', async () => {
    await expect(
      chain({ county: countyMatch, city: unavailable }).geocode('1318 Ross Ave'),
    ).resolves.toBeNull();
    await expect(chain({ fallback: unavailable }).geocode('1 Nowhere Ln')).resolves.toBeNull();
  });
});
