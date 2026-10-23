// St. Louis City's early voting hours (#91), read from src/config/cityResults.js.
// The config gives hours by weekday over a run of dates, as the City Board's
// page does; the County's status code (./earlyVoting.js) reads dated entries,
// so each run is laid out as one entry per open date. In the City chunk only
// (src/cityChunk.js).
import cityResults from '../../config/cityResults.js';
import { formatCalendarDate, intlLocale } from '../../i18n/index.js';
import { formatLongDate } from './earlyVoting.js';
import { copy } from './resultsCopy.js';

const cityEarlyVoting = cityResults.earlyVoting;

const utcDate = (date) => new Date(`${date}T12:00:00Z`);

// One `daily` entry per date the run covers that falls on one of its weekdays.
function datedEntries({ from, to, days, open, close }) {
  const entries = [];
  for (let d = utcDate(from); d <= utcDate(to); d.setUTCDate(d.getUTCDate() + 1)) {
    if (!days.includes(d.getUTCDay())) continue;
    const date = d.toISOString().slice(0, 10);
    entries.push({ from: date, to: date, days: 'daily', open, close });
  }
  return entries;
}

/**
 * Every City schedule as dated entries, keyed as in the config, for
 * earlyVotingStatus and earlyVotingSeason.
 * @type {Record<string, import('../../config/election.js').ScheduleEntry[]>}
 */
export const citySchedules = Object.freeze(
  Object.fromEntries(
    Object.entries(cityEarlyVoting.schedules).map(([key, runs]) => [
      key,
      Object.freeze(runs.flatMap(datedEntries)),
    ]),
  ),
);

/**
 * A City site's dated entries, by the voting locations layer's site id, or undefined for a
 * site the config does not name.
 * @param {string | null} loc
 */
export function cityScheduleFor(loc) {
  return citySchedules[cityEarlyVoting.sites[loc]];
}

// 2023-01-01 was a Sunday: the date of weekday n is the (n + 1)th.
const weekdayName = (day) => formatCalendarDate(`2023-01-0${day + 1}`, { weekday: 'long' });

// "Monday", "Wednesday and Thursday", or a run of three or more consecutive
// days as "Monday to Friday".
function daysLabel(days) {
  const consecutive = days.every((day, i) => i === 0 || day === days[i - 1] + 1);
  if (days.length > 2 && consecutive) {
    return copy.earlyVoting.days({
      weekdaysOnly: false,
      from: weekdayName(days[0]),
      to: weekdayName(days.at(-1)),
    });
  }
  return new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(days.map(weekdayName));
}

/**
 * A City site's dates and hours to show: its first and last dates, and one
 * line per run, labelled by weekday ("Wednesday and Thursday"), or by its date
 * for a single day. Null for a site the config does not name.
 * @param {string | null} loc
 * @returns {{ from: string, to: string,
 *   lines: { days: string, open: string, close: string }[] } | null}
 */
export function cityHours(loc) {
  const runs = cityEarlyVoting.schedules[cityEarlyVoting.sites[loc]];
  if (!runs) return null;
  const from = runs.reduce((min, run) => (run.from < min ? run.from : min), runs[0].from);
  const to = runs.reduce((max, run) => (run.to > max ? run.to : max), runs[0].to);
  return {
    from: formatLongDate(from),
    to: formatLongDate(to),
    lines: runs.map((run) => ({
      days: run.from === run.to ? formatLongDate(run.from) : daysLabel(run.days),
      open: run.open,
      close: run.close,
    })),
  };
}
