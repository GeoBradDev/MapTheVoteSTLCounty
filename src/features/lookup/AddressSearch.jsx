import { useEffect, useId, useRef, useState } from 'react';
import { copy } from './addressSearchCopy.js';
import { useGeocoder } from './geocoderContext.js';

/** How long typing must pause before suggestions are requested. */
export const DEBOUNCE_MS = 250;
/** The shortest trimmed text that gets suggestions. */
export const MIN_CHARS = 3;
const MAX_SUGGESTIONS = 5;

/**
 * The address box: a WAI-ARIA combobox with suggestions from the geocoder
 * (src/data/geocoder.js). It keeps the address text in component state only,
 * and hands what the voter chose (a suggestion, or the typed text) to
 * `onSubmit`. The input is a real input inside a real form, so "Use my
 * location" (#9) can listen for the voter going back to it.
 * @param {{
 *   onSubmit: (query: string | import('../../data/geocoder.js').Suggestion) => void,
 *   busy?: boolean,
 *   inputRef?: { current: HTMLInputElement | null },
 * }} props `busy` marks a lookup in progress: the button says so and submits
 *   are ignored.
 */
export default function AddressSearch({ onSubmit, busy = false, inputRef }) {
  const geocoder = useGeocoder();
  const [text, setText] = useState('');
  // The text to suggest for, set only by typing, so a pick that fills in the
  // box does not ask for suggestions again. Null means none wanted.
  const [query, setQuery] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState(-1);
  const [empty, setEmpty] = useState(false);
  const formRef = useRef(null);
  const pointerPickRef = useRef(null);
  const id = useId();
  const listboxId = `${id}-listbox`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const open = suggestions.length > 0 && !closed;

  useEffect(() => {
    if (query === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      geocoder.suggest(query, { signal: controller.signal }).then(
        (list) => {
          if (controller.signal.aborted) return;
          setSuggestions(Array.isArray(list) ? list.slice(0, MAX_SUGGESTIONS) : []);
          setActive(-1);
        },
        () => {
          // A failed or aborted suggestion request just shows none; the voter
          // can still submit the typed text.
          if (!controller.signal.aborted) setSuggestions([]);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, geocoder]);

  function reset() {
    setQuery(null);
    setSuggestions([]);
    setActive(-1);
  }

  function handleChange(event) {
    const value = event.target.value;
    setText(value);
    setEmpty(false);
    setClosed(false);
    // Suggestions for the old text are stale the moment the text changes.
    reset();
    if (value.trim().length >= MIN_CHARS) setQuery(value.trim());
  }

  function pick(suggestion) {
    if (busy) return;
    setText(suggestion.label);
    reset();
    onSubmit(suggestion);
  }

  // A pointer pick goes through a real form submit, like Enter does, so
  // listeners on the form (such as "Use my location" dropping a pending
  // request) see the voter choose an address.
  function pickWithPointer(suggestion) {
    pointerPickRef.current = suggestion;
    const form = formRef.current;
    if (form?.requestSubmit) form.requestSubmit();
    else pick(suggestion);
    pointerPickRef.current = null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (pointerPickRef.current) {
      pick(pointerPickRef.current);
      return;
    }
    if (open && active >= 0) {
      pick(suggestions[active]);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      setEmpty(true);
      return;
    }
    reset();
    onSubmit(trimmed);
  }

  function handleKeyDown(event) {
    const count = suggestions.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!count) return;
      event.preventDefault();
      if (!open) {
        setClosed(false);
        setActive(event.key === 'ArrowDown' ? 0 : count - 1);
      } else if (event.key === 'ArrowDown') {
        setActive((a) => (a + 1) % count);
      } else {
        setActive((a) => (a <= 0 ? count - 1 : a - 1));
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setClosed(true);
      setActive(-1);
    }
  }

  const describedBy = [hintId, empty ? errorId : null].filter(Boolean).join(' ');

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <label htmlFor={`${id}-input`} className="block text-lg font-semibold">
        {copy.label}
      </label>
      <p id={hintId} className="mt-1 text-muted">
        {copy.hint}
      </p>
      <div className="relative mt-2">
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={empty || undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setClosed(true)}
          className="min-h-11 w-full rounded-md border border-ink bg-surface px-3 py-2 text-base text-ink"
        />
        <ul
          id={listboxId}
          role="listbox"
          aria-label={copy.suggestions}
          hidden={!open}
          className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-border bg-surface-raised shadow-md"
        >
          {suggestions.map((suggestion, i) => (
            // The input keeps focus and handles the keys (aria-activedescendant),
            // so options take only pointer events. mousedown is prevented so
            // the input does not blur and close the list before the click.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={suggestion.id}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickWithPointer(suggestion)}
              className="flex min-h-11 cursor-pointer items-center px-3 py-2 aria-selected:bg-primary aria-selected:text-on-primary"
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      </div>
      <p role="status" className="sr-only">
        {open ? copy.suggestionCount(suggestions.length) : ''}
      </p>
      <p id={errorId} role="alert" className="mt-2">
        {empty ? copy.empty : ''}
      </p>
      <button
        type="submit"
        aria-disabled={busy || undefined}
        className="mt-2 min-h-11 w-full rounded-md bg-primary px-4 py-2 font-semibold text-on-primary aria-disabled:cursor-wait aria-disabled:opacity-70 sm:w-auto"
      >
        {busy ? copy.busy : copy.submit}
      </button>
    </form>
  );
}
