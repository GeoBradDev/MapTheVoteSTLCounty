// Issue #53: a new search forgets the point of the one before, whatever its
// outcome, so Back, a failed search, then Forward does not measure from an
// earlier voter's address.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router, Switch, useParams } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as searchCopy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';
import { locate } from './locate.js';
import { lookupPointFor } from './lookupPoint.js';
import { copy } from './lookupCopy.js';
import { unmountThenUnstub } from '../../test/teardown.js';

vi.mock('./locate.js', () => ({ locate: vi.fn() }));

const A = { label: '7700 Fine Rd, Saint Louis, MO 63129', lat: 38.5, lng: -90.3 };

// Stands in for the precinct page: it reads the remembered point on arrival.
function Probe() {
  const { precinct } = useParams();
  const point = lookupPointFor(precinct);
  return <p data-testid="probe">{point ? 'has point' : 'no point'}</p>;
}

function renderApp(geocoder) {
  const location = memoryLocation({ path: '/', record: true });
  render(
    <GeocoderContext.Provider value={geocoder}>
      <Router hook={location.hook}>
        <Switch>
          <Route path="/p/:precinct" component={Probe} />
          <Route>
            <AddressLookup />
          </Route>
        </Switch>
      </Router>
    </GeocoderContext.Provider>,
  );
  return location;
}

const input = () => screen.getByRole('combobox', { name: searchCopy.label });

async function search(text) {
  await userEvent.clear(input());
  await userEvent.type(input(), text);
  await userEvent.click(screen.getByRole('button', { name: searchCopy.submit }));
}

beforeEach(() => {
  locate.mockReset();
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition: vi.fn((ok, fail) => fail({ code: 1 })) },
  });
});

afterEach(() => unmountThenUnstub());

describe('the lookup point after a failed search (#53)', () => {
  it('is forgotten by a search with no match: Back, failed search, Forward', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'CC007' } });
    const location = renderApp(createFakeGeocoder([A]));
    await search(A.label);
    expect(await screen.findByTestId('probe')).toHaveTextContent('has point');
    act(() => location.navigate('/'));
    await search('1 Nowhere St');
    expect(await screen.findByText(copy.errors.noMatch)).toBeInTheDocument();
    expect(lookupPointFor('CC007')).toBeNull();
    act(() => location.navigate('/p/CC007'));
    expect(screen.getByTestId('probe')).toHaveTextContent('no point');
  });

  it('is forgotten when Use my location is pressed, even if it then fails', async () => {
    locate.mockResolvedValue({ kind: 'precinct', precinct: { precinct: 'CC007' } });
    const location = renderApp(createFakeGeocoder([A]));
    await search(A.label);
    await screen.findByTestId('probe');
    act(() => location.navigate('/'));
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }));
    expect(lookupPointFor('CC007')).toBeNull();
  });

  it('is forgotten by a search that fails', async () => {
    locate.mockResolvedValueOnce({ kind: 'precinct', precinct: { precinct: 'CC007' } });
    locate.mockRejectedValueOnce(new Error('ArcGIS down'));
    const location = renderApp(createFakeGeocoder([A]));
    await search(A.label);
    await screen.findByTestId('probe');
    act(() => location.navigate('/'));
    await search(A.label);
    expect(await screen.findByText(copy.errors.failed)).toBeInTheDocument();
    expect(lookupPointFor('CC007')).toBeNull();
  });
});
