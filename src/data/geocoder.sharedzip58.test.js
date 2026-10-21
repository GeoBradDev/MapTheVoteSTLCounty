// Issue #58, owner decision (2026-10-21): when the county record and the City
// parcel share number, street and ZIP, the address is in both lists and the
// lookup cannot tell which one the voter means: no match (Use my location and
// the county's official lookup), never the county precinct and not the City
// referral. A City twin in another ZIP still gets the City referral.
// Frozen: written red before the fix.
import brookings from '../../docs/raw/fixtures/city-geocode-brookings-dr.json';
import washington from '../../docs/raw/fixtures/city-geocode-washington-ave.json';
import { createCityAddressCheck } from './cityAddress.js';
import { createGeocoder } from './geocoder.js';

const BROOKINGS = Object.freeze({
  lat: 38.648,
  lng: -90.305,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '1 Brookings Dr, Saint Louis, MO 63130',
});
const WASHINGTON = Object.freeze({
  lat: 38.7067,
  lng: -90.3185,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '6135 Washington Ave, Saint Louis, MO 63134',
});

function chain(place, answer) {
  const county = {
    find: vi.fn(async () => ({ status: 'match', place, confirmed: false })),
    suggest: vi.fn(async () => [{ id: 'c', label: place.label }]),
  };
  const fallback = { geocode: vi.fn(async () => null), suggest: vi.fn(async () => []) };
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => answer }));
  return createGeocoder({
    sources: [county],
    fallback,
    cityCheck: createCityAddressCheck({ fetch }),
  });
}

describe('a county record and a City parcel in the same ZIP (#58)', () => {
  it.each(['1 Brookings Dr', '1 Brookings Dr, St. Louis, MO 63130', '1 Brookings Dr 63130'])(
    '%s is no match',
    async (text) => {
      await expect(chain(BROOKINGS, brookings).geocode(text)).resolves.toBeNull();
    },
  );

  it('a pick of the county suggestion is no match too', async () => {
    const geocoder = chain(BROOKINGS, brookings);
    const [pick] = await geocoder.suggest('1 Brookings');
    await expect(geocoder.geocode(pick)).resolves.toBeNull();
  });

  it('a City twin in another ZIP still gets the City place', async () => {
    await expect(
      chain(WASHINGTON, washington).geocode('6135 Washington Ave'),
    ).resolves.toMatchObject({
      county: 'St. Louis city',
      label: '6135 Washington Ave, St. Louis, MO 63112',
    });
  });
});
