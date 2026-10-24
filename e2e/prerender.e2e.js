// Pre-rendered public pages (#99), on the production build served by
// `vite preview` (which answers paths the way Render does, see
// src/prerender/plugin.js). With JavaScript off each page already has its
// content and head; with it on the page hydrates in place with no error, and
// stays interactive. Precinct pages stay client-rendered from the empty shell.
import { expect, test } from '@playwright/test';
import { CODE, ELECTION_DAY_AT, fixtureBody, WAITS_RECORDED_AT } from './fixtures.js';

const SITE = 'https://mapthevotestl.com';

const PAGES = [
  { path: '/', heading: 'St. Louis Voter Guide', title: 'St. Louis Voter Guide' },
  { path: '/learn', heading: 'How to vote', title: 'How to vote | St. Louis Voter Guide' },
  {
    path: '/learn/voter-id',
    heading: 'What ID to bring',
    title: 'What ID to bring | St. Louis Voter Guide',
  },
  { path: '/privacy', heading: 'Privacy', title: 'Privacy | St. Louis Voter Guide' },
];

async function answerFromFixtures(page) {
  await page.route('**/*', async (route) => {
    const href = route.request().url();
    if (new URL(href).hostname === 'localhost') return route.continue();
    const body = fixtureBody(href);
    if (body === null) return route.abort();
    return route.fulfill({ contentType: 'application/json', body });
  });
}

// Holds the app's script back until `release()`.
async function holdScript(page) {
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

// Waits until React has taken over the root (hydrated or rendered).
async function waitForHydration(page) {
  await page.waitForFunction(() =>
    Object.keys(document.getElementById('root')).some((key) => key.startsWith('__reactContainer')),
  );
}

// Every console error or warning and every uncaught error (React reports a
// hydration mismatch as one) while the page loads and settles.
function collectProblems(page) {
  const problems = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  for (const { path, heading, title } of PAGES) {
    test(`${path} has its content, title, description and canonical`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}${path}`);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
        'content',
        `${SITE}${path}`,
      );
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S{3}/);
      await expect(page.getByRole('contentinfo')).toContainText('nonpartisan, unofficial guide');
    });
  }

  // The home page's dot map (#184) needs the app: with JavaScript off its box
  // takes no space, whatever the date.
  test('/ shows no dot map box', async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await page.goto('/');
    await expect(page.locator('[data-home-map-box]')).toBeHidden();
    await expect(page.getByRole('link', { name: 'See early voting wait times' })).toBeVisible();
  });

  test('a topic shows its text', async ({ page }) => {
    await page.goto('/learn/voter-id');
    await expect(page.getByText(/In Missouri, you must show a photo ID/)).toBeVisible();
  });

  test('a trailing slash serves the same page', async ({ page }) => {
    await page.goto('/learn/voter-id/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What ID to bring');
  });
});

test.describe('hydration', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} hydrates with no error or warning`, async ({ page }) => {
      const problems = collectProblems(page);
      await answerFromFixtures(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });
  }

  // The home page is pre-rendered with the early voting label; on Election Day
  // the client switches it after hydration (#107), with no mismatch, and opens
  // the dot map (#184).
  test('/ hydrates on Election Day with no error, then names the line counts', async ({ page }) => {
    const problems = collectProblems(page);
    await page.clock.setFixedTime(ELECTION_DAY_AT);
    await answerFromFixtures(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'See Election Day line counts' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('/ hydrates during early voting with no error, then opens the dot map (#184)', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await answerFromFixtures(page);
    await page.goto('/');
    await expect(page.getByText('Shortest lines now')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('St. Louis Voter Guide');
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('keeps the pre-rendered heading element instead of rendering a new one', async ({
    page,
  }) => {
    await answerFromFixtures(page);
    // Tag the server's heading while the script is held back; hydration keeps it.
    const release = await holdScript(page);
    await page.goto('/learn/voter-id', { waitUntil: 'commit' });
    await expect(page.locator('footer')).toBeAttached();
    await page.evaluate(() => document.querySelector('h1').setAttribute('data-from-server', ''));
    release();
    await expect(page.locator('h1')).toBeFocused();
    await expect(page.locator('h1[data-from-server]')).toHaveCount(1);
  });

  test("a topic's folded sections open after hydration", async ({ page }) => {
    const problems = collectProblems(page);
    await answerFromFixtures(page);
    await page.goto('/learn/voter-id');
    await expect(page.locator('h1')).toBeFocused();
    const section = page.locator('details').first();
    await expect(section).not.toHaveAttribute('open', '');
    await section.locator('summary').click();
    await expect(section).toHaveAttribute('open', '');
    expect(problems).toEqual([]);
  });

  test('a topic stays interactive: in-app links, focus and the head follow', async ({ page }) => {
    const problems = collectProblems(page);
    await answerFromFixtures(page);
    await page.goto('/learn/voter-id');
    await expect(page.locator('h1')).toBeFocused();
    await page.evaluate(() => {
      window.notReloaded = true;
    });
    await page.getByRole('link', { name: 'All voting guides' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to vote');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await page.evaluate(() => window.notReloaded)).toBe(true);
    await expect(page).toHaveTitle('How to vote | St. Louis Voter Guide');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/learn`);
    expect(problems).toEqual([]);
  });

  // A topic's body loads with its page (#147): from /learn it arrives on
  // demand, with the footer held below the fold until it does.
  test('a topic opened from /learn loads its text, with no jump and focus on its title', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    await answerFromFixtures(page);
    let release;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(/\/assets\/voter-id-[\w-]+\.js$/, async (route) => {
      await released;
      await route.continue();
    });
    await page.goto('/learn');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.getByRole('link', { name: 'What ID to bring' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    const viewport = page.viewportSize();
    const footerTop = await page.locator('footer').evaluate((el) => el.getBoundingClientRect().top);
    expect(footerTop).toBeGreaterThanOrEqual(viewport.height);
    release();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What ID to bring');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByText(/In Missouri, you must show a photo ID/)).toBeVisible();
    await expect(page).toHaveTitle('What ID to bring | St. Louis Voter Guide');
    expect(problems).toEqual([]);
  });

  // If the topic's own chunk cannot load, the pre-rendered text the voter
  // already has stays on screen, as a plain page (#147).
  test('a topic keeps its pre-rendered text when its chunk fails to load', async ({ page }) => {
    await answerFromFixtures(page);
    await page.route(/\/assets\/voter-id-[\w-]+\.js$/, (route) => route.abort());
    const failed = page.waitForEvent('requestfailed', (request) =>
      /\/assets\/voter-id-/.test(request.url()),
    );
    await page.goto('/learn/voter-id');
    await failed;
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What ID to bring');
    await expect(page.getByText(/In Missouri, you must show a photo ID/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  });

  test('the home page search works after hydration', async ({ page }) => {
    const problems = collectProblems(page);
    await answerFromFixtures(page);
    await page.goto('/');
    await waitForHydration(page);
    // Only the app answers an empty search this way; without it the form
    // would just submit.
    await page.getByRole('button', { name: 'Find my precinct' }).click();
    await expect(page.getByText('Type your address first.')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    const box = page.getByRole('combobox', { name: 'Enter your address' });
    await box.fill('1318 Ross');
    await expect(box).toHaveValue('1318 Ross');
    expect(problems).toEqual([]);
  });

  test('a pre-rendered file served at another path renders that path instead', async ({ page }) => {
    const problems = collectProblems(page);
    await answerFromFixtures(page);
    // dist/index.html is the home page, and is also served at /index.html.
    await page.goto('/index.html');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page.locator('h1')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
});

// A pre-rendered page can be read, scrolled and tabbed through before its
// script arrives. Hydrating it must not pull the voter back to the heading.
test.describe('reading before the script arrives', () => {
  test('keeps the scroll position the voter moved to', async ({ page }) => {
    await answerFromFixtures(page);
    const release = await holdScript(page);
    // Module scripts hold DOMContentLoaded back, so wait for the markup.
    await page.goto('/learn/voter-id', { waitUntil: 'commit' });
    await expect(page.locator('footer')).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, 400));
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(0);
    release();
    await waitForHydration(page);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
    await expect(page.locator('h1')).not.toBeFocused();
  });

  test('keeps focus where the voter tabbed to', async ({ page }) => {
    await answerFromFixtures(page);
    const release = await holdScript(page);
    // Module scripts hold DOMContentLoaded back, so wait for the markup.
    await page.goto('/learn/voter-id', { waitUntil: 'commit' });
    await expect(page.locator('footer')).toBeAttached();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const before = await page.evaluate(() => document.activeElement?.outerHTML);
    expect(before).not.toMatch(/^<body/);
    release();
    await waitForHydration(page);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(before);
  });
});

for (const path of ['//', '/learn/voter-id//']) {
  test(`${path} (two trailing slashes) is the not-found page, with no error`, async ({
    page,
    baseURL,
  }) => {
    const problems = collectProblems(page);
    await answerFromFixtures(page);
    // A full URL: a bare // would be read as a host.
    await page.goto(`${baseURL}${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page).toHaveTitle('Page not found | St. Louis Voter Guide');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
}

test.describe('precinct pages', () => {
  test('are served the empty shell, with no page baked in', async ({ request }) => {
    const body = await (await request.get(`/p/${CODE}`)).text();
    expect(body).toContain('<div id="root"></div>');
    expect(body).not.toContain('data-prerendered');
    expect(body).not.toContain('rel="canonical"');
  });

  test('render from the shell with the precinct results and no canonical', async ({ page }) => {
    const problems = collectProblems(page);
    await answerFromFixtures(page);
    await page.goto(`/p/${CODE}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where you can vote');
    await expect(page.getByText(`Precinct ${CODE} · `, { exact: false })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
