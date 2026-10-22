import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import { getPolls, getPrecinctGeometry } from '../../data/arcgis.js';
import { fixtureTopics } from '../../test/learnFixtures.js';
import { copy as ruleCopy } from './assignedPollingPlaceCopy.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import PollsCard from './PollsCard.jsx';
import { createPrecinctMap } from './precinctMapView.js';
import { copy, formatTime } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({ getPolls: vi.fn(), getPrecinctGeometry: vi.fn() }));
vi.mock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));

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
const IPHONE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  platform: 'iPhone',
  maxTouchPoints: 5,
};

beforeEach(() => {
  getPolls.mockReset().mockResolvedValue(polls);
  getPrecinctGeometry.mockReset().mockResolvedValue(geometry.features[0]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  shown.topics = [];
});

const list = () => screen.findByRole('list', { name: copy.polls.listLabel });
const rowNames = (ol) =>
  within(ol)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

describe('PollsCard', () => {
  it('lists the nearest polling places to the looked-up point, nearest first', async () => {
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await list();
    const expected = nearestPolls(polls, ORIGIN).slice(0, COUNT);
    expect(rowNames(ol)).toEqual(expected.map((r) => r.name));
    expect(getPrecinctGeometry).not.toHaveBeenCalled();
    expect(screen.queryByText(copy.polls.fromCenter('CC007'))).toBeNull();
  });

  it('keeps list markers, so Safari still reads the places as a list', async () => {
    // WebKit drops the list role from a list styled with list-style: none,
    // which Tailwind's preflight sets on every ol.
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    expect(await list()).toHaveClass('list-decimal');
  });

  it('shows each place with its address, ZIP, distance and directions', async () => {
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await list();
    const [first] = nearestPolls(polls, ORIGIN);
    const row = within(ol).getAllByRole('listitem')[0];
    expect(within(row).getByRole('heading', { level: 3 })).toHaveTextContent(first.name);
    expect(row).toHaveTextContent(copy.polls.address(first.address, first.zip));
    expect(row).toHaveTextContent(first.zip);
    expect(row).toHaveTextContent(copy.polls.distance(first.miles));
    const link = within(row).getByRole('link', {
      name: `${copy.polls.directions} ${copy.polls.linkTarget(first.name)}`,
    });
    expect(link.getAttribute('href')).toMatch(
      /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d+%2C-?\d+\.\d+$/,
    );
    // No Apple Maps link off iOS.
    expect(within(row).queryByRole('link', { name: new RegExp(copy.polls.appleMaps) })).toBeNull();
  });

  it('offers Apple Maps too on iOS', async () => {
    vi.stubGlobal('navigator', { ...navigator, ...IPHONE });
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await list();
    const [first] = nearestPolls(polls, ORIGIN);
    const row = within(ol).getAllByRole('listitem')[0];
    const apple = within(row).getByRole('link', {
      name: `${copy.polls.appleMaps} ${copy.polls.linkTarget(first.name)}`,
    });
    expect(apple.getAttribute('href')).toMatch(/^https:\/\/maps\.apple\.com\/\?daddr=/);
    expect(
      within(row).getByRole('link', { name: new RegExp(`^${copy.polls.directions}`) }),
    ).toBeInTheDocument();
  });

  it('measures from the precinct center without a looked-up point, and says so', async () => {
    render(<PollsCard code="CC007" origin={null} />);
    const ol = await list();
    expect(getPrecinctGeometry).toHaveBeenCalledWith('CC007');
    const center = polygonCenter(geometry.features[0].geometry);
    const expected = nearestPolls(polls, center).slice(0, COUNT);
    expect(rowNames(ol)).toEqual(expected.map((r) => r.name));
    expect(screen.getByText(copy.polls.fromCenter('CC007'))).toBeInTheDocument();
  });

  it('shows more places on request, moves focus to the first new one, and stops at the end', async () => {
    const few = { ...polls, features: polls.features.slice(0, COUNT * 2 + 1) };
    getPolls.mockResolvedValue(few);
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const ol = await list();
    expect(within(ol).getAllByRole('listitem')).toHaveLength(COUNT);
    const more = screen.getByRole('button', { name: copy.polls.showMore });

    await userEvent.click(more);
    let items = within(ol).getAllByRole('listitem');
    expect(items).toHaveLength(COUNT * 2);
    expect(within(items[COUNT]).getByRole('heading', { level: 3 })).toHaveFocus();

    await userEvent.click(more);
    items = within(ol).getAllByRole('listitem');
    expect(items).toHaveLength(COUNT * 2 + 1);
    expect(within(items[COUNT * 2]).getByRole('heading', { level: 3 })).toHaveFocus();
    expect(screen.queryByRole('button', { name: copy.polls.showMore })).toBeNull();
  });

  it('has no Show more button when every place already fits', async () => {
    getPolls.mockResolvedValue({ ...polls, features: polls.features.slice(0, COUNT) });
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    await list();
    expect(screen.queryByRole('button', { name: copy.polls.showMore })).toBeNull();
  });

  it('shows Election Day hours from the config, the in-line rule and its sources', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const { open, close, sources } = election.electionDayHours;
    const hours = screen.getByText(copy.polls.hoursLabel).closest('p');
    expect(hours).toHaveTextContent(copy.polls.hours(open, close));
    expect(hours).toHaveTextContent(formatTime(open));
    expect(screen.getByText(copy.polls.inLine(close))).toBeInTheDocument();
    for (const source of sources) {
      const host = new URL(source).host;
      expect(screen.getByRole('link', { name: copy.polls.sourceNames[host] })).toHaveAttribute(
        'href',
        source,
      );
    }
  });

  it('says Election Day voters must use their assigned polling place, with sources (#72)', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PollsCard code="CC007" origin={ORIGIN} />);
    expect(screen.getByText(ruleCopy.rule)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: election.electionDayPollingPlace.phone }),
    ).toBeInTheDocument();
    for (const url of election.electionDayPollingPlace.sources) {
      expect(
        screen.getByRole('link', { name: ruleCopy.sourceNames[new URL(url).host] }),
      ).toHaveAttribute('href', url);
    }
    expect(container).not.toHaveTextContent(/any polling place/i);
  });

  it('says the nearest places may not include the assigned one, before the list (#72)', async () => {
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const note = screen.getByText(copy.polls.nearestNote);
    const list = await screen.findByRole('list', { name: copy.polls.listLabel });
    // The note comes first in reading order.
    expect(note.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the nearest-places note when there is no looked-up point', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={null} />);
    expect(screen.getByText(copy.polls.nearestNote)).toBeInTheDocument();
  });

  it('drops the nearest-places note, but keeps the rule, when no places are listed', async () => {
    getPolls.mockRejectedValue(new Error('down'));
    const { unmount } = render(<PollsCard code="CC007" origin={ORIGIN} />);
    await screen.findByText(copy.polls.failed, { exact: false });
    expect(screen.queryByText(copy.polls.nearestNote)).toBeNull();
    expect(screen.getByText(ruleCopy.rule)).toBeInTheDocument();
    unmount();
    getPolls.mockResolvedValue({ ...polls, features: [] });
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    await screen.findByText(copy.polls.none, { exact: false });
    expect(screen.queryByText(copy.polls.nearestNote)).toBeNull();
    expect(screen.getByText(ruleCopy.rule)).toBeInTheDocument();
  });

  it('gives links to different pages different names (#72)', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const hrefByName = new Map();
    for (const link of screen.getAllByRole('link')) {
      const name = link.textContent;
      if (hrefByName.has(name)) expect(link.getAttribute('href')).toBe(hrefByName.get(name));
      hrefByName.set(name, link.getAttribute('href'));
    }
  });

  it('points to early voting for voting in person before Election Day (#72)', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    expect(screen.getByText(copy.polls.earlyVotingPointer)).toBeInTheDocument();
  });

  it('links to the voter ID topic by its title once that topic exists (#23)', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    shown.topics = fixtureTopics;
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const link = screen.getByRole('link', { name: 'Fixture ID topic' });
    expect(link).toHaveAttribute('href', '/learn/voter-id');
    expect(link.closest('p')).toHaveTextContent(copy.polls.beforeYouGo);
  });

  it('has no voter ID link while that topic does not exist', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    expect(screen.queryByText(copy.polls.beforeYouGo)).toBeNull();
    expect(screen.queryByRole('link', { name: /ID/ })).toBeNull();
  });

  it('shows hidden skeleton lines while loading', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    expect(screen.getByTestId('polls-skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('list')).toBeNull();
  });

  // #27: the skeleton holds the list's place, so the page does not jump.
  it('shapes the skeleton like the first rows of the list', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const rows = screen.getByTestId('polls-skeleton').children;
    expect(rows).toHaveLength(COUNT);
    for (const row of rows) {
      // A name, an address and a distance line, then a row of links.
      expect([...row.children].map((c) => c.className)).toEqual([
        expect.stringContaining('h-6'),
        expect.stringContaining('h-6'),
        expect.stringContaining('h-6'),
        expect.stringContaining('min-h-11'),
      ]);
    }
  });

  it('says distances are from the center while loading too, without a looked-up point', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={null} />);
    expect(screen.getByText(copy.polls.fromCenter('CC007'))).toBeInTheDocument();
  });

  it('drops the center line when the places fail to load or none are found', async () => {
    getPolls.mockRejectedValue(new Error('down'));
    const { unmount } = render(<PollsCard code="CC007" origin={null} />);
    await screen.findByText(copy.polls.failed, { exact: false });
    expect(screen.queryByText(copy.polls.fromCenter('CC007'))).toBeNull();
    unmount();
    getPolls.mockResolvedValue({ ...polls, features: [] });
    render(<PollsCard code="CC007" origin={null} />);
    await screen.findByText(copy.polls.none, { exact: false });
    expect(screen.queryByText(copy.polls.fromCenter('CC007'))).toBeNull();
  });

  it('says the polling places failed to load, with the official lookup', async () => {
    getPolls.mockRejectedValue(new Error('down'));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const message = await screen.findByText(copy.polls.failed, { exact: false });
    expect(within(message).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.queryByTestId('polls-skeleton')).toBeNull();
  });

  it('says it failed when the precinct outline cannot be loaded or has no center', async () => {
    getPrecinctGeometry.mockResolvedValue({ type: 'Feature', geometry: null, properties: {} });
    render(<PollsCard code="CC007" origin={null} />);
    expect(await screen.findByText(copy.polls.failed, { exact: false })).toBeInTheDocument();
  });

  it('says none were found when no place has coordinates', async () => {
    getPolls.mockResolvedValue({ ...polls, features: [] });
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const message = await screen.findByText(copy.polls.none, { exact: false });
    expect(within(message).getByRole('link', { name: copy.officialLookup })).toBeInTheDocument();
  });

  describe('map', () => {
    let view;
    const mapRegion = () => screen.queryByRole('region', { name: copy.map.label('CC007') });
    const points = (places) => places.map(({ lat, lng }) => ({ lat, lng }));

    beforeEach(() => {
      vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
      view = { setPolls: vi.fn(), remove: vi.fn() };
      createPrecinctMap.mockReset().mockReturnValue(view);
    });

    it('maps the listed places in list order, and the looked-up point', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      await list();
      await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
      const { origin, polls: mapped } = createPrecinctMap.mock.calls[0][1];
      expect(origin).toEqual(ORIGIN);
      expect(points(mapped)).toEqual(points(nearestPolls(polls, ORIGIN).slice(0, COUNT)));
      expect(mapRegion()).toBeInTheDocument();
    });

    it('adds the places "Show more" reveals', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      await list();
      await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
      await userEvent.click(screen.getByRole('button', { name: copy.polls.showMore }));
      const last = view.setPolls.mock.calls.at(-1)[0];
      expect(points(last)).toEqual(points(nearestPolls(polls, ORIGIN).slice(0, COUNT * 2)));
    });

    // #27: the list comes first; the map follows it and its Show more button.
    it('comes after the list and its Show more button', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      const ol = await list();
      const more = screen.getByRole('button', { name: copy.polls.showMore });
      const follows = (a, b) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(follows(ol, more)).toBe(true);
      expect(follows(more, mapRegion())).toBe(true);
    });

    it('is not shown when the polling places fail to load', async () => {
      getPolls.mockRejectedValue(new Error('down'));
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      await screen.findByText(new RegExp(copy.polls.failed));
      expect(mapRegion()).toBeNull();
    });

    it('keeps the list when the map fails', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      const ol = await list();
      await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
      createPrecinctMap.mock.calls[0][1].onFail(new Error('tiles'));
      await waitFor(() => expect(mapRegion()).toBeNull());
      expect(ol).toBeInTheDocument();
      expect(within(ol).getAllByRole('listitem')).toHaveLength(COUNT);
    });
  });

  // A tab left open past the max age refreshes when the voter returns (#84).
  describe('refresh on return to the tab', () => {
    const MINUTE = 60_000;
    // Ten days before Election Day, at 10 a.m. in Chicago (UTC-5 before
    // November 1), built from the config so no date is written here.
    const [year, month, day] = election.electionDate.split('-').map(Number);
    const start = Date.UTC(year, month - 1, day - 10, 15);
    const stale = start + election.layerMaxAge.minutes * MINUTE + 1;
    // The same layer with the nearest place gone, as after a relocation.
    const nearest = nearestPolls(polls, ORIGIN)[0];
    const moved = {
      ...polls,
      features: polls.features.filter((f) => f.properties.name !== nearest.name),
    };
    let visibility;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(start);
      visibility = 'visible';
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
      getPolls.mockResolvedValue({ ...polls, loadedAt: start });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const leaveAndReturn = async (at) => {
      visibility = 'hidden';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      vi.setSystemTime(at);
      visibility = 'visible';
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    };

    it('shows the current list after the voter returns past the max age', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      expect(rowNames(await list())).toContain(nearest.name);
      getPolls.mockResolvedValue({ ...moved, loadedAt: stale });
      await leaveAndReturn(stale);
      await waitFor(() =>
        expect(rowNames(screen.getByRole('list', { name: copy.polls.listLabel }))).not.toContain(
          nearest.name,
        ),
      );
      expect(getPolls).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('polls-skeleton')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('does not fetch again when the list is still fresh', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      await list();
      await leaveAndReturn(start + MINUTE);
      expect(getPolls).toHaveBeenCalledTimes(1);
    });

    it('keeps the list and the extra rows shown when the refresh fails, and says when it loaded', async () => {
      const user = userEvent.setup();
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      await list();
      await user.click(screen.getByRole('button', { name: copy.polls.showMore }));
      const before = rowNames(await list());
      expect(before).toHaveLength(2 * COUNT);
      getPolls.mockRejectedValue(new Error('down'));
      await leaveAndReturn(stale);
      const note = await screen.findByRole('status');
      expect(note).toHaveTextContent(copy.polls.staleNote('10:00', null));
      expect(rowNames(await list())).toEqual(before);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(getPolls).toHaveBeenCalledTimes(2);
    });

    it('drops the note once a later refresh succeeds', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      await list();
      getPolls.mockRejectedValue(new Error('down'));
      await leaveAndReturn(stale);
      await screen.findByRole('status');
      getPolls.mockResolvedValue({ ...moved, loadedAt: stale + MINUTE });
      await leaveAndReturn(stale + MINUTE);
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
      expect(rowNames(await list())).not.toContain(nearest.name);
    });

    it('names the day as well when the list loaded on an earlier day', async () => {
      render(<PollsCard code="CC007" origin={ORIGIN} />);
      await list();
      getPolls.mockRejectedValue(new Error('down'));
      await leaveAndReturn(start + 24 * 60 * MINUTE);
      const note = await screen.findByRole('status');
      // The start time is 15:00 UTC, the same date in Chicago.
      const loadedOn = new Date(start).toISOString().slice(0, 10);
      expect(note).toHaveTextContent(copy.polls.staleNote('10:00', loadedOn));
    });
  });

  it('drops a result that arrives after it unmounts', async () => {
    let resolve;
    getPolls.mockReturnValue(new Promise((r) => (resolve = r)));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<PollsCard code="CC007" origin={ORIGIN} />);
    unmount();
    resolve(polls);
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('formatTime', () => {
  it.each([
    ['06:00', '6 a.m.'],
    ['19:00', '7 p.m.'],
    ['16:30', '4:30 p.m.'],
    ['12:00', '12 p.m.'],
    ['00:05', '12:05 a.m.'],
  ])('%s reads %s', (time, expected) => {
    expect(formatTime(time)).toBe(expected);
  });
});

describe('polls copy', () => {
  it('ends the hours line with one period, after a p.m. time', () => {
    expect(copy.polls.hours('06:00', '19:00')).toBe('6 a.m. to 7 p.m.');
    expect(copy.polls.hours('06:00', '19:30')).toBe('6 a.m. to 7:30 p.m.');
  });

  it('formats distances to one decimal', () => {
    expect(copy.polls.distance(0.01)).toBe('Less than 0.1 miles away');
    expect(copy.polls.distance(1.04)).toBe('1.0 mile away');
    expect(copy.polls.distance(2.944)).toBe('2.9 miles away');
  });

  it('joins the street and ZIP, leaving out what is missing', () => {
    expect(copy.polls.address('212 Utz Ln', '63042')).toBe('212 Utz Ln, MO 63042');
    expect(copy.polls.address(null, '63042')).toBe('MO 63042');
    expect(copy.polls.address('212 Utz Ln', null)).toBe('212 Utz Ln');
  });
});
