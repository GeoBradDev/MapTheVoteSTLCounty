// Accessibility checks in a real browser (#26), on the production build. For
// each key route at the project's width: axe-core (WCAG 2.1 A and AA plus best
// practice, contrast included), no horizontal scroll with or without the WCAG
// 1.4.12 text spacing override, one h1, the page language, a skip link as
// the first tab stop that moves focus to main, and every standalone control at
// least 44 px tall, and axe again in dark mode (#77). Then focus after in-app
// navigation, reduced motion while the results load, and dark mode's first
// paint, print and map basemap switch.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  AFTER_EARLY_VOTING_AT,
  AFTER_POLLS_AT,
  BASEMAP_DARK_STYLE_URL,
  BEFORE_POLLS_AT,
  BASEMAP_STYLE_URL,
  BLANK_STYLE,
  CITY_CODE,
  CODE,
  EARLY_VOTING_CLOSED_AT,
  ELECTION_DAY_AT,
  ELECTION_DAY_WAITS,
  fixtureBody,
  isBasemapStyle,
  NO_WAITS,
  TINT,
  tintedStyle,
  WAITS_RECORDED_AT,
} from './fixtures.js';
import election from '../src/config/election.js';
import { oklchToRgb } from '../src/features/lookup/mapBounds.js';
import { themeTokens } from '../src/test/colors.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

// Each theme's --color-surface (#76, #77) as sRGB, from src/index.css (the
// built CSS writes the same color in another form).
const THEMES = themeTokens(readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
const SURFACE = { light: oklchToRgb(THEMES.light.surface), dark: oklchToRgb(THEMES.dark.surface) };
const surfaceNow = async (page) =>
  oklchToRgb(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
    ),
  );

const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

// ArcGIS from the fixtures, the app's own origin as is, everything else
// (geocoders, map tiles) blocked.
async function answerFromFixtures(
  page,
  { delayMs = 0, waits, basemap = false, styles = [], tinted = false } = {},
) {
  await page.route('**/*', async (route) => {
    const href = route.request().url();
    if (new URL(href).hostname === 'localhost') return route.continue();
    // A blank style, light or dark (#77), so the map draws with no tiles (the
    // Election Day routes, #107). Each style asked for is noted in `styles`.
    if (basemap && isBasemapStyle(href)) {
      styles.push(href);
      const body = tinted ? tintedStyle(href) : BLANK_STYLE;
      return route.fulfill({ contentType: 'application/json', body });
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

// The home page's line count dot map (#184), ready once its status line (when
// the counts were checked, or when sites open again) shows.
const homeMapReady = (line) => async (page) => {
  await expect(page.getByRole('combobox')).toBeVisible();
  const box = page.locator('[data-home-map-box]');
  await expect(box.getByRole('link', { name: /^Map of / })).toBeVisible();
  await expect(box.getByText(line)).toBeVisible();
};

const ROUTES = [
  { path: '/', ready: (page) => expect(page.getByRole('combobox')).toBeVisible() },
  {
    name: '/ with the dot map, early voting sites open',
    path: '/',
    at: WAITS_RECORDED_AT,
    ready: homeMapReady(/^Line counts checked at /),
  },
  {
    name: '/ with the dot map, every site closed',
    path: '/',
    at: EARLY_VOTING_CLOSED_AT,
    waits: NO_WAITS,
    ready: homeMapReady(/^Sites open again /),
  },
  {
    name: '/ with the dot map, the evening before Election Day',
    path: '/',
    at: AFTER_EARLY_VOTING_AT,
    waits: NO_WAITS,
    ready: homeMapReady(/^Early voting has ended/),
  },
  {
    name: '/ with the dot map on Election Day before the polls open',
    path: '/',
    at: BEFORE_POLLS_AT,
    waits: NO_WAITS,
    ready: homeMapReady(/^Polls open today at /),
  },
  {
    name: '/ with the dot map on Election Day',
    path: '/',
    at: ELECTION_DAY_AT,
    waits: ELECTION_DAY_WAITS,
    ready: homeMapReady(/^Line counts checked at /),
  },
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

    // Dark mode (#77): the same page with the system set to dark, switched
    // after it loaded, as a phone does at night.
    test('has no axe violations in dark mode', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      expect(await surfaceNow(page)).toBe(SURFACE.dark);
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
// a control, so it draws no focus ring (#78). Links, buttons and fields keep
// theirs.
test('a heading focused after an in-app link draws no ring, a control still does', async ({
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
  // The next stop is the address box, first after the header (#209), then
  // the links further down: each draws its ring.
  const ring = async () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return { tag: document.activeElement.tagName, style: style.outlineStyle };
    });
  await page.keyboard.press('Tab');
  expect(await ring()).toEqual({ tag: 'INPUT', style: 'solid' });
  for (let i = 0; i < 10 && (await ring()).tag !== 'A'; i += 1) await page.keyboard.press('Tab');
  expect(await ring()).toEqual({ tag: 'A', style: 'solid' });
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
    await page.getByRole('link', { name: 'Detailed early voting wait times map' }).click();
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

// Dark mode (#77) follows the system setting from the first paint, on the
// pre-rendered pages and on those the app draws, and print stays light.
// The gray of a map canvas's top left corner, inside the fit padding where
// no marker sits: which tinted style (TINT) it drew, or the page through a
// blank canvas.
async function mapCorner(page, map) {
  const png = await map.locator('canvas').screenshot();
  return page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(6, 6, 1, 1).data[1];
    },
    [...png],
  );
}

test.describe('in dark mode', () => {
  for (const [path, at] of [
    ['/', null],
    [`/p/${CODE}`, WAITS_RECORDED_AT],
    [`/p/${CITY_CODE}`, null],
    ['/early-voting', WAITS_RECORDED_AT],
    ['/learn/voter-id', null],
  ]) {
    test(`${path} paints dark from its first frame`, async ({ page }) => {
      if (at) await page.clock.setFixedTime(at);
      await page.emulateMedia({ colorScheme: 'dark' });
      // Each frame's page color and surface token from the very first, before
      // any script of the app's own runs.
      await page.addInitScript(() => {
        window.frames77 = [];
        const record = () => {
          const root = document.documentElement;
          if (root) {
            const style = getComputedStyle(root);
            window.frames77.push([
              style.backgroundColor,
              style.getPropertyValue('--color-surface').trim(),
            ]);
          }
          if (window.frames77.length < 60) requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });
      await answerFromFixtures(page, { delayMs: 300 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForFunction(() => window.frames77.length >= 60);
      const frames = await page.evaluate(() => window.frames77);
      const final = frames.at(-1);
      expect(oklchToRgb(final[1])).toBe(SURFACE.dark);
      // The page itself paints the surface, not the browser's own canvas.
      expect(final[0]).not.toBe('rgba(0, 0, 0, 0)');
      // Every frame painted the same dark page color, or came before the
      // stylesheet applied, when the browser draws its own canvas in the
      // scheme the color-scheme meta allows: dark here.
      const beforeStyles = ([bg, token]) => bg === 'rgba(0, 0, 0, 0)' && token === '';
      const odd = frames.filter(
        (frame) => !beforeStyles(frame) && (frame[0] !== final[0] || frame[1] !== final[1]),
      );
      expect(odd).toEqual([]);
      // Once styled, never unstyled again.
      const firstStyled = frames.findIndex((frame) => !beforeStyles(frame));
      expect(frames.slice(firstStyled).filter(beforeStyles)).toEqual([]);
    });
  }

  test('prints light', async ({ page }) => {
    await answerFromFixtures(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`/p/${CODE}`);
    await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
    expect(await surfaceNow(page)).toBe(SURFACE.dark);
    await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
    expect(await surfaceNow(page)).toBe(SURFACE.light);
    const scheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(scheme).toBe('light');
  });

  test('the wait times map switches to the dark basemap and back with the setting', async ({
    page,
  }) => {
    const styles = [];
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await answerFromFixtures(page, { basemap: true, styles, tinted: true });
    await page.goto('/early-voting');
    const map = page.getByRole('region', { name: 'Map of early voting sites' });
    await map.scrollIntoViewIfNeeded();
    await expect(map.getByRole('list', { name: 'People in line' })).toBeVisible();
    await expect.poll(() => styles).toEqual([BASEMAP_STYLE_URL]);
    await expect.poll(() => mapCorner(page, map)).toBe(TINT.light);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => styles).toEqual([BASEMAP_STYLE_URL, BASEMAP_DARK_STYLE_URL]);
    await expect.poll(() => mapCorner(page, map)).toBe(TINT.dark);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect
      .poll(() => styles)
      .toEqual([BASEMAP_STYLE_URL, BASEMAP_DARK_STYLE_URL, BASEMAP_STYLE_URL]);
    await expect.poll(() => mapCorner(page, map)).toBe(TINT.light);
    // The map is still there, with its markers.
    await expect(map.locator('canvas')).toHaveCount(1);
    await expect(map.locator('.maplibregl-marker').first()).toBeAttached();
  });

  test('a map whose dark basemap cannot load keeps the one it drew', async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    const styles = [];
    await answerFromFixtures(page, { basemap: true, styles, tinted: true });
    // The phone went offline before the scheme changed: the dark style fails.
    // Routes added later are asked first.
    await page.route(BASEMAP_DARK_STYLE_URL, (route) => route.abort());
    await page.goto('/early-voting');
    const map = page.getByRole('region', { name: 'Map of early voting sites' });
    await map.scrollIntoViewIfNeeded();
    await expect(map.getByRole('list', { name: 'People in line' })).toBeVisible();
    await expect.poll(() => mapCorner(page, map)).toBe(TINT.light);
    const failed = page.waitForEvent('requestfailed', (r) => r.url() === BASEMAP_DARK_STYLE_URL);
    await page.emulateMedia({ colorScheme: 'dark' });
    await failed;
    // Make the map draw again (a resize redraws it), so a dropped style would
    // show: the drawn light basemap stays.
    const { width, height } = page.viewportSize();
    await page.setViewportSize({ width: width - 20, height });
    await page.waitForTimeout(500);
    expect(await mapCorner(page, map)).toBe(TINT.light);
    await expect(map.locator('canvas')).toHaveCount(1);
    await expect(map.getByRole('list', { name: 'People in line' })).toBeVisible();
    expect(styles).toEqual([BASEMAP_STYLE_URL]);
  });

  test('prints a page without its map, so the dark basemap never prints', async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await page.emulateMedia({ colorScheme: 'dark' });
    await answerFromFixtures(page, { basemap: true });
    await page.goto('/early-voting');
    const map = page.getByRole('region', { name: 'Map of early voting sites' });
    await map.scrollIntoViewIfNeeded();
    await expect(map.getByRole('list', { name: 'People in line' })).toBeVisible();
    await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
    await expect(map).toBeHidden();
    await expect(page.getByRole('list', { name: 'Early voting sites' })).toBeVisible();
    // A light page prints as before.
    await page.emulateMedia({ colorScheme: 'light', media: 'print' });
    await expect(map).toBeVisible();
  });

  test('prints a results page without its precinct map', async ({ page }) => {
    await page.clock.setFixedTime(ELECTION_DAY_AT);
    await page.emulateMedia({ colorScheme: 'dark' });
    await answerFromFixtures(page, { basemap: true, waits: ELECTION_DAY_WAITS });
    await page.goto(`/p/${CODE}`);
    const map = page.getByRole('region', { name: /^Map of precinct / });
    await map.scrollIntoViewIfNeeded();
    await expect(map.getByRole('list', { name: 'People in line' })).toBeVisible();
    await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
    await expect(map).toBeHidden();
    await expect(page.getByRole('list', { name: 'Nearest polling places' })).toBeVisible();
  });

  test('a map opened in dark mode asks for the dark basemap only', async ({ page }) => {
    const styles = [];
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await page.emulateMedia({ colorScheme: 'dark' });
    await answerFromFixtures(page, { basemap: true, styles });
    await page.goto('/early-voting');
    const map = page.getByRole('region', { name: 'Map of early voting sites' });
    await map.scrollIntoViewIfNeeded();
    await expect(map.getByRole('list', { name: 'People in line' })).toBeVisible();
    await expect.poll(() => styles).toEqual([BASEMAP_DARK_STYLE_URL]);
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
  // In every calendar state, the address search is on the first screen of a
  // phone or a desktop, above the line count dot map (#209), with the
  // statement and the heading.
  const VIEWPORTS = [
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ];
  const CALENDAR = [
    ['outside the dot map window', AFTER_POLLS_AT, undefined, null],
    ['early voting, sites open', WAITS_RECORDED_AT, undefined, /^Line counts checked at /],
    ['every site closed', EARLY_VOTING_CLOSED_AT, NO_WAITS, /^Sites open again /],
    ['the evening before Election Day', AFTER_EARLY_VOTING_AT, NO_WAITS, /^Early voting has ended/],
    ['Election Day before the polls open', BEFORE_POLLS_AT, NO_WAITS, /^Polls open today at /],
    ['Election Day', ELECTION_DAY_AT, ELECTION_DAY_WAITS, /^Line counts checked at /],
  ];
  for (const [name, at, waits, line] of CALENDAR) {
    test(`sits above the fold with the address box, on phones and desktop (${name})`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(at);
      await answerFromFixtures(page, { waits });
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto('/');
        const box = page.locator('[data-home-map-box]');
        if (line) await expect(box.getByText(line)).toBeVisible();
        else await expect(box).toHaveAttribute('data-closed', '');
        const size = `${viewport.width} x ${viewport.height}`;
        for (const target of [
          page.getByText(/independent, nonpartisan guide/),
          page.getByRole('heading', { level: 1 }),
          page.getByRole('combobox'),
          page.getByRole('button', { name: 'Find my precinct' }),
          page.getByRole('button', { name: 'Use my location' }),
        ]) {
          await expect(target, size).toBeInViewport({ ratio: 1 });
        }
        expect(await page.evaluate(() => window.scrollY), size).toBe(0);
        // The map, when shown, follows the address search.
        if (line) {
          const searchBottom = await page
            .getByRole('combobox')
            .evaluate((el) => el.getBoundingClientRect().bottom);
          const boxTop = await box.evaluate((el) => el.getBoundingClientRect().top);
          expect(boxTop, size).toBeGreaterThan(searchBottom);
        }
      }
    });
  }

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

// The home page's line count dot map (#184): its box is reserved before the
// app runs, so nothing below it moves when the map arrives, its text is never
// the largest paint, it asks for no address or location, and outside the map
// window the page is as it was.
test.describe('home page dot map', () => {
  const STATES = [
    ['early voting, sites open', WAITS_RECORDED_AT, undefined, /^Line counts checked at /],
    ['every site closed', EARLY_VOTING_CLOSED_AT, NO_WAITS, /^Sites open again /],
    ['the evening before Election Day', AFTER_EARLY_VOTING_AT, NO_WAITS, /^Early voting has ended/],
    ['Election Day before the polls open', BEFORE_POLLS_AT, NO_WAITS, /^Polls open today at /],
    ['Election Day', ELECTION_DAY_AT, ELECTION_DAY_WAITS, /^Line counts checked at /],
    // Sites open with no current count: with Election Day, the tallest state.
    [
      'early voting, no current count',
      WAITS_RECORDED_AT,
      { county: 'stale', city: 'stale' },
      'No site has a current line count right now.',
    ],
  ];

  for (const [name, at, waits, line] of STATES) {
    test(`the wait times button stays put when the map loads (${name})`, async ({ page }) => {
      await page.clock.setFixedTime(at);
      await answerFromFixtures(page, { delayMs: 600, waits });
      // Hold the app's script, so the first look is the pre-rendered page
      // with only the head script's mark and the CSS.
      let release;
      const released = new Promise((resolve) => {
        release = resolve;
      });
      await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
        await released;
        await route.continue();
      });
      await page.goto('/', { waitUntil: 'commit' });
      // The button under the box: the pre-rendered page names it for early
      // voting, and on Election Day the app renames it (#107), so it is found
      // by its link.
      const button = page.locator('main a[href="/early-voting"]').last();
      await expect(button).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-home-map', '');
      // The app is held: the box is still the pre-rendered empty one, yet the
      // stylesheet already reserves its height.
      const box = page.locator('[data-home-map-box]');
      await expect(box).toBeEmpty();
      await expect(box).not.toHaveAttribute('data-open');
      await expect
        .poll(() => box.evaluate((el) => el.getBoundingClientRect().height))
        .toBeGreaterThan(400);
      const before = await button.boundingBox();
      release();
      await expect(page.locator('[data-home-map-box]').getByText(line)).toBeVisible();
      const after = await button.boundingBox();
      expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    });

    test(`paints its largest text before the data answers (${name})`, async ({ page }) => {
      await page.clock.setFixedTime(at);
      await page.setViewportSize({ width: 360, height: 640 });
      await page.addInitScript(() => {
        window.lcpEntries = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.lcpEntries.push(entry.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      await answerFromFixtures(page, { delayMs: 1500, waits });
      await page.goto('/');
      await expect(page.locator('[data-home-map-box]').getByText(line)).toBeVisible();
      const entries = await page.evaluate(() => window.lcpEntries);
      expect(entries.length).toBeGreaterThan(0);
      for (const time of entries) expect(time).toBeLessThan(1500);
    });
  }

  test('asks for no location, and only the boards’ own layers', async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    const asked = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== 'localhost') {
        asked.push(`${request.url()} ${request.postData() ?? ''}`);
      }
    });
    await answerFromFixtures(page);
    await page.goto('/');
    await expect(page.getByText(/^Line counts checked at /)).toBeVisible();
    expect(asked.length).toBeGreaterThan(0);
    // Each board's own services, from the config: the County's election and
    // line count services and the City's.
    const roots = [
      election.serviceRoot,
      election.jurisdictions.city.serviceRoot,
      election.waitTimes.county.serviceRoot,
      election.waitTimes.county.electionDay.serviceRoot,
      election.waitTimes.city.serviceRoot,
    ].map((root) => `${root}/`);
    for (const line of asked) {
      expect(
        roots.some((root) => line.startsWith(root)),
        line,
      ).toBe(true);
      expect(line).not.toMatch(/(^|[?&\s])geometry=|esriGeometryPoint/i);
    }
  });

  test('after the polls close, shows the page as it was and asks for no line counts', async ({
    page,
  }) => {
    await page.clock.setFixedTime(AFTER_POLLS_AT);
    const asked = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== 'localhost') asked.push(request.url());
    });
    await answerFromFixtures(page);
    await page.goto('/');
    await expect(page.getByRole('combobox')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).not.toHaveAttribute('data-home-map');
    await expect(page.locator('[data-home-map-box]')).toBeHidden();
    await expect(page.locator('[data-home-map-box]')).toHaveAttribute('data-closed', '');
    expect(asked).toEqual([]);
  });

  // The head script runs even when the app's own script cannot: once the page
  // has loaded with no app, the mark goes, so no empty box stays.
  test('drops the reserved box when the app’s script fails to load', async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await answerFromFixtures(page);
    let fail;
    const failing = new Promise((resolve) => {
      fail = resolve;
    });
    await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
      await failing;
      await route.abort();
    });
    await page.goto('/', { waitUntil: 'commit' });
    // The head script ran and reserved the box first.
    await expect(page.locator('html')).toHaveAttribute('data-home-map', '');
    fail();
    await page.waitForLoadState('load');
    await expect(page.locator('html')).not.toHaveAttribute('data-home-map');
    await expect(page.locator('[data-home-map-box]')).toBeHidden();
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  // If the map's own chunk cannot load, the box closes and the page is as it
  // was, with its wait times link.
  test('closes the box when the map’s chunk fails to load', async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await answerFromFixtures(page);
    await page.route(/\/assets\/WaitTimesPage-[\w-]+\.js$/, (route) => route.abort());
    await page.goto('/');
    const box = page.locator('[data-home-map-box]');
    await expect(box).toHaveAttribute('data-closed', '');
    await expect(box).toBeHidden();
    await expect(
      page.getByRole('link', { name: 'Detailed early voting wait times map' }),
    ).toBeVisible();
  });

  // Stale counts keep the box, already on screen at its height, so nothing
  // moves: every site is a hollow ring and a line says so.
  test('keeps the box, with hollow rings, when the counts are stale', async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
    await answerFromFixtures(page, { waits: { county: 'stale', city: 'stale' } });
    await page.goto('/');
    const box = page.locator('[data-home-map-box]');
    await expect(box.getByText('No site has a current line count right now.')).toBeVisible();
    await expect(box).toHaveAttribute('data-open', '');
    await expect(box.locator('circle[data-dot="count"]')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Detailed early voting wait times map' }),
    ).toBeVisible();
  });
});
