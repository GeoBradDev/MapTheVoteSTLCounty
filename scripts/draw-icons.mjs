// Draws the web app manifest's icons (#25) in public/icons/ from the site's
// mark, public/favicon.svg (#79), with Playwright's Chromium.
// Usage: node scripts/draw-icons.mjs (after `npx playwright install chromium`).
//
// icon-<size>.png: the favicon as it is, on a transparent background.
// maskable-<size>.png: the favicon's fill to every edge and its mark at 80%
// around the center, inside the circle a launcher never crops (the safe zone,
// checked in src/test/manifest.test.js), saved with no alpha channel.
// Run it again whenever favicon.svg changes, and redraw favicon.ico and
// apple-touch-icon.png from the same mark (README, Colors).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIZES = [192, 512];
const MARK_SCALE = 0.8;

const favicon = await readFile(path.join(ROOT, 'public/favicon.svg'), 'utf8');
const viewBox = favicon.match(/viewBox="0 0 (\d+) (\d+)"/);
const fill = favicon.match(/<rect\b[^>]*\bfill="(#[0-9a-f]{6})"/i)?.[1];
const mark = favicon.match(/<g\b[\s\S]*<\/g>/)?.[0];
if (!viewBox || viewBox[1] !== viewBox[2] || !fill || !mark) {
  throw new Error('public/favicon.svg is not a square viewBox with a filled <rect> and a <g> mark');
}
const side = Number(viewBox[1]);
const half = side / 2;
const maskable =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}">` +
  `<rect width="${side}" height="${side}" fill="${fill}"/>` +
  `<g transform="translate(${half} ${half}) scale(${MARK_SCALE}) translate(-${half} -${half})">` +
  `${mark}</g></svg>`;

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    for (const [name, svg, transparent] of [
      ['icon', favicon, true],
      ['maskable', maskable, false],
    ]) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      const img = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
      // Without omitBackground the PNG has no alpha channel.
      const background = transparent ? 'none' : fill;
      await page.setContent(`<body style="margin:0;background:${background}">${img}</body>`);
      const file = path.join(ROOT, `public/icons/${name}-${size}.png`);
      await page.screenshot({ path: file, omitBackground: transparent });
      await page.close();
      console.log(`wrote ${path.relative(ROOT, file)}`);
    }
  }
} finally {
  await browser.close();
}
