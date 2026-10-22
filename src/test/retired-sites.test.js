// The county board's old website, stlouiscovotes.info, now sends every page to
// the county's Board of Elections page with a meta refresh, so no deep link
// survives (#73). Its .gov domain, stlouiscountymovotes.gov, redirects to the
// old site first, two hops away. Link the board's page directly
// (election.countySiteUrl) and cite sources that still hold their text.
// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
// Tests may name a retired URL to prove it is rejected; they never ship.
const isTest = (file) => /\.test\.jsx?$/.test(file);

/** Hosts no link or source may name, with each subdomain. */
const RETIRED_HOSTS = ['stlouiscovotes.info', 'stlouiscountymovotes.gov'];

/** A URL whose host is a retired host or one of its subdomains. */
function retiredUrls(text) {
  const found = [];
  for (const match of text.matchAll(/https?:\/\/[^\s"'`)<>\]]+/g)) {
    let host;
    try {
      host = new URL(match[0]).hostname;
    } catch {
      continue;
    }
    if (RETIRED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) found.push(match[0]);
  }
  return found;
}

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

describe('retired county board sites', () => {
  it('finds a retired URL and its subdomains, and nothing else', () => {
    expect(
      retiredUrls(
        'a https://stlouiscovotes.info/faq/ b (https://www.stlouiscountymovotes.gov/) c ' +
          'https://stlouiscovotes.maps.arcgis.com/apps d https://evil-stlouiscovotes.info/',
      ),
    ).toEqual(['https://stlouiscovotes.info/faq/', 'https://www.stlouiscountymovotes.gov/']);
  });

  it('skips only test files', () => {
    expect(isTest('src/test/retired-sites.test.js')).toBe(true);
    expect(isTest('src/features/x/Page.test.jsx')).toBe(true);
    expect(isTest('src/config/election.js')).toBe(false);
    expect(isTest('content/en/learn/test.md')).toBe(false);
  });

  it('are not linked or cited in the app, its content or its host config', async () => {
    const files = [
      ...(await filesUnder(path.join(ROOT, 'src'))),
      ...(await filesUnder(path.join(ROOT, 'content'))),
      path.join(ROOT, 'render.yaml'),
      path.join(ROOT, 'index.html'),
    ].filter((file) => !isTest(file));
    const found = [];
    for (const file of files) {
      for (const url of retiredUrls(await readFile(file, 'utf8'))) {
        found.push(`${path.relative(ROOT, file)}: ${url}`);
      }
    }
    expect(found).toEqual([]);
  });
});
