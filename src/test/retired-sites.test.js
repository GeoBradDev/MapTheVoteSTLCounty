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

const HOST_PATTERN = RETIRED_HOSTS.map((h) => h.replaceAll('.', '\\.')).join('|');

/**
 * Every mention of a retired host, or a subdomain of one, as a URL or bare
 * text, in any letter case: "https://stlouiscovotes.info.", "HTTPS://...",
 * "//www.stlouiscovotes.info/faq" or "visit stlouiscovotes.info". A host that
 * only ends in one, like evil-stlouiscovotes.info, is not a mention.
 */
function retiredMentions(text) {
  const pattern = new RegExp(
    `(?<![\\w.-])((?:[a-z0-9-]+\\.)*(?:${HOST_PATTERN}))(?![\\w-]|\\.[a-z0-9])`,
    'gi',
  );
  return [...text.matchAll(pattern)].map((m) => m[1].toLowerCase());
}

/**
 * A JavaScript file's text without its whole-line comments, which may explain
 * why a host is retired. Code, strings and every other file are kept whole.
 */
function withoutComments(file, text) {
  if (!/\.jsx?$/.test(file)) return text;
  return text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
}

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

describe('retired county board sites', () => {
  it('finds a retired host and its subdomains in any form, and nothing else', () => {
    expect(
      retiredMentions(
        'a https://stlouiscovotes.info/faq/ b (https://www.stlouiscountymovotes.gov/) c ' +
          'Visit https://stlouiscovotes.info. Or HTTPS://STLouisCoVotes.info, ' +
          '`https://stlouiscovotes.info${path}` //www.stlouiscovotes.info/faq ' +
          "'stlouiscovotes.info': x, see stlouiscovotes.info!",
      ),
    ).toEqual([
      'stlouiscovotes.info',
      'www.stlouiscountymovotes.gov',
      'stlouiscovotes.info',
      'stlouiscovotes.info',
      'stlouiscovotes.info',
      'www.stlouiscovotes.info',
      'stlouiscovotes.info',
      'stlouiscovotes.info',
    ]);
  });

  it('ignores hosts that only resemble a retired one', () => {
    expect(
      retiredMentions(
        'https://stlouiscovotes.maps.arcgis.com/apps https://evil-stlouiscovotes.info/ ' +
          'https://stlouiscovotes.info.example.com/ https://stlouiscountymovotes.gov2.com/ ' +
          'https://stlouiscountymo.gov/st-louis-county-government/',
      ),
    ).toEqual([]);
  });

  it('reads JavaScript code but not its comment lines', () => {
    const js = "// was stlouiscovotes.info\n/**\n * stlouiscovotes.info\n */\nconst a = 'x';\n";
    expect(withoutComments('src/a.js', js)).toBe("const a = 'x';\n");
    expect(withoutComments('content/en/learn/a.md', '// stlouiscovotes.info')).toBe(
      '// stlouiscovotes.info',
    );
  });

  it('skips only test files', () => {
    expect(isTest('src/test/retired-sites.test.js')).toBe(true);
    expect(isTest('src/features/x/Page.test.jsx')).toBe(true);
    expect(isTest('src/config/election.js')).toBe(false);
    expect(isTest('content/en/learn/test.md')).toBe(false);
  });

  it('are not named in the app, its content or its host config', async () => {
    const files = [
      ...(await filesUnder(path.join(ROOT, 'src'))),
      ...(await filesUnder(path.join(ROOT, 'content'))),
      path.join(ROOT, 'render.yaml'),
      path.join(ROOT, 'index.html'),
    ].filter((file) => !isTest(file));
    const found = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const host of retiredMentions(withoutComments(file, text))) {
        found.push(`${path.relative(ROOT, file)}: ${host}`);
      }
    }
    expect(found).toEqual([]);
  });
});
