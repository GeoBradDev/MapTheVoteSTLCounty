// Checks that every source and link in the voter education topics
// (content/<locale>/learn/*.md, #21) and every page the election config links
// (src/config/election.js) still answers. Official pages move between
// elections, and a dead source link breaks the promise that every claim can be
// checked. Runs on a schedule in .github/workflows/data-health.yml, never on
// pull requests, so a slow or broken government site cannot block a merge.
//
// Usage: node scripts/check-content-links.mjs [--skipped <file>]
//   --skipped writes each skipped URL to <file>, one per line, for the workflow
//   to report.
// Prints one PASS, FAIL or SKIP line per URL and exits 1 when any URL fails. A
// bot challenge (a 403 page that only a browser gets past) is a SKIP: check
// those URLs by hand in a browser.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import election from '../src/config/election.js';
import { isOfficialUrl } from '../src/features/learn/content/officialSources.js';
import { readTopicFile } from '../src/features/learn/content/topic.js';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Identifies the checker to the sites it requests. */
export const USER_AGENT = 'MapTheVoteSTL content link check (+https://mapthevotestl.com)';

/**
 * Every topic file under `root`/content/<locale>/learn/, relative to `root`.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function topicFiles(root) {
  const contentDir = path.join(root, 'content');
  let locales;
  try {
    locales = await readdir(contentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const locale of locales.filter((e) => e.isDirectory())) {
    const learnDir = path.join(contentDir, locale.name, 'learn');
    let entries = [];
    try {
      entries = await readdir(learnDir, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(path.posix.join('content', locale.name, 'learn', entry.name));
      }
    }
  }
  return files.sort();
}

/**
 * The external URLs in the topics, each with the files that use it. Site paths
 * like /privacy are skipped: they are this app's own routes.
 * @param {string} root
 * @returns {Promise<{ links: { url: string, files: string[] }[], unreadable: { file: string, detail: string }[] }>}
 */
export async function collectLinks(root) {
  const byUrl = new Map();
  const unreadable = [];
  for (const file of await topicFiles(root)) {
    const { sources, links, errors } = readTopicFile(await readFile(path.join(root, file), 'utf8'));
    if (errors.length) unreadable.push({ file, detail: errors.join('; ') });
    const urls = [...sources.map((s) => s?.url), ...links].filter(
      (url) => typeof url === 'string' && /^https?:\/\//.test(url),
    );
    for (const url of urls) {
      if (!byUrl.has(url)) byUrl.set(url, new Set());
      byUrl.get(url).add(file);
    }
  }
  const links = [...byUrl].map(([url, files]) => ({ url, files: [...files].sort() }));
  return { links, unreadable };
}

/** How much of a page body the checker reads, at most. */
export const MAX_BODY_BYTES = 512 * 1024;

const CONFIG_FILE = 'src/config/election.js';

/**
 * The pages the election config links: every `sources` entry and every value
 * whose key ends in `Url` or `Source`, each with the config key that holds it.
 * `serviceRoot` and the layer paths are not pages; check-config.mjs checks
 * them.
 * @param {object} config An election config, like src/config/election.js.
 * @returns {{ url: string, files: string[] }[]}
 */
export function configLinks(config) {
  const byUrl = new Map();
  const add = (url, key) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
    if (!byUrl.has(url)) byUrl.set(url, []);
    const label = `${CONFIG_FILE} (${key})`;
    if (!byUrl.get(url).includes(label)) byUrl.get(url).push(label);
  };
  const walk = (value, prefix) => {
    if (value === null || typeof value !== 'object' || value instanceof RegExp) return;
    for (const [key, child] of Object.entries(value)) {
      const keyPath = prefix ? `${prefix}.${key}` : key;
      if (key === 'sources' && Array.isArray(child)) {
        for (const url of child) add(url, keyPath);
      } else if (/(Url|Source)$/.test(key)) {
        add(child, keyPath);
      } else {
        walk(child, keyPath);
      }
    }
  };
  walk(config, '');
  return [...byUrl].map(([url, files]) => ({ url, files }));
}

/**
 * Merges link lists, keeping each URL once with every file that uses it.
 * @param {...{ url: string, files: string[] }[]} lists
 */
export function mergeLinks(...lists) {
  const byUrl = new Map();
  for (const { url, files } of lists.flat()) {
    if (!byUrl.has(url)) byUrl.set(url, []);
    for (const file of files) if (!byUrl.get(url).includes(file)) byUrl.get(url).push(file);
  }
  return [...byUrl].map(([url, files]) => ({ url, files }));
}

/** Reads up to MAX_BODY_BYTES of a response body as text, then lets go of it. */
async function readCapped(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return new TextDecoder().decode(bytes);
}

/** The attributes of one HTML tag, names lower-cased. */
function tagAttributes(tag) {
  const attrs = {};
  const pattern = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  for (const m of tag.replace(/^<meta\b/i, '').matchAll(pattern)) {
    const name = m[1].toLowerCase();
    // As in HTML, the first of a repeated attribute counts.
    if (!Object.hasOwn(attrs, name)) attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * Where a page's `<meta http-equiv="refresh">` sends the browser, resolved
 * against `baseUrl`, or null when it has none or only reloads itself.
 * @param {string} html
 * @param {string} baseUrl The page's own URL.
 * @returns {string | null}
 */
export function metaRefreshTarget(html, baseUrl) {
  // A browser never acts on a tag in a comment or a script, nor, with
  // scripts on, in a noscript block.
  const live = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
  // A > inside a quoted attribute value does not end the tag.
  for (const [tag] of live.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = tagAttributes(tag);
    if ((attrs['http-equiv'] ?? '').trim().toLowerCase() !== 'refresh') continue;
    const content = (attrs.content ?? '').replaceAll('&amp;', '&');
    // The HTML rule: a delay, then ; or , or space, then an optional url=.
    // A refresh with no delay is ignored.
    const m = /^\s*[\d.]+\s*(?:[;,]\s*|\s+)(?:url\s*=\s*)?(.*)$/is.exec(content);
    let target = m?.[1].trim() ?? '';
    if (/^["']/.test(target)) {
      const end = target.indexOf(target[0], 1);
      target = target.slice(1, end === -1 ? undefined : end);
    }
    if (!target) continue;
    try {
      return new URL(target, baseUrl).href;
    } catch {
      continue;
    }
  }
  return null;
}

/** True when two URLs name the same page: the fragment does not count. */
function samePage(a, b) {
  const page = (u) => {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  };
  return page(a) === page(b);
}

/**
 * True when a 403 is a bot challenge that a browser would get past: a
 * `cf-mitigated: challenge` header, or a page that loads Cloudflare's
 * challenge platform.
 */
function isBotChallenge(res, body) {
  if ((res.headers.get('cf-mitigated') ?? '').toLowerCase() === 'challenge') return true;
  return /challenges\.cloudflare\.com|\/cdn-cgi\/challenge-platform\//i.test(body);
}

const isHtml = (res) =>
  /^(text\/html|application\/xhtml\+xml)\b/i.test(res.headers.get('content-type') ?? '');

async function requestOnce(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    // A lapsed domain or a moved page can redirect to a parked or unofficial
    // site that answers 200.
    if (res.redirected && !isOfficialUrl(res.url)) {
      await res.body?.cancel?.();
      return {
        ok: false,
        transient: false,
        detail: `redirected off the official hosts to ${res.url}`,
      };
    }
    if (res.status === 403) {
      const body = await readCapped(res);
      if (isBotChallenge(res, body)) {
        return {
          ok: false,
          skip: true,
          transient: false,
          detail: 'bot challenge, check by hand in a browser (HTTP 403)',
        };
      }
      return { ok: false, transient: false, detail: 'HTTP 403' };
    }
    if (!res.ok) {
      await res.body?.cancel?.();
      return {
        ok: false,
        transient: res.status === 429 || res.status >= 500,
        detail: `HTTP ${res.status}`,
      };
    }
    // A page can send the browser elsewhere with a meta refresh and still
    // answer 200 with no HTTP redirect, as the board's retired site does (#74).
    if (isHtml(res)) {
      const pageUrl = res.url || url;
      const target = metaRefreshTarget(await readCapped(res), pageUrl);
      if (target && !samePage(target, pageUrl)) {
        return { ok: false, transient: false, detail: `meta refresh to ${target}` };
      }
    } else {
      await res.body?.cancel?.();
    }
    return { ok: true, detail: `HTTP ${res.status}` };
  } catch (error) {
    const why = controller.signal.aborted ? `no answer in ${timeoutMs} ms` : error.message;
    return { ok: false, transient: true, detail: `request failed: ${why}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requests each URL, retrying network errors, 429 and 5xx answers. A bot
 * challenge is a skip: neither a pass nor a failure.
 * @param {{ url: string, files: string[] }[]} links
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs] How long one request may take.
 * @param {number} [options.attempts] Tries per URL.
 * @param {number} [options.retryDelayMs] The wait before a retry, times the attempt.
 * @param {(result: object) => unknown} [options.onResult] Called with each result as soon
 *   as it is known, so a run cut off by a timeout has still reported what it found.
 * @returns {Promise<{ url: string, files: string[], status: 'pass' | 'fail' | 'skip', detail: string }[]>}
 */
export async function checkLinks(
  links,
  {
    fetch: fetchImpl = fetch,
    timeoutMs = 15000,
    attempts = 3,
    retryDelayMs = 2000,
    onResult = () => {},
  } = {},
) {
  const results = [];
  for (const { url, files } of links) {
    let outcome;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      outcome = await requestOnce(fetchImpl, url, timeoutMs);
      if (outcome.ok || !outcome.transient || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
    const status = outcome.ok ? 'pass' : outcome.skip ? 'skip' : 'fail';
    const result = { url, files, status, detail: outcome.detail };
    results.push(result);
    await onResult(result);
  }
  return results;
}

/**
 * Writes each skipped URL, with the files that use it, one per line.
 * @param {string} file
 * @param {{ url: string, files: string[], status: string }[]} results
 */
export async function writeSkipped(file, results) {
  const lines = results
    .filter((r) => r.status === 'skip')
    .map(({ url, files }) => `${url} (${files.join(', ')})\n`);
  await writeFile(file, lines.join(''));
}

/**
 * Reads the command line.
 * @param {string[]} args
 * @returns {{ skippedFile: string | null }}
 */
export function parseArgs(args) {
  let skippedFile = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '--skipped') throw new Error(`Unknown argument ${args[i]}`);
    if (!args[i + 1]) throw new Error('--skipped needs a file');
    skippedFile = args[i + 1];
    i += 1;
  }
  return { skippedFile };
}

async function main(args) {
  let skippedFile;
  try {
    ({ skippedFile } = parseArgs(args));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const topics = await collectLinks(ROOT);
  const { unreadable } = topics;
  const links = mergeLinks(topics.links, configLinks(election));
  for (const { file, detail } of unreadable) console.log(`FAIL ${file}: cannot read it: ${detail}`);
  // The skipped list is kept current after every URL, so a step that times out
  // still reports the skips it found.
  const done = [];
  if (skippedFile) await writeSkipped(skippedFile, done);
  const results = await checkLinks(links, {
    onResult: async (result) => {
      const { url, files, status, detail } = result;
      console.log(`${status.toUpperCase()} ${url}: ${detail} (${files.join(', ')})`);
      done.push(result);
      if (skippedFile && status === 'skip') await writeSkipped(skippedFile, done);
    },
  });
  const skipped = results.filter((r) => r.status === 'skip').length;
  const skipNote = skipped
    ? ` ${skipped} skipped behind a bot challenge: check them by hand in a browser.`
    : '';
  const failed = results.filter((r) => r.status === 'fail').length + unreadable.length;
  if (failed) {
    console.error(
      `\n${failed} of ${results.length + unreadable.length} checks did not pass.${skipNote}`,
    );
    return 1;
  }
  console.log(`\n${results.length - skipped} of ${results.length} links answered.${skipNote}`);
  return 0;
}

// import.meta.url has symlinks resolved and argv[1] does not, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
