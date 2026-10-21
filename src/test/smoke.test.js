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

const GOOD_HEADERS = {
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'geolocation=(self), camera=(), microphone=()',
  'content-security-policy': "default-src 'self'",
};

// A host that behaves like the Render Blueprint in #31, with overrides per test.
function stubHost({ deepLink = 'shell', asset = 'js', headers = true } = {}) {
  return createServer((req, res) => {
    const common = headers ? GOOD_HEADERS : {};
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
      return res.end(SHELL);
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
      'GET / returns the app shell',
      'hard load of /p/CC007 returns the app shell',
      'hashed asset returns JavaScript',
      'headers on /',
      'headers on the hashed asset',
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
    expect(results).toHaveLength(3);
  });

  it('fails instead of throwing when the host is unreachable', async () => {
    server = stubHost();
    const url = await listen(server);
    server.close();
    await once(server, 'close');
    server = undefined;

    const results = await runSmoke(url, { checkHeaders: false });

    expect(failedChecks(results)).toContain('GET / returns the app shell');
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

    expect(stdout).toContain('5 of 5 checks passed');
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

describe('smoke test against a preview of the real build', () => {
  let outDir;
  let server;

  beforeAll(async () => {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'mapthevote-smoke-'));
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
    await server?.close();
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('passes the shell, deep link and asset checks', async () => {
    const url = server.resolvedUrls.local[0];
    const results = await runSmoke(url, { checkHeaders: false });

    expect(failedChecks(results)).toEqual([]);
  });
});
