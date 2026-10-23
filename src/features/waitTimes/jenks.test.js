// The line count classes of the maps (#172): Jenks natural breaks over the
// fresh counts shown, 3 to 5 classes picked by goodness of variance fit.
// @vitest-environment node
import { classOf, GVF_TARGET, gvf, jenksGroups, waitClasses } from './jenks.js';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('jenksGroups', () => {
  it('splits clear clusters at their gaps', () => {
    expect(jenksGroups([1, 2, 3, 10, 11, 12, 20, 21, 22], 3)).toEqual([
      [1, 3],
      [10, 12],
      [20, 22],
    ]);
  });

  it('never splits equal values across classes', () => {
    const groups = jenksGroups([0, 0, 0, 0, 1, 1, 2, 9, 9], 3);
    expect(groups).toEqual([
      [0, 0],
      [1, 2],
      [9, 9],
    ]);
  });

  it('ignores the order it is given', () => {
    expect(jenksGroups([22, 1, 11, 3, 20, 2, 12, 10, 21], 3)).toEqual(
      jenksGroups([1, 2, 3, 10, 11, 12, 20, 21, 22], 3),
    );
  });
});

describe('gvf', () => {
  it('is 1 when every class holds one value', () => {
    expect(gvf([1, 1, 5, 9], jenksGroups([1, 1, 5, 9], 3))).toBe(1);
  });

  it('is about 1 - 1/k squared for evenly spread values', () => {
    const values = range(0, 99);
    expect(gvf(values, jenksGroups(values, 3))).toBeCloseTo(1 - 1 / 9, 2);
  });
});

describe('waitClasses', () => {
  it('has no classes without values', () => {
    expect(waitClasses([])).toEqual([]);
  });

  it('has one class when every count is the same', () => {
    expect(waitClasses([4, 4, 4])).toEqual([{ min: 4, max: 4 }]);
  });

  it('has one class for one count', () => {
    expect(waitClasses([0])).toEqual([{ min: 0, max: 0 }]);
  });

  it('has two classes for two distinct counts, never invented breaks', () => {
    expect(waitClasses([0, 0, 5, 0])).toEqual([
      { min: 0, max: 0 },
      { min: 1, max: 5 },
    ]);
  });

  it('has three classes for three distinct counts', () => {
    expect(waitClasses([0, 2, 7])).toEqual([
      { min: 0, max: 0 },
      { min: 1, max: 2 },
      { min: 3, max: 7 },
    ]);
  });

  it(`picks the smallest k from 3 whose fit reaches ${GVF_TARGET}`, () => {
    // Three clear clusters: 3 classes fit almost perfectly.
    expect(waitClasses([0, 1, 2, 10, 11, 12, 20, 21, 22])).toEqual([
      { min: 0, max: 2 },
      { min: 3, max: 12 },
      { min: 13, max: 22 },
    ]);
    // Evenly spread counts: 3 classes fit about 0.89, 4 about 0.94.
    expect(waitClasses(range(0, 19))).toHaveLength(4);
  });

  it('stops at 5 classes', () => {
    // Very uneven clusters at growing distances: no k up to 5 is a perfect
    // fit, and the classes never exceed 5.
    const values = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91];
    const classes = waitClasses(values);
    expect(classes.length).toBeGreaterThanOrEqual(3);
    expect(classes.length).toBeLessThanOrEqual(5);
    expect(waitClasses(range(0, 1000).map((v) => v ** 2 % 997)).length).toBeLessThanOrEqual(5);
  });

  it('gives an outlier its own class', () => {
    const classes = waitClasses([0, 0, 1, 1, 2, 2, 3, 3, 4, 60]);
    expect(classes.at(-1)).toEqual({ min: expect.any(Number), max: 60 });
    expect(classOf(60, classes)).toBe(classes.length - 1);
    expect(classOf(4, classes)).toBeLessThan(classes.length - 1);
  });

  it('covers the counts from the lowest to the highest with no gaps', () => {
    const values = [3, 5, 8, 9, 14, 30, 31, 44];
    const classes = waitClasses(values);
    expect(classes[0].min).toBe(3);
    expect(classes.at(-1).max).toBe(44);
    for (let i = 1; i < classes.length; i += 1) {
      expect(classes[i].min).toBe(classes[i - 1].max + 1);
    }
    for (const value of values) expect(classOf(value, classes)).not.toBeNull();
  });

  it('skips anything that is not a count', () => {
    expect(waitClasses([null, undefined, Number.NaN, -1, 2.5, 3])).toEqual([{ min: 3, max: 3 }]);
  });
});

describe('classOf', () => {
  const classes = [
    { min: 0, max: 3 },
    { min: 4, max: 9 },
    { min: 10, max: 40 },
  ];

  it.each([
    [0, 0],
    [3, 0],
    [4, 1],
    [9, 1],
    [10, 2],
    [40, 2],
  ])('puts %i in class %i', (value, index) => {
    expect(classOf(value, classes)).toBe(index);
  });

  it('has no class for a count outside the ranges, or without classes', () => {
    expect(classOf(41, classes)).toBeNull();
    expect(classOf(3, [])).toBeNull();
  });
});
