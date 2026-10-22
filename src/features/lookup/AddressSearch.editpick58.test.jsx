// Issue #58, review finding: a voter who picks a suggestion and then adds to
// its label (a unit) still has the source's ZIP in the box, not one they
// typed. That search must go to the geocoder as a pick, so the City check
// ignores the ZIP. Frozen: written red before the fix.
// Since the owner's decision of 2026-10-22 (#88) the geocoder counts a
// label's ZIP as typed, so a pick and the same text get the same answer;
// this test still holds the box's pick tracking (comment updated with the
// owner's approval of rewriting the #58 tests).
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

async function pickThenType(extra) {
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
  await user.type(input, extra);
  await user.click(screen.getByRole('button', { name: copy.submit }));
  return onSubmit.mock.calls.at(-1)[0];
}

describe('editing a picked label (#58)', () => {
  it('sends the edited text as a pick while it keeps the suggestion ZIP', async () => {
    await expect(pickThenType(' Apt 2')).resolves.toEqual(
      expect.objectContaining({ label: `${LABEL} Apt 2` }),
    );
  });

  it('sends typed text once the suggestion ZIP is gone', async () => {
    await expect(
      pickThenType('{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}63112'),
    ).resolves.toBe('6135 Washington Ave, Saint Louis, MO 63112');
  });
});
