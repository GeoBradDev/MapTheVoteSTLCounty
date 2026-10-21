// Checks that every source and link in the voter education topics
// (content/<locale>/learn/*.md, #21) still answers. Official pages move between
// elections, and a dead source link breaks the promise that every claim can be
// checked. Runs on a schedule in .github/workflows/data-health.yml, never on
// pull requests, so a slow or broken government site cannot block a merge.
//
// Usage: node scripts/check-content-links.mjs
// Prints one PASS or FAIL line per URL and exits 1 when any URL fails.

import { readdir, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

async function requestOnce(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    await res.body?.cancel?.();
    if (res.ok) return { ok: true, detail: `HTTP ${res.status}` };
    return {
      ok: false,
      transient: res.status === 429 || res.status >= 500,
      detail: `HTTP ${res.status}`,
    };
  } catch (error) {
    const why = controller.signal.aborted ? `no answer in ${timeoutMs} ms` : error.message;
    return { ok: false, transient: true, detail: `request failed: ${why}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requests each URL, retrying network errors, 429 and 5xx answers.
 * @param {{ url: string, files: string[] }[]} links
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs] How long one request may take.
 * @param {number} [options.attempts] Tries per URL.
 * @param {number} [options.retryDelayMs] The wait before a retry, times the attempt.
 * @returns {Promise<{ url: string, files: string[], status: 'pass' | 'fail', detail: string }[]>}
 */
export async function checkLinks(
  links,
  { fetch: fetchImpl = fetch, timeoutMs = 15000, attempts = 3, retryDelayMs = 2000 } = {},
) {
  const results = [];
  for (const { url, files } of links) {
    let outcome;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      outcome = await requestOnce(fetchImpl, url, timeoutMs);
      if (outcome.ok || !outcome.transient || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
    results.push({ url, files, status: outcome.ok ? 'pass' : 'fail', detail: outcome.detail });
  }
  return results;
}

async function main() {
  const { links, unreadable } = await collectLinks(ROOT);
  for (const { file, detail } of unreadable) console.log(`FAIL ${file}: cannot read it: ${detail}`);
  if (!links.length && !unreadable.length) {
    console.log('No topic links under content/: nothing to check.');
    return 0;
  }
  const results = await checkLinks(links);
  for (const { url, files, status, detail } of results) {
    console.log(`${status.toUpperCase()} ${url}: ${detail} (${files.join(', ')})`);
  }
  const failed = results.filter((r) => r.status === 'fail').length + unreadable.length;
  if (failed) {
    console.error(`\n${failed} of ${results.length + unreadable.length} checks did not pass.`);
    return 1;
  }
  console.log(`\nAll ${results.length} links answered.`);
  return 0;
}

// import.meta.url has symlinks resolved and argv[1] does not, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
