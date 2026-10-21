import { useEffect, useId, useRef, useState } from 'react';
import { typedZip } from '../../data/addressMatch.js';
import { copy } from './addressSearchCopy.js';
import { useGeocoder } from './geocoderContext.js';

// Where a picked label's ZIP is in it, as { zip, start }, or null when the
// label has none.
function zipIn(label) {
  const zip = typedZip(label);
  if (!zip) return null;
  return { zip, start: label.lastIndexOf(zip) };
}

// Where the picked ZIP is after an edit from `before` to `after`, or null when
// the edit deleted or changed it. The edit is the one stretch the two texts do
// not share; the ZIP must lie wholly before or after it and still read as the
// same five digits on their own.
function zipAfterEdit(before, after, { zip, start }) {
  let prefix = 0;
  const shortest = Math.min(before.length, after.length);
  while (prefix < shortest && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const editEnd = before.length - suffix;
  let moved;
  if (editEnd <= start) moved = start + after.length - before.length;
  else if (prefix >= start + zip.length) moved = start;
  else return null;
  const word = /[A-Za-z0-9]/;
  const intact =
    after.slice(moved, moved + zip.length) === zip &&
    !word.test(after[moved - 1] ?? '') &&
    !word.test(after[moved + zip.length] ?? '');
  return intact ? { zip, start: moved } : null;
}

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
 *   onEdit?: () => void,
 *   busy?: boolean,
 *   inputRef?: { current: HTMLInputElement | null },
 * }} props `busy` marks a lookup in progress: the button says so and submits
 *   are ignored. `onEdit` is called on every edit of the text, so the caller
 *   can cancel a lookup for the old text.
 */
export default function AddressSearch({ onSubmit, onEdit, busy = false, inputRef }) {
  const geocoder = useGeocoder();
  const [text, setText] = useState('');
  // The text to suggest for, set only by typing, so a pick that fills in the
  // box does not ask for suggestions again. Null means none wanted. A new
  // object on every edit, so an edit that changes only spaces (and so clears
  // the list) still asks again.
  const [query, setQuery] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState(-1);
  const [empty, setEmpty] = useState(false);
  const formRef = useRef(null);
  const pointerPickRef = useRef(null);
  // The last picked suggestion, whether the box was edited since, and where
  // its label's ZIP is in the box. That ZIP is the source's, not one the
  // voter typed, and the geocoder's City check treats the two differently
  // (#58), so a search goes as a pick until the voter deletes or changes that
  // ZIP (owner decision), pasting over it included. An autofill forgets it.
  const pickedRef = useRef(null);
  // The selection a paste replaces, read when it starts: the texts before and
  // after cannot show whether a pasted ZIP replaced the picked one.
  const replacedRef = useRef(null);
  const id = useId();
  const listboxId = `${id}-listbox`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const open = suggestions.length > 0 && !closed;

  useEffect(() => {
    if (query === null) return undefined;
    const { text: queryText } = query;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      geocoder.suggest(queryText, { signal: controller.signal }).then(
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
    const picked = pickedRef.current;
    if (picked) {
      // An edit with no input type (autofill, a script) cannot be told
      // apart from a new address, so it forgets the pick. A paste over a
      // selection that holds the ZIP replaces it.
      const inputType = event.nativeEvent?.inputType;
      const replaced = inputType?.startsWith('insertFrom') ? replacedRef.current : null;
      const overZip =
        replaced &&
        picked.zip &&
        replaced.start < picked.zip.start + picked.zip.zip.length &&
        replaced.end > picked.zip.start;
      const zip =
        picked.zip && inputType && !overZip ? zipAfterEdit(text, value, picked.zip) : null;
      pickedRef.current = zip ? { ...picked, edited: true, zip } : null;
    }
    replacedRef.current = null;
    setText(value);
    onEdit?.();
    setEmpty(false);
    setClosed(false);
    // Suggestions for the old text are stale the moment the text changes.
    reset();
    if (value.trim().length >= MIN_CHARS) setQuery({ text: value.trim() });
  }

  function pick(suggestion) {
    if (busy) return;
    pickedRef.current = { suggestion, edited: false, zip: zipIn(suggestion.label) };
    setText(suggestion.label);
    reset();
    onSubmit(suggestion);
  }

  // A pointer pick goes through a real form submit, like Enter does, so
  // listeners on the form (such as "Use my location" dropping a pending
  // request) see the voter choose an address.
  function pickWithPointer(suggestion) {
    pointerPickRef.current = suggestion;
    formRef.current?.requestSubmit();
    pointerPickRef.current = null;
  }

  // The text as a pick while the picked label's ZIP is still in it, as the
  // suggestion itself when unedited; otherwise undefined.
  function asPick(trimmed) {
    const { suggestion, edited } = pickedRef.current ?? {};
    if (!suggestion) return undefined;
    if (!edited) return suggestion;
    return { id: `${suggestion.id}-edited`, label: trimmed };
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
    onSubmit(asPick(trimmed) ?? trimmed);
  }

  function rememberSelection(event) {
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    replacedRef.current = Number.isInteger(start) ? { start, end } : null;
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
          onPaste={rememberSelection}
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
            // Forced colors drops the active option's fill, so it gets an outline there.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={suggestion.id}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickWithPointer(suggestion)}
              className="flex min-h-11 cursor-pointer items-center px-3 py-2 aria-selected:bg-primary aria-selected:text-on-primary forced-colors:aria-selected:outline-2 forced-colors:aria-selected:-outline-offset-2 forced-colors:aria-selected:outline-solid"
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
