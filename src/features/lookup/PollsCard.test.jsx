import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import { getPolls, getPrecinctGeometry } from '../../data/arcgis.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import PollsCard from './PollsCard.jsx';
import { copy, formatTime } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({ getPolls: vi.fn(), getPrecinctGeometry: vi.fn() }));

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

  it('says any polling place in the county works, with its source', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    const note = screen.getByText(copy.polls.voteAnywhere).closest('p');
    expect(within(note).getByRole('link')).toHaveAttribute(
      'href',
      election.voteAnywhere.sources[0],
    );
  });

  it('shows hidden skeleton lines while loading', () => {
    getPolls.mockReturnValue(new Promise(() => {}));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    expect(screen.getByTestId('polls-skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('list')).toBeNull();
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
