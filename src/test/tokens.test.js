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
  // The Notice kinds (#76), control edges and the primary button's states.
  ...Object.fromEntries(
    ['info', 'warning', 'danger', 'success'].flatMap((kind) => [
      [`bg-${kind}-fill`, `--color-${kind}-fill`],
      [`border-${kind}-ink`, `--color-${kind}-ink`],
      [`text-${kind}-ink`, `--color-${kind}-ink`],
    ]),
  ),
  'border-border-strong': '--color-border-strong',
  // The primary button's hover and pressed fills, written as plain utilities
  // here (the variants nest the rule).
  'bg-primary-hover': '--color-primary-hover',
  'bg-primary-pressed': '--color-primary-pressed',
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
});
