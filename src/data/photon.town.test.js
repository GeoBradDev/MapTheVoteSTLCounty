// Typed text must not land in another town: a typed town or ZIP must agree
// with the result, and a result in a named town other than St. Louis needs
// that town or its ZIP typed (review finding, issue #7).
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

const TAYLOR = {
  housenumber: '300',
  street: 'North Taylor Avenue',
  city: 'Kirkwood',
  postcode: '63122',
};
const ELM = { housenumber: '100', street: 'Elm Avenue', city: 'Webster Groves', postcode: '63119' };

describe('geocode of typed text stays in the typed town', () => {
  it.each([
    ['300 N Taylor Ave, St. Louis, MO', TAYLOR],
    ['300 N Taylor Ave', TAYLOR],
    ['100 Elm Ave, Ballwin', ELM],
    ['100 Elm Ave, Kirkwood, MO 63122', { ...ELM, postcode: undefined }],
    [
      '100 Main St 63122 Kirkwood',
      { housenumber: '100', street: 'Main Street', postcode: '63021' },
    ],
    ['100 Elm St Louis MO', { housenumber: '100', street: 'Elm Street' }],
    ['100 Elm Saint Louis', { housenumber: '100', street: 'Elm Street' }],
  ])('%s is no match for %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.toBeNull();
  });

  it.each([
    ['300 N Taylor Ave, Kirkwood', TAYLOR],
    ['300 N Taylor Ave 63122', TAYLOR],
    ['300 North Taylor Avenue, Kirkwood, MO 63122', TAYLOR],
    ['100 Elm Ave, Webster Groves, MO', ELM],
  ])('%s matches %o', async (text, properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    await expect(geocoder.geocode(text)).resolves.not.toBeNull();
  });

  it.each([
    { housenumber: '12;14', street: 'Main Street', city: 'Kirkwood', postcode: '63122' },
    { housenumber: '1200-1206', street: 'Main Street', city: 'Kirkwood', postcode: '63122' },
  ])('matches its own suggestion label typed back for %o', async (properties) => {
    const geocoder = createPhotonGeocoder({ fetch: only(properties) });
    const [suggestion] = await geocoder.suggest('Main');
    await expect(geocoder.geocode(suggestion.label)).resolves.not.toBeNull();
  });
});
