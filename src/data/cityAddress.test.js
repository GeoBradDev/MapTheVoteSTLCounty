// Fixtures are live answers of the City of St. Louis's geocoder, recorded
// 2026-10-21 by scripts/record-fixtures.mjs (findAddressCandidates, the street
// only, as this module asks).
import horton from '../../docs/raw/fixtures/city-geocode-horton-pl.json';
import market from '../../docs/raw/fixtures/city-geocode-market-st.json';
import ross from '../../docs/raw/fixtures/city-geocode-ross-ave.json';
import washington from '../../docs/raw/fixtures/city-geocode-washington-ave.json';
import {
  CITY_GEOCODER_URL,
  COUNTY_ONLY_ZIPS,
  createCityAddressCheck,
  needsCityCheck,
  streetOf,
  TIMEOUT_MS,
} from './cityAddress.js';
import { GeocoderUnavailableError } from './geocoderError.js';

function respond(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A fetch that answers with `answer(params)` and records each call, honoring
// the request's signal like the real fetch does.
function fakeFetch(answer) {
  const calls = [];
  const fn = vi.fn((url, init) => {
    calls.push({ url, init, params: new URLSearchParams(init?.body) });
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (init?.signal?.aborted) return abort();
      init?.signal?.addEventListener('abort', abort);
      Promise.resolve()
        .then(() => answer(init))
        .then(resolve, reject);
    });
  });
  fn.calls = calls;
  return fn;
}

const answering = (body) => fakeFetch(() => respond(body));
const check = (fetch, options) => createCityAddressCheck({ fetch, ...options });

describe('the City geocoder', () => {
  it("is the City of St. Louis's own composite geocoder", () => {
    expect(CITY_GEOCODER_URL).toBe(
      'https://maps6.stlouis-mo.gov/arcgis/rest/services/GEOCODERS/COMPOSITE_GEOCODE/GeocodeServer',
    );
  });

  it('is asked with the street only, in a POST body, with no cookies, referrer or cache', async () => {
    const fetch = answering(washington);
    await check(fetch).find('6135 Washington Ave, St. Louis, MO', '6135 Washington Ave');
    const [{ url, init, params }] = fetch.calls;
    expect(url).toBe(`${CITY_GEOCODER_URL}/findAddressCandidates`);
    expect(url).not.toContain('Washington');
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    expect(params.get('SingleLine')).toBe('6135 Washington Ave');
    expect(params.get('outSR')).toBe('4326');
    expect(params.get('f')).toBe('json');
  });

  it('is not asked for empty text', async () => {
    const fetch = answering(washington);
    await expect(check(fetch).find(' ', '6135 Washington Ave')).resolves.toEqual({
      status: 'none',
    });
    await expect(check(fetch).find('6135 Washington Ave', '')).resolves.toEqual({
      status: 'none',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('issue #58 cases, from recorded answers', () => {
  it.each(['6135 Washington Ave, St. Louis, MO', '6135 Washington Ave', '6135 washington avenue'])(
    '%s is the City parcel 6135 Washington Ave 63112',
    async (text) => {
      const result = await check(answering(washington)).find(text, '6135 Washington Ave');
      expect(result).toEqual({
        status: 'city',
        place: {
          lat: expect.closeTo(38.65456, 4),
          lng: expect.closeTo(-90.29743, 4),
          state: 'Missouri',
          county: 'St. Louis city',
          label: '6135 Washington Ave, St. Louis, MO 63112',
        },
      });
    },
  );

  it('6135 Horton Pl, St. Louis, MO 63133 is the City parcel in the same ZIP', async () => {
    const result = await check(answering(horton)).find(
      '6135 Horton Pl, St. Louis, MO 63133',
      '6135 Horton Pl',
    );
    expect(result).toMatchObject({
      status: 'city',
      place: { county: 'St. Louis city', label: '6135 Horton Pl, St. Louis, MO 63133' },
    });
  });

  it('a typed ZIP rules out a City parcel in another ZIP', async () => {
    await expect(
      check(answering(washington)).find('6135 Washington Ave 63130', '6135 Washington Ave'),
    ).resolves.toEqual({ status: 'none' });
  });

  it('the typed ZIP of the City parcel keeps it', async () => {
    await expect(
      check(answering(washington)).find('6135 Washington Ave, MO 63112', '6135 Washington Ave'),
    ).resolves.toMatchObject({ status: 'city' });
  });

  it('ignores a typed town: the City parcel still counts', async () => {
    await expect(
      check(answering(washington)).find('6135 Washington Ave, Pagedale', '6135 Washington Ave'),
    ).resolves.toMatchObject({ status: 'city' });
  });

  it('counts only the whole street: another street type is not the address', async () => {
    // The answer also has 6135 WASHINGTON AVE; a different typed type is not it.
    await expect(
      check(answering(washington)).find('6135 Washington Dr', '6135 Washington Dr'),
    ).resolves.toEqual({ status: 'none' });
  });

  it('1318 Ross Ave has no City parcel (only street ranges of Rosa Ave)', async () => {
    await expect(
      check(answering(ross)).find('1318 Ross Ave, Saint Louis, MO', '1318 Ross Ave'),
    ).resolves.toEqual({ status: 'none' });
  });

  it('City Hall, 1200 Market St, is the City parcel', async () => {
    await expect(
      check(answering(market)).find('1200 Market St', '1200 Market St'),
    ).resolves.toMatchObject({
      status: 'city',
      place: { label: '1200 Market St, St. Louis, MO 63103' },
    });
  });

  it('a City parcel whose direction the text left out is ambiguous', async () => {
    // The City has 1200 N Market Pl; "1200 Market Pl" could mean it.
    await expect(
      check(answering(market)).find('1200 Market Pl', '1200 Market Pl'),
    ).resolves.toEqual({ status: 'ambiguous' });
  });

  it('the direction typed in full matches the City parcel', async () => {
    await expect(
      check(answering(market)).find('1200 North Market Pl', '1200 N Market Pl'),
    ).resolves.toMatchObject({ status: 'city', place: { label: expect.stringMatching(/63106$/) } });
  });
});

describe('candidates that do not count', () => {
  const candidate = (attributes, location = { x: -90.2, y: 38.6 }) => ({
    address: 'x',
    location,
    score: 100,
    attributes: {
      Addr_type: 'PointAddress',
      AddNum: '100',
      StPreDir: '',
      StPreType: '',
      StName: 'ELM',
      StType: 'AVE',
      StDir: '',
      ZIP: '63110',
      ...attributes,
    },
  });
  const find = (...candidates) =>
    check(answering({ candidates })).find('100 Elm Ave', '100 Elm Ave');

  it('an interpolated StreetAddress', async () => {
    await expect(find(candidate({ Addr_type: 'StreetAddress', ZIP: '' }))).resolves.toEqual({
      status: 'none',
    });
  });

  it('another house number', async () => {
    await expect(find(candidate({ AddNum: '102' }))).resolves.toEqual({ status: 'none' });
  });

  it('a candidate with no point', async () => {
    await expect(find(candidate({}, null))).resolves.toEqual({ status: 'none' });
  });

  it('but a parcel with no ZIP counts though a ZIP is typed', async () => {
    const result = await check(answering({ candidates: [candidate({ ZIP: '' })] })).find(
      '100 Elm Ave 63110',
      '100 Elm Ave',
    );
    expect(result).toMatchObject({
      status: 'city',
      place: { label: '100 Elm Ave, St. Louis, MO' },
    });
  });
});

describe('when the City geocoder cannot answer', () => {
  const unavailable = (fetch) =>
    expect(check(fetch).find('6135 Washington Ave', '6135 Washington Ave')).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );

  it('rejects on a non-2xx answer', async () => {
    await unavailable(fakeFetch(() => respond({}, { status: 503 })));
  });

  it('rejects on an ArcGIS error body', async () => {
    await unavailable(answering({ error: { code: 500, message: 'x' } }));
  });

  it('rejects on a malformed body', async () => {
    await unavailable(answering({ nothing: true }));
  });

  it('rejects on a network error, without the address in the message', async () => {
    const error = await check(
      fakeFetch(() => Promise.reject(new TypeError('failed: 6135 Washington Ave'))),
    )
      .find('6135 Washington Ave', '6135 Washington Ave')
      .catch((e) => e);
    expect(error).toBeInstanceOf(GeocoderUnavailableError);
    expect(error.message).not.toContain('Washington');
  });

  it('rejects when it takes longer than the timeout, and cancels the request', async () => {
    vi.useFakeTimers();
    try {
      let signal;
      const fetch = vi.fn(
        (_url, init) =>
          new Promise((_, reject) => {
            signal = init.signal;
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = check(fetch)
        .find('6135 Washington Ave', '6135 Washington Ave')
        .catch((e) => e);
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
      const error = await pending;
      expect(error).toBeInstanceOf(GeocoderUnavailableError);
      expect(error.message).toMatch(/timed out/);
      expect(signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with AbortError when the caller aborts', async () => {
    const controller = new AbortController();
    const pending = check(fakeFetch(() => new Promise(() => {})))
      .find('6135 Washington Ave', '6135 Washington Ave', { signal: controller.signal })
      .catch((e) => e);
    controller.abort();
    expect((await pending).name).toBe('AbortError');
  });

  it('keeps the timeout short', () => {
    expect(TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
});

describe('needsCityCheck', () => {
  it.each([
    ['6135 Washington Ave', true],
    ['6135 Washington Ave, St. Louis, MO', true],
    ['6135 Washington Ave, Pagedale', true],
    ['6135 Horton Pl, St. Louis, MO 63133', true],
    ['1 Main St 63130', true],
    ['1 Main St 63120', true],
    ['1 Main St 63147', true],
    ['1 Main St 63136', true],
    // Not listed: checked.
    ['1 Main St 63199', true],
    ['6135 Washington Ave, Saint Louis, MO 63134', false],
    // Every City ZIP starts 631 (#88): any other ZIP is entirely outside it.
    ['1200 Market St, Philadelphia, PA 19107', false],
    ['350 5th Ave New York NY 10118', false],
    ['200 N 2nd St, St. Charles, MO 63301', false],
    ['1318 Ross Ave, Saint Louis, MO 63146', false],
    ['1318 Ross Ave 63146-1234', false],
  ])('%s: %s', (text, want) => {
    expect(needsCityCheck(text)).toBe(want);
  });

  it('lists no ZIP of a City address from the issue', () => {
    for (const zip of ['63101', '63103', '63106', '63110', '63112', '63120', '63130', '63133']) {
      expect(COUNTY_ONLY_ZIPS.has(zip)).toBe(false);
    }
  });
});

describe('streetOf', () => {
  it.each([
    ['6135 Washington Ave, Saint Louis, MO 63134', '6135 Washington Ave'],
    ['6135 Washington Ave Apt 2, Saint Louis, MO 63134', '6135 Washington Ave'],
    ['4005 Ripa Ave Unit 3B, Saint Louis, MO 63125', '4005 Ripa Ave'],
    ['100 N Elm Ave', '100 N Elm Ave'],
    ['1 Lot Ln', '1 Lot Ln'],
  ])('%s gives %s', (label, want) => {
    expect(streetOf(label)).toBe(want);
  });
});
