import { useEffect, useState } from 'react';

/** How often the open or closed status is worked out again. */
const TICK_MS = 60_000;

// A tab frozen or a phone asleep runs no timers: when the page comes back,
// the time is read again at once, so nothing reads the time it went away.
const WAKE_EVENTS = [
  ['document', 'visibilitychange'],
  ['document', 'resume'],
  ['window', 'pageshow'],
  ['window', 'focus'],
];
const targetOf = (name) => (name === 'window' ? window : document);

/**
 * The current time, updated every minute and whenever the page comes back
 * from the background, so a page left open keeps its open and closed
 * statuses right. Read by the early voting card, the wait times page (#104)
 * and the home page's dot map (#184).
 * @returns {number} Milliseconds.
 */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, TICK_MS);
    const onWake = () => {
      if (document.visibilityState !== 'hidden') tick();
    };
    for (const [target, name] of WAKE_EVENTS) targetOf(target).addEventListener(name, onWake);
    return () => {
      clearInterval(id);
      for (const [target, name] of WAKE_EVENTS) targetOf(target).removeEventListener(name, onWake);
    };
  }, []);
  return now;
}
