// Issue #58, review rerun finding: text typed or pasted just before the
// picked label's ZIP that starts with the ZIP's own first digit (every St.
// Louis ZIP starts with 6) must not read as an edit inside the ZIP, and a
// digit removed again after a search brings the pick back.
// Frozen: written red before the fix.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressSearch, { DEBOUNCE_MS } from './AddressSearch.jsx';
import { copy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';

const LABEL = '6135 Washington Ave, Saint Louis, MO 63134';
const ZIP_AT = LABEL.indexOf('63134');

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

const beforeZip = { initialSelectionStart: ZIP_AT, initialSelectionEnd: ZIP_AT };

describe('edits starting with the ZIP first digit (#58)', () => {
  it('a unit "Apt 6 " typed just before the ZIP keeps the pick', async () => {
    const sent = await pickThen((input) => user.type(input, 'Apt 6 ', beforeZip));
    expect(sent).toEqual(
      expect.objectContaining({ label: '6135 Washington Ave, Saint Louis, MO Apt 6 63134' }),
    );
  });

  it('"6" typed before the ZIP and deleted again keeps the pick', async () => {
    const sent = await pickThen((input) => user.type(input, '6{Backspace}', beforeZip));
    expect(sent).toEqual(expect.objectContaining({ label: LABEL }));
  });

  it('"6 " pasted just before the ZIP keeps the pick', async () => {
    const sent = await pickThen(async (input) => {
      input.setSelectionRange(ZIP_AT, ZIP_AT);
      await user.paste('6 ');
    });
    expect(sent).toEqual(
      expect.objectContaining({ label: '6135 Washington Ave, Saint Louis, MO 6 63134' }),
    );
  });
});
