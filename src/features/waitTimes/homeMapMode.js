// Which sites the home page's dot map shows now (#184), in the browser. The
// window's start and end come from the build (src/prerender/homeMapScript.js
// defines them as __HOME_MAP_WINDOW__ from homeMapWindow.js), so the City's
// config stays out of the first load.
/* global __HOME_MAP_WINDOW__ */
import election from '../../config/election.js';
import { zonedNow } from '../lookup/earlyVoting.js';

/**
 * The map window from the config, or null with the home map off.
 * @type {{ start: number, end: number } | null}
 */
export const HOME_MAP_WINDOW =
  typeof __HOME_MAP_WINDOW__ === 'undefined' ? null : __HOME_MAP_WINDOW__;

/**
 * Whether `now` is inside `window`, its start included and its end not.
 * @param {number} now
 * @param {{ start: number, end: number } | null} window
 */
export function inHomeMapWindow(now, window) {
  return Boolean(window) && now >= window.start && now < window.end;
}

/**
 * None outside the map window, the polling places on Election Day, else the
 * early voting sites (open, closed for the night, or done for good on the
 * evening before Election Day).
 * @param {number} now
 * @param {{ start: number, end: number } | null} [window]
 * @returns {'off' | 'earlyVoting' | 'electionDay'}
 */
export function homeMapMode(now, window = HOME_MAP_WINDOW) {
  if (!inHomeMapWindow(now, window)) return 'off';
  return zonedNow(now, election.timeZone).date === election.electionDate
    ? 'electionDay'
    : 'earlyVoting';
}
