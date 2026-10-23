// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import election from '../../../config/election.js';
import viteConfig from '../../../../vite.config.js';
import { addDays } from './topic.js';
import learnContent from './vitePlugin.js';

const ELECTION = election.electionDate;

function topic({ sources = true } = {}) {
  return [
    '---',
    'id: voter-id',
    'title: Fixture topic, not voter guidance',
    'group: get-help',
    `election: ${ELECTION}`,
    `lastVerified: ${addDays(ELECTION, -5)}`,
    ...(sources
      ? ['sources:', '  - id: sos', '    label: Fixture source', '    url: https://www.sos.mo.gov/']
      : []),
    '---',
    '',
    sources ? 'A fixture claim.[^sos]' : 'A fixture claim with no source.',
    '',
  ].join('\n');
}

describe('learnContent plugin', () => {
  const plugin = learnContent({ electionDate: ELECTION });
  const context = {
    error(message) {
      throw new Error(message);
    },
  };

  it('turns a topic file into a JSON module', () => {
    const result = plugin.transform.call(context, topic(), '/repo/content/en/learn/voter-id.md');
    const json = result.code.replace(/^export default /, '').replace(/;\n$/, '');
    expect(JSON.parse(json)).toMatchObject({
      id: 'voter-id',
      locale: 'en',
      sources: [{ id: 'sos', url: 'https://www.sos.mo.gov/' }],
    });
  });

  // The first load gets only the summary (#147); the body loads with its page.
  it('turns a topic file imported with ?meta into its summary', () => {
    const result = plugin.transform.call(
      context,
      topic(),
      '/repo/content/en/learn/voter-id.md?meta',
    );
    const json = result.code.replace(/^export default /, '').replace(/;\n$/, '');
    expect(JSON.parse(json)).toEqual({
      id: 'voter-id',
      locale: 'en',
      title: 'Fixture topic, not voter guidance',
      group: 'get-help',
      intro: 'A fixture claim.',
    });
  });

  it('fails on a topic with a missing source', () => {
    expect(() =>
      plugin.transform.call(context, topic({ sources: false }), '/r/content/en/learn/voter-id.md'),
    ).toThrow(/content\/en\/learn\/voter-id\.md has 1 problem:\n {2}- sources: list at least one/);
  });

  it('leaves every other file alone', () => {
    expect(plugin.transform.call(context, '# Hi', '/repo/README.md')).toBeNull();
    expect(plugin.transform.call(context, '# Hi', '/repo/docs/learn/a.md')).toBeNull();
    expect(plugin.transform.call(context, 'x', '/repo/content/en/learn/a.md?raw')).toBeNull();
  });

  it('is registered in the app build', () => {
    expect(viteConfig.plugins.flat().map((p) => p?.name)).toContain('mapthevote-learn-content');
  });
});

describe('a real build', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'learn-content-build-'));
    await mkdir(path.join(dir, 'content/en/learn'), { recursive: true });
    await writeFile(
      path.join(dir, 'main.js'),
      "export const topics = import.meta.glob('/content/*/learn/*.md', { eager: true, import: 'default' });\n",
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const run = () =>
    build({
      root: dir,
      configFile: false,
      logLevel: 'silent',
      plugins: [learnContent({ electionDate: ELECTION })],
      build: {
        outDir: path.join(dir, 'dist'),
        lib: { entry: path.join(dir, 'main.js'), formats: ['es'], fileName: 'main' },
      },
    });

  it('fails when a topic has a missing source', async () => {
    await writeFile(path.join(dir, 'content/en/learn/voter-id.md'), topic({ sources: false }));
    await expect(run()).rejects.toThrow(/sources: list at least one source/);
  });

  it('fails on a bad topic even when no app code imports the topics yet', async () => {
    await writeFile(path.join(dir, 'main.js'), 'export const nothing = 1;\n');
    await writeFile(path.join(dir, 'content/en/learn/voter-id.md'), topic({ sources: false }));
    await expect(run()).rejects.toThrow(/voter-id\.md has 1 problem/);
  });

  it('skips a directory whose name ends in .md', async () => {
    await mkdir(path.join(dir, 'content/en/learn/folder.md'));
    await expect(run()).resolves.toBeDefined();
  });

  it('builds when the content folder is missing', async () => {
    await rm(path.join(dir, 'content'), { recursive: true });
    await expect(run()).resolves.toBeDefined();
  });

  it('inlines a valid topic as data, with no parser in the bundle', async () => {
    await writeFile(path.join(dir, 'content/en/learn/voter-id.md'), topic());
    await run();
    const files = await readdir(path.join(dir, 'dist'));
    const code = (
      await Promise.all(files.map((f) => readFile(path.join(dir, 'dist', f), 'utf8')))
    ).join('\n');
    expect(code).toContain('Fixture topic, not voter guidance');
    expect(code).toContain('https://www.sos.mo.gov/');
    expect(code).not.toMatch(/parseYaml|front matter/);
  });
});
