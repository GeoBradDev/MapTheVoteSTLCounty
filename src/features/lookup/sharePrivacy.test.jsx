// End to end through the real app and the browser's own location: a search
// opens the precinct page, and nothing the voter typed, nor the coordinates it
// found, reaches the URL, the history state, the title or the shared link.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import absenteeSites from '../../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import precinctGeometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import byId from '../../../docs/raw/fixtures/precinct-by-id.json';
import App from '../../App.jsx';
import election from '../../config/election.js';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import { copy as searchCopy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';
import { locate } from './locate.js';
import { copy } from './resultsCopy.js';
import { unmountThenUnstub } from '../../test/teardown.js';

vi.mock('./locate.js', () => ({ locate: vi.fn() }));

const ADDRESS = '7700 Fine Rd, Saint Louis, MO 63129';
const PLACE = {
  label: ADDRESS,
  lat: 38.512345,
  lng: -90.312345,
  state: 'MO',
  county: 'St. Louis County',
};
const NEEDLES = ['7700', 'Fine', '63129', '38.51', '90.31'];

function respond(body) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

let share;
let writeText;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'CC007' } });
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
  share = vi.fn().mockResolvedValue(undefined);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(async () => {
  await unmountThenUnstub();
  delete navigator.share;
  delete navigator.clipboard;
  window.history.replaceState(null, '', '/');
});

it('keeps the address and its coordinates out of the URL, history state, title and share', async () => {
  render(
    <GeocoderContext.Provider value={createFakeGeocoder([PLACE])}>
      <App />
    </GeocoderContext.Provider>,
  );
  await userEvent.type(screen.getByRole('combobox', { name: searchCopy.label }), ADDRESS);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
  await screen.findByText(copy.ready('CC007'));
  expect(window.location.pathname).toBe('/p/CC007');

  await userEvent.click(screen.getByRole('button', { name: copy.share.button }));
  expect(share).toHaveBeenCalledWith({
    title: copy.share.title('CC007'),
    url: 'https://mapthevotestl.com/p/CC007',
  });

  // And the clipboard path, for browsers without a share sheet.
  delete navigator.share;
  await userEvent.click(screen.getByRole('button', { name: copy.share.button }));
  expect(writeText).toHaveBeenCalledWith('https://mapthevotestl.com/p/CC007');

  const seen = [
    window.location.href,
    JSON.stringify(window.history.state),
    document.title,
    JSON.stringify(share.mock.calls),
    JSON.stringify(writeText.mock.calls),
  ].join(' ');
  for (const needle of NEEDLES) expect(seen).not.toContain(needle);
});
