// @vitest-environment node
import { NotFound } from './arcgis.js';
import { CITY_PRECINCT_CODE, cityPrecinctCode, cityPrecinctId } from './cityPrecinctCode.js';

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
    // Extra or missing spaces, as a hand-edited row might have.
    expect(cityPrecinctCode('  W 3  P 7 ')).toBe('W03P07');
    expect(cityPrecinctCode('W3P7')).toBe('W03P07');
  });

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
