// Issue #70: the precinct page counts its error's official lookup link and
// Try again, and the summary's directions button, with fixed labels only.
// The page and the analytics module are imported fresh for each test, as in
// PrecinctPage.errors18.test.jsx, so GA is started on the same module copy.
import { render, screen, within } from '@testing-library/react';
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

vi.mock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));

let fetchMock;
let PrecinctPage;
let tracked;
let pressLink;

const respond = (body, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

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
  const helpers = await import('../../test/trackedEvents.js');
  pressLink = helpers.pressLink;
  tracked = helpers.trackEvents();
});

afterEach(() => {
  tracked.stop();
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

it('counts the failed page load official lookup link and Try again', async () => {
  let answer = () => respond({}, 404);
  routeFetch(() => answer());
  renderAt('CC007');
  await screen.findByText(copy.errors.failed, { exact: false });
  const link = screen.getByRole('link', { name: copy.officialLookup });
  expect(await pressLink(userEvent.click, link)).toBe(false);
  answer = () => respond(byId);
  await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
  await screen.findByText(copy.ready('CC007'));
  expect(await tracked.events()).toEqual([
    ['official_lookup_open', { card: 'precinct_error' }],
    ['retry', { where: 'precinct' }],
  ]);
});

it('counts both boards lookup links on a page that is not a precinct code', async () => {
  routeFetch(() => respond({}, 404));
  renderAt('NOPE');
  await screen.findByText(copy.errors.notFound, { exact: false });
  const links = screen.getAllByRole('link', { name: /official lookup/i });
  expect(links.length).toBeGreaterThan(1);
  for (const link of links) expect(await pressLink(userEvent.click, link)).toBe(false);
  const events = await tracked.events();
  expect(events.length).toBe(links.length);
  for (const event of events) {
    expect(event).toEqual(['official_lookup_open', { card: 'precinct_error' }]);
  }
});

it("counts the summary's directions button as the polls card's, without the place", async () => {
  routeFetch(() => respond(byId));
  renderAt('CC007');
  await screen.findByText(copy.ready('CC007'));
  // The Election Day part's: while early voting runs, the early voting
  // part's button may render first.
  const day = await screen.findByRole('region', { name: copy.summary.electionDay });
  const button = await within(day).findByRole('link', {
    name: new RegExp(`^${copy.polls.directions}`),
  });
  expect(await pressLink(userEvent.click, button)).toBe(false);
  expect(await tracked.events()).toEqual([
    ['directions_open', { card: 'polls', provider: 'google' }],
  ]);
  expect(JSON.stringify(tracked.calls())).not.toMatch(/CC007|google\.com|38\.|90\./);
});

// While early voting runs, the summary's nearest early voting site has its
// own directions button, counted as the early voting card's.
it("counts the summary's early voting directions as early_voting", async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Noon Central on Thursday 2026-10-22, during early voting.
  vi.setSystemTime(Date.UTC(2026, 9, 22, 17, 0));
  routeFetch(() => respond(byId));
  renderAt('CC007');
  await screen.findByText(copy.ready('CC007'));
  const early = await screen.findByRole('region', { name: copy.summary.early });
  const button = await within(early).findByRole('link', {
    name: new RegExp(`^${copy.polls.directions}`),
  });
  expect(await pressLink(userEvent.click, button)).toBe(false);
  expect(await tracked.events()).toEqual([
    ['directions_open', { card: 'early_voting', provider: 'google' }],
  ]);
});
