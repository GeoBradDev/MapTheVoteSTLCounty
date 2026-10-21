// Nested Claude worktrees hold full copies of the repo. Tools run from the
// main checkout must skip them, or they test and lint another branch's files.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import viteConfig from '../../vite.config.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('deploy base path', () => {
  it('serves from the domain root, so deep links like /p/CC007 still find /assets', () => {
    expect(viteConfig.base).toBe('/');
  });
});

describe('tooling ignores nested worktrees', () => {
  it('excludes .claude from vitest', () => {
    expect(viteConfig.test.exclude).toContain('.claude/**');
  });

  it('keeps vitest default excludes', () => {
    expect(viteConfig.test.exclude).toContain('**/node_modules/**');
  });

  it('limits tailwind class scanning to the app source', async () => {
    const css = await readFile(path.join(ROOT, 'src/index.css'), 'utf8');
    expect(css).toContain(`@import 'tailwindcss' source(none);`);
    const sources = [...css.matchAll(/@source\s+(?!not\b)'([^']+)'/g)].map((m) => m[1]);
    expect(sources).toEqual(['../index.html', '.']);
  });

  it('excludes .claude from prettier', async () => {
    const ignore = (await readFile(path.join(ROOT, '.prettierignore'), 'utf8')).split('\n');
    expect(ignore).toContain('.claude');
  });
});
