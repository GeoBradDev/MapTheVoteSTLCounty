// The palette's contrast (#76): every pair the UI draws must meet WCAG 2.1 AA,
// so a token change cannot quietly regress it. Text needs 4.5:1 (1.4.3); a
// control's outline, a notice's edge and icon need 3:1 (1.4.11).
// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contrastRatio, oklchTokens, parseOklch } from './colors.js';

const css = readFileSync(path.resolve(import.meta.dirname, '../index.css'), 'utf8');
const tokens = oklchTokens(css);

const SURFACES = ['surface', 'surface-raised', 'surface-sunken'];
const KINDS = ['info', 'warning', 'danger', 'success'];

const TEXT = [
  ...['ink', 'muted', 'primary'].flatMap((text) => SURFACES.map((bg) => [text, bg])),
  ...['primary', 'primary-hover', 'primary-pressed'].map((bg) => ['on-primary', bg]),
  // A notice's text, its links and its kind's ink on its fill.
  ...KINDS.flatMap((kind) => [
    [`${kind}-ink`, `${kind}-fill`],
    [`${kind}-ink`, 'surface'],
    ['ink', `${kind}-fill`],
    ['muted', `${kind}-fill`],
    ['primary', `${kind}-fill`],
  ]),
];

const NON_TEXT = SURFACES.map((bg) => ['border-strong', bg]);

describe('palette contrast', () => {
  it.each(TEXT)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT)('%s on %s is at least 3:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });

  it('measures known pairs correctly', () => {
    expect(contrastRatio('oklch(0 0 0)', 'oklch(1 0 0)')).toBeCloseTo(21, 0);
    expect(contrastRatio('oklch(0.5 0 0)', 'oklch(0.5 0 0)')).toBe(1);
  });

  it('has one brand hue, deep teal, clear of blue (owner choice, #76)', () => {
    for (const name of ['primary', 'primary-hover', 'primary-pressed', 'info-ink']) {
      const { hue, chroma } = parseOklch(tokens[name]);
      expect(chroma, name).toBeGreaterThan(0.04);
      expect(hue, name).toBeGreaterThanOrEqual(180);
      expect(hue, name).toBeLessThanOrEqual(195);
    }
  });

  it('keeps the neutrals near gray', () => {
    for (const name of [...SURFACES, 'border', 'border-strong', 'ink', 'muted', 'on-primary']) {
      expect(parseOklch(tokens[name]).chroma, name).toBeLessThanOrEqual(0.012);
    }
  });
});
