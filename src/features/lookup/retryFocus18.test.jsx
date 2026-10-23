// Issue #18, review round 1: a retry whose answer takes "Try again" away must
// not drop focus to the page, and a card's failure is announced like the
// page's own.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import byId from '../../../docs/raw/fixtures/precinct-by-id.json';
import { GeocoderUnavailableError } from '../../data/geocoder.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as searchCopy } from './addressSearchCopy.js';
import { copy as errorCopy } from './errorCopy.js';
import { GeocoderContext } from './geocoderContext.js';
import { copy } from './lookupCopy.js';
import { copy as resultsCopy } from './resultsCopy.js';

vi.mock('./locate.js', () => ({ locate: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe('focus after a retry that removes "Try again"', () => {
  it('goes to the address box when the retry finds no match', async () => {
    let answer = async () => {
      throw new GeocoderUnavailableError();
    };
    const geocoder = { suggest: async () => [], geocode: (...args) => answer(...args) };
    render(
      <GeocoderContext.Provider value={geocoder}>
        <Router hook={memoryLocation({ path: '/' }).hook}>
          <AddressLookup />
        </Router>
      </GeocoderContext.Provider>,
    );
    const input = screen.getByRole('combobox', { name: searchCopy.label });
    await userEvent.type(input, '1318 Ross Ave');
    await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
    await screen.findByText(copy.errors.unavailable);
    answer = async () => null;
    await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
    await screen.findByText(copy.errors.noMatch);
    expect(input).toHaveFocus();
  });

  it('goes to the message when a precinct page retry finds the code does not exist', async () => {
    let status = 404;
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(status === 200 ? { ...byId, features: [] } : {}), {
          status,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const PrecinctPage = (await import('./PrecinctPage.jsx')).default;
    render(
      <Router hook={memoryLocation({ path: '/p/ZZ999' }).hook}>
        <Route path="/p/:precinct" component={PrecinctPage} />
      </Router>,
    );
    await screen.findByText(resultsCopy.errors.failed, { exact: false });
    status = 200;
    await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
    const message = await screen.findByText(resultsCopy.errors.notFound, { exact: false });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(message);
  });
});

describe('a card failure', () => {
  it('is announced, as a new message on each failed attempt', async () => {
    vi.resetModules();
    vi.doMock('../../data/arcgis.js', () => ({
      getPolls: vi.fn(async () => {
        throw new Error('HTTP 503');
      }),
      getPrecinctGeometry: vi.fn(),
      // The card's Election Day line counts (#107) import these.
      getCountyWaits: vi.fn(),
      getCityWaits: vi.fn(),
    }));
    vi.doMock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));
    const PollsCard = (await import('./PollsCard.jsx')).default;
    render(<PollsCard code="CC007" origin={{ lat: 38.66, lng: -90.45 }} />);
    const first = await screen.findByText(resultsCopy.polls.failed, { exact: false });
    expect(first.closest('[role="alert"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
    await screen.findByRole('button', { name: errorCopy.retry });
    const second = screen.getByText(resultsCopy.polls.failed, { exact: false });
    expect(second).not.toBe(first);
    expect(second.closest('[role="alert"]')).not.toBeNull();
    vi.doUnmock('../../data/arcgis.js');
    vi.doUnmock('./precinctMapView.js');
  });
});
