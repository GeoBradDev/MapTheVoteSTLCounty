// Issue #212 review: reading a typed & as "and" must not turn the & of a unit
// ("Suite A5&6", "#2&3", "Apt 2 & 3") into a word that counts as a typed town.
// 10411 CLAYTON RD SUITE A5&6 63131 (Frontenac, mailed Saint Louis) is a real
// County record, and its own suggestion label is what a pick is found by.
import { matchesTyped } from './addressMatch.js';
import { createCountyAddressSource, LIVE_URL } from './countyAddress.js';

const clayton = (attributes) => ({
  attributes: {
    OBJECTID: 1,
    ADRNO: 10411,
    ADRDIR: '',
    ADRSTR: 'CLAYTON',
    ADRSUF: 'RD',
    UNITDESC: '',
    UNITNO: '',
    MAILINGCITY: 'SAINT LOUIS',
    ZIPCODE: '63131',
    STATUS: 'Current',
    MUNI: 'FRO',
    MSAG_COMMUNITY_NAME: 'FRONTENAC',
    FULL_ADDRESS: '10411 CLAYTON RD',
    ...attributes,
  },
  geometry: { x: -90.42, y: 38.63 },
});

const SUITE = clayton({
  OBJECTID: 2,
  UNITDESC: 'SUITE',
  UNITNO: 'A5&6',
  FULL_ADDRESS: '10411 CLAYTON RD SUITE A5&6',
});

function county() {
  return createCountyAddressSource({
    url: LIVE_URL,
    fetch: vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ features: [SUITE, clayton({})] }),
    })),
    precinctsAt: vi.fn(async () => new Set(['P1'])),
  });
}

describe('issue #212: the & of a unit is not a typed town', () => {
  it('finds a County unit written with & by its own suggestion label and as typed', async () => {
    const [suggestion] = await county().suggest('10411 Clayton Rd Suite A5');
    expect(suggestion?.label).toBe('10411 Clayton Rd Suite A5&6, Saint Louis, MO 63131');
    for (const text of [
      suggestion.label,
      '10411 Clayton Rd Suite A5&6, Frontenac',
      '10411 Clayton Rd #5&6, 63131',
    ]) {
      await expect(county().find(text), text).resolves.toMatchObject({ status: 'match' });
    }
  });

  it('keeps a typed unit with & from rejecting the address', () => {
    const stLouis = { housenumber: '100', street: 'Main St', city: 'Saint Louis' };
    const florissant = {
      housenumber: '100',
      street: 'Main St',
      city: 'Florissant',
      postcode: '63031',
    };
    expect(matchesTyped('100 Main St #2&3', stLouis)).toBe(true);
    expect(matchesTyped('100 Main St Apt 2 & 3', stLouis)).toBe(true);
    expect(matchesTyped('100 Main St #2&3, 63031', florissant)).toBe(true);
    expect(matchesTyped('100 Main St Apt 2&3, Florissant', florissant)).toBe(true);
    // Still strict: another town is not this one.
    expect(matchesTyped('100 Main St Apt 2&3, Ferguson', florissant)).toBe(false);
  });
});
