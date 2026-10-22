// Vite plugin that tells search engines what to crawl (#97). Every build writes
// robots.txt; a production build also writes sitemap.xml, generated from the
// routes and every topic file under content/, so a new topic cannot be left
// out. A Render pull request preview build (IS_PULL_REQUEST=true) instead
// keeps every crawler out: a disallow-all robots.txt, a noindex meta tag in
// index.html and no sitemap. A local build and CI build as production.
//
// Precinct pages (/p/<code>) are never in the sitemap. Whether they carry
// noindex is decided in #98; robots.txt does not disallow them, because a
// disallowed URL can still be indexed from links, and a crawler cannot see a
// noindex on a page it may not fetch.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { siteUrl } from '../../../config/site.js';
import { parseTopic } from './topic.js';
import { topicFiles } from './vitePlugin.js';
import election from '../../../config/election.js';

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

/** DEFAULT_LOCALE in ../topics.js, which holds every topic.
 * Not imported: that module loads the topics with import.meta.glob, which only
 * Vite's app build understands. A test keeps the two the same. */
export const SITEMAP_LOCALE = 'en';

/** Whether this build is a Render pull request preview. Render sets the string "true". */
export function isPreviewBuild(env = process.env) {
  return env.IS_PULL_REQUEST === 'true';
}

/** The robots.txt for a production build, or a preview's disallow-all one. */
export function robotsTxt({ preview }) {
  if (preview) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

/**
 * The sitemap: the home page, the learn index, each topic and the privacy
 * notice, as absolute production URLs. A topic's lastmod is its lastVerified
 * date; the other pages have no date worth stating, so they get none.
 * @param {{ id: string, lastVerified: string }[]} topics
 */
export function sitemapXml(topics) {
  const byId = [...topics].sort((a, b) => a.id.localeCompare(b.id));
  const pages = [
    { path: '/' },
    { path: '/learn' },
    ...byId.map((t) => ({ path: `/learn/${t.id}`, lastmod: t.lastVerified })),
    { path: '/privacy' },
  ];
  const urls = pages.map(({ path: page, lastmod }) =>
    [
      '  <url>',
      `    <loc>${siteUrl}${page}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      '  </url>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}">`,
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Every topic in the default locale, which holds the full set; the learn
 * URLs do not name a locale. Each file is parsed and checked as the learn
 * content plugin does, so a bad topic fails here too.
 * @param {string} root The project root.
 */
export async function readSitemapTopics(root, { electionDate = election.electionDate } = {}) {
  const dir = path.join(root, 'content', SITEMAP_LOCALE, 'learn');
  const files = (await topicFiles(root)).filter((file) => path.dirname(file) === dir);
  return Promise.all(
    files.map(async (file) => parseTopic(await readFile(file, 'utf8'), { file, electionDate })),
  );
}

/** @returns {import('vite').Plugin} */
export default function searchEngines() {
  let root = '.';
  let preview = false;
  return {
    name: 'mapthevote-search-engines',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      // Read when the build starts, not when the config module loads.
      preview = isPreviewBuild();
    },
    transformIndexHtml() {
      if (!preview) return [];
      return [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' }];
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt({ preview }) });
      if (preview) return;
      const topics = await readSitemapTopics(root);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(topics) });
    },
  };
}
