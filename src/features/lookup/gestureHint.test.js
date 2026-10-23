// The maps' gesture hint ("Use Ctrl + scroll to zoom the map", #26): its text
// sits on a see-through ink backdrop over the map, so its contrast depends on
// what is under it. Over white, the lightest thing on the basemap (its roads),
// the 18 px text must still reach 4.5:1 (WCAG 1.4.3).
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { oklchToRgb } from './mapBounds.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const WHITE = [255, 255, 255];

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
let hint;
beforeAll(async () => {
  const theme = await readFile(path.join(ROOT, 'src/index.css'), 'utf8');
  tokens = Object.fromEntries(
    [...theme.matchAll(/(--color-[\w-]+):\s*(oklch\([^)]*\))/g)].map((m) => [m[1], m[2]]),
  );
  const css = await readFile(path.join(ROOT, 'src/features/lookup/precinctMap.css'), 'utf8');
  hint = css.match(/\.maplibregl-cooperative-gesture-screen \{([^}]*)\}/)[1];
});

describe('the map gesture hint', () => {
  it('keeps its text 4.5:1 over the white parts of the map', () => {
    const backdrop = hint.match(
      /background:\s*color-mix\(in oklab, var\((--color-[\w-]+)\) (\d+)%, transparent\)/,
    );
    const text = hint.match(/(?:^|\s)color:\s*var\((--color-[\w-]+)\)/);
    expect(backdrop).not.toBeNull();
    expect(text).not.toBeNull();
    const alpha = Number(backdrop[2]) / 100;
    const ink = rgbOf(oklchToRgb(tokens[backdrop[1]]));
    // The browser blends a see-through color over what is under it per channel.
    const shown = ink.map((c, i) => alpha * c + (1 - alpha) * WHITE[i]);
    expect(contrast(rgbOf(oklchToRgb(tokens[text[1]])), shown)).toBeGreaterThanOrEqual(4.5);
  });
});
