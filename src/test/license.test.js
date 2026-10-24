// The code is MIT (#118). The map data and the voter information are not the
// project's to license, so the README says who they belong to.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BASEMAP_ATTRIBUTION } from '../features/lookup/basemap.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

async function licenseSection() {
  const readme = await read('README.md');
  const start = readme.indexOf('\n## License\n');
  expect(start).toBeGreaterThan(-1);
  const next = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, next === -1 ? undefined : next).replace(/\s+/g, ' ');
}

describe('license', () => {
  it('ships the MIT License text with the copyright line', async () => {
    const text = await read('LICENSE');
    expect(text.startsWith('MIT License\n')).toBe(true);
    expect(text).toContain('Copyright (c) 2026 Brad Stricherz');
    expect(text).toContain(
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
    );
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
  });

  it('names MIT in package.json and the lockfile', async () => {
    const pkg = JSON.parse(await read('package.json'));
    const lock = JSON.parse(await read('package-lock.json'));
    expect(pkg.license).toBe('MIT');
    expect(lock.packages[''].license).toBe('MIT');
  });

  it('says in the README that the code is MIT and links the LICENSE file', async () => {
    const section = await licenseSection();
    expect(section).toContain('MIT License');
    expect(section).toContain('(LICENSE)');
    expect(section).not.toMatch(/no license has been chosen/i);
  });

  it('credits every basemap provider the map shows, under the ODbL', async () => {
    const section = await licenseSection();
    expect(section).toContain('ODbL');
    expect(section).toContain('BASEMAP_ATTRIBUTION');
    for (const { label } of BASEMAP_ATTRIBUTION) {
      expect(section).toContain(label.replace(/^©\s*/, ''));
    }
  });

  it('leaves the voter information with both official boards', async () => {
    const section = await licenseSection();
    expect(section).toContain('St. Louis County Board of Election Commissioners');
    expect(section).toContain('City of St. Louis Board of Election Commissioners');
    expect(section).toMatch(/not covered by/i);
  });
});
