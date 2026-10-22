// Which early voting wait reports the app shows (#103). Pure functions of the
// layer rows and a clock; src/data/arcgis.js fetches the rows and
// src/features/waitTimes/ refreshes them.
//
// One shape for both boards, read by the wait times page (#104), the early
// voting card (#105) and later Election Day counts (#107):
//   { siteId, jurisdiction: 'county' | 'city', unit, value, reportedAt: Date,
//     source, openUntil: Date }
// A site with no fresh report while it is open has no entry. The unit stays
// with the value and is never converted.
import election from '../config/election.js';
import { earlyVotingStatus, zonedNow } from '../features/lookup/earlyVoting.js';
import { isFresh } from './freshness.js';

/**
 * @typedef {object} WaitEntry
 * @property {string} siteId The County site's absentee username (the polls
 *   layer's `absentee`) or the City site's `facilityid`.
 * @property {'county' | 'city'} jurisdiction
 * @property {'people' | 'minutes'} unit
 * @property {number} value A whole number, 0 or more.
 * @property {Date} reportedAt When the board's staff reported it.
 * @property {string} source The board that reported it.
 * @property {Date} openUntil When the site closes today; the entry is not shown after.
 */

const MINUTE_MS = 60_000;

const maxAgeMs = () => election.waitTimes.maxAgeMinutes * MINUTE_MS;
const skewMs = () => election.waitTimes.skewMinutes * MINUTE_MS;

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const isCount = (value) => Number.isInteger(value) && value >= 0;

// The end of today's opening hours as a time, from the minute of `now` in the
// election's zone. Chicago's offset is whole minutes, so the minute of `now`
// starts at a whole UTC minute.
function closingTime(now, close) {
  const { minutes } = zonedNow(now, election.timeZone);
  const minuteStart = Number(now) - (Number(now) % MINUTE_MS);
  return new Date(minuteStart + (toMinutes(close) - minutes) * MINUTE_MS);
}

// The newest row per site, among rows with a known site and a report time no
// later than `now` plus the allowed skew. Only then are its value and age
// judged: an older count never stands in for a newer report that has none or
// that says the site is closed. A time further in the future is a clock error,
// not the latest report. Rows with equal times keep the first seen, which is
// the layer's own newest-first order.
function newestPerSite(rows, siteOf, timeOf, knownSite, now) {
  const newest = new Map();
  for (const row of rows) {
    const site = siteOf(row);
    const time = timeOf(row);
    if (!knownSite(site) || typeof time !== 'number' || !Number.isFinite(time)) continue;
    if (time - Number(now) > skewMs()) continue;
    const kept = newest.get(site);
    if (!kept || timeOf(row) > timeOf(kept)) newest.set(site, row);
  }
  return [...newest.values()];
}

/**
 * The County's current line counts: each early voting site's newest report,
 * when it has a count, is fresh and the site is open now by its schedule. A report whose site key matches no
 * site is dropped, never guessed.
 * @param {object[]} reports The County layer's rows (attributes).
 * @param {object[]} sites Absentee site features from getAbsenteeSites, with
 *   the polls join field and `abs_type` in `properties`.
 * @param {Date | number} [now]
 * @returns {WaitEntry[]}
 */
export function selectCountyWaits(reports, sites, now = Date.now()) {
  const county = election.waitTimes.county;
  const siteKind = new Map();
  for (const { properties } of sites) {
    const key = properties?.[county.pollsField];
    if (typeof key === 'string' && key) siteKind.set(key, properties.abs_type);
  }
  const timeOf = (row) => row[county.timeField];
  const siteOf = (row) => row[county.siteField];
  const knownSite = (site) => siteKind.has(site);

  const entries = [];
  for (const row of newestPerSite(reports, siteOf, timeOf, knownSite, now)) {
    if (!isCount(row[county.valueField])) continue;
    if (!isFresh(timeOf(row), maxAgeMs(), now, skewMs())) continue;
    const siteId = siteOf(row);
    const schedule = election.earlyVoting.schedules[siteKind.get(siteId)];
    const status = earlyVotingStatus(schedule, now, election.timeZone);
    if (status.kind !== 'openNow') continue;
    entries.push({
      siteId,
      jurisdiction: 'county',
      unit: county.unit,
      value: row[county.valueField],
      reportedAt: new Date(timeOf(row)),
      source: county.source,
      openUntil: closingTime(now, status.close),
    });
  }
  return entries;
}

const DAYS = { su: 0, mo: 1, tu: 2, w: 3, we: 3, th: 4, fr: 5, sa: 6 };
const SEGMENT =
  /^([a-z]{1,2})(?:\s*-\s*([a-z]{1,2}))?\s*\(\s*(?:closed|(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}))\s*\)+$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A City site's opening hours, from its free-text hours field, like
 * `Mo (13:00-16:00); Tu-Th (11:00-17:00); Su (Closed))`. Days it does not
 * name are closed. Anything it cannot read makes the whole text unknown, so
 * the site counts as closed rather than open at a guessed time.
 * @param {string | null | undefined} text
 * @returns {Record<number, { open: string, close: string } | null> | null}
 *   Keyed by day of the week, 0 for Sunday; null when the text is unknown.
 */
export function parseCityHours(text) {
  if (typeof text !== 'string') return null;
  const segments = text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const hours = {};
  for (const segment of segments) {
    const match = SEGMENT.exec(segment);
    if (!match) return null;
    const [, first, last = first, open, close] = match;
    const from = DAYS[first.toLowerCase()];
    const to = DAYS[last.toLowerCase()];
    if (from === undefined || to === undefined) return null;
    let value = null;
    if (open) {
      if (!TIME.test(open) || !TIME.test(close) || open >= close) return null;
      value = { open, close };
    }
    for (let day = from; ; day = (day + 1) % 7) {
      hours[day] = value;
      if (day === to) break;
    }
  }
  return hours;
}

const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * The City's current line counts, by the rules of the City Board's own
 * dashboard: a site open now by its hours field, a report from today in the
 * election's time zone, and no "poll closed" comment. The report must also
 * be fresh by `maxAgeMinutes`.
 * @param {object[]} rows The City layer's rows (attributes).
 * @param {Date | number} [now]
 * @returns {WaitEntry[]}
 */
export function selectCityWaits(rows, now = Date.now()) {
  const city = election.waitTimes.city;
  const today = zonedNow(now, election.timeZone);
  const timeOf = (row) => row[city.timeField];
  const closedText = city.closedText.toLowerCase();
  const siteOf = (row) => row[city.siteField];
  const knownSite = (site) => typeof site === 'string' && site !== '';
  const usable = (row) =>
    isCount(row[city.valueField]) &&
    isFresh(timeOf(row), maxAgeMs(), now, skewMs()) &&
    zonedNow(timeOf(row), election.timeZone).date === today.date &&
    !String(row[city.commentsField] ?? '')
      .toLowerCase()
      .includes(closedText);

  const entries = [];
  for (const row of newestPerSite(rows, siteOf, timeOf, knownSite, now)) {
    if (!usable(row)) continue;
    const hours = parseCityHours(row[city.hoursField])?.[weekdayOf(today.date)];
    if (!hours) continue;
    if (today.minutes < toMinutes(hours.open) || today.minutes >= toMinutes(hours.close)) continue;
    entries.push({
      siteId: row[city.siteField],
      jurisdiction: 'city',
      unit: city.unit,
      value: row[city.valueField],
      reportedAt: new Date(timeOf(row)),
      source: city.source,
      openUntil: closingTime(now, hours.close),
    });
  }
  return entries;
}

/**
 * Whether an entry may still be shown at `now`: its report is still fresh and
 * its site has not closed. Used to keep entries through a failed refresh.
 * @param {WaitEntry} entry
 * @param {Date | number} [now]
 */
export function stillShowable(entry, now = Date.now()) {
  return (
    isFresh(entry.reportedAt, maxAgeMs(), now, skewMs()) && Number(now) < Number(entry.openUntil)
  );
}

/**
 * When a report was made, for display: the time (HH:MM) and, when that was not
 * today, the date (YYYY-MM-DD), both in the election's time zone.
 * @param {WaitEntry} entry
 * @param {Date | number} [now]
 * @returns {{ time: string, date: string | null }}
 */
export function reportedTimeParts(entry, now = Date.now()) {
  const at = zonedNow(entry.reportedAt, election.timeZone);
  const today = zonedNow(now, election.timeZone).date;
  const hours = String(Math.floor(at.minutes / 60)).padStart(2, '0');
  const minutes = String(at.minutes % 60).padStart(2, '0');
  return { time: `${hours}:${minutes}`, date: at.date === today ? null : at.date };
}
