// Draws the site-wide link preview image (#98), public/share-image.png, with
// Playwright's Chromium: 1200 x 630, the site's mark (public/favicon.svg, #79),
// the site name and "Find where to vote" in the deep teal palette (#76). No
// election, date or place list in it, so it never goes stale, and no red or
// blue. src/pageHead.js names it in every page's og:image.
// Usage: node scripts/draw-share-image.mjs (after `npx playwright install chromium`).
// Run it again when the site name, the tagline, the mark or the palette changes.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const WIDTH = 1200;
const HEIGHT = 630;

const css = await readFile(path.join(ROOT, 'src/index.css'), 'utf8');
// The light theme's value: the first declaration of each token.
const token = (name) => {
  const value = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`src/index.css has no --color-${name}`);
  return value.trim();
};
const en = JSON.parse(await readFile(path.join(ROOT, 'src/i18n/en.json'), 'utf8'));
const favicon = await readFile(path.join(ROOT, 'public/favicon.svg'), 'utf8');
const mark = favicon.match(/<g\b[\s\S]*<\/g>/)?.[0];
if (!mark) throw new Error('public/favicon.svg has no <g> mark');

const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// The mark's strokes are on-primary already; drawn on the primary fill as in the favicon.
const html = `<!doctype html><html><body style="margin:0">
<div style="box-sizing:border-box;width:${WIDTH}px;height:${HEIGHT}px;padding:0 96px;
  display:flex;align-items:center;gap:64px;background:${token('primary')};color:${token('on-primary')};
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans',sans-serif">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 24 24" width="240" height="240"
    style="flex:none">${mark}</svg>
  <div>
    <div style="font-size:76px;font-weight:700;line-height:1.1">${escape(en.site.name)}</div>
    <div style="margin-top:28px;font-size:52px;line-height:1.2">${escape(en.site.shareTagline)}</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.setContent(html);
  const file = path.join(ROOT, 'public/share-image.png');
  await page.screenshot({ path: file });
  console.log(`wrote ${path.relative(ROOT, file)}`);
} finally {
  await browser.close();
}
