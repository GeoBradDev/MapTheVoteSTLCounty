import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { copy as lookupsCopy } from '../../components/officialLookupsCopy.js';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { GeocoderUnavailableError } from '../../data/geocoder.js';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as searchCopy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';
import { locate } from './locate.js';
import { lookupFromDevice, lookupPointFor } from './lookupPoint.js';
import { copy } from './lookupCopy.js';
import { copy as noticeCopy } from './outOfCountyCopy.js';
import { copy as locationCopy } from './useMyLocationCopy.js';
import { unmountThenUnstub } from '../../test/teardown.js';

vi.mock('./locate.js', () => ({ locate: vi.fn() }));

const ADDRESS = '7700 Fine Rd, Saint Louis, MO 63129';
const PLACE = { label: ADDRESS, lat: 38.5, lng: -90.3, state: 'MO', county: 'St. Louis County' };

let geocoder;
let pending;

beforeEach(() => {
  geocoder = createFakeGeocoder([PLACE]);
  locate.mockReset();
  pending = [];
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition: vi.fn((ok, fail) => pending.push({ ok, fail })) },
  });
});

afterEach(async () => {
  await unmountThenUnstub();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});

function renderLookup({ withRouter = true, value = geocoder } = {}) {
  const location = memoryLocation({ path: '/', record: true });
  const tree = (
    <GeocoderContext.Provider value={value}>
      <AddressLookup />
    </GeocoderContext.Provider>
  );
  const result = render(withRouter ? <Router hook={location.hook}>{tree}</Router> : tree);
  return { location, ...result };
}

const input = () => screen.getByRole('combobox', { name: searchCopy.label });

async function search(text = ADDRESS) {
  await userEvent.type(input(), text);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
}

describe('AddressLookup', () => {
  // #80: the two ways in come first, one under the other; the fine print
  // (the privacy line and the folded address search credits, #216) follows both.
  it('puts "Use my location" right after "Find my precinct" and the credits after both', () => {
    renderLookup();
    const find = screen.getByRole('button', { name: searchCopy.submit });
    const locate = screen.getByRole('button', { name: /use my location/i });
    const credits = screen.getByText(/sent only to these services/);
    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(find, locate)).toBe(true);
    expect(follows(locate, credits)).toBe(true);
    // The one privacy line comes before the folded credits (#216).
    const line = screen.getByText(/used only to find your precinct\. This site does not save/);
    expect(follows(locate, line)).toBe(true);
    expect(follows(line, screen.getByText(copy.attribution.summary))).toBe(true);
    const buttons = screen.getAllByRole('button');
    expect(buttons.indexOf(locate)).toBe(buttons.indexOf(find) + 1);
  });

  it('geocodes the address, passes the place to locate and opens the precinct', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'OAK019' } });
    const { location } = renderLookup();
    await search();
    expect(geocoder.calls.geocode).toEqual([ADDRESS]);
    expect(locate).toHaveBeenCalledTimes(1);
    expect(locate).toHaveBeenCalledWith({
      lat: 38.5,
      lng: -90.3,
      state: 'MO',
      county: 'St. Louis County',
    });
    expect(location.history).toEqual(['/', '/p/OAK019']);
  });

  it('opens a City precinct by its City code (#88)', async () => {
    locate.mockResolvedValue({
      kind: 'precinct',
      jurisdiction: 'city',
      precinct: { code: 'W01P12' },
    });
    const { location } = renderLookup();
    await search();
    expect(location.history).toEqual(['/', '/p/W01P12']);
    expect(lookupPointFor('W01P12')).toEqual({ lat: 38.5, lng: -90.3 });
  });

  it.each([
    [{ jurisdiction: 'city', precinct: { code: 'OAK019' } }],
    [{ jurisdiction: 'city', precinct: { precinct: 'W01P12' } }],
    [{ jurisdiction: 'county', precinct: { precinct: 'W01P12' } }],
  ])('never opens a code of the other jurisdiction: %j', async (result) => {
    locate.mockResolvedValue({ kind: 'precinct', ...result });
    const { location } = renderLookup();
    await search();
    expect(await screen.findByText(copy.errors.failed)).toBeInTheDocument();
    expect(location.history).toEqual(['/']);
  });

  it('shows the out-of-county notice for a place outside the county and focuses it', async () => {
    locate.mockResolvedValue({ kind: 'stl-city' });
    const { location } = renderLookup();
    await search();
    const heading = await screen.findByRole('heading', { name: noticeCopy['stl-city'].heading });
    expect(heading.closest('[tabindex="-1"]')).toHaveFocus();
    expect(location.history).toEqual(['/']);
  });

  it('gives the notice an h2 by default', async () => {
    locate.mockResolvedValue({ kind: 'stl-city' });
    renderLookup();
    await search();
    const name = noticeCopy['stl-city'].heading;
    expect((await screen.findByRole('heading', { name })).tagName).toBe('H2');
  });

  it('gives the notice the heading level it is asked for', async () => {
    locate.mockResolvedValue({ kind: 'stl-city' });
    render(
      <GeocoderContext.Provider value={geocoder}>
        <Router hook={memoryLocation({ path: '/' }).hook}>
          <AddressLookup noticeHeadingLevel={3} />
        </Router>
      </GeocoderContext.Provider>,
    );
    await search();
    const name = noticeCopy['stl-city'].heading;
    expect((await screen.findByRole('heading', { name })).tagName).toBe('H3');
  });

  it('sends a "Use my location" point through locate and shows the unknown notice', async () => {
    locate.mockResolvedValue({ kind: 'unknown' });
    renderLookup();
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));
    await act(async () => {
      pending
        .shift()
        .ok({ coords: { latitude: 38.627, longitude: -90.199, accuracy: 10 }, timestamp: 1 });
    });
    expect(locate).toHaveBeenCalledWith({ lat: 38.627, lng: -90.199 });
    expect(
      await screen.findByRole('heading', { name: noticeCopy.unknown.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(/anywhere else in Missouri/)).toBeInTheDocument();
  });

  it('wires the address box to "Use my location", so a denied request focuses it', async () => {
    renderLookup();
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));
    await act(async () => {
      pending.shift().fail({ code: 1 });
    });
    expect(input()).toHaveFocus();
  });

  it('says when no address matched, with the official lookup as a fallback', async () => {
    renderLookup();
    await search('1 Nowhere St');
    expect(await screen.findByText(copy.errors.noMatch)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: lookupsCopy.county })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    // No jurisdiction is known yet (#93): both boards' lookups.
    expect(screen.getByRole('link', { name: lookupsCopy.city })).toHaveAttribute(
      'href',
      referrals.stlCityLookup.url,
    );
    expect(locate).not.toHaveBeenCalled();
    expect(copy.errors.noMatch).toMatch(/Use my location/);
  });

  it('says address search is unavailable when the geocoder cannot be reached', async () => {
    renderLookup({
      value: {
        suggest: async () => [],
        geocode: async () => {
          throw new GeocoderUnavailableError();
        },
      },
    });
    await search();
    expect(await screen.findByText(copy.errors.unavailable)).toBeInTheDocument();
    expect(copy.errors.unavailable).toMatch(/Use my location/);
    expect(screen.getByRole('link', { name: lookupsCopy.county })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    // No jurisdiction is known yet (#93): both boards' lookups.
    expect(screen.getByRole('link', { name: lookupsCopy.city })).toHaveAttribute(
      'href',
      referrals.stlCityLookup.url,
    );
    expect(locate).not.toHaveBeenCalled();
  });

  // #93: the address may be in the City or the County, so no message names one board's map.
  it('names neither board alone in its error messages', () => {
    for (const message of Object.values(copy.errors)) expect(message).not.toMatch(/county|city/i);
  });

  it('says the lookup failed, not unavailable, when the geocoder errors', async () => {
    renderLookup({
      value: { suggest: async () => [], geocode: vi.fn().mockRejectedValue(new Error('500')) },
    });
    await search();
    expect(await screen.findByText(copy.errors.failed)).toBeInTheDocument();
  });

  it('geocodes once for two submits in the same tick', async () => {
    const value = { suggest: async () => [], geocode: vi.fn(() => new Promise(() => {})) };
    renderLookup({ value });
    await userEvent.type(input(), ADDRESS);
    act(() => {
      input().form.requestSubmit();
      input().form.requestSubmit();
    });
    expect(value.geocode).toHaveBeenCalledTimes(1);
  });

  it('drops a late "Use my location" answer once a suggestion is picked with a pointer', async () => {
    locate.mockResolvedValue({ kind: 'missouri' });
    const value = createFakeGeocoder([PLACE]);
    renderLookup({ value });
    await userEvent.type(input(), '7700');
    const option = await screen.findByRole('option', {}, { timeout: 2000 });
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));
    input().focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.click(option.isConnected ? option : screen.getByRole('option'));
    await screen.findByRole('heading', { name: noticeCopy.missouri.heading });
    await act(async () => {
      pending.shift().ok({ coords: { latitude: 1, longitude: 2, accuracy: 10 }, timestamp: 1 });
    });
    expect(locate).toHaveBeenCalledTimes(1);
    expect(locate).not.toHaveBeenCalledWith({ lat: 1, lng: 2 });
  });

  it('says the lookup failed when locate throws, and keeps the address for a retry', async () => {
    locate.mockRejectedValue(new Error('ArcGIS down'));
    renderLookup();
    await search();
    expect(await screen.findByText(copy.errors.failed)).toBeInTheDocument();
    expect(input()).toHaveValue(ADDRESS);
  });

  it('treats a precinct with a malformed code as a failed lookup', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: '../x' } });
    const { location } = renderLookup();
    await search();
    expect(await screen.findByText(copy.errors.failed)).toBeInTheDocument();
    expect(location.history).toEqual(['/']);
  });

  it('marks the search busy while looking up and ignores another submit', async () => {
    let finish;
    locate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderLookup();
    await search();
    expect(screen.getByRole('button', { name: searchCopy.busy })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.keyboard('{Enter}');
    expect(locate).toHaveBeenCalledTimes(1);
    await act(async () => finish({ kind: 'missouri' }));
    expect(screen.getByRole('button', { name: searchCopy.submit })).toBeInTheDocument();
  });

  it('clears an earlier notice when a new search starts', async () => {
    locate.mockResolvedValueOnce({ kind: 'missouri' });
    renderLookup();
    await search();
    await screen.findByRole('heading', { name: noticeCopy.missouri.heading });
    locate.mockReturnValueOnce(new Promise(() => {}));
    await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
    expect(
      screen.queryByRole('heading', { name: noticeCopy.missouri.heading }),
    ).not.toBeInTheDocument();
  });

  it('cancels a running lookup when the voter edits the address, and runs the new one', async () => {
    const OTHER = { label: '9225 Lackland Rd, Saint Louis, MO 63114', lat: 38.7, lng: -90.4 };
    const value = createFakeGeocoder([PLACE, OTHER]);
    let finishFirst;
    locate
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ kind: 'precinct', precinct: { precinct: 'MID014' } });
    const { location } = renderLookup({ value });
    await search();
    expect(locate).toHaveBeenCalledTimes(1);
    await userEvent.clear(input());
    expect(screen.getByRole('button', { name: searchCopy.submit })).toBeInTheDocument();
    await search(OTHER.label);
    await act(async () => finishFirst({ kind: 'precinct', precinct: { precinct: 'OAK019' } }));
    expect(locate).toHaveBeenCalledTimes(2);
    expect(locate).toHaveBeenLastCalledWith({
      lat: 38.7,
      lng: -90.4,
      state: undefined,
      county: undefined,
    });
    expect(location.history).toEqual(['/', '/p/MID014']);
  });

  it('drops a result that arrives after it unmounts', async () => {
    let finish;
    locate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { location, unmount } = renderLookup();
    await search();
    unmount();
    await act(async () => finish({ kind: 'precinct', precinct: { precinct: 'OAK019' } }));
    expect(location.history).toEqual(['/']);
  });

  it('keeps the address and coordinates out of the URL, history state, title and storage', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'OAK019' } });
    renderLookup({ withRouter: false });
    await search();
    expect(window.location.pathname).toBe('/p/OAK019');
    const seen = [
      window.location.href,
      JSON.stringify(window.history.state),
      document.title,
      JSON.stringify({ ...localStorage }),
      JSON.stringify({ ...sessionStorage }),
    ].join(' ');
    for (const needle of ['7700', 'Fine', '38.5', '-90.3']) expect(seen).not.toContain(needle);
  });

  it('hands the looked-up point to the precinct page in memory only', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'OAK019' } });
    const { location } = renderLookup();
    await search();
    expect(location.history).toEqual(['/', '/p/OAK019']);
    expect(lookupPointFor('OAK019')).toEqual({ lat: 38.5, lng: -90.3 });
    // Only for the precinct it found.
    expect(lookupPointFor('CC007')).toBeNull();
  });

  it('hands a "Use my location" point over too', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'CC007' } });
    renderLookup();
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));
    await act(async () => {
      pending
        .shift()
        .ok({ coords: { latitude: 38.66, longitude: -90.45, accuracy: 10 }, timestamp: 1 });
    });
    expect(lookupPointFor('CC007')).toEqual({ lat: 38.66, lng: -90.45 });
    // So the precinct page can say the device may not be at home (#216).
    expect(lookupFromDevice('CC007')).toBe(true);
  });

  it('does not mark a typed address as the device location', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'OAK019' } });
    renderLookup();
    await search();
    expect(lookupFromDevice('OAK019')).toBe(false);
  });

  // #216: shown after a Use my location result, not before.
  it('says the device may not be at home with an out-of-area location result', async () => {
    locate.mockResolvedValue({ kind: 'missouri' });
    renderLookup();
    expect(screen.queryByText(locationCopy.notHome)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));
    await act(async () => {
      pending
        .shift()
        .ok({ coords: { latitude: 38.8, longitude: -90.5, accuracy: 10 }, timestamp: 1 });
    });
    await screen.findByRole('heading', { name: noticeCopy.missouri.heading });
    expect(screen.getByText(locationCopy.notHome)).toBeInTheDocument();
  });

  it('does not add the device note to an out-of-area address result', async () => {
    locate.mockResolvedValue({ kind: 'missouri' });
    renderLookup();
    await search();
    await screen.findByRole('heading', { name: noticeCopy.missouri.heading });
    expect(screen.queryByText(locationCopy.notHome)).not.toBeInTheDocument();
  });

  it('credits OpenStreetMap contributors after the two ways in', () => {
    renderLookup();
    expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
  });

  it('has error copy that names no party or candidate', () => {
    const text = JSON.stringify(copy).toLowerCase();
    for (const word of ['democrat', 'republican', 'libertarian', 'green party', 'candidate']) {
      expect(text).not.toContain(word);
    }
  });
});
