// The Content-Security-Policy and the Google Analytics measurement ID must
// agree (#191, owner decision): no Google host while the ID is empty, as it
// ships, and every host GA needs once it is set.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { gaMeasurementId } from '../config/site.js';
import { ANALYTICS_CSP, analyticsCspProblems } from './csp.js';
import { analyticsEnabled } from './index.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TEST_ID = 'G-TEST123';
const BASE =
  "default-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self' https://photon.komoot.io; object-src 'none'";
const WITH_GA =
  "default-src 'self'; script-src 'self' https://www.googletagmanager.com; " +
  "img-src 'self' https://*.google-analytics.com; " +
  'connect-src https://photon.komoot.io https://www.googletagmanager.com https://*.google-analytics.com; ' +
  "object-src 'none'";

async function shippedPolicy() {
  const blueprint = parse(await readFile(path.join(ROOT, 'render.yaml'), 'utf8'));
  return blueprint.services[0].headers.find(
    (rule) => rule.path === '/*' && rule.name === 'Content-Security-Policy',
  ).value;
}

describe('ANALYTICS_CSP', () => {
  it("is GA's loader and collector, in the directives gtag.js uses", () => {
    expect(ANALYTICS_CSP).toEqual({
      'script-src': ['https://www.googletagmanager.com'],
      'connect-src': ['https://www.googletagmanager.com', 'https://*.google-analytics.com'],
      'img-src': ['https://*.google-analytics.com'],
    });
  });
});

describe('analyticsCspProblems', () => {
  it('finds none with the ID empty and no Google host', () => {
    expect(analyticsCspProblems(BASE, '')).toEqual([]);
  });

  it('finds none with the ID set and every host', () => {
    expect(analyticsCspProblems(WITH_GA, TEST_ID)).toEqual([]);
  });

  it('names each host to add, by directive, when the ID is set without them', () => {
    const problems = analyticsCspProblems(BASE, TEST_ID);
    expect(problems).toEqual([
      expect.stringContaining('add https://www.googletagmanager.com to script-src'),
      expect.stringContaining(
        'add https://www.googletagmanager.com https://*.google-analytics.com to connect-src',
      ),
      expect.stringContaining('add https://*.google-analytics.com to img-src'),
    ]);
    for (const problem of problems) {
      expect(problem).toContain(`gaMeasurementId is set (${TEST_ID})`);
      expect(problem).toContain('render.yaml');
    }
  });

  it('names only the hosts still missing', () => {
    const partial = WITH_GA.replace(
      "img-src 'self' https://*.google-analytics.com",
      "img-src 'self'",
    );
    expect(analyticsCspProblems(partial, TEST_ID)).toEqual([
      expect.stringContaining('add https://*.google-analytics.com to img-src'),
    ]);
  });

  it('names each Google host to remove while the ID is empty', () => {
    expect(analyticsCspProblems(WITH_GA, '')).toEqual([
      expect.stringContaining('remove https://www.googletagmanager.com from script-src'),
      expect.stringContaining('remove https://*.google-analytics.com from img-src'),
      expect.stringContaining(
        'remove https://www.googletagmanager.com https://*.google-analytics.com from connect-src',
      ),
    ]);
    for (const problem of analyticsCspProblems(WITH_GA, '')) {
      expect(problem).toContain('gaMeasurementId is empty');
    }
  });

  // GA loads only with a GA4 ID (analyticsEnabled), so anything else is off
  // and must not open the policy to Google.
  it('takes an ID that is not a GA4 measurement ID as off', () => {
    for (const id of ['UA-123', 'g-abc123', ' ']) {
      expect(analyticsCspProblems(BASE, id), id).toEqual([]);
      expect(analyticsCspProblems(WITH_GA, id), id).toHaveLength(3);
    }
  });

  // A browser enforces the first copy of a repeated directive and ignores the rest.
  it('checks the first copy of a repeated directive', () => {
    const repeated = WITH_GA.replace(
      "script-src 'self' https://www.googletagmanager.com",
      "script-src 'self'; script-src 'self' https://www.googletagmanager.com",
    );
    expect(analyticsCspProblems(repeated, TEST_ID)).toEqual([
      expect.stringContaining('add https://www.googletagmanager.com to script-src'),
    ]);
  });

  // Not only the two hosts GA uses: any Google host, in any directive.
  it('finds any other Google host while the ID is empty', () => {
    for (const source of [
      'https://region1.google-analytics.com',
      'https://*.analytics.google.com',
      'https://www.google.com',
      'googletagmanager.com',
      'https://www.googletagmanager.com.',
      'https://www.google.co.uk',
      'https://ssl.gstatic.com',
      'https://*.doubleclick.net',
      'https://www.googleadservices.com',
      'https://www.googletagservices.com',
    ]) {
      expect(analyticsCspProblems(`${BASE}; frame-src ${source}`, ''), source).toEqual([
        expect.stringContaining(`remove ${source} from frame-src`),
      ]);
    }
  });

  // A source that allows every host allows Google's too.
  it('finds a scheme or wildcard source that would allow Google while the ID is empty', () => {
    for (const source of ['*', 'https:', 'http:', 'HTTPS:']) {
      expect(analyticsCspProblems(`${BASE}; script-src-elem ${source}`, ''), source).toEqual([
        expect.stringContaining(`remove ${source} from script-src-elem`),
      ]);
    }
  });

  it('does not take a lookalike host for Google', () => {
    expect(analyticsCspProblems(`${BASE}; frame-src https://notgoogle.com.example`, '')).toEqual(
      [],
    );
  });
});

describe('render.yaml', () => {
  it('allows the Google Analytics hosts exactly when the measurement ID is set', async () => {
    const problems = analyticsCspProblems(await shippedPolicy(), gaMeasurementId);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  // As it ships (owner decision on #69).
  it.runIf(!analyticsEnabled())(
    'names no Google host while the measurement ID is empty',
    async () => {
      expect(await shippedPolicy()).not.toMatch(/google/i);
    },
  );
});
