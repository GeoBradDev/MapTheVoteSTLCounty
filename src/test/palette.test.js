// Compiles src/index.css with Tailwind to prove only our tokens produce color
// utilities. Tailwind's default palette (red-600, blue-700, ...) must be gone.
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

describe('tailwind palette', () => {
  it('generates utilities for our tokens', async () => {
    const out = await buildUtilities(['bg-primary', 'text-ink']);
    expect(out).toMatch(/\.bg-primary\b/);
    expect(out).toMatch(/\.text-ink\b/);
  });

  it('drops the default red and blue colors', async () => {
    const out = await buildUtilities(['bg-blue-700', 'text-red-600', 'border-sky-500']);
    expect(out).not.toMatch(/\.bg-blue-700\b/);
    expect(out).not.toMatch(/\.text-red-600\b/);
    expect(out).not.toMatch(/\.border-sky-500\b/);
  });
});
