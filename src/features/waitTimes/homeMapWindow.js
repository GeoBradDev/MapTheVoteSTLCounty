// When the home page shows its wait-time dot map (#184): from midnight of the
// first early voting day (County or City) to Election Day's poll close, in the
// election's zone. Inside it the page's own map states (open, closed, the
// evening before Election Day) apply; outside it the home page is as it was.
//
// The page is pre-rendered at build time (#99), so it cannot know the date.
// The build writes `windowScript` to a small same-origin file that runs in the
// head before the first paint (src/prerender/homeMapScript.js) and marks
// <html> while the window is open; the CSS then reserves the map's box, so
// nothing moves when the map arrives. Plain data and Intl only: vite.config.js
// loads this file in Node.
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';

/**
 * The instant a wall clock time on a date reads in `timeZone`.
 * @param {string} date YYYY-MM-DD.
 * @param {string} time HH:MM, 24-hour.
 * @param {string} timeZone IANA zone.
 * @returns {number} Milliseconds since the epoch.
 */
export function zonedInstant(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  // The zone's offset at an instant, in ms.
  const offsetAt = (instant) => {
    const parts = Object.fromEntries(
      format.formatToParts(instant).map(({ type, value }) => [type, Number(value)]),
    );
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute);
    return asUtc - instant;
  };
  // Twice, so a time near a daylight saving change takes the offset in force then.
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant);
  return instant;
}

/**
 * The window, or null when the config turns the home map off (its own flag,
 * `waitTimes.homeMap`, or every line count).
 * @param {typeof election} [config]
 * @param {typeof cityResults} [city]
 * @returns {{ start: number, end: number } | null}
 */
export function homeMapWindow(config = election, city = cityResults) {
  if (!config.waitTimes.enabled || !config.waitTimes.homeMap) return null;
  const firsts = [
    ...Object.values(config.earlyVoting.schedules).flat(),
    ...Object.values(city.earlyVoting.schedules).flat(),
  ].map((entry) => entry.from);
  const first = firsts.reduce((min, from) => (from < min ? from : min));
  return {
    start: zonedInstant(first, '00:00', config.timeZone),
    end: zonedInstant(config.electionDate, config.electionDayHours.close, config.timeZone),
  };
}

/**
 * Whether `now` is inside `window`, its start included and its end not.
 * @param {number} now
 * @param {{ start: number, end: number } | null} window
 */
export function inHomeMapWindow(now, window) {
  return Boolean(window) && now >= window.start && now < window.end;
}

/**
 * The head script's text: marks <html> with `data-home-map` while the window
 * is open.
 * @param {{ start: number, end: number }} window
 */
export function windowScript({ start, end }) {
  return `(function(){var n=Date.now();if(n>=${start}&&n<${end})document.documentElement.dataset.homeMap=''})();\n`;
}
