// Lighthouse performance run (#27) on the production build: build first
// (`npm run build`), then `npm run test:perf`.
//
// Each route is measured RUNS times with Lighthouse's mobile emulation at
// 360 x 640 (the Moto G4 Lighthouse used to emulate) on simulated slow 4G with
// a 4x CPU slowdown. The median run by score is compared with the budgets, and
// its HTML report goes to lighthouse-reports/. Like the accessibility run, the
// county's layers come from the recorded fixtures (e2e/fixtures.js), the map
// gets a blank basemap style, and every other outside request is blocked, so no
// live service can fail a pull request. Exits 1 when a route misses a budget.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { BASEMAP_STYLE_URL, BLANK_STYLE, CODE, fixtureBody } from './fixtures.js';

/** The pages the issue names: landing, results (fixture precinct), a learn page. */
const ROUTES = ['/', `/p/${CODE}`, '/learn'];

/** Lowest performance score allowed, 0 to 100. */
const MIN_SCORE = 90;

/** Largest Contentful Paint budget on simulated 4G, in ms. */
const MAX_LCP_MS = 2500;

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
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.56,
      uploadThroughputKbps: 675,
    },
  },
};

// Answers outside requests from the fixtures and blocks the rest.
async function answerFromFixtures(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const href = request.url();
    if (new URL(href).hostname === 'localhost') return request.continue();
    const headers = { 'access-control-allow-origin': '*' };
    const body = href === BASEMAP_STYLE_URL ? BLANK_STYLE : fixtureBody(href);
    if (body === null) return request.abort();
    return request.respond({ status: 200, contentType: 'application/json', headers, body });
  });
}

async function measure(browser, url) {
  const page = await browser.newPage();
  try {
    await answerFromFixtures(page);
    const result = await lighthouse(url, { logLevel: 'error', output: 'html' }, CONFIG, page);
    const { lhr } = result;
    if (lhr.runtimeError) throw new Error(`${url}: ${lhr.runtimeError.message}`);
    const audit = (id) => lhr.audits[id].numericValue;
    return {
      score: Math.round(lhr.categories.performance.score * 100),
      lcp: audit('largest-contentful-paint'),
      fcp: audit('first-contentful-paint'),
      tbt: audit('total-blocking-time'),
      cls: audit('cumulative-layout-shift'),
      si: audit('speed-index'),
      report: result.report,
    };
  } finally {
    await page.close();
  }
}

function median(runs) {
  return [...runs].sort((a, b) => a.score - b.score)[Math.floor(runs.length / 2)];
}

async function main() {
  const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
  await mkdir(REPORTS, { recursive: true });
  const failures = [];
  try {
    for (const route of ROUTES) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) {
        runs.push(await measure(browser, `http://localhost:${PORT}${route}`));
      }
      const m = median(runs);
      const name = route === '/' ? 'home' : route.slice(1).replaceAll('/', '-');
      await writeFile(new URL(`${name}.html`, REPORTS), m.report);
      console.log(
        `${route}: performance ${m.score} (runs ${runs.map((r) => r.score).join(', ')}), ` +
          `LCP ${Math.round(m.lcp)} ms, FCP ${Math.round(m.fcp)} ms, ` +
          `TBT ${Math.round(m.tbt)} ms, CLS ${m.cls.toFixed(3)}, SI ${Math.round(m.si)} ms`,
      );
      if (m.score < MIN_SCORE) failures.push(`${route}: score ${m.score} is below ${MIN_SCORE}`);
      if (m.lcp >= MAX_LCP_MS) {
        failures.push(`${route}: LCP ${Math.round(m.lcp)} ms is not under ${MAX_LCP_MS} ms`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failures.length) {
    console.error(`FAIL\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('PASS');
  }
}

await main();
