import { GeocoderUnavailableError } from './geocoderError.js';
import { COUNTY_BBOX, createPhotonGeocoder, DEFAULT_BASE_URL, TIMEOUT_MS } from './photon.js';

function feature(properties, coordinates = [-90.3367226, 38.4198284]) {
  return {
    type: 'Feature',
    properties: { countrycode: 'US', type: 'house', ...properties },
    geometry: { type: 'Point', coordinates },
  };
}

const FINE = feature({
  osm_type: 'N',
  osm_id: 7143057511,
  housenumber: '7700',
  street: 'Fine Road',
  county: 'Saint Louis County',
  state: 'Missouri',
  postcode: '63129',
});

const DES_PERES = feature(
  {
    osm_type: 'N',
    osm_id: 6954925157,
    housenumber: '12325',
    street: 'Manchester Road',
    city: 'Des Peres',
    county: 'Saint Louis County',
    state: 'Missouri',
    postcode: '63131',
  },
  [-90.44, 38.6],
);

function respond(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A fetch that answers with `answer(url)` and records each call. It honors the
// request's signal like the real fetch does.
function fakeFetch(answer) {
  const calls = [];
  const fn = vi.fn((url, init) => {
    calls.push({ url: new URL(url), init });
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (init?.signal?.aborted) return abort();
      init?.signal?.addEventListener('abort', abort);
      Promise.resolve()
        .then(() => answer(new URL(url)))
        .then(resolve, reject);
    });
  });
  fn.calls = calls;
  return fn;
}

const collection = (...features) => ({ type: 'FeatureCollection', features });

describe('createPhotonGeocoder', () => {
  it('returns a frozen object with suggest and geocode', () => {
    const geocoder = createPhotonGeocoder({ fetch: fakeFetch(() => respond(collection())) });
    expect(Object.isFrozen(geocoder)).toBe(true);
    expect(geocoder.suggest).toEqual(expect.any(Function));
    expect(geocoder.geocode).toEqual(expect.any(Function));
  });

  it('asks Photon with the county bbox, a location bias and English labels', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    await createPhotonGeocoder({ fetch }).suggest('7700 Fine');
    const [{ url, init }] = fetch.calls;
    expect(`${url.origin}${url.pathname}`).toBe(`${DEFAULT_BASE_URL}/api/`);
    expect(url.searchParams.get('q')).toBe('7700 Fine');
    expect(url.searchParams.get('bbox')).toBe(COUNTY_BBOX.join(','));
    expect(Number(url.searchParams.get('lat'))).toBeCloseTo(38.6);
    expect(Number(url.searchParams.get('lon'))).toBeCloseTo(-90.4);
    expect(url.searchParams.get('lang')).toBe('en');
    expect(Number(url.searchParams.get('limit'))).toBeGreaterThanOrEqual(5);
    expect(init).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses a configured base URL, with or without a trailing slash', async () => {
    const fetch = fakeFetch(() => respond(collection()));
    await createPhotonGeocoder({ fetch, baseUrl: 'https://geo.example.org/' }).suggest('7700');
    expect(fetch.calls[0].url.href.startsWith('https://geo.example.org/api/?')).toBe(true);
  });

  it('falls back to the default base URL when given an empty one', async () => {
    const fetch = fakeFetch(() => respond(collection()));
    await createPhotonGeocoder({ fetch, baseUrl: '' }).suggest('7700');
    expect(fetch.calls[0].url.origin).toBe(DEFAULT_BASE_URL);
  });
});

describe('suggest', () => {
  it('returns house-level US addresses with readable labels', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE, DES_PERES)));
    const suggestions = await createPhotonGeocoder({ fetch }).suggest('7700 Fine');
    expect(suggestions.map((s) => s.label)).toEqual([
      '7700 Fine Road, Saint Louis County, MO 63129',
      '12325 Manchester Road, Des Peres, MO 63131',
    ]);
    expect(new Set(suggestions.map((s) => s.id)).size).toBe(2);
  });

  it('leaves out streets, areas, places with no house number and other countries', async () => {
    const fetch = fakeFetch(() =>
      respond(
        collection(
          feature({ type: 'street', name: 'Fine Road', state: 'Missouri' }),
          feature({ type: 'district', name: 'Fil', postcode: '7700', countrycode: 'DK' }),
          feature({ name: 'Residence Inn', street: 'Galleria Parkway', state: 'Missouri' }),
          feature({ housenumber: '7700', street: 'Spine Road', countrycode: 'CA' }),
          { type: 'Feature', properties: { housenumber: '1', street: 'A St', countrycode: 'US' } },
          FINE,
        ),
      ),
    );
    const suggestions = await createPhotonGeocoder({ fetch }).suggest('7700 Fin');
    expect(suggestions.map((s) => s.label)).toEqual([
      '7700 Fine Road, Saint Louis County, MO 63129',
    ]);
  });

  it('drops duplicate labels and returns at most 5', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      feature({
        osm_id: i,
        housenumber: String(100 + i),
        street: 'Main Street',
        state: 'Missouri',
      }),
    );
    const fetch = fakeFetch(() => respond(collection(FINE, { ...FINE }, ...many)));
    const suggestions = await createPhotonGeocoder({ fetch }).suggest('Main');
    expect(suggestions).toHaveLength(5);
    expect(suggestions.filter((s) => s.label.startsWith('7700'))).toHaveLength(1);
  });

  it('does not ask Photon for blank text', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    await expect(createPhotonGeocoder({ fetch }).suggest('   ')).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('geocode', () => {
  it('returns a picked suggestion without asking Photon again', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    const geocoder = createPhotonGeocoder({ fetch });
    const [suggestion] = await geocoder.suggest('7700 Fine');
    await expect(geocoder.geocode(suggestion)).resolves.toEqual({
      lat: 38.4198284,
      lng: -90.3367226,
      state: 'Missouri',
      county: 'Saint Louis County',
      label: '7700 Fine Road, Saint Louis County, MO 63129',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('geocodes typed text to the first address with the typed number and street', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    await expect(
      createPhotonGeocoder({ fetch }).geocode('7700 FINE RD, 63129'),
    ).resolves.toMatchObject({ lat: 38.4198284, lng: -90.3367226, county: 'Saint Louis County' });
    expect(fetch.calls[0].url.searchParams.get('q')).toBe('7700 FINE RD, 63129');
  });

  it('geocodes the label of a suggestion it did not make', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    const place = await createPhotonGeocoder({ fetch }).geocode({
      id: 'x',
      label: '7700 Fine Rd, Saint Louis, MO 63129',
    });
    expect(place).toMatchObject({ lat: 38.4198284 });
  });

  it('returns null for a match with another house number', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    await expect(createPhotonGeocoder({ fetch }).geocode('7702 Fine Rd')).resolves.toBeNull();
  });

  it('returns null for a match on another street', async () => {
    const bonhomme = feature({ housenumber: '8025', street: 'Bonhomme Ave', state: 'Missouri' });
    const fetch = fakeFetch(() => respond(collection(bonhomme)));
    await expect(
      createPhotonGeocoder({ fetch }).geocode('8025 Maryland Ave, MO 63105'),
    ).resolves.toBeNull();
  });

  it('returns null for text with no house number', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    await expect(createPhotonGeocoder({ fetch }).geocode('Fine Road')).resolves.toBeNull();
  });

  it('matches across street suffix and Saint/St spellings and ordinals', async () => {
    const galleria = feature({
      housenumber: '1155',
      street: 'St Louis Galleria Street',
      state: 'Missouri',
    });
    const west = feature({ housenumber: '6915', street: 'West 63rd Street', state: 'Missouri' });
    const fetch = fakeFetch((url) =>
      respond(collection(url.searchParams.get('q').includes('1155') ? galleria : west)),
    );
    const geocoder = createPhotonGeocoder({ fetch });
    await expect(geocoder.geocode('1155 Saint Louis Galleria St')).resolves.not.toBeNull();
    // With no street type it could be another street of that name.
    await expect(geocoder.geocode('1155 Saint Louis Galleria')).resolves.toBeNull();
    await expect(geocoder.geocode('6915 W 63 St')).resolves.not.toBeNull();
  });

  it('accepts a number inside a house number range or list', async () => {
    const range = feature({ housenumber: '1200-1206', street: 'Market Street', state: 'Missouri' });
    const fetch = fakeFetch(() => respond(collection(range)));
    const geocoder = createPhotonGeocoder({ fetch });
    await expect(geocoder.geocode('1204 Market St')).resolves.not.toBeNull();
    await expect(geocoder.geocode('1210 Market St')).resolves.toBeNull();
  });

  it('returns null when Photon finds nothing', async () => {
    const fetch = fakeFetch(() => respond(collection()));
    await expect(createPhotonGeocoder({ fetch }).geocode('6915 Weber Rd')).resolves.toBeNull();
  });

  it('names St. Louis City as the county when Photon gives a Saint Louis city and no county', async () => {
    const cityHall = feature({
      housenumber: '1200',
      street: 'Market Street',
      city: 'Saint Louis',
      state: 'Missouri',
      postcode: '63103',
    });
    const fetch = fakeFetch(() => respond(collection(cityHall)));
    await expect(createPhotonGeocoder({ fetch }).geocode('1200 Market St')).resolves.toMatchObject({
      state: 'Missouri',
      county: 'St. Louis city',
      label: '1200 Market Street, Saint Louis, MO 63103',
    });
  });

  it('leaves the county out when Photon gives none outside St. Louis', async () => {
    const elsewhere = feature({
      housenumber: '10',
      street: 'Main Street',
      city: 'Belleville',
      state: 'Illinois',
    });
    const fetch = fakeFetch(() => respond(collection(elsewhere)));
    const place = await createPhotonGeocoder({ fetch }).geocode('10 Main St, Belleville');
    expect(place).toMatchObject({ state: 'Illinois' });
    expect(place.county).toBeUndefined();
  });
});

describe('when Photon cannot answer', () => {
  it.each([
    ['rate limited', () => respond({ message: 'Too many requests' }, { status: 429 })],
    ['a server error', () => respond({}, { status: 503 })],
    ['a body with no features', () => respond({ error: 'bad' })],
    [
      'a body that is not JSON',
      () => ({ ok: true, status: 200, json: async () => JSON.parse('<') }),
    ],
    [
      'a network error',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('rejects with GeocoderUnavailableError on %s, without the address', async (_, answer) => {
    const fetch = fakeFetch(answer);
    const geocoder = createPhotonGeocoder({ fetch });
    for (const call of [
      () => geocoder.geocode('7700 Fine Rd'),
      () => geocoder.suggest('7700 Fine Rd'),
    ]) {
      const error = await call().catch((e) => e);
      expect(error).toBeInstanceOf(GeocoderUnavailableError);
      expect(error.message).not.toContain('7700');
    }
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetch = fakeFetch(() => new Promise(() => {}));
      const pending = createPhotonGeocoder({ fetch })
        .geocode('7700 Fine Rd')
        .catch((e) => e);
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);
      const error = await pending;
      expect(error).toBeInstanceOf(GeocoderUnavailableError);
      expect(error.message).toMatch(/timed out/);
      expect(fetch.calls[0].init.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with an AbortError, not unavailable, when the caller aborts', async () => {
    const fetch = fakeFetch(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = createPhotonGeocoder({ fetch })
      .suggest('7700 Fine', { signal: controller.signal })
      .catch((e) => e);
    controller.abort();
    const error = await pending;
    expect(error.name).toBe('AbortError');
    expect(fetch.calls[0].init.signal.aborted).toBe(true);
  });

  it('does not ask Photon when the signal is already aborted', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    const controller = new AbortController();
    controller.abort();
    const error = await createPhotonGeocoder({ fetch })
      .geocode('7700 Fine Rd', { signal: controller.signal })
      .catch((e) => e);
    expect(error.name).toBe('AbortError');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('findPlaces', () => {
  const CITY = feature(
    {
      osm_type: 'N',
      osm_id: 1,
      housenumber: '7700',
      street: 'Fine Road',
      city: 'Saint Louis',
      state: 'Missouri',
      postcode: '63111',
    },
    [-90.25, 38.56],
  );

  it('returns every place that fits the text, not only one, so a caller can see both', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE, CITY, DES_PERES)));
    const places = await createPhotonGeocoder({ fetch }).findPlaces('7700 Fine Rd');
    expect(places.map((p) => p.county)).toEqual(['Saint Louis County', 'St. Louis city']);
  });

  it('returns none for empty text without asking Photon', async () => {
    const fetch = fakeFetch(() => respond(collection(FINE)));
    await expect(createPhotonGeocoder({ fetch }).findPlaces('  ')).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
