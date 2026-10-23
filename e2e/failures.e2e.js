// Failure states in a real browser (#18), on the production build. Each test
// answers or breaks every service the app calls, from recorded fixtures: the
// county's address layers (live and hosted), Photon, the City of St. Louis
// geocoder, the county's precinct and polls layers, the City Board's election
// layers (#89), and the County and City early voting line count layers (#106). Nothing reaches the
// network. A failure is a network error (what a CORS refusal or a dropped
// connection looks like to the page), a timeout or an HTTP 5xx.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import election from '../src/config/election.js';
import { CITY_GEOCODER_URL } from '../src/data/cityAddress.js';
import { HOSTED_URL, LIVE_URL } from '../src/data/countyAddress.js';
import { DEFAULT_BASE_URL as PHOTON_URL } from '../src/data/photon.js';
import { copy as errorCopy } from '../src/features/lookup/errorCopy.js';
import { copy as lookupCopy } from '../src/features/lookup/lookupCopy.js';
import { copy as resultsCopy } from '../src/features/lookup/resultsCopy.js';
import { copy as waitCopy } from '../src/features/waitTimes/waitTimesCopy.js';
import referrals from '../src/config/referrals.js';
import {
  CITY_CODE,
  CODE,
  WAITS_RECORDED_AT,
  fixtureBody,
  isCityElectionLayer,
} from './fixtures.js';

const ADDRESS = '1318 Ross Ave';

// One county address point for ADDRESS, as both county layers return it.
const COUNTY_ROSS = JSON.stringify({
  features: [
    {
      attributes: {
        OBJECTID: 1,
        ADRNO: 1318,
        ADRDIR: '',
        ADRSTR: 'ROSS',
        ADRSUF: 'AVE',
        UNITDESC: '',
        UNITNO: '',
        MAILINGCITY: 'SAINT LOUIS',
        ZIPCODE: '63146',
        FULL_ADDRESS: '1318 ROSS AVE',
        STATUS: 'Current',
        MUNI: 'UNI',
      },
      geometry: { x: -90.4581, y: 38.6822 },
    },
  ],
});
// The City has no such address.
const CITY_NONE = JSON.stringify({ spatialReference: { wkid: 4326 }, candidates: [] });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

const json = (body) => ({ contentType: 'application/json', body });

const waitLayer = (source) => `${source.serviceRoot}/${source.layer}/`;

/**
 * Routes every request. Each service is 'ok' (fixtures), a number (that HTTP
 * status), 'network' (a refused or CORS-blocked request), or a
 * function of the route. The precinct point query answers CC007 when ok.
 * `waits` picks fresh, stale or empty line counts per board (e2e/fixtures.js).
 */
async function services(
  page,
  {
    live = 'ok',
    hosted = 'ok',
    photon = 'network',
    city = 'ok',
    precincts = 'ok',
    polls = 'ok',
    countyWaits = 'ok',
    cityWaits = 'ok',
    cityLayers = 'ok',
  },
  { delayMs = 0, waits = {} } = {},
) {
  const behave = async (route, how, body) => {
    if (typeof how === 'function') return how(route, body);
    if (how === 'network') return route.abort('failed');
    if (typeof how === 'number') return route.fulfill({ status: how, body: '' });
    return route.fulfill(json(body));
  };
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    if (url.href.startsWith(LIVE_URL)) return behave(route, live, COUNTY_ROSS);
    if (url.href.startsWith(HOSTED_URL)) return behave(route, hosted, COUNTY_ROSS);
    if (url.href.startsWith(CITY_GEOCODER_URL)) return behave(route, city, CITY_NONE);
    if (url.href.startsWith(PHOTON_URL)) return behave(route, photon, '{"features":[]}');
    // The City Board's precincts and voting locations (#89), before its wait
    // time query, which asks the same voting locations layer.
    const params = new URLSearchParams([
      ...url.searchParams,
      ...new URLSearchParams(route.request().postData() ?? ''),
    ]);
    if (isCityElectionLayer(url.href, params)) {
      const body = fixtureBody(url.href, route.request().postData());
      return behave(route, cityLayers, body);
    }
    if (url.href.startsWith(waitLayer(election.waitTimes.county))) {
      return behave(route, countyWaits, fixtureBody(url.href, null, { waits }));
    }
    if (url.href.startsWith(waitLayer(election.waitTimes.city))) {
      return behave(route, cityWaits, fixtureBody(url.href, null, { waits }));
    }
    if (!url.href.startsWith(election.serviceRoot)) return route.abort();
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (url.pathname.includes(election.layers.polls)) {
      return behave(route, polls, fixtureBody(url.href));
    }
    let href = url.href;
    // The point queries POST their parameters (#38); the others are GETs.
    const form = new URLSearchParams(route.request().postData() ?? '');
    if (
      form.get('geometryType') === 'esriGeometryPoint' &&
      url.pathname.includes(election.layers.precincts)
    ) {
      // A point in the precinct: the precinct's own record answers, shaped to
      // the fields the point query asked for.
      const byId = new URL(url);
      byId.searchParams.set('where', `precinct='${CODE}'`);
      href = byId.href;
    }
    return behave(route, precincts, fixtureBody(href, form.toString()));
  });
}

async function search(page, text = ADDRESS) {
  await page.goto('/');
  await page.getByRole('combobox').fill(text);
  await page.getByRole('button', { name: 'Find my precinct' }).click();
}

async function expectNoAxeViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
}

// The lookup's error, with every way forward, and never "no match".
async function expectLookupError(page, message) {
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText(lookupCopy.errors.noMatch)).toHaveCount(0);
  await expect(page.getByRole('link', { name: lookupCopy.officialLookup })).toHaveAttribute(
    'href',
    election.officialLookupUrl,
  );
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
  await expect(page.getByRole('button', { name: errorCopy.retry })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
}

test.describe('address search', () => {
  test('every geocoder refused (CORS or network): not working, not no match', async ({ page }) => {
    await services(page, { live: 'network', hosted: 'network', photon: 'network' });
    await search(page);
    await expectLookupError(page, lookupCopy.errors.unavailable);
    await expectNoAxeViolations(page);
  });

  test('county layers 5xx and Photon hanging until its timeout: not working', async ({ page }) => {
    let photonAsked = false;
    await services(page, {
      live: 500,
      hosted: 503,
      photon: () => {
        photonAsked = true;
        // Never answers, so the app's own Photon timeout gives up.
        return new Promise(() => {});
      },
    });
    await search(page);
    await expect(page.getByText(errorCopy.slow)).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(lookupCopy.errors.unavailable)).toBeVisible({ timeout: 15000 });
    await expectLookupError(page, lookupCopy.errors.unavailable);
    expect(photonAsked).toBe(true);
    await expect(page.getByText(errorCopy.slow)).toHaveCount(0);
  });

  test('county finds no match and Photon is down: not working, not no match', async ({ page }) => {
    await services(page, {
      live: (route) => route.fulfill(json('{"features":[]}')),
      photon: 503,
    });
    await search(page);
    await expectLookupError(page, lookupCopy.errors.unavailable);
  });

  test('City geocoder down: not working, and never a county precinct', async ({ page }) => {
    let precinctQueries = 0;
    await services(page, {
      city: 'network',
      precincts: (route, body) => {
        precinctQueries += 1;
        return route.fulfill(json(body));
      },
    });
    await search(page);
    await expectLookupError(page, lookupCopy.errors.unavailable);
    expect(precinctQueries).toBe(0);
  });

  test('City geocoder answering 502: not working, and never a county precinct', async ({
    page,
  }) => {
    await services(page, { city: 502 });
    await search(page);
    await expectLookupError(page, lookupCopy.errors.unavailable);
  });

  test('county precinct check for a two-record address down: not working, not no match', async ({
    page,
  }) => {
    const two = JSON.parse(COUNTY_ROSS);
    two.features.push({
      attributes: { ...two.features[0].attributes, OBJECTID: 2, UNITDESC: 'APT', UNITNO: '2' },
      geometry: { x: -90.4579, y: 38.6824 },
    });
    await services(page, {
      live: (route) => route.fulfill(json(JSON.stringify(two))),
      precincts: 503,
    });
    await search(page);
    await expectLookupError(page, lookupCopy.errors.unavailable);
  });

  test('precinct layer 5xx during a lookup: failed, then Try again finds the precinct', async ({
    page,
  }) => {
    let precinctsUp = false;
    await services(page, {
      precincts: (route, body) =>
        precinctsUp ? route.fulfill(json(body)) : route.fulfill({ status: 503 }),
    });
    await search(page);
    await expectLookupError(page, lookupCopy.errors.failed);
    precinctsUp = true;
    await page.getByRole('button', { name: errorCopy.retry }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${CODE}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('Use my location with the precinct layer down: failed, with a retry', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 38.6822, longitude: -90.4581 });
    await services(page, { precincts: 'network' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expectLookupError(page, lookupCopy.errors.failed);
  });

  test('offline: says so plainly', async ({ page, context }) => {
    await services(page, {
      live: 'network',
      hosted: 'network',
      photon: 'network',
      city: 'network',
      precincts: 'network',
    });
    await page.goto('/');
    await context.setOffline(true);
    await page.getByRole('combobox').fill(ADDRESS);
    await page.getByRole('button', { name: 'Find my precinct' }).click();
    await expectLookupError(page, lookupCopy.errors.offline);
    await context.setOffline(false);
  });
});

test.describe('precinct page', () => {
  test('load failure: message focused, Try again loads the results', async ({ page }) => {
    let up = false;
    await services(page, {
      precincts: (route, body) => (up ? route.fulfill(json(body)) : route.fulfill({ status: 500 })),
    });
    await page.goto(`/p/${CODE}`);
    const message = page.getByText(resultsCopy.errors.failed, { exact: false });
    await expect(message).toBeVisible();
    // Focus lands on the message block, with Try again inside it.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.querySelector('[role="alert"]')?.textContent),
        ),
      )
      .toBe(true);
    await expect(page.getByRole('link', { name: resultsCopy.officialLookup })).toBeVisible();
    await expectNoAxeViolations(page);
    up = true;
    await page.getByRole('button', { name: errorCopy.retry }).click();
    await expect(page.getByText(resultsCopy.ready(CODE))).toBeAttached();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(message).toHaveCount(0);
  });

  test('slow precinct data: says it is still working', async ({ page }) => {
    await services(page, {}, { delayMs: 4500 });
    await page.goto(`/p/${CODE}`);
    await expect(page.getByText(errorCopy.slow)).toBeVisible({ timeout: 4000 });
    await expect(page.getByText(resultsCopy.ready(CODE))).toBeAttached({ timeout: 15000 });
    await expect(page.getByText(errorCopy.slow)).toHaveCount(0);
  });

  test('polls layer down: only its cards fail, each with Try again', async ({ page }) => {
    await services(page, { polls: 503 });
    await page.goto(`/p/${CODE}`);
    await expect(page.getByText(resultsCopy.ready(CODE))).toBeAttached();
    await expect(page.getByText(resultsCopy.polls.failed, { exact: false })).toBeVisible();
    await expect(page.getByText(resultsCopy.earlyVoting.failed, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: errorCopy.retry })).toHaveCount(2);
    await expect(page.getByRole('heading', { name: resultsCopy.cards.districts })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

// A City precinct page (#89) with the City Board's layers failing: the same
// failure states as the County's (#18), with the City's links.
test.describe('City precinct page', () => {
  test('City layers down: message focused, City lookup, Try again loads the results', async ({
    page,
  }) => {
    let up = false;
    await services(page, {
      cityLayers: (route, body) =>
        up ? route.fulfill(json(body)) : route.fulfill({ status: 503, body: '' }),
    });
    await page.goto(`/p/${CITY_CODE}`);
    const message = page.getByText(resultsCopy.errors.failed, { exact: false });
    await expect(message).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.querySelector('[role="alert"]')?.textContent),
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole('link', { name: resultsCopy.officialLookupFor('city') }),
    ).toHaveAttribute('href', referrals.stlCityLookup.url);
    // The site footer names both boards; the page itself names only the City's.
    await expect(page.locator('main').getByText(/county/i)).toHaveCount(0);
    await expectNoAxeViolations(page);
    up = true;
    await page.getByRole('button', { name: errorCopy.retry }).click();
    await expect(page.getByText(resultsCopy.ready(CITY_CODE))).toBeAttached();
    await expect(page.getByRole('list', { name: resultsCopy.polls.listLabel })).toBeVisible();
    await expect(message).toHaveCount(0);
  });

  test('City voting locations down: the polling places card fails with the City lookup', async ({
    page,
  }) => {
    const sites = election.jurisdictions.city.layers.sites;
    await services(page, {
      cityLayers: (route, body) =>
        new URL(route.request().url()).pathname.includes(sites)
          ? route.fulfill({ status: 503, body: '' })
          : route.fulfill(json(body)),
    });
    await page.goto(`/p/${CITY_CODE}`);
    await expect(page.getByText(resultsCopy.ready(CITY_CODE))).toBeAttached();
    const card = page.getByRole('region', { name: resultsCopy.cards.polls });
    await expect(card.getByText(resultsCopy.polls.failed, { exact: false })).toBeVisible();
    await expect(
      card.getByRole('link', { name: resultsCopy.officialLookupFor('city') }),
    ).toHaveAttribute('href', referrals.stlCityLookup.url);
    await expect(card.getByRole('button', { name: errorCopy.retry })).toBeVisible();
    // The site footer names both boards; the page itself names only the City's.
    await expect(page.locator('main').getByText(/county/i)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

// The early voting wait times page (#104) with every state of the line count
// layers (#106), at the time the fixtures were recorded, while every County
// site is open. Whatever the counts do, the sites, their hours and the official
// links stay on the page.
test.describe('early voting wait times', () => {
  const COUNT = /in line, reported/;

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(WAITS_RECORDED_AT);
  });

  async function open(page) {
    await page.goto('/early-voting');
    const list = page.getByRole('list', { name: waitCopy.listLabel });
    await expect(list).toBeVisible();
    return list;
  }

  // The page as it must look with no count to show: every site listed with
  // no count, and the official sources linked.
  async function expectNoCounts(page, list) {
    await expect(list.getByText(waitCopy.noCount).first()).toBeVisible();
    await expect(list.getByText(COUNT)).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: waitCopy.countyLink(election.waitTimes.county.source) }),
    ).toHaveAttribute('href', election.waitTimes.county.sourceUrl);
    await expect(
      page.getByRole('link', { name: waitCopy.cityLink(election.waitTimes.city.source) }),
    ).toHaveAttribute('href', election.waitTimes.city.sourceUrl);
  }

  test('fresh County counts show on the open sites', async ({ page }) => {
    await services(page, {}, { waits: { county: 'fresh', city: 'fresh' } });
    const list = await open(page);
    await expect(list.getByText(COUNT).first()).toBeVisible();
    await expect(page.getByTestId('wait-status-shown')).toHaveText(/^Line counts checked at /);
  });

  for (const state of ['stale', 'empty']) {
    test(`${state} County counts: no count shown, and the check still succeeded`, async ({
      page,
    }) => {
      await services(page, {}, { waits: { county: state, city: state } });
      const list = await open(page);
      await expect(page.getByTestId('wait-status-shown')).toHaveText(/^Line counts checked at /);
      await expectNoCounts(page, list);
    });
  }

  for (const [label, how] of [
    ['answering 503', 503],
    ['refused (network or CORS)', 'network'],
  ]) {
    test(`County line counts ${label}: the page says so and keeps the sites`, async ({ page }) => {
      await services(page, { countyWaits: how, cityWaits: how });
      const list = await open(page);
      await expect(page.getByTestId('wait-status-shown')).toHaveText(waitCopy.status.unavailable);
      await expectNoCounts(page, list);
      await expectNoAxeViolations(page);
    });
  }

  test('County line counts timing out: the page says so after the timeout', async ({ page }) => {
    // Two attempts of the client's 8 s timeout, then the page's answer.
    test.setTimeout(60_000);
    await services(page, { countyWaits: () => new Promise(() => {}) });
    const list = await open(page);
    await expect(page.getByTestId('wait-status-shown')).toHaveText(waitCopy.status.unavailable, {
      timeout: 30_000,
    });
    await expectNoCounts(page, list);
  });

  test('City line counts failing leaves the County counts shown', async ({ page }) => {
    await services(page, { cityWaits: 503 });
    const list = await open(page);
    await expect(list.getByText(COUNT).first()).toBeVisible();
    await expect(page.getByTestId('wait-status-shown')).toHaveText(/^Line counts checked at /);
  });
});
