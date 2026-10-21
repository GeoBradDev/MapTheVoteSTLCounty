// Issue #18: the precinct page when the county's precinct data is slow or
// down. The real data client runs against a stubbed fetch; the page is imported
// fresh for each test, like PrecinctPage.test.jsx.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import absenteeSites from '../../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import precinctGeometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import byId from '../../../docs/raw/fixtures/precinct-by-id.json';
import election from '../../config/election.js';
import { copy as errorCopy } from './errorCopy.js';
import { copy } from './resultsCopy.js';
import { SLOW_MS } from './slowNotice.js';

let fetchMock;
let PrecinctPage;

function respond(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// The polls, absentee sites and outline from their fixtures; the precinct
// query from `precinct()`.
function routeFetch(precinct) {
  fetchMock.mockImplementation((input) => {
    const url = new URL(input);
    if (url.pathname.includes(election.layers.polls)) {
      const absentee = url.searchParams.get('where') === election.absenteeWhere;
      return respond(absentee ? absenteeSites : polls);
    }
    if (url.searchParams.get('f') === 'geojson') return respond(precinctGeometry);
    return precinct();
  });
}

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  PrecinctPage = (await import('./PrecinctPage.jsx')).default;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderAt(code) {
  const location = memoryLocation({ path: `/p/${code}`, record: true });
  render(
    <Router hook={location.hook}>
      <Route path="/p/:precinct" component={PrecinctPage} />
    </Router>,
  );
}

const alertFor = (text) => screen.findByText(text, { exact: false });

describe('PrecinctPage failure states (#18)', () => {
  it('moves focus to the message and its "Try again" when the load fails', async () => {
    routeFetch(() => respond({}, 404));
    renderAt('CC007');
    const message = await alertFor(copy.errors.failed);
    const block = message.closest('[tabindex="-1"]');
    expect(block).toHaveFocus();
    expect(within(block).getByRole('button', { name: errorCopy.retry })).toBeInTheDocument();
    expect(within(block).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
  });

  it('loads the precinct on "Try again" and focuses its heading', async () => {
    let answer = () => respond({}, 404);
    routeFetch(() => answer());
    renderAt('CC007');
    await alertFor(copy.errors.failed);
    let finish;
    answer = () => new Promise((resolve) => (finish = resolve));
    await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
    const busy = screen.getByRole('button', { name: errorCopy.retrying });
    expect(busy).toHaveFocus();
    await userEvent.click(busy);
    await act(async () => finish(new Response(JSON.stringify(byId))));
    expect(await screen.findByText(copy.ready('CC007'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.queryByText(copy.errors.failed, { exact: false })).toBeNull();
    expect(screen.queryByRole('button', { name: errorCopy.retrying })).toBeNull();
  });

  it('announces a repeated failure as a new message, keeping focus on the button', async () => {
    routeFetch(() => respond({}, 404));
    renderAt('CC007');
    const first = await alertFor(copy.errors.failed);
    await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
    await vi.waitFor(() => expect(first.isConnected).toBe(false));
    await alertFor(copy.errors.failed);
    expect(screen.getByRole('button', { name: errorCopy.retry })).toHaveFocus();
  });

  it('says it is offline when the browser has no connection', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    routeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    renderAt('CC007');
    expect(await alertFor(copy.errors.offline)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: errorCopy.retry })).toBeInTheDocument();
  });

  it('never says not found when the service fails', async () => {
    routeFetch(() => respond({ error: { code: 400, message: 'Invalid query' } }));
    renderAt('CC007');
    await alertFor(copy.errors.failed);
    expect(screen.queryByText(copy.errors.notFound, { exact: false })).toBeNull();
  });

  it('says it is still working after a few seconds of loading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finish;
    routeFetch(() => new Promise((resolve) => (finish = resolve)));
    renderAt('CC007');
    expect(screen.queryByText(errorCopy.slow)).toBeNull();
    await act(async () => vi.advanceTimersByTime(SLOW_MS + 10));
    expect(screen.getByText(errorCopy.slow)).toHaveAttribute('role', 'status');
    await act(async () => finish(new Response(JSON.stringify(byId))));
    await screen.findByText(copy.ready('CC007'));
    expect(screen.queryByText(errorCopy.slow)).toBeNull();
  });

  it('has no "Try again" for a precinct that does not exist', async () => {
    routeFetch(() => respond({ ...byId, features: [] }));
    renderAt('ZZ999');
    await alertFor(copy.errors.notFound);
    expect(screen.queryByRole('button', { name: errorCopy.retry })).toBeNull();
  });
});
