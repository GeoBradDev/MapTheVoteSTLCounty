// The palette's contrast (#76): every pair the UI draws must meet WCAG 2.1 AA,
// so a token change cannot quietly regress it. Text needs 4.5:1 (1.4.3); a
// control's outline, a notice's edge and icon need 3:1 (1.4.11). Every check
// runs for the light theme and the dark one (#77).
// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contrastRatio, oklchTokens, parseOklch, themeTokens } from './colors.js';

const css = readFileSync(path.resolve(import.meta.dirname, '../index.css'), 'utf8');
const themes = themeTokens(css);

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

describe.each(['light', 'dark'])('palette contrast, %s theme', (theme) => {
  const tokens = themes[theme];

  it.each(TEXT)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT)('%s on %s is at least 3:1', (fg, bg) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
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

describe('the dark theme (#77)', () => {
  // A token the dark block leaves out would stay its light value on a dark
  // page. The marker number tokens are the same in both themes on purpose:
  // they sit on the wait ramp's fills, which do not flip.
  const SAME_IN_BOTH = ['wait-number-light', 'wait-number-dark'];

  it('gives every color token its own dark value', () => {
    const missing = Object.keys(themes.light).filter(
      (name) => !SAME_IN_BOTH.includes(name) && !(name in themes.darkOnly),
    );
    expect(missing).toEqual([]);
  });

  it('defines no dark token the light theme lacks', () => {
    // The light shadow is a color-mix() of ink, which themeTokens leaves out.
    const lightNames = new Set([...Object.keys(themes.light), 'shadow']);
    expect(Object.keys(themes.darkOnly).filter((name) => !lightNames.has(name))).toEqual([]);
    expect(css).toMatch(/@theme\s*\{[^}]*--color-shadow:/);
  });

  it('is dark: light text on dark surfaces', () => {
    expect(contrastRatio(themes.dark.surface, 'oklch(0 0 0)')).toBeLessThan(2);
    expect(contrastRatio(themes.dark.ink, 'oklch(1 0 0)')).toBeLessThan(1.5);
  });
});

describe('contrast helper', () => {
  it('measures known pairs correctly', () => {
    expect(contrastRatio('oklch(0 0 0)', 'oklch(1 0 0)')).toBeCloseTo(21, 0);
    expect(contrastRatio('oklch(0.5 0 0)', 'oklch(0.5 0 0)')).toBe(1);
  });

  it('reads both themes from the stylesheet', () => {
    expect(Object.keys(themes.light).length).toBeGreaterThan(0);
    expect(Object.keys(oklchTokens(css)).length).toBeGreaterThan(0);
  });
});
