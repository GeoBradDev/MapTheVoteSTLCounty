// Typed text must name the result's own street and ZIP, never only a word that
// happens to be the typed city (review finding, issue #7).
import { createPhotonGeocoder } from './photon.js';

function only(properties) {
  const feature = {
    type: 'Feature',
    properties: { countrycode: 'US', type: 'house', state: 'Missouri', ...properties },
    geometry: { type: 'Point', coordinates: [-90.33, 38.64] },
  };
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ type: 'FeatureCollection', features: [feature] }),
  });
}

describe('geocode of typed text never takes another street', () => {
  it.each([
    [
      '8025 Maryland Ave, Clayton, MO 63105',
      { housenumber: '8025', street: 'Clayton Road', postcode: '63117' },
    ],
    [
      '1417 Galleria Pkwy, Saint Louis, MO 63117',
      { housenumber: '1417', street: 'Saint Louis Avenue', postcode: '63117' },
    ],
    ['12 Manchester Rd, Ballwin', { housenumber: '12', street: 'Ballwin Commons Circle' }],
    ['12 Manchester Rd Ballwin', { housenumber: '12', street: 'Ballwin Commons Circle' }],
    [
      '100 Main St, Kirkwood, MO 63122',
      { housenumber: '100', street: 'Main Street', postcode: '63021' },
    ],
  ])('%s is no match for %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.toBeNull();
  });

  it('still matches the same street and ZIP', async () => {
    const geocoder = createPhotonGeocoder({
      fetch: only({ housenumber: '100', street: 'Main Street', postcode: '63122' }),
    });
    await expect(geocoder.geocode('100 Main St, Kirkwood, MO 63122')).resolves.not.toBeNull();
  });
});

describe('St. Louis City spelled St. Louis', () => {
  it('is still named as St. Louis city', async () => {
    const geocoder = createPhotonGeocoder({
      fetch: only({ housenumber: '1200', street: 'Market Street', city: 'St. Louis' }),
    });
    await expect(geocoder.geocode('1200 Market St')).resolves.toMatchObject({
      county: 'St. Louis city',
    });
  });
});
