// Whether in-person early voting has started, is running or has ended, over
// every kind of site in the config (#104). A day with no site open (a Sunday)
// between the first and last dates is still `during`.
import { earlyVotingStatus, zonedNow } from '../lookup/earlyVoting.js';

/**
 * @typedef {{ kind: 'before', from: string, to: string }
 *   | { kind: 'during' } | { kind: 'ended' }} EarlyVotingSeason
 */

/**
 * @param {Record<string, import('../../config/election.js').ScheduleEntry[]>} schedules
 *   Keyed by site kind, as in the config.
 * @param {Date | number} now
 * @param {string} timeZone IANA zone the schedules' times are in.
 * @returns {EarlyVotingSeason}
 */
export function earlyVotingSeason(schedules, now, timeZone) {
  const entries = Object.values(schedules).flat();
  if (entries.length === 0) return { kind: 'ended' };
  const lists = Object.values(schedules);
  if (lists.every((list) => earlyVotingStatus(list, now, timeZone).kind === 'ended')) {
    return { kind: 'ended' };
  }
  const from = entries.reduce((min, e) => (e.from < min ? e.from : min), entries[0].from);
  const to = entries.reduce((max, e) => (e.to > max ? e.to : max), entries[0].to);
  const today = zonedNow(now, timeZone).date;
  return today < from ? { kind: 'before', from, to } : { kind: 'during' };
}
