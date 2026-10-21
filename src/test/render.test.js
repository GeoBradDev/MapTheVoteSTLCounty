// Checks the Render Blueprint (render.yaml) against what the app and the
// post-deploy smoke test need, so hosting config is reviewed like code.
// Render's own behavior (CDN, matching, previews) is checked after a deploy
// with `npm run smoke`; this file checks the config that drives it.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import viteConfig from '../../vite.config.js';
import election from '../config/election.js';
import { DEFAULT_BASE_URL as PHOTON } from '../data/photon.js';
import { BASEMAP_STYLE_URL } from '../features/lookup/basemap.js';
import { ASSET_HEADERS, SHELL_HEADERS } from '../../scripts/smoke.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASEMAP = new URL(BASEMAP_STYLE_URL).origin;
const SHELL_PATHS = ['/', '/index.html', '/p/CC007', '/learn', '/learn/voter-id'];
const ASSET_PATH = '/assets/index-abc123.js';
// Every kind of path the site serves, for the overlap check.
const PROBE_PATHS = [
  ...SHELL_PATHS,
  '/p/CC007/extra',
  ASSET_PATH,
  '/assets/index-abc123.css',
  '/sw.js',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/no-such-page',
];

// Whether a Render header path matches a request path. Per
// https://render.com/docs/static-site-headers: a trailing `*` matches the rest
// of the path (`/*` matches every path, `/blog/*` matches `/blog/` and below),
// a `**/` segment spans one or more directories (`/**/*.css` matches
// `/assets/theme.css`, not `/tokens.css`), and any other `*` stays within one
// segment (`/*.css` matches `/tokens.css`, not `/assets/theme.css`).
function renderPathMatches(pattern, requestPath) {
  const source = pattern
    .split(/(\*\*\/|\*)/)
    .map((part, i, parts) => {
      if (part === '**/') return '(?:.*/)';
      if (part === '*') return i === parts.length - 2 && parts.at(-1) === '' ? '.*' : '[^/]*';
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`).test(requestPath);
}

function headersFor(rules, requestPath) {
  const headers = new Headers();
  for (const rule of rules) {
    if (renderPathMatches(rule.path, requestPath)) headers.append(rule.name, rule.value);
  }
  return headers;
}

// [name, values] pairs in order. A list, not a Map: browsers enforce the first
// copy of a repeated directive, so duplicates must stay visible.
function cspDirectives(policy) {
  return policy
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([name, ...values]) => [name.toLowerCase(), values]);
}

let blueprint;
let site;

beforeAll(async () => {
  blueprint = parse(await readFile(path.join(ROOT, 'render.yaml'), 'utf8'));
  site = blueprint.services?.[0];
});

describe('Render path matching helper', () => {
  it('follows the documented wildcard examples', () => {
    expect(renderPathMatches('/*', '/')).toBe(true);
    expect(renderPathMatches('/*', '/assets/theme.css')).toBe(true);
    expect(renderPathMatches('/blog/*', '/blog/')).toBe(true);
    expect(renderPathMatches('/blog/*', '/blog/a/b')).toBe(true);
    expect(renderPathMatches('/blog/*', '/blogs')).toBe(false);
    expect(renderPathMatches('/*.css', '/tokens.css')).toBe(true);
    expect(renderPathMatches('/*.css', '/assets/theme.css')).toBe(false);
    expect(renderPathMatches('/**/*.css', '/assets/theme.css')).toBe(true);
    expect(renderPathMatches('/**/*.css', '/tokens.css')).toBe(false);
    expect(renderPathMatches('/**/*', '/blog/post')).toBe(true);
    expect(renderPathMatches('/**/*', '/blog')).toBe(false);
    expect(renderPathMatches('/', '/')).toBe(true);
    expect(renderPathMatches('/', '/index.html')).toBe(false);
  });
});

describe('render.yaml service', () => {
  it('is a single static site with no backend', () => {
    expect(Object.keys(blueprint)).toEqual(['services']);
    expect(blueprint.services).toHaveLength(1);
    expect(site.type).toBe('web');
    expect(site.runtime).toBe('static');
    expect(site.name).toEqual(expect.any(String));
    for (const key of ['startCommand', 'region', 'plan', 'dockerfilePath', 'healthCheckPath']) {
      expect(site).not.toHaveProperty(key);
    }
  });

  it('builds with the CI build command and publishes Vite output', () => {
    expect(site.branch).toBe('main');
    expect(site.buildCommand).toBe('npm ci && npm run build');
    const outDir = viteConfig.build?.outDir ?? 'dist';
    expect(site.staticPublishPath).toBe(`./${outDir}`);
  });

  it('deploys main only after CI passes, with a preview per pull request', () => {
    expect(site.autoDeployTrigger).toBe('checksPass');
    expect(site.previews).toEqual({ generation: 'automatic' });
    expect(site).not.toHaveProperty('autoDeploy');
    expect(site).not.toHaveProperty('pullRequestPreviewsEnabled');
  });

  // Not **/*.md: content under content/ (#21) is Markdown that ships in the
  // build, so a content-only fix must still deploy.
  it('skips builds only for changes that never ship', () => {
    expect(site.buildFilter).toEqual({ ignoredPaths: ['docs/**', 'README.md'] });
  });

  it('serves the production domain', () => {
    expect(site.domains).toEqual(['mapthevotestl.com']);
  });

  it('lets .node-version pick Node, not an env var', () => {
    const keys = (site.envVars ?? []).map((v) => v.key);
    expect(keys).not.toContain('NODE_VERSION');
  });
});

describe('render.yaml routes', () => {
  it('rewrites every path to the app shell for client routing', () => {
    expect(site.routes).toEqual([{ type: 'rewrite', source: '/*', destination: '/index.html' }]);
  });
});

describe('render.yaml headers', () => {
  it('gives every rule a path, name and value', () => {
    expect(site.headers.length).toBeGreaterThan(0);
    for (const rule of site.headers) {
      expect(Object.keys(rule).sort()).toEqual(['name', 'path', 'value']);
      expect(rule.path).toMatch(/^\//);
      expect(typeof rule.value).toBe('string');
    }
  });

  // Render does not document how two same-name rules on one path combine; a
  // joined or wrong Cache-Control could pin voters to an old build.
  it.each(PROBE_PATHS)('never sends two rules for one header name on %s', (requestPath) => {
    const names = site.headers
      .filter((rule) => renderPathMatches(rule.path, requestPath))
      .map((rule) => rule.name.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it.each(SHELL_PATHS)('sends what the smoke test expects on the shell at %s', (requestPath) => {
    const headers = headersFor(site.headers, requestPath);
    const failing = SHELL_HEADERS.filter(({ name, test }) => !test(headers.get(name), headers));
    expect(failing.map((h) => h.name)).toEqual([]);
    expect(headers.get('cache-control')).toBe('no-cache');
    expect(headers.get('content-security-policy')).toEqual(expect.any(String));
    expect(headers.get('strict-transport-security')).toMatch(/^max-age=\d{8,}/);
  });

  it('sends what the smoke test expects on a hashed asset', () => {
    const headers = headersFor(site.headers, ASSET_PATH);
    const failing = ASSET_HEADERS.filter(({ name, test }) => !test(headers.get(name), headers));
    expect(failing.map((h) => h.name)).toEqual([]);
    expect(headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('always revalidates the service worker', () => {
    expect(headersFor(site.headers, '/sw.js').get('cache-control')).toBe('no-cache');
  });

  it('allows geolocation for the page itself only', () => {
    expect(headersFor(site.headers, '/').get('permissions-policy')).toBe(
      'geolocation=(self), camera=(), microphone=()',
    );
  });
});

describe('Content-Security-Policy', () => {
  let directives;
  let csp;

  beforeAll(() => {
    directives = cspDirectives(headersFor(site.headers, '/').get('content-security-policy'));
    csp = new Map(directives);
  });

  it('names each directive once', () => {
    const names = directives.map(([name]) => name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  // The whole policy, so a loosened source or an added override directive
  // (script-src-elem, style-src-attr, ...) fails here and gets reviewed.
  it('is exactly the reviewed policy', () => {
    expect(Object.fromEntries(csp)).toEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", BASEMAP],
      'font-src': ["'self'"],
      'connect-src': ["'self'", new URL(election.serviceRoot).origin, PHOTON, BASEMAP],
      'manifest-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': [],
    });
  });

  it('allows no inline script or style, no eval and no wildcard source', () => {
    const sources = directives.flatMap(([, values]) => values);
    for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'data:', 'blob:']) {
      expect(sources).not.toContain(unsafe);
    }
  });

  it('is the same policy on every shell path', () => {
    const policies = SHELL_PATHS.map((p) =>
      headersFor(site.headers, p).get('content-security-policy'),
    );
    expect(new Set(policies).size).toBe(1);
  });
});

describe('Node version', () => {
  it('is pinned in .node-version and read by CI', async () => {
    const version = (await readFile(path.join(ROOT, '.node-version'), 'utf8')).trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const ci = parse(await readFile(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'));
    const setupNode = ci.jobs.check.steps.find((s) => s.uses?.startsWith('actions/setup-node'));
    expect(setupNode.with['node-version-file']).toBe('.node-version');
    expect(setupNode.with).not.toHaveProperty('node-version');
  });
});
