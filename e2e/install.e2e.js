// Installable (#25): Chromium's own installability check on the production
// build, the check Lighthouse's retired PWA category ran. The manifest's
// content is checked in src/test/manifest.test.js. No service worker: offline
// support is #183.
import { expect, test } from '@playwright/test';

// Chromium's new headless mode: the headless shell Playwright uses by default
// runs no installability check and answers every query with no errors.
test.use({ channel: 'chromium' });

test.beforeEach(async ({ page }) => {
  // The home page calls no outside service before a search; block any that
  // would, so the check needs no network.
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort(),
  );
});

test('the home page is installable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const cdp = await page.context().newCDPSession(page);

  // src/linkManifest.js links the manifest 10 s after the page has loaded.
  await expect
    .poll(async () => (await cdp.send('Page.getAppManifest')).url, { timeout: 20_000 })
    .toMatch(/\/manifest\.webmanifest$/);
  const { errors, data } = await cdp.send('Page.getAppManifest');
  expect(errors).toEqual([]);
  expect(JSON.parse(data)).toMatchObject({ start_url: '/', display: 'standalone' });

  // Polled: the browser fetches the manifest and its icons after load. Every
  // Playwright context is an incognito-like profile, which Chromium always
  // reports; that error is also the sign the check has run, so wait for it and
  // expect no other.
  await expect
    .poll(async () =>
      (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.map((e) => e.errorId),
    )
    .toEqual(['in-incognito']);
});

test('registers no service worker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const registrations = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
  );
  expect(registrations).toEqual([]);
});
