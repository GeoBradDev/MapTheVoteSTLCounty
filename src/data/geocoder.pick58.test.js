// Issue #58, review finding: a City voter who picks the county's suggestion
// (its label ends with the county record's ZIP, which the voter never typed)
// must not get a county precinct either. Frozen: written red before the fix.
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
  const county = {
    find: vi.fn(async () => ({ status: 'match', place: COUNTY, confirmed: true })),
    suggest: vi.fn(async () => [{ id: 'c', label: COUNTY.label }]),
  };
  const fallback = { geocode: vi.fn(async () => null), suggest: vi.fn(async () => []) };
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => washington }));
  const cityCheck = createCityAddressCheck({ fetch });
  return createGeocoder({ sources: [county], fallback, cityCheck });
}

describe('issue #58: picking the county suggestion of a City twin', () => {
  it('gives the City place, not the county one, though the label holds a county-only ZIP', async () => {
    const geocoder = chain();
    const [pick] = await geocoder.suggest('6135 Washington');
    const place = await geocoder.geocode(pick);
    expect(place).toMatchObject({ county: 'St. Louis city' });
  });

  it('still trusts a county-only ZIP the voter typed', async () => {
    const geocoder = chain();
    await expect(geocoder.geocode('6135 Washington Ave, Saint Louis, MO 63134')).resolves.toEqual(
      COUNTY,
    );
  });
});
