// The home page's line count dot map (#184), with the County and City
// fixtures #102 recorded on 2026-10-22 and the real selection and loop.
import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import citySitesBody from '../../../docs/raw/fixtures/city-early-voting-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import countyFreshBody from '../../../docs/raw/fixtures/county-waits-fresh.json';
import election, { jurisdictions } from '../../config/election.js';
import { selectCountyWaits } from '../../data/waitTimes.js';
import { cityScheduleFor, citySchedules } from '../lookup/cityEarlyVoting.js';
import { copy as homeCopy } from '../lookup/homeCopy.js';
import { createWaitTimesStore } from './useWaitTimes.js';
import WaitDotMap from './WaitDotMap.jsx';
import { copy } from './waitTimesCopy.js';

const rowsOf = (body) => body.features.map((f) => f.attributes);
// 9:05 a.m. Central on Thursday 2026-10-22, just after the County recording.
const OPEN_AT = Date.UTC(2026, 9, 22, 14, 5);
// 7:30 p.m. Central the same day: every early voting site has closed.
const CLOSED_AT = Date.UTC(2026, 9, 23, 0, 30);
// 8 p.m. Central on Monday, November 2.
const EVE_AT = Date.UTC(2026, 10, 3, 2, 0);
// 5 a.m. Central on Election Day, before the polls open.
const BEFORE_POLLS_AT = Date.UTC(2026, 10, 3, 11, 0);
// 7:30 p.m. Central on Election Day, after the polls close.
const AFTER_POLLS_AT = Date.UTC(2026, 10, 4, 1, 30);

const fields = jurisdictions.city.siteFields;
const citySites = {
  ...citySitesBody,
  features: citySitesBody.features.map(({ properties: p, ...f }) => ({
    ...f,
    properties: { loc: p[fields.id], name: p[fields.name], address: p[fields.address] },
  })),
};
const loadCity = async () => ({
  layer: citySites,
  scheduleFor: cityScheduleFor,
  schedules: citySchedules,
});

const countyFresh = async () => selectCountyWaits(rowsOf(countyFreshBody), sites.features);
const none = async () => [];
const failing = async () => {
  throw new Error('down');
};

function renderMap({
  waits = { county: countyFresh, city: none },
  loadSites = async () => sites,
  city = loadCity,
  loadPolls = async () => polls,
  loadCityPolls = async () => ({ features: [] }),
  onClose = vi.fn(),
} = {}) {
  const { hook } = memoryLocation({ path: '/' });
  const view = render(
    <StrictMode>
      <Router hook={hook}>
        <WaitDotMap
          loadSites={loadSites}
          loadCity={city}
          loadPolls={loadPolls}
          loadCityPolls={loadCityPolls}
          waitSource={createWaitTimesStore(waits)}
          onClose={onClose}
        />
      </Router>
    </StrictMode>,
  );
  return { ...view, onClose };
}

const dots = (container) => container.querySelectorAll('svg circle[data-dot]');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WaitDotMap during early voting, sites open', () => {
  beforeEach(() => vi.setSystemTime(OPEN_AT));

  it('heads the block and says when the counts were checked', async () => {
    renderMap();
    expect(
      screen.getByRole('heading', { level: 2, name: homeCopy.waitMap.heading }),
    ).toBeInTheDocument();
    expect(await screen.findByText(copy.status.checked('09:05'))).toBeInTheDocument();
  });

  it('draws one dot per County and City site in one link to the wait times page', async () => {
    const { container } = renderMap();
    const link = await screen.findByRole('link', { name: homeCopy.waitMap.mapLink });
    expect(link).toHaveAttribute('href', '/early-voting');
    const svg = link.parentElement.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() =>
      expect(dots(container)).toHaveLength(sites.features.length + citySites.features.length),
    );
    // Both outlines, the City kept apart and labeled.
    expect(svg.querySelector('[data-outline="county"]')).not.toBeNull();
    expect(svg.querySelector('[data-outline="city"]')).not.toBeNull();
    expect(svg).toHaveTextContent(homeCopy.waitMap.city);
  });

  it('shows the legend in the wait times map classes, and the hollow ring', async () => {
    renderMap();
    const legend = await screen.findByRole('list', { name: copy.map.legend });
    const items = within(legend).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.at(-1)).toHaveTextContent(homeCopy.waitMap.hollow);
    expect(items[0]).toHaveTextContent(/person|people/);
  });

  it('names the three open sites with the fewest people in line, and their board', async () => {
    renderMap();
    const list = await screen.findByRole('list', { name: homeCopy.waitMap.shortest });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    for (const item of items) expect(item).toHaveTextContent(jurisdictions.county.name);
    expect(items[0]).toHaveTextContent(': 0 people');
  });

  it('states each board’s rule: its sites are for its own voters', async () => {
    renderMap();
    expect(await screen.findByText(copy.city)).toBeInTheDocument();
  });
});

describe('WaitDotMap with no current counts', () => {
  beforeEach(() => vi.setSystemTime(OPEN_AT));

  // The box is on screen at its reserved height: it stays, so nothing moves.
  it('keeps the map when sites are open and neither board has a fresh count', async () => {
    const { container, onClose } = renderMap({ waits: { county: none, city: none } });
    expect(await screen.findByText(homeCopy.waitMap.noCounts)).toBeInTheDocument();
    for (const dot of dots(container)) expect(dot).toHaveAttribute('data-dot', 'hollow');
    expect(screen.queryByRole('list', { name: homeCopy.waitMap.shortest })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says so when both boards’ counts cannot be loaded', async () => {
    const { onClose } = renderMap({ waits: { county: failing, city: failing } });
    expect(await screen.findByText(homeCopy.waitMap.unavailable)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('WaitDotMap closes, leaving the home page as it was', () => {
  beforeEach(() => vi.setSystemTime(OPEN_AT));

  it('when a board’s sites cannot be loaded', async () => {
    const { onClose } = renderMap({ city: failing });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('when both boards’ sites cannot be loaded', async () => {
    const { onClose } = renderMap({ city: failing, loadSites: failing });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('after the polls close on Election Day', async () => {
    vi.setSystemTime(AFTER_POLLS_AT);
    const { onClose } = renderMap();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('WaitDotMap with every site closed', () => {
  it('draws hollow rings and says when sites open again', async () => {
    vi.setSystemTime(CLOSED_AT);
    const { container, onClose } = renderMap({ waits: { county: none, city: none } });
    expect(
      await screen.findByText(homeCopy.waitMap.openOn('2026-10-23', '08:00')),
    ).toBeInTheDocument();
    await waitFor(() => expect(dots(container).length).toBeGreaterThan(0));
    for (const dot of dots(container)) expect(dot).toHaveAttribute('data-dot', 'hollow');
    expect(screen.queryByRole('list', { name: homeCopy.waitMap.shortest })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on the evening of November 2, says Election Day is tomorrow', async () => {
    vi.setSystemTime(EVE_AT);
    const { onClose } = renderMap({ waits: { county: none, city: none } });
    const { open, close } = election.electionDayHours;
    expect(await screen.findByText(homeCopy.waitMap.ended(open, close))).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on Election Day before 6 a.m., shows the polling places and when they open', async () => {
    vi.setSystemTime(BEFORE_POLLS_AT);
    const { container } = renderMap({ waits: { county: none, city: none } });
    expect(
      screen.getByRole('heading', { level: 2, name: homeCopy.waitMap.headingElectionDay }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(homeCopy.waitMap.pollsOpen(election.electionDayHours.open)),
    ).toBeInTheDocument();
    await waitFor(() => expect(dots(container)).toHaveLength(polls.features.length));
    expect(screen.getByRole('link', { name: homeCopy.waitMap.mapLinkElectionDay })).toBeVisible();
    expect(screen.getByText(copy.electionDay.city)).toBeInTheDocument();
  });
});
