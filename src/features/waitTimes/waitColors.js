// The map's people-in-line colors (#104): one token per bin in WAIT_BINS, in
// order, defined in src/index.css. Tailwind only sees class names written out
// in full, so the classes are listed here rather than built from the names.

/** The `--color-*` token names, one per bin, light to dark. */
export const WAIT_BIN_TOKENS = Object.freeze(['wait-low', 'wait-mid', 'wait-high']);

/**
 * Marker and legend swatch classes per bin: the fill and a text color that
 * reads on it.
 */
export const WAIT_BIN_CLASSES = Object.freeze([
  'bg-wait-low text-ink',
  'bg-wait-mid text-on-primary',
  'bg-wait-high text-on-primary',
]);

/** A site with no current count: a plain marker, outlined. */
export const NO_COUNT_CLASS = 'bg-surface text-ink border-ink';
