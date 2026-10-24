// Google Analytics (#69) in a real browser. The measurement ID ships empty
// (owner decision on #69), so this spec builds its own copy of the app with a
// test ID: a Vite plugin in this file rewrites src/config/site.js for that
// build only, so production code has no test hook. Only the client bundle:
// the pre-render step starts its own Vite server from vite.config.js, so this
// build's pre-rendered pages (/privacy among them) keep the shipped notice, and
// the spec opens none of them. Both builds are served at
// the production origin (Playwright answers https://mapthevotestl.com from the
// local preview server), so the origin check passes as it would live.
// Google's hosts are answered by a stub (the real gtag.js is never fetched:
// no live service in CI), every other outside host but the fixtures' ArcGIS
// layers is blocked. The real gtag.js's own hits are checked by hand before
// each election (README, Privacy).
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { build, preview } from 'vite';
import election from '../src/config/election.js';
import { gaMeasurementId, siteUrl } from '../src/config/site.js';
import { CODE, fixtureBody } from './fixtures.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEST_ID = 'G-E2ETEST01';
const SHIPPED_PREVIEW = 'http://localhost:4173';
const TEST_PORT = 4183;
const TOPIC = 'voter-id';
const DEVICE = { latitude: 38.6822, longitude: -90.4581 };
const NEEDLES = [CODE, CODE.toLowerCase(), '38.68', '90.45', '38%2E68', '90%2E45'];
const GOOGLE = /(^|\.)(googletagmanager\.com|google-analytics\.com)$/;

// One run is enough (the browser's size changes nothing here), and the
// projects' workers would each build and serve on the same port.
const ONCE = 'phone-360';
test.skip(() => test.info().project.name !== ONCE, `runs once, in ${ONCE}`);
test.describe.configure({ mode: 'serial' });

/** The test ID in src/config/site.js, for this spec's build only. */
function testMeasurementId() {
  return {
    name: 'e2e-analytics-id',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/config/site.js')) return null;
      const next = code.replace(/gaMeasurementId = '[^']*'/, `gaMeasurementId = '${TEST_ID}'`);
      if (!next.includes(TEST_ID)) throw new Error('site.js has no gaMeasurementId to replace');
      return next;
    },
  };
}

let outDir;
let server;
let testOrigin;

test.beforeAll(async () => {
  if (test.info().project.name !== ONCE) return;
  // A full build and pre-render, past the default 30 s on a slow runner.
  test.setTimeout(180_000);
  expect(existsSync(path.join(ROOT, 'content', 'en', 'learn', `${TOPIC}.md`))).toBe(true);
  outDir = await mkdtemp(path.join(os.tmpdir(), 'analytics-e2e-'));
  await build({
    root: ROOT,
    logLevel: 'warn',
    plugins: [testMeasurementId()],
    build: { outDir, emptyOutDir: true },
  });
  server = await preview({
    root: ROOT,
    logLevel: 'warn',
    build: { outDir },
    preview: { port: TEST_PORT, strictPort: true },
  });
  testOrigin = `http://localhost:${TEST_PORT}`;
});

test.afterAll(async () => {
  await server?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

/**
 * Serves `local` at the production origin, answers ArcGIS from the fixtures
 * (a point query with the precinct's own record) and Google with a stub,
 * blocks everything else. Returns every request that went to Google.
 */
async function serve(page, local) {
  const google = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === siteUrl) {
      const response = await route.fetch({ url: `${local}${url.pathname}${url.search}` });
      return route.fulfill({ response });
    }
    if (GOOGLE.test(url.hostname)) {
      google.push({ url: request.url(), body: request.postData() ?? '' });
      const script = url.pathname === '/gtag/js';
      return route.fulfill({
        status: script ? 200 : 204,
        contentType: 'text/javascript',
        body: script ? '/* gtag stub */' : '',
      });
    }
    let href = url.href;
    const form = new URLSearchParams(request.postData() ?? '');
    if (
      href.startsWith(election.serviceRoot) &&
      form.get('geometryType') === 'esriGeometryPoint' &&
      url.pathname.includes(election.layers.precincts)
    ) {
      const byId = new URL(url);
      byId.searchParams.set('where', `precinct='${CODE}'`);
      href = byId.href;
    }
    const body = fixtureBody(href, form.toString());
    if (body === null) return route.abort();
    return route.fulfill({ contentType: 'application/json', body });
  });
  return google;
}

const dataLayer = (page) =>
  page.evaluate(() => (window.dataLayer ? window.dataLayer.map((e) => Array.from(e)) : null));

const pageViews = (layer) =>
  layer.filter(([command, name]) => command === 'event' && name === 'page_view');

// Well past the load event and the analytics module's longest idle wait (2 s).
async function settle(page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(5_000);
}

test('with an ID: redacted page views, no voter data to Google, no cookies', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation'], { origin: siteUrl });
  await context.setGeolocation(DEVICE);
  const google = await serve(page, testOrigin);

  await page.goto(`${siteUrl}/`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Google's script is added after the load event, in idle time.
  await expect.poll(() => google.length, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page).toHaveURL(`${siteUrl}/p/${CODE}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'How to vote' }).first().click();
  await expect(page).toHaveURL(`${siteUrl}/learn`);
  await page.locator(`main a[href="/learn/${TOPIC}"]`).first().click();
  await expect(page).toHaveURL(`${siteUrl}/learn/${TOPIC}`);

  const layer = await dataLayer(page);
  expect(layer[0]).toEqual([
    'consent',
    'default',
    {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
  ]);
  expect(pageViews(layer).map(([, , hit]) => hit.page_location)).toEqual([
    `${siteUrl}/`,
    `${siteUrl}/p/:precinct`,
    `${siteUrl}/learn`,
    `${siteUrl}/learn/${TOPIC}`,
  ]);
  for (const [, , hit] of pageViews(layer)) expect(hit.page_referrer).toBe('');

  const sent = JSON.stringify(layer);
  for (const needle of NEEDLES) expect(sent).not.toContain(needle);
  expect(sent).not.toContain('granted');

  expect(google.map((r) => r.url)).toEqual([
    `https://www.googletagmanager.com/gtag/js?id=${TEST_ID}`,
  ]);
  for (const request of google) {
    for (const needle of NEEDLES) expect(`${request.url} ${request.body}`).not.toContain(needle);
  }
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('with an ID and Global Privacy Control: nothing goes to Google', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true });
  });
  const google = await serve(page, testOrigin);
  await page.goto(`${siteUrl}/p/${CODE}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settle(page);
  expect(await page.evaluate(() => navigator.globalPrivacyControl)).toBe(true);
  expect(google).toEqual([]);
  expect(await dataLayer(page)).toBeNull();
});

test('as shipped, with the ID empty: nothing goes to Google', async ({ page }) => {
  test.skip(gaMeasurementId !== '', 'the shipped ID is set: the test ID cases cover it');
  const google = await serve(page, SHIPPED_PREVIEW);
  await page.goto(`${siteUrl}/p/${CODE}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settle(page);
  expect(google).toEqual([]);
  expect(await dataLayer(page)).toBeNull();
});
