// The City's geocoder as an address source (#88): lookup() finds a City
// parcel for typed text under the strict rules, and suggest() offers City
// parcels for partly typed text. Fixtures are live answers recorded by
// scripts/record-fixtures.mjs.
import brookings from '../../docs/raw/fixtures/city-geocode-brookings-dr.json';
import market from '../../docs/raw/fixtures/city-geocode-market-st.json';
import ross from '../../docs/raw/fixtures/city-geocode-ross-ave.json';
import washington from '../../docs/raw/fixtures/city-geocode-washington-ave.json';
import nottingham from '../../docs/raw/fixtures/city-geocode-nottingham-ave.json';
import nottinghamPartial from '../../docs/raw/fixtures/city-geocode-nottingham-partial.json';
import partial from '../../docs/raw/fixtures/city-geocode-washington-partial.json';
import { CITY_GEOCODER_URL, createCityAddressCheck } from './cityAddress.js';
import { GeocoderUnavailableError } from './geocoderError.js';

function fakeFetch(answer) {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push({ url, init, params: new URLSearchParams(init?.body) });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return answer(init);
  });
  fn.calls = calls;
  return fn;
}

const respond = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const answering = (body) => fakeFetch(() => respond(body));
const city = (fetch) => createCityAddressCheck({ fetch });

describe('lookup(): the City as an address source', () => {
  it.each([
    '6135 Washington Ave, St. Louis, MO 63112',
    '6135 Washington Ave 63112',
    '6135 Washington Ave, St. Louis City, MO 63112',
    '6135 Washington Ave',
  ])('%s is the City parcel, labeled as the City', async (text) => {
    await expect(city(answering(washington)).lookup(text)).resolves.toEqual({
      status: 'city',
      place: {
        lat: expect.closeTo(38.65456, 4),
        lng: expect.closeTo(-90.29743, 4),
        state: 'Missouri',
        county: 'St. Louis city',
        label: '6135 Washington Ave, St. Louis City, MO 63112',
      },
    });
  });

  it('asks for the house number and street only, in a POST body', async () => {
    const fetch = answering(washington);
    await city(fetch).lookup('6135 Washington Ave, St. Louis, MO 63112');
    const [{ url, init, params }] = fetch.calls;
    expect(url).toBe(`${CITY_GEOCODER_URL}/findAddressCandidates`);
    expect(url).not.toContain('Washington');
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'omit' });
    expect(params.get('SingleLine')).toBe('6135 Washington Ave');
  });

  it('City Hall is the City parcel', async () => {
    await expect(
      city(answering(market)).lookup('1200 Market St, St. Louis, MO 63103'),
    ).resolves.toMatchObject({
      status: 'city',
      place: { label: '1200 Market St, St. Louis City, MO 63103' },
    });
  });

  // An owner report (#88): Photon and the county do not have it.
  it.each(['5010 Nottingham Ave, St. Louis, MO 63109', '5010 Nottingham Ave'])(
    '%s is the City parcel',
    async (text) => {
      await expect(city(answering(nottingham)).lookup(text)).resolves.toMatchObject({
        status: 'city',
        place: { county: 'St. Louis city', label: '5010 Nottingham Ave, St. Louis City, MO 63109' },
      });
    },
  );

  it('a typed ZIP the parcel lacks is not it', async () => {
    await expect(city(answering(washington)).lookup('6135 Washington Ave 63134')).resolves.toEqual({
      status: 'none',
    });
  });

  it.each(['1200 Market St, Philadelphia, PA 19107', '1200 Market St, Philadelphia, PA'])(
    'a typed town other than St. Louis is not the City parcel: %s',
    async (text) => {
      await expect(city(answering(market)).lookup(text)).resolves.toEqual({ status: 'none' });
    },
  );

  it('6135 Washington Ave, Pagedale is not the City parcel (unlike the #58 check)', async () => {
    await expect(
      city(answering(washington)).lookup('6135 Washington Ave, Pagedale'),
    ).resolves.toEqual({ status: 'none' });
  });

  it('only parcels count, never a street range', async () => {
    await expect(city(answering(ross)).lookup('1318 Ross Ave')).resolves.toEqual({
      status: 'none',
    });
  });

  it('a street without its type is not exact', async () => {
    // The answer has 6135 WASHINGTON AVE and 6135 WASHINGTON BLVD.
    await expect(city(answering(partial)).lookup('6135 Washington')).resolves.toEqual({
      status: 'none',
    });
  });

  it('1 Brookings Dr is a City parcel too (the #58 shared-ZIP twin)', async () => {
    await expect(city(answering(brookings)).lookup('1 Brookings Dr 63130')).resolves.toMatchObject({
      status: 'city',
      place: { label: '1 Brookings Dr, St. Louis City, MO 63130' },
    });
  });

  it('a parcel whose street has a direction the text left out is ambiguous', async () => {
    // The City has 1200 N Market Pl only.
    await expect(city(answering(market)).lookup('1200 Market Pl')).resolves.toEqual({
      status: 'ambiguous',
    });
    await expect(
      city(answering(market)).lookup('1200 Market Pl, Philadelphia, PA'),
    ).resolves.toEqual({ status: 'none' });
  });

  it('two parcels that fit are ambiguous', async () => {
    const [first] = washington.candidates.filter((c) => c.attributes.Addr_type === 'PointAddress');
    const twin = {
      ...first,
      location: { x: first.location.x + 0.01, y: first.location.y },
      attributes: { ...first.attributes, ZIP: '63130' },
    };
    const body = { ...washington, candidates: [first, twin] };
    await expect(city(answering(body)).lookup('6135 Washington Ave')).resolves.toEqual({
      status: 'ambiguous',
    });
  });

  it('rejects with a GeocoderUnavailableError when the City cannot answer', async () => {
    await expect(
      city(fakeFetch(() => respond({}, 500))).lookup('1200 Market St'),
    ).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });

  it('is not asked without a house number', async () => {
    const fetch = answering(market);
    await expect(city(fetch).lookup('Market St')).resolves.toEqual({ status: 'none' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('suggest(): City parcels as the voter types', () => {
  it('offers the parcels whose number and street start with the typed words', async () => {
    const fetch = answering(partial);
    const suggestions = await city(fetch).suggest('6135 Washington');
    expect(suggestions.map((s) => s.label)).toEqual([
      '6135 Washington Ave, St. Louis City, MO 63112',
      '6135 Washington Blvd, St. Louis City, MO 63112',
    ]);
    expect(new Set(suggestions.map((s) => s.id)).size).toBe(2);
    expect(fetch.calls[0].init.method).toBe('POST');
    expect(fetch.calls[0].params.get('SingleLine')).toBe('6135 Washington');
  });

  it('suggests 5010 Nottingham Ave once its street name is typed (owner report)', async () => {
    const suggestions = await city(answering(nottinghamPartial)).suggest('5010 Nottingham');
    expect(suggestions.map((s) => s.label)).toEqual([
      '5010 Nottingham Ave, St. Louis City, MO 63109',
    ]);
  });

  it('matches the last typed word as a prefix', async () => {
    const suggestions = await city(answering(partial)).suggest('6135 Washington Bl');
    expect(suggestions.map((s) => s.label)).toEqual([
      '6135 Washington Blvd, St. Louis City, MO 63112',
    ]);
  });

  it('offers nothing for another street', async () => {
    await expect(city(answering(partial)).suggest('6135 Waterman')).resolves.toEqual([]);
  });

  it.each(['Washington Ave', '6135', '6135 W'])(
    'is not asked until a house number and a street word are typed: %s',
    async (text) => {
      const fetch = answering(partial);
      await expect(city(fetch).suggest(text)).resolves.toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('is not asked when the text holds a ZIP entirely outside the City', async () => {
    const fetch = answering(partial);
    await expect(city(fetch).suggest('6135 Washington Ave 63134')).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects when the City cannot answer', async () => {
    await expect(
      city(fakeFetch(() => respond({}, 503))).suggest('6135 Washington'),
    ).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });
});
