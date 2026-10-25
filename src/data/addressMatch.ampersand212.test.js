// Issue #212: a County record's & reads as AND (TOWN & COUNTRY is Town and
// Country, #143), but a typed & was dropped like other punctuation, so
// "Town & Country" read as "town country" and matched no community. A typed &
// reads as "and" now, and never makes text match a wrong community or precinct.
import { words } from './addressMatch.js';
import { createCountyAddressSource, LIVE_URL } from './countyAddress.js';

// One address point as the county layers return it (f=json, outSR=4326).
function point(attributes, [x, y] = [-90.4581, 38.6822]) {
  return {
    attributes: {
      OBJECTID: 1,
      ADRNO: 1318,
      ADRDIR: '',
      ADRSTR: 'ROSS',
      ADRSUF: 'AVE',
      UNITDESC: '',
      UNITNO: '',
      MAILINGCITY: 'SAINT LOUIS',
      ZIPCODE: '63146',
      FULL_ADDRESS: '1318 ROSS AVE',
      STATUS: 'Current',
      MUNI: 'UNI',
      ...attributes,
    },
    geometry: { x, y },
  };
}

const respond = (body) => ({ ok: true, status: 200, json: async () => body });

function county(features, precincts = ['P1']) {
  return createCountyAddressSource({
    url: LIVE_URL,
    fetch: vi.fn(async () => respond({ features })),
    precinctsAt: vi.fn(async () => new Set(precincts)),
  });
}

const TOWN_AND_COUNTRY = point({ MSAG_COMMUNITY_NAME: 'TOWN & COUNTRY' });
const LADUE = point({ MSAG_COMMUNITY_NAME: 'LADUE' });

describe('issue #212: a typed & reads as "and"', () => {
  it('reads & as "and" in words(), with or without spaces around it', () => {
    expect(words('Town & Country')).toEqual(['town', 'and', 'country']);
    expect(words('Town&Country')).toEqual(['town', 'and', 'country']);
    expect(words('Town & Country')).toEqual(words('Town and Country'));
  });

  it('matches a TOWN & COUNTRY record typed with "Town & Country"', async () => {
    for (const text of [
      '1318 Ross Ave, Town & Country',
      '1318 Ross Ave, Town&Country',
      '1318 Ross Ave Town & Country MO',
      '1318 Ross Ave, Town & Country, MO 63146',
    ]) {
      await expect(county([TOWN_AND_COUNTRY]).find(text), text).resolves.toMatchObject({
        status: 'match',
        confirmed: true,
      });
    }
  });

  it('matches a street the county writes with AND typed with &', async () => {
    const lewis = [
      point(
        {
          OBJECTID: 61975,
          ADRNO: 9300,
          ADRSTR: 'LEWIS AND CLARK',
          ADRSUF: 'BLVD',
          ZIPCODE: '63137',
          FULL_ADDRESS: '9300 LEWIS AND CLARK BLVD',
          MSAG_COMMUNITY_NAME: 'BELLEFONTAINE NEIGHBORS',
        },
        [-90.2396, 38.7297],
      ),
      point(
        {
          OBJECTID: 105915,
          ADRNO: 9300,
          ADRSTR: 'LEWIS AND CLARK',
          ADRSUF: 'BLVD',
          ZIPCODE: '63137',
          UNITDESC: 'UNIT',
          UNITNO: 'A',
          FULL_ADDRESS: '9300 LEWIS AND CLARK BLVD UNIT A',
          MSAG_COMMUNITY_NAME: 'JENNINGS',
        },
        [-90.24, 38.7298],
      ),
    ];
    await expect(
      county(lewis, ['P1', 'P2']).find('9300 Lewis & Clark Blvd Unit A, Bellefontaine Neighbors'),
    ).resolves.toMatchObject({ status: 'match', place: { lng: -90.24 } });
  });

  it('never matches a wrong community, a wrong ZIP or a partial name', async () => {
    const notMatch = { status: expect.not.stringMatching(/^match$/) };
    // Another town's record, mailed as Saint Louis.
    await expect(county([LADUE]).find('1318 Ross Ave, Town & Country')).resolves.toMatchObject(
      notMatch,
    );
    await expect(
      county([TOWN_AND_COUNTRY]).find('1318 Ross Ave, Town & Country, MO 63117'),
    ).resolves.toMatchObject(notMatch);
    for (const text of [
      '1318 Ross Ave, Town Country',
      '1318 Ross Ave, Town &',
      '1318 Ross Ave & Elm St',
    ]) {
      await expect(county([TOWN_AND_COUNTRY]).find(text), text).resolves.toMatchObject(notMatch);
      await expect(county([LADUE]).find(text), text).resolves.toMatchObject(notMatch);
    }
  });
});
