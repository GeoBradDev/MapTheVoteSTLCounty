// The home page dot map's model (#184), over the recorded fixtures in each
// calendar state.
import absentee from '../../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import election from '../../config/election.js';
import { selectCountyWaits } from '../../data/waitTimes.js';
import { countyFresh } from '../../data/waitTimes.fixtures.js';
import { electionDaySchedule } from '../lookup/electionDay.js';
import { pollRows } from '../lookup/nearbyPolls.js';
import cityResults from '../../config/cityResults.js';
import { DOT_RADIUS, dotMap, HOLLOW_RADIUS, project } from './dotMapModel.js';
import { homeMapMode } from './homeMapMode.js';
import { homeMapWindow } from './homeMapWindow.js';
import { CITY_RING, COUNTY_RING, VIEW } from './outline.js';

// 9:05 a.m. Central, 2026-10-22, just after the fresh County counts.
const OPEN_AT = Date.UTC(2026, 9, 22, 14, 5);
// 7:30 p.m. Central the same day: every early voting site has closed.
const CLOSED_AT = Date.UTC(2026, 9, 23, 0, 30);
// 8 p.m. Central on Monday, November 2: early voting is over.
const EVE_AT = Date.UTC(2026, 10, 3, 2, 0);
// 9:05 a.m. and 5 a.m. Central on Election Day.
const ELECTION_DAY_AT = Date.UTC(2026, 10, 3, 15, 5);
const BEFORE_POLLS_AT = Date.UTC(2026, 10, 3, 11, 0);
// 7:30 p.m. Central on Election Day, and a day in August.
const AFTER_POLLS_AT = Date.UTC(2026, 10, 4, 1, 30);
const BEFORE_AT = Date.UTC(2026, 7, 10, 15, 0);

const countyRows = pollRows(absentee).map((row) => ({
  ...row,
  jurisdiction: 'county',
  schedule: election.earlyVoting.schedules[row.absType],
}));

// Two City sites, one open by a schedule that covers every day, by its own
// key in the City's counts.
const allDay = [
  { from: '2026-09-01', to: '2026-12-31', days: 'daily', open: '00:00', close: '23:59' },
];
const cityRows = [
  {
    loc: 'c1',
    name: 'Carnahan High School',
    lat: 38.5847,
    lng: -90.2347,
    jurisdiction: 'city',
    waitKey: 'Carnahan High School',
    schedule: allDay,
  },
  {
    loc: 'c2',
    name: 'Tower Grove Library',
    lat: 38.6081,
    lng: -90.2559,
    jurisdiction: 'city',
    waitKey: 'Tower Grove Library',
    schedule: election.earlyVoting.schedules.abs,
  },
];

const cityWait = (siteId, value) => ({
  siteId,
  jurisdiction: 'city',
  unit: 'people',
  value,
  reportedAt: new Date(OPEN_AT - 60_000),
  source: election.waitTimes.city.source,
  openUntil: new Date(OPEN_AT + 3_600_000),
});

function earlyVotingMap(now, cityWaits = []) {
  return dotMap({
    rows: [...countyRows, ...cityRows],
    waits: [...selectCountyWaits(countyFresh, absentee.features, now), ...cityWaits],
    now,
  });
}

describe('homeMapMode', () => {
  it.each([
    ['before early voting', BEFORE_AT, 'off'],
    ['during early voting', OPEN_AT, 'earlyVoting'],
    ['early voting closed for the night', CLOSED_AT, 'earlyVoting'],
    ['the evening of November 2', EVE_AT, 'earlyVoting'],
    ['Election Day before the polls open', BEFORE_POLLS_AT, 'electionDay'],
    ['Election Day', ELECTION_DAY_AT, 'electionDay'],
    ['after the polls close', AFTER_POLLS_AT, 'off'],
  ])('%s: %s', (_, at, mode) => {
    expect(homeMapMode(at)).toBe(mode);
  });

  it('is off all the time with the home map flag off', () => {
    const config = { ...election, waitTimes: { ...election.waitTimes, homeMap: false } };
    expect(homeMapMode(OPEN_AT, homeMapWindow(config, cityResults))).toBe('off');
  });
});

describe('dotMap, early voting with sites open', () => {
  const map = earlyVotingMap(OPEN_AT, [cityWait('Carnahan High School', 5)]);

  it('has one dot per site, inside the view', () => {
    expect(map.dots).toHaveLength(countyRows.length + cityRows.length);
    for (const dot of map.dots) {
      expect(dot.x).toBeGreaterThan(0);
      expect(dot.x).toBeLessThan(VIEW.width);
      expect(dot.y).toBeGreaterThan(0);
      expect(dot.y).toBeLessThan(VIEW.height);
    }
  });

  it('classes the fresh counts with Jenks, both boards on one scale', () => {
    expect(map.classes.length).toBeGreaterThanOrEqual(1);
    expect(map.classes[0].min).toBe(0);
    const counted = map.dots.filter((dot) => dot.token !== null);
    expect(counted.length).toBeGreaterThan(1);
    expect(counted.some((dot) => dot.jurisdiction === 'city')).toBe(true);
  });

  it('grows each dot with its class, so color is not the only cue', () => {
    for (const dot of map.dots) {
      expect(dot.r).toBe(dot.token === null ? HOLLOW_RADIUS : DOT_RADIUS[dot.token]);
    }
    const tokens = map.legend.map((entry) => entry.token);
    expect(tokens).toEqual([...tokens].sort((a, b) => a - b));
    const radii = map.legend.map((entry) => entry.r);
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
  });

  it('draws rings first, then the larger dots, so the shortest lines sit on top', () => {
    const order = map.dots.map((dot) => (dot.token === null ? -1 : 10 - dot.r));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('a closed site, or an open one with no count, is a hollow ring', () => {
    const tower = map.dots.find((dot) => dot.key === 'city:c2');
    expect(tower.token).toBeNull();
    expect(tower.r).toBe(HOLLOW_RADIUS);
  });

  it('is not stale, has a site open and no next opening', () => {
    expect(map.stale).toBe(false);
    expect(map.anyOpen).toBe(true);
    expect(map.nextOpen).toBeNull();
    expect(map.ended).toBe(false);
  });
});

describe('dotMap, open sites but no fresh count from either board', () => {
  it('is stale', () => {
    const map = dotMap({ rows: [...countyRows, ...cityRows], waits: [], now: OPEN_AT });
    expect(map.stale).toBe(true);
    expect(map.classes).toEqual([]);
  });
});

describe('dotMap, early voting with every site closed', () => {
  const rows = [...countyRows, cityRows[1]];
  const map = dotMap({ rows, waits: [], now: CLOSED_AT });

  it('draws every site as a hollow ring, with no classes', () => {
    expect(map.dots.every((dot) => dot.token === null)).toBe(true);
    expect(map.classes).toEqual([]);
    expect(map.legend).toEqual([]);
  });

  it('says when sites open again, and is not stale', () => {
    expect(map.anyOpen).toBe(false);
    expect(map.stale).toBe(false);
    expect(map.nextOpen).toEqual({ date: '2026-10-23', time: '08:00' });
  });
});

describe('dotMap, the evening of November 2', () => {
  it('has every site closed for good', () => {
    const map = dotMap({ rows: countyRows, waits: [], now: EVE_AT });
    expect(map.ended).toBe(true);
    expect(map.nextOpen).toBeNull();
    expect(map.stale).toBe(false);
    expect(map.dots.every((dot) => dot.token === null)).toBe(true);
  });
});

describe('dotMap, Election Day', () => {
  const rows = pollRows(polls).map((row) => ({
    ...row,
    jurisdiction: 'county',
    waitKey: row.dayKey,
    schedule: electionDaySchedule,
  }));

  it('before the polls open, says they open at 6 a.m. today', () => {
    const map = dotMap({ rows, waits: [], now: BEFORE_POLLS_AT });
    expect(map.nextOpen).toEqual({
      date: election.electionDate,
      time: election.electionDayHours.open,
    });
    expect(map.stale).toBe(false);
  });

  it('with the polls open and no Election Day counts, is stale', () => {
    const map = dotMap({ rows, waits: [], now: ELECTION_DAY_AT });
    expect(map.anyOpen).toBe(true);
    expect(map.stale).toBe(true);
  });
});

describe('project', () => {
  it('puts the County and City rings where the dots go', () => {
    const [x, y] = project(-90.19843, 38.62741);
    const xs = CITY_RING.filter((_, i) => i % 2 === 0);
    expect(x).toBeGreaterThan(Math.min(...xs));
    expect(x).toBeLessThan(Math.max(...xs));
    expect(y).toBeGreaterThan(0);
    expect(COUNTY_RING.length).toBeGreaterThan(0);
  });
});

describe('dotMap and the current opening', () => {
  const carnahan = (model) => model.dots.find((dot) => dot.key === 'city:c1');

  it('drops a count kept past its site’s closing time', () => {
    const closed = { ...cityWait('Carnahan High School', 4), openUntil: new Date(OPEN_AT - 1) };
    expect(carnahan(earlyVotingMap(OPEN_AT, [closed])).token).toBeNull();
    expect(
      carnahan(earlyVotingMap(OPEN_AT, [cityWait('Carnahan High School', 4)])).token,
    ).not.toBeNull();
  });

  it('says when the current opening began: the earliest open site’s opening today', () => {
    // The all-day City site opened at midnight Central on 2026-10-22.
    expect(earlyVotingMap(OPEN_AT).openedAt).toBe(Date.UTC(2026, 9, 22, 5, 0));
    // County sites open at 8 a.m. Central.
    expect(dotMap({ rows: countyRows, waits: [], now: OPEN_AT }).openedAt).toBe(
      Date.UTC(2026, 9, 22, 13, 0),
    );
  });

  it('has no opening while every site is closed', () => {
    expect(dotMap({ rows: countyRows, waits: [], now: CLOSED_AT }).openedAt).toBeNull();
  });
});
