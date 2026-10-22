// The content link checker (scripts/check-content-links.mjs), against a temp
// content folder and a stubbed fetch.
// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkLinks,
  collectLinks,
  configLinks,
  metaRefreshTarget,
  topicFiles,
  writeSkipped,
} from '../../scripts/check-content-links.mjs';

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

  it('fails a URL that redirects off the official hosts', async () => {
    const moved = async () => {
      const res = new Response('parked', { status: 200 });
      Object.defineProperty(res, 'redirected', { value: true });
      Object.defineProperty(res, 'url', { value: 'https://parked.example.com/' });
      return res;
    };
    const [result] = await checkLinks([links[0]], { fetch: moved, attempts: 1 });
    expect(result).toMatchObject({
      status: 'fail',
      detail: 'redirected off the official hosts to https://parked.example.com/',
    });
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

// A page the fake fetch answers with, at its final URL.
const page = (body, { status = 200, url, headers = {} } = {}) => {
  const res = new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=UTF-8', ...headers },
  });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
};

const html = (head) =>
  `<!DOCTYPE html><html><head>${head}<title>x</title></head><body></body></html>`;

describe('metaRefreshTarget', () => {
  const base = 'https://a.gov/page/';
  it('reads the target in any attribute order, letter case and quoting', () => {
    expect(
      metaRefreshTarget(
        html('<meta http-equiv="refresh" content="0; URL=https://b.gov/x/" />'),
        base,
      ),
    ).toBe('https://b.gov/x/');
    expect(
      metaRefreshTarget(html("<META CONTENT='5;url=/other' HTTP-EQUIV='Refresh'>"), base),
    ).toBe('https://a.gov/other');
    expect(
      metaRefreshTarget(html('<meta http-equiv=refresh content="0;url=\'next\'">'), base),
    ).toBe('https://a.gov/page/next');
  });

  it('finds nothing in a page without a refresh, or one that only reloads', () => {
    expect(metaRefreshTarget(html('<meta charset="utf-8">'), base)).toBeNull();
    expect(metaRefreshTarget(html('<meta http-equiv="refresh" content="30">'), base)).toBeNull();
  });
});

describe('checkLinks with page bodies', () => {
  const one = [{ url: 'https://a.gov/page/', files: ['f'] }];
  const run = (res, links = one) =>
    checkLinks(links, { fetch: async () => res, attempts: 1, retryDelayMs: 0 });

  it('fails a 200 page with a meta refresh to another host', async () => {
    const [result] = await run(
      page(html('<meta http-equiv="refresh" content="0; URL=https://board.gov/elections/" />'), {
        url: 'https://a.gov/page/',
      }),
    );
    expect(result).toMatchObject({
      status: 'fail',
      detail: 'meta refresh to https://board.gov/elections/',
    });
  });

  it('fails a meta refresh to another path on the same host', async () => {
    const [result] = await run(
      page(html('<meta http-equiv="refresh" content="0; url=/home/">'), {
        url: 'https://a.gov/page/',
      }),
    );
    expect(result).toMatchObject({ status: 'fail', detail: 'meta refresh to https://a.gov/home/' });
  });

  it('passes a refresh to the same page, or one that only reloads itself', async () => {
    const same = await run(
      page(html('<meta http-equiv="refresh" content="60; url=https://a.gov/page/#top">'), {
        url: 'https://a.gov/page/',
      }),
    );
    expect(same[0]).toMatchObject({ status: 'pass', detail: 'HTTP 200' });
    const reload = await run(
      page(html('<meta http-equiv="refresh" content="300">'), { url: 'https://a.gov/page/' }),
    );
    expect(reload[0]).toMatchObject({ status: 'pass', detail: 'HTTP 200' });
  });

  it('does not read a body that is not HTML', async () => {
    const pdf = new Response('<meta http-equiv="refresh" content="0; url=https://b.gov/">', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    });
    const [result] = await run(pdf);
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('reads at most 512 KB of a page', async () => {
    const late = page(
      `<html><head>${' '.repeat(600 * 1024)}<meta http-equiv="refresh" content="0; url=https://b.gov/"></head></html>`,
    );
    const [result] = await run(late);
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('skips a 403 bot challenge without retrying it', async () => {
    let calls = 0;
    const challenge = async () => {
      calls += 1;
      return page('<!DOCTYPE html><title>Just a moment...</title>', {
        status: 403,
        headers: { 'cf-mitigated': 'challenge', server: 'cloudflare' },
      });
    };
    const [result] = await checkLinks(one, { fetch: challenge, attempts: 3, retryDelayMs: 0 });
    expect(result).toMatchObject({
      status: 'skip',
      detail: 'bot challenge, check by hand in a browser (HTTP 403)',
    });
    expect(calls).toBe(1);
  });

  it('skips a 403 challenge page that names the Cloudflare challenge platform', async () => {
    const [result] = await run(
      page(
        '<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>',
        { status: 403 },
      ),
    );
    expect(result).toMatchObject({ status: 'skip' });
  });

  it('fails a plain 403', async () => {
    const [result] = await run(page('<html><body>Forbidden</body></html>', { status: 403 }));
    expect(result).toMatchObject({ status: 'fail', detail: 'HTTP 403' });
  });

  it('fails a config URL that refreshes away', async () => {
    const config = { countySiteUrl: 'https://board.gov/' };
    const [result] = await checkLinks(configLinks(config), {
      fetch: async () =>
        page(html('<meta http-equiv="refresh" content="0; url=https://elsewhere.gov/">'), {
          url: 'https://board.gov/',
        }),
      attempts: 1,
    });
    expect(result).toMatchObject({
      url: 'https://board.gov/',
      files: ['src/config/election.js (countySiteUrl)'],
      status: 'fail',
      detail: 'meta refresh to https://elsewhere.gov/',
    });
  });
});

describe('configLinks', () => {
  it('collects every Url, Source and sources entry, but not the service root', () => {
    const config = {
      serviceRoot: 'https://services.example.com/rest/services',
      layers: { precincts: 'x/FeatureServer/1' },
      sampleBallotUrlPattern: /^https:\/\/x\.gov\//,
      officialLookupUrl: 'https://lookup.gov/',
      countySiteUrl: 'https://board.gov/',
      earlyVoting: { sources: ['https://hours.gov/'], lastVerified: '2026-01-01' },
      electionDayHours: { sources: ['https://law.gov/a', 'https://board.gov/'] },
      electionDayPollingPlace: { sources: ['https://law.gov/b'], phoneSource: 'https://app.gov/' },
    };
    expect(configLinks(config)).toEqual([
      { url: 'https://lookup.gov/', files: ['src/config/election.js (officialLookupUrl)'] },
      {
        url: 'https://board.gov/',
        files: [
          'src/config/election.js (countySiteUrl)',
          'src/config/election.js (electionDayHours.sources)',
        ],
      },
      { url: 'https://hours.gov/', files: ['src/config/election.js (earlyVoting.sources)'] },
      { url: 'https://law.gov/a', files: ['src/config/election.js (electionDayHours.sources)'] },
      {
        url: 'https://law.gov/b',
        files: ['src/config/election.js (electionDayPollingPlace.sources)'],
      },
      {
        url: 'https://app.gov/',
        files: ['src/config/election.js (electionDayPollingPlace.phoneSource)'],
      },
    ]);
  });

  it('finds the county site and the lookup in the real config', async () => {
    const { default: election } = await import('../config/election.js');
    const urls = configLinks(election).map((l) => l.url);
    expect(urls).toContain(election.countySiteUrl);
    expect(urls).toContain(election.officialLookupUrl);
    expect(urls).not.toContain(election.serviceRoot);
  });
});

describe('writeSkipped', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skipped-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes one skipped URL per line, with the files that use it', async () => {
    const file = path.join(dir, 'skipped.txt');
    await writeSkipped(file, [
      { url: 'https://a.gov/', files: ['f1', 'f2'], status: 'skip', detail: 'd' },
      { url: 'https://b.gov/', files: ['f'], status: 'pass', detail: 'HTTP 200' },
    ]);
    expect(await readFile(file, 'utf8')).toBe('https://a.gov/ (f1, f2)\n');
  });

  it('writes an empty file when nothing was skipped', async () => {
    const file = path.join(dir, 'skipped.txt');
    await writeSkipped(file, []);
    expect(await readFile(file, 'utf8')).toBe('');
  });
});
