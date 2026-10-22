// Issue #88: the City's own geocoder is an address source, asked ahead of
// Photon when the county has no match, and its parcels are suggested next to
// the county's. The #58 rules still hold: never a county place for a City
// address, never the City for an address the county also has in one ZIP.
import { createGeocoder, GeocoderUnavailableError } from './geocoder.js';

const CITY_HALL = Object.freeze({
  lat: 38.62657,
  lng: -90.19966,
  state: 'Missouri',
  county: 'St. Louis city',
  label: '1200 Market St, St. Louis City, MO 63103',
});
const COUNTY_PLACE = Object.freeze({
  lat: 38.7067,
  lng: -90.3185,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '6135 Washington Ave, Saint Louis, MO 63134',
});
const PHOTON_ELSEWHERE = Object.freeze({
  lat: 39.95,
  lng: -75.16,
  state: 'Pennsylvania',
  county: 'Philadelphia County',
  label: '1200 Market St, Philadelphia, PA 19107',
});

const unavailable = () => Promise.reject(new GeocoderUnavailableError('down'));

function setup({
  county = async () => ({ status: 'none' }),
  countySuggest = async () => [],
  lookup = async () => ({ status: 'none' }),
  citySuggest = async () => [],
  find = async () => ({ status: 'none' }),
  photon = async () => null,
  photonSuggest = async () => [],
} = {}) {
  const source = { find: vi.fn(county), suggest: vi.fn(countySuggest) };
  const fallback = { geocode: vi.fn(photon), suggest: vi.fn(photonSuggest) };
  const cityCheck = { find: vi.fn(find), lookup: vi.fn(lookup), suggest: vi.fn(citySuggest) };
  const geocoder = createGeocoder({ sources: [source], fallback, cityCheck });
  return { geocoder, source, fallback, cityCheck };
}

describe('issue #88: the City as an address source', () => {
  it('a City address the county lacks is the City place, before Photon', async () => {
    const { geocoder, cityCheck, fallback } = setup({
      lookup: async () => ({ status: 'city', place: CITY_HALL }),
    });
    await expect(geocoder.geocode('1200 Market St, St. Louis, MO 63103')).resolves.toEqual(
      CITY_HALL,
    );
    expect(cityCheck.lookup).toHaveBeenCalledWith('1200 Market St, St. Louis, MO 63103', {
      signal: undefined,
    });
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('a picked City suggestion is found again by its label', async () => {
    const { geocoder, cityCheck } = setup({
      lookup: async () => ({ status: 'city', place: CITY_HALL }),
    });
    const pick = { id: 'city-0', label: CITY_HALL.label };
    await expect(geocoder.geocode(pick)).resolves.toEqual(CITY_HALL);
    expect(cityCheck.lookup.mock.calls[0][0]).toBe(CITY_HALL.label);
  });

  it('two City addresses that fit are no match, without Photon', async () => {
    const { geocoder, fallback } = setup({ lookup: async () => ({ status: 'ambiguous' }) });
    await expect(geocoder.geocode('1200 Market Pl')).resolves.toBeNull();
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('no City address goes on to Photon', async () => {
    const { geocoder, fallback } = setup({ photon: async () => PHOTON_ELSEWHERE });
    await expect(geocoder.geocode('1200 Market St, Philadelphia, PA')).resolves.toEqual(
      PHOTON_ELSEWHERE,
    );
    expect(fallback.geocode).toHaveBeenCalled();
  });

  it.each(['6135 Washington Ave 63134', '1200 Market St, Philadelphia, PA 19107'])(
    'a ZIP entirely outside the City skips it: %s',
    async (text) => {
      const { geocoder, cityCheck } = setup();
      await geocoder.geocode(text);
      expect(cityCheck.lookup).not.toHaveBeenCalled();
    },
  );

  it('a county match never asks the City as a source (the #58 check decides)', async () => {
    const { geocoder, cityCheck } = setup({
      county: async () => ({ status: 'match', place: COUNTY_PLACE, confirmed: false }),
    });
    await expect(geocoder.geocode('6135 Washington Ave')).resolves.toEqual(COUNTY_PLACE);
    expect(cityCheck.lookup).not.toHaveBeenCalled();
    expect(cityCheck.find).toHaveBeenCalled();
  });

  it('with no county source answering, the City alone is not trusted', async () => {
    // The county could have the same address in the same ZIP (#58).
    const { geocoder, cityCheck } = setup({
      county: unavailable,
      lookup: async () => ({ status: 'city', place: CITY_HALL }),
    });
    await expect(geocoder.geocode('1200 Market St')).resolves.toBeNull();
    await expect(
      geocoder.geocode('1200 Market St', { reportUnavailable: true }),
    ).rejects.toBeInstanceOf(GeocoderUnavailableError);
    expect(cityCheck.lookup).not.toHaveBeenCalled();
  });

  describe('when the City geocoder is down', () => {
    it('a City address Photon lacks is no match, or with reportUnavailable unavailable', async () => {
      const { geocoder } = setup({ lookup: unavailable });
      await expect(geocoder.geocode('6135 Washington Ave 63112')).resolves.toBeNull();
      await expect(
        geocoder.geocode('6135 Washington Ave 63112', { reportUnavailable: true }),
      ).rejects.toBeInstanceOf(GeocoderUnavailableError);
    });

    it('a Photon county place is never the answer', async () => {
      const { geocoder } = setup({
        lookup: unavailable,
        find: unavailable,
        photon: async () => COUNTY_PLACE,
      });
      await expect(geocoder.geocode('6135 Washington Ave')).resolves.toBeNull();
      await expect(
        geocoder.geocode('6135 Washington Ave', { reportUnavailable: true }),
      ).rejects.toBeInstanceOf(GeocoderUnavailableError);
    });

    it('a county address with a county-only ZIP is unaffected', async () => {
      const place = { ...COUNTY_PLACE, label: '6135 Washington Ave, Saint Louis, MO 63134' };
      const { geocoder } = setup({
        lookup: unavailable,
        find: unavailable,
        county: async () => ({ status: 'match', place, confirmed: true }),
      });
      await expect(geocoder.geocode('6135 Washington Ave 63134')).resolves.toEqual(place);
    });
  });
});

describe('issue #88: suggestions from the county and the City together', () => {
  const county = [{ id: 'county-1', label: '6135 Washington Ave, Saint Louis, MO 63134' }];
  const city = [{ id: 'city-0', label: '6135 Washington Ave, St. Louis City, MO 63112' }];

  it('lists the county suggestions, then the City ones', async () => {
    const { geocoder, fallback } = setup({
      countySuggest: async () => county,
      citySuggest: async () => city,
    });
    await expect(geocoder.suggest('6135 Washington')).resolves.toEqual([...county, ...city]);
    expect(fallback.suggest).not.toHaveBeenCalled();
  });

  it('City suggestions alone skip Photon', async () => {
    const { geocoder, fallback } = setup({ citySuggest: async () => city });
    await expect(geocoder.suggest('6135 Washington')).resolves.toEqual(city);
    expect(fallback.suggest).not.toHaveBeenCalled();
  });

  it('a failed City request leaves the county suggestions', async () => {
    const { geocoder } = setup({ countySuggest: async () => county, citySuggest: unavailable });
    await expect(geocoder.suggest('6135 Washington')).resolves.toEqual(county);
  });

  it('offers no City suggestion while no county source answers (a pick could not be checked)', async () => {
    const photon = [{ id: 'p', label: '6135 Washington Ave, Pagedale' }];
    const { geocoder } = setup({
      countySuggest: unavailable,
      citySuggest: async () => city,
      photonSuggest: async () => photon,
    });
    await expect(geocoder.suggest('6135 Washington')).resolves.toEqual(photon);
  });

  it('asks Photon when neither has one', async () => {
    const photon = [{ id: 'p', label: '6135 Washington Ave, Pagedale' }];
    const { geocoder } = setup({ photonSuggest: async () => photon, citySuggest: unavailable });
    await expect(geocoder.suggest('6135 Washington')).resolves.toEqual(photon);
  });
});

// Review finding (owner decision, 2026-10-22): a typed "St. Louis City" rules
// out every county record, so the county answers no match; with no ZIP typed,
// a City twin of a county address is still no match (add your ZIP), and
// one the county lists in the same ZIP never opens the City precinct.
describe('a City twin typed with "St. Louis City" and no ZIP (#88)', () => {
  const WASHINGTON_CITY = Object.freeze({
    ...CITY_HALL,
    label: '6135 Washington Ave, St. Louis City, MO 63112',
  });
  // The county has 6135 Washington Ave (in 63134) but not with a City town.
  const county = async (text) =>
    /city/i.test(text) ? { status: 'none' } : { status: 'match', place: COUNTY_PLACE };

  it.each(['6135 Washington Ave, St. Louis City', '6135 Washington Ave, St. Louis City, MO'])(
    '%s is no match',
    async (text) => {
      const { geocoder, source } = setup({
        county,
        lookup: async () => ({ status: 'city', place: WASHINGTON_CITY }),
      });
      await expect(geocoder.geocode(text)).resolves.toBeNull();
      expect(source.find).toHaveBeenLastCalledWith('6135 Washington Ave', { signal: undefined });
    },
  );

  it('the City place when the county does not have the number and street', async () => {
    const { geocoder } = setup({ lookup: async () => ({ status: 'city', place: CITY_HALL }) });
    await expect(geocoder.geocode('1200 Market St, St. Louis City')).resolves.toEqual(CITY_HALL);
  });

  it('with a ZIP typed, the City place without asking the county again', async () => {
    const { geocoder, source } = setup({
      county,
      lookup: async () => ({ status: 'city', place: WASHINGTON_CITY }),
    });
    await expect(
      geocoder.geocode('6135 Washington Ave, St. Louis City, MO 63112'),
    ).resolves.toEqual(WASHINGTON_CITY);
    expect(source.find).toHaveBeenCalledTimes(1);
  });

  it('the county failing on the second ask is never the City place', async () => {
    let calls = 0;
    const { geocoder } = setup({
      county: async () =>
        calls++ ? Promise.reject(new GeocoderUnavailableError('down')) : { status: 'none' },
      lookup: async () => ({ status: 'city', place: WASHINGTON_CITY }),
    });
    await expect(geocoder.geocode('6135 Washington Ave, St. Louis City')).resolves.toBeNull();
    calls = 0;
    await expect(
      geocoder.geocode('6135 Washington Ave, St. Louis City', { reportUnavailable: true }),
    ).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });
});

// Review finding: a place found with no ZIP of its own cannot be told apart
// from a City parcel in the typed ZIP, so it is no match, never the City place.
it('a City answer for a place with no ZIP of its own is no match', async () => {
  const { geocoder } = setup({
    county: unavailable,
    find: async () => ({ status: 'city', place: CITY_HALL }),
    photon: async () => ({ ...COUNTY_PLACE, label: '1 Brookings Dr, Saint Louis' }),
  });
  await expect(geocoder.geocode('1 Brookings Dr, St. Louis, MO 63130')).resolves.toBeNull();
});
