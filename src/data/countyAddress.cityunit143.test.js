// Issue #143, second review finding: a typed County municipality picks County
// records, so a unit it then picks is never a City unit at the same address.
// Live data: 6200 Enright Ave 63130, 31 units in University City (MUNI UCT,
// MSAG UNIVERSITY CITY) and 27 in St. Louis City (MUNI STL, MSAG ST LOUIS
// CITY), all mailed as Saint Louis.
import { createCountyAddressSource, LIVE_URL } from './countyAddress.js';

function record(attributes, [x, y]) {
  return {
    attributes: {
      OBJECTID: 1,
      ADRNO: 6200,
      ADRDIR: '',
      ADRSTR: 'ENRIGHT',
      ADRSUF: 'AVE',
      UNITDESC: 'APT',
      MAILINGCITY: 'SAINT LOUIS',
      ZIPCODE: '63130',
      STATUS: 'Current',
      ...attributes,
    },
    geometry: { x, y },
  };
}

const COUNTY_UNIT = record(
  { OBJECTID: 1, UNITNO: '300', MUNI: 'UCT', MSAG_COMMUNITY_NAME: 'UNIVERSITY CITY' },
  [-90.30171, 38.65641],
);
const CITY_UNIT = record(
  { OBJECTID: 2, UNITNO: '111', MUNI: 'STL', MSAG_COMMUNITY_NAME: 'ST LOUIS CITY' },
  [-90.3015, 38.6566],
);

const find = (text) =>
  createCountyAddressSource({
    url: LIVE_URL,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ features: [COUNTY_UNIT, CITY_UNIT] }),
    }),
    precinctsAt: async () => new Set(['UNV004']),
  }).find(text);

describe('issue #143: a County municipality typed with a unit at a City and County address', () => {
  it('never answers with the City unit', async () => {
    const result = await find('6200 Enright Ave Apt 111, University City');
    expect(result.place?.county).not.toBe('St. Louis city');
  });

  it('still answers the County unit it names', async () => {
    await expect(find('6200 Enright Ave Apt 300, University City')).resolves.toMatchObject({
      status: 'match',
      place: { county: 'Saint Louis County', lng: -90.30171 },
    });
  });
});
