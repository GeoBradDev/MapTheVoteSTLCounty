// Fixtures are live responses recorded by scripts/record-fixtures.mjs. The real
// data client runs against a stubbed fetch.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import byId from '../../../docs/raw/fixtures/precinct-by-id.json';
import nonresidential from '../../../docs/raw/fixtures/precinct-nonresidential.json';
import election from '../../config/election.js';
import PrecinctPage from './PrecinctPage.jsx';
import { copy } from './resultsCopy.js';

let fetchMock;

function respond(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// A precinct-by-id response whose one precinct has these attributes changed.
function withAttributes(fixture, changes) {
  const [feature] = fixture.features;
  return {
    ...fixture,
    features: [{ ...feature, attributes: { ...feature.attributes, ...changes } }],
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
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
    fetchMock.mockImplementation(() => respond(byId));
    renderAt('CC007');
    await ready('CC007');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('where')).toBe("precinct='CC007'");
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
    fetchMock.mockImplementation(() => respond(byId));
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
    fetchMock.mockImplementation(() => respond(byId));
    renderAt('CC007');
    await ready('CC007');
    expect(heading()).toHaveFocus();
    expect(heading()).toHaveAttribute('tabindex', '-1');
  });

  it("shows the county's message as plain text and hides the ballot card for a Nonresidential Precinct", async () => {
    fetchMock.mockImplementation(() => respond(nonresidential));
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
    fetchMock.mockImplementation(() =>
      respond(withAttributes(nonresidential, { html: 'No <b>homes</b> here.' })),
    );
    renderAt('AP200');
    await ready('AP200');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent('No homes here.');
    expect(banner.querySelector('b')).toBeNull();
  });

  it('falls back to a plain line and the county site when the message cannot be read', async () => {
    fetchMock.mockImplementation(() =>
      respond(withAttributes(nonresidential, { html: '<script>x</script>' })),
    );
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
    fetchMock.mockImplementation(() =>
      respond(withAttributes(byId, { in_election: 'Not In Election' })),
    );
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
    fetchMock.mockImplementation(() => respond(withAttributes(byId, { in_election: 'Pending' })));
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
    fetchMock.mockImplementation(() => respond(withAttributes(byId, { municipality: '' })));
    renderAt('CC007');
    await ready('CC007');
    expect(screen.queryByText(copy.unincorporated)).toBeNull();
    expect(screen.queryByTestId('municipality')).toBeNull();
  });

  it('links each card to the official lookup until the card is built', async () => {
    fetchMock.mockImplementation(() => respond(byId));
    renderAt('CC007');
    await ready('CC007');
    for (const name of cardHeadings()) {
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
    fetchMock.mockImplementation(() => respond(byId));
    const location = renderAt('CC007');
    await ready('CC007');
    expect(location.history).toEqual(['/p/CC007']);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('goes back to the search from "Search another address"', async () => {
    fetchMock.mockImplementation(() => respond(byId));
    const location = renderAt('CC007');
    await ready('CC007');
    await userEvent.click(screen.getByRole('link', { name: copy.searchAnother }));
    expect(location.history).toEqual(['/p/CC007', '/']);
  });
});
