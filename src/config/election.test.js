// Checks the shape and internal consistency of the election config. Exact
// values are reviewed against docs/data.md, not restated here: a test that
// repeated them would hardcode this election outside the config.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import byId from '../../docs/raw/fixtures/precinct-by-id.json';
import election from './election.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

const REQUIRED_KEYS = [
  'electionDate',
  'electionName',
  'timeZone',
  'serviceRoot',
  'layers.precincts',
  'layers.polls',
  'layers.countyBoundary',
  'absenteeWhere',
  'sampleBallotUrlPattern',
  'congressionalField',
  'districtFields',
  'officialLookupUrl',
  'countySiteUrl',
  'nearbyPollCount',
  'earlyVoting.sources',
  'earlyVoting.lastVerified',
  'earlyVoting.schedules.boe',
  'earlyVoting.schedules.abs',
  'electionDayHours.open',
  'electionDayHours.close',
  'electionDayHours.inLineAtCloseMayVote',
  'electionDayHours.sources',
  'electionDayHours.lastVerified',
  'electionDayPollingPlace.sources',
  'electionDayPollingPlace.lastVerified',
  'electionDayPollingPlace.phone',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function get(obj, keyPath) {
  return keyPath.split('.').reduce((value, key) => value?.[key], obj);
}

function weekday(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

function isWeekend(isoDate) {
  return weekday(isoDate) === 0 || weekday(isoDate) === 6;
}

// Every date an entry covers, skipping weekends for a 'weekdays' range.
function datesIn({ from, to, days }) {
  const dates = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`);) {
    const iso = d.toISOString().slice(0, 10);
    if (days === 'daily' || !isWeekend(iso)) dates.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function expectSources(sources) {
  expect(Array.isArray(sources)).toBe(true);
  expect(sources.length).toBeGreaterThan(0);
  for (const url of sources) expect(url).toMatch(/^https:\/\//);
}

describe('election config', () => {
  it('has every required key', () => {
    const missing = REQUIRED_KEYS.filter((key) => get(election, key) == null);
    expect(missing).toEqual([]);
  });

  it('is deeply frozen, except the RegExp', () => {
    const unfrozen = [];
    (function walk(value, where) {
      if (value === null || typeof value !== 'object' || value instanceof RegExp) return;
      if (!Object.isFrozen(value)) unfrozen.push(where);
      for (const [key, child] of Object.entries(value)) walk(child, `${where}.${key}`);
    })(election, 'election');
    expect(unfrozen).toEqual([]);
  });

  it('uses ISO dates and an IANA time zone', () => {
    expect(election.electionDate).toMatch(ISO_DATE);
    expect(election.electionName).toEqual(expect.any(String));
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: election.timeZone })).not.toThrow();
  });

  it('points layers at FeatureServer layers under an https service root', () => {
    expect(election.serviceRoot).toMatch(/^https:\/\/[^/]+\/.+\/rest\/services$/);
    for (const layer of Object.values(election.layers)) {
      expect(layer).toMatch(/^\w+\/FeatureServer\/\d+$/);
    }
  });

  it('filters absentee sites by abs_type', () => {
    expect(election.absenteeWhere).toMatch(/^abs_type IN \(/);
  });

  it('names a congressional district field', () => {
    expect(election.congressionalField).toMatch(/^congressional_district_\d+$/);
  });

  it('links an https official lookup app', () => {
    expect(election.officialLookupUrl).toMatch(/^https:\/\//);
  });

  it('shows 3 to 5 nearby polling places', () => {
    expect(Number.isInteger(election.nearbyPollCount)).toBe(true);
    expect(election.nearbyPollCount).toBeGreaterThanOrEqual(3);
    expect(election.nearbyPollCount).toBeLessThanOrEqual(5);
  });
});

describe('district fields', () => {
  const fields = election.districtFields;

  it('is a list of unique keys and fields', () => {
    expect(fields.length).toBeGreaterThan(0);
    for (const entry of fields) {
      expect(Object.keys(entry).sort()).toEqual(['field', 'key']);
      expect(entry.key).toMatch(/^[a-zA-Z]+$/);
      expect(entry.field).toMatch(/^\w+$/);
    }
    expect(new Set(fields.map((f) => f.key)).size).toBe(fields.length);
    expect(new Set(fields.map((f) => f.field)).size).toBe(fields.length);
  });

  it('shows the current congressional map first, and no other congressional field', () => {
    expect(fields[0]).toEqual({ key: 'congressional', field: election.congressionalField });
    const congressional = fields.filter((f) => f.field.startsWith('congressional'));
    expect(congressional).toEqual([fields[0]]);
  });

  it('never reads the pre-joined districts field, which includes the old congressional map', () => {
    expect(fields.map((f) => f.field)).not.toContain('districts');
  });

  it('names only fields the recorded precinct layer has', () => {
    const columns = Object.keys(byId.features[0].attributes);
    expect(fields.map((f) => f.field).filter((f) => !columns.includes(f))).toEqual([]);
  });
});

describe('sample ballot URL pattern', () => {
  const pattern = election.sampleBallotUrlPattern;

  it('is an anchored, stateless RegExp', () => {
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.global).toBe(false);
    expect(pattern.sticky).toBe(false);
    expect(pattern.source.startsWith('^')).toBe(true);
    expect(pattern.source.endsWith('$')).toBe(true);
  });

  it('accepts the sample ballot link recorded in docs/data.md', async () => {
    const doc = await readFile(path.join(ROOT, 'docs/data.md'), 'utf8');
    const link = doc.match(/^html\s+=.*href=([^ >]+)>/m)?.[1];
    expect(link).toBeDefined();
    expect(pattern.test(link)).toBe(true);
  });

  it('rejects another host, a malformed item ID, or extra path', async () => {
    const doc = await readFile(path.join(ROOT, 'docs/data.md'), 'utf8');
    const link = doc.match(/^html\s+=.*href=([^ >]+)>/m)[1];
    const id = link.match(/items\/([0-9a-f]{32})\/data$/)[1];
    expect(pattern.test(link.replace(/^https:\/\/[^/]+/, 'https://example.com'))).toBe(false);
    expect(pattern.test(link.replace(/^https:/, 'http:'))).toBe(false);
    expect(pattern.test(link.replace(id, id.slice(1)))).toBe(false);
    expect(pattern.test(link.replace(id, `${id.slice(1)}g`))).toBe(false);
    expect(pattern.test(`${link}/x`)).toBe(false);
    expect(pattern.test(`${link}?f=json`)).toBe(false);
  });
});

describe('early voting schedules', () => {
  const { earlyVoting } = election;
  const schedules = Object.entries(earlyVoting.schedules);

  it('cites sources and a verified date', () => {
    expectSources(earlyVoting.sources);
    expect(earlyVoting.lastVerified).toMatch(ISO_DATE);
  });

  it('keys schedules by the abs_type values in the absentee filter', () => {
    for (const [absType] of schedules) expect(election.absenteeWhere).toContain(`'${absType}'`);
  });

  it('uses well-formed entries', () => {
    for (const [, entries] of schedules) {
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(Object.keys(entry).sort()).toEqual(['close', 'days', 'from', 'open', 'to']);
        expect(entry.from).toMatch(ISO_DATE);
        expect(entry.to).toMatch(ISO_DATE);
        expect(entry.from <= entry.to).toBe(true);
        expect(['weekdays', 'daily']).toContain(entry.days);
        expect(entry.open).toMatch(TIME);
        expect(entry.close).toMatch(TIME);
        expect(entry.open < entry.close).toBe(true);
      }
    }
  });

  it('starts and ends weekday ranges on weekdays', () => {
    const bad = schedules.flatMap(([absType, entries]) =>
      entries
        .filter((e) => e.days === 'weekdays' && (isWeekend(e.from) || isWeekend(e.to)))
        .map((e) => `${absType} ${e.from}..${e.to}`),
    );
    expect(bad).toEqual([]);
  });

  it('ends before Election Day', () => {
    for (const [, entries] of schedules) {
      for (const entry of entries) expect(entry.to < election.electionDate).toBe(true);
    }
  });

  it('lists each date at most once per schedule', () => {
    for (const [absType, entries] of schedules) {
      const dates = entries.flatMap(datesIn);
      const repeated = dates.filter((d, i) => dates.indexOf(d) !== i);
      expect(repeated, absType).toEqual([]);
    }
  });
});

describe('Election Day hours', () => {
  const hours = election.electionDayHours;

  it('opens before it closes', () => {
    expect(hours.open).toMatch(TIME);
    expect(hours.close).toMatch(TIME);
    expect(hours.open < hours.close).toBe(true);
  });

  it('says whether voters in line at closing may vote', () => {
    expect(typeof hours.inLineAtCloseMayVote).toBe('boolean');
  });

  it('cites sources and a verified date', () => {
    expectSources(hours.sources);
    expect(hours.lastVerified).toMatch(ISO_DATE);
  });
});

describe('the Election Day polling place rule', () => {
  const rule = election.electionDayPollingPlace;

  // Owner decision on #72: the rule follows RSMo 115.430 and the Secretary of
  // State, not the county's old "vote at any polling place" FAQ line.
  it('cites RSMo 115.430 and the Secretary of State, and a verified date', () => {
    expectSources(rule.sources);
    expect(rule.sources).toContain('https://revisor.mo.gov/main/OneSection.aspx?section=115.430');
    expect(rule.sources.some((url) => new URL(url).host === 'www.sos.mo.gov')).toBe(true);
    expect(rule.lastVerified).toMatch(ISO_DATE);
  });

  it('never cites the county FAQ that said any polling place works', () => {
    expect(rule.sources.some((url) => new URL(url).host === 'stlouiscovotes.info')).toBe(false);
  });

  it("has the county board's phone number", () => {
    expect(rule.phone).toMatch(/^\d{3}-\d{3}-\d{4}$/);
  });
});
