// The content link checker (scripts/check-content-links.mjs), against a temp
// content folder and a stubbed fetch.
// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkLinks, collectLinks, topicFiles } from '../../scripts/check-content-links.mjs';

// Dates here do not matter: the link checker skips the date checks.
const topic = (sourceUrl, body = 'Text.[^a]') =>
  [
    '---',
    'id: x',
    'title: Fixture',
    'election: 2000-01-04',
    'lastVerified: 1999-01-01',
    'sources:',
    '  - id: a',
    '    label: A',
    `    url: ${sourceUrl}`,
    '---',
    '',
    body,
    '',
  ].join('\n');

describe('collectLinks', () => {
  let root;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'content-links-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds nothing when there is no content folder', async () => {
    expect(await collectLinks(root)).toEqual({ links: [], unreadable: [] });
  });

  it('collects source and inline URLs once each, with the files that use them', async () => {
    await mkdir(path.join(root, 'content/en/learn'), { recursive: true });
    await mkdir(path.join(root, 'content/es/learn'), { recursive: true });
    await writeFile(
      path.join(root, 'content/en/learn/x.md'),
      topic('https://a.gov/', 'See [b](https://b.gov/) and [home](/).[^a]'),
    );
    await writeFile(path.join(root, 'content/es/learn/x.md'), topic('https://a.gov/'));
    await writeFile(path.join(root, 'content/en/learn/.gitkeep'), '');
    await writeFile(path.join(root, 'content/en/README.md'), 'not a topic');

    expect(await topicFiles(root)).toEqual(['content/en/learn/x.md', 'content/es/learn/x.md']);
    expect(await collectLinks(root)).toEqual({
      links: [
        { url: 'https://a.gov/', files: ['content/en/learn/x.md', 'content/es/learn/x.md'] },
        { url: 'https://b.gov/', files: ['content/en/learn/x.md'] },
      ],
      unreadable: [],
    });
  });

  it('reports a file it cannot read', async () => {
    await mkdir(path.join(root, 'content/en/learn'), { recursive: true });
    await writeFile(path.join(root, 'content/en/learn/x.md'), 'no front matter');
    const { unreadable } = await collectLinks(root);
    expect(unreadable).toEqual([
      { file: 'content/en/learn/x.md', detail: expect.stringMatching(/front matter/) },
    ]);
  });
});

describe('checkLinks', () => {
  const links = [
    { url: 'https://ok.gov/', files: ['f'] },
    { url: 'https://gone.gov/', files: ['f'] },
    { url: 'https://flaky.gov/', files: ['f'] },
    { url: 'https://down.gov/', files: ['f'] },
  ];

  it('passes 2xx answers, fails 4xx at once and retries 5xx and network errors', async () => {
    const calls = [];
    let flaky = 0;
    const fakeFetch = async (url, init) => {
      calls.push(url);
      expect(init.headers['User-Agent']).toMatch(/MapTheVoteSTL/);
      expect(init.redirect).toBe('follow');
      if (url === 'https://ok.gov/') return new Response('ok', { status: 200 });
      if (url === 'https://gone.gov/') return new Response('', { status: 404 });
      if (url === 'https://flaky.gov/') {
        flaky += 1;
        if (flaky === 1) throw new TypeError('fetch failed');
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 503 });
    };
    const results = await checkLinks(links, { fetch: fakeFetch, retryDelayMs: 0, attempts: 3 });
    expect(results.map((r) => [r.url, r.status, r.detail])).toEqual([
      ['https://ok.gov/', 'pass', 'HTTP 200'],
      ['https://gone.gov/', 'fail', 'HTTP 404'],
      ['https://flaky.gov/', 'pass', 'HTTP 200'],
      ['https://down.gov/', 'fail', 'HTTP 503'],
    ]);
    expect(calls.filter((u) => u === 'https://gone.gov/')).toHaveLength(1);
    expect(calls.filter((u) => u === 'https://down.gov/')).toHaveLength(3);
  });

  it('fails a URL that does not answer in time', async () => {
    const hang = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const [result] = await checkLinks([links[0]], {
      fetch: hang,
      timeoutMs: 10,
      attempts: 1,
    });
    expect(result).toMatchObject({ status: 'fail', detail: 'request failed: no answer in 10 ms' });
  });
});
