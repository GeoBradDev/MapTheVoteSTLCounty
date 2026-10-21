// Issue #58, review finding: after a pick fills the box with a suggestion's
// label (which holds the county record's ZIP, not one the voter typed),
// searching again must send the pick, not the label as typed text, so the
// geocoder's City check treats it as a pick. Frozen: written red before the fix.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressSearch, { DEBOUNCE_MS } from './AddressSearch.jsx';
import { copy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';

const PLACES = [{ label: '6135 Washington Ave, Saint Louis, MO 63134', lat: 38.7, lng: -90.3 }];

let user;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => vi.useRealTimers());

function renderSearch() {
  const onSubmit = vi.fn();
  render(
    <GeocoderContext.Provider value={createFakeGeocoder(PLACES)}>
      <AddressSearch onSubmit={onSubmit} />
    </GeocoderContext.Provider>,
  );
  return { onSubmit };
}

const input = () => screen.getByRole('combobox', { name: copy.label });
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
  });

describe('searching again after a pick (#58)', () => {
  it('sends the picked suggestion again while the box still holds its label', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '6135 Wash');
    await settle();
    await user.click(screen.getAllByRole('option')[0]);
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ label: PLACES[0].label });
  });

  // Rewritten with the owner's approval (issue #58, 2026-10-21): a space
  // added to the label leaves its ZIP alone, so the search is still a pick.
  it('still sends a pick when the voter adds a space to the label', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '6135 Wash');
    await settle();
    await user.click(screen.getAllByRole('option')[0]);
    await user.type(input(), ' ');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(onSubmit.mock.calls.at(-1)[0]).toMatchObject({ label: PLACES[0].label });
  });
});
