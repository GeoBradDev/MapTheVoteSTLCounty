// The early voting wait fixtures (#102) are live responses recorded by hand
// during open hours, for the wait time client (#103). These checks keep them
// honest: the fields #103 reads are there, and the join and freshness facts
// docs/data.md states hold for them.
import countyEmpty from '../../docs/raw/fixtures/county-waits-empty.json';
import countyFresh from '../../docs/raw/fixtures/county-waits-fresh.json';
import cityFresh from '../../docs/raw/fixtures/city-waits-fresh.json';
import cityStale from '../../docs/raw/fixtures/city-waits-stale.json';
import absenteeSites from '../../docs/raw/fixtures/absentee-sites.json';
import election from '../config/election.js';
import { hoursOn, zonedNow } from '../features/lookup/earlyVoting.js';

const RECORDED_ON = '2026-10-22';
const { timeZone } = election;
const dayOf = (ms) => zonedNow(ms, timeZone).date;
const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const rows = (body) => body.features.map((f) => f.attributes);

describe('County wait fixtures (Voters_in_Line_View)', () => {
  const sites = new Map(absenteeSites.features.map((f) => [f.properties.absentee, f.properties]));

  it('fresh: real reports with the fields the client reads', () => {
    expect(countyFresh.error).toBeUndefined();
    expect(countyFresh.features.length).toBeGreaterThan(0);
    for (const row of rows(countyFresh)) {
      expect(Object.keys(row).sort()).toEqual(['CreationDate', 'Creator', 'linecount']);
      expect(typeof row.Creator).toBe('string');
      expect(typeof row.CreationDate).toBe('number');
      expect(row.linecount === null || Number.isInteger(row.linecount)).toBe(true);
    }
  });

  it('fresh: newest first, as orderByFields asks', () => {
    const times = rows(countyFresh).map((r) => r.CreationDate);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('fresh: every Creator is an absentee site username on the polls layer', () => {
    for (const { Creator } of rows(countyFresh)) expect(sites.has(Creator)).toBe(true);
  });

  // Staff report from a few minutes before the doors open (07:59 on
  // 2026-10-22), so the window starts 15 minutes before opening.
  it("fresh: every report was made on the recording day during its site's hours", () => {
    for (const { Creator, CreationDate } of rows(countyFresh)) {
      expect(dayOf(CreationDate)).toBe(RECORDED_ON);
      const schedule = election.earlyVoting.schedules[sites.get(Creator).abs_type];
      const hours = hoursOn(schedule, RECORDED_ON);
      const { minutes } = zonedNow(CreationDate, timeZone);
      expect(minutes).toBeGreaterThanOrEqual(minutesOf(hours.open) - 15);
      expect(minutes).toBeLessThan(minutesOf(hours.close));
    }
  });

  it('fresh: some site reported more than once, so newest wins can be tested', () => {
    const creators = rows(countyFresh).map((r) => r.Creator);
    expect(new Set(creators).size).toBeLessThan(creators.length);
  });

  it('empty: the view returns no rows before the sites open', () => {
    expect(countyEmpty.error).toBeUndefined();
    expect(countyEmpty.features).toEqual([]);
  });
});

describe('City wait fixtures (VotingLocations_currentwait)', () => {
  const FIELDS = [
    'comments',
    'created_date_1740505041182',
    'earlyvotingenddate',
    'earlyvotingoperhours',
    'earlyvotingstartdate',
    'facilityid',
    'last_edited_date',
    'last_edited_date_1740505041182',
    'name',
    'waittime',
  ];

  it.each([
    ['fresh', cityFresh],
    ['stale', cityStale],
  ])('%s: the early voting sites with the fields the client reads', (_, body) => {
    expect(body.error).toBeUndefined();
    expect(body.features.length).toBeGreaterThan(0);
    for (const row of rows(body)) {
      expect(Object.keys(row).sort()).toEqual(FIELDS);
      expect(typeof row.facilityid).toBe('string');
    }
  });

  it('fresh: at least one site reported on the recording day', () => {
    const today = rows(cityFresh).filter(
      (r) => r.created_date_1740505041182 && dayOf(r.created_date_1740505041182) === RECORDED_ON,
    );
    expect(today.length).toBeGreaterThan(0);
    for (const r of today) expect(Number.isInteger(r.waittime)).toBe(true);
  });

  it('stale: no report from the recording day, only earlier ones', () => {
    const reported = rows(cityStale).filter((r) => r.created_date_1740505041182);
    expect(reported.length).toBeGreaterThan(0);
    for (const r of reported) expect(dayOf(r.created_date_1740505041182) < RECORDED_ON).toBe(true);
  });
});
