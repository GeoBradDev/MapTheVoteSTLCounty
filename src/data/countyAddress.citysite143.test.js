// Issue #143, third review finding: at an address with City and County
// records (6200 Enright Ave 63130: University City units and St. Louis City
// units, all mailed as Saint Louis), a typed County town must not turn a City
// resident's text into the County place. Only a typed County unit says which
// side the voter is on.
import { createCountyAddressSource, LIVE_URL } from './countyAddress.js';

function record(attributes, [x, y]) {
  return {
    attributes: {
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

const RECORDS = [
  record(
    { OBJECTID: 1, UNITNO: '300', MUNI: 'UCT', MSAG_COMMUNITY_NAME: 'UNIVERSITY CITY' },
    [-90.30171, 38.65641],
  ),
  record(
    { OBJECTID: 2, UNITNO: '301', MUNI: 'UCT', MSAG_COMMUNITY_NAME: 'UNIVERSITY CITY' },
    [-90.30172, 38.65642],
  ),
  record(
    { OBJECTID: 3, UNITNO: '111', MUNI: 'STL', MSAG_COMMUNITY_NAME: 'ST LOUIS CITY' },
    [-90.3015, 38.6566],
  ),
];

const find = (text) =>
  createCountyAddressSource({
    url: LIVE_URL,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ features: RECORDS }) }),
    precinctsAt: async () => new Set(['UNV004']),
  }).find(text);

describe('issue #143: a County town typed at an address with City records', () => {
  it('is no match for a City unit or no unit at all', async () => {
    await expect(find('6200 Enright Ave Apt 111, University City')).resolves.toEqual({
      status: 'ambiguous',
    });
    await expect(find('6200 Enright Ave, University City')).resolves.toEqual({
      status: 'ambiguous',
    });
  });

  it('still answers a County unit, and the City unit with its ZIP', async () => {
    await expect(find('6200 Enright Ave Apt 301, University City')).resolves.toMatchObject({
      status: 'match',
      place: { county: 'Saint Louis County', lng: -90.30172 },
    });
    await expect(find('6200 Enright Ave Apt 111, 63130')).resolves.toMatchObject({
      status: 'match',
      place: { county: 'St. Louis city' },
    });
  });
});
