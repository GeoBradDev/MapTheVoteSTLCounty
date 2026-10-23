// The maps' line count classes (#172): Jenks natural breaks over the fresh
// counts the map shows, recomputed whenever they change. Pure functions, no
// dependency. Kept out of the first load: the wait times page (its own chunk)
// imports it, and the polling places card loads it on Election Day only
// (useWaitScale.js).
//
// How many classes, k:
// - fewer than 3 distinct counts: one class per distinct count (1 or 2), never
//   an invented break;
// - otherwise the smallest k from 3 up to min(5, distinct counts) whose
//   goodness of variance fit (GVF) reaches GVF_TARGET, else that maximum.
// GVF is 1 minus the squared deviations from the class means over the squared
// deviations from the overall mean: 1 means every class holds equal counts.
// Evenly spread counts reach about 0.89 with 3 classes and 0.94 with 4, so
// GVF_TARGET 0.9 gives 3 classes for clustered counts and more for spread out
// ones.

import { colorIndex } from './waitColors.js';

/** The fit a class count must reach; see the note above. */
export const GVF_TARGET = 0.9;
export const MIN_CLASSES = 3;
export const MAX_CLASSES = 5;

const isCount = (value) => Number.isInteger(value) && value >= 0;

// The distinct values, ascending, each with how often it occurs.
function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * The Jenks natural breaks of `values` in `k` classes (Fisher's exact
 * method, over the distinct values weighted by how often each occurs, so
 * equal values always share a class).
 * @param {number[]} values
 * @param {number} k At most the number of distinct values.
 * @returns {[number, number][]} Each class's lowest and highest value, ascending.
 */
export function jenksGroups(values, k) {
  const points = tally(values);
  const n = points.length;
  // Prefix sums of weight, weight * x and weight * x * x.
  const w = [0];
  const wx = [0];
  const wxx = [0];
  for (const [x, count] of points) {
    w.push(w.at(-1) + count);
    wx.push(wx.at(-1) + count * x);
    wxx.push(wxx.at(-1) + count * x * x);
  }
  // Squared deviations of points i..j (0-based, inclusive) from their mean.
  const ssd = (i, j) => {
    const weight = w[j + 1] - w[i];
    const sum = wx[j + 1] - wx[i];
    return Math.max(0, wxx[j + 1] - wxx[i] - (sum * sum) / weight);
  };

  // cost[c][j]: the least total for points 0..j in c + 1 classes; start[c][j]:
  // where the last of those classes starts.
  const cost = [Array.from({ length: n }, (_, j) => ssd(0, j))];
  const start = [Array.from({ length: n }, () => 0)];
  for (let c = 1; c < k; c += 1) {
    cost.push(new Array(n).fill(Infinity));
    start.push(new Array(n).fill(0));
    for (let j = c; j < n; j += 1) {
      for (let i = c; i <= j; i += 1) {
        const total = cost[c - 1][i - 1] + ssd(i, j);
        if (total < cost[c][j]) {
          cost[c][j] = total;
          start[c][j] = i;
        }
      }
    }
  }

  const groups = [];
  let end = n - 1;
  for (let c = k - 1; c >= 0; c -= 1) {
    const from = start[c][end];
    groups.unshift([points[from][0], points[end][0]]);
    end = from - 1;
  }
  return groups;
}

/**
 * The goodness of variance fit of `groups` (from jenksGroups) for `values`.
 * @param {number[]} values
 * @param {[number, number][]} groups
 */
export function gvf(values, groups) {
  const squares = (list) => {
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    return list.reduce((a, b) => a + (b - mean) ** 2, 0);
  };
  const total = squares(values);
  if (total === 0) return 1;
  const within = groups.reduce((sum, [lo, hi]) => {
    const members = values.filter((v) => v >= lo && v <= hi);
    return sum + squares(members);
  }, 0);
  return 1 - within / total;
}

/**
 * The classes for the counts the map shows, ascending: each runs from its own
 * lowest count to its highest, so the legend names only counts on the map (a
 * lone 10 reads "10 people", never "1 to 10"), and each count is in exactly
 * one. Anything that is not a whole number 0 or more is left out. No counts,
 * no classes.
 * @param {(number | null | undefined)[]} values
 * @returns {{ min: number, max: number }[]}
 */
export function waitClasses(values) {
  const counts = values.filter(isCount);
  const distinct = new Set(counts).size;
  if (distinct === 0) return [];

  let groups;
  if (distinct < MIN_CLASSES) {
    groups = jenksGroups(counts, distinct);
  } else {
    const most = Math.min(MAX_CLASSES, distinct);
    for (let k = MIN_CLASSES; k <= most; k += 1) {
      groups = jenksGroups(counts, k);
      if (gvf(counts, groups) >= GVF_TARGET) break;
    }
  }
  return groups.map(([min, max]) => ({ min, max }));
}

/**
 * The index of the class `value` falls in, or null when none.
 * @param {number} value
 * @param {{ min: number, max: number }[]} classes
 * @returns {number | null}
 */
export function classOf(value, classes) {
  const index = classes.findIndex(({ min, max }) => value >= min && value <= max);
  return index === -1 ? null : index;
}

/**
 * A marker's color step for a line count: the token index (waitColors.js) of
 * its class among `classes`, or null without a count or a class.
 * @param {number | null | undefined} value
 * @param {{ min: number, max: number }[]} classes
 * @returns {number | null}
 */
export function waitColor(value, classes) {
  if (value === null || value === undefined) return null;
  return colorIndex(classOf(value, classes), classes.length);
}
