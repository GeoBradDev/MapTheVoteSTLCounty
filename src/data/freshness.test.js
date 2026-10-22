// Dates are built from the config, never ISO literals: the hardcoding test
// scans this file.
// @vitest-environment node
import election from '../config/election.js';
import { isFresh, layerMaxAgeMs } from './freshness.js';

const MINUTE = 60_000;

// A time on Election Day or a day around it, in Chicago, from the config's date.
// Chicago is UTC-6 on and after November 1, 2026.
function chicago(dayOffset, hours, minutes = 0) {
  const [year, month, day] = election.electionDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day + dayOffset, hours + 6, minutes);
}

describe('isFresh', () => {
  const at = Date.UTC(2026, 9, 21, 15);

  it('is fresh up to and including the max age', () => {
    expect(isFresh(at, 10 * MINUTE, at)).toBe(true);
    expect(isFresh(at, 10 * MINUTE, at + 10 * MINUTE)).toBe(true);
  });

  it('is stale once older than the max age', () => {
    expect(isFresh(at, 10 * MINUTE, at + 10 * MINUTE + 1)).toBe(false);
  });

  it('is stale when the time is in the future, beyond the allowed skew', () => {
    expect(isFresh(at + 1, 10 * MINUTE, at)).toBe(false);
    expect(isFresh(at + 2 * MINUTE, 10 * MINUTE, at, 3 * MINUTE)).toBe(true);
    expect(isFresh(at + 4 * MINUTE, 10 * MINUTE, at, 3 * MINUTE)).toBe(false);
  });

  it('accepts Date objects as well as milliseconds', () => {
    expect(isFresh(new Date(at), 10 * MINUTE, new Date(at + MINUTE))).toBe(true);
  });

  it('is stale when the time is missing or not a number', () => {
    expect(isFresh(undefined, 10 * MINUTE, at)).toBe(false);
    expect(isFresh(null, 10 * MINUTE, at)).toBe(false);
    expect(isFresh(Number.NaN, 10 * MINUTE, at)).toBe(false);
    expect(isFresh(new Date(Number.NaN), 10 * MINUTE, at)).toBe(false);
  });
});

describe('layerMaxAgeMs', () => {
  const { minutes, electionDayMinutes } = election.layerMaxAge;

  it('is shorter on Election Day than before it', () => {
    expect(electionDayMinutes).toBeLessThan(minutes);
  });

  it('uses the normal max age before Election Day', () => {
    expect(layerMaxAgeMs(chicago(-1, 23, 59))).toBe(minutes * MINUTE);
  });

  it('uses the Election Day max age from midnight to midnight in Chicago', () => {
    expect(layerMaxAgeMs(chicago(0, 0, 0))).toBe(electionDayMinutes * MINUTE);
    expect(layerMaxAgeMs(chicago(0, 19, 0))).toBe(electionDayMinutes * MINUTE);
    expect(layerMaxAgeMs(chicago(0, 23, 59))).toBe(electionDayMinutes * MINUTE);
    expect(layerMaxAgeMs(chicago(1, 0, 0))).toBe(minutes * MINUTE);
  });

  it('reads the date in Chicago, not in UTC', () => {
    // 8 p.m. on Election Day in Chicago is already the next day in UTC.
    expect(layerMaxAgeMs(chicago(0, 20, 0))).toBe(electionDayMinutes * MINUTE);
    // 7 p.m. the day before is Election Day in UTC, not in Chicago.
    expect(layerMaxAgeMs(chicago(-1, 19, 0))).toBe(minutes * MINUTE);
  });

  it('defaults to the current time', () => {
    expect(layerMaxAgeMs()).toBeGreaterThan(0);
  });
});
