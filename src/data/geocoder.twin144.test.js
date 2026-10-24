// Issue #144, item 3: the twin check for a City place asks the county by the
// City's own street. The City answers `city` only when the typed street is
// the parcel's whole street, direction included, so that street is the one
// the voter typed. A county record of the same name with no direction is not
// what that street names under the county's strict rules (its find answers
// `none`), so it is not a twin; a county record with a direction the City
// street lacks could be what the voter meant, so it is.
import { createCountyAddressSource, LIVE_URL } from './countyAddress.js';
import { createGeocoder } from './geocoder.js';

function record(attributes) {
  return {
    attributes: {
      OBJECTID: 1,
      ADRNO: 6135,
      ADRDIR: '',
      ADRSTR: 'FOO',
      ADRSUF: 'ST',
      UNITDESC: '',
      UNITNO: '',
      MAILINGCITY: 'SAINT LOUIS',
      ZIPCODE: '63121',
      FULL_ADDRESS: '6135 FOO ST',
      STATUS: 'Current',
      MUNI: 'UNI',
      ...attributes,
    },
    geometry: { x: -90.29, y: 38.7 },
  };
}

function setup({ countyRecord, cityLabel }) {
  const fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ features: [countyRecord] }),
  }));
  const county = createCountyAddressSource({
    url: LIVE_URL,
    fetch,
    precinctsAt: async () => new Set(['P1']),
  });
  const source = { find: vi.fn(county.find), suggest: vi.fn(county.suggest) };
  const cityPlace = {
    lat: 38.68,
    lng: -90.24,
    state: 'Missouri',
    county: 'St. Louis city',
    label: cityLabel,
  };
  const cityCheck = {
    find: async () => ({ status: 'none' }),
    lookup: async () => ({ status: 'city', place: cityPlace }),
    suggest: async () => [],
  };
  const fallback = { geocode: async () => null, suggest: async () => [] };
  const geocoder = createGeocoder({ sources: [source], fallback, cityCheck });
  return { geocoder, source, cityPlace };
}

describe('the twin check by the City street (#144)', () => {
  it('a county street with no direction is not a twin of a City street with one', async () => {
    const { geocoder, source, cityPlace } = setup({
      countyRecord: record({}),
      cityLabel: '6135 N Foo St, St. Louis City, MO 63115',
    });
    await expect(geocoder.geocode('6135 N Foo St, St. Louis City')).resolves.toEqual(cityPlace);
    expect(source.find).toHaveBeenLastCalledWith('6135 N Foo St', { signal: undefined });
  });

  it('a county street with a direction is a twin of a City street without one', async () => {
    const { geocoder } = setup({
      countyRecord: record({ ADRDIR: 'N', FULL_ADDRESS: '6135 N FOO ST' }),
      cityLabel: '6135 Foo St, St. Louis City, MO 63115',
    });
    await expect(geocoder.geocode('6135 Foo St, St. Louis City')).resolves.toBeNull();
  });
});
