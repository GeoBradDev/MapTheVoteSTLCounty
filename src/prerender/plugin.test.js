// `vite preview` answers paths the way Render does (#99), so the e2e and
// Lighthouse runs see what production serves.
// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { outputFile } from './outputFile.js';
import election, { jurisdictions } from '../config/election.js';
import { isPageRequest, PRECINCT_PRECONNECT, previewHeaders, previewTarget } from './plugin.js';

let outDir;

beforeAll(async () => {
  outDir = await mkdtemp(path.join(os.tmpdir(), 'mapthevote-preview-'));
  for (const file of [
    'index.html',
    'shell.html',
    'learn/index.html',
    'learn/voter-id/index.html',
    'assets/a.js',
  ]) {
    await mkdir(path.dirname(path.join(outDir, file)), { recursive: true });
    await writeFile(path.join(outDir, file), file);
  }
});

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('outputFile', () => {
  it.each([
    ['/', 'index.html'],
    ['/learn', 'learn/index.html'],
    ['/learn/voter-id', 'learn/voter-id/index.html'],
  ])('writes %s to %s', (route, file) => {
    expect(outputFile(route)).toBe(file);
  });
});

describe('previewTarget', () => {
  it.each([
    ['/', '/index.html'],
    ['/learn', '/learn/index.html'],
    ['/learn/', '/learn/index.html'],
    ['/learn/voter-id', '/learn/voter-id/index.html'],
    ['/learn/voter-id/', '/learn/voter-id/index.html'],
  ])('serves the directory index for %s', (pathname, target) => {
    expect(previewTarget(outDir, pathname)).toBe(target);
  });

  it.each(['/assets/a.js', '/index.html', '/shell.html'])('serves the file at %s as is', (p) => {
    expect(previewTarget(outDir, p)).toBeNull();
  });

  it.each(['/p/CC007', '/nope', '/learn/no-such-topic', '/learn/voter-id/x'])(
    'serves the shell for %s, which has no file',
    (pathname) => {
      expect(previewTarget(outDir, pathname)).toBe('/shell.html');
    },
  );

  it('leaves a path outside the output directory to Vite', () => {
    expect(previewTarget(outDir, '/../../etc/passwd')).toBeNull();
  });
});

describe('isPageRequest', () => {
  const req = (method, url, accept) => ({ method, url, headers: { accept } });

  it.each([
    req('GET', '/learn', 'text/html,application/xhtml+xml'),
    req('HEAD', '/learn', '*/*'),
    req('GET', '/learn', undefined),
  ])('routes a page request', (request) => {
    expect(isPageRequest(request)).toBe(true);
  });

  it.each([
    req('POST', '/learn', 'text/html'),
    req('GET', '/favicon.ico', 'image/avif,image/webp,*/*;q=0.8'),
    req('GET', '/data.json', 'application/json'),
  ])('leaves anything else to Vite', (request) => {
    expect(isPageRequest(request)).toBe(false);
  });
});

// A precinct page preconnects to the ArcGIS host its data comes from (#27,
// #156), as render.yaml's /p/* rule does, so the Lighthouse run measures it.
describe('previewHeaders', () => {
  it('preconnects a precinct page to each election service origin, once', () => {
    const origins = [
      ...new Set(
        [jurisdictions.county, jurisdictions.city].map((j) => new URL(j.serviceRoot).origin),
      ),
    ];
    expect(origins).toContain(new URL(election.serviceRoot).origin);
    expect(PRECINCT_PRECONNECT).toBe(
      origins.map((origin) => `<${origin}>; rel=preconnect; crossorigin`).join(', '),
    );
    for (const pathname of ['/p/CC007', '/p/W01P12', '/p/anything']) {
      expect(previewHeaders(pathname)).toEqual({ Link: PRECINCT_PRECONNECT });
    }
  });

  it.each(['/', '/p', '/p/', '/early-voting', '/learn/voter-id', '/privacy', '/assets/a.js'])(
    'sends no Link header on %s',
    (pathname) => {
      expect(previewHeaders(pathname)).toEqual({});
    },
  );
});
