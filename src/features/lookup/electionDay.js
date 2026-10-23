// Election Day as a one-day schedule (#107), so the code that reads early
// voting schedules (status, today's hours, the open-now sort) reads Election
// Day the same way. The date and hours come from the config.
import election from '../../config/election.js';
import { earlyVotingStatus, zonedNow } from './earlyVoting.js';

/**
 * Election Day's hours, as a schedule with one entry.
 * @type {readonly import('../../config/election.js').ScheduleEntry[]}
 */
export const electionDaySchedule = Object.freeze([
  Object.freeze({
    from: election.electionDate,
    to: election.electionDate,
    days: 'daily',
    open: election.electionDayHours.open,
    close: election.electionDayHours.close,
  }),
]);

/**
 * Whether `now` falls on the election date in the election's time zone.
 * @param {Date | number} now
 */
export function isElectionDay(now) {
  return zonedNow(now, election.timeZone).date === election.electionDate;
}

/**
 * Whether the polls are open: `openNow` during Election Day hours,
 * `opensToday` or `opensOn` before, `ended` after.
 * @param {Date | number} now
 * @returns {import('./earlyVoting.js').EarlyVotingStatus}
 */
export function electionDayStatus(now) {
  return earlyVotingStatus(electionDaySchedule, now, election.timeZone);
}

/**
 * Whether config lets a board's Election Day line counts show (#107): line
 * counts on, the board's source on and its Election Day source on.
 * @param {'county' | 'city'} board
 * @param {import('../../config/election.js').WaitTimesConfig} [waitTimes]
 */
export function electionDayCountsOn(board, waitTimes = election.waitTimes) {
  const source = waitTimes[board];
  return Boolean(waitTimes.enabled && source?.enabled && source.electionDay?.enabled);
}
