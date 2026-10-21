import { useEffect, useId, useRef, useState } from 'react';
import { getDeviceLocation } from './deviceLocation.js';
import { copy } from './useMyLocationCopy.js';

/**
 * The "Use my location" button. It asks for the device's position only when
 * pressed and hands the coordinates to `onLocate` without keeping them. When
 * the position cannot be had, it says why and moves focus to the address box.
 * Going back to the address box (pressing or typing in it, or submitting its
 * form) while the position is pending, or unmounting, drops the pending
 * result, so a late answer never replaces an address the voter chose.
 * @param {{
 *   onLocate: (place: { lat: number, lng: number }) => void,
 *   onStart?: () => void,
 *   addressInputRef?: { current: HTMLElement | null },
 * }} props `onLocate` gets a coordinates-only place for locate() (#8) and
 *   handles its own errors and loading state. `onStart` is called on each
 *   press that starts a request, before the device answers.
 */
export default function UseMyLocation({ onLocate, onStart, addressInputRef }) {
  const [busy, setBusy] = useState(false);
  // The failure reason and which press it came from. A new press gets a new
  // message node, so a repeated failure is announced again even when it comes
  // back before the cleared message was ever painted.
  const [error, setError] = useState(null);
  const pressRef = useRef(0);
  // The current request, or null. A ref, not state, so a second press before
  // the re-render is ignored too, and a dropped request can tell it was dropped.
  const requestRef = useRef(null);
  const notesId = useId();

  // Drops the pending request, if any.
  function cancel() {
    requestRef.current?.stopListening();
    requestRef.current = null;
  }

  useEffect(() => cancel, []);

  async function handleClick() {
    if (requestRef.current) return;
    onStart?.();
    const input = addressInputRef?.current;
    const onAddress = () => {
      cancel();
      setBusy(false);
    };
    // Each target and event the voter can use to go with an address instead.
    // Not focus: the browser refocuses the box by itself when the permission
    // prompt closes if it was still the focused element (Safari does not focus
    // a tapped button). Not pointerdown: a touch scroll that starts on the box
    // fires it too, while only a real tap or click fires click.
    const listeners = [
      [input, 'click'],
      [input, 'input'],
      [input?.form, 'submit'],
    ].filter(([target]) => target);
    for (const [target, type] of listeners) target.addEventListener(type, onAddress);
    const request = {
      stopListening: () => {
        for (const [target, type] of listeners) target.removeEventListener(type, onAddress);
      },
    };
    requestRef.current = request;
    pressRef.current += 1;
    const press = pressRef.current;
    setBusy(true);
    setError(null);

    let place = null;
    let reason = null;
    try {
      place = await getDeviceLocation();
    } catch (e) {
      reason = Object.hasOwn(copy.errors, e?.reason) ? e.reason : 'unavailable';
    }
    if (requestRef.current !== request) return;
    cancel();
    setBusy(false);
    if (place) {
      onLocate(place);
    } else {
      setError({ reason, press });
      input?.focus();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        aria-disabled={busy || undefined}
        aria-describedby={notesId}
        className="min-h-11 rounded-md border border-primary px-4 py-2 font-medium text-primary aria-disabled:cursor-wait aria-disabled:opacity-70"
      >
        {busy ? copy.busy : copy.button}
      </button>
      <div id={notesId} className="mt-2 text-sm text-muted">
        <p>{copy.privacy}</p>
        <p className="mt-1">{copy.notHome}</p>
      </div>
      <p role="status" className="sr-only">
        {busy ? copy.busy : ''}
      </p>
      <p role="alert" className="mt-2">
        {error && <span key={error.press}>{copy.errors[error.reason]}</span>}
      </p>
    </div>
  );
}
