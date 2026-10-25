// Issue #70: a finished lookup is counted with its source and outcome only,
// a Try again with where it was pressed, and a lookup error's official lookup
// links with which message they were in. GA is forced on (trackEvents), so
// the events are read from the real dataLayer, past the real allowlist.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { copy as lookupsCopy } from '../../components/officialLookupsCopy.js';
import { GeocoderUnavailableError } from '../../data/geocoder.js';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import { pressLink, trackEvents } from '../../test/trackedEvents.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as searchCopy } from './addressSearchCopy.js';
import { copy as errorCopy } from './errorCopy.js';
import { GeocoderContext } from './geocoderContext.js';
import { locate } from './locate.js';
import { copy } from './lookupCopy.js';
import { unmountThenUnstub } from '../../test/teardown.js';

vi.mock('./locate.js', () => ({ locate: vi.fn() }));

const ADDRESS = '7700 Fine Rd, Saint Louis, MO 63129';
const PLACE = { label: ADDRESS, lat: 38.5, lng: -90.3, state: 'MO', county: 'St. Louis County' };

let pending;
let tracked;

beforeEach(() => {
  locate.mockReset();
  pending = [];
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition: vi.fn((ok, fail) => pending.push({ ok, fail })) },
  });
  tracked = trackEvents();
});

afterEach(async () => {
  tracked.stop();
  await unmountThenUnstub();
  window.history.replaceState(null, '', '/');
});

function renderLookup(value = createFakeGeocoder([PLACE])) {
  const location = memoryLocation({ path: '/', record: true });
  render(
    <Router hook={location.hook}>
      <GeocoderContext.Provider value={value}>
        <AddressLookup />
      </GeocoderContext.Provider>
    </Router>,
  );
  return location;
}

const input = () => screen.getByRole('combobox', { name: searchCopy.label });

async function search(text = ADDRESS) {
  await userEvent.type(input(), text);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
}

const result = (source, outcome) => ['lookup_result', { source, outcome }];

it('counts an address that finds a precinct, without the address or the code', async () => {
  locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'OAK019' } });
  const location = renderLookup();
  await search();
  expect(location.history).toEqual(['/', '/p/OAK019']);
  expect(await tracked.events()).toEqual([result('address', 'precinct')]);
  const sent = JSON.stringify(tracked.calls());
  for (const needle of ['OAK019', '7700', 'Fine', '63129', '38.5', '90.3']) {
    expect(sent).not.toContain(needle);
  }
});

it('counts a City precinct as a precinct (#88)', async () => {
  locate.mockResolvedValue({
    kind: 'precinct',
    jurisdiction: 'city',
    precinct: { code: 'W01P12' },
  });
  renderLookup();
  await search();
  expect(await tracked.events()).toEqual([result('address', 'precinct')]);
});

it.each([
  ['stl-city', 'city_referral'],
  ['county-unmatched', 'no_precinct'],
  ['out-of-state', 'out_of_area'],
])('counts a %s place as %s', async (kind, outcome) => {
  locate.mockResolvedValue({ kind });
  renderLookup();
  await search();
  await screen.findByRole('heading', { level: 2 });
  expect(await tracked.events()).toEqual([result('address', outcome)]);
});

it('counts a no match, and a precinct code of the wrong shape as failed', async () => {
  renderLookup();
  await search('1 Nowhere St');
  await screen.findByText(copy.errors.noMatch);
  locate.mockResolvedValue({
    kind: 'precinct',
    jurisdiction: 'city',
    precinct: { code: 'OAK019' },
  });
  await userEvent.clear(input());
  await search();
  await screen.findByText(copy.errors.failed);
  expect(await tracked.events()).toEqual([
    result('address', 'no_match'),
    result('address', 'failed'),
  ]);
});

it('counts Try again, and the repeated lookup with its own source', async () => {
  const geocode = vi
    .fn()
    .mockRejectedValueOnce(new GeocoderUnavailableError())
    .mockResolvedValueOnce({ ...PLACE });
  locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'OAK019' } });
  renderLookup({ suggest: async () => [], geocode });
  await search();
  await screen.findByText(copy.errors.unavailable);
  await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
  expect(await tracked.events()).toEqual([
    result('address', 'unavailable'),
    ['retry', { where: 'lookup' }],
    result('address', 'precinct'),
  ]);
});

it('counts Use my location by its outcome, a device failure included', async () => {
  locate.mockResolvedValue({ kind: 'missouri' });
  renderLookup();
  const button = screen.getByRole('button', { name: /use my location/i });
  await userEvent.click(button);
  await act(async () => pending.shift().fail({ code: 1 }));
  await userEvent.click(button);
  await act(async () => pending.shift().fail({ code: 3 }));
  await userEvent.click(button);
  await act(async () =>
    pending.shift().ok({ coords: { latitude: 38.6, longitude: -90.4, accuracy: 9 } }),
  );
  await screen.findByRole('heading', { level: 2 });
  expect(await tracked.events()).toEqual([
    result('location', 'denied'),
    result('location', 'timeout'),
    result('location', 'out_of_area'),
  ]);
  expect(JSON.stringify(tracked.calls())).not.toMatch(/38\.6|90\.4/);
});

it('counts nothing for a lookup the voter edited away', async () => {
  let resolve;
  const geocode = vi.fn(() => new Promise((r) => (resolve = r)));
  renderLookup({ suggest: async () => [], geocode });
  await search();
  await userEvent.type(input(), 'x');
  await act(async () => resolve({ ...PLACE }));
  expect(await tracked.events()).toEqual([]);
});

it.each([
  ['county', lookupsCopy.county],
  ['city', lookupsCopy.city],
])('counts the %s official lookup link of an error, and lets it open', async (_, name) => {
  renderLookup();
  await search('1 Nowhere St');
  await screen.findByText(copy.errors.noMatch);
  expect(await pressLink(userEvent.click, screen.getByRole('link', { name }))).toBe(false);
  expect((await tracked.events()).at(-1)).toEqual([
    'official_lookup_open',
    { card: 'lookup_error' },
  ]);
});
