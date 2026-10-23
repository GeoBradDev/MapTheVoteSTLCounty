// When the home page shows its wait-time dot map (#184): from midnight of the
// first early voting day to Election Day's poll close, in the election's zone.
// @vitest-environment node
import { runInNewContext } from 'node:vm';
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import { HOME_MAP_WINDOW, inHomeMapWindow } from './homeMapMode.js';
import { homeMapWindow, windowScript, zonedInstant } from './homeMapWindow.js';

describe('zonedInstant', () => {
  it('reads a wall clock time in the zone, in daylight and standard time', () => {
    expect(zonedInstant('2030-09-24', '00:00', 'America/Chicago')).toBe(
      Date.UTC(2030, 8, 24, 5, 0),
    );
    expect(zonedInstant('2030-11-05', '19:00', 'America/Chicago')).toBe(
      Date.UTC(2030, 10, 6, 1, 0),
    );
  });
});

describe('homeMapWindow', () => {
  it('runs from the first early voting day, County or City, to poll close', () => {
    expect(homeMapWindow(election, cityResults)).toEqual({
      start: Date.UTC(2026, 8, 22, 5, 0),
      end: Date.UTC(2026, 10, 4, 1, 0),
    });
  });

  it('starts on the City’s first day when it is earlier than the County’s', () => {
    const city = {
      ...cityResults,
      earlyVoting: {
        ...cityResults.earlyVoting,
        schedules: {
          early: [
            { from: '2026-09-01', to: '2026-09-30', days: [1], open: '09:00', close: '10:00' },
          ],
        },
      },
    };
    expect(homeMapWindow(election, city).start).toBe(Date.UTC(2026, 8, 1, 5, 0));
  });

  it('is null with the home map flag off, or every line count off', () => {
    const off = (waitTimes) => ({
      ...election,
      waitTimes: { ...election.waitTimes, ...waitTimes },
    });
    expect(homeMapWindow(off({ homeMap: false }), cityResults)).toBeNull();
    expect(homeMapWindow(off({ enabled: false }), cityResults)).toBeNull();
  });
});

describe('the app’s window', () => {
  it('is the config’s, defined by the build', () => {
    expect(HOME_MAP_WINDOW).toEqual(homeMapWindow(election, cityResults));
  });
});

describe('inHomeMapWindow', () => {
  const window = { start: 100, end: 200 };
  it('includes the start and stops at the end', () => {
    expect(inHomeMapWindow(99, window)).toBe(false);
    expect(inHomeMapWindow(100, window)).toBe(true);
    expect(inHomeMapWindow(199, window)).toBe(true);
    expect(inHomeMapWindow(200, window)).toBe(false);
    expect(inHomeMapWindow(150, null)).toBe(false);
  });
});

describe('windowScript', () => {
  // Runs the script at `at`, then the page's load event with #root as given.
  function run(at, root = {}) {
    const html = { dataset: {} };
    const listeners = [];
    runInNewContext(windowScript({ start: 100, end: 200 }), {
      Date: { now: () => at },
      document: { documentElement: html, getElementById: () => root },
      addEventListener: (type, listener) => listeners.push([type, listener]),
    });
    const marked = { ...html.dataset };
    for (const [type, listener] of listeners) if (type === 'load') listener();
    return { marked, loaded: html.dataset };
  }

  it('marks the page while the window is open, and only then', () => {
    expect(run(150).marked).toEqual({ homeMap: '' });
    expect(run(50).marked).toEqual({});
    expect(run(200).marked).toEqual({});
  });

  it('keeps the mark once the app has taken over the page', () => {
    expect(run(150, { __reactContainer$abc: {} }).loaded).toEqual({ homeMap: '' });
  });

  it('drops the mark at load when the app never started, so no empty box stays', () => {
    expect(run(150, {}).loaded).toEqual({});
    expect(run(150, null).loaded).toEqual({});
  });

  it('is a few hundred bytes', () => {
    expect(windowScript({ start: 100, end: 200 }).length).toBeLessThan(400);
  });
});
