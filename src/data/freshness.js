// When data loaded from a county or City layer is too old to show (#84). One
// rule for every layer the app refreshes: the polling places list, and the wait
// times and City layers that come later (#24, #87, #89, #103). The max ages
// live in the election config (`layerMaxAge`).
import election from '../config/election.js';
import { zonedNow } from '../features/lookup/earlyVoting.js';

const MINUTE_MS = 60_000;

/**
 * Whether something loaded or reported at `at` is still fresh at `now`: no
 * older than `maxAgeMs`, and not later than `now` by more than `skewMs` (a
 * clock on another machine may run a little ahead). A missing or invalid time
 * is never fresh.
 * @param {Date | number | null | undefined} at
 * @param {number} maxAgeMs
 * @param {Date | number} [now]
 * @param {number} [skewMs]
 * @returns {boolean}
 */
export function isFresh(at, maxAgeMs, now = Date.now(), skewMs = 0) {
  if (at === null || at === undefined) return false;
  const age = Number(now) - Number(at);
  if (!Number.isFinite(age)) return false;
  return age <= maxAgeMs && age >= -skewMs;
}

/**
 * How long a loaded polling places layer may be reused before it is fetched
 * again: shorter on Election Day, the day in `election.timeZone`, when a
 * polling place is most likely to move at short notice.
 * @param {Date | number} [now]
 * @returns {number} Milliseconds.
 */
export function layerMaxAgeMs(now = Date.now()) {
  const { minutes, electionDayMinutes } = election.layerMaxAge;
  const electionDay = zonedNow(now, election.timeZone).date === election.electionDate;
  return (electionDay ? electionDayMinutes : minutes) * MINUTE_MS;
}
