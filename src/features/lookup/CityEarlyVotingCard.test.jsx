// The City early voting card (#91): the City's sites from the real City
// client (fetch stubbed with the recorded fixture), the hours from the City
// config, and the City's line counts. Dates are built from numbers, never ISO
// literals: the hardcoding test scans this file.
import { configure, getConfig, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import cityGeometry from '../../../docs/raw/fixtures/city-precinct-geometry.json';
import citySites from '../../../docs/raw/fixtures/city-early-voting-sites.json';
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { createWaitTimesStore } from '../waitTimes/useWaitTimes.js';
import { copy as waitCopy } from '../waitTimes/waitTimesCopy.js';
import { formatLongDate } from './earlyVoting.js';
import { copy } from './resultsCopy.js';

const city = election.jurisdictions.city;
const cityEarlyVoting = cityResults.earlyVoting;
const t = copy.earlyVoting;
const CODE = 'W01P12';
// Next to each site, so it is listed first.
const NEAR_BUDER = { lat: 38.5904, lng: -90.2949 };
const NEAR_BOARD = { lat: 38.6299, lng: -90.197 };
const NEAR_JOAN = { lat: 38.5972, lng: -90.2923 };

// Chicago is UTC-5 until November 1, 2026, then UTC-6.
const cdt = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 5, minutes));
const cst = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 6, minutes));

let fetchMock;
let modules;

function respond(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// The City sites layer answers its fixture (or 500 with `fail`), the precinct
// layer its outline. Anything else fails the test.
function routeFetch({ fail = false } = {}) {
  fetchMock.mockImplementation((input) => {
    const url = new URL(input);
    if (!url.href.startsWith(city.serviceRoot)) throw new Error(`Not a City layer: ${url.href}`);
    if (url.pathname.includes(city.layers.sites)) {
      expect(url.searchParams.get('where')).toBe(city.earlyVotingWhere);
      return fail ? respond({ error: 'down' }, 500) : respond(citySites);
    }
    return respond(cityGeometry);
  });
}

let defaultWait;
beforeAll(() => {
  defaultWait = getConfig().asyncUtilTimeout;
  configure({ asyncUtilTimeout: 4000 });
});

afterAll(() => {
  configure({ asyncUtilTimeout: defaultWait });
});

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  modules = {
    Card: (await import('./CityEarlyVotingCard.jsx')).default,
    ...(await import('./jurisdictionContext.js')),
    ...(await import('../../data/jurisdictions.js')),
  };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(cdt(10, 22, 12));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Counts off unless a source is given.
const noWaits = () => createWaitTimesStore({ county: null, city: null });

function renderCard({ origin = NEAR_BUDER, waitSource = noWaits() } = {}) {
  const { Card, JurisdictionContext, city: adapter } = modules;
  render(
    <JurisdictionContext.Provider value={adapter}>
      <Card code={CODE} origin={origin} waitSource={waitSource} />
    </JurisdictionContext.Provider>,
  );
}

const list = () => screen.findByRole('list', { name: t.listLabel });
// The list's own rows: each also holds a list of its hours.
const rowsOf = (ol) => [...ol.children];
const firstRow = async () => rowsOf(await list())[0];
const heading = (row) => within(row).getByRole('heading', { level: 3 }).textContent;

describe('CityEarlyVotingCard', () => {
  it('lists the nearest City early voting sites with their address, entrance and directions', async () => {
    routeFetch();
    renderCard();
    const ol = await list();
    const rows = rowsOf(ol);
    expect(rows).toHaveLength(election.nearbyPollCount);
    expect(heading(rows[0])).toBe('Buder Library');
    expect(rows[0]).toHaveTextContent('4401 Hampton Ave, MO 63109');
    expect(rows[0]).toHaveTextContent(
      copy.polls.entryBoth('off back parking lot accessed from Lansdowne Ave.'),
    );
    expect(within(rows[0]).getByRole('link', { name: /directions/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
    await userEvent.click(screen.getByRole('button', { name: t.showAll(8) }));
    expect(rowsOf(ol)).toHaveLength(8);
  });

  it("shows each site's own dates and hours, as the City Board's page lists them", async () => {
    routeFetch();
    renderCard();
    const row = await firstRow();
    const details = within(row).getByText(t.groupsLabel).closest('details');
    expect(details).toHaveTextContent(
      t.days({ weekdaysOnly: false, from: 'Tuesday, October 20', to: 'Monday, November 2' }),
    );
    expect(details).toHaveTextContent('Monday: 1 p.m. to 4 p.m.');
    expect(details).toHaveTextContent('Wednesday and Thursday: 11 a.m. to 7 p.m.');
    expect(details).toHaveTextContent('Friday and Saturday: 11 a.m. to 4:30 p.m.');
  });

  it("gives the Board office's weekdays and its one Saturday", async () => {
    routeFetch();
    renderCard({ origin: NEAR_BOARD });
    const row = await firstRow();
    expect(heading(row)).toBe('St. Louis City Board of Elections');
    expect(row).toHaveTextContent('Monday to Friday: 8 a.m. to 5 p.m.');
    expect(row).toHaveTextContent('Saturday, October 31: 9 a.m. to 1 p.m.');
  });

  it.each([
    ['a weekday morning', cdt(10, 22, 9), 'Opens today at 11 a.m.'],
    ['a weekday afternoon', cdt(10, 22, 15), 'Open today until 7 p.m.'],
    ['a Saturday', cdt(10, 24, 12), 'Open today until 4:30 p.m.'],
    ['a Sunday', cdt(10, 25, 12), 'Opens Monday, October 26 at 1 p.m.'],
    ['the last day', cst(11, 2, 14), 'Open today until 4 p.m.'],
    ['after early voting ends', cst(11, 2, 17), 'Early voting has ended.'],
  ])('says the status on %s', async (_, now, text) => {
    vi.setSystemTime(now);
    routeFetch();
    renderCard();
    expect(await firstRow()).toHaveTextContent(text);
  });

  it('says St. Joan of Arc opens on October 27', async () => {
    routeFetch();
    renderCard({ origin: NEAR_JOAN });
    const row = await firstRow();
    expect(heading(row)).toBe('St. Joan of Arc');
    expect(row).toHaveTextContent('Opens Tuesday, October 27 at 11 a.m.');
  });

  it('after early voting ends: no wait times link', async () => {
    vi.setSystemTime(cst(11, 3, 7));
    routeFetch();
    renderCard();
    await list();
    expect(screen.queryByRole('link', { name: t.waits.seeAll })).toBeNull();
  });

  it("shows a site's City line count while early voting runs, with the nearby sort", async () => {
    vi.setSystemTime(cdt(10, 22, 9, 30));
    routeFetch();
    const entry = {
      siteId: 'St. Louis City Board of Elections',
      jurisdiction: 'city',
      unit: 'people',
      value: 4,
      reportedAt: cdt(10, 22, 9, 10),
      source: election.waitTimes.city.source,
      openUntil: cdt(10, 22, 17),
    };
    const getCity = vi.fn(async () => [entry]);
    renderCard({
      origin: NEAR_BOARD,
      waitSource: createWaitTimesStore({ county: null, city: getCity }),
    });
    const row = await firstRow();
    await waitFor(() => expect(row).toHaveTextContent(waitCopy.count(4, '09:10')));
    expect(row).toHaveTextContent(waitCopy.reportedBy(election.waitTimes.city.source));
    expect(screen.getByRole('radiogroup', { name: waitCopy.sort.legend })).toBeInTheDocument();
    // The link to every site's wait is in the summary at the top (#81).
    expect(screen.queryByRole('link', { name: t.waits.seeAll })).toBeNull();
  });

  it('cites the City Board with the date checked, and links its No Excuse Absentee page', async () => {
    routeFetch();
    renderCard();
    await list();
    const named = screen
      .getAllByRole('link', { name: copy.polls.sourceNames['www.stlouis-mo.gov'] })
      .map((a) => a.getAttribute('href'));
    const [hoursPage, noExcusePage, absenteePage] = cityEarlyVoting.sources;
    expect(named).toEqual([hoursPage, absenteePage]);
    expect(hoursPage).toBe(referrals.stlCityLookup.url);
    expect(noExcusePage).toMatch(/no-excuse-absentee/);
    expect(absenteePage).toMatch(/vote-by-absentee-ballot/);
    expect(screen.getByRole('link', { name: 'No Excuse Absentee page' })).toHaveAttribute(
      'href',
      noExcusePage,
    );
    expect(
      screen.getByText(
        t.lastVerified(formatLongDate(cityEarlyVoting.lastVerified, { year: true })),
        { exact: false },
      ),
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    // Not the absentee topic: it is the County's (a City topic is #94).
    expect(links.some((href) => href.startsWith('/learn'))).toBe(false);
    // The mail line links the page on voting by mail, not the No Excuse page,
    // which says there is no mail option.
    const mail = screen.getByText(/To vote by mail or with an absentee ballot, see the/);
    expect(mail).toHaveTextContent(
      `To vote by mail or with an absentee ballot, see the ${copy.polls.sourceNames['www.stlouis-mo.gov']}.`,
    );
    expect(within(mail).getByRole('link')).toHaveAttribute('href', absenteePage);
    expect(document.body.textContent).not.toMatch(/county/i);
  });

  it('points to the City lookup when the sites fail to load', async () => {
    routeFetch({ fail: true });
    renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t.failed);
    expect(within(alert).getByRole('link')).toHaveAttribute('href', referrals.stlCityLookup.url);
  });
});

// The City's part of the summary at the top of the results (#81).
describe('CityEarlyVoteSummary', () => {
  async function renderSummary({ origin = NEAR_BOARD, waitSource = noWaits() } = {}) {
    const { CityEarlyVoteSummary } = await import('./CityEarlyVotingCard.jsx');
    const { JurisdictionContext, city: adapter } = modules;
    render(
      <JurisdictionContext.Provider value={adapter}>
        <CityEarlyVoteSummary code={CODE} origin={origin} waitSource={waitSource} />
      </JurisdictionContext.Provider>,
    );
  }
  const region = () => screen.getByRole('region', { name: copy.summary.early });

  it('names the nearest City site open now with its City line count', async () => {
    vi.setSystemTime(cdt(10, 22, 9, 30));
    routeFetch();
    const entry = {
      siteId: 'St. Louis City Board of Elections',
      jurisdiction: 'city',
      unit: 'people',
      value: 4,
      reportedAt: cdt(10, 22, 9, 10),
      source: election.waitTimes.city.source,
      openUntil: cdt(10, 22, 17),
    };
    const getCity = vi.fn(async () => [entry]);
    await renderSummary({ waitSource: createWaitTimesStore({ county: null, city: getCity }) });
    expect(await within(region()).findByText('St. Louis City Board of Elections')).toBeVisible();
    expect(region()).toHaveTextContent(copy.summary.nearestOpen);
    await waitFor(() => expect(region()).toHaveTextContent(waitCopy.count(4, '09:10')));
    expect(region()).toHaveTextContent(waitCopy.reportedBy(election.waitTimes.city.source));
    expect(within(region()).getByRole('link', { name: t.waits.seeAll })).toHaveAttribute(
      'href',
      '/early-voting',
    );
  });

  it('shows nothing and asks no line count after early voting ends', async () => {
    vi.setSystemTime(cst(11, 3, 7));
    routeFetch();
    const getCity = vi.fn(async () => []);
    await renderSummary({ waitSource: createWaitTimesStore({ county: null, city: getCity }) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: copy.summary.early })).toBeNull();
    expect(getCity).not.toHaveBeenCalled();
  });
});
