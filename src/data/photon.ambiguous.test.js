// Typed text that two different places both match, or a typed ZIP that a
// result with no town and no postcode cannot confirm, must not resolve to one
// of them by Photon's ranking alone (final review finding, issue #7).
import { createPhotonGeocoder } from './photon.js';

function feature(properties, coordinates) {
  return {
    type: 'Feature',
    properties: { countrycode: 'US', type: 'house', state: 'Missouri', ...properties },
    geometry: { type: 'Point', coordinates },
  };
}

function answer(...features) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ type: 'FeatureCollection', features }),
  });
}

const IN_CITY = feature(
  { housenumber: '100', street: 'Main Street', city: 'Saint Louis' },
  [-90.2, 38.63],
);
const IN_COUNTY = feature(
  { housenumber: '100', street: 'Main Street', city: 'Saint Louis', county: 'Saint Louis County' },
  [-90.45, 38.55],
);
const UNINCORPORATED = feature(
  { housenumber: '100', street: 'Main Street', county: 'Saint Louis County' },
  [-90.5, 38.5],
);

describe('typed text that more than one place matches', () => {
  it.each([
    ['City first', [IN_CITY, IN_COUNTY]],
    ['county first', [IN_COUNTY, IN_CITY]],
    ['two unincorporated houses', [UNINCORPORATED, IN_COUNTY]],
  ])('returns null with %s', async (_, features) => {
    const geocoder = createPhotonGeocoder({ fetch: answer(...features) });
    await expect(geocoder.geocode('100 Main St')).resolves.toBeNull();
  });

  it('still matches one house that Photon lists twice', async () => {
    const node = feature({ ...IN_COUNTY.properties }, [-90.45, 38.55]);
    const building = feature({ ...IN_COUNTY.properties }, [-90.45005, 38.55002]);
    const geocoder = createPhotonGeocoder({ fetch: answer(node, building) });
    await expect(geocoder.geocode('100 Main St')).resolves.toMatchObject({
      county: 'Saint Louis County',
    });
  });

  it('still matches one large site that Photon lists at points far apart', async () => {
    // Live answer for 501 Bowles Ave, MO 63026: a point and a building 150 m apart.
    const point = feature(
      {
        housenumber: '501',
        street: 'Bowles Avenue',
        county: 'Saint Louis County',
        postcode: '63026',
      },
      [-90.4749291, 38.5115544],
    );
    const building = feature({ ...point.properties, city: 'Fenton' }, [-90.4765482, 38.5122107]);
    const geocoder = createPhotonGeocoder({ fetch: answer(point, building) });
    await expect(geocoder.geocode('501 Bowles Ave, MO 63026')).resolves.toMatchObject({
      lat: 38.5115544,
    });
  });

  it('returns null for two houses in different ZIPs when no ZIP is typed', async () => {
    const ballwin = feature({ ...UNINCORPORATED.properties, postcode: '63011' }, [-90.55, 38.59]);
    const fenton = feature({ ...UNINCORPORATED.properties, postcode: '63026' }, [-90.47, 38.51]);
    const geocoder = createPhotonGeocoder({ fetch: answer(ballwin, fenton) });
    await expect(geocoder.geocode('100 Main St')).resolves.toBeNull();
  });

  it('matches the one place the typed ZIP confirms', async () => {
    const city = feature({ ...IN_CITY.properties, postcode: '63102' }, [-90.2, 38.63]);
    const county = feature({ ...IN_COUNTY.properties, postcode: '63122' }, [-90.45, 38.55]);
    const geocoder = createPhotonGeocoder({ fetch: answer(city, county) });
    await expect(geocoder.geocode('100 Main St 63122')).resolves.toMatchObject({
      county: 'Saint Louis County',
    });
  });
});

describe('a typed ZIP against a result with no town', () => {
  it('is no match when the result has no postcode to confirm it', async () => {
    const geocoder = createPhotonGeocoder({ fetch: answer(UNINCORPORATED) });
    await expect(geocoder.geocode('100 Main St, MO 63021')).resolves.toBeNull();
  });

  it('still matches with no ZIP typed', async () => {
    const geocoder = createPhotonGeocoder({ fetch: answer(UNINCORPORATED) });
    await expect(geocoder.geocode('100 Main St')).resolves.not.toBeNull();
  });
});
