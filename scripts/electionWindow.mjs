// Which checks a data health run does (.github/workflows/data-health.yml).
// The workflow runs this before `npm ci`, so it imports nothing: the config
// comes in as an argument, and the dates come from it, so nothing here
// changes for the next election.

/** The workflow's open-hours cron: every 2 hours of the voting day (#106). */
export const WAITS_CRON = '0 14-22/2 * * *';

/**
 * The workflow's Election Day evening cron (#107): 00:00 UTC, 6 p.m. Central
 * in standard time, which Election Day always falls in. With the daily run at
 * 6 a.m. and WAITS_CRON, Election Day is checked every 2 hours from 6 a.m. to
 * 6 p.m., before the polls close at 7.
 */
export const ELECTION_DAY_CRON = '0 0 * * *';

/** Today's date (YYYY-MM-DD) in the config's time zone. */
function today(config, now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Whether the election is over: today in the config's time zone is after
 * Election Day.
 * @param {{ electionDate: string, timeZone: string }} config
 * @param {Date} [now]
 */
export function isPastElection(config, now = new Date()) {
  return today(config, now) > config.electionDate;
}

/**
 * Whether today, in the config's time zone, falls from the first day any early
 * voting site opens to the last day any is open (`earlyVoting.schedules`).
 * @param {{ timeZone: string, earlyVoting?: { schedules?: Record<string, { from: string, to: string }[]> } }} config
 * @param {Date} [now]
 */
export function isEarlyVotingPeriod(config, now = new Date()) {
  const entries = Object.values(config.earlyVoting?.schedules ?? {}).flat();
  if (entries.length === 0) return false;
  const first = entries.reduce((min, e) => (e.from < min ? e.from : min), entries[0].from);
  const last = entries.reduce((max, e) => (e.to > max ? e.to : max), entries[0].to);
  const date = today(config, now);
  return date >= first && date <= last;
}

/**
 * Whether today, in the config's time zone, is Election Day.
 * @param {{ electionDate: string, timeZone: string }} config
 * @param {Date} [now]
 */
export function isElectionDay(config, now = new Date()) {
  return today(config, now) === config.electionDate;
}

/**
 * What a run checks: `full` (every check), `waits` (the config check only, on
 * the open-hours runs during early voting and on Election Day, #107) or `off`.
 * A run by hand always checks everything; the daily run stops after Election
 * Day.
 * @param {object} config The election config.
 * @param {{ event?: string, schedule?: string }} trigger The GitHub event name
 *   and, for a scheduled run, the cron that fired.
 * @param {Date} [now]
 * @returns {'full' | 'waits' | 'off'}
 */
export function windowFor(config, { event, schedule } = {}, now = new Date()) {
  if (event !== 'schedule') return 'full';
  if (schedule === WAITS_CRON) {
    return isEarlyVotingPeriod(config, now) || isElectionDay(config, now) ? 'waits' : 'off';
  }
  if (schedule === ELECTION_DAY_CRON) return isElectionDay(config, now) ? 'waits' : 'off';
  return isPastElection(config, now) ? 'off' : 'full';
}
