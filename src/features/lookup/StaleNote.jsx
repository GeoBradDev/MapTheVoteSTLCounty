import { copy } from './resultsCopy.js';
import { loadedAtParts } from './useNearestSites.js';

/**
 * Said under a list whose refresh failed (#84): the rows shown are the ones
 * loaded earlier, and when that was.
 * @param {{ loadedAt: number }} props Milliseconds.
 */
export default function StaleNote({ loadedAt }) {
  const { time, date } = loadedAtParts(loadedAt);
  return (
    <p role="status" className="mt-3 text-muted">
      {copy.polls.staleNote(time, date)}
    </p>
  );
}
