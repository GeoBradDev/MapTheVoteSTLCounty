// The map's line count colors (#104): teal, tan and brown from ColorBrewer's
// BrBG ramp (the owner's choice, after one hue in three shades proved too
// hard to tell apart). Never red or blue; each bin far enough from the others
// and from the plain no-count marker to tell apart; each marker's fill or its
// outline at least 3:1 against the basemap's land, so a marker is visible to
// low-vision readers (WCAG 1.4.11); each marker number readable on its fill.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { partyColor } from '../../test/colors.js';
import { oklchToRgb } from '../lookup/mapBounds.js';
import { NO_COUNT_CLASS, WAIT_BIN_CLASSES, WAIT_BIN_TOKENS } from './waitColors.js';
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

// The token value behind a class such as `bg-wait-low` or `border-ink`.
const colorOf = (classes, prefix) =>
  tokens[`--color-${classes.match(new RegExp(`\\b${prefix}-([\\w-]+)`))[1]}`];

// An oklch() value as OKLab coordinates, for the distance between two colors.
const oklab = (value) => {
  const [l, c, h] = value
    .match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
    .slice(1)
    .map(Number);
  const rad = (h * Math.PI) / 180;
  return [l, c * Math.cos(rad), c * Math.sin(rad)];
};

describe('line count colors', () => {
  it('has one token per bin', () => {
    expect(WAIT_BIN_TOKENS).toHaveLength(WAIT_BINS.length);
    for (const token of WAIT_BIN_TOKENS) expect(tokens[`--color-${token}`]).toBeDefined();
  });

  it.each([0, 1, 2])('bin %i is not red or blue and stands out 3:1 on the basemap', (i) => {
    const value = tokens[`--color-${WAIT_BIN_TOKENS[i]}`];
    expect(partyColor(value)).toBeNull();
    const fill = contrast(rgbOf(oklchToRgb(value)), BASEMAP_LAND);
    const outline = contrast(
      rgbOf(oklchToRgb(colorOf(WAIT_BIN_CLASSES[i], 'border'))),
      BASEMAP_LAND,
    );
    expect(Math.max(fill, outline)).toBeGreaterThanOrEqual(3);
  });

  it.each([0, 1, 2])('bin %i keeps its marker number readable (4.5:1)', (i) => {
    const fill = rgbOf(oklchToRgb(tokens[`--color-${WAIT_BIN_TOKENS[i]}`]));
    const ink = rgbOf(oklchToRgb(colorOf(WAIT_BIN_CLASSES[i], 'text')));
    expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the bins and the no-count marker clearly apart', () => {
    const fills = [
      ...WAIT_BIN_TOKENS.map((t) => tokens[`--color-${t}`]),
      colorOf(NO_COUNT_CLASS, 'bg'),
    ].map(oklab);
    for (let i = 0; i < fills.length; i += 1) {
      for (let j = i + 1; j < fills.length; j += 1) {
        expect(Math.hypot(...fills[i].map((v, k) => v - fills[j][k]))).toBeGreaterThanOrEqual(0.15);
      }
    }
  });
});
