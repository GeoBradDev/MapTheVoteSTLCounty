// Issue #18: the lookup's failure states. "Not working, try again" is never
// shown as "no match", every error offers the official lookup, and "Try
// again" repeats the same attempt without losing focus.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import election from '../../config/election.js';
import { GeocoderUnavailableError } from '../../data/geocoder.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as searchCopy } from './addressSearchCopy.js';
import { copy as errorCopy } from './errorCopy.js';
import { GeocoderContext } from './geocoderContext.js';
import { locate } from './locate.js';
import { copy } from './lookupCopy.js';
import { SLOW_MS } from './slowNotice.js';

vi.mock('./locate.js', () => ({ locate: vi.fn() }));

const ADDRESS = '7700 Fine Rd, Saint Louis, MO 63129';
const PLACE = { label: ADDRESS, lat: 38.5, lng: -90.3, state: 'MO', county: 'St. Louis County' };

function renderLookup(geocode) {
  const location = memoryLocation({ path: '/', record: true });
  const geocoder = { suggest: async () => [], geocode: vi.fn(geocode) };
  render(
    <GeocoderContext.Provider value={geocoder}>
      <Router hook={location.hook}>
        <AddressLookup />
      </Router>
    </GeocoderContext.Provider>,
  );
  return { location, geocoder };
}

const input = () => screen.getByRole('combobox', { name: searchCopy.label });
const retryButton = () => screen.queryByRole('button', { name: errorCopy.retry });

async function search(text = ADDRESS) {
  await userEvent.type(input(), text);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
}

const down = async () => {
  throw new GeocoderUnavailableError();
};

beforeEach(() => {
  locate.mockReset();
  vi.stubGlobal('navigator', {
    ...navigator,
    onLine: true,
    geolocation: { getCurrentPosition: vi.fn() },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AddressLookup failure states (#18)', () => {
  it('asks the geocoder to report a search that could not finish', async () => {
    const { geocoder } = renderLookup(async () => null);
    await search();
    expect(geocoder.geocode).toHaveBeenCalledWith(ADDRESS, {
      signal: expect.any(AbortSignal),
      reportUnavailable: true,
    });
  });

  it('says address search is not working, never no match, with every way forward', async () => {
    renderLookup(down);
    await search();
    const alert = (await screen.findByText(copy.errors.unavailable)).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).not.toHaveTextContent(copy.errors.noMatch);
    expect(copy.errors.unavailable).toMatch(/Try again/);
    expect(copy.errors.unavailable).toMatch(/Use my location/);
    expect(screen.getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });

  it('offers no "Try again" for a real no match', async () => {
    renderLookup(async () => null);
    await search();
    expect(await screen.findByText(copy.errors.noMatch)).toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });

  it('says the lookup failed when the precinct layer fails, with a retry', async () => {
    locate.mockRejectedValue(new Error('HTTP 503'));
    renderLookup(async () => PLACE);
    await search();
    expect(await screen.findByText(copy.errors.failed)).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });

  it('says plainly when the browser is offline', async () => {
    navigator.onLine = false;
    renderLookup(down);
    await search();
    expect(await screen.findByText(copy.errors.offline)).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });

  it('repeats the same search on "Try again", keeping focus on the busy button', async () => {
    let answer = down;
    const { geocoder, location } = renderLookup((...args) => answer(...args));
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'CC007' } });
    await search();
    await screen.findByText(copy.errors.unavailable);
    let finish;
    answer = () => new Promise((resolve) => (finish = resolve));
    await userEvent.click(retryButton());
    const busy = screen.getByRole('button', { name: errorCopy.retrying });
    expect(busy).toHaveFocus();
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    // The message stays until the retry has an answer.
    expect(screen.getByText(copy.errors.unavailable)).toBeInTheDocument();
    expect(geocoder.geocode).toHaveBeenCalledTimes(2);
    expect(geocoder.geocode.mock.calls[1][0]).toBe(ADDRESS);
    await userEvent.click(busy);
    expect(geocoder.geocode).toHaveBeenCalledTimes(2);
    await act(async () => finish(PLACE));
    expect(location.history).toEqual(['/', '/p/CC007']);
  });

  it('announces a repeated failure again as a new message', async () => {
    renderLookup(down);
    await search();
    const first = await screen.findByText(copy.errors.unavailable);
    await userEvent.click(retryButton());
    const second = await screen.findByText(copy.errors.unavailable);
    await vi.waitFor(() => expect(first.isConnected).toBe(false));
    expect(second).not.toBe(first);
    expect(retryButton()).toHaveFocus();
  });

  it('drops "Try again" once the voter edits the address', async () => {
    renderLookup(down);
    await search();
    await screen.findByText(copy.errors.unavailable);
    await userEvent.type(input(), ' 63129');
    expect(retryButton()).not.toBeInTheDocument();
    expect(screen.getByText(copy.errors.unavailable)).toBeInTheDocument();
  });

  it('repeats a "Use my location" lookup with the same point, without asking again', async () => {
    locate.mockRejectedValueOnce(new Error('HTTP 503'));
    locate.mockResolvedValueOnce({ kind: 'missouri' });
    renderLookup(async () => null);
    navigator.geolocation.getCurrentPosition.mockImplementation((ok) =>
      ok({ coords: { latitude: 38.66, longitude: -90.45, accuracy: 10 }, timestamp: 1 }),
    );
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));
    await screen.findByText(copy.errors.failed);
    await userEvent.click(retryButton());
    await screen.findByRole('heading', { level: 2 });
    expect(locate).toHaveBeenCalledTimes(2);
    expect(locate.mock.calls[1][0]).toEqual({ lat: 38.66, lng: -90.45 });
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('says it is still working after a few seconds, and stops saying it when done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finish;
    renderLookup(() => new Promise((resolve) => (finish = resolve)));
    await search();
    expect(screen.queryByText(errorCopy.slow)).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(SLOW_MS + 10));
    expect(screen.getByText(errorCopy.slow)).toHaveAttribute('role', 'status');
    await act(async () => finish(null));
    expect(screen.queryByText(errorCopy.slow)).not.toBeInTheDocument();
  });

  it('keeps the address and coordinates out of every message', async () => {
    locate.mockRejectedValue(new Error(`failed at ${PLACE.lat},${PLACE.lng} for ${ADDRESS}`));
    renderLookup(async () => PLACE);
    await search();
    const alert = await screen.findByText(copy.errors.failed);
    const text = alert.closest('[role="alert"]').textContent;
    for (const needle of ['7700', 'Fine', '38.5', '-90.3']) expect(text).not.toContain(needle);
  });
});
