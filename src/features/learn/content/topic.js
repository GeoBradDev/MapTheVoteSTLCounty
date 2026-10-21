// Reads and checks one voter education topic (#21): a Markdown file at
// content/<locale>/learn/<id>.md with YAML front matter. It runs at build time
// only, from the Vite plugin (vitePlugin.js), and from the link checker
// (scripts/check-content-links.mjs). A topic that fails any check fails the
// build, with every problem listed, so a voter never sees an unsourced or stale
// claim.
//
// Front matter:
//   id: voter-id                  # must match the file name
//   title: What ID to bring
//   election: YYYY-MM-DD          # must be the config's electionDate
//   lastVerified: YYYY-MM-DD      # at most 60 days before Election Day
//   sources:                      # at least one; official https URLs only
//     - id: sos-id                # cited in the body as [^sos-id]
//       label: Missouri Secretary of State, Voter ID
//       url: https://www.sos.mo.gov/...

import { parse as parseYaml } from 'yaml';
import { ID_PATTERN, parseMarkdown } from './markdown.js';
import { isOfficialUrl } from './officialSources.js';

/** How old a topic's last verification may be on Election Day, in days. */
export const MAX_VERIFIED_AGE_DAYS = 60;

const TOPIC_PATH = /(?:^|\/)(content\/([^/]+)\/learn\/([^/]+)\.md)$/;
const LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOPIC_KEYS = ['id', 'title', 'election', 'lastVerified', 'sources'];
const SOURCE_KEYS = ['id', 'label', 'url'];

/**
 * @typedef {{ id: string, label: string, url: string }} TopicSource
 * @typedef {object} Topic
 * @property {string} id File name without `.md`; the URL slug.
 * @property {string} locale First path segment under content/, such as `en`.
 * @property {string} title
 * @property {string} election The Election Day this text was checked for.
 * @property {string} lastVerified YYYY-MM-DD.
 * @property {TopicSource[]} sources In citation number order (first is [1]).
 * @property {import('./markdown.js').BlockNode[]} blocks The body.
 */

function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/**
 * Adds whole days to a YYYY-MM-DD date, as calendar days in UTC.
 * @param {string} isoDate
 * @param {number} days
 * @returns {string}
 */
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Splits a topic file into front matter data and Markdown, with no checks
 * beyond what is needed to read it. The link checker uses this directly, so it
 * still runs after an election, when the date checks would fail.
 * @param {string} text The whole file.
 * @returns {{ data: Record<string, unknown> | null, sources: TopicSource[],
 *   links: string[], markdown: ReturnType<typeof parseMarkdown> | null,
 *   errors: string[] }}
 */
export function readTopicFile(text) {
  const errors = [];
  const normalized = text.replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) {
    errors.push('the file must start with a --- front matter block, closed by another ---');
    return { data: null, sources: [], links: [], markdown: null, errors };
  }

  let data = null;
  try {
    data = parseYaml(match[1]);
  } catch (error) {
    errors.push(`front matter is not valid YAML: ${error.message.split('\n')[0]}`);
  }
  if (data !== null && (typeof data !== 'object' || Array.isArray(data))) {
    errors.push('front matter must be a set of key: value lines');
    data = null;
  }

  const bodyFirstLine = match[0].split('\n').length - (match[0].endsWith('\n') ? 1 : 0) + 1;
  const markdown = parseMarkdown(normalized.slice(match[0].length), bodyFirstLine);
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  return { data, sources, links: markdown.links, markdown, errors };
}

function checkSources(sources, errors) {
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push('sources: list at least one source (id, label, url)');
    return [];
  }
  const seen = new Set();
  return sources.map((source, index) => {
    const where = `sources[${index}]`;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push(`${where}: must have id, label and url`);
      return null;
    }
    for (const key of Object.keys(source)) {
      if (!SOURCE_KEYS.includes(key)) errors.push(`${where}: unknown key "${key}"`);
    }
    const { id, label, url } = source;
    if (!isNonEmptyString(id)) errors.push(`${where}.id: missing`);
    else if (!ID_PATTERN.test(id)) errors.push(`${where}.id: "${id}" must be like sos-voter-id`);
    else if (seen.has(id)) errors.push(`${where}.id: "${id}" is used twice`);
    else seen.add(id);
    if (!isNonEmptyString(label)) errors.push(`${where}.label: missing`);
    if (!isNonEmptyString(url)) errors.push(`${where}.url: missing`);
    else if (!isOfficialUrl(url)) {
      errors.push(`${where}.url: ${url} is not an official https source (see officialSources.js)`);
    }
    return { id, label: typeof label === 'string' ? label.trim() : label, url };
  });
}

function checkDates(data, electionDate, errors) {
  const { election, lastVerified } = data;
  if (election === undefined) errors.push('election: missing');
  else if (election !== electionDate) {
    errors.push(
      `election: ${election} is not the configured Election Day (${electionDate}); ` +
        're-verify the topic for this election and update both dates',
    );
  }

  if (lastVerified === undefined) errors.push('lastVerified: missing');
  else if (!isIsoDate(lastVerified)) {
    errors.push(`lastVerified: ${lastVerified} must be a real date as YYYY-MM-DD`);
  } else if (lastVerified > electionDate) {
    errors.push(`lastVerified: ${lastVerified} is after Election Day (${electionDate})`);
  } else if (lastVerified < addDays(electionDate, -MAX_VERIFIED_AGE_DAYS)) {
    errors.push(
      `lastVerified: ${lastVerified} is more than ${MAX_VERIFIED_AGE_DAYS} days before ` +
        `Election Day (${electionDate}); re-check every source and update it`,
    );
  }
}

/**
 * Reads and checks a topic file.
 * @param {string} text The whole file.
 * @param {{ file: string, electionDate: string }} options `file` is the file's
 *   path (absolute or relative); `electionDate` comes from the election config.
 * @returns {Topic}
 * @throws {Error} Listing every problem, prefixed with the file's
 *   content/... path.
 */
export function parseTopic(text, { file, electionDate }) {
  const errors = [];
  const pathMatch = TOPIC_PATH.exec(file.replaceAll('\\', '/'));
  const display = pathMatch ? pathMatch[1] : file;
  const [, , locale, fileId] = pathMatch ?? [];
  if (!pathMatch) errors.push('a topic must live at content/<locale>/learn/<id>.md');
  else if (!LOCALE.test(locale)) errors.push(`"${locale}" is not a locale like en or es`);

  text.split(/\r\n?|\n/).forEach((line, index) => {
    if (line.includes('TODO')) errors.push(`line ${index + 1}: remove the TODO before publishing`);
  });

  const { data, markdown, errors: readErrors } = readTopicFile(text);
  errors.push(...readErrors);

  let sources = [];
  if (data) {
    for (const key of Object.keys(data)) {
      if (!TOPIC_KEYS.includes(key)) errors.push(`unknown front matter key "${key}"`);
    }
    if (!isNonEmptyString(data.id)) errors.push('id: missing');
    else if (fileId && data.id !== fileId) {
      errors.push(`id: "${data.id}" must match the file name "${fileId}"`);
    }
    if (!isNonEmptyString(data.title)) errors.push('title: missing');
    checkDates(data, electionDate, errors);
    sources = checkSources(data.sources, errors);
  }

  if (markdown) {
    errors.push(...markdown.errors);
    const known = new Set(sources.filter(Boolean).map((s) => s.id));
    for (const id of new Set(markdown.citations)) {
      if (!known.has(id)) errors.push(`[^${id}] cites a source that is not in sources`);
    }
    for (const href of markdown.links) {
      const sitePath = href.startsWith('/') && !href.startsWith('//');
      if (!sitePath && !isOfficialUrl(href)) {
        errors.push(`link ${href} is not an official https source or a path on this site`);
      }
    }
  }

  if (errors.length) {
    const count = `${errors.length} problem${errors.length === 1 ? '' : 's'}`;
    throw new Error(`${display} has ${count}:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return {
    id: data.id,
    locale,
    title: data.title.trim(),
    election: data.election,
    lastVerified: data.lastVerified,
    sources,
    blocks: markdown.blocks,
  };
}
