// The maps' people-in-line colors (#104, #172): five steps of a BrBG-style
// ramp, teal for the shortest lines through tan to brown for the longest,
// defined in src/index.css. A map with k classes (src/features/waitTimes/jenks.js)
// uses the fixed subset WAIT_RAMP[k], so the ends stay teal and brown. Tailwind
// only sees class names written out in full, so the classes are listed here
// rather than built from the names.

/** The `--color-*` token names, shortest line first. */
export const WAIT_TOKENS = Object.freeze(['wait-1', 'wait-2', 'wait-3', 'wait-4', 'wait-5']);

/**
 * Marker and legend swatch classes per token: the fill, a text color that
 * reads on it, and an ink outline, so even the light tan marker stands out
 * 3:1 on the basemap.
 */
export const WAIT_COLOR_CLASSES = Object.freeze([
  'bg-wait-1 text-on-primary border-ink',
  'bg-wait-2 text-ink border-ink',
  'bg-wait-3 text-ink border-ink',
  'bg-wait-4 text-ink border-ink',
  'bg-wait-5 text-on-primary border-ink',
]);

/** For k classes, the token index of each class, lowest first. */
export const WAIT_RAMP = Object.freeze({
  1: Object.freeze([2]),
  2: Object.freeze([0, 4]),
  3: Object.freeze([0, 2, 4]),
  4: Object.freeze([0, 1, 3, 4]),
  5: Object.freeze([0, 1, 2, 3, 4]),
});

/**
 * The token index for class `index` of `count` classes, or null for no class.
 * @param {number | null} index
 * @param {number} count
 * @returns {number | null}
 */
export function colorIndex(index, count) {
  if (index === null) return null;
  return WAIT_RAMP[count]?.[index] ?? null;
}

/** A site with no current count: a plain marker, outlined. */
export const NO_COUNT_CLASS = 'bg-surface text-ink border-ink';
