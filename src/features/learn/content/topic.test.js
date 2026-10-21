// Fixture topics are built in memory from the config's election date: files
// under src/ may not repeat election dates (election-hardcoding.test.js).
import election from '../../../config/election.js';
import { isOfficialUrl } from './officialSources.js';
import { addDays, parseTopic, readTopicFile } from './topic.js';

const ELECTION = election.electionDate;
const FILE = '/repo/content/en/learn/voter-id.md';

function topicText({ front = {}, body = 'Bring an ID.[^sos-id]', omit = [], extra = '' } = {}) {
  const fields = {
    id: 'voter-id',
    title: 'What ID to bring',
    election: ELECTION,
    lastVerified: addDays(ELECTION, -10),
    ...front,
  };
  const lines = Object.entries(fields)
    .filter(([key]) => !omit.includes(key))
    .map(([key, value]) => `${key}: ${value}`);
  if (!omit.includes('sources')) {
    lines.push(
      'sources:',
      '  - id: sos-id',
      '    label: Missouri Secretary of State, Voter ID',
      '    url: https://www.sos.mo.gov/elections/goVoteMissouri/howtovote',
    );
  }
  return `---\n${lines.join('\n')}\n${extra}---\n\n${body}\n`;
}

const parse = (text, file = FILE) => parseTopic(text, { file, electionDate: ELECTION });

function problems(text, file = FILE) {
  try {
    parse(text, file);
  } catch (error) {
    return error.message;
  }
  throw new Error('expected the topic to be rejected');
}

describe('parseTopic', () => {
  it('turns a valid topic into plain data for the page', () => {
    const topic = parse(topicText());
    expect(topic).toEqual({
      id: 'voter-id',
      locale: 'en',
      title: 'What ID to bring',
      election: ELECTION,
      lastVerified: addDays(ELECTION, -10),
      sources: [
        {
          id: 'sos-id',
          label: 'Missouri Secretary of State, Voter ID',
          url: 'https://www.sos.mo.gov/elections/goVoteMissouri/howtovote',
        },
      ],
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Bring an ID.' },
            { type: 'cite', source: 'sos-id' },
          ],
        },
      ],
    });
    // Plain JSON: it is inlined into the bundle as a module.
    expect(JSON.parse(JSON.stringify(topic))).toEqual(topic);
  });

  it('takes the locale from the path, for a Spanish version later (#19)', () => {
    const file = '/repo/content/es/learn/voter-id.md';
    expect(parse(topicText({ front: { title: 'Que identificacion llevar' } }), file).locale).toBe(
      'es',
    );
  });

  it('fails a topic with no sources', () => {
    expect(problems(topicText({ omit: ['sources'], body: 'Bring an ID.' }))).toMatch(
      /sources: list at least one source/,
    );
  });

  it('fails a topic with an empty source list', () => {
    expect(problems(topicText({ omit: ['sources'], extra: 'sources: []\n', body: 'Hi.' }))).toMatch(
      /sources: list at least one source/,
    );
  });

  it('fails a topic with no lastVerified', () => {
    expect(problems(topicText({ omit: ['lastVerified'] }))).toMatch(/lastVerified: missing/);
  });

  it('fails a lastVerified more than 60 days before Election Day', () => {
    const text = topicText({ front: { lastVerified: addDays(ELECTION, -61) } });
    expect(problems(text)).toMatch(/lastVerified: .* more than 60 days before/);
  });

  it('accepts a lastVerified exactly 60 days before Election Day', () => {
    expect(() =>
      parse(topicText({ front: { lastVerified: addDays(ELECTION, -60) } })),
    ).not.toThrow();
  });

  it('fails a lastVerified after Election Day', () => {
    const text = topicText({ front: { lastVerified: addDays(ELECTION, 1) } });
    expect(problems(text)).toMatch(/lastVerified: .* after Election Day/);
  });

  it('fails a lastVerified that is not a real date', () => {
    expect(problems(topicText({ front: { lastVerified: '2026-02-30' } }))).toMatch(
      /lastVerified: .*YYYY-MM-DD/,
    );
  });

  it('fails a topic written for another election', () => {
    expect(problems(topicText({ front: { election: addDays(ELECTION, -365) } }))).toMatch(
      /election: .* is not the configured Election Day/,
    );
  });

  it('fails a TODO in the body or the front matter', () => {
    expect(problems(topicText({ body: 'Bring an ID.[^sos-id] TODO: hours' }))).toMatch(/TODO/);
    expect(problems(topicText({ front: { title: 'TODO title' } }))).toMatch(/TODO/);
  });

  it('fails a citation of a source the topic does not list', () => {
    expect(problems(topicText({ body: 'Bring an ID.[^sos-photo]' }))).toMatch(
      /\[\^sos-photo\] cites a source that is not in sources/,
    );
  });

  it('fails an id that does not match the file name', () => {
    expect(problems(topicText({ front: { id: 'photo-id' } }))).toMatch(
      /id: "photo-id" must match the file name "voter-id"/,
    );
  });

  it('fails unknown front matter keys, so a typo cannot drop a field', () => {
    expect(problems(topicText({ extra: 'lastVerifed: 2026-01-01\n' }))).toMatch(
      /unknown front matter key "lastVerifed"/,
    );
  });

  it('fails a source link that is not an official https URL', () => {
    const text = topicText().replace(
      'https://www.sos.mo.gov/elections/goVoteMissouri/howtovote',
      'https://example.com/voter-id',
    );
    expect(problems(text)).toMatch(/sources\[0\]\.url: .* is not an official https source/);
  });

  it('fails an inline link that is neither official nor on this site', () => {
    expect(
      problems(topicText({ body: 'See [a blog](https://blog.example.com/).[^sos-id]' })),
    ).toMatch(/link .* is not an official https source or a path on this site/);
  });

  it.each(['/\\evil.com', '/\\/evil.com', '//evil.com', '/a\\b'])(
    'fails a site path a browser would send to another host: %s',
    (href) => {
      expect(problems(topicText({ body: `See [x](${href}).[^sos-id]` }))).toMatch(
        /is not an official https source or a path on this site/,
      );
    },
  );

  it('fails an id that is not a lowercase slug', () => {
    const file = '/repo/content/en/learn/Voter ID.md';
    expect(problems(topicText({ front: { id: 'Voter ID' } }), file)).toMatch(
      /id: "Voter ID" must be lowercase words joined by hyphens/,
    );
  });

  it('fails text direction control characters in the title or a source label', () => {
    expect(problems(topicText({ front: { title: '"What \\u202Eto bring"' } }))).toMatch(
      /title: .*direction control/,
    );
  });

  it('reads a file that starts with a byte order mark', () => {
    expect(() => parse(`\uFEFF${topicText()}`)).not.toThrow();
  });

  it('does not blame valid citations when the front matter is not valid YAML', () => {
    const message = problems(topicText({ extra: 'title: [unclosed\n' }));
    expect(message).toMatch(/front matter is not valid YAML/);
    expect(message).not.toMatch(/cites a source/);
  });

  it('allows an inline link to a path on this site', () => {
    expect(() =>
      parse(topicText({ body: 'Find [your polling place](/).[^sos-id]' })),
    ).not.toThrow();
  });

  it('fails duplicate source ids and sources missing a label or url', () => {
    const extra = [
      '  - id: sos-id',
      '    label: Again',
      '    url: https://www.sos.mo.gov/',
      '  - id: no-label',
      '    url: https://www.sos.mo.gov/',
      '',
    ].join('\n');
    const text = topicText().replace('---\n\nBring', `${extra}---\n\nBring`);
    const message = problems(text);
    expect(message).toMatch(/sources\[1\]\.id: "sos-id" is used twice/);
    expect(message).toMatch(/sources\[2\]\.label: missing/);
  });

  it('fails Markdown outside the supported subset, with the file line number', () => {
    const text = topicText({ body: 'Fine.[^sos-id]\n\n<b>bold</b>' });
    const line = text.split('\n').findIndex((l) => l.startsWith('<b>')) + 1;
    expect(problems(text)).toMatch(new RegExp(`line ${line}: raw HTML`));
  });

  it('fails a file with no front matter', () => {
    expect(problems('Just text.')).toMatch(/must start with a --- front matter block/);
  });

  it('fails a file not at content/<locale>/learn/<id>.md', () => {
    expect(problems(topicText(), '/repo/content/learn/voter-id.md')).toMatch(
      /content\/<locale>\/learn\/<id>\.md/,
    );
  });

  it('names the file and lists every problem at once', () => {
    const message = problems(topicText({ omit: ['sources', 'lastVerified'], body: 'TODO' }));
    expect(message).toMatch(/^content\/en\/learn\/voter-id\.md has \d+ problems:/);
    expect(message).toMatch(/sources: list at least one source/);
    expect(message).toMatch(/lastVerified: missing/);
    expect(message).toMatch(/TODO/);
  });
});

describe('readTopicFile', () => {
  it('reads the links and front matter without the date checks, for the link checker', () => {
    const text = topicText({
      front: { lastVerified: addDays(ELECTION, -400) },
      body: 'See [the board](https://www.stlouiscovotes.info/faq/).[^sos-id]',
    });
    const { sources, links } = readTopicFile(text);
    expect(sources.map((s) => s.url)).toEqual([
      'https://www.sos.mo.gov/elections/goVoteMissouri/howtovote',
    ]);
    expect(links).toEqual(['https://www.stlouiscovotes.info/faq/']);
  });
});

describe('isOfficialUrl', () => {
  it.each([
    'https://www.sos.mo.gov/elections',
    'https://revisor.mo.gov/main/OneSection.aspx?section=115.407',
    'https://www.eac.gov/voters',
    // Not the bare county site URL: src/ may not repeat config URLs.
    'https://www.stlouiscovotes.info/faq/',
    'https://stlouiscovotes.maps.arcgis.com/apps/instant/lookup/index.html',
  ])('accepts %s', (url) => {
    expect(isOfficialUrl(url)).toBe(true);
  });

  it.each([
    'http://www.sos.mo.gov/elections',
    'https://example.com/',
    'https://sos.mo.gov.example.com/',
    'https://evil-stlouiscovotes.info/',
    'https:www.sos.mo.gov/elections',
    'https://www.sos.mo.gov/\tpath',
    'https://evil.com\t.gov/',
    'https://www.sos.mo.gov/a b',
    'https:\\\\www.sos.mo.gov\\elections',
    'https://other.maps.arcgis.com/',
    'https://user@www.sos.mo.gov/',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isOfficialUrl(url)).toBe(false);
  });
});
