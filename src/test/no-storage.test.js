// Addresses are sensitive (#20): the app keeps them only in memory. Fails when
// any app file under src/ (tests excluded) touches browser storage, cookies or
// the console, so a later change cannot quietly persist or log an address.
// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..');
const FORBIDDEN = [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bdocument\.cookie\b/,
  /\bconsole\./,
];

function isTestFile(file) {
  return /\.test\.jsx?$/.test(file) || file.split(path.sep).includes('test');
}

async function filesUsingStorage(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const hits = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(dir, file);
    if (isTestFile(relative)) continue;
    const text = await readFile(file, 'utf8');
    const found = FORBIDDEN.filter((pattern) => pattern.test(text)).map((p) => p.source);
    if (found.length) hits.push(`${relative}: ${found.join(', ')}`);
  }
  return hits;
}

describe('browser storage, cookies and logging', () => {
  it('finds each forbidden API in any app file, and skips tests', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'storage-scan-'));
    try {
      await writeFile(path.join(dir, 'a.js'), "localStorage.setItem('q', address);");
      await writeFile(path.join(dir, 'b.jsx'), 'document.cookie = `q=${address}`;');
      await writeFile(path.join(dir, 'c.js'), 'console.log(address);');
      await writeFile(path.join(dir, 'd.js'), 'indexedDB.open("x"); sessionStorage.x = 1;');
      await writeFile(path.join(dir, 'a.test.js'), 'localStorage.clear();');
      await writeFile(path.join(dir, 'safe.js'), 'const cookieless = true;');
      expect((await filesUsingStorage(dir)).sort()).toEqual([
        'a.js: \\blocalStorage\\b',
        'b.jsx: \\bdocument\\.cookie\\b',
        'c.js: \\bconsole\\.',
        'd.js: \\bsessionStorage\\b, \\bindexedDB\\b',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('are not used by any app file under src/', async () => {
    expect(await filesUsingStorage(SRC)).toEqual([]);
  });
});
