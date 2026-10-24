// Issue #143, fourth review finding: "St. Louis City" typed at an address with
// City and County records (6200 Enright Ave 63130: University City units and
// St. Louis City units) is the City place, as before #143; the town picks
// only the City records there.
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
    { OBJECTID: 2, UNITNO: '111', MUNI: 'STL', MSAG_COMMUNITY_NAME: 'ST LOUIS CITY' },
    [-90.3015, 38.6566],
  ),
  record(
    { OBJECTID: 3, UNITNO: '112', MUNI: 'STL', MSAG_COMMUNITY_NAME: 'ST LOUIS CITY' },
    [-90.3015, 38.6566],
  ),
];

const find = (text) =>
  createCountyAddressSource({
    url: LIVE_URL,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ features: RECORDS }) }),
    precinctsAt: async () => new Set(['P1']),
  }).find(text);

describe('issue #143: St. Louis City typed at an address with City and County records', () => {
  it('is the City place', async () => {
    for (const text of ['6200 Enright Ave, St. Louis City', '6200 Enright Ave, Saint Louis City']) {
      await expect(find(text)).resolves.toMatchObject({
        status: 'match',
        place: { county: 'St. Louis city' },
      });
    }
  });
});
