// Builds the app and checks the CSS that actually ships. This catches colors no
// source check can see: utilities Tailwind generates from class names it finds
// in scanned files, @source inline() safelists, and JSX arbitrary values.
// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import cityResults from '../config/cityResults.js';
import election from '../config/election.js';
import {
  colorLiterals,
  declarations,
  isAchromaticName,
  partyColor,
  stripSupportsConditions,
  toOklch,
} from './colors.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

// Every distinct color literal in built CSS declaration values that is party
// red or blue. Hex and rgb() are converted to oklch first, because Tailwind
// writes opacity modifiers (bg-primary/50) as hex fallbacks. A color the check
// cannot read (a named hue, hsl(), lab()) is reported too. Selectors are
// skipped: element names like `menu` and `canvas` are also system color keywords.
function builtColorProblems(css) {
  const literals = declarations(stripSupportsConditions(css)).flatMap((d) =>
    colorLiterals(d.value),
  );
  return [...new Set(literals)].filter((literal) => {
    const oklch = toOklch(literal);
    return oklch ? partyColor(oklch) !== null : !isAchromaticName(literal);
  });
}

describe('built CSS helpers', () => {
  it('reports party colors however they are written, and unreadable hues', () => {
    const css =
      '.a{color:oklch(42% .07 165)}.b{color:oklch(50% .2 260)}' +
      '.bg-\\[\\#dc2626\\]{background-color:#dc2626}.c{color:#1d4ed8cc}' +
      '.d{color:rgb(29 78 216)}.e{color:navy}.f{color:hsl(220 80% 50%)}';
    expect(builtColorProblems(css)).toEqual([
      'oklch(50% .2 260)',
      '#dc2626',
      '#1d4ed8cc',
      'rgb(29 78 216)',
      'navy',
      'hsl(220 80% 50%)',
    ]);
  });

  it('allows token colors written as opacity-modifier hex fallbacks', () => {
    const css =
      '.bg-primary\\/50{background-color:#20594380}.text-ink\\/70{color:#1b1a18b3}' +
      '.border-border\\/50{border-color:#d9d7d380}';
    expect(builtColorProblems(css)).toEqual([]);
  });

  it('allows grays written as hex, element selectors and the preflight feature probes', () => {
    const css =
      '.s{--tw-shadow:0 0 #0000;box-shadow:0 1px #0000001a;color:white}menu,canvas{display:block}' +
      '@supports (not (color:rgb(from red r g b))){*{color:inherit}}' +
      '@supports (color:color-mix(in lab, red, red)){::placeholder{color:currentcolor}}';
    expect(builtColorProblems(css)).toEqual([]);
  });
});

describe('production build', () => {
  let outDir;
  let css = '';
  let html = '';
  let js = {};

  beforeAll(async () => {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'mapthevote-build-'));
    // Vitest sets NODE_ENV to test, which would build React's development
    // bundle. Build what `npm run build` ships.
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await build({
        root: ROOT,
        configFile: path.join(ROOT, 'vite.config.js'),
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true },
      });
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
    const assets = path.join(outDir, 'assets');
    const files = (await readdir(assets)).filter((f) => f.endsWith('.css'));
    css = (await Promise.all(files.map((f) => readFile(path.join(assets, f), 'utf8')))).join('\n');
    html = await readFile(path.join(outDir, 'index.html'), 'utf8');
    const scripts = (await readdir(assets)).filter((f) => f.endsWith('.js'));
    js = Object.fromEntries(
      await Promise.all(
        scripts.map(async (f) => [f, await readFile(path.join(assets, f), 'utf8')]),
      ),
    );
  }, 60_000);

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('ships the utilities the app uses', () => {
    // App.jsx uses bg-surface; if Tailwind stopped scanning src it would be missing.
    expect(css).toContain('.bg-surface{');
  });

  // "How to vote" pages print cleanly (#23): no page links or Privacy link (the
  // footer's nonpartisan statement still prints, #71), and each external link
  // prints its address.
  it('ships the print styles', () => {
    expect(css).toMatch(/@media print\{[^@]*\.print\\:hidden\{display:none\}/);
    expect(css).toMatch(
      /@media print\{[^@]*\.print-href:after\{content:" \(" attr\(href\) "\)";overflow-wrap:anywhere\}/,
    );
  });

  // Link previews and search results say what the site is (#71).
  it('describes the site as nonpartisan and unofficial', () => {
    const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
    expect(description).toMatch(/nonpartisan/i);
    expect(description).toMatch(/unofficial/i);
  });

  it('loads hashed assets by root-absolute path, so a hard load of /p/CC007 finds them', () => {
    expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/index-[\w-]+\.js">/);
    expect(html).toMatch(/<link rel="stylesheet" crossorigin href="\/assets\/index-[\w-]+\.css">/);
  });

  // render.yaml's Content-Security-Policy allows only same-origin scripts,
  // styles, images and fonts, with no 'unsafe-inline'.
  it('needs nothing the Content-Security-Policy blocks', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((tag) => !/\bsrc="\/assets\//.test(tag))).toEqual([]);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    const cssUrls = [...css.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]);
    expect(cssUrls.filter((u) => /^(?:[a-z]+:|\/\/)/i.test(u))).toEqual([]);
  });

  // The map (#13) is extra help: MapLibre must not slow the first load.
  it('keeps MapLibre out of the entry chunk and loads it only on demand', () => {
    const entry = html.match(/src="\/assets\/(index-[\w-]+\.js)"/)[1];
    // A class name MapLibre's map code sets on its canvas.
    const isMapLibre = (code) => code.includes('maplibregl-canvas');
    expect(isMapLibre(js[entry])).toBe(false);
    // One MapLibre chunk, shared by the precinct map and the wait times map
    // (#104), and imported only by their view modules.
    const mapChunks = Object.keys(js).filter((f) => isMapLibre(js[f]));
    expect(mapChunks).toHaveLength(1);
    const [mapChunk] = mapChunks;
    const importers = Object.keys(js).filter((f) => js[f].includes(`./${mapChunk}`));
    expect(importers.map((f) => f.replace(/-[\w-]+\.js$/, '')).sort()).toEqual([
      'precinctMapView',
      'waitTimesMapView',
    ]);
    // Each view is imported with import(), not statically: no modulepreload either.
    const waitTimesPage = Object.keys(js).find((f) => f.startsWith('WaitTimesPage-'));
    expect(js[entry]).toMatch(/import\(["'`][^"'`]*precinctMapView-[\w-]+\.js/);
    expect(js[waitTimesPage]).toMatch(/import\(["'`][^"'`]*waitTimesMapView-[\w-]+\.js/);
    expect(html).not.toMatch(/MapView|precinctMap|maplibre/);
  });

  // The wait times page (#104) is its own chunk, loaded when its route is.
  it('loads the wait times page on demand', () => {
    const entry = html.match(/src="\/assets\/(index-[\w-]+\.js)"/)[1];
    expect(js[entry]).toMatch(/import\(["'`][^"'`]*WaitTimesPage-[\w-]+\.js/);
    expect(html).not.toMatch(/WaitTimesPage/);
  });

  // The City data client (#87) is loaded on demand (loadCityClient), never in
  // the first load. Its own error text marks it: names are minified.
  it('keeps the City data client out of the first load', () => {
    const firstLoad = [...html.matchAll(/(?:src|href)="\/assets\/([\w-]+\.js)"/g)].map((m) => m[1]);
    for (const f of firstLoad) expect(js[f], f).not.toContain('has no inside to ask at');
  });

  // The City-only results UI and its config (#91, #147) come with the City
  // chunk, never the first load: the City's early voting site ids and its
  // quoted Election Day rule mark them.
  it('keeps the City-only results UI and its config out of the first load', () => {
    const firstLoad = [...html.matchAll(/(?:src|href)="\/assets\/([\w-]+\.js)"/g)].map((m) => m[1]);
    // Not the Board office's id: the Election Day filter in the first load names it.
    const { pollsWhere } = election.jurisdictions.city;
    const marks = [
      ...Object.keys(cityResults.earlyVoting.sites).filter((id) => !pollsWhere.includes(id)),
      cityResults.electionDayRule.quote.slice(0, 40),
    ];
    for (const f of firstLoad) {
      for (const mark of marks) expect(js[f].includes(mark), `${f}: ${mark}`).toBe(false);
    }
    const chunk = Object.keys(js).find((f) => f.startsWith('cityChunk-'));
    expect(chunk).toBeDefined();
    for (const mark of marks) expect(js[chunk].includes(mark), mark).toBe(true);
  });

  // Performance budget (#27): every script the first load fetches (the entry
  // and anything index.html preloads) under about 120 KB gzipped.
  it('keeps the first-load JavaScript under 120 KB gzipped', () => {
    const firstLoad = [...html.matchAll(/(?:src|href)="\/assets\/([\w-]+\.js)"/g)].map((m) => m[1]);
    expect(firstLoad.length).toBeGreaterThan(0);
    const bytes = firstLoad.reduce((sum, f) => sum + gzipSync(js[f]).length, 0);
    expect(bytes).toBeLessThan(120 * 1024);
  });

  // The system font stack (#27): no web font to download before text shows.
  it('downloads no web font', () => {
    expect(css).not.toMatch(/@font-face/i);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com|\.woff2?\b/i);
  });

  it('ships the map worker as a same-origin file the map chunk points to', () => {
    const worker = Object.keys(js).find((f) => f.startsWith('maplibre-gl-worker-'));
    expect(worker).toBeDefined();
    const view = Object.keys(js).find((f) => js[f].includes('maplibregl-canvas'));
    expect(js[view]).toContain(`/assets/${worker}`);
  });

  it('ships no red or blue color', () => {
    expect(builtColorProblems(css)).toEqual([]);
  });

  // Pre-rendered public pages (#99): what a crawler or link preview bot gets
  // with no JavaScript.
  describe('pre-rendered pages', () => {
    const page = (file) => readFile(path.join(outDir, file), 'utf8');
    const canonicalOf = (doc) => doc.match(/<link rel="canonical" href="([^"]+)">/)?.[1] ?? null;
    const rootOf = (doc) => doc.match(/<div id="root"[^>]*>([\s\S]*)<\/div>\s*<\/body>/)?.[1];

    it('writes one page per sitemap entry, at the path the sitemap names', async () => {
      const sitemap = await page('sitemap.xml');
      const paths = [...sitemap.matchAll(/<loc>https:\/\/mapthevotestl\.com([^<]*)<\/loc>/g)].map(
        (m) => m[1],
      );
      expect(paths).toContain('/learn/voter-id');
      for (const route of paths) {
        const file = route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
        const doc = await page(file);
        expect(doc, file).toContain(`data-prerendered="${route}"`);
        expect(canonicalOf(doc), file).toBe(`https://mapthevotestl.com${route}`);
        expect(doc.match(/<h1\b/g), file).toHaveLength(1);
        expect(doc, file).toMatch(/<meta property="og:title" content="[^"]+">/);
        expect(doc.match(/<meta name="description"/g), file).toHaveLength(1);
      }
    });

    it('writes a topic with its heading, text, title and description', async () => {
      const doc = await page('learn/voter-id/index.html');
      expect(doc).toContain('<title>What ID to bring | St. Louis County Voter Guide</title>');
      expect(doc).toMatch(/<h1[^>]*>What ID to bring<\/h1>/);
      expect(doc).toContain('In Missouri, you must show a photo ID when you vote in person.');
      expect(doc).toMatch(
        /<meta name="description" content="In Missouri, you must show a photo ID/,
      );
    });

    it('pre-renders exactly the sitemap entries, no page more or less', async () => {
      const sitemap = await page('sitemap.xml');
      const paths = [...sitemap.matchAll(/<loc>https:\/\/mapthevotestl\.com([^<]*)<\/loc>/g)]
        .map((m) => m[1])
        .sort();
      const files = (await readdir(outDir, { recursive: true }))
        .map((f) => f.replaceAll('\\', '/'))
        .filter((f) => f.endsWith('index.html'))
        .map((f) => (f === 'index.html' ? '/' : `/${f.slice(0, -'/index.html'.length)}`))
        .sort();
      expect(files).toEqual(paths);
    });

    it('writes the home page as index.html, with the address search', async () => {
      expect(html).toContain('data-prerendered="/"');
      expect(html).toContain('role="combobox"');
      expect(canonicalOf(html)).toBe('https://mapthevotestl.com/');
    });

    it('keeps the client-rendered shell for every other path, with no page in it', async () => {
      const shell = await page('shell.html');
      expect(rootOf(shell)).toBe('');
      expect(shell).toContain('<div id="root"></div>');
      expect(canonicalOf(shell)).toBeNull();
      expect(shell).not.toMatch(/property="og:/);
      expect(shell).toContain('<title>St. Louis County Voter Guide</title>');
      const scripts = (doc) =>
        [...doc.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      expect(scripts(shell)).toEqual(scripts(html));
    });

    it('bakes no precinct page into the build', async () => {
      await expect(stat(path.join(outDir, 'p'))).rejects.toThrow(/ENOENT/);
    });

    it('needs nothing the Content-Security-Policy blocks on any page', async () => {
      for (const file of ['learn/index.html', 'learn/voter-id/index.html', 'privacy/index.html']) {
        const doc = await page(file);
        const scripts = [...doc.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
        expect(
          scripts.filter((tag) => !/\bsrc="\/assets\//.test(tag)),
          file,
        ).toEqual([]);
        expect(doc, file).not.toMatch(/<style\b/i);
        expect(doc, file).not.toMatch(/\sstyle=/i);
        expect(doc, file).not.toMatch(/\son[a-z]+=/i);
      }
    });
  });
});
