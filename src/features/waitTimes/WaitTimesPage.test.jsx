// The early voting wait times page (#104), with the County and City fixtures
// #102 recorded on 2026-10-22 and the real #103 selection and loop.
import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import citySitesBody from '../../../docs/raw/fixtures/city-early-voting-sites.json';
import cityFreshBody from '../../../docs/raw/fixtures/city-waits-fresh.json';
import cityStaleBody from '../../../docs/raw/fixtures/city-waits-stale.json';
import countyEmptyBody from '../../../docs/raw/fixtures/county-waits-empty.json';
import countyFreshBody from '../../../docs/raw/fixtures/county-waits-fresh.json';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { reportedTimeParts, selectCityWaits, selectCountyWaits } from '../../data/waitTimes.js';
import { cityScheduleFor, citySchedules } from '../lookup/cityEarlyVoting.js';
import { titleCase } from '../lookup/nearbyPolls.js';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import { createWaitTimesStore } from './useWaitTimes.js';
import { createWaitTimesMap } from './waitTimesMapView.js';
import WaitTimesPage from './WaitTimesPage.jsx';
import { copy } from './waitTimesCopy.js';

vi.mock('./waitTimesMapView.js', () => ({ createWaitTimesMap: vi.fn() }));

const rowsOf = (body) => body.features.map((f) => f.attributes);
const MINUTE = 60_000;
// 9:00 a.m. Central on Thursday 2026-10-22, when the fixtures were recorded.
const START = Date.UTC(2026, 9, 22, 14, 0);
const { county } = election.waitTimes;

const countyFresh = async () => selectCountyWaits(rowsOf(countyFreshBody), sites.features);
const countyEmpty = async () => selectCountyWaits(rowsOf(countyEmptyBody), sites.features);
const cityFresh = async () => selectCityWaits(rowsOf(cityFreshBody));
const cityStale = async () => selectCityWaits(rowsOf(cityStaleBody));

// The City's sites as the City client returns them (src/data/cityArcgis.js),
// with the City chunk's schedules (#91).
const fields = election.jurisdictions.city.siteFields;
const citySites = {
  ...citySitesBody,
  features: citySitesBody.features.map(({ properties: p, ...f }) => ({
    ...f,
    properties: {
      loc: p[fields.id],
      name: p[fields.name],
      address: p[fields.address],
      zipcode: p[fields.zip],
      entry: p[fields.entry],
      accessibleEntry: p[fields.accessibleEntry],
    },
  })),
};
const cityPart = (layer) => ({ layer, scheduleFor: cityScheduleFor, schedules: citySchedules });
// The County tests' default: the City answers no sites.
const noCity = async () => cityPart({ features: [] });

// In StrictMode, as src/main.jsx renders the app: effects run twice on mount.
function renderPage({ loadSites = async () => sites, loadCity = noCity, waitSource } = {}) {
  const location = memoryLocation({ path: '/early-voting' });
  return render(
    <StrictMode>
      <Router hook={location.hook}>
        <WaitTimesPage loadSites={loadSites} loadCity={loadCity} waitSource={waitSource} />
      </Router>
    </StrictMode>,
  );
}

const list = () => screen.getByRole('list', { name: copy.listLabel });
const items = () => within(list()).getAllByRole('listitem');
const names = () => items().map((li) => within(li).getByRole('heading').textContent);
const itemFor = (name) => items().find((li) => within(li).queryByRole('heading', { name }));
const siteName = (key) =>
  titleCase(sites.features.find((f) => f.properties[county.pollsField] === key).properties.name);
// The live region, and the visible line sighted readers see.
const statusLine = () => screen.getByTestId('wait-status');
const shownStatus = () => screen.getByTestId('wait-status-shown');
// Any line count number shown: "About 3 people in line", "No one in line".
const COUNT_TEXT = /in line, reported/;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WaitTimesPage', () => {
  it('has one focusable h1, focused on arrival, and its own tab title', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    const heading = screen.getByRole('heading', { level: 1, name: copy.heading });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
    expect(document.title).toContain(copy.heading);
    await screen.findByRole('list', { name: copy.listLabel });
  });

  it('lists every County early voting site, each with its count, unit, time and board', async () => {
    const entries = await countyFresh();
    expect(entries.length).toBeGreaterThan(10);
    renderPage({ waitSource: createWaitTimesStore({ county: countyFresh, city: cityFresh }) });
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT)).toHaveLength(entries.length));
    expect(items()).toHaveLength(sites.features.length);
    for (const entry of entries) {
      const li = itemFor(siteName(entry.siteId));
      const { time } = reportedTimeParts(entry);
      expect(li).toHaveTextContent(copy.count(entry.value, time));
      expect(li).toHaveTextContent(copy.reportedBy(county.source));
    }
    // Sites with no fresh report say so quietly, and are never hidden.
    const without = items().filter((li) => !COUNT_TEXT.test(li.textContent));
    expect(without).toHaveLength(sites.features.length - entries.length);
    for (const li of without) expect(li).toHaveTextContent(copy.noCount);
  });

  it('shows each site address, ZIP, status, hours, note and directions', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    const li = itemFor('Board of Elections');
    expect(li).toHaveTextContent('725 Northwest Plaza Dr, MO 63074');
    expect(li).toHaveTextContent(copy.todayHours('08:00', '16:30'));
    expect(li).toHaveTextContent(/Open today until 4:30 p\.m\./);
    expect(within(li).getByRole('link', { name: /Get directions/ })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
    const noted = sites.features.find((f) => f.properties.notes_abs);
    if (noted) {
      expect(itemFor(titleCase(noted.properties.name))).toHaveTextContent(
        noted.properties.notes_abs,
      );
    }
  });

  it('orders open sites by shortest line first, then the rest by name', async () => {
    const entries = await countyFresh();
    renderPage({ waitSource: createWaitTimesStore({ county: countyFresh, city: null }) });
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT)).toHaveLength(entries.length));
    const shown = names();
    const counted = shown.slice(0, entries.length);
    const values = counted.map((name) => entries.find((e) => siteName(e.siteId) === name).value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    const rest = shown.slice(entries.length);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('shows no count anywhere with the empty County view and stale City rows', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: cityStale }) });
    await waitFor(() => expect(statusLine()).toHaveTextContent(copy.status.checked('09:00')));
    expect(screen.queryByText(COUNT_TEXT)).toBeNull();
    for (const li of items()) expect(li).toHaveTextContent(copy.noCount);
  });

  it('changes the sort with the keyboard', async () => {
    const user = userEvent.setup();
    renderPage({ waitSource: createWaitTimesStore({ county: countyFresh, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    const group = screen.getByRole('radiogroup', { name: copy.sort.legend });
    const byLine = within(group).getByRole('radio', { name: copy.sort.line });
    expect(byLine).toBeChecked();
    byLine.focus();
    await user.keyboard('{ArrowDown}');
    expect(within(group).getByRole('radio', { name: copy.sort.name })).toBeChecked();
    expect(names()).toEqual([...names()].sort((a, b) => a.localeCompare(b)));
    // No distance sort before a location.
    expect(within(group).queryByRole('radio', { name: copy.sort.nearest })).toBeNull();
  });

  it('sorts by distance from the device location, kept in memory only', async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((ok) =>
      ok({ coords: { latitude: 38.7313, longitude: -90.4002, accuracy: 20 } }),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    await user.click(screen.getByRole('button', { name: copy.location.button }));
    // Finding the location switches to the nearest-first sort.
    const nearest = await screen.findByRole('radio', { name: copy.sort.nearest });
    expect(nearest).toBeChecked();
    expect(screen.getByRole('radio', { name: copy.sort.nearby(5) })).toBeInTheDocument();
    // The location is at the Board of Elections office.
    expect(names()[0]).toBe('Board of Elections');
    expect(items()[0]).toHaveTextContent(/Less than 0\.1 miles away/);
    expect(window.location.href).not.toMatch(/38\.73|90\.40/);
  });

  it('says why the location could not be used, and keeps the list', async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn((ok, fail) => fail({ code: 1 }));
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    await user.click(screen.getByRole('button', { name: copy.location.button }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.location.errors.denied);
    expect(screen.queryByRole('radio', { name: copy.sort.nearest })).toBeNull();
    expect(items()).toHaveLength(sites.features.length);
  });

  it('says when counts could not be loaded, and still lists the sites', async () => {
    const failing = async () => {
      throw new Error('down');
    };
    renderPage({ waitSource: createWaitTimesStore({ county: failing, city: null }) });
    await waitFor(() => expect(statusLine()).toHaveTextContent(copy.status.unavailable));
    expect(items()).toHaveLength(sites.features.length);
  });

  it('changes the status line at most every 5 minutes', async () => {
    let state;
    const listeners = new Set();
    const part = (waits) => ({ status: 'ok', refreshFailed: false, checkedAt: Date.now(), waits });
    const set = (waits) => {
      state = { waits, county: part(waits), city: part([]) };
      listeners.forEach((l) => l());
    };
    set([]);
    const source = {
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      getSnapshot: () => state,
      getServerSnapshot: () => state,
    };
    renderPage({ waitSource: source });
    await screen.findByRole('list', { name: copy.listLabel });
    expect(statusLine()).toHaveTextContent(copy.status.checked('09:00'));
    expect(statusLine()).toHaveAttribute('aria-live', 'polite');
    vi.setSystemTime(START + 2 * MINUTE);
    act(() => set([]));
    expect(statusLine()).toHaveTextContent(copy.status.checked('09:00'));
    // The visible line always has the latest check, outside the live region.
    expect(shownStatus()).toHaveTextContent(copy.status.checked('09:02'));
    expect(shownStatus()).toHaveAttribute('aria-hidden', 'true');
    expect(shownStatus().closest('[aria-live]')).toBeNull();
    vi.setSystemTime(START + 5 * MINUTE);
    act(() => set([]));
    expect(statusLine()).toHaveTextContent(copy.status.checked('09:05'));
    // The list is not a live region.
    expect(list().closest('[aria-live]')).toBeNull();
  });

  it('does not flip between checked and unavailable on every refresh', async () => {
    let state;
    const listeners = new Set();
    const set = (part) => {
      state = {
        waits: [],
        county: part,
        city: { status: 'off', refreshFailed: false, checkedAt: null, waits: [] },
      };
      listeners.forEach((l) => l());
    };
    set({ status: 'ok', refreshFailed: false, checkedAt: Date.now(), waits: [] });
    const source = {
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      getSnapshot: () => state,
      getServerSnapshot: () => state,
    };
    renderPage({ waitSource: source });
    await screen.findByRole('list', { name: copy.listLabel });
    // A failure 30 s after a success keeps the last check shown.
    vi.setSystemTime(START + MINUTE / 2);
    act(() => set({ status: 'unavailable', refreshFailed: true, checkedAt: START, waits: [] }));
    expect(statusLine()).toHaveTextContent(copy.status.checked('09:00'));
    expect(statusLine()).not.toHaveTextContent(copy.status.unavailable);
  });

  it('leaves focus on a list link when the map fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
    createWaitTimesMap.mockReturnValue({ setSites: vi.fn(), remove: vi.fn() });
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    await user.click(screen.getByRole('button', { name: copy.map.show }));
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    const link = within(items()[3]).getByRole('link', { name: /Get directions/ });
    link.focus();
    const { onFail } = createWaitTimesMap.mock.calls.at(-1)[1];
    act(() => onFail(new Error('timeout')));
    expect(screen.queryByRole('button', { name: copy.map.hide })).toBeNull();
    expect(link).toHaveFocus();
    createWaitTimesMap.mockReset();
  });

  it('hides the map button when the map fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
    createWaitTimesMap.mockImplementation(() => {
      throw new Error('no WebGL context');
    });
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    await user.click(screen.getByRole('button', { name: copy.map.show }));
    await waitFor(() => expect(screen.queryByRole('button', { name: copy.map.hide })).toBeNull());
    expect(screen.queryByRole('button', { name: copy.map.show })).toBeNull();
    // Focus moves to the list rather than falling to the page.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(list());
    expect(screen.queryByRole('region', { name: copy.map.label })).toBeNull();
    createWaitTimesMap.mockReset();
  });

  it('leaves focus where the voter put it while the page code loaded', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
  });

  it('moves focus to the heading when early voting ends under it', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 4:59 p.m. Central on the last day.
    vi.setSystemTime(Date.UTC(2026, 10, 2, 22, 59));
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    screen.getByRole('radio', { name: copy.sort.name }).focus();
    act(() => vi.advanceTimersByTime(2 * MINUTE));
    expect(screen.getByText(copy.season.ended, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('never sends, stores or logs the device location', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    const log = vi.spyOn(console, 'log');
    const getCurrentPosition = vi.fn((ok) =>
      ok({ coords: { latitude: 38.7313, longitude: -90.4002, accuracy: 20 } }),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    await user.click(screen.getByRole('button', { name: copy.location.button }));
    await screen.findByRole('radio', { name: copy.sort.nearest });
    const sent = JSON.stringify(fetch.mock.calls);
    expect(sent).not.toMatch(/38\.73|90\.40/);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(log).not.toHaveBeenCalled();
    expect(window.location.href).not.toMatch(/38\.73|90\.40/);
    log.mockRestore();
  });

  it('says when early voting runs before it starts', async () => {
    vi.setSystemTime(Date.UTC(2026, 8, 1, 17, 0));
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    expect(
      screen.getByText(/Early voting runs from Tuesday, September 22 to Monday, November 2/),
    ).toBeInTheDocument();
    await screen.findByRole('list', { name: copy.listLabel });
  });

  it('says early voting has ended after it ends, with a link to the polling place lookup', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 3, 18, 0));
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    expect(screen.getByText(copy.season.ended, { exact: false })).toBeInTheDocument();
    // The County's Election Day rule (#152), never "assigned". The City's
    // rule is on each City precinct page, which the link below reaches.
    const ended = screen.getByText(copy.season.ended, { exact: false });
    expect(ended).toHaveTextContent(
      /St\. Louis County voter may vote at any polling place in St\. Louis County/,
    );
    expect(ended).not.toHaveTextContent(/assigned/i);
    expect(screen.getByRole('link', { name: copy.season.findPollingPlace })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('list', { name: copy.listLabel })).toBeNull();
  });

  it('offers a retry when the sites cannot be loaded', async () => {
    const user = userEvent.setup();
    let down = true;
    const loadSites = vi.fn(async () => {
      if (down) throw new Error('down');
      return sites;
    });
    renderPage({
      loadSites,
      waitSource: createWaitTimesStore({ county: countyEmpty, city: null }),
    });
    expect(await screen.findByText(new RegExp(copy.failed))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /official lookup/i })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    down = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByRole('list', { name: copy.listLabel });
  });

  it('links the official sources, the City board, and says counts change quickly', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    expect(screen.getByText(copy.disclaimer)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.countyLink(county.source) })).toHaveAttribute(
      'href',
      county.sourceUrl,
    );
    expect(
      screen.getByRole('link', { name: copy.cityLink(election.waitTimes.city.source) }),
    ).toHaveAttribute('href', election.waitTimes.city.sourceUrl);
  });

  it('shows the map on request, with a legend only when a site has a count', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
    createWaitTimesMap.mockReturnValue({ setSites: vi.fn(), remove: vi.fn() });
    const { unmount } = renderPage({
      waitSource: createWaitTimesStore({ county: countyFresh, city: null }),
    });
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT).length).toBeGreaterThan(0));
    const show = screen.getByRole('button', { name: copy.map.show });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: copy.map.label })).toBeNull();
    await user.click(show);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    const region = screen.getByRole('region', { name: copy.map.label });
    expect(within(region).getByRole('list', { name: copy.map.legend })).toBeInTheDocument();
    unmount();

    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: cityStale }) });
    await waitFor(() => expect(statusLine()).toHaveTextContent(copy.status.checked('09:00')));
    await user.click(screen.getByRole('button', { name: copy.map.show }));
    expect(screen.getByRole('region', { name: copy.map.label })).not.toHaveTextContent(
      copy.map.legend,
    );
  });

  it('offers no map where the browser cannot draw one', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    expect(screen.queryByRole('button', { name: copy.map.show })).toBeNull();
  });

  it('still links both boards once early voting has ended', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 3, 18, 0));
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    expect(screen.getByRole('link', { name: copy.countyLink(county.source) })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: copy.cityLink(election.waitTimes.city.source) }),
    ).toBeInTheDocument();
  });

  it('uses no ranking words', async () => {
    const getCurrentPosition = vi.fn((ok) =>
      ok({ coords: { latitude: 38.7313, longitude: -90.4002, accuracy: 20 } }),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    renderPage({ waitSource: createWaitTimesStore({ county: countyFresh, city: null }) });
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT).length).toBeGreaterThan(0));
    await userEvent.setup().click(screen.getByRole('button', { name: copy.location.button }));
    await screen.findByRole('radio', { name: copy.sort.nearest });
    expect(document.body.textContent).not.toMatch(/\b(best|worst|avoid|recommended)\b/i);
  });
});

describe('WaitTimesPage: St. Louis City sites (#91)', () => {
  const { city } = election.waitTimes;
  const withCity = (options = {}) =>
    renderPage({ loadCity: async () => cityPart(citySites), ...options });
  const BOARD = 'St. Louis City Board of Elections';

  it("lists the City's early voting sites with the County's, each naming its board", async () => {
    withCity({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    await waitFor(() =>
      expect(items()).toHaveLength(sites.features.length + citySites.features.length),
    );
    for (const f of citySites.features) {
      expect(itemFor(f.properties.name)).toHaveTextContent(city.source);
    }
    expect(itemFor('Board of Elections')).toHaveTextContent(county.source);
    expect(itemFor('Board of Elections')).not.toHaveTextContent(city.source);
  });

  it("shows a City site's hours, status and address from the City config", async () => {
    // Thursday 9 a.m.: the Board office is open, the libraries open at 11.
    withCity({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await waitFor(() => expect(itemFor(BOARD)).toBeDefined());
    expect(itemFor(BOARD)).toHaveTextContent(copy.todayHours('08:00', '17:00'));
    expect(itemFor(BOARD)).toHaveTextContent(/Open today until 5 p\.m\./);
    expect(itemFor(BOARD)).toHaveTextContent('300 N Tucker Blvd');
    expect(itemFor('Buder Library')).toHaveTextContent(/Opens today at 11 a\.m\./);
    expect(itemFor('St. Joan of Arc')).toHaveTextContent(/Opens Tuesday, October 27 at 11 a\.m\./);
  });

  it("shows a City site's line count from the City source", async () => {
    vi.setSystemTime(START + 30 * MINUTE);
    const entry = {
      siteId: BOARD,
      jurisdiction: 'city',
      unit: 'people',
      value: 6,
      reportedAt: new Date(START + 20 * MINUTE),
      source: city.source,
      openUntil: new Date(START + 8 * 60 * MINUTE),
    };
    withCity({
      waitSource: createWaitTimesStore({ county: countyEmpty, city: async () => [entry] }),
    });
    await waitFor(() =>
      expect(itemFor(BOARD)).toHaveTextContent(copy.count(6, reportedTimeParts(entry).time)),
    );
    expect(itemFor(BOARD)).toHaveTextContent(copy.reportedBy(city.source));
    // Open with a count: first in the shortest line order.
    expect(names()[0]).toBe(BOARD);
  });

  it("says counts are unavailable when the City's fail, and keeps the County's", async () => {
    const entries = await countyFresh();
    const failing = async () => {
      throw new Error('down');
    };
    withCity({ waitSource: createWaitTimesStore({ county: countyFresh, city: failing }) });
    await waitFor(() => expect(statusLine()).toHaveTextContent(copy.status.unavailable));
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT)).toHaveLength(entries.length));
  });

  it("keeps the County's sites when a retry after the City's failure fails for both", async () => {
    const user = userEvent.setup();
    let countyDown = false;
    const loadSites = vi.fn(async () => {
      if (countyDown) throw new Error('down');
      return sites;
    });
    withCity({
      loadSites,
      loadCity: async () => {
        throw new Error('down');
      },
      waitSource: createWaitTimesStore({ county: countyEmpty, city: null }),
    });
    await screen.findByText(new RegExp(copy.failed));
    expect(items()).toHaveLength(sites.features.length);
    countyDown = true;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(loadSites.mock.calls.length).toBeGreaterThan(2));
    expect(items()).toHaveLength(sites.features.length);
    expect(
      screen.getByRole('link', { name: resultsCopy.officialLookupFor('city') }),
    ).toHaveAttribute('href', referrals.stlCityLookup.url);
  });

  it("lists the County's sites without waiting for a slow City", async () => {
    withCity({
      loadCity: () => new Promise(() => {}),
      waitSource: createWaitTimesStore({ county: countyEmpty, city: null }),
    });
    await screen.findByRole('list', { name: copy.listLabel });
    expect(items()).toHaveLength(sites.features.length);
    expect(screen.queryByText(new RegExp(copy.failed))).toBeNull();
  });

  it('keeps the City failure and its retry shown while the retry runs', async () => {
    const user = userEvent.setup();
    let release;
    let calls = 0;
    const loadCity = () => {
      calls += 1;
      if (calls <= 2) return Promise.reject(new Error('down'));
      return new Promise((resolve) => {
        release = () => resolve(cityPart(citySites));
      });
    };
    withCity({ loadCity, waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByText(new RegExp(copy.failed));
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText(new RegExp(copy.failed))).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() =>
      expect(items()).toHaveLength(sites.features.length + citySites.features.length),
    );
    expect(screen.queryByText(new RegExp(copy.failed))).toBeNull();
  });

  it('keeps the error and its busy Try again, focused, while a retry of both runs', async () => {
    const user = userEvent.setup();
    let cityCalls = 0;
    const loadCity = () => {
      cityCalls += 1;
      return cityCalls <= 2 ? Promise.reject(new Error('down')) : new Promise(() => {});
    };
    withCity({
      loadSites: async () => {
        throw new Error('down');
      },
      loadCity,
      waitSource: createWaitTimesStore({ county: countyEmpty, city: null }),
    });
    await screen.findByText(new RegExp(copy.failed));
    const button = screen.getByRole('button', { name: /try again/i });
    await user.click(button);
    await waitFor(() => expect(cityCalls).toBeGreaterThan(2));
    expect(button).toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(new RegExp(copy.failed))).toBeInTheDocument();
    expect(screen.queryByTestId('wait-sites-skeleton')).toBeNull();
  });

  it("names both boards' lookups when both boards' sites fail", async () => {
    const down = async () => {
      throw new Error('down');
    };
    withCity({
      loadSites: down,
      loadCity: down,
      waitSource: createWaitTimesStore({ county: countyEmpty, city: null }),
    });
    const alert = (await screen.findByText(new RegExp(copy.failed))).closest('[role="alert"]');
    expect(
      within(alert).getByRole('link', { name: resultsCopy.officialLookupFor('county') }),
    ).toHaveAttribute('href', election.officialLookupUrl);
    expect(
      within(alert).getByRole('link', { name: resultsCopy.officialLookupFor('city') }),
    ).toHaveAttribute('href', referrals.stlCityLookup.url);
  });

  it('says each board serves its own voters, not that City sites are missing', async () => {
    withCity({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    expect(screen.getByText(copy.city)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/not listed/i);
    expect(copy.intro).toMatch(/St\. Louis City/);
  });

  it('still lists the County sites when the City sites fail, with the City lookup', async () => {
    withCity({
      loadCity: async () => {
        throw new Error('down');
      },
      waitSource: createWaitTimesStore({ county: countyEmpty, city: null }),
    });
    const alert = (await screen.findByText(new RegExp(copy.failed))).closest('[role="alert"]');
    expect(alert).toHaveTextContent(copy.failed);
    expect(
      screen.getByRole('link', { name: resultsCopy.officialLookupFor('city') }),
    ).toHaveAttribute('href', referrals.stlCityLookup.url);
    expect(items()).toHaveLength(sites.features.length);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
