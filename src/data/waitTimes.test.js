// The wait time selection (#103): which reports become entries, at a fixed
// clock. Dates are built with Date.UTC, never ISO literals: the hardcoding
// test scans this file.
// @vitest-environment node
import absenteeSites from '../../docs/raw/fixtures/absentee-sites.json';
import election from '../config/election.js';
import { cityFresh, cityStale, countyFresh } from './waitTimes.fixtures.js';
import {
  parseCityHours,
  reportedTimeParts,
  selectCityWaits,
  selectCountyWaits,
  stillShowable,
} from './waitTimes.js';

const MINUTE = 60_000;
const sites = absenteeSites.features;

// A time on the recording day, Thursday 2026-10-22, in Chicago (UTC-5 then).
const oct22 = (hours, minutes = 0, seconds = 0) =>
  Date.UTC(2026, 9, 22, hours + 5, minutes, seconds);
// The same, on Wednesday 2026-10-21.
const oct21 = (hours, minutes = 0) => Date.UTC(2026, 9, 21, hours + 5, minutes);

const byId = (entries) => Object.fromEntries(entries.map((e) => [e.siteId, e]));
const newest = (creator) =>
  Math.max(...countyFresh.filter((r) => r.Creator === creator).map((r) => r.CreationDate));
const report = (Creator, CreationDate, linecount) => ({ Creator, CreationDate, linecount });

describe('selectCountyWaits', () => {
  const now = oct22(9, 0, 30);

  it('returns one entry per reporting site, in the shared shape', () => {
    const entries = selectCountyWaits(countyFresh, sites, now);
    expect(entries).toHaveLength(19);
    const board = byId(entries).abs601boec;
    expect(board).toEqual({
      siteId: 'abs601boec',
      jurisdiction: 'county',
      unit: 'people',
      value: 0,
      reportedAt: new Date(newest('abs601boec')),
      source: election.waitTimes.county.source,
      openUntil: new Date(oct22(16, 30)),
    });
    expect(board.reportedAt).toBeInstanceOf(Date);
  });

  it('keeps the newest report per site, whatever the row order', () => {
    const reversed = [...countyFresh].reverse();
    const entries = byId(selectCountyWaits(reversed, sites, now));
    // abs604boec reported 16 at 8:02, 2 at 8:39 and 2 at 8:59.
    expect(entries.abs604boec.value).toBe(2);
    expect(entries.abs604boec.reportedAt.getTime()).toBe(newest('abs604boec'));
    // abs609boec reported 29 at 8:02, then 0 at 8:31.
    expect(entries.abs609boec.value).toBe(0);
  });

  it('drops a report older than maxAgeMinutes', () => {
    const later = oct22(8, 30, 19) + election.waitTimes.maxAgeMinutes * MINUTE + 1000;
    const entries = byId(selectCountyWaits(countyFresh, sites, later));
    // abs606boec's only report was at 8:30:19.
    expect(entries.abs606boec).toBeUndefined();
    // abs602boec reported at 9:00:10, still fresh.
    expect(entries.abs602boec.value).toBe(0);
  });

  it('drops a report whose Creator matches no site, never guessing', () => {
    const rows = [report('abs999boec', oct22(8, 55), 4), report('ABS601BOEC', oct22(8, 56), 9)];
    expect(selectCountyWaits(rows, sites, now)).toEqual([]);
  });

  it('drops a report from the future beyond the allowed skew, and keeps one within it', () => {
    const skew = election.waitTimes.skewMinutes * MINUTE;
    const rows = [
      report('abs602boec', now + skew + 1000, 50),
      report('abs604boec', now + skew - 1000, 3),
    ];
    const entries = byId(selectCountyWaits(rows, sites, now));
    expect(entries.abs602boec).toBeUndefined();
    expect(entries.abs604boec.value).toBe(3);
  });

  it('falls back to the newest valid report when the newest one is unusable', () => {
    const rows = [
      report('abs602boec', now + 60 * MINUTE, 50),
      report('abs602boec', oct22(8, 59), null),
      report('abs602boec', oct22(8, 40), 7),
    ];
    expect(byId(selectCountyWaits(rows, sites, now)).abs602boec.value).toBe(7);
  });

  it('drops a null, negative or fractional linecount', () => {
    const rows = [
      report('abs602boec', oct22(8, 59), null),
      report('abs604boec', oct22(8, 59), -1),
      report('abs605boec', oct22(8, 59), 2.5),
      report('abs606boec', oct22(8, 59), '3'),
    ];
    expect(selectCountyWaits(rows, sites, now)).toEqual([]);
  });

  it('returns nothing while the sites are closed', () => {
    // The first report came at 7:59, before the 8:00 opening.
    expect(selectCountyWaits(countyFresh, sites, oct22(7, 59, 50))).toEqual([]);
    // Reported at 4:20 p.m. means nothing at 4:30 p.m. closing or after.
    const late = [report('abs602boec', oct22(16, 20), 5)];
    expect(selectCountyWaits(late, sites, oct22(16, 29))).toHaveLength(1);
    expect(selectCountyWaits(late, sites, oct22(16, 30))).toEqual([]);
    expect(selectCountyWaits(late, sites, oct22(19, 0))).toEqual([]);
  });

  it('drops a site whose kind of site has no schedule', () => {
    const odd = sites.map((f) =>
      f.properties.absentee === 'abs602boec'
        ? { ...f, properties: { ...f.properties, abs_type: 'other' } }
        : f,
    );
    expect(byId(selectCountyWaits(countyFresh, odd, now)).abs602boec).toBeUndefined();
  });

  it('returns nothing for the empty view', () => {
    expect(selectCountyWaits([], sites, now)).toEqual([]);
  });
});

describe('parseCityHours', () => {
  it('reads single days and day ranges', () => {
    const hours = parseCityHours(
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    );
    expect(hours).toEqual({
      0: null,
      1: { open: '13:00', close: '16:00' },
      2: { open: '11:00', close: '17:00' },
      3: { open: '11:00', close: '19:00' },
      4: { open: '11:00', close: '19:00' },
      5: { open: '11:00', close: '16:30' },
      6: { open: '11:00', close: '16:30' },
    });
  });

  it('accepts a missing space after a semicolon', () => {
    const hours = parseCityHours(
      'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    );
    expect(hours[4]).toEqual({ open: '11:00', close: '17:00' });
    expect(hours[0]).toBeNull();
  });

  it('leaves days it does not name closed', () => {
    const hours = parseCityHours('Mo-Fr (08:00-17:00)');
    expect(hours[1]).toEqual({ open: '08:00', close: '17:00' });
    expect(hours[5]).toEqual({ open: '08:00', close: '17:00' });
    expect(hours[6]).toBeUndefined();
    expect(hours[0]).toBeUndefined();
  });

  it.each([
    [null],
    [''],
    ['Open daily'],
    ['Mo (13:00-16:00); whenever'],
    ['Mo (1 p.m. - 4 p.m.)'],
    ['Xx (08:00-17:00)'],
    ['Mo (17:00-08:00)'],
    ['Mo (25:00-26:00)'],
  ])('reads %j as unknown, so the site counts as closed', (text) => {
    expect(parseCityHours(text)).toBeNull();
  });
});

describe('selectCityWaits', () => {
  const { city } = election.waitTimes;

  it('returns only the site that is open now with a report from today', () => {
    // At 9:00 the Board office is open (8 to 5) and reported at 8:10; the
    // libraries open at 11 and their reports are from yesterday.
    const entries = selectCityWaits(cityFresh, oct22(9, 0, 30));
    expect(entries).toEqual([
      {
        siteId: 'St._Louis_City_Election_Board',
        jurisdiction: 'city',
        unit: 'people',
        value: 0,
        reportedAt: new Date(cityFresh[5][city.timeField]),
        source: city.source,
        openUntil: new Date(oct22(17, 0)),
      },
    ]);
  });

  it('never returns the 2026-10-21 reports on 2026-10-22', () => {
    for (const at of [oct22(7, 44), oct22(9, 0), oct22(11, 30), oct22(13, 0), oct22(18, 30)]) {
      expect(selectCityWaits(cityStale, at)).toEqual([]);
    }
  });

  it('drops a report from yesterday even within maxAgeMinutes', () => {
    const row = {
      [city.siteField]: 'Night_Site',
      [city.hoursField]: 'Mo-Su (00:00-23:59)',
      [city.commentsField]: null,
      [city.valueField]: 4,
      [city.timeField]: oct21(23, 50),
    };
    expect(selectCityWaits([row], oct22(0, 10))).toEqual([]);
    expect(selectCityWaits([{ ...row, [city.timeField]: oct22(0, 5) }], oct22(0, 10))).toHaveLength(
      1,
    );
  });

  it('drops a site with no report: a null waittime and report time', () => {
    const joan = cityFresh.find((r) => r[city.siteField] === 'St._Joan_of_Arc');
    expect(selectCityWaits([joan], oct22(13, 0))).toEqual([]);
    const board = cityFresh[5];
    expect(selectCityWaits([{ ...board, [city.valueField]: null }], oct22(9))).toEqual([]);
  });

  it('drops a report older than maxAgeMinutes', () => {
    const board = cityFresh[5];
    const at = board[city.timeField] + election.waitTimes.maxAgeMinutes * MINUTE + 1000;
    expect(selectCityWaits([board], at)).toEqual([]);
  });

  it('drops a report from the future beyond the allowed skew', () => {
    const board = { ...cityFresh[5], [city.timeField]: oct22(9, 30) };
    expect(selectCityWaits([board], oct22(9, 0))).toEqual([]);
  });

  it('drops a site whose comments say the poll is closed', () => {
    const board = { ...cityFresh[5], [city.commentsField]: 'Poll Closed due to weather' };
    expect(selectCityWaits([board], oct22(9, 0))).toEqual([]);
  });

  it('drops a site whose hours it cannot read', () => {
    const board = { ...cityFresh[5], [city.hoursField]: 'Call for hours' };
    expect(selectCityWaits([board], oct22(9, 0))).toEqual([]);
  });

  it('keeps the newest row when a site appears twice', () => {
    const board = cityFresh[5];
    const older = { ...board, [city.valueField]: 9, [city.timeField]: oct22(8, 0) };
    expect(selectCityWaits([older, board], oct22(9, 0))[0].value).toBe(0);
  });
});

describe('stillShowable', () => {
  const entry = {
    reportedAt: new Date(oct22(8, 0)),
    openUntil: new Date(oct22(16, 30)),
  };

  it('is true while the report is fresh and the site open', () => {
    expect(stillShowable(entry, oct22(9, 0))).toBe(true);
  });

  it('is false once the report is older than maxAgeMinutes', () => {
    const at = oct22(8, 0) + election.waitTimes.maxAgeMinutes * MINUTE + 1;
    expect(stillShowable(entry, at)).toBe(false);
  });

  it('is false at closing time', () => {
    const late = { ...entry, reportedAt: new Date(oct22(16, 0)) };
    expect(stillShowable(late, oct22(16, 29))).toBe(true);
    expect(stillShowable(late, oct22(16, 30))).toBe(false);
  });
});

describe('reportedTimeParts', () => {
  it('gives the report time in the election time zone, with the date when not today', () => {
    const entry = { reportedAt: new Date(oct22(8, 10, 45)) };
    expect(reportedTimeParts(entry, oct22(9, 0))).toEqual({ time: '08:10', date: null });
    expect(reportedTimeParts({ reportedAt: new Date(oct21(18, 32)) }, oct22(9, 0))).toEqual({
      time: '18:32',
      date: new Date(oct21(12)).toISOString().slice(0, 10),
    });
  });
});
