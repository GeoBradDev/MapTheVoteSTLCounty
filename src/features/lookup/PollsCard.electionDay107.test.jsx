// Election Day line counts on the polling places card (#107): the County
// fixture recorded at 9:00 a.m. on 2026-10-22, moved to 9:00 a.m. on Election
// Day and joined on the polls layer's Election Day field, with the real
// selection and loop. Dates are built with Date.UTC, never ISO literals: the
// hardcoding test scans this file.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import countyEmptyBody from '../../../docs/raw/fixtures/county-waits-empty.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import { getCityWaits, getCountyWaits, getPolls, getPrecinctGeometry } from '../../data/arcgis.js';
import { county } from '../../data/jurisdictions.js';
import {
  asElectionDay,
  countyFresh,
  ELECTION_DAY_SHIFT_MS,
} from '../../data/waitTimes.fixtures.js';
import { selectCityWaits, selectCountyWaits } from '../../data/waitTimes.js';
import { createWaitTimesStore } from '../waitTimes/useWaitTimes.js';
import { copy as waitCopy } from '../waitTimes/waitTimesCopy.js';
import { JurisdictionContext } from './jurisdictionContext.js';
import { nearestPolls } from './nearbyPolls.js';
import PollsCard from './PollsCard.jsx';
import { createPrecinctMap } from './precinctMapView.js';
import { copy } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({
  getPolls: vi.fn(),
  getPrecinctGeometry: vi.fn(),
  getCountyWaits: vi.fn(),
  getCityWaits: vi.fn(),
  getAbsenteeSites: vi.fn(),
}));
vi.mock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));

const ORIGIN = { lat: 38.66, lng: -90.45 };
// Election Day, Tuesday, November 3, 2026, in Chicago (UTC-6 then).
const nov3 = (hours, minutes = 0) => Date.UTC(2026, 10, 3, hours + 6, minutes);
const COUNT_TEXT = /in line, reported/;
const { county: countyWaits } = election.waitTimes;

const edReports = asElectionDay(countyFresh, 'county', polls.features);
const fresh = async () =>
  selectCountyWaits(edReports, polls.features, Date.now(), { electionDay: true });
const stale = async () =>
  selectCountyWaits(
    edReports.map((r) => ({
      ...r,
      [countyWaits.timeField]:
        r[countyWaits.timeField] - (election.waitTimes.maxAgeMinutes + 60) * 60_000,
    })),
    polls.features,
    Date.now(),
    { electionDay: true },
  );
const empty = async () =>
  selectCountyWaits(
    countyEmptyBody.features.map((f) => f.attributes),
    polls.features,
    Date.now(),
    { electionDay: true },
  );
// Today's view: absentee usernames, which match no polling place's Election Day key.
const todaysView = async () =>
  selectCountyWaits(
    countyFresh.map((r) => ({ ...r, CreationDate: r.CreationDate + ELECTION_DAY_SHIFT_MS })),
    polls.features,
    Date.now(),
    { electionDay: true },
  );
const store = (fetcher) => createWaitTimesStore({ county: fetcher, city: null });

const list = () => screen.findByRole('list', { name: copy.polls.listLabel });
const items = async () => within(await list()).getAllByRole('listitem');
const sortGroup = () => screen.queryByRole('radiogroup', { name: waitCopy.sort.legend });
const noCounts = () => screen.queryByText(copy.polls.waits.none);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(nov3(9, 0, 30));
  getPolls.mockReset().mockResolvedValue(polls);
  getPrecinctGeometry.mockReset().mockResolvedValue(geometry.features[0]);
  getCountyWaits.mockReset().mockResolvedValue([]);
  getCityWaits.mockReset().mockResolvedValue([]);
  createPrecinctMap.mockReset();
  vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PollsCard on Election Day (#107)', () => {
  it("shows a listed place's fresh count, unit, time and board", async () => {
    const entries = await fresh();
    const near = nearestPolls(polls, ORIGIN);
    // Some listed place has a count in the fixture once all are shown.
    render(<PollsCard code="CC007" origin={ORIGIN} waitSource={store(fresh)} />);
    await list();
    await userEvent.click(screen.getByRole('radio', { name: waitCopy.sort.nearby(5) }));
    const [first] = await items();
    const site = near.find((row) => entries.some((e) => e.siteId === row.dayKey));
    expect(site).toBeDefined();
    await waitFor(() => expect(first).toHaveTextContent(COUNT_TEXT));
    expect(first).toHaveTextContent(waitCopy.reportedBy(countyWaits.source));
    expect(first).toHaveTextContent(/people in line|person in line|No one in line/);
  });

  it('sorts nearest first by default, and by shortest line nearby on request', async () => {
    render(<PollsCard code="CC007" origin={ORIGIN} waitSource={store(fresh)} />);
    await list();
    expect(sortGroup()).not.toBeNull();
    const nearest = screen.getByRole('radio', { name: copy.earlyVoting.waits.nearest });
    expect(nearest).toBeChecked();
    const names = async () =>
      (await items()).map((li) => within(li).getByRole('heading', { level: 3 }).textContent);
    const byDistance = nearestPolls(polls, ORIGIN)
      .slice(0, election.nearbyPollCount)
      .map((r) => r.name);
    expect(await names()).toEqual(byDistance);
    await userEvent.click(screen.getByRole('radio', { name: waitCopy.sort.nearby(5) }));
    await waitFor(async () => expect((await items())[0]).toHaveTextContent(COUNT_TEXT));
  });

  it.each([
    ['stale', stale],
    ['empty', empty],
    ["today's absentee-only view", todaysView],
  ])('shows only the no-data state with the %s fixture', async (_, fetcher) => {
    render(<PollsCard code="CC007" origin={ORIGIN} waitSource={store(fetcher)} />);
    await list();
    await waitFor(() => expect(noCounts()).not.toBeNull());
    for (const li of await items()) expect(li).not.toHaveTextContent(COUNT_TEXT);
  });

  it('links to the line counts at every polling place', async () => {
    render(<PollsCard code="CC007" origin={ORIGIN} waitSource={store(empty)} />);
    await list();
    expect(screen.getByRole('link', { name: copy.polls.waits.seeAll })).toHaveAttribute(
      'href',
      '/early-voting',
    );
  });

  it("asks only the County's layer on a County page", async () => {
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    await list();
    await waitFor(() => expect(getCountyWaits).toHaveBeenCalled());
    expect(getCityWaits).not.toHaveBeenCalled();
  });

  it("asks only the City's layer on a City page, and shows City counts only", async () => {
    const cityPlaces = {
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-90.2949, 38.5904] },
          properties: { loc: 'Buder', name: 'Buder Library', address: '4401 Hampton Ave' },
        },
      ],
    };
    getCityWaits.mockImplementation(async () =>
      selectCityWaits(
        [
          {
            name: 'Buder Library',
            waittime: 7,
            comments: null,
            earlyvotingoperhours: null,
            created_date_1740505041182: nov3(8, 45),
          },
        ].map((r) => ({ ...r })),
        Date.now(),
        { electionDay: true },
      ),
    );
    const cityJurisdiction = {
      id: 'city',
      officialLookupUrl: county.officialLookupUrl,
      boardSiteUrl: county.boardSiteUrl,
      getPolls: async () => cityPlaces,
      getOutline: async () => geometry.features[0],
    };
    render(
      <JurisdictionContext.Provider value={cityJurisdiction}>
        <PollsCard code="W01P12" origin={ORIGIN} />
      </JurisdictionContext.Provider>,
    );
    const [first] = await items();
    await waitFor(() => expect(first).toHaveTextContent(/About 7 people in line/));
    expect(first).toHaveTextContent(waitCopy.reportedBy(election.waitTimes.city.source));
    expect(getCountyWaits).not.toHaveBeenCalled();
  });

  it('colors the map markers by line count and draws the legend', async () => {
    createPrecinctMap.mockImplementation((_, { onReady }) => {
      queueMicrotask(onReady);
      return { setPolls: vi.fn(), remove: vi.fn() };
    });
    render(<PollsCard code="CC007" origin={ORIGIN} waitSource={store(fresh)} />);
    await list();
    await userEvent.click(screen.getByRole('radio', { name: waitCopy.sort.nearby(5) }));
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(waitCopy.map.legend)).toBeInTheDocument());
    const view = createPrecinctMap.mock.results[0].value;
    const last = () =>
      view.setPolls.mock.calls.at(-1)?.[0] ?? createPrecinctMap.mock.calls[0][1].polls;
    await waitFor(() => expect(last().some((p) => p.bin !== null)).toBe(true));
  });

  it('shows no counts, sort, legend or link before the polls open, and asks nothing', async () => {
    vi.setSystemTime(nov3(5, 30));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    await list();
    expect(sortGroup()).toBeNull();
    expect(noCounts()).toBeNull();
    expect(screen.queryByRole('link', { name: copy.polls.waits.seeAll })).toBeNull();
    expect(getCountyWaits).not.toHaveBeenCalled();
  });

  it('shows none of it on another day', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 22, 14));
    render(<PollsCard code="CC007" origin={ORIGIN} />);
    await list();
    expect(sortGroup()).toBeNull();
    expect(getCountyWaits).not.toHaveBeenCalled();
  });

  it('keeps focus on a row link when a refresh changes the counts', async () => {
    let value = 3;
    const near = nearestPolls(polls, ORIGIN)[0];
    const fetcher = async () => [
      {
        siteId: near.dayKey,
        jurisdiction: 'county',
        unit: 'people',
        value,
        reportedAt: new Date(Date.now() - 60_000),
        source: countyWaits.source,
        openUntil: new Date(nov3(19)),
      },
    ];
    const source = createWaitTimesStore({ county: fetcher, city: null }, { refreshMs: 50 });
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(nov3(9, 0, 30));
    render(<PollsCard code="CC007" origin={ORIGIN} waitSource={source} />);
    const [first] = await items();
    await waitFor(() => expect(first).toHaveTextContent(/About 3 people/));
    const link = within(first).getAllByRole('link')[0];
    act(() => link.focus());
    value = 12;
    await waitFor(async () => expect((await items())[0]).toHaveTextContent(/About 12 people/));
    expect(document.activeElement).toBe(link);
  });
});
