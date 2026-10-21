// Typed text must name the result's whole street: same direction, same name,
// same street type. A shorter or differently typed street is no match
// (review finding, issue #7).
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

describe('geocode of typed text needs the whole street', () => {
  it.each([
    ['100 S Lindbergh Blvd', '100', 'Lindbergh Boulevard'],
    ['100 W Argonne Dr', '100', 'East Argonne Drive'],
    ['500 Big Bend Rd', '500', 'Big Bend Boulevard'],
    ['100 Elm St, Ballwin', '100', 'Elm Avenue'],
    ['1 Brentwood Blvd, Clayton', '1', 'South Brentwood Boulevard'],
    ['1000 New Halls Ferry Rd', '1000', 'Halls Ferry Road'],
    ['1000 Old Halls Ferry Rd', '1000', 'Halls Ferry Road'],
    ['8025 Maryland Ave Clayton', '8025', 'Clayton Road'],
    ['8025 Maryland Ave Clayton MO 63105', '8025', 'Clayton Road'],
    ['100 Main St Kirkwood MO', '100', 'Kirkwood Road'],
    ['100 Main St Saint Louis MO', '100', 'Saint Louis Avenue'],
    ['100 Main St Saint Louis MO', '100', 'Louis Street'],
  ])('%s is no match for %s %s', async (text, housenumber, street) => {
    const geocoder = createPhotonGeocoder({ fetch: only({ housenumber, street }) });
    await expect(geocoder.geocode(text)).resolves.toBeNull();
  });

  it.each([
    ['100 S Lindbergh Blvd', 'South Lindbergh Boulevard'],
    ['100 South Lindbergh Boulevard, Saint Louis, MO', 'South Lindbergh Boulevard'],
    ['100 Main St St Louis MO 63122', 'Main Street'],
    ['100 Mt Olive Rd', 'Mount Olive Road'],
    ['100 First St', '1st Street'],
    ['8025 Maryland Ave Apt 2, Clayton', 'Maryland Avenue'],
  ])('%s matches %s', async (text, street) => {
    // A postcode, so a typed ZIP can be confirmed.
    const geocoder = createPhotonGeocoder({
      fetch: only({ housenumber: '100', street, postcode: '63122' }),
    });
    const typed = text.replace(/^\d+/, '100');
    await expect(geocoder.geocode(typed)).resolves.not.toBeNull();
  });
});
