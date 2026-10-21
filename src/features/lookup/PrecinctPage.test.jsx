// Fixtures are live responses recorded by scripts/record-fixtures.mjs. The real
// data client runs against a stubbed fetch. The page is imported fresh for each
// test, since the client caches the polls list for the page's lifetime.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import polls from '../../../docs/raw/fixtures/polls.json';
import precinctGeometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import byId from '../../../docs/raw/fixtures/precinct-by-id.json';
import nonresidential from '../../../docs/raw/fixtures/precinct-nonresidential.json';
import election from '../../config/election.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import { copy } from './resultsCopy.js';

let fetchMock;
let PrecinctPage;
let rememberLookupPoint;

function respond(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// Answers the polls and precinct outline queries from their fixtures, and the
// precinct query with `precinct` (a body, or a function of the URL).
function routeFetch(precinct) {
  fetchMock.mockImplementation((input) => {
    const url = new URL(input);
    if (url.pathname.includes(election.layers.polls)) return respond(polls);
    if (url.searchParams.get('f') === 'geojson') return respond(precinctGeometry);
    return typeof precinct === 'function' ? precinct(url) : respond(precinct);
  });
}

const precinctCalls = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(input))
    .filter((url) => url.pathname.includes(election.layers.precincts));

// A precinct-by-id response whose one precinct has these attributes changed.
function withAttributes(fixture, changes) {
  const [feature] = fixture.features;
  return {
    ...fixture,
    features: [{ ...feature, attributes: { ...feature.attributes, ...changes } }],
  };
}

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  PrecinctPage = (await import('./PrecinctPage.jsx')).default;
  ({ rememberLookupPoint } = await import('./lookupPoint.js'));
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
  return location;
}

const heading = () => screen.getByRole('heading', { level: 1 });
const liveRegion = () => document.querySelector('[aria-live="polite"]');
const cardHeadings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
const ready = (code) => screen.findByText(copy.ready(code));

describe('PrecinctPage', () => {
  it('loads only the precinct in the URL', async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
    const precinctQueries = urls.filter(
      (url) =>
        url.pathname.includes(election.layers.precincts) && url.searchParams.get('f') === 'json',
    );
    expect(precinctQueries).toHaveLength(1);
    expect(precinctQueries[0].searchParams.get('where')).toBe("precinct='CC007'");
    // Everything else is the polls list or this precinct's outline.
    for (const url of urls.filter((u) => !precinctQueries.includes(u))) {
      if (url.pathname.includes(election.layers.polls)) continue;
      expect(url.pathname).toContain(election.layers.precincts);
      expect(url.searchParams.get('f')).toBe('geojson');
      expect(url.searchParams.get('where')).toBe("precinct='CC007'");
    }
  });

  it('shows the heading and skeletons, and an empty live region, while loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderAt('CC007');
    expect(heading()).toHaveTextContent(copy.heading('CC007'));
    expect(liveRegion()).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent(/^$/);
    const skeleton = screen.getByTestId('results-skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton.querySelector('.motion-reduce\\:animate-none')).not.toBeNull();
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    expect(screen.getByRole('link', { name: copy.searchAnother })).toHaveAttribute('href', '/');
  });

  it('shows the header, no banner and the four cards in order for an In Election precinct', async () => {
    routeFetch(byId);
    renderAt('CC007');
    expect(await ready('CC007')).toBe(liveRegion());
    expect(heading()).toHaveTextContent('Precinct CC007');
    expect(screen.getByText(copy.unincorporated)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: copy.status.label })).toBeNull();
    expect(cardHeadings()).toEqual([
      copy.cards.polls,
      copy.cards.ballot,
      copy.cards.earlyVoting,
      copy.cards.districts,
    ]);
    expect(screen.queryByTestId('results-skeleton')).toBeNull();
    expect(screen.getByRole('link', { name: copy.searchAnother })).toHaveAttribute('href', '/');
  });

  it('moves focus to the results heading when results load', async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    expect(heading()).toHaveFocus();
    expect(heading()).toHaveAttribute('tabindex', '-1');
  });

  it("shows the county's message as plain text and hides the ballot card for a Nonresidential Precinct", async () => {
    routeFetch(nonresidential);
    renderAt('AP200');
    await ready('AP200');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(nonresidential.features[0].attributes.html);
    expect(screen.getByText('City of Bridgeton')).toBeInTheDocument();
    expect(cardHeadings()).toEqual([
      copy.cards.polls,
      copy.cards.earlyVoting,
      copy.cards.districts,
    ]);
  });

  it('never renders markup from the field', async () => {
    routeFetch(withAttributes(nonresidential, { html: 'No <b>homes</b> here.' }));
    renderAt('AP200');
    await ready('AP200');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent('No homes here.');
    expect(banner.querySelector('b')).toBeNull();
  });

  it('falls back to a plain line and the county site when the message cannot be read', async () => {
    routeFetch(withAttributes(nonresidential, { html: '<script>x</script>' }));
    renderAt('AP200');
    await ready('AP200');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(copy.status.nonresidentialFallback);
    expect(banner).not.toHaveTextContent('script');
    expect(within(banner).getByRole('link', { name: copy.status.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
  });

  it('says there is nothing on the ballot and hides the ballot card for a Not In Election precinct', async () => {
    routeFetch(withAttributes(byId, { in_election: 'Not In Election' }));
    renderAt('CC007');
    await ready('CC007');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(copy.status.notInElection);
    expect(cardHeadings()).toEqual([
      copy.cards.polls,
      copy.cards.earlyVoting,
      copy.cards.districts,
    ]);
  });

  it('points to the official lookup for a status it does not know', async () => {
    routeFetch(withAttributes(byId, { in_election: 'Pending' }));
    renderAt('CC007');
    await ready('CC007');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(copy.status.unknown);
    expect(within(banner).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(cardHeadings()).toContain(copy.cards.ballot);
  });

  it('shows the municipality as the data gives it, and no line when it is empty', async () => {
    routeFetch(withAttributes(byId, { municipality: '' }));
    renderAt('CC007');
    await ready('CC007');
    expect(screen.queryByText(copy.unincorporated)).toBeNull();
    expect(screen.queryByTestId('municipality')).toBeNull();
  });

  it('links each card to the official lookup until the card is built', async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    const built = [copy.cards.polls];
    for (const name of cardHeadings().filter((heading) => !built.includes(heading))) {
      const card = screen.getByRole('region', { name });
      expect(within(card).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
        'href',
        election.officialLookupUrl,
      );
    }
  });

  it('says a malformed code is not found, without a request', async () => {
    renderAt('nope');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.errors.notFound);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    expect(screen.getByRole('link', { name: copy.searchAnother })).toHaveAttribute('href', '/');
  });

  it('never puts URL text that is not a precinct code in the heading', async () => {
    renderAt('Polls%20moved%20to%20City%20Hall');
    expect(heading()).toHaveTextContent(copy.notFoundHeading);
    expect(heading()).not.toHaveTextContent(/polls|city hall/i);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.notFound);
    expect(heading()).not.toHaveTextContent(/polls|city hall/i);
  });

  it('says an unknown code is not found', async () => {
    fetchMock.mockImplementation(() => respond({ ...byId, features: [] }));
    renderAt('ZZ999');
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.notFound);
    expect(liveRegion()).toHaveTextContent(/^$/);
  });

  it('says a failed load failed, with the official lookup link', async () => {
    fetchMock.mockImplementation(() => respond({}, 404));
    renderAt('CC007');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.errors.failed);
    expect(within(alert).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.queryByTestId('results-skeleton')).toBeNull();
  });

  it('keeps the skeleton through the retry of a server error, then says it failed', async () => {
    fetchMock.mockImplementation(() => respond({}, 500));
    renderAt('CC007');
    expect(screen.getByTestId('results-skeleton')).toBeInTheDocument();
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    await within(alert).findByText(copy.errors.failed, { exact: false }, { timeout: 3000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('results-skeleton')).toBeNull();
  });

  it('keeps the URL to the precinct code and stores nothing', async () => {
    localStorage.clear();
    sessionStorage.clear();
    routeFetch(byId);
    const location = renderAt('CC007');
    await ready('CC007');
    expect(location.history).toEqual(['/p/CC007']);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('lists polling places by distance from the looked-up point', async () => {
    const point = { lat: 38.66, lng: -90.45 };
    rememberLookupPoint('CC007', point);
    routeFetch(byId);
    renderAt('CC007');
    const card = await screen.findByRole('region', { name: copy.cards.polls });
    const list = await within(card).findByRole('list', { name: copy.polls.listLabel });
    const expected = nearestPolls(polls, point).slice(0, election.nearbyPollCount);
    expect(
      within(list)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(expected.map((row) => row.name));
    expect(within(card).queryByText(copy.polls.fromCenter('CC007'))).toBeNull();
    // The outline is only needed without a point.
    expect(precinctCalls().filter((url) => url.searchParams.get('f') === 'geojson')).toEqual([]);
  });

  it("lists polling places from the precinct's center when opened from a link", async () => {
    rememberLookupPoint('OAK019', { lat: 38.5, lng: -90.3 });
    routeFetch(byId);
    renderAt('CC007');
    const card = await screen.findByRole('region', { name: copy.cards.polls });
    const list = await within(card).findByRole('list', { name: copy.polls.listLabel });
    const center = polygonCenter(precinctGeometry.features[0].geometry);
    const expected = nearestPolls(polls, center).slice(0, election.nearbyPollCount);
    expect(
      within(list)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(expected.map((row) => row.name));
    expect(within(card).getByText(copy.polls.fromCenter('CC007'))).toBeInTheDocument();
  });

  it('never puts the looked-up point in a request, the URL or storage', async () => {
    localStorage.clear();
    sessionStorage.clear();
    rememberLookupPoint('CC007', { lat: 38.661234, lng: -90.451234 });
    routeFetch(byId);
    const location = renderAt('CC007');
    await screen.findByRole('list', { name: copy.polls.listLabel });
    const seen = [
      ...fetchMock.mock.calls.map(([input]) => String(input)),
      ...location.history,
      JSON.stringify(window.history.state),
      JSON.stringify({ ...localStorage }),
      JSON.stringify({ ...sessionStorage }),
    ].join(' ');
    for (const needle of ['38.661234', '90.451234', '38.66', '90.45']) {
      expect(seen).not.toContain(needle);
    }
  });

  it('goes back to the search from "Search another address"', async () => {
    routeFetch(byId);
    const location = renderAt('CC007');
    await ready('CC007');
    await userEvent.click(screen.getByRole('link', { name: copy.searchAnother }));
    expect(location.history).toEqual(['/p/CC007', '/']);
  });
});
