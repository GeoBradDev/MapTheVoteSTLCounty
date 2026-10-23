// The City's early voting hours (#91): the config's compact weekly hours read
// as the dated entries the County's status code takes. Dates are built from
// numbers, never ISO literals: the hardcoding test scans this file.
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import { cityHours, cityScheduleFor, citySchedules } from './cityEarlyVoting.js';
import { earlyVotingStatus, formatLongDate } from './earlyVoting.js';
import { earlyVotingSeason } from '../waitTimes/earlyVotingSeason.js';

const zone = election.timeZone;
const cityEarlyVoting = cityResults.earlyVoting;
// Chicago is UTC-5 until November 1, 2026, then UTC-6.
const cdt = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 5, minutes));
const cst = (month, date, hours, minutes = 0) =>
  new Date(Date.UTC(2026, month - 1, date, hours + 6, minutes));
const iso = (month, date) =>
  `2026-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

const status = (loc, now) => earlyVotingStatus(cityScheduleFor(loc), now, zone);

const BUDER = 'Buder_Library';
const CARPENTER = 'Carpenter_Library';
const BOARD = 'St._Louis_City_Election_Board';
const JOAN = 'St._Joan_of_Arc';

describe('the City early voting config', () => {
  it('cites the City Board and names when it was checked', () => {
    expect(cityEarlyVoting.sources.length).toBeGreaterThan(0);
    for (const url of cityEarlyVoting.sources) {
      expect(new URL(url).host).toBe('www.stlouis-mo.gov');
    }
    expect(cityEarlyVoting.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives each of the 8 City early voting sites a schedule the config has', () => {
    const sites = Object.entries(cityEarlyVoting.sites);
    expect(sites).toHaveLength(8);
    for (const [, key] of sites) expect(cityEarlyVoting.schedules[key]?.length).toBeGreaterThan(0);
  });

  it('uses whole weekdays, HH:MM times and dates inside the election window', () => {
    for (const entries of Object.values(cityEarlyVoting.schedules)) {
      for (const entry of entries) {
        expect(entry.from <= entry.to).toBe(true);
        expect(entry.to < election.electionDate).toBe(true);
        expect(entry.open < entry.close).toBe(true);
        expect(entry.open).toMatch(/^\d{2}:\d{2}$/);
        expect(entry.days.length).toBeGreaterThan(0);
        for (const day of entry.days) expect([0, 1, 2, 3, 4, 5, 6]).toContain(day);
      }
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(cityEarlyVoting.schedules.board[0].days)).toBe(true);
    expect(Object.isFrozen(cityResults.electionDayRule)).toBe(true);
  });
});

describe('City early voting status, in Chicago time', () => {
  it('on a weekday: the library hours of that weekday', () => {
    // Wednesday, October 21: Buder 11 a.m. to 7 p.m., Carpenter to 5 p.m.
    expect(status(BUDER, cdt(10, 21, 10))).toEqual({
      kind: 'opensToday',
      open: '11:00',
      close: '19:00',
    });
    expect(status(BUDER, cdt(10, 21, 18))).toEqual({ kind: 'openNow', close: '19:00' });
    expect(status(CARPENTER, cdt(10, 21, 18))).toEqual({
      kind: 'opensOn',
      date: iso(10, 22),
      open: '11:00',
      close: '17:00',
    });
    // Monday, October 26: 1 to 4 p.m.
    expect(status(BUDER, cdt(10, 26, 12))).toEqual({
      kind: 'opensToday',
      open: '13:00',
      close: '16:00',
    });
    expect(status(BOARD, cdt(10, 21, 16, 59))).toEqual({ kind: 'openNow', close: '17:00' });
  });

  it('on a Saturday: the libraries, and the Board office only on the last one', () => {
    // Saturday, October 24.
    expect(status(BUDER, cdt(10, 24, 12))).toEqual({ kind: 'openNow', close: '16:30' });
    expect(status(BOARD, cdt(10, 24, 12))).toEqual({
      kind: 'opensOn',
      date: iso(10, 26),
      open: '08:00',
      close: '17:00',
    });
    // Saturday, October 31: the Board office 9 a.m. to 1 p.m.
    expect(status(BOARD, cdt(10, 31, 10))).toEqual({ kind: 'openNow', close: '13:00' });
  });

  it('on a Sunday: every site is closed and opens Monday', () => {
    // Sunday, October 25.
    for (const loc of [BUDER, CARPENTER, BOARD]) {
      expect(status(loc, cdt(10, 25, 12)).kind).toBe('opensOn');
      expect(status(loc, cdt(10, 25, 12)).date).toBe(iso(10, 26));
    }
    // Sunday, November 1 (now standard time).
    expect(status(BUDER, cst(11, 1, 12))).toEqual({
      kind: 'opensOn',
      date: iso(11, 2),
      open: '13:00',
      close: '16:00',
    });
  });

  it('St. Joan of Arc opens Tuesday, October 27', () => {
    expect(status(JOAN, cdt(10, 22, 12))).toEqual({
      kind: 'opensOn',
      date: iso(10, 27),
      open: '11:00',
      close: '17:00',
    });
    expect(status(JOAN, cdt(10, 26, 14)).date).toBe(iso(10, 27));
  });

  it('on the last day, Monday, November 2', () => {
    expect(status(BUDER, cst(11, 2, 15))).toEqual({ kind: 'openNow', close: '16:00' });
    expect(status(BOARD, cst(11, 2, 16))).toEqual({ kind: 'openNow', close: '17:00' });
    expect(status(BUDER, cst(11, 2, 16)).kind).toBe('ended');
    expect(status(BOARD, cst(11, 2, 17)).kind).toBe('ended');
  });

  it('after early voting ends: ended, and the season too', () => {
    for (const loc of Object.keys(cityEarlyVoting.sites)) {
      expect(status(loc, cst(11, 3, 7)).kind).toBe('ended');
    }
    expect(earlyVotingSeason(citySchedules, cst(11, 3, 7), zone).kind).toBe('ended');
    expect(earlyVotingSeason(citySchedules, cdt(10, 22, 12), zone).kind).toBe('during');
  });

  it('has no schedule for a site the config does not name', () => {
    expect(cityScheduleFor('Somewhere_Else')).toBeUndefined();
    expect(cityHours('Somewhere_Else')).toBeNull();
  });
});

describe('cityHours', () => {
  it("reads a library's week as the City Board's page does", () => {
    expect(cityHours(BUDER)).toEqual({
      from: formatLongDate(iso(10, 20)),
      to: formatLongDate(iso(11, 2)),
      lines: [
        { days: 'Monday', open: '13:00', close: '16:00' },
        { days: 'Tuesday', open: '11:00', close: '17:00' },
        { days: 'Wednesday and Thursday', open: '11:00', close: '19:00' },
        { days: 'Friday and Saturday', open: '11:00', close: '16:30' },
      ],
    });
    expect(cityHours(CARPENTER).lines[1]).toEqual({
      days: 'Tuesday to Thursday',
      open: '11:00',
      close: '17:00',
    });
  });

  it("names the Board office's one Saturday by its date", () => {
    expect(cityHours(BOARD).lines).toEqual([
      { days: 'Monday to Friday', open: '08:00', close: '17:00' },
      { days: formatLongDate(iso(10, 31)), open: '09:00', close: '13:00' },
    ]);
  });

  it("starts St. Joan of Arc's dates on October 27", () => {
    expect(cityHours(JOAN).from).toBe(formatLongDate(iso(10, 27)));
  });
});
