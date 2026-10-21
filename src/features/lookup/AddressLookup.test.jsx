import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import election from '../../config/election.js';
import { GeocoderUnavailableError } from '../../data/geocoder.js';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as searchCopy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';
import { locate } from './locate.js';
import { copy } from './lookupCopy.js';
import { copy as noticeCopy } from './outOfCountyCopy.js';

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

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('shows the out-of-county notice for a place outside the county and focuses it', async () => {
    locate.mockResolvedValue({ kind: 'stl-city' });
    const { location } = renderLookup();
    await search();
    const heading = await screen.findByRole('heading', { name: noticeCopy['stl-city'].heading });
    expect(heading.closest('[tabindex="-1"]')).toHaveFocus();
    expect(location.history).toEqual(['/']);
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
    expect(screen.getByText(/including the City of St. Louis/)).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(locate).not.toHaveBeenCalled();
  });

  it('says address search is unavailable when no geocoder is configured', async () => {
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

  it('has error copy that names no party or candidate', () => {
    const text = JSON.stringify(copy).toLowerCase();
    for (const word of ['democrat', 'republican', 'libertarian', 'green party', 'candidate']) {
      expect(text).not.toContain(word);
    }
  });
});
