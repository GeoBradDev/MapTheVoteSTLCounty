// The clock cases use the real election config. Dates are built from numbers
// (`day`), never written as ISO literals: the hardcoding test scans this file.
// @vitest-environment node
import election from '../../config/election.js';
import {
  earlyVotingStatus,
  formatLongDate,
  hoursOn,
  scheduleLines,
  zonedNow,
} from './earlyVoting.js';

const { timeZone } = election;
const { boe, abs } = election.earlyVoting.schedules;

/** YYYY-MM-DD in 2026, built at run time. */
const day = (month, date) =>
  `2026-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

// Chicago is UTC-5 (CDT) until 2 a.m. on Sunday, November 1, 2026, then UTC-6 (CST).
const cdt = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 5, minutes));
const cst = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 6, minutes));

const status = (entries, now) => earlyVotingStatus(entries, now, timeZone);

describe('zonedNow', () => {
  it('reads the date and time in the given zone, not UTC', () => {
    // 11:30 p.m. Wednesday in Chicago is already Thursday in UTC.
    expect(zonedNow(cdt(10, 21, 23, 30), timeZone)).toEqual({ date: day(10, 21), minutes: 1410 });
    expect(zonedNow(cdt(10, 22, 0, 30), timeZone)).toEqual({ date: day(10, 22), minutes: 30 });
  });

  it('follows the daylight saving change', () => {
    expect(zonedNow(cst(11, 2, 8), timeZone)).toEqual({ date: day(11, 2), minutes: 480 });
  });

  it('reads midnight as minute 0, not 24:00', () => {
    expect(zonedNow(cdt(10, 22, 0), timeZone)).toEqual({ date: day(10, 22), minutes: 0 });
  });
});

describe('hoursOn', () => {
  const entries = [
    { from: '2000-01-03', to: '2000-01-14', days: 'weekdays', open: '08:00', close: '16:30' },
    { from: '2000-01-08', to: '2000-01-08', days: 'daily', open: '09:00', close: '13:00' },
    { from: '2000-01-10', to: '2000-01-10', days: 'daily', open: '10:00', close: '12:00' },
  ];

  it('skips weekends in a weekday range', () => {
    expect(hoursOn(entries, '2000-01-04')).toEqual({ open: '08:00', close: '16:30' });
    expect(hoursOn(entries, '2000-01-09')).toBeNull();
  });

  it('uses a daily entry on a weekend', () => {
    expect(hoursOn(entries, '2000-01-08')).toEqual({ open: '09:00', close: '13:00' });
  });

  it('prefers the narrowest entry when two cover the same day', () => {
    expect(hoursOn(entries, '2000-01-10')).toEqual({ open: '10:00', close: '12:00' });
  });

  it('has no hours outside every range', () => {
    expect(hoursOn(entries, '2000-01-02')).toBeNull();
    expect(hoursOn(entries, '2000-01-15')).toBeNull();
    expect(hoursOn([], '2000-01-04')).toBeNull();
  });
});

describe('earlyVotingStatus with the election config', () => {
  it('before satellite sites open: names the opening day', () => {
    // Monday, October 19, noon.
    expect(status(abs, cdt(10, 19, 12))).toEqual({
      kind: 'opensOn',
      date: abs[0].from,
      open: '08:00',
      close: '16:30',
    });
    expect(abs[0].from).toBe(day(10, 20));
  });

  it('before the Board of Elections opens', () => {
    // Monday, September 21.
    expect(status(boe, cdt(9, 21, 12))).toMatchObject({ kind: 'opensOn', date: day(9, 22) });
  });

  it('on a weekday: open until closing, then the next day', () => {
    // Wednesday, October 21.
    expect(status(abs, cdt(10, 21, 7, 59))).toEqual({
      kind: 'opensToday',
      open: '08:00',
      close: '16:30',
    });
    expect(status(abs, cdt(10, 21, 8))).toEqual({ kind: 'openNow', close: '16:30' });
    expect(status(abs, cdt(10, 21, 16, 29))).toEqual({ kind: 'openNow', close: '16:30' });
    expect(status(abs, cdt(10, 21, 16, 30))).toMatchObject({ kind: 'opensOn', date: day(10, 22) });
  });

  it('around midnight: uses the Chicago date, not the UTC date', () => {
    // 11:30 p.m. Wednesday (Thursday in UTC): Thursday is still "opens on".
    expect(status(abs, cdt(10, 21, 23, 30))).toMatchObject({ kind: 'opensOn', date: day(10, 22) });
    // 12:30 a.m. Thursday: opens later today.
    expect(status(abs, cdt(10, 22, 0, 30))).toEqual({
      kind: 'opensToday',
      open: '08:00',
      close: '16:30',
    });
  });

  it('on Friday evening: the next opening is Saturday', () => {
    expect(status(abs, cdt(10, 23, 17))).toEqual({
      kind: 'opensOn',
      date: day(10, 24),
      open: '09:00',
      close: '13:00',
    });
  });

  it('on a Saturday: Saturday hours, then Monday', () => {
    expect(status(abs, cdt(10, 24, 9))).toEqual({ kind: 'openNow', close: '13:00' });
    expect(status(boe, cdt(10, 24, 12, 59))).toEqual({ kind: 'openNow', close: '13:00' });
    expect(status(abs, cdt(10, 24, 13))).toMatchObject({ kind: 'opensOn', date: day(10, 26) });
  });

  it('on a Sunday: closed, opens Monday', () => {
    expect(status(abs, cdt(10, 25, 11))).toMatchObject({
      kind: 'opensOn',
      date: day(10, 26),
      open: '08:00',
    });
  });

  it('after the last Saturday: skips Sunday and the clock change to Monday, November 2', () => {
    expect(status(abs, cdt(10, 31, 14))).toEqual({
      kind: 'opensOn',
      date: day(11, 2),
      open: '08:00',
      close: '17:00',
    });
    // Sunday, November 1, after the change to CST.
    expect(status(boe, cst(11, 1, 12))).toMatchObject({ kind: 'opensOn', date: day(11, 2) });
  });

  it('on Monday, November 2: open until 5 p.m., then ended', () => {
    expect(status(abs, cst(11, 2, 7, 30))).toEqual({
      kind: 'opensToday',
      open: '08:00',
      close: '17:00',
    });
    expect(status(abs, cst(11, 2, 16, 59))).toEqual({ kind: 'openNow', close: '17:00' });
    expect(status(boe, cst(11, 2, 16, 59))).toEqual({ kind: 'openNow', close: '17:00' });
    expect(status(abs, cst(11, 2, 17))).toEqual({ kind: 'ended' });
    expect(status(boe, cst(11, 2, 17))).toEqual({ kind: 'ended' });
  });

  it('on Election Day: ended', () => {
    expect(day(11, 3)).toBe(election.electionDate);
    expect(status(abs, cst(11, 3, 6))).toEqual({ kind: 'ended' });
    expect(status(boe, cst(11, 3, 12))).toEqual({ kind: 'ended' });
  });

  it('after the election: ended', () => {
    expect(status(abs, cst(11, 20, 12))).toEqual({ kind: 'ended' });
    expect(status(boe, new Date(Date.UTC(2027, 0, 1)))).toEqual({ kind: 'ended' });
  });

  it('with no schedule: ended', () => {
    expect(status([], cdt(10, 21, 12))).toEqual({ kind: 'ended' });
    expect(status(undefined, cdt(10, 21, 12))).toEqual({ kind: 'ended' });
  });
});

describe('formatLongDate', () => {
  it('reads a date with its weekday, whatever the device zone', () => {
    expect(formatLongDate(day(10, 24))).toBe('Saturday, October 24');
    expect(formatLongDate(day(11, 2))).toBe('Monday, November 2');
  });

  it('adds the year when asked', () => {
    expect(formatLongDate(day(10, 20), { year: true })).toBe('October 20, 2026');
  });
});

describe('scheduleLines', () => {
  it('describes each entry in config order', () => {
    expect(scheduleLines(abs)).toEqual([
      {
        weekdaysOnly: true,
        from: 'Tuesday, October 20',
        to: 'Friday, October 30',
        open: '08:00',
        close: '16:30',
      },
      {
        weekdaysOnly: false,
        from: 'Saturday, October 24',
        to: null,
        open: '09:00',
        close: '13:00',
      },
      {
        weekdaysOnly: false,
        from: 'Saturday, October 31',
        to: null,
        open: '09:00',
        close: '13:00',
      },
      { weekdaysOnly: false, from: 'Monday, November 2', to: null, open: '08:00', close: '17:00' },
    ]);
  });

  it('is empty without a schedule', () => {
    expect(scheduleLines(undefined)).toEqual([]);
  });
});
