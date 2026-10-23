// Guards the nonpartisan palette. Checks values, not property names, because
// Tailwind builds color utilities from many theme namespaces (--color-*,
// --stroke-*, --shadow-*, --default-ring-color, ...). Every color written in
// CSS under src must be an oklch --color-* token that is not party red or blue.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  colorLiterals,
  dataUris,
  declarations,
  parseOklch,
  partyColor,
  DARK_MEDIA,
  stripComments,
  themeTokens,
  toOklch,
} from './colors.js';
import { oklchToRgb } from '../features/lookup/mapBounds.js';

const SRC = path.resolve(import.meta.dirname, '..');

function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

describe('theme guard helpers', () => {
  it('wraps hues past 360 before checking them', () => {
    expect(partyColor('oklch(0.55 0.2 385)')).toBe('red');
    expect(partyColor('oklch(0.55 0.2 600)')).toBe('blue');
    expect(partyColor('oklch(0.55 0.2 -100)')).toBe('blue');
  });

  it('reads declarations after a nested block and outside @theme', () => {
    const css = `
      @theme {
        --color-primary: oklch(0.4 0.07 165);
        @keyframes fade { from { opacity: 0 } }
        --color-brand: oklch(0.5 0.2 260);
      }
      :root { --color-link: oklch(0.5 0.2 25); }
    `;
    expect(declarations(css).map((d) => d.property)).toEqual([
      '--color-primary',
      'opacity',
      '--color-brand',
      '--color-link',
    ]);
  });

  it('does not read a selector with a pseudo-class as a declaration', () => {
    const css = 'a:not(.red) { color: var(--color-ink); }';
    expect(declarations(css)).toEqual([{ property: 'color', value: 'var(--color-ink)' }]);
  });

  it('ignores words in url() paths and quoted strings', () => {
    const css = `.a { background-image: url(/img/white.png); content: "red"; }`;
    expect(declarations(css).flatMap((d) => colorLiterals(d.value))).toEqual([]);
  });

  it('does not read a glob in a string as the start of a comment', () => {
    const css = `
      @source "../content/*.md";
      :root { --color-link: oklch(0.5 0.2 260); }
      /* end */
    `;
    expect(declarations(css).map((d) => d.property)).toEqual(['--color-link']);
  });

  it('keeps reading after a string with an escaped quote', () => {
    const css = `.a { content: 'It\\'s here'; color: red; }`;
    expect(declarations(css).flatMap((d) => colorLiterals(d.value))).toEqual(['red']);
  });

  it('finds data URIs in plain strings and upper-case URL()', () => {
    const css = `
      .a { background-image: image-set("data:image/svg+xml,<svg/>" 1x); }
      .b { background: URL("data:image/png;base64,AAAA"); }
    `;
    expect(dataUris(css)).toHaveLength(2);
  });

  it('finds every data URI, however it is encoded', () => {
    const css = `
      .a { background-image: url("data:image/svg+xml,%3Csvg fill='%231d4ed8'%3E"); }
      .b { background: url("data:image/svg+xml;utf8,<svg fill='red'/>"); }
      .c { background: url(data:image/svg+xml;base64,PHN2ZyBmaWxsPSJyZWQiLz4=); }
      .d { background: url(/img/icon.svg); }
    `;
    expect(dataUris(css)).toHaveLength(3);
  });

  it('finds color literals in any value, whatever the property is called', () => {
    expect(colorLiterals('oklch(0.5 0.2 260)')).toEqual(['oklch(0.5 0.2 260)']);
    expect(colorLiterals('0 0 0 4px oklch(0.5 0.2 260)')).toEqual(['oklch(0.5 0.2 260)']);
    expect(colorLiterals('linear-gradient(#dc2626, rgb(0 0 255))')).toEqual([
      'rgb(0 0 255)',
      '#dc2626',
    ]);
    expect(colorLiterals('1px solid navy')).toEqual(['navy']);
  });

  it('finds named colors inside other functions', () => {
    expect(colorLiterals('color-mix(in srgb, red 80%, white)')).toEqual(['red', 'white']);
    expect(colorLiterals('light-dark(white, navy)')).toEqual(['white', 'navy']);
    expect(colorLiterals('var(--x, crimson)')).toEqual(['crimson']);
  });

  it('reads arbitrary values in @apply', () => {
    const css = '.x { @apply px-4 bg-[#dc2626] text-[oklch(0.5_0.2_260)]; }';
    const applied = declarations(css).filter((d) => d.property === '@apply');
    expect(applied.flatMap((d) => colorLiterals(d.value))).toEqual([
      'oklch(0.5 0.2 260)',
      '#dc2626',
    ]);
  });

  it('ignores values with no color', () => {
    expect(colorLiterals('initial')).toEqual([]);
    expect(colorLiterals('1rem')).toEqual([]);
    expect(colorLiterals('var(--color-ink)')).toEqual([]);
    expect(colorLiterals('currentColor')).toEqual([]);
  });
});

describe('design tokens', () => {
  const files = cssFiles(SRC);
  const found = files.flatMap((file) =>
    declarations(readFileSync(file, 'utf8')).flatMap((d) =>
      colorLiterals(d.value).map((literal) => ({
        ...d,
        literal,
        where: `${path.relative(SRC, file)}: ${d.property}: ${d.value}`,
      })),
    ),
  );

  it('defines the palette in exactly one @theme block across src', () => {
    const blocks = files.flatMap((file) => [
      ...stripComments(readFileSync(file, 'utf8')).matchAll(/@theme\b/g),
    ]);
    expect(blocks).toHaveLength(1);
  });

  it('defines the core color tokens', () => {
    const tokens = found.map((f) => f.property);
    for (const name of [
      'surface',
      'ink',
      'muted',
      'border',
      'border-strong',
      'primary',
      'danger-ink',
      'warning-ink',
    ]) {
      expect(tokens).toContain(`--color-${name}`);
    }
  });

  it('writes colors only as --color-* tokens', () => {
    const outside = found.filter((f) => !f.property.startsWith('--color-'));
    expect(outside.map((f) => f.where)).toEqual([]);
  });

  it('writes every color in oklch so it can be checked', () => {
    const other = found.filter((f) => parseOklch(f.literal) === null);
    expect(other.map((f) => f.where)).toEqual([]);
  });

  it('keeps every color away from red and blue', () => {
    const party = found.filter((f) => partyColor(f.literal) !== null);
    expect(party.map((f) => f.where)).toEqual([]);
  });

  // An inline data URI can hide a color in any encoding, so none are allowed.
  // Put icons in SVG files or components that use currentColor instead.
  it('uses no data URIs', () => {
    const uris = files.flatMap((file) =>
      dataUris(readFileSync(file, 'utf8')).map((uri) => `${path.relative(SRC, file)}: ${uri}`),
    );
    expect(uris).toEqual([]);
  });
});

// The browser's own chrome color (#76), one per scheme (#77). It is outside
// CSS, so the guards above never see it: each must match its theme's surface
// and be neither red nor blue.
describe('theme-color meta', () => {
  const html = readFileSync(path.join(SRC, '../index.html'), 'utf8');
  const css = readFileSync(path.join(SRC, 'index.css'), 'utf8');
  const themes = themeTokens(css);
  // A token as sRGB hex, as the browser draws it.
  const hexOf = (value) =>
    `#${oklchToRgb(value)
      .match(/\d+/g)
      .map((c) => Number(c).toString(16).padStart(2, '0'))
      .join('')}`;
  const metas = [...html.matchAll(/<meta\s+name="theme-color"([^>]*)>/g)].map((m) => ({
    media: m[1].match(/media="([^"]+)"/)?.[1],
    content: m[1].match(/content="([^"]+)"/)?.[1],
  }));

  it('has one per scheme', () => {
    expect(metas.map((m) => m.media)).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ]);
  });

  it.each(['light', 'dark'])('is the %s surface token, neither red nor blue', (theme) => {
    const value = metas.find((m) => m.media === `(prefers-color-scheme: ${theme})`)?.content;
    expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    expect(partyColor(toOklch(value))).toBeNull();
    expect(value.toLowerCase()).toBe(hexOf(themes[theme].surface));
  });

  it('tells the browser both schemes before the stylesheet loads', () => {
    expect(html).toMatch(/<meta\s+name="color-scheme"\s+content="light dark"\s*\/?>/);
  });
});

// Dark mode (#77): the system setting picks the theme, print stays light.
describe('color scheme', () => {
  const css = stripComments(readFileSync(path.join(SRC, 'index.css'), 'utf8'));

  it('lets form controls and scrollbars follow the scheme', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark/);
  });

  it('applies the dark values on screens only, so print stays light', () => {
    expect(css).toContain(DARK_MEDIA);
    expect(css).not.toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    expect(css).toMatch(/@media print\s*\{[^@]*color-scheme:\s*light;/);
  });

  it('paints the page itself in the surface color', () => {
    expect(css).toMatch(/html\s*\{[^}]*background-color:\s*var\(--color-surface\)/);
  });
});
