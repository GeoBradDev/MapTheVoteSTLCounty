import { useId, useRef, useState } from 'react';
import { getDeviceLocation } from './deviceLocation.js';
import { copy } from './useMyLocationCopy.js';

/**
 * The "Use my location" button. It asks for the device's position only when
 * pressed and hands the coordinates to `onLocate` without keeping them. When
 * the position cannot be had, it says why and moves focus to the address box.
 * @param {{
 *   onLocate: (place: { lat: number, lng: number }) => void,
 *   addressInputRef?: { current: HTMLElement | null },
 * }} props `onLocate` gets a coordinates-only place for locate() (#8).
 */
export default function UseMyLocation({ onLocate, addressInputRef }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // A ref, not state, so a second press before the re-render is ignored too.
  const busyRef = useRef(false);
  const notesId = useId();

  async function handleClick() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    let place = null;
    try {
      place = await getDeviceLocation();
    } catch (e) {
      setError(Object.hasOwn(copy.errors, e?.reason) ? e.reason : 'unavailable');
      addressInputRef?.current?.focus();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (place) onLocate(place);
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
      <p role="alert" className="mt-2">
        {error && copy.errors[error]}
      </p>
    </div>
  );
}
