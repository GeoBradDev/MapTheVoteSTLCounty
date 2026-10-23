// The web app manifest (#25): what a browser reads to install the site to a
// home screen. Installability itself is checked in a real browser
// (e2e/install.e2e.js); this file checks the manifest's content and icons.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import en from '../i18n/en.json';
import { partyColor, toOklch } from './colors.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(ROOT, 'public');
const manifest = JSON.parse(readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// A PNG's width and height, from its IHDR chunk, and whether its color type
// carries alpha (4: gray + alpha, 6: RGBA).
function pngInfo(file) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii'), file).toBe('PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    alpha: [4, 6].includes(bytes[25]),
  };
}

const iconFile = (icon) => path.join(PUBLIC, icon.src.replace(/^\//, ''));

describe('web app manifest', () => {
  it('names the site as the app does', () => {
    expect(manifest.name).toBe(en.site.name);
    expect(manifest.description).toBe(en.site.description);
    expect(manifest.lang).toBe('en');
  });

  // Longer names are cut off under a home screen icon.
  it('has a short name of at most 12 characters', () => {
    expect(manifest.short_name).toEqual(expect.any(String));
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('opens the home page as a standalone app over the whole site', () => {
    expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone' });
  });

  // The light theme-color meta (#76; one per scheme from #77): the surface
  // token. A manifest has one color, and a page's meta overrides it once the
  // page has loaded, so it matters only on the launch screen.
  it('uses the light surface color, neither red nor blue', () => {
    const metas = [...html.matchAll(/<meta\s+name="theme-color"([^>]*)>/g)].map((m) => m[1]);
    const light = metas.find((attrs) => !/prefers-color-scheme:\s*dark/.test(attrs));
    const surface = light?.match(/content="([^"]+)"/)?.[1];
    expect(surface).toMatch(/^#[0-9a-f]{6}$/i);
    for (const key of ['theme_color', 'background_color']) {
      expect(manifest[key]?.toLowerCase(), key).toBe(surface.toLowerCase());
      expect(partyColor(toOklch(manifest[key])), key).toBeNull();
    }
  });

  it.each([
    ['any', 192],
    ['any', 512],
    ['maskable', 192],
    ['maskable', 512],
  ])('lists a %s PNG icon at %i px that exists at that size', (purpose, size) => {
    const icon = manifest.icons.find((i) => i.purpose === purpose && i.sizes === `${size}x${size}`);
    expect(icon).toMatchObject({ type: 'image/png', src: expect.stringMatching(/^\/icons\//) });
    expect(pngInfo(iconFile(icon))).toMatchObject({ width: size, height: size });
  });

  // A maskable icon is cropped to any shape, so it must fill its square: no
  // transparent corners for the launcher to show.
  it('draws the maskable icons with no alpha channel', () => {
    for (const icon of manifest.icons.filter((i) => i.purpose === 'maskable')) {
      expect(pngInfo(iconFile(icon)).alpha, icon.src).toBe(false);
    }
  });

  it('lists only icons it ships, each once', () => {
    const keys = manifest.icons.map((i) => `${i.purpose} ${i.sizes}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(manifest.icons).toHaveLength(4);
  });
});
