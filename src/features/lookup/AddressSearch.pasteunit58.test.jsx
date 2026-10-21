// Issue #58, verifier finding: pasting a unit into a picked label leaves the
// label's ZIP alone, so under the owner's rule (a pick lasts until its ZIP is
// deleted or changed) the search is still a pick. Selecting the whole box and
// pasting over it replaces the ZIP, so that forgets the pick.
// Frozen: written red before the fix.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressSearch, { DEBOUNCE_MS } from './AddressSearch.jsx';
import { copy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';

const LABEL = '6135 Washington Ave, Saint Louis, MO 63134';

let user;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => vi.useRealTimers());

async function pickThen(edit) {
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
  await edit(input);
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: copy.submit }));
  return onSubmit.mock.calls.at(-1)[0];
}

describe('pasting into a picked label (#58)', () => {
  it('a unit pasted at the end keeps the pick', async () => {
    const sent = await pickThen(async (input) => {
      input.setSelectionRange(LABEL.length, LABEL.length);
      await user.paste(' Apt 2');
    });
    expect(sent).toEqual(expect.objectContaining({ label: `${LABEL} Apt 2` }));
  });

  it('a paste over the whole box forgets the pick, even with the same ZIP', async () => {
    const sent = await pickThen(async (input) => {
      input.setSelectionRange(0, LABEL.length);
      await user.paste('6135 Washington Ave, St. Louis, MO 63134');
    });
    expect(sent).toBe('6135 Washington Ave, St. Louis, MO 63134');
  });
});
