// Issue #58, review finding, rewritten with the owner's approval (2026-10-22,
// #88): a pick opens the place of the jurisdiction its label names. The
// county's suggestion of a City twin (its label holds the county record's
// ZIP) is the county place; the City's own suggestion ("St. Louis City" and
// the City parcel's ZIP) is the City place.
import washington from '../../docs/raw/fixtures/city-geocode-washington-ave.json';
import { createCityAddressCheck } from './cityAddress.js';
import { createGeocoder } from './geocoder.js';

const COUNTY = Object.freeze({
  lat: 38.7067,
  lng: -90.3185,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '6135 Washington Ave, Saint Louis, MO 63134',
});

function chain() {
  // The county has the 63134 record only: another typed ZIP is no match.
  const county = {
    find: vi.fn(async (text) =>
      /\b63112\b/.test(text)
        ? { status: 'none' }
        : { status: 'match', place: COUNTY, confirmed: /\b63134\b/.test(text) },
    ),
    suggest: vi.fn(async () => [{ id: 'c', label: COUNTY.label }]),
  };
  const fallback = { geocode: vi.fn(async () => null), suggest: vi.fn(async () => []) };
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => washington }));
  const cityCheck = createCityAddressCheck({ fetch });
  return createGeocoder({ sources: [county], fallback, cityCheck });
}

describe('issue #58: picking a suggestion of a City twin', () => {
  it("a pick of the county's suggestion gives the county place", async () => {
    const geocoder = chain();
    const suggestions = await geocoder.suggest('6135 Washington');
    const pick = suggestions.find((s) => s.label === COUNTY.label);
    await expect(geocoder.geocode(pick)).resolves.toEqual(COUNTY);
  });

  it("a pick of the City's suggestion gives the City place", async () => {
    const geocoder = chain();
    const suggestions = await geocoder.suggest('6135 Washington');
    const pick = suggestions.find((s) => /St\. Louis City,/.test(s.label));
    expect(pick?.label).toBe('6135 Washington Ave, St. Louis City, MO 63112');
    await expect(geocoder.geocode(pick)).resolves.toMatchObject({
      county: 'St. Louis city',
      label: '6135 Washington Ave, St. Louis City, MO 63112',
    });
  });

  it('still trusts a county-only ZIP the voter typed', async () => {
    const geocoder = chain();
    await expect(geocoder.geocode('6135 Washington Ave, Saint Louis, MO 63134')).resolves.toEqual(
      COUNTY,
    );
  });
});
