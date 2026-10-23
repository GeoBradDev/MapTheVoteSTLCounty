// Lighthouse performance run (#27) on the production build: build first
// (`npm run build`), then `npm run test:perf`.
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
import { BASEMAP_STYLE_URL, BLANK_STYLE, CITY_CODE, CODE, fixtureBody } from './fixtures.js';

/** Lowest performance score allowed, 0 to 100. */
const MIN_SCORE = 90;

/** Largest Contentful Paint budget on simulated 4G, in ms. */
const MAX_LCP_MS = 2500;

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
const ROUTES = [
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

const RUNS = 3;
const PORT = 4174;
const REPORTS = new URL('../lighthouse-reports/', import.meta.url);

const CONFIG = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['performance'],
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
    throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 },
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
  const body = href === BASEMAP_STYLE_URL ? BLANK_STYLE : fixtureBody(href, form);
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

async function measure(browser, { path: route, shows, code = CODE }) {
  const page = await browser.newPage();
  try {
    const url = `http://localhost:${PORT}${route}`;
    const result = await lighthouse(url, { logLevel: 'error', output: 'html' }, CONFIG, page);
    const { lhr } = result;
    if (lhr.runtimeError) throw new Error(`${route}: ${lhr.runtimeError.message}`);
    const audit = (id) => lhr.audits[id].numericValue;
    return {
      score: Math.round(lhr.categories.performance.score * 100),
      lcp: audit('largest-contentful-paint'),
      fcp: audit('first-contentful-paint'),
      tbt: audit('total-blocking-time'),
      cls: audit('cumulative-layout-shift'),
      si: audit('speed-index'),
      shown: await page.evaluate(shows, code),
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
      const name = route.path === '/' ? 'home' : route.path.slice(1).replaceAll('/', '-');
      await writeFile(new URL(`${name}.html`, REPORTS), m.report);
      console.log(
        `${route.path}: performance ${m.score} (runs ${runs.map((r) => r.score).join(', ')}), ` +
          `LCP ${Math.round(m.lcp)} ms, FCP ${Math.round(m.fcp)} ms, ` +
          `TBT ${Math.round(m.tbt)} ms, CLS ${m.cls.toFixed(3)}, SI ${Math.round(m.si)} ms`,
      );
      if (!runs.every((r) => r.shown)) {
        failures.push(`${route.path}: a run ended without the page's content`);
      }
      if (!runs.every((r) => Number.isFinite(r.lcp))) {
        failures.push(`${route.path}: a run reported no LCP`);
      }
      if (m.score < MIN_SCORE)
        failures.push(`${route.path}: score ${m.score} is below ${MIN_SCORE}`);
      if (m.lcp >= MAX_LCP_MS) {
        failures.push(`${route.path}: LCP ${Math.round(m.lcp)} ms is not under ${MAX_LCP_MS} ms`);
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
