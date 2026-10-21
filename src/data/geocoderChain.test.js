import { createGeocoder, CROSS_CHECK_MS, GeocoderUnavailableError } from './geocoder.js';

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

function photon({ geocode, suggest, findPlaces } = {}) {
  return {
    geocode: vi.fn(geocode ?? (async () => PHOTON_PLACE)),
    suggest: vi.fn(
      suggest ?? (async () => [{ id: 'p', label: 'from Photon', place: PHOTON_PLACE }]),
    ),
    findPlaces: vi.fn(findPlaces ?? (async () => [])),
  };
}

const match =
  (confirmed, place = ROSS) =>
  async () => ({ status: 'match', place, confirmed });

function chain({ live = countySource(), hosted = countySource(), fallback = photon() } = {}) {
  return {
    live,
    hosted,
    fallback,
    geocoder: createGeocoder({ sources: [live, hosted], fallback }),
  };
}

describe('createGeocoder', () => {
  it('is a frozen geocoder with suggest and geocode', () => {
    const { geocoder } = chain();
    expect(Object.isFrozen(geocoder)).toBe(true);
    expect(Object.keys(geocoder).sort()).toEqual(['geocode', 'suggest']);
  });
});

describe('geocode', () => {
  it('answers from the live county layer when it matches, asking nothing else', async () => {
    const { geocoder, hosted, fallback } = chain({ live: countySource({ find: match(true) }) });
    await expect(geocoder.geocode('1318 Ross Ave 63146')).resolves.toEqual(ROSS);
    expect(hosted.find).not.toHaveBeenCalled();
    expect(fallback.geocode).not.toHaveBeenCalled();
    expect(fallback.findPlaces).not.toHaveBeenCalled();
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

  describe('a county match with no ZIP or town to confirm it', () => {
    it('is no match when St. Louis City also has the address', async () => {
      const { geocoder, fallback } = chain({
        live: countySource({ find: match(false) }),
        fallback: photon({ findPlaces: async () => [CITY] }),
      });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toBeNull();
      expect(fallback.findPlaces).toHaveBeenCalledWith('1318 Ross Ave', expect.any(Object));
    });

    it('is not cross-checked when the county record is itself in St. Louis City', async () => {
      const cityRecord = { ...CITY, label: '100 Washington Ave, St. Louis city, MO 63102' };
      const { geocoder, fallback } = chain({
        live: countySource({ find: match(false, cityRecord) }),
        fallback: photon({ findPlaces: async () => [CITY] }),
      });
      await expect(geocoder.geocode('100 Washington Ave')).resolves.toEqual(cityRecord);
      expect(fallback.findPlaces).not.toHaveBeenCalled();
    });

    it('stands when only county places fit in Photon too', async () => {
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        fallback: photon({ findPlaces: async () => [ROSS] }),
      });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toEqual(ROSS);
    });

    it('stands when Photon is unavailable', async () => {
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        fallback: photon({ findPlaces: unavailable }),
      });
      await expect(geocoder.geocode('1318 Ross Ave')).resolves.toEqual(ROSS);
    });

    it('stands when Photon is slow, and the Photon request is cancelled', async () => {
      vi.useFakeTimers();
      try {
        let photonSignal;
        const { geocoder } = chain({
          live: countySource({ find: match(false) }),
          fallback: photon({
            findPlaces: (text, options) => {
              photonSignal = options.signal;
              return hang(text, options);
            },
          }),
        });
        const pending = geocoder.geocode('1318 Ross Ave');
        await vi.advanceTimersByTimeAsync(CROSS_CHECK_MS);
        await expect(pending).resolves.toEqual(ROSS);
        expect(photonSignal.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the cross-check short', () => {
      expect(CROSS_CHECK_MS).toBeLessThanOrEqual(3000);
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

    it('rejects with AbortError when aborted as the City cross-check answers', async () => {
      const controller = new AbortController();
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        fallback: photon({
          findPlaces: async () => {
            controller.abort();
            return [];
          },
        }),
      });
      const error = await geocoder
        .geocode('1318 Ross Ave', { signal: controller.signal })
        .catch((e) => e);
      expect(error.name).toBe('AbortError');
    });

    it('rejects with AbortError during the City cross-check', async () => {
      const { geocoder } = chain({
        live: countySource({ find: match(false) }),
        fallback: photon({ findPlaces: hang }),
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
