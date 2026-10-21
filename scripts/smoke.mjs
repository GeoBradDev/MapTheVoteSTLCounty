// Post-deploy smoke test: checks that a deployed copy of the app serves the
// shell, survives a hard load of a deep link, serves its hashed assets, and
// sends the expected headers.
// Usage: node scripts/smoke.mjs <base-url> [--skip-headers]
// Use --skip-headers against hosts that set none, such as `npm run preview`.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEEP_LINK = '/p/CC007';
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

async function get(baseUrl, pathname) {
  return fetch(new URL(pathname, baseUrl), {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// Returns the shell's module script path, or throws with what was wrong. The
// shell must be served at the requested path: a redirect to /index.html would
// drop the route, so only scheme or host redirects (http to https) may happen.
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
  return src;
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
 */
export async function runSmoke(baseUrl, { checkHeaders = true } = {}) {
  let root;
  let script;
  let asset;

  const results = [
    await check('GET / returns the app shell', async () => {
      root = await get(baseUrl, '/');
      script = await shellScript(root, '/');
      return script;
    }),
    await check(`hard load of ${DEEP_LINK} returns the app shell`, async () => {
      const src = await shellScript(await get(baseUrl, DEEP_LINK), DEEP_LINK);
      if (script && src !== script) throw new Error(`script ${src}, but / has ${script}`);
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
    console.error('Usage: node scripts/smoke.mjs <base-url> [--skip-headers]');
    return 2;
  }
  const results = await runSmoke(baseUrl, { checkHeaders: !args.includes('--skip-headers') });
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
