import {
  getTopic,
  getTopics,
  indexBodies,
  indexTopics,
  loadAllTopics,
  loadedTopic,
  loadTopic,
  topicLookups,
} from './topics.js';

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

// The first load holds each topic's summary; its body loads with its page (#147).
describe('topic bodies', () => {
  const summary = (locale, id) => ({ locale, id, title: id, group: 'get-help', intro: null });
  const full = (locale, id) => ({ ...summary(locale, id), sources: [], blocks: [] });

  function setup(loaders) {
    return topicLookups(indexTopics({ a: summary('en', 'voter-id') }), loaders);
  }

  it('keys the body loaders by locale and id from their paths', () => {
    const load = () => {};
    expect(indexBodies({ '/content/es/learn/voter-id.md': load })).toEqual(
      new Map([['es/voter-id', load]]),
    );
  });

  it('has no body until it is loaded, then the whole topic', async () => {
    const lookups = setup(new Map([['en/voter-id', async () => full('en', 'voter-id')]]));
    const topic = lookups.getTopic('voter-id');
    expect(lookups.loadedTopic(topic)).toBeNull();
    const loaded = await lookups.loadTopic(topic);
    expect(loaded.blocks).toEqual([]);
    expect(lookups.loadedTopic(topic)).toBe(loaded);
  });

  it('loads a body once, however many pages ask', async () => {
    const load = vi.fn(async () => full('en', 'voter-id'));
    const lookups = setup(new Map([['en/voter-id', load]]));
    const topic = lookups.getTopic('voter-id');
    await Promise.all([lookups.loadTopic(topic), lookups.loadTopic(topic)]);
    await lookups.loadTopic(topic);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed load', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(full('en', 'voter-id'));
    const lookups = setup(new Map([['en/voter-id', load]]));
    const topic = lookups.getTopic('voter-id');
    await expect(lookups.loadTopic(topic)).rejects.toThrow('offline');
    await expect(lookups.loadTopic(topic)).resolves.toMatchObject({ blocks: [] });
  });

  it('treats a topic that carries its body as loaded', async () => {
    const lookups = setup(new Map());
    const topic = full('en', 'voter-id');
    expect(lookups.loadedTopic(topic)).toBe(topic);
    await expect(lookups.loadTopic(topic)).resolves.toBe(topic);
  });

  it('loads every body for the build', async () => {
    const lookups = setup(new Map([['en/voter-id', async () => full('en', 'voter-id')]]));
    await lookups.loadAllTopics();
    expect(lookups.loadedTopic(lookups.getTopic('voter-id'))).not.toBeNull();
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
  it('loads them, each under its own locale, with no body in the summaries', async () => {
    await loadAllTopics();
    for (const t of getTopics()) {
      expect(getTopic(t.id, t.locale)).toBe(t);
      expect(t).not.toHaveProperty('blocks');
      expect(loadedTopic(t).sources.length).toBeGreaterThan(0);
      await expect(loadTopic(t)).resolves.toBe(loadedTopic(t));
    }
  });
});
