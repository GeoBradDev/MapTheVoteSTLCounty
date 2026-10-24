// Google Analytics (#69): cookieless page views with the precinct redacted.
// Every test passes its own window, ID and origin, so GA is forced on here
// only; the app's own window (localhost) never loads it.
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { gaMeasurementId, siteUrl } from '../config/site.js';
import { getTopics } from '../features/learn/topics.js';
import { LOADER_URL, pageTitleFor, PAGE_TITLES, routePattern } from './ga.js';
import {
  analyticsAllowed,
  analyticsEnabled,
  ANALYTICS_HOSTS,
  pageView,
  startAnalytics,
} from './index.js';

const ID = 'G-TEST123';
const TOPIC = getTopics()[0].id;

// A window at the production origin, or another, with load and idle under
// the test's control.
function fakeWindow({
  origin = siteUrl,
  path = '/',
  gpc,
  complete = true,
  idle = true,
  title = 'Precinct CC007',
} = {}) {
  const listeners = {};
  const idles = [];
  const doc = document.implementation.createHTMLDocument(title);
  Object.defineProperty(doc, 'readyState', { value: complete ? 'complete' : 'loading' });
  const win = {
    location: { origin, pathname: path, href: `${origin}${path}?q=7700#x` },
    navigator: gpc === undefined ? {} : { globalPrivacyControl: gpc },
    document: doc,
    addEventListener: vi.fn((type, fn) => {
      listeners[type] = fn;
    }),
  };
  if (idle) win.requestIdleCallback = vi.fn((fn) => idles.push(fn));
  return {
    win,
    fire: (type) => listeners[type]?.(),
    // Runs the idle callbacks, then waits for ga.js to load.
    runIdle: async () => {
      idles.splice(0).forEach((fn) => fn());
      await vi.dynamicImportSettled();
    },
    scripts: () => [...doc.querySelectorAll('script')].map((s) => s.getAttribute('src')),
    calls: () => (win.dataLayer ?? []).map((entry) => Array.from(entry)),
  };
}

let stop;
afterEach(() => {
  stop?.();
  stop = null;
});

function start(options, id = ID, load = undefined) {
  const fake = fakeWindow(options);
  stop = startAnalytics(fake.win, id, load);
  return fake;
}

// GA started and ga.js loaded: the consent default, set and config sent.
async function started(options) {
  const fake = start(options);
  await fake.runIdle();
  expect(fake.calls().length).toBeGreaterThan(0);
  return fake;
}

describe('routePattern', () => {
  it.each([
    ['/', '/'],
    ['/p/CC007', '/p/:precinct'],
    ['/p/cc007', '/p/:precinct'],
    ['/p/CC007/', '/p/:precinct'],
    ['/P/CC007', '/p/:precinct'],
    ['/p/W01P12', '/p/:precinct'],
    ['/p/w01p12', '/p/:precinct'],
    ['/p/7700 Fine Rd', '/p/:precinct'],
    ['/p/38.512345,-90.312345', '/p/:precinct'],
    ['/learn', '/learn'],
    ['/learn/', '/learn'],
    ['/LEARN', '/learn'],
    [`/learn/${TOPIC}`, `/learn/${TOPIC}`],
    [`/learn/${TOPIC}/`, `/learn/${TOPIC}`],
    ['/learn/7700-fine-rd', '/not-found'],
    ['/early-voting', '/early-voting'],
    ['/early-voting/', '/early-voting'],
    ['/privacy', '/privacy'],
    ['/nope', '/not-found'],
    ['/7700 Fine Rd, Saint Louis', '/not-found'],
    ['/p/', '/not-found'],
    ['/p/CC007/extra', '/not-found'],
    ['/learn//', '/not-found'],
  ])('reports %s as %s', (path, pattern) => {
    expect(routePattern(path)).toBe(pattern);
  });

  it('drops any query string or hash', () => {
    expect(routePattern('/p/CC007?address=7700#38.51')).toBe('/p/:precinct');
    expect(routePattern('/?q=7700+Fine')).toBe('/');
    expect(routePattern('/privacy#x')).toBe('/privacy');
  });

  // Every route the app has, with an example path, maps to a pattern of its
  // own: a new route without one would be reported as not found.
  it('has a pattern for every route in src/App.jsx', () => {
    const app = readFileSync(nodePath.join(import.meta.dirname, '../App.jsx'), 'utf8');
    const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
    expect(routes.length).toBeGreaterThan(5);
    for (const route of routes) {
      const example = route.replace(':precinct', 'CC007').replace(':topic', TOPIC);
      expect(routePattern(example), route).not.toBe('/not-found');
    }
  });

  it('gives every pattern a fixed title of its own', () => {
    expect(pageTitleFor('/p/:precinct')).toBe(PAGE_TITLES['/p/:precinct']);
    expect(pageTitleFor(`/learn/${TOPIC}`)).toBe(PAGE_TITLES['/learn/:topic']);
    for (const pattern of ['/', '/learn', '/early-voting', '/privacy', '/not-found']) {
      expect(pageTitleFor(pattern)).toBe(PAGE_TITLES[pattern]);
    }
    expect(new Set(Object.values(PAGE_TITLES)).size).toBe(Object.keys(PAGE_TITLES).length);
    for (const title of Object.values(PAGE_TITLES)) expect(title).not.toMatch(/CC007|\d/);
  });
});

describe('analyticsAllowed', () => {
  it('needs the ID, the production origin and no Global Privacy Control', () => {
    expect(analyticsAllowed({ id: ID, origin: siteUrl })).toBe(true);
    expect(analyticsAllowed({ id: ID, origin: siteUrl, gpc: false })).toBe(true);
    expect(analyticsAllowed({ id: '', origin: siteUrl })).toBe(false);
    expect(analyticsAllowed({ id: 'UA-1234-1', origin: siteUrl })).toBe(false);
    expect(analyticsAllowed({ id: ID, origin: siteUrl, gpc: true })).toBe(false);
    for (const origin of [
      'http://localhost:4173',
      'http://localhost:5173',
      'https://mapthevote-stl-pr-12.onrender.com',
      'https://www.mapthevotestl.com',
      'http://mapthevotestl.com',
      undefined,
    ]) {
      expect(analyticsAllowed({ id: ID, origin }), origin).toBe(false);
    }
  });

  // It ships empty (owner decision on #69); the owner sets it later, and
  // this holds either way: an ID that is set must be a GA4 one.
  it('follows the measurement ID in the config, empty or a G- ID', () => {
    expect(gaMeasurementId === '' || analyticsEnabled(gaMeasurementId)).toBe(true);
    expect(analyticsEnabled()).toBe(gaMeasurementId !== '');
    expect(analyticsEnabled('')).toBe(false);
    expect(analyticsEnabled(ID)).toBe(true);
  });
});

describe('startAnalytics', () => {
  it.each([
    ['an empty ID', {}, ''],
    ['a preview origin', { origin: 'https://mapthevote-stl-pr-3.onrender.com' }, ID],
    ['localhost', { origin: 'http://localhost:4173' }, ID],
    ['Global Privacy Control', { gpc: true }, ID],
  ])('loads nothing with %s', async (_, options, id) => {
    const load = vi.fn(() => import('./ga.js'));
    const fake = start(options, id, load);
    expect(stop).toBeNull();
    fake.fire('load');
    await fake.runIdle();
    pageView('/p/CC007');
    expect(load).not.toHaveBeenCalled();
    expect(fake.win.dataLayer).toBeUndefined();
    expect(fake.scripts()).toEqual([]);
  });

  it('sets every consent default to denied before anything else', async () => {
    const fake = await started();
    expect(fake.calls()[0]).toEqual([
      'consent',
      'default',
      {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ]);
  });

  it('turns off its own page views, Google signals and ad personalization', async () => {
    const fake = await started({ path: '/p/CC007' });
    const config = fake.calls().find(([command]) => command === 'config');
    expect(config).toEqual([
      'config',
      ID,
      {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ]);
  });

  // gtag ranks event over config over set: a page field in config would
  // outrank every later set, so GA's own events would keep the first page.
  it('sets the redacted page with set, before config, and never in config', async () => {
    const fake = await started({ path: '/p/CC007' });
    const commands = fake.calls().map(([command]) => command);
    expect(commands.indexOf('set')).toBeLessThan(commands.indexOf('config'));
    expect(fake.calls().find(([command]) => command === 'set')).toEqual([
      'set',
      {
        page_location: `${siteUrl}/p/:precinct`,
        page_title: PAGE_TITLES['/p/:precinct'],
        page_referrer: '',
      },
    ]);
    for (const [command, , params] of fake.calls()) {
      if (command === 'config') expect(params).not.toHaveProperty('page_location');
    }
  });

  it('never grants consent', async () => {
    const fake = await started({ path: '/p/CC007' });
    pageView('/p/CC007');
    pageView('/learn');
    const consent = fake.calls().filter(([command]) => command === 'consent');
    expect(consent).toHaveLength(1);
    expect(JSON.stringify(fake.calls())).not.toContain('granted');
  });

  it('loads GA and the loader only after the load event, in idle time, once', async () => {
    const load = vi.fn(() => import('./ga.js'));
    const fake = start({ complete: false }, ID, load);
    pageView('/');
    await fake.runIdle();
    expect(load).not.toHaveBeenCalled();
    expect(fake.win.dataLayer).toBeUndefined();
    fake.fire('load');
    expect(load).not.toHaveBeenCalled();
    expect(fake.scripts()).toEqual([]);
    await fake.runIdle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(fake.scripts()).toEqual([`${LOADER_URL}?id=${ID}`]);
    const [script] = fake.win.document.querySelectorAll('script');
    expect(script.async).toBe(true);
    expect(fake.win.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), {
      once: true,
    });
  });

  it('bounds the idle wait with a timeout', () => {
    const fake = start();
    expect(fake.win.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: expect.any(Number),
    });
    expect(fake.win.requestIdleCallback.mock.calls[0][1].timeout).toBeLessThanOrEqual(5_000);
  });

  it('loads without idle time where the browser has none', async () => {
    const fake = start({ idle: false });
    await vi.dynamicImportSettled();
    expect(fake.scripts()).toEqual([`${LOADER_URL}?id=${ID}`]);
  });

  it('sends nothing and throws nothing when ga.js cannot load', async () => {
    const fake = start({}, ID, () => Promise.reject(new Error('offline')));
    pageView('/');
    await fake.runIdle();
    await Promise.resolve();
    expect(fake.win.dataLayer).toBeUndefined();
    expect(fake.scripts()).toEqual([]);
  });

  it('loads from Google, the one host the notice names for the loader', () => {
    expect(new URL(LOADER_URL).host).toBe(ANALYTICS_HOSTS.loader);
    expect(ANALYTICS_HOSTS.collector).toBe('*.google-analytics.com');
  });
});

describe('pageView', () => {
  const pageViews = (fake) => fake.calls().filter(([, name]) => name === 'page_view');

  it('sends the redacted location, a fixed title and no referrer, and sets them for later events', async () => {
    const fake = await started({ path: '/p/W01P12' });
    pageView('/p/W01P12');
    const hit = {
      page_location: `${siteUrl}/p/:precinct`,
      page_title: PAGE_TITLES['/p/:precinct'],
      page_referrer: '',
    };
    expect(fake.calls().slice(-2)).toEqual([
      ['set', hit],
      ['event', 'page_view', hit],
    ]);
  });

  it('sends one page view per navigation, not one per render', async () => {
    const fake = start();
    // Sent before ga.js arrives: queued, then sent in order.
    pageView('/');
    pageView('/');
    await fake.runIdle();
    pageView('/');
    pageView('/p/cc007');
    // The app replaces a lowercase code with the upper case URL.
    pageView('/p/CC007');
    // As the app replaces a code with spaces or a trailing slash (#69 review).
    pageView('/p/cc007/');
    pageView('/p/ cc007 ');
    pageView('/p/CC007');
    pageView(`/learn/${TOPIC}`);
    pageView('/');
    expect(pageViews(fake).map(([, , hit]) => hit.page_location)).toEqual([
      `${siteUrl}/`,
      `${siteUrl}/p/:precinct`,
      `${siteUrl}/learn/${TOPIC}`,
      `${siteUrl}/`,
    ]);
  });

  // Only precinct links are canonicalized by the app: another path in a new
  // letter case is a new page (a topic id is case-sensitive).
  it('counts another path in a new letter case as a new page', async () => {
    const fake = await started();
    pageView(`/learn/${TOPIC}`);
    pageView(`/learn/${TOPIC.toUpperCase()}`);
    expect(pageViews(fake).map(([, , hit]) => hit.page_location)).toEqual([
      `${siteUrl}/learn/${TOPIC}`,
      `${siteUrl}/not-found`,
    ]);
  });

  it('never sends a precinct code, a query string, a hash or the page title', async () => {
    const fake = await started({
      path: '/p/CC007',
      title: 'Precinct CC007 | St. Louis Voter Guide',
    });
    for (const path of ['/p/CC007?a=7700#b', '/p/w01p12', '/p/CC007/', '/learn/CC007', '/CC007']) {
      pageView(path);
    }
    const sent = JSON.stringify(fake.calls());
    expect(sent).not.toMatch(/CC007|W01P12|w01p12|7700|[?#]/);
    expect(sent).not.toContain(fake.win.document.title);
  });

  it('does nothing before analytics starts', () => {
    expect(() => pageView('/')).not.toThrow();
  });
});
