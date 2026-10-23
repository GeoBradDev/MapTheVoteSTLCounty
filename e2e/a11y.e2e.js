// Accessibility checks in a real browser (#26), on the production build. For
// each key route at the project's width: axe-core (WCAG 2.1 A and AA plus best
// practice, contrast included), no horizontal scroll with or without the WCAG
// 1.4.12 text spacing override, one h1, the page language, a skip link as
// the first tab stop that moves focus to main, and every standalone control at
// least 44 px tall. Then focus after in-app
// navigation and reduced motion while the results load.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  AFTER_EARLY_VOTING_AT,
  BASEMAP_STYLE_URL,
  BLANK_STYLE,
  CITY_CODE,
  CODE,
  ELECTION_DAY_AT,
  ELECTION_DAY_WAITS,
  fixtureBody,
  WAITS_RECORDED_AT,
} from './fixtures.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

// ArcGIS from the fixtures, the app's own origin as is, everything else
// (geocoders, map tiles) blocked.
async function answerFromFixtures(page, { delayMs = 0, waits, basemap = false } = {}) {
  await page.route('**/*', async (route) => {
    const href = route.request().url();
    if (new URL(href).hostname === 'localhost') return route.continue();
    // A blank style, so the map draws with no tiles (the Election Day routes, #107).
    if (basemap && href === BASEMAP_STYLE_URL) {
      return route.fulfill({ contentType: 'application/json', body: BLANK_STYLE });
    }
    const body = fixtureBody(href, null, { waits });
    if (body === null) return route.abort();
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return route.fulfill({ contentType: 'application/json', body });
  });
}

// Opens a folded section (#81) by its summary line, unless it is open
// already (wide screens open the districts), so the axe run covers it.
async function openDisclosure(page, summary) {
  const line = page.locator('summary', { hasText: summary });
  if ((await line.locator('..').getAttribute('open')) === null) await line.click();
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
      const polls = page.getByRole('list', { name: 'Nearest polling places' });
      await expect(polls).toBeVisible();
      const early = page.getByRole('list', { name: 'Nearest early voting sites' });
      await expect(early.getByText(/in line, reported/).first()).toBeVisible();
      // The County's room lines (#100), so the axe run covers them.
      await expect(polls.getByText(/^Room: /).first()).toBeVisible();
      await expect(early.getByText(/^Room: /).first()).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Sort sites' })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'See wait times at every early voting site' }),
      ).toBeVisible();
      // The folded sections (#81): the County dates and hours, the Election
      // Day rule's help and sources, and the districts.
      await openDisclosure(page, 'See dates and hours');
      await expect(page.getByRole('heading', { level: 3, name: 'Dates and hours' })).toBeVisible();
      await openDisclosure(page, 'Help and sources');
      await expect(page.locator('a[href^="tel:"]')).toBeVisible();
      await openDisclosure(page, 'Districts for this precinct');
      await expect(page.locator('dl dd').first()).toBeVisible();
    },
  },
  {
    // A City precinct (#89): the City's polling places, its Election Day rule,
    // its early voting card (#91) with a site's hours open, its districts
    // card (#90) and its sample ballot card (#92). At the time the wait fixtures were recorded, so the
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
      // Its districts card (#90), folded away on phones (#81).
      await openDisclosure(page, 'Districts for this precinct');
      await expect(page.getByText('Missouri House District 78')).toBeVisible();
      // Its sample ballot card (#92).
      await expect(
        page.getByRole('link', { name: /^Open the City's sample ballot \(PDF\)/ }),
      ).toBeVisible();
    },
  },
  {
    path: '/p/ZZ999',
    ready: (page) => expect(page.getByRole('combobox')).toBeVisible(),
  },
  {
    // The wait times page (#104), at the time the wait fixtures were recorded,
    // so the County's line counts show, with the City's sites (#91), and the
    // map open on arrival with its Jenks classes legend once it draws (#172).
    path: '/early-voting',
    at: WAITS_RECORDED_AT,
    basemap: true,
    ready: async (page) => {
      const list = page.getByRole('list', { name: 'Early voting sites' });
      await expect(list).toBeVisible();
      await expect(page.getByText(/people in line, reported/).first()).toBeVisible();
      await expect(list.getByRole('heading', { name: 'Buder Library' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Hide map' })).toBeVisible();
      const map = page.getByRole('region', { name: 'Map of early voting sites' });
      await map.scrollIntoViewIfNeeded();
      const legend = map.getByRole('list', { name: 'People in line' });
      await expect(legend).toBeVisible();
      await expect(legend.getByRole('listitem').first()).toHaveText(
        /^\d+( to \d+)? (person|people)$/,
      );
    },
  },
  {
    // Election Day (#107): the polling places card's line counts, sort and
    // link, and the map's legend once it draws, from the Election Day fixtures.
    name: `/p/${CODE} on Election Day`,
    path: `/p/${CODE}`,
    at: ELECTION_DAY_AT,
    waits: ELECTION_DAY_WAITS,
    basemap: true,
    ready: async (page) => {
      await expect(page.getByText(`Results for precinct ${CODE} are ready.`)).toBeAttached();
      const polls = page.getByRole('list', { name: 'Nearest polling places' });
      await expect(polls).toBeVisible();
      await page.getByRole('radio', { name: 'Shortest line within 5 miles' }).check();
      await expect(polls.getByText(/in line, reported/).first()).toBeVisible();
      await expect(
        page.getByRole('link', {
          name: 'See line counts at every St. Louis County and City polling place',
        }),
      ).toBeVisible();
    },
  },
  {
    // A City precinct on Election Day (#107): its polling places with the
    // City's line counts, and the map's legend once it draws.
    name: `/p/${CITY_CODE} on Election Day`,
    path: `/p/${CITY_CODE}`,
    at: ELECTION_DAY_AT,
    waits: ELECTION_DAY_WAITS,
    basemap: true,
    ready: async (page) => {
      await expect(page.getByText(`Results for precinct ${CITY_CODE} are ready.`)).toBeAttached();
      const polls = page.getByRole('list', { name: 'Nearest polling places' });
      await expect(polls).toBeVisible();
      await page.getByRole('radio', { name: 'Shortest line within 5 miles' }).check();
      await expect(polls.getByText(/in line, reported/).first()).toBeVisible();
      const map = page.getByRole('region', { name: /^Map of precinct / });
      await map.scrollIntoViewIfNeeded();
      await expect(map.getByRole('list', { name: 'People in line' })).toBeVisible();
    },
  },
  {
    // The wait times page with its map hidden (#172).
    name: '/early-voting with the map hidden',
    path: '/early-voting',
    at: WAITS_RECORDED_AT,
    basemap: true,
    ready: async (page) => {
      await page.getByRole('button', { name: 'Hide map' }).click();
      await expect(page.getByRole('button', { name: 'Show map' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Map of early voting sites' })).toHaveCount(0);
    },
  },
  {
    // Election Day (#107): every polling place of both boards with its count.
    name: '/early-voting on Election Day',
    path: '/early-voting',
    at: ELECTION_DAY_AT,
    waits: ELECTION_DAY_WAITS,
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Election Day line counts');
      const list = page.getByRole('list', { name: 'Polling places' });
      await expect(list).toBeVisible();
      await expect(list.getByText(/in line, reported/).first()).toBeVisible();
      await expect(
        list.getByRole('heading', { name: '12th & Park Recreation Center' }),
      ).toBeVisible();
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
    // A topic with St. Louis City sections (#94) and many source links.
    path: '/learn/who-to-contact',
    ready: (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible(),
  },
  {
    // A topic with St. Louis City sections (#94) folded into details, each
    // opened so the checks cover what is inside.
    path: '/learn/absentee',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const folded = page.locator('details:not([open]) > summary');
      await expect(folded).not.toHaveCount(0);
      // Opening one drops it from the locator, so always take the first.
      while ((await folded.count()) > 0) await folded.first().click();
    },
  },
  {
    path: '/privacy',
    ready: (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible(),
  },
  { path: '/nope', ready: (page) => expect(page.getByRole('combobox')).toBeVisible() },
  // An unknown topic renders the not-found page.
  { path: '/learn/nope', ready: (page) => expect(page.getByRole('combobox')).toBeVisible() },
];

// Controls under 44 px tall (#26), by their text. Exempt, as WCAG's target
// size criteria exempt them: a link inside a sentence or a comma list (its
// nearest block holds other text), and the skip link while it is hidden.
async function smallTargets(page) {
  return page.evaluate(() => {
    const MIN = 44;
    const BLOCK = 'p, li, dd, dt, td, h1, h2, h3, h4, figcaption, div';
    const shown = (el) => {
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1 && getComputedStyle(el).visibility !== 'hidden';
    };
    const inline = (el) => {
      if (el.tagName !== 'A') return false;
      const block = el.parentElement.closest(BLOCK);
      return Boolean(block) && block.textContent.trim() !== el.textContent.trim();
    };
    const controls = document.querySelectorAll(
      'a[href], button, summary, select, textarea, input:not([type="hidden"])',
    );
    return [...controls]
      .filter((el) => shown(el) && !el.closest('.maplibregl-map') && !inline(el))
      .map((el) => {
        // A radio or checkbox is tapped through its label.
        const target = el.matches('input[type="radio"], input[type="checkbox"]')
          ? (el.closest('label') ?? el)
          : el;
        const { height } = target.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') || target.textContent).trim().slice(0, 60);
        return { name: `${el.tagName.toLowerCase()} "${name}"`, height: Math.round(height) };
      })
      .filter(({ height }) => height < MIN)
      .map(({ name, height }) => `${name}: ${height} px`);
  });
}

// Links shown as a box of their own (not `display: inline`, so not set in a
// line of text) under 44 px tall, whatever else their block holds: a button
// styled link next to another control, or a card's main link.
async function smallBoxLinks(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .filter((el) => getComputedStyle(el).display !== 'inline')
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 1 && box.height > 1 && box.height < 44)
      .map(
        ({ el, box }) => `a "${el.textContent.trim().slice(0, 60)}": ${Math.round(box.height)} px`,
      ),
  );
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

for (const { name, path, ready, at, waits, basemap } of ROUTES) {
  test.describe(name ?? path, () => {
    test.beforeEach(async ({ page }) => {
      if (at) await page.clock.setFixedTime(at);
      await answerFromFixtures(page, { waits, basemap });
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

    // The site header (#79): the page's banner, one row at most 56 px tall,
    // also with wider text spacing.
    test('shows the site header in one row', async ({ page }) => {
      const banner = page.getByRole('banner');
      await expect(banner).toBeVisible();
      await expect(banner.getByRole('link', { name: 'St. Louis Voter Guide' })).toBeVisible();
      await expect(banner.getByRole('link', { name: 'How to vote' })).toBeVisible();
      // The site name and the nav side by side, not stacked.
      const oneRow = async () => {
        const name = await banner
          .getByRole('link', { name: 'St. Louis Voter Guide' })
          .boundingBox();
        const nav = await banner.getByRole('navigation').boundingBox();
        expect(nav.x).toBeGreaterThanOrEqual(name.x + name.width);
        expect((await banner.boundingBox()).height).toBeLessThanOrEqual(56);
      };
      await oneRow();
      await page.addStyleTag({ content: TEXT_SPACING });
      await oneRow();
    });

    test('has no control under 44 px tall', async ({ page }) => {
      expect(await smallTargets(page)).toEqual([]);
    });

    test('has no link box under 44 px tall', async ({ page }) => {
      expect(await smallBoxLinks(page)).toEqual([]);
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
  await expect(heading).toHaveText('St. Louis Voter Guide');
  await expect(heading).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

// The heading takes focus only so a screen reader announces the page; it is not
// a control, so it draws no focus ring (#78). Links and buttons keep theirs.
test('a heading focused after an in-app link draws no ring, a link still does', async ({
  page,
}) => {
  await answerFromFixtures(page);
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.getByRole('link', { name: 'Back to home' }).focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText('St. Louis Voter Guide');
  await expect(heading).toBeFocused();
  // Focus came from the keyboard, so :focus-visible matches: the rule, not the
  // browser's heuristics, keeps the ring off.
  expect(await heading.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  expect(await heading.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { tag: document.activeElement.tagName, style: style.outlineStyle };
  });
  expect(ring).toEqual({ tag: 'A', style: 'solid' });
});

// The same for a row heading "Show more" focuses (an h3), while the button
// itself, and the card's script-focused container elsewhere, keep the ring.
test('the row heading Show more focuses draws no ring, the button does', async ({ page }) => {
  await page.clock.setFixedTime(WAITS_RECORDED_AT);
  await answerFromFixtures(page);
  await page.goto(`/p/${CODE}`);
  const more = page.getByRole('button', { name: 'Show more polling places' });
  await expect(more).toBeVisible();
  // A key press first, so the browser treats the next focus as keyboard focus.
  await page.keyboard.press('Shift');
  await more.focus();
  expect(await more.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  const focused = page.locator('h3:focus');
  await expect(focused).toHaveCount(1);
  expect(await focused.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
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
  // The home page's own row, not the site header's link with the same name (#79).
  await page.getByRole('main').getByRole('link', { name: 'How to vote' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to vote');
  // A link to a new page starts it at the top.
  expect(await page.evaluate(() => window.scrollsToTop)).toBe(1);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('St. Louis Voter Guide');
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

// Election Day with today's County view, which keeps only early voting
// reports (#107): every polling place shows the no-data state.
test('Election Day with no Election Day reports shows only the no-data state', async ({ page }) => {
  await page.clock.setFixedTime(ELECTION_DAY_AT);
  await answerFromFixtures(page, { waits: { county: 'absenteeOnElectionDay', city: 'empty' } });
  await page.goto(`/p/${CODE}`);
  const polls = page.getByRole('list', { name: 'Nearest polling places' });
  await expect(polls).toBeVisible();
  await expect(page.getByText('No current line count for these polling places.')).toBeVisible();
  await expect(polls.getByText(/in line, reported/)).toHaveCount(0);
});

// While a precinct loads, the summary's Election Day line already shows (its
// largest text, #156). The header holds the share row's place, so the line
// does not move when the results replace the skeleton (#27).
// At each project's width, and at 412 px (a common Android width, above the
// 400 px where the header stops holding two lines for a County precinct's line).
for (const [code, width] of [
  [CODE, null],
  [CITY_CODE, null],
  [CODE, 412],
  [CITY_CODE, 412],
]) {
  test(`the Election Day line stays put when /p/${code} loads${width ? ` at ${width} px` : ''}`, async ({
    page,
  }) => {
    if (width) await page.setViewportSize({ width, height: 800 });
    await answerFromFixtures(page, { delayMs: 1500 });
    await page.goto(`/p/${code}`);
    const line = page
      .getByRole('heading', { level: 2, name: 'Election Day' })
      .locator('xpath=following-sibling::p[1]');
    await expect(page.getByTestId('results-skeleton')).toBeVisible();
    await expect(line).toBeVisible();
    const before = await line.boundingBox();
    await expect(page.getByTestId('results-skeleton')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
    const after = await line.boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    expect(after.height).toBe(before.height);
  });
}

// The results page's largest text needs no data (#156): at the Lighthouse
// run's 360 x 640, every LCP entry is painted before the layers answer,
// whatever font the system has. During early voting it is the Election Day
// line (with some fonts the share note); outside early voting, the sample
// ballot part's fixed intro (#27). A taller or wider screen shows more of the
// loaded summary, whose data driven text can be larger still.
const CLOCKS = [
  ['early voting', WAITS_RECORDED_AT, undefined],
  ['after early voting', AFTER_EARLY_VOTING_AT, undefined],
  ['Election Day', ELECTION_DAY_AT, ELECTION_DAY_WAITS],
];

for (const code of [CODE, CITY_CODE]) {
  for (const [name, at, waits] of CLOCKS) {
    test(`/p/${code} paints its largest text before the data answers (${name})`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(at);
      await page.setViewportSize({ width: 360, height: 640 });
      await page.addInitScript(() => {
        window.lcpEntries = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.lcpEntries.push(entry.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      await answerFromFixtures(page, { delayMs: 1500, waits });
      await page.goto(`/p/${code}`);
      await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
      const entries = await page.evaluate(() => window.lcpEntries);
      expect(entries.length).toBeGreaterThan(0);
      for (const time of entries) expect(time).toBeLessThan(1500);
    });
  }
}

// Outside early voting the skeleton shows the sample ballot part's intro
// (#27): it does not move when the results replace the skeleton, County and
// City, at each project's width.
for (const code of [CODE, CITY_CODE]) {
  for (const [name, at, waits] of CLOCKS.slice(1)) {
    test(`the sample ballot intro stays put when /p/${code} loads (${name})`, async ({ page }) => {
      await page.clock.setFixedTime(at);
      await answerFromFixtures(page, { delayMs: 1500, waits });
      await page.goto(`/p/${code}`);
      const intro = page
        .getByRole('heading', { level: 2, name: 'Sample ballot' })
        .locator('xpath=following-sibling::p[1]');
      await expect(page.getByTestId('results-skeleton')).toBeVisible();
      await expect(intro).toBeVisible();
      const before = await intro.boundingBox();
      await expect(page.getByTestId('results-skeleton')).toHaveCount(0);
      await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
      const after = await intro.boundingBox();
      expect(Math.abs(after.y - before.y)).toBeLessThan(1);
      expect(after.height).toBe(before.height);
    });
  }
}

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
    // And the heading and both ways in (#80).
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Find my precinct' })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeInViewport({
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
