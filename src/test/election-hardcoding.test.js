// The next election should be a config change, not a code change. Fails when a
// layer, service, date, URL, field or filter from src/config/election.js is
// written anywhere else in the app source. content/ is allowed to hold them.
// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import election from '../config/election.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CONFIG = path.join(ROOT, 'src/config/election.js');

// Source links mostly cite the county site and statutes, which other pages may
// link too, and a verification date is not the election's. Neither is
// collected, except a source that is a portal item or app made for this
// election, recognizable by its 32 hex character ID.
const PORTAL_ITEM_ID = /[0-9a-f]{32}/;

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
});
