// Issue #58, review finding: replacing the whole box in one edit (select all
// and paste) after a pick is the voter's own text, even with the label's ZIP
// in it, so a county voter can still reach the precinct with a county-only
// ZIP. Frozen: written red before the fix.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressSearch, { DEBOUNCE_MS } from './AddressSearch.jsx';
import { copy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';

const LABEL = '6135 Washington Ave, Saint Louis, MO 63134';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

it('sends text pasted over a picked label as typed text (#58)', async () => {
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
  fireEvent.change(input, { target: { value: '6135 Washington Ave, St. Louis, MO 63134' } });
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: copy.submit }));
  expect(onSubmit.mock.calls.at(-1)[0]).toBe('6135 Washington Ave, St. Louis, MO 63134');
});
