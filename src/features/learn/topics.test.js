import { getTopic, getTopics, indexTopics, topicLookups } from './topics.js';

const topic = (locale, id, title) => ({ locale, id, title, sources: [], blocks: [] });

describe('topic lookups', () => {
  const lookups = topicLookups(
    indexTopics({
      a: topic('en', 'voter-id', 'What ID to bring'),
      b: topic('en', 'absentee', 'Absentee voting'),
      c: topic('es', 'voter-id', 'Que identificacion llevar'),
    }),
  );

  it('lists English topics by title', () => {
    expect(lookups.getTopics().map((t) => t.id)).toEqual(['absentee', 'voter-id']);
  });

  it('uses a translation when there is one and English otherwise (#19)', () => {
    expect(lookups.getTopics('es').map((t) => [t.id, t.locale])).toEqual([
      ['absentee', 'en'],
      ['voter-id', 'es'],
    ]);
    expect(lookups.getTopic('voter-id', 'es').title).toBe('Que identificacion llevar');
    expect(lookups.getTopic('absentee', 'es').locale).toBe('en');
  });

  it('works when the functions are used on their own, as named imports are', () => {
    const { getTopics: list, getTopic: one } = lookups;
    expect(list('es').map((t) => t.id)).toEqual(['absentee', 'voter-id']);
    expect(one('absentee').id).toBe('absentee');
  });

  it('returns null for an unknown topic', () => {
    expect(lookups.getTopic('nope')).toBeNull();
    expect(lookups.getTopic('nope', 'es')).toBeNull();
  });
});

describe('the browser bundle', () => {
  // The topic files reach the app as data: the YAML and Markdown parsers run
  // only in the build. Fails when app code (not tests, not the build-time
  // content/ folder) imports them.
  it('never imports the build-time parsers', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const src = path.resolve(import.meta.dirname, '../..');
    const entries = await readdir(src, { withFileTypes: true, recursive: true });
    const offenders = [];
    for (const entry of entries) {
      const file = path.join(entry.parentPath, entry.name);
      if (!entry.isFile() || !/\.(js|jsx)$/.test(entry.name)) continue;
      if (/\.test\.jsx?$/.test(entry.name) || file.includes(`${path.sep}test${path.sep}`)) continue;
      if (file.startsWith(path.join(src, 'features/learn/content') + path.sep)) continue;
      const text = await readFile(file, 'utf8');
      if (/from\s+'(?:yaml|[^']*content\/(?:topic|markdown|vitePlugin)\.js)'/.test(text)) {
        offenders.push(path.relative(src, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the topics in content/', () => {
  // Every file under content/*/learn has passed the plugin's checks by now, or
  // importing topics.js would have failed.
  it('loads them, each under its own locale', () => {
    for (const t of getTopics()) {
      expect(getTopic(t.id, t.locale)).toBe(t);
      expect(t.sources.length).toBeGreaterThan(0);
    }
  });
});
