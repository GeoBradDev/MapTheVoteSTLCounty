// Accessibility checks in a real browser (#26), on the production build. For
// each key route at the project's width: axe-core (WCAG 2.1 A and AA plus best
// practice, contrast included), no horizontal scroll with or without the WCAG
// 1.4.12 text spacing override, one h1, the page language, and a skip link as
// the first tab stop that moves focus to main. Then focus after in-app
// navigation and reduced motion while the results load.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import election from '../src/config/election.js';

const fixture = (name) =>
  readFileSync(new URL(`../docs/raw/fixtures/${name}.json`, import.meta.url), 'utf8');

const FIXTURES = {
  polls: fixture('polls'),
  absentee: fixture('absentee-sites'),
  geometry: fixture('precinct-geometry'),
  byId: fixture('precinct-by-id'),
  none: fixture('precinct-at-city'),
};

// The one precinct the fixtures hold.
const CODE = 'CC007';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

// ArcGIS from the fixtures, the app's own origin as is, everything else
// (geocoders, map tiles) blocked.
async function answerFromFixtures(page, { delayMs = 0 } = {}) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    if (!url.href.startsWith(election.serviceRoot)) return route.abort();
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    let body;
    if (url.pathname.includes(election.layers.polls)) {
      body =
        url.searchParams.get('where') === election.absenteeWhere
          ? FIXTURES.absentee
          : FIXTURES.polls;
    } else if (url.searchParams.get('where') === `precinct='${CODE}'`) {
      body = url.searchParams.get('f') === 'geojson' ? FIXTURES.geometry : FIXTURES.byId;
    } else {
      body = FIXTURES.none;
    }
    return route.fulfill({ contentType: 'application/json', body });
  });
}

const ROUTES = [
  { path: '/', ready: (page) => expect(page.getByRole('combobox')).toBeVisible() },
  {
    path: `/p/${CODE}`,
    ready: async (page) => {
      await expect(page.getByText(`Results for precinct ${CODE} are ready.`)).toBeAttached();
      await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
    },
  },
  {
    path: '/p/ZZ999',
    ready: (page) => expect(page.getByRole('combobox')).toBeVisible(),
  },
  {
    path: '/learn',
    ready: (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible(),
  },
  {
    path: '/privacy',
    ready: (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible(),
  },
  { path: '/nope', ready: (page) => expect(page.getByRole('combobox')).toBeVisible() },
];

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

for (const { path, ready } of ROUTES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await answerFromFixtures(page);
      await page.goto(path);
      await ready(page);
    });

    test('has no axe violations', async ({ page }) => {
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const found = results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      );
      expect(found).toEqual([]);
    });

    test('scrolls only vertically, also with wider text spacing', async ({ page }) => {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.addStyleTag({ content: TEXT_SPACING });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    test('has one h1 and the page language', async ({ page }) => {
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });

    test('starts with a skip link that moves focus to main', async ({ page }) => {
      // Start from the top of the document, as on a page that leaves focus
      // alone, even where the page focused its own heading on arrival.
      await page.evaluate(() => {
        document.body.tabIndex = -1;
        document.body.focus();
        document.body.removeAttribute('tabindex');
      });
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
    });
  });
}

test('going home from a page focuses the home heading at the top', async ({ page }) => {
  await answerFromFixtures(page);
  await page.goto('/privacy');
  const back = page.getByRole('link', { name: 'Back to home' });
  await back.focus();
  // The link sits low on the page, so the page starts scrolled.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText('St. Louis County Voter Guide');
  await expect(heading).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('Back and Forward leave the scroll position to the browser', async ({ page }) => {
  // Count the app's own scrolls to the top.
  await page.addInitScript(() => {
    const scrollTo = window.scrollTo.bind(window);
    window.scrollsToTop = 0;
    window.scrollTo = (...args) => {
      if (args[0] === 0 && args[1] === 0) window.scrollsToTop += 1;
      return scrollTo(...args);
    };
  });
  await answerFromFixtures(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'How to vote' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to vote');
  // A link to a new page starts it at the top.
  expect(await page.evaluate(() => window.scrollsToTop)).toBe(1);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('St. Louis County Voter Guide');
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to vote');
  expect(await page.evaluate(() => window.scrollsToTop)).toBe(1);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('runs no animation while results load', async ({ page }) => {
    await answerFromFixtures(page, { delayMs: 2000 });
    await page.goto(`/p/${CODE}`);
    await expect(page.getByTestId('results-skeleton')).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});
