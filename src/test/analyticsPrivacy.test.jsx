// Issue #69: with Google Analytics forced on, a real lookup sends Google
// nothing about the voter. The real app, its real lookup and Use my location
// run over stubbed network and geolocation (as in addressPrivacy.test.jsx);
// GA is started on a stand-in window at the production origin, so every call
// the app makes lands in that window's dataLayer, which is checked for the
// address, its parts, the coordinates and the precinct code.
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import absenteeSites from '../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../docs/raw/fixtures/polls.json';
import precinctGeometry from '../../docs/raw/fixtures/precinct-geometry.json';
import byId from '../../docs/raw/fixtures/precinct-by-id.json';
import App from '../App.jsx';
import { PAGE_TITLES } from '../analytics/ga.js';
import { startAnalytics } from '../analytics/index.js';
import election from '../config/election.js';
import { siteUrl } from '../config/site.js';
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
const NEEDLES = [
  '7700',
  'Fine Rd',
  'Fine',
  '63129',
  '38.51',
  '90.31',
  '38.52',
  '90.32',
  'CC007',
  'cc007',
];

const respond = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

let ga;
let stop;

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
      return respond(byId);
    }),
  );
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: vi.fn((ok) => ok({ coords: DEVICE, timestamp: Date.now() })),
    },
  });
  // GA forced on: the production origin, an ID, no GPC, already loaded, so
  // ga.js loads at once. Google's script tag lands in the stand-in's own
  // document, which runs no scripts.
  ga = {
    location: { origin: siteUrl, pathname: '/' },
    navigator: {},
    document: document.implementation.createHTMLDocument('stand-in'),
    addEventListener: () => {},
  };
  stop = startAnalytics(ga, 'G-TEST123');
});

afterEach(() => {
  stop?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

function renderApp() {
  // StrictMode, as src/main.jsx renders it: its second effect run must not
  // count a second page view.
  render(
    <StrictMode>
      <GeocoderContext.Provider value={createFakeGeocoder([PLACE])}>
        <App />
      </GeocoderContext.Provider>
    </StrictMode>,
  );
}

const calls = () => (ga.dataLayer ?? []).map((entry) => Array.from(entry));
const pageViews = () =>
  calls()
    .filter(([command, name]) => command === 'event' && name === 'page_view')
    .map(([, , hit]) => hit);

function expectNothingAboutTheVoter() {
  const sent = JSON.stringify(calls());
  for (const needle of NEEDLES) expect(sent).not.toContain(needle);
  expect(sent).not.toContain(document.title);
}

it('starts on, so the checks below see what the app sends', async () => {
  expect(stop).toBeTypeOf('function');
  await vi.dynamicImportSettled();
  expect(calls()[0][0]).toBe('consent');
});

it('reports a typed address lookup as the home page and /p/:precinct only', async () => {
  renderApp();
  await userEvent.type(screen.getByRole('combobox', { name: searchCopy.label }), ADDRESS);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
  await screen.findByText(copy.ready('CC007'));
  expect(window.location.pathname).toBe('/p/CC007');
  await vi.dynamicImportSettled();

  expect(pageViews()).toEqual([
    { page_location: `${siteUrl}/`, page_title: PAGE_TITLES['/'], page_referrer: '' },
    {
      page_location: `${siteUrl}/p/:precinct`,
      page_title: PAGE_TITLES['/p/:precinct'],
      page_referrer: '',
    },
  ]);
  expectNothingAboutTheVoter();
});

it('sends nothing about the device location after Use my location', async () => {
  renderApp();
  await userEvent.click(screen.getByRole('button', { name: locationCopy.button }));
  await screen.findByText(copy.ready('CC007'));
  expect(window.location.pathname).toBe('/p/CC007');
  await vi.dynamicImportSettled();

  expect(pageViews().map((hit) => hit.page_location)).toEqual([
    `${siteUrl}/`,
    `${siteUrl}/p/:precinct`,
  ]);
  expectNothingAboutTheVoter();
});

it.each(['/p/cc007', '/p/cc007/', '/p/CC007%20', '/p/%20cc007'])(
  'counts a shared link like %s once, under the redacted path',
  async (link) => {
    window.history.replaceState(null, '', link);
    renderApp();
    await screen.findByText(copy.ready('CC007'));
    expect(window.location.pathname).toBe('/p/CC007');
    await vi.dynamicImportSettled();
    expect(pageViews().map((hit) => hit.page_location)).toEqual([`${siteUrl}/p/:precinct`]);
    expectNothingAboutTheVoter();
  },
);

it('checks the dataLayer for real, so a code in a page view would fail', async () => {
  await vi.dynamicImportSettled();
  ga.dataLayer.push(['event', 'page_view', { page_location: `${siteUrl}/p/CC007` }]);
  expect(() => expectNothingAboutTheVoter()).toThrow();
});
