// Issue #18: an address with several county records needs a precinct check.
// When that check fails or is slow, the lookup could not finish: with
// reportUnavailable it says so, and it still never answers a place or asks
// another source (#49). Also: every county source down and Photon finding
// nothing is a search that could not finish, not a no match.
import { createCountyAddressSource, LIVE_URL, PRECINCT_CHECK_MS } from './countyAddress.js';
import { createGeocoder, GeocoderUnavailableError } from './geocoder.js';

function point(attributes, [x, y]) {
  return {
    attributes: {
      OBJECTID: 1,
      ADRNO: 8025,
      ADRDIR: '',
      ADRSTR: 'MARYLAND',
      ADRSUF: 'AVE',
      UNITDESC: '',
      UNITNO: '',
      MAILINGCITY: 'SAINT LOUIS',
      ZIPCODE: '63105',
      FULL_ADDRESS: '8025 MARYLAND AVE',
      STATUS: 'Current',
      MUNI: 'CLA',
      ...attributes,
    },
    geometry: { x, y },
  };
}

const RECORDS = [
  point({ OBJECTID: 3, UNITDESC: 'APT', UNITNO: '5A' }, [-90.34087, 38.65221]),
  point({ OBJECTID: 4, UNITDESC: 'APT', UNITNO: '13B' }, [-90.34077, 38.65246]),
];
const fetchRecords = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ features: RECORDS }),
});
const TEXT = '8025 Maryland Ave 63105';

const down = async () => {
  throw new Error('HTTP 503');
};

describe('county precinct check failing (#18)', () => {
  it('is unavailable with reportUnavailable, ambiguous without it', async () => {
    const source = createCountyAddressSource({
      url: LIVE_URL,
      fetch: fetchRecords,
      precinctsAt: down,
    });
    await expect(source.find(TEXT, { reportUnavailable: true })).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(source.find(TEXT)).resolves.toEqual({ status: 'ambiguous' });
  });

  it('is unavailable when the check is too slow', async () => {
    vi.useFakeTimers();
    try {
      const source = createCountyAddressSource({
        url: LIVE_URL,
        fetch: fetchRecords,
        precinctsAt: () => new Promise(() => {}),
      });
      const pending = source.find(TEXT, { reportUnavailable: true });
      await vi.advanceTimersByTimeAsync(PRECINCT_CHECK_MS);
      await expect(pending).resolves.toEqual({ status: 'unavailable' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still answers ambiguous for two precincts', async () => {
    const source = createCountyAddressSource({
      url: LIVE_URL,
      fetch: fetchRecords,
      precinctsAt: async () => new Set(['P1', 'P2']),
    });
    await expect(source.find(TEXT, { reportUnavailable: true })).resolves.toEqual({
      status: 'ambiguous',
    });
  });
});

describe('the geocoder with an unavailable county answer (#18)', () => {
  function chain(countyAnswer, fallbackAnswer = async () => null) {
    const live = { find: vi.fn(countyAnswer), suggest: vi.fn() };
    const hosted = { find: vi.fn(async () => ({ status: 'none' })), suggest: vi.fn() };
    const fallback = { geocode: vi.fn(fallbackAnswer), suggest: vi.fn() };
    const cityCheck = { find: vi.fn(async () => ({ status: 'none' })) };
    return {
      live,
      hosted,
      fallback,
      geocoder: createGeocoder({ sources: [live, hosted], fallback, cityCheck }),
    };
  }

  it('rejects as unavailable, asking no other source', async () => {
    const { geocoder, live, hosted, fallback } = chain(async () => ({ status: 'unavailable' }));
    await expect(geocoder.geocode(TEXT, { reportUnavailable: true })).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
    expect(live.find).toHaveBeenCalledWith(TEXT, {
      signal: undefined,
      reportUnavailable: true,
    });
    expect(hosted.find).not.toHaveBeenCalled();
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('is no match without the option, asking no other source', async () => {
    const { geocoder, hosted, fallback } = chain(async () => ({ status: 'unavailable' }));
    await expect(geocoder.geocode(TEXT)).resolves.toBeNull();
    expect(hosted.find).not.toHaveBeenCalled();
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('rejects as unavailable when no county source answered and Photon has nothing', async () => {
    const all = createGeocoder({
      sources: [{ find: down, suggest: vi.fn() }],
      fallback: { geocode: async () => null, suggest: vi.fn() },
      cityCheck: { find: async () => ({ status: 'none' }) },
    });
    await expect(all.geocode('1 Nowhere Ln', { reportUnavailable: true })).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
    await expect(all.geocode('1 Nowhere Ln')).resolves.toBeNull();
  });
});
