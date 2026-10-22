import election, { jurisdictions as config } from '../config/election.js';
import referrals from '../config/referrals.js';
import * as arcgis from './arcgis.js';
import {
  CITY_PRECINCT_CODE,
  cityPrecinctId,
  county,
  city,
  isPrecinctCode,
  jurisdictionFor,
  loadCityClient,
} from './jurisdictions.js';

describe('precinct codes', () => {
  it('accepts County and City codes and nothing else', () => {
    for (const code of ['CC007', 'BON001', 'W01P12', 'W14P21']) {
      expect(isPrecinctCode(code)).toBe(true);
    }
    for (const code of ['cc007', 'w01p12', 'W1P12', 'W01P123', 'W 1 P 12', '', 'CC007 ', null]) {
      expect(isPrecinctCode(code)).toBe(false);
    }
  });

  it('never lets one shape match the other', () => {
    expect(arcgis.PRECINCT_CODE.test('W01P12')).toBe(false);
    expect(CITY_PRECINCT_CODE.test('CC007')).toBe(false);
    expect(CITY_PRECINCT_CODE.test('WWP001')).toBe(false);
  });

  it('picks the jurisdiction from the code shape', () => {
    expect(jurisdictionFor('CC007')).toBe(county);
    expect(jurisdictionFor('W01P12')).toBe(city);
    expect(jurisdictionFor('nope')).toBeNull();
    expect(jurisdictionFor(undefined)).toBeNull();
  });

  it("turns a City code into the City precincts layer's ID", () => {
    expect(cityPrecinctId('W01P12')).toBe('W 1 P 12');
    expect(cityPrecinctId('W14P05')).toBe('W 14 P 5');
    expect(() => cityPrecinctId('CC007')).toThrow(arcgis.NotFound);
  });
});

describe('adapters', () => {
  it('carry their config block', () => {
    expect(county.id).toBe('county');
    expect(county.config).toBe(config.county);
    expect(city.id).toBe('city');
    expect(city.config).toBe(config.city);
  });

  it("link each board's own lookup and site", () => {
    expect(county.officialLookupUrl).toBe(election.officialLookupUrl);
    expect(county.boardSiteUrl).toBe(election.countySiteUrl);
    expect(city.officialLookupUrl).toBe(referrals.stlCityLookup.url);
    expect(city.boardSiteUrl).toBe(referrals.stlCityBoard.url);
  });

  it("the County adapter calls today's County data code", async () => {
    expect(county.code).toBe(arcgis.PRECINCT_CODE);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ features: [] }), { status: 200 })),
      );
    try {
      await expect(county.getPrecinct('nope')).rejects.toBeInstanceOf(arcgis.NotFound);
      await expect(county.getPrecinct('ZZ999')).rejects.toBeInstanceOf(arcgis.NotFound);
      await county.getPolls();
      await county.getEarlyVotingSites();
      const urls = fetchSpy.mock.calls.map(([input]) => decodeURIComponent(String(input)));
      expect(urls[0]).toContain(`${election.layers.precincts}/query`);
      expect(urls[0]).toContain("precinct='ZZ999'");
      expect(urls.some((u) => u.includes(election.layers.polls) && u.includes('where=1=1'))).toBe(
        true,
      );
      expect(urls.some((u) => u.includes(election.absenteeWhere.replace(/ /g, '+')))).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('the City stub answers not found without a request (until #89)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      for (const call of [
        city.getPrecinct('W01P12'),
        city.getPolls(),
        city.getEarlyVotingSites(),
        city.getOutline('W01P12'),
      ]) {
        await expect(call).rejects.toBeInstanceOf(arcgis.NotFound);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('loads the City data client on demand, once (#87)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const client = await loadCityClient();
      expect(await loadCityClient()).toBe(client);
      for (const name of [
        'getCityPrecinctAtPoint',
        'getCityPrecinctById',
        'getCityPrecinctGeometry',
        'getCityDistrictsAtPoint',
        'getCityDistrictsForPrecinct',
        'getCityPolls',
        'getCityEarlyVotingSites',
        'isInCityBoundary',
      ]) {
        expect(typeof client[name], name).toBe('function');
      }
      // Loading it asks nothing.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('the default config export still reads as the County block', () => {
    expect(election.serviceRoot).toBe(config.county.serviceRoot);
    expect(election.countySiteUrl).toBe(config.county.boardSiteUrl);
    expect(election.jurisdictions).toBe(config);
  });
});
