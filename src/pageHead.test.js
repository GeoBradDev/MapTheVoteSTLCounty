// The head tags of the public pages (#99): what a crawler or a link preview
// reads from a pre-rendered page, and what the app writes on navigation.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { siteUrl } from './config/site.js';
// The build makes each topic's summary with topicSummary (#147).
import { topicSummary } from './features/learn/content/topic.js';
import { getTopic, getTopics } from './features/learn/topics.js';
import {
  applyHead,
  describe as describeText,
  headTags,
  normalizePath,
  SHARE_IMAGE,
  pageHead,
  prerenderPaths,
  shellHead,
  topicDescription,
} from './pageHead.js';

const ROOT = path.resolve(import.meta.dirname, '..');

describe('normalizePath', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/learn/', '/learn'],
    // wouter's routes take one trailing slash, not two: /learn// is not /learn.
    ['/learn//', '/learn//'],
    ['//', '//'],
    ['/learn?x=1#y', '/learn'],
    ['/learn/voter-id/', '/learn/voter-id'],
    ['/privacy#main', '/privacy'],
  ])('%s is %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('describe', () => {
  it('keeps text of 155 characters or fewer, with whitespace collapsed', () => {
    expect(describeText('  A short\n line.  ')).toBe('A short line.');
    const exact = 'a'.repeat(155);
    expect(describeText(exact)).toBe(exact);
  });

  it('cuts longer text at a word boundary and ends it with an ellipsis', () => {
    const text = `${'word '.repeat(40)}end`;
    const cut = describeText(text);
    expect(cut.length).toBeLessThanOrEqual(155);
    expect(cut.endsWith('word…')).toBe(true);
  });

  it('drops a trailing comma or other punctuation before the ellipsis', () => {
    const text = `${'x'.repeat(150)}, more words follow here`;
    expect(describeText(text)).toBe(`${'x'.repeat(150)}\u2026`);
  });
});

describe('topicDescription', () => {
  it('is the first paragraph as plain text, without citation marks', () => {
    const topic = {
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Bring a ' },
            { type: 'strong', children: [{ type: 'text', value: 'photo ID' }] },
            { type: 'text', value: '.' },
            { type: 'cite', source: 'rsmo' },
            { type: 'text', value: ' See the ' },
            {
              type: 'link',
              href: 'https://www.sos.mo.gov',
              children: [{ type: 'text', value: 'list' }],
            },
            { type: 'text', value: '.' },
          ],
        },
        { type: 'paragraph', children: [{ type: 'text', value: 'Second.' }] },
      ],
    };
    expect(topicDescription(topicSummary(topic))).toBe('Bring a photo ID. See the list.');
  });

  // A paragraph under a heading describes that section, not the page (owner
  // decision on #99): the "How to vote" intro stands in for it.
  const LEARN_INTRO =
    'Voting guides for St. Louis City and St. Louis County voters, checked against official sources. Each guide says where the two boards differ.';
  const text = (value) => [{ type: 'text', value }];

  it('is the learn intro when the topic starts with a heading', () => {
    const topic = {
      blocks: [
        { type: 'heading', level: 2, children: text('When you vote') },
        { type: 'paragraph', children: text('A later section.') },
      ],
    };
    expect(topicDescription(topicSummary(topic))).toBe(LEARN_INTRO);
  });

  it('takes a paragraph that follows a list, while still before the first heading', () => {
    const topic = {
      blocks: [
        { type: 'list', ordered: false, items: [text('One')] },
        { type: 'paragraph', children: text('Before any heading.') },
        { type: 'heading', level: 2, children: text('Later') },
      ],
    };
    expect(topicDescription(topicSummary(topic))).toBe('Before any heading.');
  });

  it('is the learn intro when the topic has no paragraph before a heading', () => {
    const topic = {
      blocks: [
        { type: 'list', ordered: false, items: [text('One')] },
        { type: 'heading', level: 2, children: text('Later') },
        { type: 'paragraph', children: text('Under the heading.') },
      ],
    };
    expect(topicDescription(topicSummary(topic))).toBe(LEARN_INTRO);
  });

  it('never describes your rights with a later, conditional section', () => {
    expect(topicDescription(getTopic('your-rights'))).toBe(LEARN_INTRO);
  });

  it('is the real voter ID topic text', () => {
    expect(topicDescription(getTopic('voter-id'))).toMatch(
      /^In Missouri, you must show a photo ID/,
    );
  });
});

describe('pageHead', () => {
  it('describes the home page with the site description and its canonical', () => {
    expect(pageHead('/')).toEqual({
      title: 'St. Louis Voter Guide',
      description: shellHead().description,
      canonical: `${siteUrl}/`,
    });
  });

  // #93: the description is for City and County voters alike.
  it('describes the site as a guide for St. Louis City and County voters', () => {
    expect(shellHead().description).toMatch(/St\. Louis City and County voters/);
  });

  it('gives /learn its title, its intro and its canonical, trailing slash or not', () => {
    const head = pageHead('/learn/');
    expect(head).toEqual({
      title: 'How to vote | St. Louis Voter Guide',
      description: expect.stringMatching(
        /^Voting guides for St\. Louis City and St\. Louis County voters/,
      ),
      canonical: `${siteUrl}/learn`,
    });
  });

  it('gives each topic its own title, description and canonical', () => {
    for (const topic of getTopics()) {
      const head = pageHead(`/learn/${topic.id}`);
      expect(head.title).toBe(`${topic.title} | St. Louis Voter Guide`);
      expect(head.description).toBe(topicDescription(topic));
      expect(head.description.length).toBeGreaterThan(20);
      expect(head.canonical).toBe(`${siteUrl}/learn/${topic.id}`);
    }
  });

  it('gives the privacy notice its title and the start of its intro', () => {
    const head = pageHead('/privacy');
    expect(head.title).toBe('Privacy | St. Louis Voter Guide');
    expect(head.description).toMatch(/^This site is an independent, nonpartisan guide\./);
    expect(head.description.length).toBeLessThanOrEqual(155);
    expect(head.canonical).toBe(`${siteUrl}/privacy`);
  });

  it.each([
    '/p/CC007',
    '/learn/no-such-topic',
    '/nope',
    '/index.html',
    '/learn/voter-id/x',
    '//',
    '/learn//',
    '/learn/voter-id//',
    '/privacy//',
  ])('has no entry for %s, which keeps the shell head', (route) => {
    expect(pageHead(route)).toBeNull();
  });
});

describe('shellHead', () => {
  // index.html is static (link previews read it before any script runs), so a
  // test keeps it and en.json saying the same thing.
  it('is the title and description index.html has', async () => {
    const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)[1];
    expect(shellHead()).toEqual({ title, description });
  });

  // A precinct link's preview comes from the shell (#98): the bots read it
  // without running the app, so its tags are written out in index.html.
  it('has the Open Graph and card tags of the shell head in index.html', async () => {
    const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tags = [...doc.head.querySelectorAll(MANAGED)].map((el) => ({
      tag: el.localName,
      attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
    }));
    expect(tags).toEqual(headTags(shellHead()));
  });
});

describe('prerenderPaths', () => {
  it('is the home page, /learn, every English topic and /privacy', () => {
    const topics = getTopics('en').map((t) => `/learn/${t.id}`);
    expect(topics.length).toBeGreaterThan(0);
    expect(prerenderPaths()).toEqual(['/', '/learn', ...topics.sort(), '/privacy']);
  });

  it('has a head for every path', () => {
    for (const route of prerenderPaths()) expect(pageHead(route)).not.toBeNull();
  });
});

const MANAGED =
  'meta[name="description"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"]';

const og = (property, content) => ({ tag: 'meta', attrs: { property, content } });
// One site-wide share image (owner decision on #98), on every head.
const IMAGE_TAGS = [
  og('og:image', `${siteUrl}/share-image.png`),
  og('og:image:width', '1200'),
  og('og:image:height', '630'),
  og('og:image:alt', 'St. Louis Voter Guide: Find where to vote'),
  { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
];

describe('headTags', () => {
  it('lists the description, canonical, Open Graph and card tags of a page', () => {
    const head = pageHead('/learn/voter-id');
    expect(headTags(head)).toEqual([
      { tag: 'meta', attrs: { name: 'description', content: head.description } },
      { tag: 'link', attrs: { rel: 'canonical', href: head.canonical } },
      og('og:type', 'website'),
      og('og:site_name', 'St. Louis Voter Guide'),
      og('og:title', head.title),
      og('og:description', head.description),
      og('og:url', head.canonical),
      ...IMAGE_TAGS,
    ]);
  });

  // The shell is served for many paths (a precinct, the wait times page, any
  // unknown path), so it names none of them: no canonical, no og:url.
  it('lists the site name, description and image for the shell, with no URL', () => {
    expect(headTags(shellHead())).toEqual([
      { tag: 'meta', attrs: { name: 'description', content: shellHead().description } },
      og('og:type', 'website'),
      og('og:site_name', 'St. Louis Voter Guide'),
      og('og:title', 'St. Louis Voter Guide'),
      og('og:description', shellHead().description),
      ...IMAGE_TAGS,
    ]);
  });

  it('points at the share image by its absolute production URL', () => {
    expect(SHARE_IMAGE).toEqual({
      url: 'https://mapthevotestl.com/share-image.png',
      width: 1200,
      height: 630,
    });
  });
});

describe('applyHead', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="robots" content="noindex"><meta name="description" content="old">';
  });

  const managed = () =>
    [...document.head.querySelectorAll(MANAGED)].map((el) => ({
      tag: el.localName,
      attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
    }));

  it('writes a page head and replaces the old description', () => {
    applyHead(document, pageHead('/privacy'));
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]').href).toBe(`${siteUrl}/privacy`);
    expect(document.head.querySelector('meta[property="og:url"]').content).toBe(
      `${siteUrl}/privacy`,
    );
  });

  it('puts the shell head back for a page with no entry', () => {
    applyHead(document, pageHead('/privacy'));
    applyHead(document, null);
    expect(managed()).toEqual(headTags(shellHead()));
  });

  it('writes each tag once, however often it runs', () => {
    applyHead(document, pageHead('/learn'));
    applyHead(document, pageHead('/privacy'));
    expect(managed()).toEqual(headTags(pageHead('/privacy')));
  });

  it('leaves tags it does not manage alone', () => {
    applyHead(document, pageHead('/learn'));
    applyHead(document, null);
    expect(document.head.querySelector('meta[name="robots"]').content).toBe('noindex');
  });
});
