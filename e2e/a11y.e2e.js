// Accessibility checks in a real browser (#26), on the production build. For
// each key route at the project's width: axe-core (WCAG 2.1 A and AA plus best
// practice, contrast included), no horizontal scroll with or without the WCAG
// 1.4.12 text spacing override, one h1, the page language, and a skip link as
// the first tab stop that moves focus to main. Then focus after in-app
// navigation and reduced motion while the results load.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CITY_CODE, CODE, fixtureBody, WAITS_RECORDED_AT } from './fixtures.js';

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
    const href = route.request().url();
    if (new URL(href).hostname === 'localhost') return route.continue();
    const body = fixtureBody(href);
    if (body === null) return route.abort();
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return route.fulfill({ contentType: 'application/json', body });
  });
}

const ROUTES = [
  { path: '/', ready: (page) => expect(page.getByRole('combobox')).toBeVisible() },
  {
    // At the time the wait fixtures were recorded, so the early voting card
    // shows its line counts, sort and link (#105).
    path: `/p/${CODE}`,
    at: WAITS_RECORDED_AT,
    ready: async (page) => {
      await expect(page.getByText(`Results for precinct ${CODE} are ready.`)).toBeAttached();
      await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
      const early = page.getByRole('list', { name: 'Nearest early voting sites' });
      await expect(early.getByText(/in line, reported/).first()).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Sort sites' })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'See wait times at every early voting site' }),
      ).toBeVisible();
    },
  },
  {
    // A City precinct (#89): the City's polling places, its Election Day rule,
    // its early voting card (#91) with a site's hours open, its districts
    // card (#90), and the card still to come. At the time the wait fixtures were recorded, so the
    // early voting card runs its line count UI.
    path: `/p/${CITY_CODE}`,
    at: WAITS_RECORDED_AT,
    ready: async (page) => {
      await expect(page.getByText(`Results for precinct ${CITY_CODE} are ready.`)).toBeAttached();
      await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
      await expect(
        page.getByText('The St. Louis City Board of Election Commissioners says:'),
      ).toBeVisible();
      const early = page.getByRole('list', { name: 'Nearest early voting sites' });
      await expect(early.getByRole('heading', { level: 3 }).first()).toBeVisible();
      await early.getByText('Dates and hours').first().click();
      await expect(early.getByText(/^Monday: /).first()).toBeVisible();
      // Its districts card (#90).
      await expect(page.getByText('Missouri House District 78')).toBeVisible();
    },
  },
  {
    path: '/p/ZZ999',
    ready: (page) => expect(page.getByRole('combobox')).toBeVisible(),
  },
  {
    // The wait times page (#104), at the time the wait fixtures were recorded,
    // so the County's line counts show, with the City's sites (#91).
    path: '/early-voting',
    at: WAITS_RECORDED_AT,
    ready: async (page) => {
      const list = page.getByRole('list', { name: 'Early voting sites' });
      await expect(list).toBeVisible();
      await expect(page.getByText(/people in line, reported/).first()).toBeVisible();
      await expect(list.getByRole('heading', { name: 'Buder Library' })).toBeVisible();
    },
  },
  {
    path: '/learn',
    ready: (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible(),
  },
  {
    // Pre-rendered (#99), like /, /learn and /privacy: checked after hydration.
    path: '/learn/voter-id',
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

for (const { path, ready, at } of ROUTES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      if (at) await page.clock.setFixedTime(at);
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
  // The page focuses its heading on arrival; wait for that before moving on.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
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

test.describe('the early voting wait times page', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await answerFromFixtures(page);
  });

  test('opens from the home page and focuses its heading', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'See early voting wait times' }).click();
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Early voting wait times');
    await expect(heading).toBeFocused();
  });

  test('changes the sort with the arrow keys', async ({ page }) => {
    await page.goto('/early-voting');
    const list = page.getByRole('list', { name: 'Early voting sites' });
    await expect(list.getByText(/people in line, reported/).first()).toBeVisible();
    await page.getByRole('radio', { name: 'Open now, shortest line first' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Name, A to Z' })).toBeChecked();
    const names = await list.locator('li h3').allTextContents();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
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

// The site says it is nonpartisan and unofficial (#71).
test.describe('the nonpartisan, unofficial statement', () => {
  test('sits above the fold on a 360 x 640 phone, with the address box', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await answerFromFixtures(page);
    await page.goto('/');
    await expect(page.getByText(/independent, nonpartisan guide/)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('combobox')).toBeInViewport({ ratio: 1 });
    // The wait times link too (#104), with no scrolling.
    await expect(page.getByRole('link', { name: 'See early voting wait times' })).toBeInViewport({
      ratio: 1,
    });
  });

  test('prints on a results page, without the Privacy link', async ({ page }) => {
    await answerFromFixtures(page);
    await page.goto(`/p/${CODE}`);
    await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByText(/nonpartisan, unofficial guide/)).toBeVisible();
    await expect(
      footer.getByRole('link', { name: 'St. Louis County Board of Elections website' }),
    ).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeHidden();
  });
});
