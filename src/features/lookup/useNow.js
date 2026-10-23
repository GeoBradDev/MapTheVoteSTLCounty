import { useEffect, useState } from 'react';

/** How often the open or closed status is worked out again. */
const TICK_MS = 60_000;

/**
 * The current time, updated every minute, so a page left open keeps its open
 * and closed statuses right. Read by the early voting card, the wait times
 * page (#104) and the home page's dot map (#184).
 * @returns {number} Milliseconds.
 */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
