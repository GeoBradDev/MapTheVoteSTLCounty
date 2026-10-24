// Lighthouse performance run (#27) on the production build: build first
// (`npm run build`), then `npm run test:perf`.
//
// Every run also takes Lighthouse's SEO category (#98): each of its scored
// audits must pass, except the one a precinct page fails on purpose
// (SEO_EXPECTED_FAILURES), which must fail there, so the gate also proves the
// noindex is served.
//
// Each route is measured RUNS times with Lighthouse's mobile emulation at
// 360 x 640 (the Moto G4 Lighthouse used to emulate) on simulated slow 4G with
// a 4x CPU slowdown. The median run by score is compared with the budgets, and
// its HTML report goes to lighthouse-reports/. Exits 1 when a route misses a
// budget or does not show its content.
//
// No live service is called. Chromium resolves the county's ArcGIS host and
// the basemap host to a local HTTPS server and every other outside host to
// nothing. The local server answers the layers from the recorded fixtures
// (e2e/fixtures.js), gzipped as the county's service sends them, and the
// basemap style with a blank style. A real server, rather than answering
// inside the browser, keeps the connection setup and the compressed sizes
// that Lighthouse's network model needs.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import election from '../src/config/election.js';
import {
  AFTER_EARLY_VOTING_AT,
  BASEMAP_STYLE_URL,
  BLANK_STYLE,
  CITY_CODE,
  CODE,
  ELECTION_DAY_AT,
  fixtureBody,
  isBasemapStyle,
  WAITS_RECORDED_AT,
} from './fixtures.js';

/** Lowest performance score allowed, 0 to 100. */
const MIN_SCORE = 90;

/** Largest Contentful Paint budget on simulated 4G, in ms. */
const MAX_LCP_MS = 2500;

/**
 * The SEO audits a route fails on purpose, with the reason. Every other
 * scored SEO audit must pass on every run of every route.
 * @type {{ audit: string, applies: (path: string) => boolean, reason: string }[]}
 */
const SEO_EXPECTED_FAILURES = [
  {
    audit: 'is-crawlable',
    applies: (route) => route.startsWith('/p/'),
    reason:
      'precinct pages are noindex (owner decision on #98): their polling places are right ' +
      'only for the current election',
  },
];

/**
 * The pages the issue names: landing, results (fixture precinct) and a learn
 * page, the early voting wait times page (#104), and a City precinct's results
 * (#95). `code` is the precinct `shows` is given. `shows` checks, in the page, that the run measured the real content
 * and not the not-found page, an error or a loading state. On the results page
 * it also checks the heading (#81) and the precinct line under it, and content
 * built from the precinct and poll fields the app asks ArcGIS for: the
 * municipality, the districts, the sample ballot link and each
 * polling place's name and ZIP.
 */
const PAGES = [
  {
    path: '/',
    shows: () =>
      document.querySelector('h1')?.textContent === 'St. Louis Voter Guide' &&
      Boolean(document.querySelector('[role="combobox"]')),
  },
  {
    path: `/p/${CODE}`,
    shows: (code) => {
      const rows = [...document.querySelectorAll('ol[aria-label="Nearest polling places"] > li')];
      return (
        document.querySelector('h1')?.textContent === 'Where you can vote' &&
        (document.querySelector('h1')?.nextElementSibling?.textContent ?? '').startsWith(
          `Precinct ${code}`,
        ) &&
        !document.querySelector('[role="alert"]')?.textContent.trim() &&
        Boolean(document.querySelector('[data-testid="municipality"]')?.textContent.trim()) &&
        document.querySelectorAll('dl dd').length >= 3 &&
        Boolean(document.querySelector('a[href*="/sharing/rest/content/items/"]')) &&
        rows.length > 0 &&
        rows.every(
          (li) =>
            !/^Polling place\b/.test(li.querySelector('h3')?.textContent ?? '') &&
            /MO \d{5}/.test(li.querySelector('p')?.textContent ?? ''),
        )
      );
    },
  },
  {
    // A City precinct (#95): the City Board's Election Day rule, each nearest
    // polling place's real name, the districts card (#90) and the City Board's
    // sample ballot PDF for all precincts (#92).
    path: `/p/${CITY_CODE}`,
    code: CITY_CODE,
    shows: (code) => {
      const rows = [...document.querySelectorAll('ol[aria-label="Nearest polling places"] > li')];
      const main = document.querySelector('main')?.textContent ?? '';
      return (
        document.querySelector('h1')?.textContent === 'Where you can vote' &&
        (document.querySelector('h1')?.nextElementSibling?.textContent ?? '').startsWith(
          `Precinct ${code}`,
        ) &&
        !document.querySelector('[role="alert"]')?.textContent.trim() &&
        main.includes('The St. Louis City Board of Election Commissioners says:') &&
        main.includes('Missouri House District') &&
        Boolean(document.querySelector('a[href^="https://www.stlouis-mo.gov/"][href$=".pdf"]')) &&
        rows.length > 0 &&
        rows.every((li) => {
          const name = li.querySelector('h3')?.textContent ?? '';
          return name !== '' && !/^Polling place\b/.test(name);
        })
      );
    },
  },
  {
    // The wait times page (#104): its heading and every site's name. The live
    // counts depend on the clock, so they are not checked here, and once early
    // voting has ended (the real date, past the config's last day) the page
    // says so instead of listing sites.
    path: '/early-voting',
    shows: () => {
      const rows = [...document.querySelectorAll('ol[aria-labelledby="wait-sites-heading"] > li')];
      const ended = document.querySelector('main')?.textContent.includes('Early voting has ended.');
      return (
        document.querySelector('h1')?.textContent === 'Early voting wait times' &&
        (ended || rows.length > 0) &&
        rows.every((li) => {
          const name = li.querySelector('h3')?.textContent ?? '';
          return name !== '' && !/^Polling place\b/.test(name);
        })
      );
    },
  },
  {
    path: '/learn',
    shows: () =>
      document.querySelectorAll('h1').length === 1 &&
      document.querySelector('h1').textContent === 'How to vote',
  },
];

/**
 * The results pages' layout depends on the date: during early voting the
 * summary has an early voting part, and once early voting has closed its
 * sample ballot part moves up into the 360 x 640 view, where its intro is the
 * largest text, shown while the precinct loads (#27, #156). So each
 * results page is measured at a pinned clock in each state, today, not only
 * once the date comes: during early voting, the evening after it closes and
 * Election Day morning. The home page is measured at the same clocks: during
 * early voting and on Election Day it shows the line count dot map (#184),
 * whose box is reserved before the first paint, and the evening after early
 * voting closes it shows the map with every site closed. The other pages use
 * the real clock.
 */
const CLOCKS = [
  { name: 'early voting', at: WAITS_RECORDED_AT },
  { name: 'after early voting', at: AFTER_EARLY_VOTING_AT },
  { name: 'Election Day', at: ELECTION_DAY_AT },
];

const ROUTES = PAGES.flatMap((route) =>
  route.path.startsWith('/p/') || route.path === '/'
    ? CLOCKS.map((clock) => ({ ...route, clock, label: `${route.path} (${clock.name})` }))
    : [{ ...route, label: route.path }],
);

// Runs in the page before its scripts: moves Date to `at` (ms since the
// epoch), still ticking, so the app sees that day. Only Date: the timers and
// performance.now(), which Lighthouse's own measures use, are untouched.
function pinClock(at) {
  const RealDate = Date;
  const offset = at - RealDate.now();
  class PinnedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [RealDate.now() + offset]));
    }

    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = PinnedDate;
}

/** The simulated network's round trip time, in ms (CONFIG below). */
const RTT_MS = 150;

/**
 * How long the local server waits before it answers a GET or POST (a layer,
 * the basemap style or a 404), in ms: four simulated round trips, about what
 * a phone waits for a real host on a new connection (DNS, TCP, TLS, then the
 * request). Answering at once let the data arrive before the first frame
 * painted, so the run saw data driven content as the page's first paint and
 * Lighthouse counted the layers' connections toward LCP even for text that
 * needs no data (#156). The wait puts the answer well after the first frame
 * on any runner, as on a phone; Lighthouse's simulation counts it as server
 * time, so content that waits for data is measured as slower, never faster.
 * Well under the app's slow notice (3 s) and request timeout (8 s).
 */
const ANSWER_DELAY_MS = 4 * RTT_MS;

const RUNS = 3;
const PORT = 4174;
const REPORTS = new URL('../lighthouse-reports/', import.meta.url);

const CONFIG = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['performance', 'seo'],
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      disabled: false,
    },
    // Lighthouse's mobile defaults, written out: simulated slow 4G, 4x CPU.
    throttlingMethod: 'simulate',
    throttling: { rttMs: RTT_MS, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 },
  },
};

// A throwaway self-signed certificate for the local HTTPS server.
async function certificate(dir) {
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ].concat(['-keyout', key, '-out', cert]),
    { stdio: 'ignore' },
  );
  return { key: await readFile(key), cert: await readFile(cert) };
}

// A POST's form body, or null: the app sends a point query's parameters, its
// coordinates among them, in the body (#38), as the City districts card does
// (#90). Never logged.
async function formBody(request) {
  if (request.method !== 'POST') return null;
  let form = '';
  for await (const chunk of request) form += chunk;
  return form;
}

// Answers the county's and the City Board's layers and the basemap style; 404
// for anything else.
async function answer(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.writeHead(404).end();
    return;
  }
  const href = `https://${request.headers.host}${request.url}`;
  const form = await formBody(request);
  await new Promise((resolve) => setTimeout(resolve, ANSWER_DELAY_MS));
  const body = isBasemapStyle(href) ? BLANK_STYLE : fixtureBody(href, form);
  if (body === null) {
    response.writeHead(404).end();
    return;
  }
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  };
  const gzip = /\bgzip\b/.test(request.headers['accept-encoding'] ?? '');
  if (gzip) headers['content-encoding'] = 'gzip';
  response.writeHead(200, headers).end(gzip ? gzipSync(body) : body);
}

async function measure(browser, { path: route, shows, code = CODE, clock }) {
  const page = await browser.newPage();
  try {
    if (clock) await page.evaluateOnNewDocument(pinClock, clock.at.getTime());
    const url = `http://localhost:${PORT}${route}`;
    const result = await lighthouse(url, { logLevel: 'error', output: 'html' }, CONFIG, page);
    const { lhr } = result;
    if (lhr.runtimeError) throw new Error(`${route}: ${lhr.runtimeError.message}`);
    const audit = (id) => lhr.audits[id].numericValue;
    // The scored SEO audits that did not pass, an audit that errored (null
    // score) among them; manual and not-applicable ones also have a null
    // score and are skipped.
    const seoFailed = lhr.categories.seo.auditRefs
      .filter((ref) => ref.weight > 0)
      .map((ref) => lhr.audits[ref.id])
      .filter((a) => a.scoreDisplayMode === 'error' || (a.score !== null && a.score < 1))
      .map((a) => a.id);
    return {
      score: Math.round(lhr.categories.performance.score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
      seoFailed,
      lcp: audit('largest-contentful-paint'),
      fcp: audit('first-contentful-paint'),
      tbt: audit('total-blocking-time'),
      cls: audit('cumulative-layout-shift'),
      si: audit('speed-index'),
      shown: await page.evaluate(shows, code),
      // The pinned clock held through Lighthouse's navigation: within a
      // minute of `at`, as the page's own Date sees it.
      pinned: clock
        ? Math.abs((await page.evaluate(() => Date.now())) - clock.at.getTime()) < 60_000
        : true,
      report: result.report,
    };
  } finally {
    await page.close();
  }
}

// The median run by score, and the median LCP of all runs, which can differ
// when scores tie.
function median(runs) {
  const middle = Math.floor(runs.length / 2);
  const run = [...runs].sort((a, b) => a.score - b.score)[middle];
  const lcp = runs.map((r) => r.lcp).sort((a, b) => a - b)[middle];
  return { ...run, lcp };
}

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mapthevote-lighthouse-'));
  const fixtures = createServer(await certificate(tmp), answer);
  await new Promise((resolve) => fixtures.listen(0, '127.0.0.1', resolve));
  const local = `127.0.0.1:${fixtures.address().port}`;
  const hosts = [new URL(election.serviceRoot).hostname, new URL(BASEMAP_STYLE_URL).hostname];
  const rules = [...hosts.map((h) => `MAP ${h} ${local}`), 'MAP * ~NOTFOUND', 'EXCLUDE localhost'];

  const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
    // No sandbox, as Playwright launches Chromium by default: CI runners can
    // block the user namespaces Chromium's sandbox needs.
    args: [
      `--host-resolver-rules=${rules.join(', ')}`,
      '--ignore-certificate-errors',
      '--no-sandbox',
    ],
  });
  await mkdir(REPORTS, { recursive: true });
  const failures = [];
  try {
    for (const route of ROUTES) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) runs.push(await measure(browser, route));
      const m = median(runs);
      const base = route.path === '/' ? 'home' : route.path.slice(1).replaceAll('/', '-');
      const name = route.clock ? `${base}-${route.clock.name.replaceAll(' ', '-')}` : base;
      await writeFile(new URL(`${name}.html`, REPORTS), m.report);
      console.log(
        `${route.label}: performance ${m.score} (runs ${runs.map((r) => r.score).join(', ')}), ` +
          `LCP ${Math.round(m.lcp)} ms, FCP ${Math.round(m.fcp)} ms, ` +
          `TBT ${Math.round(m.tbt)} ms, CLS ${m.cls.toFixed(3)}, SI ${Math.round(m.si)} ms, ` +
          `SEO ${m.seo}`,
      );
      const expected = SEO_EXPECTED_FAILURES.filter((e) => e.applies(route.path)).map(
        (e) => e.audit,
      );
      const seoFailures = new Set();
      for (const run of runs) {
        const unexpected = run.seoFailed.filter((id) => !expected.includes(id));
        const missing = expected.filter((id) => !run.seoFailed.includes(id));
        if (unexpected.length) {
          seoFailures.add(`${route.label}: SEO audits failed: ${unexpected.join(', ')}`);
        }
        if (missing.length) {
          seoFailures.add(
            `${route.label}: SEO audits passed that should fail: ${missing.join(', ')}`,
          );
        }
      }
      failures.push(...seoFailures);
      if (!runs.every((r) => r.shown)) {
        failures.push(`${route.label}: a run ended without the page's content`);
      }
      if (!runs.every((r) => r.pinned)) {
        failures.push(`${route.label}: a run's page did not see the pinned clock`);
      }
      if (!runs.every((r) => Number.isFinite(r.lcp))) {
        failures.push(`${route.label}: a run reported no LCP`);
      }
      if (m.score < MIN_SCORE)
        failures.push(`${route.label}: score ${m.score} is below ${MIN_SCORE}`);
      if (m.lcp >= MAX_LCP_MS) {
        failures.push(`${route.label}: LCP ${Math.round(m.lcp)} ms is not under ${MAX_LCP_MS} ms`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
    fixtures.close();
    await rm(tmp, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error(`FAIL\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('PASS');
  }
}

await main();
