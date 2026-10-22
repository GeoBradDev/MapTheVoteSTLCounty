import { createGeocoder, GeocoderUnavailableError } from './geocoder.js';

const ROSS = Object.freeze({
  lat: 38.6822,
  lng: -90.4581,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '1318 Ross Ave, Saint Louis, MO 63146',
});
const CITY = Object.freeze({
  lat: 38.62,
  lng: -90.2,
  state: 'Missouri',
  county: 'St. Louis city',
  label: '1318 Ross Ave, Saint Louis, MO 63110',
});
const PHOTON_PLACE = Object.freeze({ ...ROSS, label: 'from Photon' });

const unavailable = () => Promise.reject(new GeocoderUnavailableError('down'));
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

// A step that never answers until its signal aborts, like a hung request.
function hang(_text, { signal } = {}) {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()));
  });
}

function countySource({ find, suggest } = {}) {
  return {
    find: vi.fn(find ?? (async () => ({ status: 'none' }))),
    suggest: vi.fn(suggest ?? (async () => [])),
  };
}

function photon({ geocode, suggest } = {}) {
  return {
    geocode: vi.fn(geocode ?? (async () => PHOTON_PLACE)),
    suggest: vi.fn(
      suggest ?? (async () => [{ id: 'p', label: 'from Photon', place: PHOTON_PLACE }]),
    ),
  };
}

// The City check (src/data/cityAddress.js): no City address unless a test says so.
function cityCheck(find) {
  return { find: vi.fn(find ?? (async () => ({ status: 'none' }))) };
}

const match =
  (confirmed, place = ROSS) =>
  async () => ({ status: 'match', place, confirmed });

function chain({
  live = countySource(),
  hosted = countySource(),
  fallback = photon(),
  city = cityCheck(),
} = {}) {
  return {
    live,
    hosted,
    fallback,
    city,
    geocoder: createGeocoder({ sources: [live, hosted], fallback, cityCheck: city }),
  };
}

describe('createGeocoder', () => {
  it('is a frozen geocoder with suggest and geocode', () => {
    const { geocoder } = chain();
    expect(Object.isFrozen(geocoder)).toBe(true);
    expect(Object.keys(geocoder).sort()).toEqual(['geocode', 'suggest']);
  });

  it('refuses to build without a City check', () => {
    expect(() => createGeocoder({ sources: [], fallback: photon() })).toThrow(TypeError);
  });
});

describe('geocode', () => {
  it('answers from the live county layer when it matches, asking nothing else', async () => {
    const { geocoder, hosted, fallback } = chain({ live: countySource({ find: match(true) }) });
    await expect(geocoder.geocode('1318 Ross Ave 63146')).resolves.toEqual(ROSS);
    expect(hosted.find).not.toHaveBeenCalled();
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('passes the typed text and the signal to each source', async () => {
    const { geocoder, live } = chain({ live: countySource({ find: match(true) }) });
    const controller = new AbortController();
    await geocoder.geocode('  1318 Ross Ave 63146 ', { signal: controller.signal });
    expect(live.find).toHaveBeenCalledWith('1318 Ross Ave 63146', {
      signal: controller.signal,
    });
  });

  it('uses the hosted copy only when the live layer is unavailable', async () => {
    const { geocoder, fallback } = chain({
      live: countySource({ find: unavailable }),
      hosted: countySource({ find: match(true) }),
    });
    await expect(geocoder.geocode('1318 Ross Ave 63146')).resolves.toEqual(ROSS);
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('uses Photon when both county layers are unavailable', async () => {
    const { geocoder, fallback } = chain({
      live: countySource({ find: unavailable }),
      hosted: countySource({ find: unavailable }),
    });
    await expect(geocoder.geocode('1318 Ross Ave 63146')).resolves.toEqual(PHOTON_PLACE);
    expect(fallback.geocode).toHaveBeenCalledWith('1318 Ross Ave 63146', expect.any(Object));
  });

  it('goes to Photon, not the older hosted copy, when the live layer finds no match', async () => {
    const { geocoder, hosted, fallback } = chain();
    await expect(geocoder.geocode('500 Market St, St. Louis 63101')).resolves.toEqual(PHOTON_PLACE);
    expect(hosted.find).not.toHaveBeenCalled();
    expect(fallback.geocode).toHaveBeenCalled();
  });

  it('answers no match when the county finds two addresses that fit, without guessing', async () => {
    const { geocoder, hosted, fallback } = chain({
      live: countySource({ find: async () => ({ status: 'ambiguous' }) }),
    });
    await expect(geocoder.geocode('100 Main St')).resolves.toBeNull();
    expect(hosted.find).not.toHaveBeenCalled();
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('answers no match when the county found none and Photon is unavailable', async () => {
    const { geocoder } = chain({ fallback: photon({ geocode: unavailable }) });
    await expect(geocoder.geocode('1 Nowhere Ln')).resolves.toBeNull();
  });

  it('rejects as unavailable when every source is unavailable', async () => {
    const { geocoder } = chain({
      live: countySource({ find: unavailable }),
      hosted: countySource({ find: unavailable }),
      fallback: photon({ geocode: unavailable }),
    });
    await expect(geocoder.geocode('1318 Ross Ave')).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
  });

  it('geocodes a picked suggestion again by its label, county first, ignoring any place', async () => {
    const { geocoder, live, fallback } = chain({
      live: countySource({ find: async () => ({ status: 'ambiguous' }) }),
    });
    await expect(
      geocoder.geocode({ id: 'x', label: '4005 Ripa Avenue, MO 63125', place: PHOTON_PLACE }),
    ).resolves.toBeNull();
    expect(live.find).toHaveBeenCalledWith('4005 Ripa Avenue, MO 63125', expect.any(Object));
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('geocodes a suggestion with no place by its label', async () => {
    const { geocoder, live } = chain({ live: countySource({ find: match(true) }) });
    await geocoder.geocode({ id: 'x', label: '1318 Ross Ave 63146' });
    expect(live.find).toHaveBeenCalledWith('1318 Ross Ave 63146', expect.any(Object));
  });

  it('answers null for empty text without asking anyone', async () => {
    const { geocoder, live } = chain();
    await expect(geocoder.geocode('  ')).resolves.toBeNull();
    expect(live.find).not.toHaveBeenCalled();
  });

  describe('the City check (#58)', () => {
    const CITY_ANSWER = async () => ({ status: 'city', place: CITY });

    it('asks the City for the county match, with the typed text and its street', async () => {
      const { geocoder, city } = chain({ live: countySource({ find: match(false) }) });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toEqual(ROSS);
      expect(city.find).toHaveBeenCalledWith('1318 Ross Ave', '1318 Ross Ave', expect.any(Object));
    });

    // Rewritten with the owner's approval (2026-10-22, #88): the City has the
    // number and street in another ZIP, so text with no ZIP is no match (the
    // voter is asked for a ZIP); the City's ZIP gives the City place.
    it('is no match, never the county place, when the City has the address and no ZIP is typed', async () => {
      const { geocoder, fallback } = chain({
        live: countySource({ find: match(false) }),
        city: cityCheck(CITY_ANSWER),
      });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toBeNull();
      expect(fallback.geocode).not.toHaveBeenCalled();
    });

    it('gives the City place when the City has the address in the typed ZIP', async () => {
      const { geocoder, fallback } = chain({
        live: countySource({ find: match(false) }),
        city: cityCheck(CITY_ANSWER),
      });
      await expect(geocoder.geocode('1318 Ross Ave 63110')).resolves.toEqual(CITY);
      expect(fallback.geocode).not.toHaveBeenCalled();
    });

    it('runs although a ZIP that crosses the City line confirms the county match', async () => {
      const place = { ...ROSS, label: '1318 Ross Ave, Saint Louis, MO 63133' };
      const { geocoder, city } = chain({
        live: countySource({ find: match(true, place) }),
        city: cityCheck(CITY_ANSWER),
      });
      await expect(geocoder.geocode('1318 Ross Ave 63133')).resolves.toEqual(CITY);
      expect(city.find).toHaveBeenCalled();
    });

    it('runs although a town other than St. Louis confirms the county match', async () => {
      const { geocoder, city } = chain({
        live: countySource({ find: match(true) }),
        city: cityCheck(CITY_ANSWER),
      });
      // No ZIP typed: no match (owner decision, 2026-10-22), never the county place.
      await expect(geocoder.geocode('1318 Ross Ave, Olivette')).resolves.toBeNull();
      expect(city.find).toHaveBeenCalled();
    });

    it('is skipped when the text holds a ZIP entirely outside the City', async () => {
      const { geocoder, city } = chain({
        live: countySource({ find: match(true) }),
        city: cityCheck(CITY_ANSWER),
      });
      await expect(geocoder.geocode('1318 Ross Ave 63146')).resolves.toEqual(ROSS);
      expect(city.find).not.toHaveBeenCalled();
    });

    it('is skipped when the county record is itself in St. Louis City', async () => {
      const cityRecord = { ...CITY, label: '100 Washington Ave, St. Louis city, MO 63102' };
      const { geocoder, city } = chain({
        live: countySource({ find: match(false, cityRecord) }),
      });
      await expect(geocoder.geocode('100 Washington Ave')).resolves.toEqual(cityRecord);
      expect(city.find).not.toHaveBeenCalled();
    });

    it('is no match when the City has an address the text could mean, not exactly', async () => {
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        city: cityCheck(async () => ({ status: 'ambiguous' })),
      });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toBeNull();
    });

    it('is no match, never the county place, when the City geocoder is unavailable', async () => {
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        city: cityCheck(unavailable),
      });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toBeNull();
    });

    it('is no match when the City check gives an unexpected answer', async () => {
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        city: cityCheck(async () => undefined),
      });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toBeNull();
    });

    it('checks a Photon answer in St. Louis County too', async () => {
      const { geocoder, city } = chain({ city: cityCheck(CITY_ANSWER) });
      // No ZIP typed: no match (owner decision, 2026-10-22), never the county place.
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toBeNull();
      expect(city.find).toHaveBeenCalledWith('1318 Ross Ave', 'from Photon', expect.any(Object));
      await expect(geocoder.geocode('1318 Ross Ave 63110')).resolves.toEqual(CITY);
    });

    it('does not check a Photon answer in the City or in another county', async () => {
      const elsewhere = { ...PHOTON_PLACE, county: 'Saint Charles County' };
      for (const place of [CITY, elsewhere]) {
        const { geocoder, city } = chain({ fallback: photon({ geocode: async () => place }) });
        await expect(geocoder.geocode('200 N 2nd St')).resolves.toEqual(place);
        expect(city.find).not.toHaveBeenCalled();
      }
    });

    it('does not check when Photon has no match', async () => {
      const { geocoder, city } = chain({ fallback: photon({ geocode: async () => null }) });
      await expect(geocoder.geocode('1 Nowhere Ln')).resolves.toBeNull();
      expect(city.find).not.toHaveBeenCalled();
    });
  });

  describe('aborting', () => {
    it('rejects with AbortError while the live layer is asked, and asks no one else', async () => {
      const { geocoder, hosted, fallback } = chain({ live: countySource({ find: hang }) });
      const controller = new AbortController();
      const pending = geocoder
        .geocode('1318 Ross Ave', { signal: controller.signal })
        .catch((e) => e);
      controller.abort();
      expect((await pending).name).toBe('AbortError');
      expect(hosted.find).not.toHaveBeenCalled();
      expect(fallback.geocode).not.toHaveBeenCalled();
    });

    it('rejects with AbortError when aborted right after the county answers', async () => {
      const controller = new AbortController();
      const { geocoder } = chain({
        live: countySource({
          find: async () => {
            controller.abort();
            return { status: 'match', place: ROSS, confirmed: true };
          },
        }),
      });
      const error = await geocoder
        .geocode('1318 Ross Ave 63146', { signal: controller.signal })
        .catch((e) => e);
      expect(error.name).toBe('AbortError');
    });

    it('rejects with AbortError when suggestions are aborted right after the county answers', async () => {
      const controller = new AbortController();
      const { geocoder } = chain({
        live: countySource({
          suggest: async () => {
            controller.abort();
            return [{ id: 'c', label: ROSS.label }];
          },
        }),
      });
      const error = await geocoder
        .suggest('1318 Ross', { signal: controller.signal })
        .catch((e) => e);
      expect(error.name).toBe('AbortError');
    });

    it('rejects with AbortError when aborted as the City check answers', async () => {
      const controller = new AbortController();
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        city: cityCheck(async () => {
          controller.abort();
          return { status: 'none' };
        }),
      });
      const error = await geocoder
        .geocode('1318 Ross Ave', { signal: controller.signal })
        .catch((e) => e);
      expect(error.name).toBe('AbortError');
    });

    it('rejects with AbortError during the City check', async () => {
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        city: cityCheck((_text, _street, options) => hang(_text, options)),
      });
      const controller = new AbortController();
      const pending = geocoder
        .geocode('1318 Ross Ave', { signal: controller.signal })
        .catch((e) => e);
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();
      expect((await pending).name).toBe('AbortError');
    });

    it('rejects with AbortError when Photon is cancelled after a county no match', async () => {
      const { geocoder } = chain({ fallback: photon({ geocode: hang }) });
      const controller = new AbortController();
      const pending = geocoder
        .geocode('1 Nowhere Ln', { signal: controller.signal })
        .catch((e) => e);
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();
      expect((await pending).name).toBe('AbortError');
    });
  });
});

describe('suggest', () => {
  const COUNTY_SUGGESTION = { id: 'c', label: ROSS.label };

  it('lists county suggestions, asking nothing else', async () => {
    const { geocoder, hosted, fallback } = chain({
      live: countySource({ suggest: async () => [COUNTY_SUGGESTION] }),
    });
    await expect(geocoder.suggest('1318 Ross')).resolves.toEqual([COUNTY_SUGGESTION]);
    expect(hosted.suggest).not.toHaveBeenCalled();
    expect(fallback.suggest).not.toHaveBeenCalled();
  });

  it('asks the hosted copy when the live layer is unavailable', async () => {
    const { geocoder, fallback } = chain({
      live: countySource({ suggest: unavailable }),
      hosted: countySource({ suggest: async () => [COUNTY_SUGGESTION] }),
    });
    await expect(geocoder.suggest('1318 Ross')).resolves.toEqual([COUNTY_SUGGESTION]);
    expect(fallback.suggest).not.toHaveBeenCalled();
  });

  it('asks Photon when the county has none, as for a City address', async () => {
    const { geocoder, hosted, fallback } = chain();
    const suggestions = await geocoder.suggest('1200 Market');
    expect(suggestions.map((s) => s.label)).toEqual(['from Photon']);
    expect(hosted.suggest).not.toHaveBeenCalled();
    expect(fallback.suggest).toHaveBeenCalledWith('1200 Market', expect.any(Object));
  });

  it('asks Photon when both county layers are unavailable', async () => {
    const { geocoder } = chain({
      live: countySource({ suggest: unavailable }),
      hosted: countySource({ suggest: unavailable }),
    });
    expect((await geocoder.suggest('1318 Ross')).map((s) => s.label)).toEqual(['from Photon']);
  });

  it('shows none when the county has none and Photon is unavailable', async () => {
    const { geocoder } = chain({ fallback: photon({ suggest: unavailable }) });
    await expect(geocoder.suggest('1318 Ross')).resolves.toEqual([]);
  });

  it('rejects when every source is unavailable', async () => {
    const { geocoder } = chain({
      live: countySource({ suggest: unavailable }),
      hosted: countySource({ suggest: unavailable }),
      fallback: photon({ suggest: unavailable }),
    });
    await expect(geocoder.suggest('1318 Ross')).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });

  it('rejects with AbortError when aborted, asking no one else', async () => {
    const { geocoder, hosted, fallback } = chain({ live: countySource({ suggest: hang }) });
    const controller = new AbortController();
    const pending = geocoder.suggest('1318 Ross', { signal: controller.signal }).catch((e) => e);
    controller.abort();
    expect((await pending).name).toBe('AbortError');
    expect(hosted.suggest).not.toHaveBeenCalled();
    expect(fallback.suggest).not.toHaveBeenCalled();
  });

  it('returns none for empty text without asking anyone', async () => {
    const { geocoder, live } = chain();
    await expect(geocoder.suggest(' ')).resolves.toEqual([]);
    expect(live.suggest).not.toHaveBeenCalled();
  });
});
