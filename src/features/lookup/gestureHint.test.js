// The maps' gesture hint ("Use Ctrl + scroll to zoom the map", #26): its text
// sits on a see-through ink backdrop over the map, so its contrast depends on
// what is under it. Over white and over black, the extremes of either
// basemap, the 18 px text must still reach 4.5:1 (WCAG 1.4.3), in the light
// theme and the dark one (#77).
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { themeTokens } from '../../test/colors.js';
import { oklchToRgb } from './mapBounds.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const UNDER = { white: [255, 255, 255], black: [0, 0, 0] };

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

let themes;
let hint;
beforeAll(async () => {
  const theme = await readFile(path.join(ROOT, 'src/index.css'), 'utf8');
  const prefixed = (map) =>
    Object.fromEntries(Object.entries(map).map(([name, value]) => [`--color-${name}`, value]));
  const { light, dark } = themeTokens(theme);
  themes = { light: prefixed(light), dark: prefixed(dark) };
  const css = await readFile(path.join(ROOT, 'src/features/lookup/precinctMap.css'), 'utf8');
  hint = css.match(/\.maplibregl-cooperative-gesture-screen \{([^}]*)\}/)[1];
});

describe('the map gesture hint', () => {
  it.each([
    ['light', 'white'],
    ['light', 'black'],
    ['dark', 'white'],
    ['dark', 'black'],
  ])('keeps its text 4.5:1 in the %s theme over %s', (theme, under) => {
    const tokens = themes[theme];
    const backdrop = hint.match(
      /background:\s*color-mix\(in oklab, var\((--color-[\w-]+)\) (\d+)%, transparent\)/,
    );
    const text = hint.match(/(?:^|\s)color:\s*var\((--color-[\w-]+)\)/);
    expect(backdrop).not.toBeNull();
    expect(text).not.toBeNull();
    const alpha = Number(backdrop[2]) / 100;
    const ink = rgbOf(oklchToRgb(tokens[backdrop[1]]));
    // The browser blends a see-through color over what is under it per channel.
    const shown = ink.map((c, i) => alpha * c + (1 - alpha) * UNDER[under][i]);
    expect(contrast(rgbOf(oklchToRgb(tokens[text[1]])), shown)).toBeGreaterThanOrEqual(4.5);
  });
});
