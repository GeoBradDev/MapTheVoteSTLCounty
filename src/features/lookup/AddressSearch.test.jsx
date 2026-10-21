import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import AddressSearch, { DEBOUNCE_MS, MIN_CHARS } from './AddressSearch.jsx';
import { copy } from './addressSearchCopy.js';
import { GeocoderContext } from './geocoderContext.js';

const PLACES = [
  { label: '7700 Fine Rd, Saint Louis, MO 63129', lat: 38.5, lng: -90.3 },
  { label: '7701 Fine Rd, Saint Louis, MO 63129', lat: 38.51, lng: -90.31 },
  { label: '7702 Fine Rd, Saint Louis, MO 63129', lat: 38.52, lng: -90.32 },
];

let geocoder;
let user;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  geocoder = createFakeGeocoder(PLACES);
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSearch(props = {}) {
  const onSubmit = vi.fn();
  render(
    <GeocoderContext.Provider value={props.geocoder ?? geocoder}>
      <AddressSearch onSubmit={onSubmit} {...props} />
    </GeocoderContext.Provider>,
  );
  return { onSubmit };
}

const input = () => screen.getByRole('combobox', { name: copy.label });
const listbox = () => screen.queryByRole('listbox');
const options = () => screen.queryAllByRole('option');

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
  });
}

describe('AddressSearch', () => {
  it('is a labeled combobox inside a form, collapsed at first', () => {
    renderSearch();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).toHaveAttribute('aria-autocomplete', 'list');
    expect(input()).toHaveAttribute('autocomplete', 'off');
    expect(input().form).not.toBeNull();
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getByRole('button', { name: copy.submit })).toHaveAttribute('type', 'submit');
  });

  it(`waits ${DEBOUNCE_MS} ms after typing and ${MIN_CHARS} characters before suggesting`, async () => {
    renderSearch();
    await user.type(input(), '77');
    await settle();
    expect(geocoder.calls.suggest).toEqual([]);

    await user.type(input(), '0');
    expect(geocoder.calls.suggest).toEqual([]);
    await settle();
    expect(geocoder.calls.suggest).toEqual(['770']);
    expect(options().map((o) => o.textContent)).toEqual(PLACES.map((p) => p.label));
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', listbox().id);
    expect(screen.getByRole('status')).toHaveTextContent(copy.suggestionCount(3));
  });

  it('aborts an in-flight suggestion request when the text changes', async () => {
    const slow = createFakeGeocoder(PLACES, { delayMs: 1000 });
    renderSearch({ geocoder: slow });
    await user.type(input(), '7700');
    await settle();
    expect(slow.calls.suggest).toEqual(['7700']);
    await user.type(input(), ' F');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1100);
    });
    expect(slow.calls.suggest).toEqual(['7700', '7700 F']);
    expect(options().map((o) => o.textContent)).toEqual([PLACES[0].label]);
  });

  it('never shows suggestions for text the voter has since changed', async () => {
    let resolveFirst;
    const manual = {
      suggest: vi.fn(
        (text) =>
          new Promise((resolve) => {
            if (text === '7700') resolveFirst = resolve;
            else resolve([]);
          }),
      ),
      geocode: vi.fn(),
    };
    renderSearch({ geocoder: manual });
    await user.type(input(), '7700');
    await settle();
    await user.clear(input());
    await act(async () => {
      resolveFirst([{ id: 'a', label: 'stale' }]);
    });
    expect(options()).toEqual([]);
  });

  it('shows no suggestions and no error when suggesting fails', async () => {
    renderSearch({
      geocoder: { suggest: vi.fn().mockRejectedValue(new Error('down')), geocode: vi.fn() },
    });
    await user.type(input(), '7700');
    await settle();
    expect(listbox()).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves through suggestions with the arrow keys and picks one with Enter', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '770');
    await settle();
    await user.keyboard('{ArrowDown}');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);
    await user.keyboard('{ArrowUp}');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[2].id);
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ label: PLACES[2].label });
    expect(input()).toHaveValue(PLACES[2].label);
    expect(listbox()).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
  });

  it('outlines the active suggestion in forced colors, where its fill is removed', async () => {
    renderSearch();
    await user.type(input(), '770');
    await settle();
    const classes = options()[0].className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        'forced-colors:aria-selected:outline-2',
        'forced-colors:aria-selected:-outline-offset-2',
        'forced-colors:aria-selected:outline-solid',
      ]),
    );
  });

  it('drops the old suggestions and active option as soon as the text changes', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '770');
    await settle();
    await user.keyboard('{ArrowDown}');
    await user.type(input(), '9 Oak St');
    expect(listbox()).not.toBeInTheDocument();
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('7709 Oak St');
  });

  it('suggests again after an edit that changes only spaces', async () => {
    renderSearch();
    await user.type(input(), '7700');
    await settle();
    expect(options()).toHaveLength(1);
    await user.type(input(), ' ');
    await settle();
    expect(options()).toHaveLength(1);
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });

  it('submits the form when a suggestion is picked with a pointer', async () => {
    const onFormSubmit = vi.fn();
    const { onSubmit } = renderSearch();
    input().form.addEventListener('submit', onFormSubmit);
    await user.type(input(), '770');
    await settle();
    await user.click(options()[1]);
    expect(onFormSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ label: PLACES[1].label });
  });

  it('closes the list with Escape and keeps the text', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '770');
    await settle();
    await user.keyboard('{ArrowDown}{Escape}');
    expect(listbox()).not.toBeInTheDocument();
    expect(input()).toHaveValue('770');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}');
    expect(listbox()).toBeInTheDocument();
  });

  it('submits the typed text with Enter when no suggestion is active', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '  7700 Fine Rd  ');
    await settle();
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('7700 Fine Rd');
    expect(listbox()).not.toBeInTheDocument();
  });

  it('submits the typed text with the button', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '7700 Fine Rd');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(onSubmit).toHaveBeenCalledWith('7700 Fine Rd');
  });

  it('does not submit empty text, and says what is missing', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.empty);
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    await user.type(input(), '7');
    expect(input()).not.toHaveAttribute('aria-invalid');
  });

  it('picks a suggestion with a click and keeps focus in the box', async () => {
    const { onSubmit } = renderSearch();
    await user.type(input(), '770');
    await settle();
    await user.click(options()[1]);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ label: PLACES[1].label });
    expect(input()).toHaveFocus();
  });

  it('does not suggest again for the text a pick filled in', async () => {
    renderSearch();
    await user.type(input(), '770');
    await settle();
    await user.click(options()[0]);
    await settle();
    expect(geocoder.calls.suggest).toEqual(['770']);
    expect(listbox()).not.toBeInTheDocument();
  });

  it('closes the list when focus leaves the box', async () => {
    renderSearch();
    await user.type(input(), '770');
    await settle();
    fireEvent.blur(input());
    expect(listbox()).not.toBeInTheDocument();
  });

  it('ignores submits while busy and says so on the button', async () => {
    const { onSubmit } = renderSearch({ busy: true });
    await user.type(input(), '7700{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: copy.busy });
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('gives the caller the input element through inputRef', () => {
    const inputRef = { current: null };
    renderSearch({ inputRef });
    expect(inputRef.current).toBe(input());
  });

  it('cancels a pending suggestion request when unmounted', async () => {
    const signals = [];
    const spy = {
      suggest: vi.fn((text, { signal }) => {
        signals.push(signal);
        return new Promise(() => {});
      }),
      geocode: vi.fn(),
    };
    const { unmount } = render(
      <GeocoderContext.Provider value={spy}>
        <AddressSearch onSubmit={() => {}} />
      </GeocoderContext.Provider>,
    );
    await user.type(input(), '7700');
    await settle();
    unmount();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
  });
});
