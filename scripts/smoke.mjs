// Post-deploy smoke test: checks that a deployed copy of the app serves the
// home page and the shell, survives a hard load of a County and a City
// precinct link and of the wait times page, serves its hashed assets, serves
// robots.txt and sitemap.xml as real files (#97), serves the public pages
// pre-rendered (#99), and sends the expected headers.
// Usage: node scripts/smoke.mjs <base-url> [--skip-headers] [--preview]
// Use --skip-headers against hosts that set none, such as `npm run preview`.
// Use --preview against a pull request preview, whose build keeps crawlers
// out: it checks for a disallow-all robots.txt and a noindex shell instead.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { siteUrl } from '../src/config/site.js';

const DEEP_LINK = '/p/CC007';
// A City precinct link (#95): the same shell, client-rendered by the City chunk.
const CITY_DEEP_LINK = '/p/W01P12';
// The early voting wait times page (#104): live data, client-rendered from
// the shell like a precinct page, never pre-rendered.
const WAIT_TIMES = '/early-voting';
// Pre-rendered pages (#99) to hard load: the home page, the learn index and one
// topic. Change the topic if content/en/learn/voter-id.md is ever renamed.
const PRERENDERED = ['/', '/learn', '/learn/voter-id'];
const TIMEOUT_MS = 10_000;

// The headers the Render Blueprint (render.yaml) sets. Each entry passes when
// `test` accepts the header's value. src/test/render.test.js checks render.yaml
// against these tables, so change both together.
export const SHELL_HEADERS = [
  { name: 'referrer-policy', test: (v) => v === 'no-referrer' },
  { name: 'x-content-type-options', test: (v) => v === 'nosniff' },
  { name: 'permissions-policy', test: (v) => v !== null },
  {
    name: 'content-security-policy',
    test: (v, headers) => v !== null || headers.has('content-security-policy-report-only'),
  },
  { name: 'cache-control', test: (v) => v?.includes('no-cache') ?? false },
];
export const ASSET_HEADERS = [
  { name: 'cache-control', test: (v) => v?.includes('immutable') ?? false },
];

const SCRIPT_SRC = /<script\b[^>]*\btype="module"[^>]*\bsrc="(\/assets\/[^"]+\.js)"/;
const SITEMAP_LINE = /^Sitemap: https:\/\/\S+\/sitemap\.xml$/m;
const DISALLOW_ALL = /^Disallow: \/$/m;
const NOINDEX = /<meta\b[^>]*\bname="robots"[^>]*\bcontent="noindex"/;

async function get(baseUrl, pathname) {
  return fetch(new URL(pathname, baseUrl), {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// Returns the shell's module script path and its HTML, or throws with what
// was wrong. The shell must be served at the requested path: a redirect to
// /index.html would drop the route, so only scheme or host redirects (http to
// https) may happen.
async function shellScript(res, pathname) {
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const finalPath = new URL(res.url).pathname;
  if (finalPath !== pathname) throw new Error(`redirected to ${finalPath}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) throw new Error(`content-type ${type || 'missing'}`);
  const body = await res.text();
  if (!body.includes('id="root"')) throw new Error('no #root element');
  const src = body.match(SCRIPT_SRC)?.[1];
  if (!src) throw new Error('no module script under /assets/');
  return { src, body };
}

// Throws unless `body` is the page pre-rendered for `pathname`: its markup in
// the root, a heading, and its canonical (always the production address).
function checkPrerendered(body, pathname) {
  if (!body.includes(`data-prerendered="${pathname}"`)) throw new Error('not pre-rendered');
  if (!/<div id="root"[^>]*>[\s\S]*<h1\b/.test(body)) throw new Error('no h1 in #root');
  const canonical = `<link rel="canonical" href="${siteUrl}${pathname}">`;
  if (!body.includes(canonical)) throw new Error(`no ${canonical}`);
}

// Returns the body of a real file at `pathname` whose content type includes
// `type`, or throws. The SPA rewrite answers a missing file with the shell.
async function fileBody(baseUrl, pathname, type) {
  const res = await get(baseUrl, pathname);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const actual = res.headers.get('content-type') ?? '';
  const body = await res.text();
  if (body.includes('id="root"')) throw new Error('got the app shell');
  if (!actual.includes(type)) throw new Error(`content-type ${actual || 'missing'}`);
  return body;
}

function missingHeaders(headers, expected) {
  return expected
    .filter(({ name, test }) => !test(headers.get(name), headers))
    .map(({ name }) => `${name}: ${headers.get(name) ?? 'missing'}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    return { name, ok: true, detail: detail ?? '' };
  } catch (error) {
    return { name, ok: false, detail: error.message };
  }
}

/**
 * Runs every check against `baseUrl` and returns one result per check:
 * `{ name, ok, detail }`. Never throws; a network error fails its check.
 * `preview: true` checks a pull request preview's crawler rules instead of
 * production's robots.txt and sitemap.
 */
export async function runSmoke(baseUrl, { checkHeaders = true, preview = false } = {}) {
  let root;
  let rootHtml;
  let deepLinkHtml;
  let script;
  let asset;

  const results = [
    // `/` is the pre-rendered home page (#99), loading the same app script.
    await check('GET / returns the home page', async () => {
      root = await get(baseUrl, '/');
      ({ src: script, body: rootHtml } = await shellScript(root, '/'));
      return script;
    }),
    await check(`hard load of ${DEEP_LINK} returns the app shell`, async () => {
      const { src, body } = await shellScript(await get(baseUrl, DEEP_LINK), DEEP_LINK);
      deepLinkHtml = body;
      if (script && src !== script) throw new Error(`script ${src}, but / has ${script}`);
      // Precinct pages are client-rendered from the empty shell, never a
      // pre-rendered page (#99).
      if (body.includes('data-prerendered')) throw new Error('got a pre-rendered page');
    }),
    await check(`hard load of ${CITY_DEEP_LINK} returns the app shell`, async () => {
      const { src, body } = await shellScript(await get(baseUrl, CITY_DEEP_LINK), CITY_DEEP_LINK);
      if (script && src !== script) throw new Error(`script ${src}, but / has ${script}`);
      if (body.includes('data-prerendered')) throw new Error('got a pre-rendered page');
    }),
    await check(`hard load of ${WAIT_TIMES} returns the app shell`, async () => {
      const { src, body } = await shellScript(await get(baseUrl, WAIT_TIMES), WAIT_TIMES);
      if (script && src !== script) throw new Error(`script ${src}, but / has ${script}`);
      if (body.includes('data-prerendered')) throw new Error('got a pre-rendered page');
    }),
    await check('hashed asset returns JavaScript', async () => {
      if (!script) throw new Error('no asset path: the / check failed');
      asset = await get(baseUrl, script);
      await asset.body?.cancel();
      if (asset.status !== 200) throw new Error(`${script} status ${asset.status}`);
      const type = asset.headers.get('content-type') ?? '';
      if (!type.includes('javascript')) throw new Error(`${script} content-type ${type}`);
      return script;
    }),
  ];

  for (const pathname of PRERENDERED) {
    results.push(
      await check(`hard load of ${pathname} returns the pre-rendered page`, async () => {
        const { body } = await shellScript(await get(baseUrl, pathname), pathname);
        checkPrerendered(body, pathname);
      }),
    );
  }

  if (preview) {
    results.push(
      await check('/robots.txt keeps every crawler out', async () => {
        const body = await fileBody(baseUrl, '/robots.txt', 'text/plain');
        if (!DISALLOW_ALL.test(body)) throw new Error('no "Disallow: /" line');
      }),
      // The pre-rendered pages and the shell every other path gets are
      // built from one template, but check both.
      await check('the home page and the app shell are marked noindex', async () => {
        for (const [name, html] of [
          ['/', rootHtml],
          [DEEP_LINK, deepLinkHtml],
        ]) {
          if (html === undefined) throw new Error(`no page: the ${name} check failed`);
          if (!NOINDEX.test(html))
            throw new Error(`no <meta name="robots" content="noindex"> on ${name}`);
        }
      }),
    );
  } else {
    results.push(
      await check('/robots.txt is text naming the sitemap', async () => {
        const body = await fileBody(baseUrl, '/robots.txt', 'text/plain');
        if (!SITEMAP_LINE.test(body)) throw new Error('no "Sitemap: https://.../sitemap.xml" line');
      }),
      await check('/sitemap.xml is XML, not the app shell', async () => {
        const body = await fileBody(baseUrl, '/sitemap.xml', 'xml');
        if (!body.includes('<urlset')) throw new Error('no <urlset> element');
      }),
    );
  }

  if (checkHeaders) {
    for (const [name, res, expected] of [
      ['headers on /', () => root, SHELL_HEADERS],
      ['headers on the hashed asset', () => asset, ASSET_HEADERS],
    ]) {
      results.push(
        await check(name, async () => {
          if (!res()) throw new Error('no response to check');
          const missing = missingHeaders(res().headers, expected);
          if (missing.length) throw new Error(missing.join('; '));
        }),
      );
    }
  }

  return results;
}

async function main(args) {
  const baseUrl = args.find((a) => !a.startsWith('--'));
  if (!baseUrl) {
    console.error('Usage: node scripts/smoke.mjs <base-url> [--skip-headers] [--preview]');
    return 2;
  }
  const results = await runSmoke(baseUrl, {
    checkHeaders: !args.includes('--skip-headers'),
    preview: args.includes('--preview'),
  });
  for (const { name, ok, detail } of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed} of ${results.length} checks passed`);
  return passed === results.length ? 0 : 1;
}

// import.meta.url has symlinks resolved and argv[1] does not, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
