// Both boards' sites for the wait times page (#104, #91) and the home page's
// dot map (#184): the County's and the City's early voting sites, or on
// Election Day (#107) their polling places, loaded once with a retry and again
// after the layer max age. Moved from WaitTimesPage.jsx unchanged, so both
// show the same sites.
import { useEffect, useRef, useState } from 'react';
import election from '../../config/election.js';
import { isFresh, layerMaxAgeMs } from '../../data/freshness.js';
import { loadCityClient } from '../../data/jurisdictions.js';
import { zonedNow } from '../lookup/earlyVoting.js';
import { electionDaySchedule } from '../lookup/electionDay.js';
import { pollRows } from '../lookup/nearbyPolls.js';
import { useRetry } from '../lookup/useRetry.js';

const { schedules } = election.earlyVoting;

/**
 * HH:MM of a time in the election's zone.
 * @param {number} at Milliseconds.
 */
export function clockTime(at) {
  const { minutes } = zonedNow(at, election.timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The City's early voting sites, with the schedules to read them by, from the
 * City chunk (#91, #147).
 * @returns {Promise<{ layer: object, scheduleFor: (loc: string | null) => object[] | undefined,
 *   schedules: Record<string, object[]> }>}
 */
export async function loadCitySites() {
  const chunk = await loadCityClient();
  return {
    layer: await chunk.getCityEarlyVotingSites(),
    scheduleFor: chunk.cityScheduleFor,
    schedules: chunk.citySchedules,
  };
}

/**
 * The City's Election Day polling places (#107), from the City chunk.
 * @returns {Promise<object>}
 */
export async function loadCityPolls() {
  const chunk = await loadCityClient();
  return chunk.getCityPolls();
}

// Each board's part of a load: its rows, each with its `jurisdiction`, the
// schedule it keeps and its key in that board's line counts, and when they
// loaded.
function countyPart(value) {
  const rows = pollRows(value).map((row) => ({
    ...row,
    jurisdiction: 'county',
    schedule: schedules[row.absType],
  }));
  return { rows, loadedAt: value.loadedAt ?? Date.now() };
}

function cityPart(value) {
  const { layer, scheduleFor } = value;
  // The City's counts are keyed by the site's name (waitTimes.city.siteField).
  const rows = pollRows(layer).map((row) => ({
    ...row,
    jurisdiction: 'city',
    waitKey: row.name,
    schedule: scheduleFor(row.loc),
  }));
  return { rows, loadedAt: layer.loadedAt ?? Date.now(), schedules: value.schedules };
}

// On Election Day (#107): every polling place, open by Election Day hours,
// keyed by its Election Day key in its board's counts, with no early voting
// kind or note.
function countyDayPart(layer) {
  const rows = pollRows(layer).map((row) => ({
    ...row,
    jurisdiction: 'county',
    absType: null,
    absNote: null,
    waitKey: row.dayKey,
    schedule: electionDaySchedule,
  }));
  return { rows, loadedAt: layer.loadedAt ?? Date.now() };
}

function cityDayPart(layer) {
  const rows = pollRows(layer).map((row) => ({
    ...row,
    jurisdiction: 'city',
    waitKey: row.name,
    schedule: electionDaySchedule,
  }));
  return { rows, loadedAt: layer.loadedAt ?? Date.now(), schedules: null };
}

/**
 * Both boards' sites as one list, as each board's part settles: a part is
 * undefined while it loads and null when it failed, and a board whose part
 * failed or is loading again keeps the part it last loaded (`prev`). The list
 * shows once one board has rows, without waiting for the other; `failed`
 * names a board with no rows once its load failed. Both failing is an error;
 * nothing loaded yet keeps `prev` (null on the first load: the skeleton).
 */
function combine(prev, parts, attempt, mode) {
  // A load for the other mode (the day turned to or from Election Day) is
  // never kept.
  if (prev && prev.mode !== mode) prev = null;
  // Loaded now; else, while loading, what it was; else, failed now, what it
  // last loaded or null.
  const pick = (key) =>
    parts[key] || (parts[key] === undefined ? prev?.[key] : prev?.[key] || null);
  const county = pick('county');
  const city = pick('city');
  if (county === null && city === null) return { error: true, attempt, mode };
  if (!county && !city) return prev;
  const loaded = [county, city].filter(Boolean);
  return {
    county,
    city,
    rows: loaded.flatMap((part) => part.rows),
    loadedAt: Math.min(...loaded.map((part) => part.loadedAt)),
    failed: county === null ? 'county' : city === null ? 'city' : null,
    attempt,
    mode,
    citySchedules: city?.schedules ?? null,
  };
}

/**
 * Both boards' sites, loaded once with a retry on failure (#18), and loaded
 * again when the tab is shown after the layer max age (#84). A refresh that
 * fails, in whole or in part, keeps the rows of a load that did not. On
 * Election Day (#107) the boards' parts are their polling places instead.
 */
export function useSites(loadSites, loadCity, loadPolls, loadCityPolls, electionDay) {
  const [result, setResult] = useState(null);
  const { attempt, loading, retry, done, targetRef } = useRetry();
  const [refresh, setRefresh] = useState(0);
  const loadedAtRef = useRef(null);
  // The result shown, read when a load starts.
  const shownRef = useRef(null);

  useEffect(() => {
    loadedAtRef.current = result?.rows ? result.loadedAt : null;
    shownRef.current = result;
  }, [result]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const loadedAt = loadedAtRef.current;
      if (loadedAt !== null && !isFresh(loadedAt, layerMaxAgeMs())) setRefresh((n) => n + 1);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    let current = true;
    // Each board's part as it settles, so a slow board never holds up the
    // other's list. A retry of a failure shows its answer only once both have
    // settled, so the failure and its busy Try again stay in place (and focus
    // on it) until then, and the alert is read again only if it still fails.
    const parts = { county: undefined, city: undefined };
    const retrying = Boolean(shownRef.current?.error || shownRef.current?.failed);
    const settle = (key) => (part) => {
      if (!current) return;
      parts[key] = part;
      const all = parts.county !== undefined && parts.city !== undefined;
      if (retrying && !all) return;
      // A copy: the updater may run later, after the other part settles too.
      const settled = { ...parts };
      setResult((prev) => combine(prev?.error ? null : prev, settled, attempt, mode));
      if (all) done();
    };
    const mode = electionDay ? 'electionDay' : 'earlyVoting';
    (electionDay ? loadPolls().then(countyDayPart) : loadSites().then(countyPart)).then(
      settle('county'),
      () => settle('county')(null),
    );
    (electionDay ? loadCityPolls().then(cityDayPart) : loadCity().then(cityPart)).then(
      settle('city'),
      () => settle('city')(null),
    );
    return () => {
      current = false;
    };
  }, [loadSites, loadCity, loadPolls, loadCityPolls, electionDay, attempt, done, refresh]);

  return { result, loading, retry, targetRef };
}
