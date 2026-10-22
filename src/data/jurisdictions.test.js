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

  it("the County adapter is today's County data code", () => {
    expect(county.getPrecinct).toBe(arcgis.getPrecinctById);
    expect(county.getPolls).toBe(arcgis.getPolls);
    expect(county.getEarlyVotingSites).toBe(arcgis.getAbsenteeSites);
    expect(county.getOutline).toBe(arcgis.getPrecinctGeometry);
  });

  it('the City stub answers not found without a request (#87 fills it in)', async () => {
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

  it('the default config export still reads as the County block', () => {
    expect(election.serviceRoot).toBe(config.county.serviceRoot);
    expect(election.countySiteUrl).toBe(config.county.boardSiteUrl);
    expect(election.jurisdictions).toBe(config);
  });
});
