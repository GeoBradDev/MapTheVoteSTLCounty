// A direction in a typed town is part of the town ("East St. Louis" is not
// St. Louis), and "St. Louis City" needs a result in the City, not just a
// Saint Louis mailing city (review finding, issue #7).
import { createPhotonGeocoder } from './photon.js';

function only(properties) {
  const feature = {
    type: 'Feature',
    properties: { countrycode: 'US', type: 'house', state: 'Missouri', ...properties },
    geometry: { type: 'Point', coordinates: [-90.25, 38.64] },
  };
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ type: 'FeatureCollection', features: [feature] }),
  });
}

const CITY = { housenumber: '1500', street: 'Missouri Avenue', city: 'Saint Louis' };
const KIRKWOOD = { housenumber: '1500', street: 'Missouri Avenue', city: 'Kirkwood' };

describe('directions in typed towns', () => {
  it.each([
    ['1500 Missouri Ave, East St. Louis', CITY],
    ['1500 Missouri Ave, North St. Louis', CITY],
    ['1500 Missouri Ave, W Kirkwood', KIRKWOOD],
    ['1500 Missouri Ave, St. Louis City', { ...CITY, county: 'Saint Louis County' }],
  ])('%s is no match for %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.toBeNull();
  });
});
