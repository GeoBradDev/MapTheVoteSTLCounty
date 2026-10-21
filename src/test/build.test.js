// Builds the app and checks the CSS that actually ships. This catches colors no
// source check can see: utilities Tailwind generates from class names it finds
// in scanned files, @source inline() safelists, and JSX arbitrary values.
// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
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

  beforeAll(async () => {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'mapthevote-build-'));
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.js'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
    const assets = path.join(outDir, 'assets');
    const files = (await readdir(assets)).filter((f) => f.endsWith('.css'));
    css = (await Promise.all(files.map((f) => readFile(path.join(assets, f), 'utf8')))).join('\n');
    html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  }, 60_000);

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('ships the utilities the app uses', () => {
    // App.jsx uses bg-surface; if Tailwind stopped scanning src it would be missing.
    expect(css).toContain('.bg-surface{');
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

  it('ships no red or blue color', () => {
    expect(builtColorProblems(css)).toEqual([]);
  });
});
