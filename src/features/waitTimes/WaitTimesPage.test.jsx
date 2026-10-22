// The early voting wait times page (#104), with the County and City fixtures
// #102 recorded on 2026-10-22 and the real #103 selection and loop.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import cityFreshBody from '../../../docs/raw/fixtures/city-waits-fresh.json';
import cityStaleBody from '../../../docs/raw/fixtures/city-waits-stale.json';
import countyEmptyBody from '../../../docs/raw/fixtures/county-waits-empty.json';
import countyFreshBody from '../../../docs/raw/fixtures/county-waits-fresh.json';
import election from '../../config/election.js';
import { reportedTimeParts, selectCityWaits, selectCountyWaits } from '../../data/waitTimes.js';
import { titleCase } from '../lookup/nearbyPolls.js';
import { createWaitTimesStore } from './useWaitTimes.js';
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

function renderPage({ loadSites = async () => sites, waitSource } = {}) {
  const location = memoryLocation({ path: '/early-voting' });
  return render(
    <Router hook={location.hook}>
      <WaitTimesPage loadSites={loadSites} waitSource={waitSource} />
    </Router>,
  );
}

const list = () => screen.getByRole('list', { name: copy.listLabel });
const items = () => within(list()).getAllByRole('listitem');
const names = () => items().map((li) => within(li).getByRole('heading').textContent);
const itemFor = (name) => items().find((li) => within(li).queryByRole('heading', { name }));
const siteName = (key) =>
  titleCase(sites.features.find((f) => f.properties[county.pollsField] === key).properties.name);
const statusLine = () => screen.getByTestId('wait-status');
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
    const nearest = await screen.findByRole('radio', { name: copy.sort.nearest });
    expect(screen.getByRole('radio', { name: copy.sort.nearby(5) })).toBeInTheDocument();
    await user.click(nearest);
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
    vi.setSystemTime(START + 5 * MINUTE);
    act(() => set([]));
    expect(statusLine()).toHaveTextContent(copy.status.checked('09:05'));
    // The list is not a live region.
    expect(list().closest('[aria-live]')).toBeNull();
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
    expect(screen.getByRole('link', { name: copy.season.findPollingPlace })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('list', { name: copy.listLabel })).toBeNull();
  });

  it('offers a retry when the sites cannot be loaded', async () => {
    const user = userEvent.setup();
    const loadSites = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(sites);
    renderPage({
      loadSites,
      waitSource: createWaitTimesStore({ county: countyEmpty, city: null }),
    });
    expect(await screen.findByText(new RegExp(copy.failed))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /official lookup/i })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByRole('list', { name: copy.listLabel });
  });

  it('links the official sources, the City board, and says counts change quickly', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    await screen.findByRole('list', { name: copy.listLabel });
    expect(screen.getByText(copy.disclaimer)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.countyLink })).toHaveAttribute(
      'href',
      county.sourceUrl,
    );
    expect(screen.getByRole('link', { name: copy.cityLink })).toHaveAttribute(
      'href',
      election.waitTimes.city.sourceUrl,
    );
  });

  it('shows the map on request, with a legend only when a site has a count', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
    const { unmount } = renderPage({
      waitSource: createWaitTimesStore({ county: countyFresh, city: null }),
    });
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT).length).toBeGreaterThan(0));
    const show = screen.getByRole('button', { name: copy.map.show });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: copy.map.label })).toBeNull();
    await user.click(show);
    const region = screen.getByRole('region', { name: copy.map.label });
    expect(within(region).getByRole('list', { name: copy.map.legend })).toBeInTheDocument();
    unmount();

    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
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

  it('uses no ranking words', () => {
    renderPage({ waitSource: createWaitTimesStore({ county: countyEmpty, city: null }) });
    expect(document.body.textContent).not.toMatch(/\b(best|worst|avoid|recommended)\b/i);
  });
});
