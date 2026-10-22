// The next election should be a config change, not a code change. Fails when a
// layer, service, date, URL, field or filter from src/config/election.js is
// written anywhere else in the app source, for the County and the City blocks
// alike (#86). content/ is allowed to hold them.
// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readSitemapTopics,
  robotsTxt,
  sitemapXml,
} from '../features/learn/content/searchEngines.js';
import election from '../config/election.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CONFIG = path.join(ROOT, 'src/config/election.js');

// Source links mostly cite the county site and statutes, which other pages may
// link too, and a verification date is not the election's. Neither is
// collected, except a source that is a portal item or app made for this
// election, recognizable by its 32 hex character ID.
const PORTAL_ITEM_ID = /[0-9a-f]{32}/;

// City field names too common in the app's code to scan for.
const COMMON_WORDS = new Set(['name', 'district']);

// URLs, ISO dates and layer paths (plus the service name in each path) found
// anywhere in the config, and the few values that are none of those.
function electionValues(config = election) {
  const values = new Set(
    [
      config.electionName,
      config.absenteeWhere,
      config.congressionalField,
      config.sampleBallotUrlPattern?.source,
    ].filter(Boolean),
  );
  // The City block's field names (#86, #87) and filters (#87) too: City code
  // reads them from the config, never from a literal. Field names that are
  // common words used across the app are not collected, nor are County field
  // names, many of which are (`ward`, `precinct`).
  const cityFields = config.jurisdictions?.city ?? {};
  for (const [key, value] of Object.entries(cityFields)) {
    if (/(Field|Where)$/.test(key) && typeof value === 'string') values.add(value);
    if (key.endsWith('Fields') && value && typeof value === 'object') {
      for (const field of Object.values(value)) {
        if (typeof field === 'string' && !COMMON_WORDS.has(field)) values.add(field);
      }
    }
  }
  (function walk(value, key) {
    if (key === 'lastVerified') return;
    if (typeof value === 'string') {
      if (key === 'sources' && !PORTAL_ITEM_ID.test(value)) return;
      if (/^https?:\/\//.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) values.add(value);
      if (/\/FeatureServer\/\d+$/.test(value)) {
        values.add(value);
        values.add(value.split('/')[0]);
      }
    } else if (Array.isArray(value)) {
      // Array items inherit the array's key, so `sources` entries are known.
      value.forEach((item) => walk(item, key));
    } else if (value && typeof value === 'object' && !(value instanceof RegExp)) {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
    }
  })(config);
  return [...values];
}

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

describe('election-specific values', () => {
  it('collects values from every part of the config', () => {
    const values = electionValues();
    expect(values).toContain(election.electionDate);
    expect(values).toContain(election.serviceRoot);
    expect(values).toContain(election.officialLookupUrl);
    expect(values).toContain(election.earlyVoting.schedules.abs[0].from);
    expect(values).toContain(election.earlyVoting.sources[0]);
    expect(values).not.toContain(election.electionDayHours.sources[0]);
  });

  it("collects the City block's layers and field names (#86)", () => {
    const { city } = election.jurisdictions;
    const values = electionValues();
    expect(values).toContain(city.serviceRoot);
    expect(values).toContain(city.layers.precincts);
    expect(values).toContain(city.layers.precincts.split('/')[0]);
    expect(values).toContain(city.precinctField);
  });

  it("collects the City block's layer field names, except common words (#87)", () => {
    const values = electionValues({
      jurisdictions: { city: { siteFields: { id: 'site_key', name: 'name' } } },
    });
    expect(values).toEqual(['site_key']);
    const { city } = election.jurisdictions;
    expect(electionValues()).toEqual(
      expect.arrayContaining([city.siteFields.address, city.districtLayerFields.office]),
    );
  });

  it("collects the City block's filters (#87)", () => {
    const values = electionValues({ jurisdictions: { city: { pollsWhere: "a = 'b'" } } });
    expect(values).toEqual(["a = 'b'"]);
  });

  it('collects field names from a City block only', () => {
    const values = electionValues({
      jurisdictions: { county: { siteField: 'abc' }, city: { precinctField: 'xyz' } },
    });
    expect(values).toEqual(['xyz']);
  });

  it('ignores generic source links and verification dates, which other pages may share', () => {
    const values = electionValues({
      electionDate: '2000-01-04',
      officialLookupUrl: 'https://example.org/lookup',
      schedule: { lastVerified: '2000-01-01', sources: ['https://example.org/faq'] },
    });
    expect(values.sort()).toEqual(['2000-01-04', 'https://example.org/lookup']);
  });

  it('still collects a source link to a portal item made for this election', () => {
    const app = `https://example.org/apps/nearby/index.html?appid=${'0a'.repeat(16)}`;
    expect(electionValues({ schedule: { sources: [app] } })).toEqual([app]);
  });

  it('scans every file under a directory, whatever its extension', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'election-scan-'));
    try {
      await mkdir(path.join(dir, 'nested'));
      await writeFile(path.join(dir, '.hidden'), '');
      await writeFile(path.join(dir, 'nested', 'icon.svg'), '');
      const files = await sourceFiles(dir);
      expect(files.sort()).toEqual(
        [path.join(dir, '.hidden'), path.join(dir, 'nested', 'icon.svg')].sort(),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('appear only in the election config', async () => {
    const files = [...(await sourceFiles(path.join(ROOT, 'src'))), path.join(ROOT, 'index.html')];
    const values = electionValues();
    const found = [];
    for (const file of files.filter((f) => f !== CONFIG)) {
      const text = await readFile(file, 'utf8');
      for (const value of values) {
        if (text.includes(value)) found.push(`${path.relative(ROOT, file)}: ${value}`);
      }
    }
    expect(found).toEqual([]);
  });

  // A topic's lastmod is its lastVerified date, which is not the election's
  // (see electionValues), so it is left out of the check.
  it('appear in neither the generated robots.txt nor the sitemap', async () => {
    const sitemap = sitemapXml(await readSitemapTopics(ROOT)).replace(
      /<lastmod>[^<]*<\/lastmod>/g,
      '',
    );
    const files = {
      'robots.txt': robotsTxt({ preview: false }),
      'robots.txt (preview)': robotsTxt({ preview: true }),
      'sitemap.xml': sitemap,
    };
    const found = Object.entries(files).flatMap(([name, text]) =>
      electionValues()
        .filter((value) => text.includes(value))
        .map((value) => `${name}: ${value}`),
    );
    expect(found).toEqual([]);
  });
});
