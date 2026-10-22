// Runs the post-deploy smoke test against a real preview of the build, and
// against stub hosts that break each thing the smoke test must catch.
// @vitest-environment node
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { build, preview } from 'vite';
import { runSmoke } from '../../scripts/smoke.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/smoke.mjs');

const SHELL =
  '<!doctype html><html><head>' +
  '<script type="module" crossorigin src="/assets/index-abc123.js"></script>' +
  '</head><body><div id="root"></div></body></html>';

const PREVIEW_SHELL = SHELL.replace('</head>', '<meta name="robots" content="noindex"></head>');
// A pre-rendered public page (#99): its canonical in the head, its markup in
// the root.
const prerendered = (shell, route) =>
  shell
    .replace('</head>', `<link rel="canonical" href="https://mapthevotestl.com${route}"></head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root" data-prerendered="${route}"><div><h1 tabindex="-1">Page</h1></div></div>`,
    );
const ROBOTS = 'User-agent: *\nAllow: /\nSitemap: https://mapthevotestl.com/sitemap.xml\n';
const PREVIEW_ROBOTS = 'User-agent: *\nDisallow: /\n';
const SITEMAP =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  '<url><loc>https://mapthevotestl.com/</loc></url></urlset>\n';

const GOOD_HEADERS = {
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'geolocation=(self), camera=(), microphone=()',
  'content-security-policy': "default-src 'self'",
};

// A host that behaves like the Render Blueprint (render.yaml), with overrides per test.
// `preview` serves what a pull request preview build ships; `robots` and
// `sitemap` set to 'missing' leave those files out, so the rewrite answers
// them with the shell, as Render does. `pages` set to 'shell' leaves the
// pre-rendered pages out, so the shell answers them too; `deepLink` set to
// 'home' answers a precinct link with the pre-rendered home page, and
// 'indexable' with a production shell (no noindex).
function stubHost({
  deepLink = 'shell',
  pages = 'prerendered',
  asset = 'js',
  headers = true,
  preview = false,
  robots = preview ? 'preview' : 'production',
  sitemap = preview ? 'missing' : 'xml',
} = {}) {
  const shell = preview ? PREVIEW_SHELL : SHELL;
  return createServer((req, res) => {
    const common = headers ? GOOD_HEADERS : {};
    if (req.url === '/robots.txt' && robots !== 'missing') {
      res.writeHead(200, { ...common, 'content-type': 'text/plain; charset=utf-8' });
      return res.end(robots === 'preview' ? PREVIEW_ROBOTS : ROBOTS);
    }
    if (req.url === '/sitemap.xml' && sitemap !== 'missing') {
      res.writeHead(200, { ...common, 'content-type': 'application/xml' });
      return res.end(SITEMAP);
    }
    if (req.url === '/assets/index-abc123.js') {
      if (asset === 'html') {
        res.writeHead(200, { ...common, 'content-type': 'text/html' });
        return res.end(SHELL);
      }
      res.writeHead(200, {
        ...common,
        'content-type': 'text/javascript',
        ...(headers && { 'cache-control': 'public, max-age=31536000, immutable' }),
      });
      return res.end('console.log(1)');
    }
    if (pages === 'prerendered' && ['/', '/learn', '/learn/voter-id'].includes(req.url)) {
      res.writeHead(200, {
        ...common,
        'content-type': 'text/html; charset=utf-8',
        ...(headers && { 'cache-control': 'no-cache' }),
      });
      return res.end(prerendered(shell, req.url));
    }
    if (deepLink === 'indexable' && req.url === '/p/CC007') {
      res.writeHead(200, { ...common, 'content-type': 'text/html; charset=utf-8' });
      return res.end(SHELL);
    }
    if (deepLink === 'home' && req.url === '/p/CC007') {
      res.writeHead(200, { ...common, 'content-type': 'text/html; charset=utf-8' });
      return res.end(prerendered(shell, '/'));
    }
    if (deepLink === 'redirect' && req.url === '/p/CC007') {
      res.writeHead(301, { location: '/index.html' });
      return res.end();
    }
    if (req.url === '/' || req.url === '/index.html' || deepLink === 'shell') {
      res.writeHead(200, {
        ...common,
        'content-type': 'text/html; charset=utf-8',
        ...(headers && { 'cache-control': 'no-cache' }),
      });
      return res.end(shell);
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('Not Found');
  });
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function failedChecks(results) {
  return results.filter((r) => !r.ok).map((r) => r.name);
}

describe('smoke test against stub hosts', () => {
  let server;

  afterEach(async () => {
    if (server) {
      server.close();
      await once(server, 'close');
      server = undefined;
    }
  });

  it('passes every check, headers included, on a correctly configured host', async () => {
    server = stubHost();
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual([]);
    expect(results.map((r) => r.name)).toEqual([
      'GET / returns the home page',
      'hard load of /p/CC007 returns the app shell',
      'hashed asset returns JavaScript',
      'hard load of / returns the pre-rendered page',
      'hard load of /learn returns the pre-rendered page',
      'hard load of /learn/voter-id returns the pre-rendered page',
      '/robots.txt is text naming the sitemap',
      '/sitemap.xml is XML, not the app shell',
      'headers on /',
      'headers on the hashed asset',
    ]);
  });

  it('fails when robots.txt is missing and the shell answers it', async () => {
    server = stubHost({ robots: 'missing' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual(['/robots.txt is text naming the sitemap']);
  });

  it('fails when robots.txt names no sitemap', async () => {
    server = stubHost({ robots: 'preview' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual(['/robots.txt is text naming the sitemap']);
  });

  it('fails when the sitemap is missing and the shell answers it', async () => {
    server = stubHost({ sitemap: 'missing' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual(['/sitemap.xml is XML, not the app shell']);
  });

  it('checks a pull request preview for disallow-all and noindex with preview: true', async () => {
    server = stubHost({ preview: true });
    const results = await runSmoke(await listen(server), { preview: true });

    expect(failedChecks(results)).toEqual([]);
    expect(results.map((r) => r.name)).toEqual([
      'GET / returns the home page',
      'hard load of /p/CC007 returns the app shell',
      'hashed asset returns JavaScript',
      'hard load of / returns the pre-rendered page',
      'hard load of /learn returns the pre-rendered page',
      'hard load of /learn/voter-id returns the pre-rendered page',
      '/robots.txt keeps every crawler out',
      'the home page and the app shell are marked noindex',
      'headers on /',
      'headers on the hashed asset',
    ]);
  });

  it('fails a preview whose app shell, served for precinct links, is not noindex', async () => {
    server = stubHost({ preview: true, deepLink: 'indexable' });
    const results = await runSmoke(await listen(server), { preview: true });

    expect(failedChecks(results)).toEqual(['the home page and the app shell are marked noindex']);
  });

  it('fails a preview check against a production host', async () => {
    server = stubHost();
    const results = await runSmoke(await listen(server), { preview: true });

    expect(failedChecks(results)).toEqual([
      '/robots.txt keeps every crawler out',
      'the home page and the app shell are marked noindex',
    ]);
  });

  it('fails when a deep link is not rewritten to the app shell', async () => {
    server = stubHost({ deepLink: '404' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual(['hard load of /p/CC007 returns the app shell']);
  });

  it('fails when a deep link redirects to the shell instead of being rewritten', async () => {
    server = stubHost({ deepLink: 'redirect' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual(['hard load of /p/CC007 returns the app shell']);
  });

  it('fails when the public pages are answered with the shell, not pre-rendered', async () => {
    server = stubHost({ pages: 'shell' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual([
      'hard load of / returns the pre-rendered page',
      'hard load of /learn returns the pre-rendered page',
      'hard load of /learn/voter-id returns the pre-rendered page',
    ]);
  });

  it('fails when a deep link gets a pre-rendered page instead of the empty shell', async () => {
    server = stubHost({ deepLink: 'home' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual(['hard load of /p/CC007 returns the app shell']);
  });

  it('fails when the rewrite also catches the hashed asset', async () => {
    server = stubHost({ asset: 'html' });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toContain('hashed asset returns JavaScript');
  });

  it('names every missing header', async () => {
    server = stubHost({ headers: false });
    const results = await runSmoke(await listen(server));

    expect(failedChecks(results)).toEqual(['headers on /', 'headers on the hashed asset']);
    const detail = results.map((r) => r.detail).join('\n');
    for (const name of [
      'referrer-policy',
      'x-content-type-options',
      'permissions-policy',
      'content-security-policy',
      'cache-control',
    ]) {
      expect(detail).toContain(name);
    }
  });

  it('skips header checks with checkHeaders: false', async () => {
    server = stubHost({ headers: false });
    const results = await runSmoke(await listen(server), { checkHeaders: false });

    expect(failedChecks(results)).toEqual([]);
    expect(results).toHaveLength(8);
  });

  it('fails instead of throwing when the host is unreachable', async () => {
    server = stubHost();
    const url = await listen(server);
    server.close();
    await once(server, 'close');
    server = undefined;

    const results = await runSmoke(url, { checkHeaders: false });

    expect(failedChecks(results)).toContain('GET / returns the home page');
  });
});

describe('smoke test CLI', () => {
  let server;

  afterEach(async () => {
    server.close();
    await once(server, 'close');
  });

  it('exits 0 when every check passes', async () => {
    server = stubHost();
    const { stdout } = await promisify(execFile)('node', [SCRIPT, await listen(server)]);

    expect(stdout).toContain('10 of 10 checks passed');
  });

  it('runs the preview checks with --preview', async () => {
    server = stubHost({ preview: true });
    const { stdout } = await promisify(execFile)('node', [
      SCRIPT,
      await listen(server),
      '--preview',
    ]);

    expect(stdout).toContain('PASS /robots.txt keeps every crawler out');
    expect(stdout).toContain('10 of 10 checks passed');
  });

  it('exits 1 and prints the failure when a check fails', async () => {
    server = stubHost({ deepLink: '404' });
    const run = promisify(execFile)('node', [SCRIPT, await listen(server), '--skip-headers']);

    await expect(run).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('FAIL hard load of /p/CC007 returns the app shell'),
    });
  });

  it('still runs when invoked through a symlinked path', async () => {
    server = stubHost({ deepLink: '404' });
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mapthevote-link-'));
    try {
      await symlink(path.dirname(SCRIPT), path.join(dir, 'scripts'));
      const linked = path.join(dir, 'scripts/smoke.mjs');
      const run = promisify(execFile)('node', [linked, await listen(server), '--skip-headers']);

      await expect(run).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.each([
  ['production', false],
  ['pull request preview', true],
])('smoke test against a vite preview of the real %s build', (_, isPreview) => {
  let outDir;
  let server;
  const before = process.env.IS_PULL_REQUEST;

  beforeAll(async () => {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'mapthevote-smoke-'));
    if (isPreview) process.env.IS_PULL_REQUEST = 'true';
    else delete process.env.IS_PULL_REQUEST;
    const config = {
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.js'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    };
    await build(config);
    server = await preview({ ...config, preview: { port: 0, host: '127.0.0.1' } });
  }, 60_000);

  afterAll(async () => {
    if (before === undefined) delete process.env.IS_PULL_REQUEST;
    else process.env.IS_PULL_REQUEST = before;
    await server?.close();
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('passes every check for that kind of build', async () => {
    const url = server.resolvedUrls.local[0];
    const results = await runSmoke(url, { checkHeaders: false, preview: isPreview });

    expect(failedChecks(results)).toEqual([]);
  });

  it('fails the checks for the other kind of build', async () => {
    const url = server.resolvedUrls.local[0];
    const results = await runSmoke(url, { checkHeaders: false, preview: !isPreview });

    expect(failedChecks(results)).toHaveLength(2);
  });
});
