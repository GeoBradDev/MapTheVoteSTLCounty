// The wait times page on Election Day (#107): every polling place of both
// boards with its line count, from the County fixture recorded on 2026-10-22
// moved to Election Day and joined on the polls layer's Election Day field.
// Dates are built with Date.UTC, never ISO literals: the hardcoding test scans
// this file.
import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import cityPollsBody from '../../../docs/raw/fixtures/city-polls.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import election from '../../config/election.js';
import { asElectionDay, countyFresh } from '../../data/waitTimes.fixtures.js';
import { selectCityWaits, selectCountyWaits } from '../../data/waitTimes.js';
import { cityScheduleFor, citySchedules } from '../lookup/cityEarlyVoting.js';
import { createWaitTimesStore } from './useWaitTimes.js';
import WaitTimesPage from './WaitTimesPage.jsx';
import { copy } from './waitTimesCopy.js';

vi.mock('./waitTimesMapView.js', () => ({ createWaitTimesMap: vi.fn() }));

// Election Day, Tuesday, November 3, 2026, in Chicago (UTC-6 then).
const nov3 = (hours, minutes = 0) => Date.UTC(2026, 10, 3, hours + 6, minutes);
const COUNT_TEXT = /in line, reported/;
const { county, city } = election.waitTimes;

const fields = election.jurisdictions.city.siteFields;
const cityPolls = {
  ...cityPollsBody,
  features: cityPollsBody.features.map(({ properties: p, ...f }) => ({
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
const cityName = cityPolls.features[0].properties.name;

const edReports = asElectionDay(countyFresh, 'county', polls.features);
const countyWaits = async () =>
  selectCountyWaits(edReports, polls.features, Date.now(), { electionDay: true });
const cityWaits = async () =>
  selectCityWaits(
    [{ name: cityName, waittime: 9, comments: null, [city.timeField]: nov3(8, 50) }],
    Date.now(),
    { electionDay: true },
  );
const none = async () => [];

function renderPage({ waitSource } = {}) {
  const location = memoryLocation({ path: '/early-voting' });
  const loadSites = vi.fn(async () => sites);
  const loadCity = vi.fn(async () => ({
    layer: { features: [] },
    scheduleFor: cityScheduleFor,
    schedules: citySchedules,
  }));
  const loadPolls = vi.fn(async () => polls);
  const loadCityPolls = vi.fn(async () => cityPolls);
  render(
    <StrictMode>
      <Router hook={location.hook}>
        <WaitTimesPage
          loadSites={loadSites}
          loadCity={loadCity}
          loadPolls={loadPolls}
          loadCityPolls={loadCityPolls}
          waitSource={waitSource}
        />
      </Router>
    </StrictMode>,
  );
  return { loadSites, loadCity, loadPolls, loadCityPolls };
}

const list = () => screen.findByRole('list', { name: copy.electionDay.listLabel });
const items = async () => within(await list()).getAllByRole('listitem');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(nov3(9, 0, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WaitTimesPage on Election Day (#107)', () => {
  it('lists every polling place of both boards, not the early voting sites', async () => {
    const loaders = renderPage({
      waitSource: createWaitTimesStore({ county: countyWaits, city: cityWaits }),
    });
    expect(
      screen.getByRole('heading', { level: 1, name: copy.electionDay.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.electionDay.intro)).toBeInTheDocument();
    expect(screen.getByText(copy.electionDay.city)).toBeInTheDocument();
    await waitFor(async () =>
      expect(await items()).toHaveLength(polls.features.length + cityPolls.features.length),
    );
    expect(loaders.loadPolls).toHaveBeenCalled();
    expect(loaders.loadCityPolls).toHaveBeenCalled();
    expect(loaders.loadSites).not.toHaveBeenCalled();
    expect(loaders.loadCity).not.toHaveBeenCalled();
  });

  it("shows each board's counts on its own places, with the board's name", async () => {
    const entries = await countyWaits();
    renderPage({ waitSource: createWaitTimesStore({ county: countyWaits, city: cityWaits }) });
    await waitFor(() => expect(screen.getAllByText(COUNT_TEXT)).toHaveLength(entries.length + 1));
    // Sorted by shortest line first: the counts come first.
    const rows = await items();
    const cityRow = rows.find((li) => within(li).queryByRole('heading', { name: cityName }));
    expect(cityRow).toHaveTextContent('About 9 people in line');
    expect(cityRow).toHaveTextContent(city.source);
    const countyRows = rows.filter((li) => li.textContent.includes(county.source));
    expect(countyRows).toHaveLength(polls.features.length);
  });

  it('shows the Election Day hours and status, never an early voting site kind', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: none, city: none }) });
    const [first] = await items();
    expect(first).toHaveTextContent('Open today until 7 p.m.');
    expect(first).toHaveTextContent(copy.todayHours('06:00', '19:00'));
    expect(first).not.toHaveTextContent(/absentee/i);
    expect(first).toHaveTextContent(copy.noCount);
  });

  it('says the polls closed after closing time', async () => {
    vi.setSystemTime(nov3(19, 30));
    renderPage({ waitSource: createWaitTimesStore({ county: none, city: none }) });
    const [first] = await items();
    expect(first).toHaveTextContent(copy.electionDay.closed('19:00'));
  });

  it('shows only the no-data state when no board has a fresh count', async () => {
    renderPage({ waitSource: createWaitTimesStore({ county: none, city: none }) });
    const rows = await items();
    for (const li of rows) expect(li).not.toHaveTextContent(COUNT_TEXT);
  });

  it('keeps the early voting page on another day', async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 22, 14));
    const loaders = renderPage({ waitSource: createWaitTimesStore({ county: none, city: none }) });
    expect(screen.getByRole('heading', { level: 1, name: copy.heading })).toBeInTheDocument();
    await screen.findByRole('list', { name: copy.listLabel });
    expect(loaders.loadPolls).not.toHaveBeenCalled();
  });
});
