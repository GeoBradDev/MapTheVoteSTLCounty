// A town typed with no comma, or a ZIP the result cannot confirm, must not
// land the address in St. Louis City (review finding, issue #7).
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

const CITY = { housenumber: '300', street: 'North Taylor Avenue', city: 'Saint Louis' };
const KIRKWOOD = { housenumber: '300', street: 'North Taylor Avenue', city: 'Kirkwood' };

describe('typed town and ZIP against a St. Louis City result', () => {
  it.each([
    ['300 N Taylor Ave Kirkwood', { ...CITY, postcode: '63108' }],
    ['300 N Taylor Ave Kirkwood MO', { ...CITY, postcode: '63108' }],
    ['300 N Taylor Ave Webster Groves', CITY],
    ['300 N Taylor Ave, MO 63122', CITY],
    ['300 N Taylor Ave 63122', CITY],
  ])('%s is no match for %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.toBeNull();
  });

  it.each([
    ['300 N Taylor Ave Kirkwood MO', KIRKWOOD],
    ['300 N Taylor Ave, Apt 2, Kirkwood', KIRKWOOD],
    ['300 N Taylor Ave Saint Louis MO 63108', { ...CITY, postcode: '63108' }],
    ['300 N Taylor Ave, St. Louis', CITY],
  ])('%s matches %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.not.toBeNull();
  });
});
