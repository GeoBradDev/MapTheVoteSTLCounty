// Issue #58: a St. Louis City voter must never get a county precinct when the
// same house number and street also exist in the county. The City's own
// geocoder decides, whether or not a ZIP was typed, unless the ZIP is entirely
// outside the City. Frozen: written red before the fix.
import { createGeocoder } from './geocoder.js';

const WASHINGTON_COUNTY = Object.freeze({
  lat: 38.7067,
  lng: -90.3185,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '6135 Washington Ave, Saint Louis, MO 63134',
});
const WASHINGTON_CITY = Object.freeze({
  lat: 38.654558,
  lng: -90.297434,
  state: 'Missouri',
  county: 'St. Louis city',
  label: '6135 Washington Ave, St. Louis, MO 63112',
});
const HORTON_COUNTY = Object.freeze({
  lat: 38.6634,
  lng: -90.2959,
  state: 'Missouri',
  county: 'Saint Louis County',
  label: '6135 Horton Pl, Saint Louis, MO 63133',
});
const HORTON_CITY = Object.freeze({
  lat: 38.663129,
  lng: -90.295637,
  state: 'Missouri',
  county: 'St. Louis city',
  label: '6135 Horton Pl, St. Louis, MO 63133',
});

function chainWith(countyPlace, confirmed, cityPlace) {
  const county = {
    find: vi.fn(async () => ({ status: 'match', place: countyPlace, confirmed })),
    suggest: vi.fn(async () => []),
  };
  // Photon, as in the bug: it has no point for the City house.
  const fallback = {
    geocode: vi.fn(async () => null),
    suggest: vi.fn(async () => []),
    findPlaces: vi.fn(async () => []),
  };
  const cityCheck = { find: vi.fn(async () => ({ status: 'city', place: cityPlace })) };
  return createGeocoder({ sources: [county], fallback, cityCheck });
}

describe('issue #58: a City twin of a county address', () => {
  // Rewritten with the owner's approval (2026-10-22, #88): the county and the
  // City list the number and street in different ZIPs, so text with no ZIP
  // could mean either; no match (the voter is asked for a ZIP), never the
  // county place and not the City place.
  it.each(['6135 Washington Ave, St. Louis, MO', '6135 Washington Ave'])(
    '%s is no match, never the county place',
    async (text) => {
      const geocoder = chainWith(WASHINGTON_COUNTY, false, WASHINGTON_CITY);
      await expect(geocoder.geocode(text)).resolves.toBeNull();
    },
  );

  it("6135 Washington Ave with the City's ZIP gives the City place, never the county one", async () => {
    const geocoder = chainWith(WASHINGTON_COUNTY, false, WASHINGTON_CITY);
    await expect(geocoder.geocode('6135 Washington Ave, St. Louis, MO 63112')).resolves.toEqual(
      WASHINGTON_CITY,
    );
  });

  // Rewritten with the owner's approval (issue #58, 2026-10-21): the county
  // and the City both have 6135 Horton Pl in 63133, so neither is chosen; no
  // match, never the county precinct.
  it('6135 Horton Pl, St. Louis, MO 63133 is no match, never the county place, though the ZIP confirms the county match', async () => {
    const geocoder = chainWith(HORTON_COUNTY, true, HORTON_CITY);
    await expect(geocoder.geocode('6135 Horton Pl, St. Louis, MO 63133')).resolves.toBeNull();
  });
});
