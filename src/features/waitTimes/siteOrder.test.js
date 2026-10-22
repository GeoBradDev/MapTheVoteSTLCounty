// The wait times page's sort orders and the map's bins (#104).
import { NEARBY_MILES, orderSites, waitBin, WAIT_BINS } from './siteOrder.js';

const row = (key, name, extra = {}) => ({ key, name, loc: key, miles: null, ...extra });

const ROWS = [
  row('a', 'Cedar Library', { miles: 6 }),
  row('b', 'Alder Hall', { miles: 1 }),
  row('c', 'Birch Center', { miles: 3 }),
  row('d', 'Dogwood School', { miles: 4 }),
  row('e', 'Elm Office', { miles: 2 }),
];

// a: open, 9 people; b: open, no count; c: open, 2 people; d: closed; e: open, 2 people.
const WAITS = new Map([
  ['a', 9],
  ['c', 2],
  ['e', 2],
]);
const OPEN = new Set(['a', 'b', 'c', 'e']);
const options = (sort) => ({
  sort,
  waitOf: (r) => WAITS.get(r.key) ?? null,
  isOpen: (r) => OPEN.has(r.key),
});
const keys = (rows) => rows.map((r) => r.key).join('');

describe('orderSites', () => {
  it('puts open sites first, by shortest line, then open sites with no count, then closed, each by name', () => {
    expect(keys(orderSites(ROWS, options('line')))).toBe('ceabd');
  });

  it('sorts by name, A to Z', () => {
    expect(keys(orderSites(ROWS, options('name')))).toBe('bcade');
  });

  it('sorts nearest first', () => {
    expect(keys(orderSites(ROWS, options('nearest')))).toBe('becda');
  });

  it(`puts the sites within ${NEARBY_MILES} miles first, by line, then the rest nearest first`, () => {
    const far = [...ROWS, row('f', 'Fir Hall', { miles: 9 })];
    expect(keys(orderSites(far, options('nearby')))).toBe('cebdaf');
  });

  it('falls back to the line order for a distance sort without distances', () => {
    expect(
      keys(
        orderSites(
          ROWS.map((r) => ({ ...r, miles: null })),
          options('nearest'),
        ),
      ),
    ).toBe('ceabd');
  });

  it('never changes the list it is given', () => {
    const copy = [...ROWS];
    orderSites(ROWS, options('name'));
    expect(ROWS).toEqual(copy);
  });

  it('sorts a site with no name after named ones', () => {
    const rows = [row('x', null), row('y', 'Zinnia Hall')];
    expect(keys(orderSites(rows, { ...options('name'), isOpen: () => false }))).toBe('yx');
  });
});

describe('waitBin', () => {
  it.each([
    [0, 0],
    [4, 0],
    [5, 1],
    [14, 1],
    [15, 2],
    [120, 2],
  ])('puts %i people in bin %i', (value, bin) => {
    expect(waitBin(value)).toBe(bin);
  });

  it('has one bin per legend entry, from 0 up with no gaps', () => {
    expect(WAIT_BINS[0].min).toBe(0);
    for (let i = 1; i < WAIT_BINS.length; i += 1) {
      expect(WAIT_BINS[i].min).toBe(WAIT_BINS[i - 1].max + 1);
    }
    expect(WAIT_BINS.at(-1).max).toBeNull();
  });
});
