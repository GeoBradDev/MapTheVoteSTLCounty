// A unit word only names a unit when a unit number follows it, so a town such
// as Ste. Genevieve is still compared, and "St. Louis City" is not a county
// result (review finding, issue #7).
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

const CITY = { housenumber: '100', street: 'Main Street', city: 'Saint Louis' };
const NO_TOWN = { housenumber: '100', street: 'Main Street', county: 'Saint Louis County' };
const BALLWIN = { housenumber: '100', street: 'Main Street', city: 'Ballwin', postcode: '63011' };

describe('unit words and town names', () => {
  it.each([
    ['100 Main St Ste. Genevieve', CITY],
    ['100 Main St, Ste Genevieve, MO', CITY],
    ['100 Main St, St. Louis City', NO_TOWN],
  ])('%s is no match for %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.toBeNull();
  });

  it.each([
    ['100 Main St Ste 2 Ballwin', BALLWIN],
    ['100 Main St, Unit 2-B, Ballwin', BALLWIN],
    ['100 Main St, Ballwin, MO 63011, United States', BALLWIN],
    ['100 Main St, St. Louis City', CITY],
  ])('%s matches %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.not.toBeNull();
  });
});
