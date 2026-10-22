import { useEffect, useState } from 'react';

/** How often the open or closed status is worked out again. */
const TICK_MS = 60_000;

/**
 * The current time, updated every minute, so a page left open keeps its open
 * and closed statuses right. Read by the early voting card and the wait times
 * page (#104).
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
