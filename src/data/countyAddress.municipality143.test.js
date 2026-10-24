// Issue #143: a County address typed with its municipality, when that is not
// the record's mailing city, was no match. 41 S Central Ave 63105 is in
// Clayton (MSAG_COMMUNITY_NAME CLAYTON) with the mailing city Saint Louis, as
// the live county layer recorded it (docs/raw/fixtures/county-address-central-ave.json).
import central from '../../docs/raw/fixtures/county-address-central-ave.json';
import { createCountyAddressSource, LIVE_URL } from './countyAddress.js';
import { createGeocoder } from './geocoder.js';

const respond = (body) => ({ ok: true, status: 200, json: async () => body });

function county(body = central) {
  return createCountyAddressSource({
    url: LIVE_URL,
    fetch: vi.fn(async () => respond(body)),
    precinctsAt: vi.fn(async () => new Set(['P1'])),
  });
}

// The fixture with its records' MSAG_COMMUNITY_NAME set to `name`.
function withCommunity(name) {
  return {
    ...central,
    features: central.features.map((f) => ({
      ...f,
      attributes: { ...f.attributes, MSAG_COMMUNITY_NAME: name },
    })),
  };
}

const SOUTH = {
  status: 'match',
  confirmed: true,
  place: {
    lat: 38.64933480391182,
    lng: -90.33874215297153,
    state: 'Missouri',
    county: 'Saint Louis County',
    label: '41 S Central Ave, Saint Louis, MO 63105',
  },
};

describe('issue #143: a County address typed with its municipality', () => {
  it('matches 41 S Central Ave typed with Clayton, its municipality, and its ZIP', async () => {
    await expect(county().find('41 S Central Ave, Clayton, MO 63105')).resolves.toEqual(SOUTH);
  });

  it('matches it typed with Clayton and no ZIP, or with the town in another case', async () => {
    await expect(county().find('41 S Central Ave, Clayton')).resolves.toEqual(SOUTH);
    await expect(county().find('41 s central ave clayton mo')).resolves.toEqual(SOUTH);
  });

  it("matches Photon's label for it, which a picked suggestion is geocoded by", async () => {
    await expect(county().find('41 South Central Avenue, Clayton, MO 63105')).resolves.toEqual(
      SOUTH,
    );
  });

  it('opens the county place when that pick goes through the app chain', async () => {
    const label = '41 South Central Avenue, Clayton, MO 63105';
    const fallback = {
      geocode: vi.fn(async () => null),
      suggest: vi.fn(async () => [{ id: 'p', label }]),
    };
    // The City has no such address.
    const cityCheck = { find: vi.fn(async () => ({ status: 'none' })) };
    const geocoder = createGeocoder({ sources: [county()], fallback, cityCheck });
    await expect(geocoder.geocode({ id: 'p', label })).resolves.toEqual(SOUTH.place);
    expect(fallback.geocode).not.toHaveBeenCalled();
  });

  it('keeps the strict rules: another town, no direction or another ZIP is no match', async () => {
    await expect(county().find('41 S Central Ave, Ladue, MO 63105')).resolves.not.toMatchObject({
      status: 'match',
    });
    // 41 N and 41 S Central Ave are both in Clayton.
    await expect(county().find('41 Central Ave, Clayton')).resolves.not.toMatchObject({
      status: 'match',
    });
    await expect(county().find('41 S Central Ave, Clayton, MO 63117')).resolves.toEqual({
      status: 'none',
    });
  });

  it('never takes a county-wide community name for a town', async () => {
    const find = (body, text) => county(body).find(text);
    for (const name of ['ST LOUIS COUNTY', 'JEFFERSON COUNTY']) {
      await expect(
        find(withCommunity(name), `41 S Central Ave, ${name}, MO 63105`),
      ).resolves.not.toMatchObject({ status: 'match' });
    }
    await expect(
      find(withCommunity('ST LOUIS CITY'), '41 S Central Ave, St. Louis City, MO 63105'),
    ).resolves.not.toMatchObject({ status: 'match' });
  });
});
