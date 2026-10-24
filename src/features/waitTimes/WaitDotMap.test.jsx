// The home page's line count dot map (#184), with the County and City
// fixtures #102 recorded on 2026-10-22 and the real selection and loop.
import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  // One loop shared across renders, as the app's is.
  source = createWaitTimesStore(waits),
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
          waitSource={source}
          onClose={onClose}
        />
      </Router>
    </StrictMode>,
  );
  return { ...view, onClose, source };
}

const countyEntry = (value, openUntil) => ({
  siteId: 'abs602boec',
  jurisdiction: 'county',
  unit: 'people',
  value,
  reportedAt: new Date(Date.now() - 60_000),
  source: election.waitTimes.county.source,
  openUntil: new Date(openUntil),
});

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

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

  // The wait times page lists every site and line, and states each board's
  // rule: the home page's map keeps only its legend (#209).
  it('lists no shortest lines and states no board rule under the legend (#209)', async () => {
    renderMap();
    await screen.findByText(copy.status.checked('09:05'));
    expect(screen.getAllByRole('list')).toEqual([
      screen.getByRole('list', { name: copy.map.legend }),
    ]);
    expect(screen.queryByText(copy.city)).toBeNull();
    expect(screen.queryByText(homeCopy.waitMap.noCounts)).toBeNull();
  });
});

describe('WaitDotMap and the shared line count loop', () => {
  beforeEach(() => vi.setSystemTime(OPEN_AT));

  // Coming back to the home page within the loop's interval asks nothing new
  // and shows the answer already in hand.
  it('asks nothing outside the shared interval when the home page is shown again', async () => {
    const county = vi.fn(countyFresh);
    const city = vi.fn(none);
    const source = createWaitTimesStore({ county, city });
    const first = renderMap({ source });
    await screen.findByText(copy.status.checked('09:05'));
    const asked = county.mock.calls.length;
    const askedCity = city.mock.calls.length;
    first.unmount();
    vi.setSystemTime(OPEN_AT + 10_000);
    renderMap({ source });
    expect(await screen.findByText(copy.status.checked('09:05'))).toBeVisible();
    expect(county).toHaveBeenCalledTimes(asked);
    expect(city).toHaveBeenCalledTimes(askedCity);
  });
});

describe('WaitDotMap with no current counts', () => {
  beforeEach(() => vi.setSystemTime(OPEN_AT));

  // The box is on screen at its reserved height: it stays, so nothing moves.
  it('keeps the map when sites are open and neither board has a fresh count', async () => {
    const { container, onClose } = renderMap({ waits: { county: none, city: none } });
    expect(await screen.findByText(homeCopy.waitMap.noCounts)).toBeInTheDocument();
    for (const dot of dots(container)) expect(dot).toHaveAttribute('data-dot', 'hollow');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('names the board whose counts cannot be loaded, so its rings are not read as closed', async () => {
    const { container } = renderMap({ waits: { county: countyFresh, city: failing } });
    expect(
      await screen.findByText(homeCopy.waitMap.boardUnavailable(jurisdictions.city.name)),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('svg circle[data-dot="count"]').length).toBeGreaterThan(0);
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
    expect(screen.queryByText(copy.city)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks the line count layers nothing while every site is closed', async () => {
    vi.setSystemTime(CLOSED_AT);
    const county = vi.fn(none);
    const city = vi.fn(none);
    renderMap({ waits: { county, city } });
    expect(
      await screen.findByText(homeCopy.waitMap.openOn('2026-10-23', '08:00')),
    ).toBeInTheDocument();
    expect(county).not.toHaveBeenCalled();
    expect(city).not.toHaveBeenCalled();
  });

  it('says nothing false while its first counts load after a site opens', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 5:59 a.m. Central on Election Day, then the polls open at 6 with the
    // page left open; the line counts have not answered yet.
    vi.setSystemTime(Date.UTC(2026, 10, 3, 11, 59));
    const pending = () => new Promise(() => {});
    renderMap({ waits: { county: pending, city: pending } });
    expect(
      await screen.findByText(homeCopy.waitMap.pollsOpen(election.electionDayHours.open)),
    ).toBeInTheDocument();
    await act(async () => {
      vi.setSystemTime(Date.UTC(2026, 10, 3, 12, 0, 30));
      vi.advanceTimersByTime(60_000);
    });
    expect(
      screen.queryByText(homeCopy.waitMap.pollsOpen(election.electionDayHours.open)),
    ).toBeNull();
    expect(screen.queryByText(homeCopy.waitMap.noCounts)).toBeNull();
    expect(screen.getByRole('list', { name: copy.map.legend })).toBeInTheDocument();
  });

  // A page left open across a closing: the shared loop still holds the
  // evening before's answer, which is not read as now.
  it('starts fresh when sites open again with the page left open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 4:25 p.m. Central on 2026-10-22: County sites open, with counts.
    vi.setSystemTime(Date.UTC(2026, 9, 22, 21, 25));
    let answer = async () => [
      {
        siteId: 'abs602boec',
        jurisdiction: 'county',
        unit: 'people',
        value: 3,
        reportedAt: new Date(Date.now() - 60_000),
        source: election.waitTimes.county.source,
        openUntil: new Date(Date.UTC(2026, 9, 22, 21, 30)),
      },
    ];
    const county = vi.fn(() => answer());
    // County sites only: some City sites stay open until 7 p.m. on Thursdays.
    const noCitySites = async () => ({ ...(await loadCity()), layer: { features: [] } });
    renderMap({ waits: { county, city: none }, city: noCitySites });
    await screen.findByText(/^Line counts checked at /);
    // Every site closes at 4:30; the next morning at 8:00:30 they open again
    // and the counts have not answered yet.
    answer = () => new Promise(() => {});
    await act(async () => {
      vi.setSystemTime(Date.UTC(2026, 9, 22, 21, 31));
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => {
      vi.setSystemTime(Date.UTC(2026, 9, 23, 13, 0, 30));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText(homeCopy.waitMap.noCounts)).toBeNull();
    expect(screen.queryByText(/^Line counts checked at /)).toBeNull();
  });

  // A phone asleep (or a tab frozen) from one afternoon to the next morning:
  // when it wakes, neither the old check time nor the old count shows.
  it('shows nothing from the day before when a phone wakes the next morning', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(Date.UTC(2026, 9, 22, 21, 25));
    let answer = async () => [
      {
        siteId: 'abs602boec',
        jurisdiction: 'county',
        unit: 'people',
        value: 3,
        reportedAt: new Date(Date.now() - 60_000),
        source: election.waitTimes.county.source,
        openUntil: new Date(Date.UTC(2026, 9, 22, 21, 30)),
      },
    ];
    const county = vi.fn(() => answer());
    const noCitySites = async () => ({ ...(await loadCity()), layer: { features: [] } });
    try {
      renderMap({ waits: { county, city: none }, city: noCitySites });
      await screen.findByText(/^Line counts checked at /);
      expect(screen.getByText(copy.status.checked('16:25'))).toBeInTheDocument();
      answer = () => new Promise(() => {});
      // Asleep: no timer runs while the clock moves to 8:00:30 the next day.
      act(() => setVisibility('hidden'));
      vi.setSystemTime(Date.UTC(2026, 9, 23, 13, 0, 30));
      await act(async () => setVisibility('visible'));
      expect(screen.queryByText(copy.status.checked('16:25'))).toBeNull();
      expect(screen.queryByText(/^Line counts checked at /)).toBeNull();
      expect(screen.queryByText(homeCopy.waitMap.noCounts)).toBeNull();
    } finally {
      setVisibility('visible');
      delete document.visibilityState;
    }
  });

  // A request still out when the phone slept answers after it wakes: that
  // answer is not a check of the next morning, and a new request goes out.
  it('does not take a request left out overnight as this morning’s check', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(Date.UTC(2026, 9, 22, 21, 25));
    let resolveOld;
    let answer = async () => [countyEntry(3, Date.UTC(2026, 9, 22, 21, 30))];
    const county = vi.fn(() => answer());
    const noCitySites = async () => ({ ...(await loadCity()), layer: { features: [] } });
    try {
      renderMap({ waits: { county, city: none }, city: noCitySites });
      await screen.findByText(/^Line counts checked at /);
      // A refresh goes out (the page is shown again) and the phone sleeps
      // before it answers.
      answer = () => new Promise((r) => (resolveOld = r));
      act(() => setVisibility('hidden'));
      await act(async () => setVisibility('visible'));
      const before = county.mock.calls.length;
      act(() => setVisibility('hidden'));
      answer = () => new Promise(() => {});
      vi.setSystemTime(Date.UTC(2026, 9, 23, 13, 0, 30));
      await act(async () => setVisibility('visible'));
      expect(county.mock.calls.length).toBeGreaterThan(before);
      // The old request answers now, with nothing current.
      await act(async () => resolveOld([]));
      expect(screen.queryByText(/^Line counts checked at /)).toBeNull();
      expect(screen.queryByText(homeCopy.waitMap.noCounts)).toBeNull();
    } finally {
      setVisibility('visible');
      delete document.visibilityState;
    }
  });

  // Woken later the same day: the counts the loop dropped as too old are not
  // read as "no count" while the new request is out.
  it('says nothing false while it asks again after waking later the same day', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 10:00 a.m. Central on 2026-10-22.
    vi.setSystemTime(Date.UTC(2026, 9, 22, 15, 0));
    let answer = async () => [countyEntry(3, Date.UTC(2026, 9, 22, 21, 30))];
    const county = vi.fn(() => answer());
    const noCitySites = async () => ({ ...(await loadCity()), layer: { features: [] } });
    try {
      renderMap({ waits: { county, city: none }, city: noCitySites });
      await screen.findByText(/^Line counts checked at /);
      act(() => setVisibility('hidden'));
      answer = () => new Promise(() => {});
      // 12:30 p.m.: the 10:00 count is past the max age.
      vi.setSystemTime(Date.UTC(2026, 9, 22, 17, 30));
      await act(async () => setVisibility('visible'));
      expect(screen.queryByText(homeCopy.waitMap.noCounts)).toBeNull();
      expect(screen.queryByText(copy.status.checked('10:00'))).toBeNull();
    } finally {
      setVisibility('visible');
      delete document.visibilityState;
    }
  });

  // A slow answer (#187): the loop skips a tick while it is out, and the next
  // request on the usual interval is not a resume, so nothing blanks.
  it('keeps the status line through a refresh after a slow answer', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 10:00 a.m. Central on 2026-10-22.
    const t0 = Date.UTC(2026, 9, 22, 15, 0);
    vi.setSystemTime(t0);
    let resolveSlow;
    let answer = () => new Promise((r) => (resolveSlow = r));
    const county = vi.fn(() => answer());
    const noCitySites = async () => ({ ...(await loadCity()), layer: { features: [] } });
    // A tick on the loop's own schedule, made by showing the page again
    // within the interval (no timer runs here).
    const tickAt = async (at) => {
      vi.setSystemTime(at);
      act(() => setVisibility('hidden'));
      await act(async () => setVisibility('visible'));
    };
    const refresh = election.waitTimes.refreshSeconds * 1000;
    try {
      const { container } = renderMap({ waits: { county, city: none }, city: noCitySites });
      await waitFor(() => expect(dots(container).length).toBeGreaterThan(0));
      expect(county).toHaveBeenCalledTimes(1);
      // A tick while the slow request is out asks nothing.
      await tickAt(t0 + refresh * 1.2);
      expect(county).toHaveBeenCalledTimes(1);
      await act(async () => resolveSlow([countyEntry(3, Date.UTC(2026, 9, 22, 21, 30))]));
      expect(await screen.findByText(copy.status.checked('10:00'))).toBeInTheDocument();
      // The next tick, one interval on, asks again; its answer is not in yet.
      answer = () => new Promise(() => {});
      await tickAt(t0 + refresh * 2.2);
      expect(county).toHaveBeenCalledTimes(2);
      // The City's answer to this tick is in; the County's is not.
      expect(screen.getByText(/^Line counts checked at /)).toBeInTheDocument();
    } finally {
      setVisibility('visible');
      delete document.visibilityState;
    }
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
    expect(screen.queryByText(copy.electionDay.city)).toBeNull();
  });
});
