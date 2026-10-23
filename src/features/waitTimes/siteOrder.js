// The sort orders of the wait times page (#104) and the early voting card's
// nearby sort (#105); the maps' line count classes are in jenks.js (#172). A
// sort is a sort, not advice: no order is named or shown as a recommendation.

/** How far "Shortest line within N miles" reaches, in miles. */
export const NEARBY_MILES = 5;

/**
 * The sort orders the page offers. The last two need a distance per site, so
 * the page offers them only after "Use my location".
 * @typedef {'line' | 'name' | 'nearest' | 'nearby'} SiteSort
 */

// Named sites by name, then unnamed ones; ties by location number.
function byName(a, b) {
  if (a.name && !b.name) return -1;
  if (!a.name && b.name) return 1;
  return (a.name ?? '').localeCompare(b.name ?? '') || String(a.loc).localeCompare(String(b.loc));
}

/**
 * The rows in the chosen order, as a new list.
 * - `line`: open sites first, by shortest reported line, then open sites with
 *   no count, then closed sites; each group by name.
 * - `name`: A to Z.
 * - `nearest`: by distance.
 * - `nearby`: the sites within NEARBY_MILES in the `line` order, then the rest
 *   by distance.
 * A distance sort with no distances falls back to `line`.
 * @template {{ name: string | null, loc: string | null, miles: number | null }} T
 * @param {T[]} rows
 * @param {{ sort: SiteSort, waitOf: (row: T) => number | null,
 *   isOpen: (row: T) => boolean }} options
 * @returns {T[]}
 */
export function orderSites(rows, { sort, waitOf, isOpen }) {
  const group = (row) => {
    if (!isOpen(row)) return 2;
    return waitOf(row) === null ? 1 : 0;
  };
  const byLine = (a, b) =>
    group(a) - group(b) || (group(a) === 0 ? waitOf(a) - waitOf(b) : 0) || byName(a, b);
  const byDistance = (a, b) => a.miles - b.miles || byName(a, b);
  const hasDistances = rows.every((row) => Number.isFinite(row.miles));

  if (sort === 'name') return [...rows].sort(byName);
  if (sort === 'nearest' && hasDistances) return [...rows].sort(byDistance);
  if (sort === 'nearby' && hasDistances) {
    const near = (row) => row.miles <= NEARBY_MILES;
    return [...rows].sort((a, b) => {
      if (near(a) !== near(b)) return near(a) ? -1 : 1;
      return near(a) ? byLine(a, b) : byDistance(a, b);
    });
  }
  return [...rows].sort(byLine);
}
