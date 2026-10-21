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

  it('returns null for an unknown topic', () => {
    expect(lookups.getTopic('nope')).toBeNull();
    expect(lookups.getTopic('nope', 'es')).toBeNull();
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
