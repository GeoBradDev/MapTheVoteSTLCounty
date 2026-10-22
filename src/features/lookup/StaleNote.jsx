import { useEffect, useState } from 'react';
import { copy } from './resultsCopy.js';
import { loadedAtParts } from './useNearestSites.js';

/** How often the note checks whether the day has changed. */
const TICK_MS = 60_000;

/**
 * Said under a list whose refresh failed (#84): the rows shown are the ones
 * loaded earlier, and when that was. It names the day once the list is from an
 * earlier day, also when midnight passes while the note is shown.
 * @param {{ loadedAt: number }} props Milliseconds.
 */
export default function StaleNote({ loadedAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const { time, date } = loadedAtParts(loadedAt, now);
  return (
    <p role="status" className="mt-3 text-muted">
      {copy.polls.staleNote(time, date)}
    </p>
  );
}
