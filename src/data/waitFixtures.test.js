// The early voting wait fixtures (#102) are live responses recorded by hand
// during open hours, for the wait time client (#103). These checks keep them
// honest: the fields #103 reads are there, and the join and freshness facts
// docs/data.md states hold for them. They pin what was true on the recording
// day (the sites, their hours) rather than reading per-election files, so they
// stay green until the next election's fixtures are recorded by hand (README,
// Updating for a new election).
import countyEmpty from '../../docs/raw/fixtures/county-waits-empty.json';
import countyFresh from '../../docs/raw/fixtures/county-waits-fresh.json';
import cityFresh from '../../docs/raw/fixtures/city-waits-fresh.json';
import cityStale from '../../docs/raw/fixtures/city-waits-stale.json';
import election from '../config/election.js';
import { zonedNow } from '../features/lookup/earlyVoting.js';

const RECORDED_ON = '2026-10-22';
// Every County site's hours on the recording day, a weekday (the county's
// Absentee Voting Lookup app, as recorded in docs/data.md). Pinned here rather
// than read from the election config, which the next election rewrites.
const RECORDED_DAY_HOURS = { open: '08:00', close: '16:30' };
// The 21 absentee site usernames (the polls layer's `absentee`) on the
// recording day. The County renumbers them each election.
const RECORDED_DAY_SITES = new Set(Array.from({ length: 21 }, (_, i) => `abs${601 + i}boec`));
const { timeZone } = election;
const dayOf = (ms) => zonedNow(ms, timeZone).date;
const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const rows = (body) => body.features.map((f) => f.attributes);

describe('County wait fixtures (Voters_in_Line_View)', () => {
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
    for (const { Creator } of rows(countyFresh)) expect(RECORDED_DAY_SITES.has(Creator)).toBe(true);
  });

  // Staff report from a few minutes before the doors open (07:59 on
  // 2026-10-22), so the window starts 15 minutes before opening.
  it('fresh: every report was made on the recording day during open hours', () => {
    for (const { CreationDate } of rows(countyFresh)) {
      expect(dayOf(CreationDate)).toBe(RECORDED_ON);
      const { minutes } = zonedNow(CreationDate, timeZone);
      expect(minutes).toBeGreaterThanOrEqual(minutesOf(RECORDED_DAY_HOURS.open) - 15);
      expect(minutes).toBeLessThan(minutesOf(RECORDED_DAY_HOURS.close));
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
  // The owner's query (docs/data.md, Wait times). The stale fixture was
  // recorded earlier with more fields, so it need only include these.
  const FIELDS = [
    'created_date_1740505041182',
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
      expect(Object.keys(row)).toEqual(expect.arrayContaining(FIELDS));
      expect(typeof row.name).toBe('string');
    }
  });

  it('fresh: exactly the fields the query asks for', () => {
    for (const row of rows(cityFresh)) expect(Object.keys(row).sort()).toEqual(FIELDS);
  });

  it('fresh: newest report first, as orderByFields asks, with unreported sites last', () => {
    const times = rows(cityFresh).map((r) => r.last_edited_date_1740505041182 ?? -Infinity);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  // On 2026-10-22 one site (St. Joan of Arc, opening October 27) had no report.
  // A later recording may have none, so this checks only the rows it finds.
  it('a site with no report has a null wait and null report dates', () => {
    const unreported = rows(cityFresh).filter((r) => r.waittime === null);
    for (const r of unreported) {
      expect(r.created_date_1740505041182).toBeNull();
      expect(r.last_edited_date_1740505041182).toBeNull();
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
