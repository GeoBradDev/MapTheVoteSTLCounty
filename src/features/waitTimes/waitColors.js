// The map's people-in-line colors (#104): one token per bin in WAIT_BINS, in
// order, defined in src/index.css. Tailwind only sees class names written out
// in full, so the classes are listed here rather than built from the names.

/** The `--color-*` token names, one per bin: teal, tan, brown. */
export const WAIT_BIN_TOKENS = Object.freeze(['wait-low', 'wait-mid', 'wait-high']);

/**
 * Marker and legend swatch classes per bin: the fill, a text color that reads
 * on it, and an ink outline, so even the light tan marker stands out 3:1 on
 * the basemap.
 */
export const WAIT_BIN_CLASSES = Object.freeze([
  'bg-wait-low text-on-primary border-ink',
  'bg-wait-mid text-ink border-ink',
  'bg-wait-high text-on-primary border-ink',
]);

/** A site with no current count: a plain marker, outlined. */
export const NO_COUNT_CLASS = 'bg-surface text-ink border-ink';
