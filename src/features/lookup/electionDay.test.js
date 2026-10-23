// Whether it is Election Day and whether the polls are open (#107). Dates are
// built with Date.UTC, never ISO literals: the hardcoding test scans this file.
// @vitest-environment node
import election from '../../config/election.js';
import {
  electionDayCountsOn,
  electionDaySchedule,
  electionDayStatus,
  isElectionDay,
} from './electionDay.js';

// A time on Election Day, Tuesday, November 3, 2026, in Chicago (UTC-6 then).
const nov3 = (hours, minutes = 0) => Date.UTC(2026, 10, 3, hours + 6, minutes);

describe('electionDaySchedule', () => {
  it('is one day, the election date, with the Election Day hours', () => {
    expect(electionDaySchedule).toEqual([
      {
        from: election.electionDate,
        to: election.electionDate,
        days: 'daily',
        open: election.electionDayHours.open,
        close: election.electionDayHours.close,
      },
    ]);
  });
});

describe('isElectionDay', () => {
  it('is true all of the election date in the election time zone', () => {
    expect(isElectionDay(nov3(0, 0))).toBe(true);
    expect(isElectionDay(nov3(23, 59))).toBe(true);
  });

  it('is false the day before and the day after', () => {
    expect(isElectionDay(nov3(-1))).toBe(false);
    expect(isElectionDay(nov3(24))).toBe(false);
  });
});

describe('electionDayStatus', () => {
  it('opens at the opening time and closes at the closing time', () => {
    expect(electionDayStatus(nov3(5, 59)).kind).toBe('opensToday');
    expect(electionDayStatus(nov3(6)).kind).toBe('openNow');
    expect(electionDayStatus(nov3(18, 59)).kind).toBe('openNow');
    expect(electionDayStatus(nov3(19)).kind).toBe('ended');
  });

  it('is not open on any other day', () => {
    expect(electionDayStatus(Date.UTC(2026, 9, 22, 15)).kind).not.toBe('openNow');
    expect(electionDayStatus(nov3(30)).kind).toBe('ended');
  });
});

describe('electionDayCountsOn', () => {
  const on = (overrides = {}) => ({
    enabled: true,
    county: { enabled: true, electionDay: { enabled: true } },
    city: { enabled: true, electionDay: { enabled: true } },
    ...overrides,
  });

  it('is on when line counts, the board and its Election Day source are all on', () => {
    expect(electionDayCountsOn('county', on())).toBe(true);
    expect(electionDayCountsOn('city', on())).toBe(true);
  });

  it("is off when any of them is off, one board's switch never the other's", () => {
    expect(electionDayCountsOn('county', on({ enabled: false }))).toBe(false);
    const countyOff = on({ county: { enabled: true, electionDay: { enabled: false } } });
    expect(electionDayCountsOn('county', countyOff)).toBe(false);
    expect(electionDayCountsOn('city', countyOff)).toBe(true);
    expect(
      electionDayCountsOn('city', on({ city: { enabled: false, electionDay: { enabled: true } } })),
    ).toBe(false);
  });

  it('reads the config by default', () => {
    const { county } = election.waitTimes;
    expect(electionDayCountsOn('county')).toBe(
      election.waitTimes.enabled && county.enabled && county.electionDay.enabled,
    );
  });
});
