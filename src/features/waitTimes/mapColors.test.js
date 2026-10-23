// The maps' line count colors (#104, #172): five steps of a BrBG-style ramp,
// teal through tan to brown (the owner's choice, after one hue in three shades
// proved too hard to tell apart), of which a map with k classes uses a fixed
// subset. Never red or blue; each step far enough from the others
// and from the plain no-count marker to tell apart; each marker's fill or its
// outline at least 3:1 against the basemap's land, so a marker is visible to
// low-vision readers (WCAG 1.4.11); each marker number readable on its fill.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { partyColor } from '../../test/colors.js';
import { oklchToRgb } from '../lookup/mapBounds.js';
import { MAX_CLASSES } from './jenks.js';
import {
  colorIndex,
  NO_COUNT_CLASS,
  WAIT_COLOR_CLASSES,
  WAIT_RAMP,
  WAIT_TOKENS,
} from './waitColors.js';

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

// The token value behind a class such as `bg-wait-1` or `border-ink`.
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
  it('has one token per step, enough for the most classes', () => {
    expect(WAIT_TOKENS).toHaveLength(MAX_CLASSES);
    expect(WAIT_COLOR_CLASSES).toHaveLength(MAX_CLASSES);
    for (const token of WAIT_TOKENS) expect(tokens[`--color-${token}`]).toBeDefined();
  });

  it.each([1, 2, 3, 4, 5])('gives %i classes distinct steps in ramp order', (k) => {
    const steps = WAIT_RAMP[k];
    expect(steps).toHaveLength(k);
    for (let i = 1; i < k; i += 1) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    if (k > 1) expect([steps[0], steps.at(-1)]).toEqual([0, MAX_CLASSES - 1]);
    expect(steps.map((_, i) => colorIndex(i, k))).toEqual(steps);
  });

  it('has no color without a class', () => {
    expect(colorIndex(null, 3)).toBeNull();
    expect(colorIndex(0, 0)).toBeNull();
  });

  it.each([0, 1, 2, 3, 4])('step %i is not red or blue and stands out 3:1 on the basemap', (i) => {
    const value = tokens[`--color-${WAIT_TOKENS[i]}`];
    expect(partyColor(value)).toBeNull();
    const fill = contrast(rgbOf(oklchToRgb(value)), BASEMAP_LAND);
    const outline = contrast(
      rgbOf(oklchToRgb(colorOf(WAIT_COLOR_CLASSES[i], 'border'))),
      BASEMAP_LAND,
    );
    expect(Math.max(fill, outline)).toBeGreaterThanOrEqual(3);
  });

  it.each([0, 1, 2, 3, 4])('step %i keeps its marker number readable (4.5:1)', (i) => {
    const fill = rgbOf(oklchToRgb(tokens[`--color-${WAIT_TOKENS[i]}`]));
    const ink = rgbOf(oklchToRgb(colorOf(WAIT_COLOR_CLASSES[i], 'text')));
    expect(colorOf(WAIT_COLOR_CLASSES[i], 'bg')).toBe(tokens[`--color-${WAIT_TOKENS[i]}`]);
    expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every step and the no-count marker clearly apart', () => {
    const fills = [
      ...WAIT_TOKENS.map((t) => tokens[`--color-${t}`]),
      colorOf(NO_COUNT_CLASS, 'bg'),
    ].map(oklab);
    for (let i = 0; i < fills.length; i += 1) {
      for (let j = i + 1; j < fills.length; j += 1) {
        expect(Math.hypot(...fills[i].map((v, k) => v - fills[j][k]))).toBeGreaterThanOrEqual(0.15);
      }
    }
  });

  // The precinct map's outline sits beside these markers and their legend on
  // Election Day (#107), so it must not look like a step (#76: the brand teal
  // is within a shade of wait-1, so the outline is drawn in ink).
  it('draws the precinct outline in a color no step resembles, 3:1 on the basemap', async () => {
    const view = await readFile(path.join(ROOT, 'src/features/lookup/precinctMapView.js'), 'utf8');
    const name = view.match(
      /const color = oklchToRgb\(tokens\.getPropertyValue\('--color-([\w-]+)'\)\)/,
    )?.[1];
    expect(name).toBeDefined();
    const outline = tokens[`--color-${name}`];
    expect(contrast(rgbOf(oklchToRgb(outline)), BASEMAP_LAND)).toBeGreaterThanOrEqual(3);
    for (const token of WAIT_TOKENS) {
      const step = oklab(tokens[`--color-${token}`]);
      const distance = Math.hypot(...oklab(outline).map((v, k) => v - step[k]));
      expect(distance, token).toBeGreaterThanOrEqual(0.15);
    }
  });
});
