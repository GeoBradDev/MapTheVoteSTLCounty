// Checks the shape and internal consistency of the election config. Exact
// values are reviewed against docs/data.md, not restated here: a test that
// repeated them would hardcode this election outside the config.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import byId from '../../docs/raw/fixtures/precinct-by-id.json';
import election, { congressionalMap, jurisdictions } from './election.js';
import cityResults from './cityResults.js';
import referrals from './referrals.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

const REQUIRED_KEYS = [
  'electionDate',
  'electionName',
  'timeZone',
  'serviceRoot',
  'layers.precincts',
  'layers.polls',
  'layers.countyBoundary',
  'layers.pollRooms',
  'pollRooms.where',
  'pollRooms.fields',
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
  'electionDayPollingPlace.phoneSource',
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

  // The 2022 map applies on November 3, 2026: the Missouri Supreme Court held
  // the 2025 map (H.B. 1) does not take effect unless voters approve it, and
  // the County's sample ballots follow the 2022 map (#150).
  // Checked through a recorded precinct, not by name: the field name belongs in
  // the config alone.
  it('names the 2022 congressional map field', () => {
    expect(election.congressionalField).toMatch(/^congressional_district_\d+$/);
    expect(byId.features[0].attributes[election.congressionalField]).toMatch(
      /^US Representative District \d+ \(2022\)$/,
    );
  });

  it('names the congressional map and its County districts for the health check', () => {
    const { year, districts } = congressionalMap;
    expect(Object.isFrozen(congressionalMap.districts)).toBe(true);
    expect(year).toMatch(/^\d{4}$/);
    expect(districts.length).toBeGreaterThan(0);
    for (const d of districts) expect(d).toMatch(/^\d+$/);
    expect(byId.features[0].attributes[election.congressionalField]).toMatch(
      new RegExp(`\\(${year}\\)$`),
    );
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

describe('jurisdictions (#86)', () => {
  it('has a County and a City block, each with its id, names and layers', () => {
    expect(Object.keys(jurisdictions)).toEqual(['county', 'city']);
    for (const [id, block] of Object.entries(jurisdictions)) {
      expect(block.id).toBe(id);
      expect(block.name).toMatch(/\S/);
      expect(block.board).toMatch(/\S/);
      expect(block.serviceRoot).toMatch(/^https:\/\/[^/]+\/.+[^/]$/);
      expect(block.layers.precincts).toMatch(/\/FeatureServer\/\d+$/);
    }
    expect(jurisdictions.city.precinctField).toMatch(/^\w+$/);
  });

  it('names the City layers, their fields and filters (#87)', () => {
    const { city } = jurisdictions;
    for (const key of ['precincts', 'districts', 'sites', 'boundary']) {
      expect(city.layers[key], key).toMatch(/^\w+\/FeatureServer\/\d+$/);
    }
    for (const fields of [city.districtLayerFields, city.siteFields]) {
      for (const field of Object.values(fields)) expect(field).toMatch(/^\w+$/);
    }
    expect(Object.keys(city.districtLayerFields).sort()).toEqual(['id', 'name', 'office']);
    expect(Object.keys(city.siteFields).sort()).toEqual([
      'accessibleEntry',
      'address',
      'entry',
      'id',
      'name',
      'zip',
    ]);
    for (const key of ['pollsWhere', 'earlyVotingWhere', 'boundaryWhere']) {
      expect(city[key], key).toMatch(/\S/);
    }
    // Every named layer is cited by its own description, once.
    const cited = Object.values(city.layers).map((l) => `${city.serviceRoot}/${l}?f=pjson`);
    expect([...city.sources].sort()).toEqual([...new Set(cited)].sort());
  });

  it('is frozen', () => {
    expect(Object.isFrozen(jurisdictions.city)).toBe(true);
    expect(Object.isFrozen(jurisdictions.city.layers)).toBe(true);
  });

  it("keeps the County's values in the default export, unchanged", () => {
    const { id, name, board, boardSiteUrl, ...values } = jurisdictions.county;
    for (const [key, value] of Object.entries(values)) expect(election[key]).toBe(value);
    expect(election.countySiteUrl).toBe(boardSiteUrl);
    expect([id, name, board].every((v) => typeof v === 'string')).toBe(true);
    expect(election).not.toHaveProperty('id');
    expect(election.jurisdictions).toBe(jurisdictions);
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

  it('shows the congressional map in effect first, and no other congressional field', () => {
    expect(fields[0]).toEqual({ key: 'congressional', field: election.congressionalField });
    const congressional = fields.filter((f) => f.field.startsWith('congressional'));
    expect(congressional).toEqual([fields[0]]);
  });

  it('never reads the pre-joined districts field, which includes the 2025 congressional map', () => {
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

  // Owner decision on #152 (2026-10-22), reversing #72: a registered County
  // voter may vote at any polling place in the County. The rule cites the
  // County Board's own Polling Places page, not RSMo 115.430 or the Secretary
  // of State, whose pages say "assigned polling place".
  it("cites the County Board's Polling Places page, and a verified date", () => {
    expectSources(rule.sources);
    // The board's own site (countySiteUrl), its Polling Places page.
    expect(rule.sources).toEqual([`${election.countySiteUrl}elections/polling-places/`]);
    expect(rule.lastVerified).toMatch(ISO_DATE);
    expect(rule.lastVerified >= '2026-10-22').toBe(true);
  });

  it('cites neither the statute nor the state page that say "assigned polling place"', () => {
    expect(rule.sources).not.toContain(
      'https://revisor.mo.gov/main/OneSection.aspx?section=115.430',
    );
    expect(rule.sources.some((url) => new URL(url).host === 'www.sos.mo.gov')).toBe(false);
    expect(rule.sources.some((url) => new URL(url).host === 'stlouiscovotes.info')).toBe(false);
  });

  it("has the county board's phone number", () => {
    expect(rule.phone).toMatch(/^\d{3}-\d{3}-\d{4}$/);
    expectSources([rule.phoneSource]);
  });
});

describe("the City's Election Day rule (#89)", () => {
  const rule = cityResults.electionDayRule;

  // The City Board's own words, from its polling places page: any City voter
  // may vote at any listed location on Election Day.
  it("quotes the City Board's polling places page, with a verified date", () => {
    expect(rule.quote).toMatch(/\S/);
    // It names this election's date, so a quote carried over from an earlier
    // election fails here.
    const day = new Date(`${election.electionDate}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    expect(rule.quote).toContain(day);
    // Named in referrals.js, which holds the City Board's stable pages.
    expect(referrals[rule.source].url).toBe(referrals.stlCityLookup.url);
    expect(new URL(referrals[rule.source].url).host).toBe('www.stlouis-mo.gov');
    expect(rule.lastVerified).toMatch(ISO_DATE);
  });

  // #152 changed only the County's rule: the City keeps the City Board's own
  // words and source, and shares nothing with the County rule.
  it("is untouched by the County's rule (#152)", () => {
    expect(rule.quote).toBe(
      'Any voter who is registered to vote at an address within the boundaries of St. Louis City can vote at any of the listed locations on November 3, 2026.',
    );
    expect(rule.source).toBe('stlCityLookup');
    for (const url of election.electionDayPollingPlace.sources) {
      expect(new URL(url).host).not.toBe(new URL(referrals[rule.source].url).host);
    }
  });
});

describe('wait times', () => {
  const { waitTimes } = election;

  it('refreshes no faster than the layers cache and keeps reports at most 2 hours', () => {
    expect(typeof waitTimes.enabled).toBe('boolean');
    expect(waitTimes.refreshSeconds).toBeGreaterThanOrEqual(30);
    expect(waitTimes.maxAgeMinutes).toBeGreaterThan(0);
    expect(waitTimes.maxAgeMinutes).toBeLessThanOrEqual(120);
    expect(waitTimes.skewMinutes).toBeGreaterThanOrEqual(0);
    expect(waitTimes.skewMinutes).toBeLessThan(15);
    expectSources(waitTimes.sources);
    expect(waitTimes.lastVerified).toMatch(ISO_DATE);
  });

  it.each(['county', 'city'])('names the %s layer, its fields, unit and board', (key) => {
    const source = waitTimes[key];
    expect(typeof source.enabled).toBe('boolean');
    expect(source.serviceRoot).toMatch(/^https:\/\/[^/]+\/.+\/rest\/services$/);
    expect(source.layer).toMatch(/^\w+\/FeatureServer\/\d+$/);
    expect(source.where).toEqual(expect.any(String));
    for (const field of ['siteField', 'valueField', 'timeField']) {
      expect(source[field]).toMatch(/^\w+$/);
    }
    expect(['people', 'minutes']).toContain(source.unit);
    expect(source.source).toMatch(/Board of Election/);
    // The board's own public page for these counts, linked from the wait
    // times page (#104), and one of the block's sources.
    expect(waitTimes.sources).toContain(source.sourceUrl);
  });

  it('joins County reports on a polls layer field and reads City hours and comments', () => {
    expect(waitTimes.county.pollsField).toMatch(/^\w+$/);
    expect(waitTimes.city.hoursField).toMatch(/^\w+$/);
    expect(waitTimes.city.commentsField).toMatch(/^\w+$/);
    expect(waitTimes.city.closedText).toEqual(expect.any(String));
  });

  it('names an Election Day source per board (#107), the County one fully', () => {
    const { county, city } = waitTimes;
    expect(typeof county.electionDay.enabled).toBe('boolean');
    expect(county.electionDay.serviceRoot).toMatch(/^https:\/\/[^ ]+\/rest\/services$/);
    expect(county.electionDay.layer).toMatch(/^[\w-]+\/FeatureServer\/\d+$/);
    expect(county.electionDay.where).toEqual(expect.any(String));
    expect(county.electionDay.pollsField).toMatch(/^\w+$/);
    expect(county.electionDay.pollsField).not.toBe(county.pollsField);
    expect(waitTimes.sources).toContain(county.electionDay.sourceUrl);
    expect(typeof city.electionDay.enabled).toBe('boolean');
    // The City's Election Day polling places, the same filter the cards use.
    expect(city.electionDay.where).toBe(election.jurisdictions.city.pollsWhere);
  });
});
