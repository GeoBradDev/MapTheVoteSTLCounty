// The early voting wait times every component reads (#103), from one shared
// refresh loop: one request per jurisdiction per `refreshSeconds`, however
// many components read it. (The City early voting card, #91, runs its own
// loop on the same rules, built with createWaitTimesStore, that asks only the
// City's layer. The home page's dot map, #184, reads this shared loop.) The
// loop runs only while some component reads it and the tab is visible, and
// refreshes at once when the tab comes back. A failed refresh keeps the last
// values while each is still fresh and its site open, then reports the
// jurisdiction unavailable. A failure never throws into the page.
import { useSyncExternalStore } from 'react';
import election from '../../config/election.js';
import { getCityWaits, getCountyWaits } from '../../data/arcgis.js';
import { stillShowable } from '../../data/waitTimes.js';

/**
 * @typedef {object} JurisdictionWaits
 * @property {'off' | 'loading' | 'ok' | 'unavailable'} status `off` when
 *   config turns it off; `loading` before the first answer; `ok` when the last
 *   answer arrived or values from it are still shown; `unavailable` when a
 *   request failed and nothing fresh is left.
 * @property {boolean} refreshFailed Whether the latest request failed.
 * @property {number | null} checkedAt When the last request that succeeded
 *   was sent (ms), or null before the first; a failure leaves it as it was.
 * @property {number | null} answeredAt When the latest answered request,
 *   with counts or a failure, was sent (ms), or null before the first.
 * @property {number | null} askedAt When the latest request was sent (ms), or
 *   null before the first. Later than `answeredAt` while it is unanswered.
 * @property {import('../../data/waitTimes.js').WaitEntry[]} waits
 */

/**
 * @typedef {object} WaitTimesState
 * @property {import('../../data/waitTimes.js').WaitEntry[]} waits Every fresh
 *   entry, County first.
 * @property {JurisdictionWaits} county
 * @property {JurisdictionWaits} city
 */

const KEYS = ['county', 'city'];

function initialState(fetchers) {
  const part = (key) => ({
    status: fetchers[key] ? 'loading' : 'off',
    refreshFailed: false,
    checkedAt: null,
    answeredAt: null,
    askedAt: null,
    waits: [],
  });
  return withWaits({ county: part('county'), city: part('city') });
}

function withWaits(state) {
  return { ...state, waits: KEYS.flatMap((key) => state[key].waits) };
}

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * A shared loop over the given fetchers. Exported for tests; the app uses the
 * one built from config.
 * @param {{ county: (() => Promise<object[]>) | null, city: (() => Promise<object[]>) | null }} fetchers
 *   A null fetcher is off and never asked.
 * @param {{ refreshMs?: number }} [options]
 */
export function createWaitTimesStore(
  fetchers,
  { refreshMs = election.waitTimes.refreshSeconds * 1000 } = {},
) {
  const initial = initialState(fetchers);
  let state = initial;
  const listeners = new Set();
  // When each board's unanswered request was sent.
  const inFlight = new Map();
  let timer = null;
  // When the loop last asked, so a reader mounting soon after the last one
  // left waits out the interval instead of asking again.
  let lastTickAt = null;

  function update(key, change) {
    state = withWaits({ ...state, [key]: { ...state[key], ...change } });
    for (const listener of listeners) listener();
  }

  // Drops kept values that aged out or whose site closed, as at every tick.
  function prune(key, failed) {
    const part = state[key];
    const waits = part.waits.filter((entry) => stillShowable(entry, Date.now()));
    const status = failed && waits.length === 0 ? 'unavailable' : part.status;
    if (waits.length !== part.waits.length || status !== part.status)
      update(key, { waits, status });
  }

  // Each answer is stamped with when its request was sent, not when it
  // arrived: a request left unanswered while a phone slept is not a check of
  // the next morning. Only one request per board is out at a time, except
  // when the loop resumes after a stop (asleep, frozen): then a new one
  // replaces one still out from before, and that one's late answer is dropped.
  async function refresh(key, resumed) {
    if (inFlight.has(key) && !resumed) return;
    const sentAt = Date.now();
    inFlight.set(key, sentAt);
    update(key, { askedAt: sentAt });
    const current = () => inFlight.get(key) === sentAt;
    try {
      const waits = await fetchers[key]();
      if (!current()) return;
      update(key, {
        status: 'ok',
        refreshFailed: false,
        checkedAt: sentAt,
        answeredAt: sentAt,
        waits,
      });
    } catch {
      if (!current()) return;
      update(key, { refreshFailed: true, answeredAt: sentAt });
      prune(key, true);
    } finally {
      if (current()) inFlight.delete(key);
    }
  }

  function tick() {
    clearTimeout(timer);
    timer = null;
    if (listeners.size === 0 || isHidden()) return;
    timer = setTimeout(tick, refreshMs);
    const resumed = lastTickAt !== null && Date.now() - lastTickAt > 1.5 * refreshMs;
    lastTickAt = Date.now();
    for (const key of KEYS) {
      if (!fetchers[key]) continue;
      prune(key, state[key].refreshFailed);
      refresh(key, resumed);
    }
  }

  function onVisibilityChange() {
    if (isHidden()) {
      clearTimeout(timer);
      timer = null;
    } else {
      tick();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        document.addEventListener('visibilitychange', onVisibilityChange);
        // A negative elapsed time means the clock moved back: ask now.
        const elapsed = lastTickAt === null ? Infinity : Date.now() - lastTickAt;
        if (elapsed >= 0 && elapsed < refreshMs && !isHidden()) {
          timer = setTimeout(tick, refreshMs - elapsed);
        } else {
          tick();
        }
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          document.removeEventListener('visibilitychange', onVisibilityChange);
          clearTimeout(timer);
          timer = null;
        }
      };
    },
    /**
     * While no component reads it, the loop is stopped and nothing prunes, so a
     * component mounting later would first render values that aged out. Drop
     * them here, before that render; with no listeners there is no one to tell.
     * @returns {WaitTimesState}
     */
    getSnapshot() {
      if (listeners.size === 0) {
        for (const key of KEYS) if (fetchers[key]) prune(key, state[key].refreshFailed);
      }
      return state;
    },
    /** @returns {WaitTimesState} */
    getServerSnapshot: () => initial,
  };
}

const { enabled, county, city } = election.waitTimes;
const store = createWaitTimesStore({
  county: enabled && county.enabled ? getCountyWaits : null,
  city: enabled && city.enabled ? getCityWaits : null,
});

/**
 * One board's loop each, for the polling places card on Election Day (#107):
 * a County precinct's page asks only the County's layer, a City precinct's
 * only the City's.
 */
export const boardWaits = {
  county: createWaitTimesStore({
    county: enabled && county.enabled ? getCountyWaits : null,
    city: null,
  }),
  city: createWaitTimesStore({ county: null, city: enabled && city.enabled ? getCityWaits : null }),
};

const OFF_STATE = createWaitTimesStore({ county: null, city: null }).getServerSnapshot();
/**
 * A source that never asks anything, read instead of a loop while no count
 * can show, so a page asks the line count layers only while they can.
 */
export const OFF_WAITS = Object.freeze({
  subscribe: () => () => {},
  getSnapshot: () => OFF_STATE,
  getServerSnapshot: () => OFF_STATE,
});

/**
 * The current early voting waits, shared by every component that reads them.
 * @param {ReturnType<typeof createWaitTimesStore>} [source] For tests.
 * @returns {WaitTimesState}
 */
export function useWaitTimes(source = store) {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getServerSnapshot);
}
