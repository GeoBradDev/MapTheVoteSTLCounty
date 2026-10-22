// The head tags of the public pages (#99): the home page, /learn, each topic
// and /privacy. The build writes them into each pre-rendered page (search
// engines and link preview bots read them without running JavaScript), and the
// app writes them again on every in-app navigation, so the head always
// matches the page.
//
// Every other page (a precinct, the not-found page) keeps the shell's head:
// index.html's title and description, no canonical and no Open Graph tags.
// What those pages carry is #98's to decide.
//
// Descriptions are each page's own text, never new claims. Nothing here may
// hold a query string, a hash, an address or coordinates (#20).

import { publicPaths } from './config/publicPages.js';
import { siteUrl } from './config/site.js';
import { copy as learnCopy } from './features/learn/learnCopy.js';
import { DEFAULT_LOCALE, getTopic, getTopics } from './features/learn/topics.js';
import { copy as privacyCopy } from './features/privacy/privacyCopy.js';
import { getLocale, t } from './i18n/index.js';

/** Search engines show about this many characters of a description. */
const DESCRIPTION_MAX = 155;

/**
 * The path a page is known by: no query string or hash, and no trailing
 * slash except on the home page (the host serves /learn/ the same as /learn).
 * @param {string} route
 */
export function normalizePath(route) {
  const pathOnly = route.split(/[?#]/)[0].replace(/\/+$/, '');
  return pathOnly === '' ? '/' : pathOnly;
}

/**
 * `text` with its whitespace collapsed, cut at a word boundary to at most 155
 * characters (ellipsis included) when longer.
 * @param {string} text
 */
export function describe(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= DESCRIPTION_MAX) return flat;
  const room = flat.slice(0, DESCRIPTION_MAX);
  const lastSpace = room.lastIndexOf(' ');
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room.slice(0, DESCRIPTION_MAX - 1);
  return `${cut.replace(/[\s,;:.]+$/, '')}…`;
}

function inlineText(nodes) {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (node.type === 'cite') return '';
      return inlineText(node.children ?? []);
    })
    .join('');
}

/**
 * A topic's description: its first paragraph as plain text, without citation
 * marks, cut like describe().
 * @param {import('./features/learn/content/topic.js').Topic} topic
 */
export function topicDescription(topic) {
  const first = topic.blocks.find((block) => block.type === 'paragraph');
  return describe(first ? inlineText(first.children) : topic.title);
}

/** The shell's head: the title and description index.html has. */
export function shellHead() {
  return { title: t('site.name'), description: t('site.description') };
}

/**
 * The head of a public page, or null for any other path (a precinct, an
 * unknown topic, the not-found page), which keeps the shell's head.
 * @param {string} route
 * @returns {{ title: string, description: string, canonical: string } | null}
 */
export function pageHead(route) {
  const page = normalizePath(route);
  const canonical = `${siteUrl}${page}`;
  if (page === '/') return { ...shellHead(), canonical };
  if (page === '/learn') {
    return {
      title: learnCopy.pageTitle(learnCopy.pageHeading),
      description: describe(learnCopy.intro),
      canonical,
    };
  }
  if (page === '/privacy') {
    return {
      title: t('site.pageTitle', { name: privacyCopy.heading }),
      description: describe(privacyCopy.intro),
      canonical,
    };
  }
  const topicId = page.match(/^\/learn\/([^/]+)$/)?.[1];
  const topic = topicId ? getTopic(topicId, getLocale()) : null;
  if (topic) {
    return {
      title: learnCopy.pageTitle(topic.title),
      description: topicDescription(topic),
      canonical,
    };
  }
  return null;
}

/**
 * Every path the build pre-renders: the sitemap's list of public pages (#97,
 * src/config/publicPages.js), with the topics from the default locale, which
 * holds every topic.
 */
export function prerenderPaths() {
  return publicPaths(getTopics(DEFAULT_LOCALE).map((topic) => topic.id));
}

/**
 * The tags a head needs besides its title: the description, and for a public
 * page its canonical and Open Graph tags.
 * @param {{ title: string, description: string, canonical?: string }} head
 * @returns {{ tag: 'meta' | 'link', attrs: Record<string, string> }[]}
 */
export function headTags(head) {
  const tags = [{ tag: 'meta', attrs: { name: 'description', content: head.description } }];
  if (!head.canonical) return tags;
  const og = (property, content) => ({ tag: 'meta', attrs: { property, content } });
  return [
    ...tags,
    { tag: 'link', attrs: { rel: 'canonical', href: head.canonical } },
    og('og:type', 'website'),
    og('og:site_name', t('site.name')),
    og('og:title', head.title),
    og('og:description', head.description),
    og('og:url', head.canonical),
  ];
}

const MANAGED = 'meta[name="description"], link[rel="canonical"], meta[property^="og:"]';

/**
 * Replaces the description, canonical and Open Graph tags in `doc`'s head
 * with `head`'s, or with the shell's when `head` is null. The title is left to
 * the pages, which set it themselves.
 * @param {Document} doc
 * @param {{ title: string, description: string, canonical?: string } | null} head
 */
export function applyHead(doc, head) {
  for (const element of doc.head.querySelectorAll(MANAGED)) element.remove();
  for (const { tag, attrs } of headTags(head ?? shellHead())) {
    const element = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    doc.head.append(element);
  }
}
