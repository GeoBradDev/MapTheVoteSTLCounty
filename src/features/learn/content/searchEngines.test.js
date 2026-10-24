// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import viteConfig from '../../../../vite.config.js';
import { siteUrl } from '../../../config/site.js';
import { DEFAULT_LOCALE } from '../topics.js';
import {
  isPreviewBuild,
  readSitemapTopics,
  robotsTxt,
  SITEMAP_LOCALE,
  sitemapXml,
} from './searchEngines.js';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const NOINDEX = '<meta name="robots" content="noindex">';

function parseXml(xml) {
  const { DOMParser } = new JSDOM('').window;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

// [loc, lastmod or null] for every <url>.
function entries(xml) {
  const doc = parseXml(xml);
  return [...doc.getElementsByTagNameNS(SITEMAP_NS, 'url')].map((url) => [
    url.getElementsByTagNameNS(SITEMAP_NS, 'loc')[0]?.textContent,
    url.getElementsByTagNameNS(SITEMAP_NS, 'lastmod')[0]?.textContent ?? null,
  ]);
}

async function topicIds() {
  const files = await readdir(path.join(ROOT, 'content/en/learn'));
  return files.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
}

describe('robotsTxt', () => {
  it('lets every crawler in and points to the sitemap in production', () => {
    expect(robotsTxt({ preview: false })).toBe(
      `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`,
    );
  });

  // Precinct pages are kept out of search with noindex (#98), not Disallow.
  it('does not disallow precinct pages', () => {
    expect(robotsTxt({ preview: false })).not.toMatch(/Disallow/);
  });

  it('keeps every crawler out of a preview, with no sitemap', () => {
    expect(robotsTxt({ preview: true })).toBe('User-agent: *\nDisallow: /\n');
  });
});

describe('sitemapXml', () => {
  const topics = [
    { id: 'voter-id', lastVerified: '2000-01-02' },
    { id: 'absentee', lastVerified: '2000-01-03' },
  ];

  it('is a urlset in the sitemap namespace', () => {
    const doc = parseXml(sitemapXml(topics));
    expect(doc.documentElement.localName).toBe('urlset');
    expect(doc.documentElement.namespaceURI).toBe(SITEMAP_NS);
    expect(sitemapXml(topics)).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  });

  it('lists the routes, then each topic with its lastVerified date as lastmod', () => {
    expect(entries(sitemapXml(topics))).toEqual([
      [`${siteUrl}/`, null],
      [`${siteUrl}/learn`, null],
      [`${siteUrl}/learn/absentee`, '2000-01-03'],
      [`${siteUrl}/learn/voter-id`, '2000-01-02'],
      [`${siteUrl}/privacy`, null],
    ]);
  });

  it('never lists a precinct page', () => {
    expect(sitemapXml(topics)).not.toContain('/p/');
  });
});

describe('readSitemapTopics', () => {
  it('reads the locale that holds every topic', () => {
    expect(SITEMAP_LOCALE).toBe(DEFAULT_LOCALE);
  });

  it('reads every English topic file under content/', async () => {
    const topics = await readSitemapTopics(ROOT);
    expect(topics.map((t) => t.id).sort()).toEqual((await topicIds()).sort());
    for (const topic of topics) expect(topic.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('finds no topics when the content folder is missing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'search-engines-empty-'));
    try {
      expect(await readSitemapTopics(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('searchEngines plugin', () => {
  it('is registered in the app build', () => {
    expect(viteConfig.plugins.flat().map((p) => p?.name)).toContain('mapthevote-search-engines');
  });

  // Render sets IS_PULL_REQUEST to the string "true" in a pull request preview.
  it('treats only a Render pull request preview build as a preview', () => {
    expect(isPreviewBuild({ IS_PULL_REQUEST: 'true' })).toBe(true);
    expect(isPreviewBuild({ IS_PULL_REQUEST: 'false' })).toBe(false);
    expect(isPreviewBuild({})).toBe(false);
  });
});

describe.each([
  ['production', false],
  ['preview', true],
])('a real %s build', (_, preview) => {
  let outDir;
  const before = process.env.IS_PULL_REQUEST;

  // The app's own config, with the environment Render gives each kind of build.
  beforeAll(async () => {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'search-engines-build-'));
    if (preview) process.env.IS_PULL_REQUEST = 'true';
    else delete process.env.IS_PULL_REQUEST;
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.js'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  }, 60_000);

  afterAll(async () => {
    if (before === undefined) delete process.env.IS_PULL_REQUEST;
    else process.env.IS_PULL_REQUEST = before;
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  const exists = (file) =>
    stat(path.join(outDir, file)).then(
      () => true,
      () => false,
    );

  it('writes the matching robots.txt', async () => {
    expect(await readFile(path.join(outDir, 'robots.txt'), 'utf8')).toBe(robotsTxt({ preview }));
  });

  it(preview ? 'emits no sitemap' : 'emits the sitemap of every route and topic', async () => {
    if (preview) {
      expect(await exists('sitemap.xml')).toBe(false);
      return;
    }
    const locs = entries(await readFile(path.join(outDir, 'sitemap.xml'), 'utf8')).map(
      ([loc]) => loc,
    );
    const expected = ['/', '/learn', ...(await topicIds()).map((id) => `/learn/${id}`), '/privacy'];
    expect(locs.sort()).toEqual(expected.map((p) => `${siteUrl}${p}`).sort());
  });

  // index.html is the pre-rendered home page and shell.html the shell every
  // other path gets (#99); a pre-rendered topic is built the same way.
  it.each(['index.html', 'shell.html', 'learn/voter-id/index.html'])(
    preview ? 'marks %s noindex' : 'leaves %s indexable',
    async (file) => {
      const html = await readFile(path.join(outDir, file), 'utf8');
      const metas = html.match(/<meta name="robots"[^>]*>/g) ?? [];
      expect(metas).toEqual(preview ? [NOINDEX] : []);
    },
  );
});
