import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import election from '../../config/election.js';
import { isFresh, layerMaxAgeMs } from '../../data/freshness.js';
import { distanceOrigin } from './distanceOrigin.js';
import { zonedNow } from './earlyVoting.js';
import { nearestPolls } from './nearbyPolls.js';
import { useRetry } from './useRetry.js';

/**
 * When a list was loaded, for the note shown after a refresh fails: the time
 * (HH:MM) and, when that was not today, the date (YYYY-MM-DD), both in the
 * election's time zone.
 * @param {number} loadedAt Milliseconds.
 * @param {number} [now]
 * @returns {{ time: string, date: string | null }}
 */
export function loadedAtParts(loadedAt, now = Date.now()) {
  const loaded = zonedNow(loadedAt, election.timeZone);
  const today = zonedNow(now, election.timeZone).date;
  const hours = String(Math.floor(loaded.minutes / 60)).padStart(2, '0');
  const minutes = String(loaded.minutes % 60).padStart(2, '0');
  return { time: `${hours}:${minutes}`, date: loaded.date === today ? null : loaded.date };
}

/**
 * The sites of a shared layer nearest a point, for the polling places and
 * early voting cards. A failed first load can be retried (#18). When the tab
 * becomes visible again and the list is older than the layer max age, it is
 * fetched again and replaced in place, with no skeleton (#84); if that refresh
 * fails, the rows stay and `refreshFailed` is set until a refresh succeeds.
 * @param {() => Promise<object>} getLayer getPolls or getAbsenteeSites.
 * @param {string} code The precinct code.
 * @param {{ lat: number, lng: number } | null} origin The looked-up point.
 * @returns {{ result: null | { error: true, attempt: number }
 *     | { rows: object[], loadedAt: number, refreshFailed?: boolean },
 *   loading: boolean, retry: () => void,
 *   targetRef: { current: HTMLElement | null } }}
 */
export function useNearestSites(getLayer, code, origin) {
  const [result, setResult] = useState(null);
  const { attempt, loading, retry, done, targetRef } = useRetry();
  const [refresh, setRefresh] = useState(0);
  // When the rows shown were loaded, read by the visibility listener. Set in
  // the commit that shows the rows, so a visibility change right after it
  // never reads the previous value.
  const loadedAtRef = useRef(null);

  useLayoutEffect(() => {
    loadedAtRef.current = result?.rows ? result.loadedAt : null;
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
    Promise.all([getLayer(), distanceOrigin(code, origin)])
      .then(
        ([layer, point]) => ({
          rows: nearestPolls(layer, point),
          loadedAt: layer.loadedAt ?? Date.now(),
          code,
          origin,
        }),
        () => ({ error: true, attempt }),
      )
      .then((next) => {
        if (!current) return;
        // A failed refresh keeps the rows it was refreshing, never another
        // precinct's or point's.
        setResult((prev) =>
          next.error && prev?.rows && prev.code === code && prev.origin === origin
            ? { ...prev, refreshFailed: true }
            : next,
        );
        done();
      });
    return () => {
      current = false;
    };
  }, [getLayer, code, origin, attempt, done, refresh]);

  return { result, loading, retry, targetRef };
}
