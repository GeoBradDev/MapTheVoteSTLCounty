// Issue #58, review rerun findings: a pick lasts until the label's ZIP is
// deleted or changed (owner decision). A letter or space typed next to the
// ZIP does not change it, and a paste that changed nothing must not make a
// later drop count as a paste over the ZIP. Frozen: written red before the fix.
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

// A drop as the browser reports it: the new value, then an input event.
function drop(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromDrop' }));
}

describe('edits next to a picked ZIP (#58)', () => {
  it('a unit typed just before the ZIP keeps the pick', async () => {
    const sent = await pickThen((input) =>
      user.type(input, 'Apt 2 ', { initialSelectionStart: ZIP_AT, initialSelectionEnd: ZIP_AT }),
    );
    expect(sent).toEqual(
      expect.objectContaining({ label: '6135 Washington Ave, Saint Louis, MO Apt 2 63134' }),
    );
  });

  it('a stray letter after the ZIP, deleted again, keeps the pick', async () => {
    const end = LABEL.length;
    const sent = await pickThen((input) =>
      user.type(input, 'x{Backspace}', { initialSelectionStart: end, initialSelectionEnd: end }),
    );
    expect(sent).toEqual(expect.objectContaining({ label: LABEL }));
  });

  it('a digit typed after the ZIP changes it and drops the pick', async () => {
    const end = LABEL.length;
    const sent = await pickThen((input) =>
      user.type(input, '5', { initialSelectionStart: end, initialSelectionEnd: end }),
    );
    expect(sent).toBe(`${LABEL}5`);
  });

  it('a drop after a paste that changed nothing keeps the pick', async () => {
    const sent = await pickThen(async (input) => {
      input.setSelectionRange(ZIP_AT, ZIP_AT + 5);
      await user.paste('63134');
      await act(async () => drop(input, `${LABEL} Apt 2`));
    });
    expect(sent).toEqual(expect.objectContaining({ label: `${LABEL} Apt 2` }));
  });
});
