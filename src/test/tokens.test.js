// Compiles src/index.css with Tailwind to prove the design tokens (#78)
// produce the utilities the shared components use. jsdom never compiles
// Tailwind, so a renamed or deleted token would otherwise pass every test.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { compile } from 'tailwindcss';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TAILWIND = path.join(ROOT, 'node_modules/tailwindcss');

async function buildUtilities(candidates) {
  const css = await readFile(path.join(ROOT, 'src/index.css'), 'utf8');
  const compiler = await compile(css, {
    base: path.join(ROOT, 'src'),
    loadStylesheet: async (id) => {
      const file = path.join(TAILWIND, id === 'tailwindcss' ? 'index.css' : id);
      return { path: file, base: path.dirname(file), content: await readFile(file, 'utf8') };
    },
  });
  return compiler.build(candidates);
}

// Each utility and the token its rule must read.
const UTILITIES = {
  'text-title': '--text-title',
  'text-heading': '--text-heading',
  'text-subheading': '--text-subheading',
  'rounded-control': '--radius-control',
  'rounded-card': '--radius-card',
  // Tailwind writes a shadow's value into the rule; its color stays a token.
  'shadow-card': '--color-shadow',
  'shadow-popover': '--color-shadow',
  'border-notice-info': '--color-notice-info',
  'border-notice-warning': '--color-notice-warning',
  'border-notice-danger': '--color-notice-danger',
};

describe('design tokens', () => {
  it.each(Object.entries(UTILITIES))('%s reads %s', async (utility, token) => {
    const out = await buildUtilities([utility]);
    const rule = out.match(new RegExp(`\\.${utility}\\s*\\{([^}]*)\\}`));
    expect(rule, utility).not.toBeNull();
    expect(rule[1]).toContain(`var(${token}`);
    // The token itself is defined, so the var() resolves.
    expect(out).toMatch(new RegExp(`${token}:\\s*[^;]+;`));
  });

  it('keeps the Notice colors as aliases of the palette (#76 tunes them there)', async () => {
    const css = await readFile(path.join(ROOT, 'src/index.css'), 'utf8');
    for (const kind of ['info', 'warning', 'danger']) {
      expect(css).toMatch(new RegExp(`--color-notice-${kind}: var\\(--color-[a-z-]+\\);`));
    }
  });
});
