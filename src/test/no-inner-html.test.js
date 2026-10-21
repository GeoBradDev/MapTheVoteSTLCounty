// Data from the county's layers (like the precinct `html` field) is shown as
// text, never rendered as HTML. Fails when any file under src/ uses
// dangerouslySetInnerHTML, so a later card cannot quietly start doing it.
// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..');
const SELF = path.resolve(import.meta.filename);
// Split so this file does not match itself.
const FORBIDDEN = ['dangerously', 'SetInnerHTML'].join('');

async function filesUsingInnerHtml(dir, skip = []) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name))
    .filter((file) => !skip.includes(file));
  const hits = [];
  for (const file of files) {
    if ((await readFile(file, 'utf8')).includes(FORBIDDEN)) hits.push(path.relative(dir, file));
  }
  return hits;
}

describe(FORBIDDEN, () => {
  it('finds the prop in any file under a directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'inner-html-scan-'));
    try {
      await writeFile(path.join(dir, 'Card.jsx'), `<div ${FORBIDDEN}={{ __html: html }} />`);
      await writeFile(path.join(dir, 'Safe.jsx'), '<div>{html}</div>');
      expect(await filesUsingInnerHtml(dir)).toEqual(['Card.jsx']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is not used anywhere under src/', async () => {
    expect(await filesUsingInnerHtml(SRC, [SELF])).toEqual([]);
  });
});
