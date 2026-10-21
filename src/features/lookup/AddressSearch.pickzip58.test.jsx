// Issue #58, owner decision (2026-10-21): after a pick, a search stays a pick
// until the label's ZIP itself is deleted or changed, so a City voter who
// edits other parts of the label still gets the City check without the
// county's ZIP. Frozen: written red before the fix.
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

const at = (start, end = start) => ({ initialSelectionStart: start, initialSelectionEnd: end });

describe('editing a picked label away from its ZIP (#58)', () => {
  it('deleting ", MO" keeps the pick', async () => {
    const from = LABEL.indexOf(', MO');
    const sent = await pickThen((input) => user.type(input, '{Backspace}', at(from, from + 4)));
    expect(sent).toEqual(
      expect.objectContaining({ label: '6135 Washington Ave, Saint Louis 63134' }),
    );
  });

  it('changing "Saint Louis" to "St. Louis" keeps the pick', async () => {
    const from = LABEL.indexOf('Saint');
    const sent = await pickThen((input) => user.type(input, 'St.', at(from, from + 5)));
    expect(sent).toEqual(
      expect.objectContaining({ label: '6135 Washington Ave, St. Louis, MO 63134' }),
    );
  });

  it('a space at the start keeps the pick', async () => {
    const sent = await pickThen((input) => user.type(input, ' ', at(0)));
    expect(sent).toEqual(expect.objectContaining({ label: LABEL }));
  });

  it('changing the ZIP drops the pick', async () => {
    const from = LABEL.indexOf('63134');
    const sent = await pickThen((input) => user.type(input, '63112', at(from, from + 5)));
    expect(sent).toBe('6135 Washington Ave, Saint Louis, MO 63112');
  });
});
