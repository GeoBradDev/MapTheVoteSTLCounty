// Google Analytics (#69) lives in one module, src/analytics/, which redacts
// every page view. Fails when any other app file under src/ (tests excluded)
// calls gtag, reads the dataLayer or names Google's analytics hosts, so a
// later change cannot send GA something that skipped the redaction.
// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..');
const MODULE_DIR = 'analytics';
const FORBIDDEN = [/\bgtag\b/, /\bdataLayer\b/, /googletagmanager/i, /google-analytics/i];

function isTestFile(file) {
  return /\.test\.jsx?$/.test(file) || file.split(path.sep).includes('test');
}

async function filesNamingAnalytics(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const hits = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(dir, file);
    if (isTestFile(relative) || relative.split(path.sep)[0] === MODULE_DIR) continue;
    const text = await readFile(file, 'utf8');
    const found = FORBIDDEN.filter((pattern) => pattern.test(text)).map((p) => p.source);
    if (found.length) hits.push(`${relative}: ${found.join(', ')}`);
  }
  return hits;
}

describe('Google Analytics outside src/analytics/', () => {
  it('finds gtag, the dataLayer and the hosts in any other app file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'analytics-scan-'));
    try {
      await mkdir(path.join(dir, MODULE_DIR));
      await writeFile(path.join(dir, MODULE_DIR, 'index.js'), "gtag('event'); dataLayer;");
      await writeFile(path.join(dir, 'a.jsx'), "window.gtag('event', 'page_view');");
      await writeFile(path.join(dir, 'b.js'), 'window.dataLayer.push(x);');
      await writeFile(path.join(dir, 'c.js'), "fetch('https://www.googletagmanager.com/x');");
      await writeFile(path.join(dir, 'd.js'), "const u = 'region1.google-analytics.com';");
      await writeFile(path.join(dir, 'e.test.js'), "gtag('x');");
      await writeFile(path.join(dir, 'safe.js'), "pageView('/'); // Google Analytics");
      expect((await filesNamingAnalytics(dir)).sort()).toEqual([
        'a.jsx: \\bgtag\\b',
        'b.js: \\bdataLayer\\b',
        'c.js: googletagmanager',
        'd.js: google-analytics',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is named by no app file under src/', async () => {
    expect(await filesNamingAnalytics(SRC)).toEqual([]);
  });
});
