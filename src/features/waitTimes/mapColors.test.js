// The map's line count colors (#104): a one-hue data scale, light to dark,
// never red or blue, each at least 3:1 against the basemap's land, so a
// marker is visible to low-vision readers (WCAG 1.4.11).
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { partyColor } from '../../test/colors.js';
import { oklchToRgb } from '../lookup/mapBounds.js';
import { WAIT_BIN_TOKENS } from './waitColors.js';
import { WAIT_BINS } from './siteOrder.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
// Positron's land background (its `background` layer), the lightest thing a
// marker sits on.
const BASEMAP_LAND = [242, 243, 240];

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const rgbOf = (css) =>
  css
    .match(/\d+(\.\d+)?/g)
    .slice(0, 3)
    .map(Number);

let tokens;
beforeAll(async () => {
  const css = await readFile(path.join(ROOT, 'src/index.css'), 'utf8');
  tokens = Object.fromEntries(
    [...css.matchAll(/(--color-[\w-]+):\s*(oklch\([^)]*\))/g)].map((m) => [m[1], m[2]]),
  );
});

describe('line count colors', () => {
  it('has one token per bin', () => {
    expect(WAIT_BIN_TOKENS).toHaveLength(WAIT_BINS.length);
    for (const token of WAIT_BIN_TOKENS) expect(tokens[`--color-${token}`]).toBeDefined();
  });

  it.each([0, 1, 2])('bin %i is not red or blue and passes 3:1 on the basemap', (i) => {
    const value = tokens[`--color-${WAIT_BIN_TOKENS[i]}`];
    expect(partyColor(value)).toBeNull();
    expect(contrast(rgbOf(oklchToRgb(value)), BASEMAP_LAND)).toBeGreaterThanOrEqual(3);
  });

  it('goes from light to dark in one hue', () => {
    const parts = WAIT_BIN_TOKENS.map((t) =>
      tokens[`--color-${t}`]
        .match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
        .slice(1)
        .map(Number),
    );
    for (let i = 1; i < parts.length; i += 1) expect(parts[i][0]).toBeLessThan(parts[i - 1][0]);
    expect(new Set(parts.map((p) => p[2])).size).toBe(1);
  });
});
