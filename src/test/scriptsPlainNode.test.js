// scripts/check-geocoder.mjs runs under plain Node, in the scheduled data
// health check and by hand, where a module that pulls in a .jsx file (as
// src/cityChunk.js does) fails with "Unknown file extension". locate() loads
// that chunk by default, which once made every City address read as stl-city
// (#198). So the script must give every locate() call the City's data module
// (the first test), and every module it imports from src/ must load without
// Vite (the second).
// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/check-geocoder.mjs');

// The script's static imports from src/, resolved to file URLs.
function srcImports(file) {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/\bfrom\s+'(\.\.\/src\/[^']+)'/g)].map(
    ([, specifier]) => new URL(specifier, pathToFileURL(file)).href,
  );
}

describe('scripts/check-geocoder.mjs under plain Node (#198)', () => {
  const imports = srcImports(SCRIPT);

  it('imports the City data module, not the City chunk', () => {
    expect(imports).toContain(pathToFileURL(path.join(ROOT, 'src/data/cityArcgis.js')).href);
    expect(imports.some((url) => url.endsWith('/src/cityChunk.js'))).toBe(false);
    // And hands it to every locate() call, whose own default loads the City chunk.
    const calls = readFileSync(SCRIPT, 'utf8').match(/\bawait locate\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/\{\s*loadCity:/);
  });

  it('loads every module it imports from src/ with plain node', () => {
    expect(imports.length).toBeGreaterThan(0);
    const code = imports.map((url) => `await import(${JSON.stringify(url)});`).join('');
    // Throws, failing the test, when any import fails to load.
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });
});
