// Issue #58, review finding: once the picked label's ZIP has left the box,
// a ZIP the voter types later is their own, even the same one. Retyping the
// address from scratch with a county-only ZIP must go as typed text, so the
// voter can still reach their county precinct. Frozen: written red before the fix.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressSearch, { DEBOUNCE_MS } from './AddressSearch.jsx';
import { copy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';

const LABEL = '6135 Washington Ave, Saint Louis, MO 63134';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

it('sends a retyped address with the same ZIP as typed text after a pick (#58)', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const onSubmit = vi.fn();
  render(
    <GeocoderContext.Provider value={createFakeGeocoder([{ label: LABEL, lat: 38.7, lng: -90.3 }])}>
      <AddressSearch onSubmit={onSubmit} />
    </GeocoderContext.Provider>,
  );
  const input = screen.getByRole('combobox', { name: copy.label });
  await user.type(input, '6135 Wash');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
  });
  await user.click(screen.getAllByRole('option')[0]);
  await user.clear(input);
  await user.type(input, '6135 Washington Ave 63134');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(onSubmit.mock.calls.at(-1)[0]).toBe('6135 Washington Ave 63134');
});
