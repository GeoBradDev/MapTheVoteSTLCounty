// The home page dot map's model (#184): pure functions from the sites and
// counts the wait times page shows (#104, #107) to what the map draws. The same
// Jenks classes and ramp as the wait times map (#172); each dot also grows
// with its class, so color is never the only cue, and a closed site or one
// with no current count is a hollow ring, never a short line.
import election from '../../config/election.js';
import { earlyVotingStatus, zonedNow } from '../lookup/earlyVoting.js';
import { homeMapWindow, inHomeMapWindow } from './homeMapWindow.js';
import { waitClasses, waitColor } from './jenks.js';
import { PROJECTION } from './outline.js';

/** A dot's radius in view units, by color token (waitColors.js), shortest line first. */
export const DOT_RADIUS = Object.freeze([4, 5, 6, 7.5, 9]);

/** A hollow ring's radius: a closed site, or one with no current count. */
export const HOLLOW_RADIUS = 3.5;

/** How many sites the summary names. */
export const SHORTEST_COUNT = 3;

/**
 * A point in the outline's view units.
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]}
 */
export function project(lng, lat) {
  const { lng0, lat0, kx, scale, x0, y0 } = PROJECTION;
  return [x0 + (lng - lng0) * kx * scale, y0 + (lat0 - lat) * scale];
}

/**
 * Which sites the home map shows at `now`: none outside the map window, the
 * polling places on Election Day, else the early voting sites (open, closed for
 * the night, or done for good on the evening before Election Day).
 * @param {number} now
 * @param {typeof election} [config]
 * @returns {'off' | 'earlyVoting' | 'electionDay'}
 */
export function homeMapMode(now, config = election) {
  if (!inHomeMapWindow(now, homeMapWindow(config))) return 'off';
  return zonedNow(now, config.timeZone).date === config.electionDate
    ? 'electionDay'
    : 'earlyVoting';
}

const byName = (a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.key.localeCompare(b.key);

/**
 * @typedef {object} MapRow One site, as the wait times page lists it.
 * @property {'county' | 'city'} jurisdiction
 * @property {string | null} loc
 * @property {string | null} name
 * @property {number} lat
 * @property {number} lng
 * @property {string | null} waitKey Its key in its board's counts.
 * @property {import('../../config/election.js').ScheduleEntry[] | undefined} schedule
 */

/**
 * What the map draws.
 * @param {{ rows: MapRow[], waits: import('../../data/waitTimes.js').WaitEntry[],
 *   now: number }} input `waits` are the fresh counts of both boards.
 */
export function dotMap({ rows, waits, now }) {
  const byKey = new Map(waits.map((entry) => [`${entry.jurisdiction}:${entry.siteId}`, entry]));
  const sites = rows.map((row) => {
    const status = earlyVotingStatus(row.schedule, now, election.timeZone);
    const open = status.kind === 'openNow';
    const wait = (open && row.waitKey && byKey.get(`${row.jurisdiction}:${row.waitKey}`)) || null;
    return {
      key: `${row.jurisdiction}:${row.loc}:${row.waitKey}`,
      row,
      status,
      open,
      value: wait ? wait.value : null,
    };
  });

  const classes = waitClasses(sites.map((site) => site.value));
  const dots = sites
    .map((site) => {
      const token = site.value === null ? null : waitColor(site.value, classes);
      const [x, y] = project(site.row.lng, site.row.lat);
      return {
        key: `${site.row.jurisdiction}:${site.row.loc}`,
        jurisdiction: site.row.jurisdiction,
        x,
        y,
        token,
        r: token === null ? HOLLOW_RADIUS : DOT_RADIUS[token],
      };
    })
    // Rings under dots, larger dots under smaller ones.
    .sort((a, b) => (a.token === null ? 0 : 1) - (b.token === null ? 0 : 1) || b.r - a.r);

  const legend = classes.map((range, i) => {
    const token = waitColor(range.min, classes);
    return { ...range, index: i, token, r: DOT_RADIUS[token] };
  });

  const shortest = sites
    .filter((site) => site.value !== null)
    .map((site) => ({
      key: site.key,
      name: site.row.name,
      loc: site.row.loc,
      jurisdiction: site.row.jurisdiction,
      value: site.value,
    }))
    .sort((a, b) => a.value - b.value || byName(a, b))
    .slice(0, SHORTEST_COUNT);

  const anyOpen = sites.some((site) => site.open);
  // The earliest opening still to come, when none is open now.
  let nextOpen = null;
  if (!anyOpen) {
    for (const { status } of sites) {
      const next =
        status.kind === 'opensToday'
          ? { date: zonedNow(now, election.timeZone).date, time: status.open }
          : status.kind === 'opensOn'
            ? { date: status.date, time: status.open }
            : null;
      if (next && (!nextOpen || `${next.date}${next.time}` < `${nextOpen.date}${nextOpen.time}`)) {
        nextOpen = next;
      }
    }
  }

  return {
    dots,
    classes,
    legend,
    shortest,
    anyOpen,
    nextOpen,
    // Every site closed for good: the evening before Election Day.
    ended: sites.length > 0 && sites.every((site) => site.status.kind === 'ended'),
    // A site is open but neither board sent a fresh count.
    stale: anyOpen && shortest.length === 0,
  };
}
