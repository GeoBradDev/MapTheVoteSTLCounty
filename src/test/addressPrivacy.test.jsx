// Issue #20: no address persists after a lookup. Runs the real app, its real
// precinct lookup (locate and the ArcGIS client) and the real Use my location
// flow over stubbed network and geolocation, then looks everywhere the browser
// could keep the address or its coordinates: storage, cookies, Cache Storage,
// IndexedDB, the URL, the history state, the title and the console. Only the
// geocoder is a fake. A real browser's HTTP cache and devtools storage are
// checked by hand (README, Privacy).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import absenteeSites from '../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../docs/raw/fixtures/polls.json';
import precinctGeometry from '../../docs/raw/fixtures/precinct-geometry.json';
import byId from '../../docs/raw/fixtures/precinct-by-id.json';
import App from '../App.jsx';
import election from '../config/election.js';
import { copy as searchCopy } from '../features/lookup/addressSearchCopy.js';
import { GeocoderContext } from '../features/lookup/geocoderContext.js';
import { copy } from '../features/lookup/resultsCopy.js';
import { copy as locationCopy } from '../features/lookup/useMyLocationCopy.js';
import { createFakeGeocoder } from './fakeGeocoder.js';

const ADDRESS = '7700 Fine Rd, Saint Louis, MO 63129';
const PLACE = {
  label: ADDRESS,
  lat: 38.512345,
  lng: -90.312345,
  state: 'MO',
  county: 'St. Louis County',
};
const DEVICE = { latitude: 38.523456, longitude: -90.323456, accuracy: 10 };
const NEEDLES = ['7700', 'Fine Rd', '63129', '38.51', '90.31', '38.52', '90.32'];
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug', 'trace'];

function respond(body) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function entries(storage) {
  return Array.from({ length: storage.length }, (_, i) => {
    const key = storage.key(i);
    return `${key}=${storage.getItem(key)}`;
  });
}

// Everything the browser keeps that a later visitor or a script could read.
async function kept() {
  const parts = [
    window.location.href,
    JSON.stringify(window.history.state),
    document.title,
    document.cookie,
    ...entries(window.localStorage),
    ...entries(window.sessionStorage),
  ];
  // Cache Storage (a service worker, #183): every cached request URL, not just
  // the cache names. jsdom has none, so this runs only where it exists.
  if (globalThis.caches) {
    for (const name of await globalThis.caches.keys()) {
      const cache = await globalThis.caches.open(name);
      parts.push(name, ...(await cache.keys()).map((request) => request.url));
    }
  }
  // IndexedDB: database names only (the app opens none; no-storage.test.js
  // fails if it starts to). jsdom has none either.
  if (globalThis.indexedDB?.databases) {
    parts.push(...(await globalThis.indexedDB.databases()).map((db) => db.name));
  }
  return parts.join(' ');
}

let consoleCalls;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn((input) => {
      const url = new URL(input);
      if (url.pathname.includes(election.layers.polls)) {
        const absentee = url.searchParams.get('where') === election.absenteeWhere;
        return respond(absentee ? absenteeSites : polls);
      }
      if (url.searchParams.get('f') === 'geojson') return respond(precinctGeometry);
      // The point query and the by-code query both answer with CC007.
      return respond(byId);
    }),
  );
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: vi.fn((ok) => ok({ coords: DEVICE, timestamp: Date.now() })),
    },
  });
  consoleCalls = CONSOLE.map((method) => vi.spyOn(console, method));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

function renderApp() {
  render(
    <GeocoderContext.Provider value={createFakeGeocoder([PLACE])}>
      <App />
    </GeocoderContext.Provider>,
  );
}

// The point went to the precinct query in a POST body, kept out of the HTTP
// cache (#38), and no request URL holds it.
function expectPointSentPrivately(geometry) {
  const calls = fetch.mock.calls;
  const point = calls.find(
    ([, init]) => new URLSearchParams(init?.body).get('geometry') === geometry,
  );
  expect(point?.[1]).toMatchObject({ method: 'POST', cache: 'no-store' });
  const [lng, lat] = geometry.split(',');
  for (const [input] of calls) {
    const url = decodeURIComponent(String(input));
    expect(url).not.toContain(lng.slice(0, 6));
    expect(url).not.toContain(lat.slice(0, 5));
  }
}

async function expectNothingKept() {
  const seen = await kept();
  for (const needle of NEEDLES) expect(seen).not.toContain(needle);
  for (const spy of consoleCalls) expect(spy).not.toHaveBeenCalled();
}

it('sends the found point to the precinct query, so the lookup really ran', async () => {
  renderApp();
  await userEvent.type(screen.getByRole('combobox', { name: searchCopy.label }), ADDRESS);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
  await screen.findByText(copy.ready('CC007'));

  expectPointSentPrivately('-90.312345,38.512345');
});

it('keeps no trace of a typed address after a lookup', async () => {
  renderApp();
  await userEvent.type(screen.getByRole('combobox', { name: searchCopy.label }), ADDRESS);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
  await screen.findByText(copy.ready('CC007'));
  expect(window.location.pathname).toBe('/p/CC007');

  await expectNothingKept();
});

it('keeps no trace of the device location after Use my location', async () => {
  renderApp();
  await userEvent.click(screen.getByRole('button', { name: locationCopy.button }));
  await screen.findByText(copy.ready('CC007'));
  expect(window.location.pathname).toBe('/p/CC007');
  expectPointSentPrivately('-90.323456,38.523456');

  await expectNothingKept();
});

it('looks in storage for real, so a stored address would fail', async () => {
  window.localStorage.setItem('last', ADDRESS);
  try {
    expect(await kept()).toContain('7700');
  } finally {
    window.localStorage.clear();
  }
});

it('looks inside Cache Storage entries, so a cached point query would fail', async () => {
  const url = 'https://example.org/query?geometry=-90.312345%2C38.512345';
  vi.stubGlobal('caches', {
    keys: async () => ['v1'],
    open: async () => ({ keys: async () => [new Request(url)] }),
  });
  expect(await kept()).toContain('38.51');
});
