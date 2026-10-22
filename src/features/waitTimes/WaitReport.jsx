import { reportedTimeParts } from '../../data/waitTimes.js';
import { copy } from './waitTimesCopy.js';

/**
 * A site's current line count as the wait times page (#104) and the early
 * voting card (#105) show it: the count with its unit and report time, then
 * the board that reported it. Without a count it shows the quiet "No current
 * line count" when `showNone` is set, else nothing.
 * @param {{ wait: import('../../data/waitTimes.js').WaitEntry | null,
 *   now: number, showNone?: boolean }} props
 */
export default function WaitReport({ wait, now, showNone = false }) {
  if (!wait) return showNone ? <p className="text-muted">{copy.noCount}</p> : null;
  return (
    <>
      <p className="font-semibold">{copy.count(wait.value, reportedTimeParts(wait, now).time)}</p>
      <p className="text-sm text-muted">{copy.reportedBy(wait.source)}</p>
    </>
  );
}
