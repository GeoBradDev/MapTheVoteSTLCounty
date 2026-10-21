// Date logic for the early voting card. Every "today" is the election's time
// zone (America/Chicago), whatever zone the voter's device is set to. Dates are
// YYYY-MM-DD strings; date arithmetic runs on UTC midnights, which have no
// daylight saving shifts.

/**
 * @typedef {{ kind: 'openNow', close: string }
 *   | { kind: 'opensToday', open: string, close: string }
 *   | { kind: 'opensOn', date: string, open: string, close: string }
 *   | { kind: 'ended' }} EarlyVotingStatus
 */

const partsFormatters = new Map();

function partsFormatter(timeZone) {
  if (!partsFormatters.has(timeZone)) {
    partsFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return partsFormatters.get(timeZone);
}

/**
 * The calendar date and minute of the day at `now` in `timeZone`.
 * @param {Date | number} now
 * @param {string} timeZone IANA zone.
 * @returns {{ date: string, minutes: number }}
 */
export function zonedNow(now, timeZone) {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  // Some engines print midnight as 24 even with h23.
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const utcDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

function addDays(date, days) {
  const d = utcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isWeekend = (date) => [0, 6].includes(utcDate(date).getUTCDay());

const spanDays = (entry) => (utcDate(entry.to) - utcDate(entry.from)) / 86_400_000;

/**
 * The hours on one date, or null when no entry covers it. A `weekdays` entry
 * skips Saturday and Sunday. When two entries cover the date, the narrowest
 * range wins, so a single day overrides a longer run.
 * @param {import('../../config/election.js').ScheduleEntry[] | undefined} entries
 * @param {string} date YYYY-MM-DD.
 * @returns {{ open: string, close: string } | null}
 */
export function hoursOn(entries, date) {
  let best = null;
  for (const entry of entries ?? []) {
    if (date < entry.from || date > entry.to) continue;
    if (entry.days === 'weekdays' && isWeekend(date)) continue;
    if (!best || spanDays(entry) < spanDays(best)) best = entry;
  }
  return best && { open: best.open, close: best.close };
}

/**
 * Whether in-person absentee voting is open now, opens later today, opens on a
 * later date, or has ended for good.
 * @param {import('../../config/election.js').ScheduleEntry[] | undefined} entries
 * @param {Date | number} now
 * @param {string} timeZone IANA zone the schedule's times are in.
 * @returns {EarlyVotingStatus}
 */
export function earlyVotingStatus(entries, now, timeZone) {
  const list = entries ?? [];
  const { date, minutes } = zonedNow(now, timeZone);
  const today = hoursOn(list, date);
  if (today && minutes < toMinutes(today.open)) return { kind: 'opensToday', ...today };
  if (today && minutes < toMinutes(today.close)) return { kind: 'openNow', close: today.close };
  const last = list.reduce((max, entry) => (entry.to > max ? entry.to : max), '');
  for (let d = addDays(date, 1); d <= last; d = addDays(d, 1)) {
    const hours = hoursOn(list, d);
    if (hours) return { kind: 'opensOn', date: d, ...hours };
  }
  return { kind: 'ended' };
}

const longDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});
const dateWithYear = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/**
 * A calendar date as voters read it: "Saturday, October 24", or with
 * `{ year: true }`, "October 20, 2026".
 * @param {string} date YYYY-MM-DD.
 * @param {{ year?: boolean }} [options]
 */
export function formatLongDate(date, { year = false } = {}) {
  return (year ? dateWithYear : longDate).format(utcDate(date));
}

/**
 * One displayable line per schedule entry, in config order. `to` is null for a
 * single day.
 * @param {import('../../config/election.js').ScheduleEntry[] | undefined} entries
 * @returns {{ weekdaysOnly: boolean, from: string, to: string | null,
 *   open: string, close: string }[]}
 */
export function scheduleLines(entries) {
  return (entries ?? []).map((entry) => ({
    weekdaysOnly: entry.days === 'weekdays' && entry.from !== entry.to,
    from: formatLongDate(entry.from),
    to: entry.from === entry.to ? null : formatLongDate(entry.to),
    open: entry.open,
    close: entry.close,
  }));
}
