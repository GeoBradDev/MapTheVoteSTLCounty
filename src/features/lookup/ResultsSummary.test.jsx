// The answer-first summary at the top of a County precinct's results (#81).
// Dates are built from numbers, never ISO literals: the hardcoding test scans
// this file.
import { render, screen, waitFor, within } from '@testing-library/react';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import countyFreshBody from '../../../docs/raw/fixtures/county-waits-fresh.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import {
  getAbsenteeSites,
  getCityWaits,
  getCountyWaits,
  getPolls,
  getPrecinctGeometry,
} from '../../data/arcgis.js';
import { selectCountyWaits } from '../../data/waitTimes.js';
import { createWaitTimesStore } from '../waitTimes/useWaitTimes.js';
import { copy as waitCopy } from '../waitTimes/waitTimesCopy.js';
import { earlyVotingStatus, formatLongDate } from './earlyVoting.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import { copy, formatTime } from './resultsCopy.js';
import ResultsSummary from './ResultsSummary.jsx';

vi.mock('../../data/arcgis.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getPolls: vi.fn(),
    getAbsenteeSites: vi.fn(),
    getPrecinctGeometry: vi.fn(),
    getCountyWaits: vi.fn(),
    getCityWaits: vi.fn(),
  };
});

const ORIGIN = { lat: 38.66, lng: -90.45 };
const s = () => copy.summary;
const BALLOT_HTML = null;

// Chicago is UTC-5 until November 1, 2026, then UTC-6.
const cdt = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 5, minutes));
const cst = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 6, minutes));

const rowsOf = (body) => body.features.map((f) => f.attributes);
const countyFresh = async () => selectCountyWaits(rowsOf(countyFreshBody), sites.features);
const store = (fetcher) => createWaitTimesStore({ county: fetcher, city: null });

beforeEach(() => {
  getPolls.mockReset().mockResolvedValue(polls);
  getAbsenteeSites.mockReset().mockResolvedValue(sites);
  getPrecinctGeometry.mockReset().mockResolvedValue(geometry.features[0]);
  getCountyWaits.mockReset().mockResolvedValue([]);
  getCityWaits.mockReset().mockResolvedValue([]);
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday, October 22, 9 a.m.: early voting runs, the fresh counts recorded.
  vi.setSystemTime(cdt(10, 22, 9));
});

afterEach(() => {
  vi.useRealTimers();
});

const region = (name) => screen.getByRole('region', { name });
const electionDay = () => region(s().electionDay);

function renderSummary(props = {}) {
  return render(
    <ResultsSummary code="CC007" origin={ORIGIN} showBallot ballotHtml={BALLOT_HTML} {...props} />,
  );
}

describe('ResultsSummary', () => {
  it('states the Election Day date and hours from the config', () => {
    renderSummary();
    const { open, close } = election.electionDayHours;
    expect(electionDay()).toHaveTextContent(
      s().when(formatLongDate(election.electionDate), formatTime(open), formatTime(close)),
    );
  });

  it('says who may still vote at closing time, with the sources of the hours', () => {
    renderSummary();
    const { close, sources } = election.electionDayHours;
    expect(electionDay()).toHaveTextContent(copy.polls.inLine(close));
    for (const source of sources) {
      const host = new URL(source).host;
      expect(
        within(electionDay()).getByRole('link', { name: copy.polls.sourceNames[host] }),
      ).toHaveAttribute('href', source);
    }
  });

  it('names the nearest polling place with its distance, address and directions', async () => {
    renderSummary();
    const [nearest] = nearestPolls(polls, ORIGIN);
    const day = electionDay();
    expect(await within(day).findByText(nearest.name)).toBeInTheDocument();
    expect(day).toHaveTextContent(copy.polls.distance(nearest.miles));
    expect(day).toHaveTextContent(copy.polls.address(nearest.address, nearest.zip));
    const link = within(day).getByRole('link', {
      name: `${copy.polls.directions} ${copy.polls.linkTarget(nearest.name)}`,
    });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  it('measures from the precinct center without a looked-up point, and says so once', async () => {
    renderSummary({ origin: null });
    const [nearest] = nearestPolls(polls, polygonCenter(geometry.features[0].geometry));
    expect(await within(electionDay()).findByText(nearest.name)).toBeInTheDocument();
    expect(screen.getAllByText(copy.polls.fromCenter('CC007'))).toHaveLength(1);
  });

  it('shows no alert of its own when the polling places fail to load', async () => {
    getPolls.mockRejectedValue(new Error('down'));
    renderSummary();
    await waitFor(() => expect(getPolls).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('summary-poll-skeleton')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      within(electionDay()).queryByRole('link', { name: new RegExp(copy.polls.directions) }),
    ).toBeNull();
  });

  it('during early voting, names the nearest site open now with its count and the wait times link', async () => {
    renderSummary({ waitSource: store(countyFresh) });
    const early = region(s().early);
    const entries = await countyFresh();
    const byKey = new Map(entries.map((e) => [e.siteId, e]));
    const now = Date.now();
    const open = nearestPolls(sites, ORIGIN).find(
      (site) =>
        earlyVotingStatus(election.earlyVoting.schedules[site.absType], now, election.timeZone)
          .kind === 'openNow',
    );
    expect(await within(early).findByText(open.name)).toBeInTheDocument();
    expect(early).toHaveTextContent(s().nearestOpen);
    const wait = byKey.get(open.waitKey);
    if (wait) {
      expect(await within(early).findByText(/in line, reported/)).toBeInTheDocument();
      expect(early).toHaveTextContent(waitCopy.reportedBy(wait.source));
    } else {
      expect(await within(early).findByText(waitCopy.noCount)).toBeInTheDocument();
    }
    expect(
      within(early).getByRole('link', { name: copy.earlyVoting.waits.seeAll }),
    ).toHaveAttribute('href', '/early-voting');
  });

  // #27: the count and its board take two lines; the placeholder holds both.
  it('holds two lines for the count while the first counts load', async () => {
    renderSummary({ waitSource: store(() => new Promise(() => {})) });
    const holder = await screen.findByTestId('summary-count-skeleton');
    expect([...holder.children].map((line) => line.className)).toEqual([
      expect.stringContaining('h-6'),
      expect.stringContaining('h-5'),
    ]);
  });

  it("links to every site's wait even when the County count source is off", async () => {
    renderSummary({ waitSource: createWaitTimesStore({ county: null, city: null }) });
    const early = region(s().early);
    expect(
      within(early).getByRole('link', { name: copy.earlyVoting.waits.seeAll }),
    ).toHaveAttribute('href', '/early-voting');
    expect(within(early).queryByText(waitCopy.noCount)).toBeNull();
  });

  it('shows the no-data state when no count is reported for the site', async () => {
    renderSummary({ waitSource: store(async () => []) });
    const early = region(s().early);
    expect(await within(early).findByText(waitCopy.noCount)).toBeInTheDocument();
  });

  it('names the nearest site and when it opens when none is open now', async () => {
    // Thursday, October 22, 6 a.m.: before any site opens.
    vi.setSystemTime(cdt(10, 22, 6));
    renderSummary({ waitSource: store(countyFresh) });
    const early = region(s().early);
    const [nearest] = nearestPolls(sites, ORIGIN);
    expect(await within(early).findByText(nearest.name)).toBeInTheDocument();
    expect(early).toHaveTextContent(s().nearestSite);
    expect(early).toHaveTextContent(/Opens today at/);
    expect(within(early).queryByText(waitCopy.noCount)).toBeNull();
  });

  it('gives no status for a nearest site the schedules do not cover', async () => {
    // Thursday, October 22, 6 p.m.: every site has closed for the day.
    vi.setSystemTime(cdt(10, 22, 18));
    const [nearest] = nearestPolls(sites, ORIGIN);
    const unknown = {
      ...sites,
      features: sites.features.map((f) =>
        f.properties.loc === nearest.loc
          ? { ...f, properties: { ...f.properties, abs_type: 'zzz' } }
          : f,
      ),
    };
    getAbsenteeSites.mockResolvedValue(unknown);
    renderSummary({ waitSource: store(countyFresh) });
    const early = region(s().early);
    expect(await within(early).findByText(nearest.name)).toBeInTheDocument();
    expect(early).not.toHaveTextContent(copy.earlyVoting.status({ kind: 'ended' }));
  });

  it('shows no early voting section and asks no line count layer outside early voting', async () => {
    const fetcher = vi.fn(async () => []);
    // Tuesday, November 10: after Election Day.
    vi.setSystemTime(cst(11, 10, 10));
    renderSummary({ waitSource: store(fetcher) });
    await within(electionDay()).findByRole('link');
    expect(screen.queryByRole('region', { name: s().early })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(getCountyWaits).not.toHaveBeenCalled();
  });

  it('holds the sample ballot section, or none when the precinct has no ballot', () => {
    const { unmount } = renderSummary();
    expect(region(copy.cards.ballot)).toHaveTextContent(copy.ballot.missing);
    unmount();
    renderSummary({ showBallot: false });
    expect(screen.queryByRole('region', { name: copy.cards.ballot })).toBeNull();
    expect(electionDay()).toBeInTheDocument();
  });

  // #27: a placeholder at least the size of what replaces it.
  it('holds room for the early voting site, its status and its count while it loads', () => {
    getAbsenteeSites.mockReturnValue(new Promise(() => {}));
    renderSummary({ waitSource: store(countyFresh) });
    const lines = screen.getByTestId('summary-early-skeleton').children;
    // A label, the name and address, the status, the count and its board,
    // then the directions button.
    expect([...lines].map((line) => line.className)).toEqual([
      expect.stringContaining('h-5'),
      expect.stringContaining('h-6'),
      expect.stringContaining('h-6'),
      expect.stringContaining('h-6'),
      expect.stringContaining('h-6'),
      expect.stringContaining('h-5'),
      expect.stringContaining('h-11'),
    ]);
  });

  it('asks each shared layer once', async () => {
    renderSummary({ waitSource: store(countyFresh) });
    await within(region(s().early)).findAllByRole('link');
    expect(getPolls).toHaveBeenCalledTimes(1);
    expect(getAbsenteeSites).toHaveBeenCalledTimes(1);
  });
});
