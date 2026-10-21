// Dates are built from numbers, never ISO literals: the hardcoding test scans
// this file.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import { getAbsenteeSites, getPrecinctGeometry } from '../../data/arcgis.js';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import { formatLongDate, scheduleLines } from './earlyVoting.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import { copy } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({
  getAbsenteeSites: vi.fn(),
  getPrecinctGeometry: vi.fn(),
}));

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
  // Only the clock: promises and React's timers run for real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(cdt(10, 21, 10));
});

afterEach(() => {
  vi.useRealTimers();
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

  it('measures from the precinct center without a looked-up point, and says so', async () => {
    render(<EarlyVotingCard code="CC007" origin={null} />);
    const ol = await list();
    const center = polygonCenter(geometry.features[0].geometry);
    const expected = nearestPolls(sites, center).slice(0, COUNT);
    expect(rowNames(ol)).toEqual(expected.map((r) => r.name));
    expect(getPrecinctGeometry).toHaveBeenCalledWith('CC007');
    expect(screen.getByText(copy.polls.fromCenter('CC007'))).toBeInTheDocument();
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
