// @vitest-environment node
import { NotFound } from './arcgis.js';
import {
  CITY_PRECINCT_CODE,
  cityPrecinctCode,
  cityPrecinctId,
  cityWardPrecinct,
} from './cityPrecinctCode.js';

describe('City precinct codes (#86, #87)', () => {
  it('match W, a 2 digit ward, P and a 2 digit precinct', () => {
    expect(CITY_PRECINCT_CODE.test('W01P12')).toBe(true);
    for (const code of ['W1P12', 'W01P123', 'W 1 P 12', 'w01p12', 'CC007']) {
      expect(CITY_PRECINCT_CODE.test(code)).toBe(false);
    }
  });

  it("turn a URL code into the City layer's ID", () => {
    expect(cityPrecinctId('W01P12')).toBe('W 1 P 12');
    expect(cityPrecinctId('W14P05')).toBe('W 14 P 5');
  });

  it.each(['CC007', 'W 1 P 12', '', null, 7])('reject %j with NotFound', (value) => {
    expect(() => cityPrecinctId(value)).toThrow(NotFound);
  });

  it("turn the layer's ID into the URL code", () => {
    expect(cityPrecinctCode('W 1 P 12')).toBe('W01P12');
    expect(cityPrecinctCode('W 14 P 5')).toBe('W14P05');
  });

  // A code is looked up by the exact ID cityPrecinctId writes, so an ID in any
  // other form would give a code that opens no precinct (#87 review).
  it.each(['W3P7', 'W 3  P 7', ' W 3 P 7', 'W 3 P 7 ', 'W 03 P 7'])(
    'gives no code for %j, which cityPrecinctId would not write',
    (id) => {
      expect(cityPrecinctCode(id)).toBeNull();
    },
  );

  it('round-trips every code', () => {
    for (let ward = 1; ward <= 14; ward += 1) {
      for (let precinct = 1; precinct <= 21; precinct += 1) {
        const id = `W ${ward} P ${precinct}`;
        expect(cityPrecinctId(cityPrecinctCode(id))).toBe(id);
      }
    }
  });

  it.each([null, 7, '', 'W 1', 'W 100 P 1', 'W 0 P 1', 'W 1 P 0', 'Ward 1 Precinct 2', 'CC007'])(
    'turn %j, which is not a City precinct ID, into null',
    (value) => {
      expect(cityPrecinctCode(value)).toBeNull();
    },
  );
});

describe('cityWardPrecinct (#89)', () => {
  it('reads the ward and precinct numbers from a City code', () => {
    expect(cityWardPrecinct('W01P12')).toEqual({ ward: 1, precinct: 12 });
    expect(cityWardPrecinct('W14P02')).toEqual({ ward: 14, precinct: 2 });
  });

  it('is null for anything that is not a City code', () => {
    for (const value of ['CC007', 'W1P12', 'w01p12', '', null, undefined, 12]) {
      expect(cityWardPrecinct(value)).toBeNull();
    }
  });
});
