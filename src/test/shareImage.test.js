// The site-wide link preview image (#98): the file every page's og:image names,
// at the size the tags say. Drawn by scripts/draw-share-image.mjs.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import en from '../i18n/en.json' with { type: 'json' };
import { SHARE_IMAGE } from '../pageHead.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('share image', () => {
  it('is a PNG in public/ at the path og:image names', async () => {
    const file = path.join(ROOT, 'public', new URL(SHARE_IMAGE.url).pathname);
    const png = await readFile(file);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    // IHDR, the first chunk: width and height as 4-byte big-endian numbers.
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      SHARE_IMAGE.width,
      SHARE_IMAGE.height,
    ]);
    // Preview bots fetch it on a slow link too; the large card needs 1200 x 630.
    expect([SHARE_IMAGE.width, SHARE_IMAGE.height]).toEqual([1200, 630]);
    expect(png.length).toBeLessThan(300 * 1024);
  });

  it('is described by alt text that says what the image says', () => {
    expect(en.site.shareImageAlt).toContain(en.site.name);
    expect(en.site.shareImageAlt).toContain(en.site.shareTagline);
    expect(en.site.shareTagline).toBe('Find where to vote');
  });
});
