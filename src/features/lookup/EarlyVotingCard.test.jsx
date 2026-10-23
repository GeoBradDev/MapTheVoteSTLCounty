// Dates are built from numbers, never ISO literals: the hardcoding test scans
// this file.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import countyEmptyBody from '../../../docs/raw/fixtures/county-waits-empty.json';
import countyFreshBody from '../../../docs/raw/fixtures/county-waits-fresh.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import {
  getAbsenteeSites,
  getCityWaits,
  getCountyWaits,
  getPrecinctGeometry,
} from '../../data/arcgis.js';
import { reportedTimeParts, selectCountyWaits } from '../../data/waitTimes.js';
import { fixtureTopics } from '../../test/learnFixtures.js';
import { NEARBY_MILES, orderSites } from '../waitTimes/siteOrder.js';
import { createWaitTimesStore } from '../waitTimes/useWaitTimes.js';
import { copy as waitCopy } from '../waitTimes/waitTimesCopy.js';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import { earlyVotingStatus, formatLongDate, scheduleLines } from './earlyVoting.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import { copy } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({
  getAbsenteeSites: vi.fn(),
  getPrecinctGeometry: vi.fn(),
  getCountyWaits: vi.fn(),
  getCityWaits: vi.fn(),
}));

// Which topics exist: none by default, as content/en/learn/ ships today.
const shown = vi.hoisted(() => ({ topics: [] }));
vi.mock('../learn/topics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTopic: (id, locale) =>
      actual.topicLookups(actual.indexTopics(shown.topics)).getTopic(id, locale),
  };
});

const ORIGIN = { lat: 38.66, lng: -90.45 };
const COUNT = election.nearbyPollCount;
const t = copy.earlyVoting;

// Chicago is UTC-5 until November 1, 2026, then UTC-6.
const cdt = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 5, minutes));
const cst = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 6, minutes));

beforeEach(() => {
  getAbsenteeSites.mockReset().mockResolvedValue(sites);
  getPrecinctGeometry.mockReset().mockResolvedValue(geometry.features[0]);
  // The app's own wait loop, for the tests that pass no source: no counts.
  getCountyWaits.mockReset().mockResolvedValue([]);
  getCityWaits.mockReset().mockResolvedValue([]);
  // Only the clock: promises and React's timers run for real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(cdt(10, 21, 10));
});

afterEach(() => {
  vi.useRealTimers();
  shown.topics = [];
});

const list = () => screen.findByRole('list', { name: t.listLabel });
const rowNames = (ol) =>
  within(ol)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);
const group = (key) => screen.getByRole('heading', { level: 4, name: t.groups[key] }).parentElement;

describe('EarlyVotingCard', () => {
  it('lists the nearest absentee sites to the looked-up point, nearest first', async () => {
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    const ol = await list();
    const expected = nearestPolls(sites, ORIGIN).slice(0, COUNT);
    expect(rowNames(ol)).toEqual(expected.map((r) => r.name));
    expect(getPrecinctGeometry).not.toHaveBeenCalled();
    expect(screen.queryByText(copy.polls.fromCenter('CC007'))).toBeNull();
  });

  it('shows each site with its kind, status, address, distance and directions', async () => {
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    const ol = await list();
    const [first] = nearestPolls(sites, ORIGIN);
    const row = within(ol).getAllByRole('listitem')[0];
    expect(row).toHaveTextContent(t.siteKinds[first.absType]);
    // Wednesday, October 21, 10 a.m.
    expect(row).toHaveTextContent('Open today until 4:30 p.m.');
    expect(row).toHaveTextContent(copy.polls.address(first.address, first.zip));
    expect(row).toHaveTextContent(copy.polls.distance(first.miles));
    const link = within(row).getByRole('link', {
      name: `${copy.polls.directions} ${copy.polls.linkTarget(first.name)}`,
    });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  it("shows a site's entrance note, and no note line for a site without one", async () => {
    const noted = sites.features.find((f) => f.properties.notes_abs?.trim());
    const [lng, lat] = noted.geometry.coordinates;
    render(<EarlyVotingCard code="CC007" origin={{ lat, lng }} />);
    const rows = within(await list()).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(`${t.note} ${noted.properties.notes_abs.trim()}`);
    expect(rows[1]).not.toHaveTextContent(t.note);
  });

  it('shows every site after "Show all", focusing the first new one', async () => {
    const user = userEvent.setup();
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    await list();
    await user.click(screen.getByRole('button', { name: t.showAll(sites.features.length) }));
    const ol = await list();
    expect(rowNames(ol)).toEqual(nearestPolls(sites, ORIGIN).map((r) => r.name));
    expect(within(ol).getAllByRole('heading', { level: 3 })[COUNT]).toHaveFocus();
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
  });

  it('measures from the precinct center without a looked-up point, leaving the note to the summary (#81)', async () => {
    render(<EarlyVotingCard code="CC007" origin={null} />);
    const ol = await list();
    const center = polygonCenter(geometry.features[0].geometry);
    const expected = nearestPolls(sites, center).slice(0, COUNT);
    expect(rowNames(ol)).toEqual(expected.map((r) => r.name));
    expect(getPrecinctGeometry).toHaveBeenCalledWith('CC007');
    expect(screen.queryByText(copy.polls.fromCenter('CC007'))).toBeNull();
  });

  it('points to the official lookup when the sites fail to load, and still shows the hours', async () => {
    getAbsenteeSites.mockRejectedValue(new Error('down'));
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    expect(await screen.findByText(new RegExp(t.failed))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.queryByTestId('early-voting-skeleton')).toBeNull();
    expect(group('abs')).toHaveTextContent('Open today until 4:30 p.m.');
  });

  it('says so when there are no sites', async () => {
    getAbsenteeSites.mockResolvedValue({ ...sites, features: [] });
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    expect(await screen.findByText(new RegExp(t.none))).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: t.listLabel })).toBeNull();
  });

  it('shows a skeleton while loading', () => {
    getAbsenteeSites.mockReturnValue(new Promise(() => {}));
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    expect(screen.getByTestId('early-voting-skeleton')).toBeInTheDocument();
  });

  // A tab left open past the max age refreshes when the voter returns (#84).
  describe('refresh on return to the tab', () => {
    const MINUTE = 60_000;
    const start = cdt(10, 21, 10);
    const stale = new Date(start.getTime() + election.layerMaxAge.minutes * MINUTE + 1);
    const nearest = nearestPolls(sites, ORIGIN)[0];
    const moved = {
      ...sites,
      features: sites.features.filter((f) => f.properties.loc !== nearest.loc),
    };
    let visibility;

    beforeEach(() => {
      visibility = 'visible';
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
      getAbsenteeSites.mockResolvedValue({ ...sites, loadedAt: start.getTime() });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const leaveAndReturn = async (at) => {
      visibility = 'hidden';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      vi.setSystemTime(at);
      visibility = 'visible';
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    };

    it('shows the current sites after the voter returns past the max age', async () => {
      render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
      expect(rowNames(await list())).toContain(nearest.name);
      getAbsenteeSites.mockResolvedValue({ ...moved, loadedAt: stale.getTime() });
      await leaveAndReturn(stale);
      await waitFor(() =>
        expect(rowNames(screen.getByRole('list', { name: t.listLabel }))).not.toContain(
          nearest.name,
        ),
      );
      expect(getAbsenteeSites).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('early-voting-skeleton')).toBeNull();
    });

    it('does not fetch again when the sites are still fresh', async () => {
      render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
      await list();
      await leaveAndReturn(new Date(start.getTime() + MINUTE));
      expect(getAbsenteeSites).toHaveBeenCalledTimes(1);
    });

    it('keeps the sites shown when the refresh fails, and says when they loaded', async () => {
      render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
      const before = rowNames(await list());
      getAbsenteeSites.mockRejectedValue(new Error('down'));
      await leaveAndReturn(stale);
      const note = await screen.findByRole('status');
      expect(note).toHaveTextContent(copy.polls.staleNote('10:00', null));
      expect(rowNames(await list())).toEqual(before);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it("shows each group's dates and hours from the config, with the source and date checked", async () => {
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    await list();
    for (const key of ['boe', 'abs']) {
      const items = within(group(key))
        .getAllByRole('listitem')
        .map((li) => li.textContent);
      expect(items).toEqual(
        scheduleLines(election.earlyVoting.schedules[key]).map(
          (line) => `${t.days(line)}: ${t.hours(line.open, line.close)}`,
        ),
      );
    }
    expect(group('abs')).toHaveTextContent('Weekdays, Tuesday, October 20 to Friday, October 30');
    expect(group('abs')).toHaveTextContent('8 a.m. to 4:30 p.m.');
    const source = screen.getByRole('link', { name: 'St. Louis County Board of Elections' });
    expect(source).toHaveAttribute('href', election.earlyVoting.sources[0]);
    expect(
      screen.getByText(
        new RegExp(
          t.lastVerified(formatLongDate(election.earlyVoting.lastVerified, { year: true })),
        ),
      ),
    ).toBeInTheDocument();
  });

  it('links to mail-in and absentee ballot information in How to vote and on the county site', async () => {
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    await list();
    expect(screen.getByRole('link', { name: t.howToVote })).toHaveAttribute('href', '/learn');
    expect(screen.getByRole('link', { name: t.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
  });

  it('links to the absentee topic by its title once that topic exists (#23)', async () => {
    shown.topics = fixtureTopics;
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    await list();
    expect(screen.getByRole('link', { name: 'Fixture absentee topic' })).toHaveAttribute(
      'href',
      '/learn/absentee',
    );
    expect(screen.queryByRole('link', { name: t.howToVote })).toBeNull();
  });

  describe('status by date, in Chicago time', () => {
    it.each([
      [
        'before satellite sites open',
        cdt(10, 19, 12),
        'Open today until 4:30 p.m.',
        'Opens Tuesday, October 20 at 8 a.m.',
      ],
      [
        'a weekday before opening',
        cdt(10, 22, 7),
        'Opens today at 8 a.m.',
        'Opens today at 8 a.m.',
      ],
      ['a Saturday', cdt(10, 24, 10), 'Open today until 1 p.m.', 'Open today until 1 p.m.'],
      [
        'a Sunday',
        cdt(10, 25, 10),
        'Opens Monday, October 26 at 8 a.m.',
        'Opens Monday, October 26 at 8 a.m.',
      ],
      ['Monday, November 2', cst(11, 2, 16), 'Open today until 5 p.m.', 'Open today until 5 p.m.'],
      ['Election Day', cst(11, 3, 7), 'Early voting has ended.', 'Early voting has ended.'],
      ['after the election', cst(11, 10, 12), 'Early voting has ended.', 'Early voting has ended.'],
    ])('%s', async (_, now, boe, abs) => {
      vi.setSystemTime(now);
      render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
      await list();
      expect(group('boe')).toHaveTextContent(boe);
      expect(group('abs')).toHaveTextContent(abs);
    });

    it('updates while the page stays open', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      vi.setSystemTime(cdt(10, 23, 16, 29));
      render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
      await list();
      expect(group('abs')).toHaveTextContent('Open today until 4:30 p.m.');
      act(() => vi.advanceTimersByTime(60_000));
      await waitFor(() =>
        expect(group('abs')).toHaveTextContent('Opens Saturday, October 24 at 9 a.m.'),
      );
    });
  });
});

// The current line counts on the card (#105), with the County fixtures #102
// recorded at 9:00 a.m. Central on Thursday, October 22, and the real #103
// selection and loop.
describe('dates and hours', () => {
  it('folds the County dates and hours away under one summary line (#81)', async () => {
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} />);
    await list();
    const details = screen.getByText(t.seeDates).closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(group('boe'));
    expect(details).toContainElement(group('abs'));
  });
});

describe('line counts', () => {
  const rowsOf = (body) => body.features.map((f) => f.attributes);
  const { county } = election.waitTimes;
  const RECORDED = cdt(10, 22, 9);
  const STALE_SHIFT_MS = (election.waitTimes.maxAgeMinutes + 60) * 60_000;
  const COUNT_TEXT = /in line, reported/;
  const countyFresh = async () => selectCountyWaits(rowsOf(countyFreshBody), sites.features);
  const countyEmpty = async () => selectCountyWaits(rowsOf(countyEmptyBody), sites.features);
  // The fresh recording with every report moved back past the max age, as
  // e2e/fixtures.js builds its stale County state.
  const countyStale = async () =>
    selectCountyWaits(
      rowsOf(countyFreshBody).map((row) => ({
        ...row,
        [county.timeField]: row[county.timeField] - STALE_SHIFT_MS,
      })),
      sites.features,
    );
  const store = (fetcher) => createWaitTimesStore({ county: fetcher, city: null });
  const seeAll = () => screen.queryByRole('link', { name: t.waits.seeAll });
  const sortGroup = () => screen.queryByRole('radiogroup', { name: waitCopy.sort.legend });
  const items = async () => within(await list()).getAllByRole('listitem');

  beforeEach(() => {
    vi.setSystemTime(RECORDED);
  });

  it("shows each listed site's fresh count, unit, time and board", async () => {
    const entries = await countyFresh();
    const byKey = new Map(entries.map((e) => [e.siteId, e]));
    const user = userEvent.setup();
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={store(countyFresh)} />);
    await list();
    await user.click(screen.getByRole('button', { name: t.showAll(sites.features.length) }));
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT)).toHaveLength(entries.length));
    const rows = nearestPolls(sites, ORIGIN);
    const lis = await items();
    rows.forEach((row, i) => {
      const entry = byKey.get(row.waitKey);
      if (entry) {
        expect(lis[i]).toHaveTextContent(
          waitCopy.count(entry.value, reportedTimeParts(entry).time),
        );
        expect(lis[i]).toHaveTextContent(waitCopy.reportedBy(county.source));
      } else {
        expect(lis[i]).not.toHaveTextContent(COUNT_TEXT);
      }
      // No per-row "no count" noise.
      expect(lis[i]).not.toHaveTextContent(waitCopy.noCount);
    });
    expect(screen.queryByText(t.waits.none)).toBeNull();
  });

  it.each([
    ['empty', countyEmpty],
    ['stale', countyStale],
  ])('says once that there are no current counts when the data is %s', async (_, fetcher) => {
    const getWaits = vi.fn(fetcher);
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={store(getWaits)} />);
    await list();
    expect(await screen.findAllByText(t.waits.none)).toHaveLength(1);
    expect(getWaits).toHaveBeenCalled();
    expect(screen.queryByText(COUNT_TEXT)).toBeNull();
    expect(screen.queryByText(waitCopy.noCount)).toBeNull();
  });

  it('shows no counts on a day every site is closed, and says so once', async () => {
    // Sunday, October 25: no site opens.
    vi.setSystemTime(cdt(10, 25, 10));
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={store(countyFresh)} />);
    await list();
    expect(await screen.findAllByText(t.waits.none)).toHaveLength(1);
    expect(screen.queryByText(COUNT_TEXT)).toBeNull();
    expect(group('abs')).toHaveTextContent('Opens Monday, October 26 at 8 a.m.');
  });

  it("leaves the link to every site's wait to the summary while early voting runs (#81)", async () => {
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={store(countyEmpty)} />);
    await list();
    expect(seeAll()).toBeNull();
  });

  it('before early voting starts: the link, but no counts, sort or no-count line', async () => {
    vi.setSystemTime(cdt(9, 1, 10));
    const getWaits = vi.fn(countyFresh);
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={store(getWaits)} />);
    await list();
    expect(seeAll()).toHaveAttribute('href', '/early-voting');
    expect(sortGroup()).toBeNull();
    expect(screen.queryByText(t.waits.none)).toBeNull();
    expect(getWaits).not.toHaveBeenCalled();
  });

  it('after early voting ends: no wait UI, and no line count requests', async () => {
    vi.setSystemTime(cst(11, 3, 7));
    const getWaits = vi.fn(countyFresh);
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={store(getWaits)} />);
    await list();
    expect(seeAll()).toBeNull();
    expect(sortGroup()).toBeNull();
    expect(screen.queryByText(t.waits.none)).toBeNull();
    expect(screen.queryByText(COUNT_TEXT)).toBeNull();
    expect(getWaits).not.toHaveBeenCalled();
  });

  it('sorts nearest first by default, and by shortest line within the nearby miles on request', async () => {
    const entries = await countyFresh();
    const user = userEvent.setup();
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={store(countyFresh)} />);
    await list();
    await waitFor(() => expect(screen.queryByText(t.waits.none)).toBeNull());
    const nearest = screen.getByRole('radio', { name: t.waits.nearest });
    expect(nearest).toBeChecked();
    expect(rowNames(await list())).toEqual(
      nearestPolls(sites, ORIGIN)
        .slice(0, COUNT)
        .map((r) => r.name),
    );

    // By keyboard: arrow from the default to the other option.
    nearest.focus();
    await user.keyboard('{ArrowDown}');
    const nearby = screen.getByRole('radio', { name: waitCopy.sort.nearby(NEARBY_MILES) });
    expect(nearby).toBeChecked();

    const byKey = new Map(entries.map((e) => [e.siteId, e]));
    const now = Date.now();
    const expected = orderSites(
      nearestPolls(sites, ORIGIN).map((row) => ({ ...row, wait: byKey.get(row.waitKey) ?? null })),
      {
        sort: 'nearby',
        waitOf: (row) => row.wait?.value ?? null,
        isOpen: (row) =>
          earlyVotingStatus(election.earlyVoting.schedules[row.absType], now, election.timeZone)
            .kind === 'openNow',
      },
    );
    expect(rowNames(await list())).toEqual(expected.slice(0, COUNT).map((r) => r.name));
  });

  // A source the test controls: each emit is one 30 s refresh's answer.
  function manualSource(waits) {
    let state = snapshot(waits);
    const listeners = new Set();
    function snapshot(list) {
      const part = { status: 'ok', refreshFailed: false, checkedAt: Date.now(), waits: list };
      const off = { status: 'off', refreshFailed: false, checkedAt: null, waits: [] };
      return { waits: list, county: part, city: off };
    }
    return {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => state,
      getServerSnapshot: () => state,
      emit(list) {
        state = snapshot(list);
        for (const listener of listeners) listener();
      },
    };
  }

  const entryFor = (row, value) => ({
    siteId: row.waitKey,
    jurisdiction: 'county',
    unit: county.unit,
    value,
    reportedAt: new Date(Date.now() - 60_000),
    source: county.source,
    openUntil: cdt(10, 22, 16, 30),
  });

  // The two nearest sites, both open at 9 a.m. on a weekday and within the
  // nearby miles.
  const [a, b] = nearestPolls(sites, ORIGIN);

  it('keeps focus on a row link when a refresh changes its value', async () => {
    const source = manualSource([entryFor(a, 3)]);
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={source} />);
    const [first] = await items();
    const link = within(first).getAllByRole('link')[0];
    act(() => link.focus());
    act(() => source.emit([entryFor(a, 12)]));
    expect(first).toHaveTextContent(waitCopy.count(12, reportedTimeParts(entryFor(a, 12)).time));
    expect(link).toHaveFocus();
  });

  it('holds the row order while focus is in the list, and applies it once focus leaves', async () => {
    expect(a.miles).toBeLessThanOrEqual(NEARBY_MILES);
    expect(b.miles).toBeLessThanOrEqual(NEARBY_MILES);
    const user = userEvent.setup();
    const source = manualSource([entryFor(a, 1), entryFor(b, 20)]);
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={source} />);
    await list();
    await user.click(screen.getByRole('radio', { name: waitCopy.sort.nearby(NEARBY_MILES) }));
    expect(rowNames(await list()).slice(0, 2)).toEqual([a.name, b.name]);

    const link = within((await items())[0]).getAllByRole('link')[0];
    act(() => link.focus());
    act(() => source.emit([entryFor(a, 20), entryFor(b, 1)]));
    // The values change in place; the order holds and focus stays.
    expect(rowNames(await list()).slice(0, 2)).toEqual([a.name, b.name]);
    expect(link).toHaveFocus();
    expect((await items())[0]).toHaveTextContent(/About 20 people in line/);

    // Focus leaves the list: the new order applies.
    act(() => screen.getByRole('radio', { name: waitCopy.sort.nearby(NEARBY_MILES) }).focus());
    expect(rowNames(await list()).slice(0, 2)).toEqual([b.name, a.name]);
  });

  it('shows no sort or no-count line when the County source is off in the config', async () => {
    render(
      <EarlyVotingCard
        code="CC007"
        origin={ORIGIN}
        waitSource={createWaitTimesStore({ county: null, city: null })}
      />,
    );
    await list();
    expect(sortGroup()).toBeNull();
    expect(screen.queryByText(t.waits.none)).toBeNull();
  });

  it('lets go of a held order when the focused row leaves the list without a blur', async () => {
    const user = userEvent.setup();
    const source = manualSource([entryFor(a, 1), entryFor(b, 20)]);
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={source} />);
    await list();
    await user.click(screen.getByRole('radio', { name: waitCopy.sort.nearby(NEARBY_MILES) }));
    const link = within((await items())[0]).getAllByRole('link')[0];
    act(() => link.focus());
    // Focus goes elsewhere with no blur reaching the list, as when the focused
    // row is removed from the page.
    const outside = document.createElement('button');
    document.body.append(outside);
    const blur = (event) => event.stopPropagation();
    link.addEventListener('focusout', blur);
    act(() => outside.focus());
    link.removeEventListener('focusout', blur);
    act(() => source.emit([entryFor(a, 20), entryFor(b, 1)]));
    await waitFor(() =>
      expect(rowNames(screen.getByRole('list', { name: t.listLabel })).slice(0, 2)).toEqual([
        b.name,
        a.name,
      ]),
    );
    outside.remove();
  });

  it('keeps the held order when the window loses focus with a row link still focused', async () => {
    const user = userEvent.setup();
    const source = manualSource([entryFor(a, 1), entryFor(b, 20)]);
    render(<EarlyVotingCard code="CC007" origin={ORIGIN} waitSource={source} />);
    await list();
    await user.click(screen.getByRole('radio', { name: waitCopy.sort.nearby(NEARBY_MILES) }));
    const link = within((await items())[0]).getAllByRole('link')[0];
    act(() => link.focus());
    // Switching apps: a blur with no new target, and the link stays the
    // document's active element.
    act(() =>
      link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })),
    );
    expect(link).toHaveFocus();
    act(() => source.emit([entryFor(a, 20), entryFor(b, 1)]));
    expect(rowNames(await list()).slice(0, 2)).toEqual([a.name, b.name]);
  });
});
