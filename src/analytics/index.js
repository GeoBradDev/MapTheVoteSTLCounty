// Google Analytics 4 page views (#69) and voter action events (#70),
// cookieless, with the precinct redacted.
// src/analytics/ is the only app code that calls gtag, reads the dataLayer or
// names Google's analytics hosts (src/test/analyticsOnly.test.js fails on any other). This file is
// in the first load and stays small; GA itself is ga.js, loaded on demand.
//
// - Off unless the measurement ID (src/config/site.js) is set, the page is on
//   the production origin and the browser does not send Global Privacy
//   Control: the shipped build never loads it on PR previews, localhost,
//   vite preview, or the e2e and Lighthouse runs (only tests that pass their
//   own origin and ID, or e2e/analytics.e2e.js's own build, turn it on).
// - Consent Mode defaults every storage and ad signal to denied, before
//   anything else, and nothing ever grants it: GA sets no cookies and keeps
//   nothing in the browser, so the site needs no consent banner.
// - Each page view is the route pattern (/p/:precinct, never a code), a fixed
//   title per page type (never document.title, which holds the code) and no
//   referrer. The same values are set for every later event, so GA's own
//   events never carry the real URL either.
// - ga.js and Google's script load after the load event, in idle time, so
//   they cost the first load nothing (#27). No inline script: the CSP's
//   script-src allows only 'self' and Google's loader. Page views and events
//   until then wait here, as they were called.
// - Voter actions (#70) go through track() only, and ga.js sends only the
//   events, parameter names and values in its allowlist (EVENTS): fixed
//   labels, never an address, coordinates, precinct code, place name or URL.
//   The allowlist is in ga.js so it costs the first load nothing.
// Keep this file's imports to the config: importing src/i18n here once made
// the build split the topics into a chunk of their own, past the budget.
import { gaMeasurementId, siteUrl } from '../config/site.js';

/** The hosts GA uses, as the privacy notice and render.yaml's CSP name them. */
export const ANALYTICS_HOSTS = Object.freeze({
  loader: 'www.googletagmanager.com',
  collector: '*.google-analytics.com',
});

/** The longest GA waits for idle time after the load event. */
const IDLE_TIMEOUT_MS = 2_000;

/** Whether `id` is a GA4 measurement ID. The shipped one is empty (#69). */
export function analyticsEnabled(id = gaMeasurementId) {
  return /^G-[A-Z0-9]+$/.test(id);
}

/**
 * Whether GA may load: a measurement ID, the production origin exactly, and no
 * Global Privacy Control.
 * @param {{ id: string, origin?: string, gpc?: unknown }} options
 */
export function analyticsAllowed({ id, origin, gpc }) {
  return analyticsEnabled(id) && origin === siteUrl && gpc !== true;
}

/**
 * @typedef {{ page: (path: string) => void, event: (name: string, params?: object) => void }} Ga
 * @type {{ queue: [keyof Ga, ...unknown[]][], ga: Ga | null, last: string | null } | null}
 */
let active = null;

/**
 * Starts GA on `win` when analyticsAllowed(): after the load event, in idle
 * time, loads ga.js, which sets the consent defaults and adds Google's script.
 * @param {Window} win
 * @param {string} [id]
 * @param {() => Promise<typeof import('./ga.js')>} [load] ga.js (tests pass their own).
 * @returns {(() => void) | null} Stops it (tests), or null when GA stays off.
 */
export function startAnalytics(win, id = gaMeasurementId, load = () => import('./ga.js')) {
  const allowed = analyticsAllowed({
    id,
    origin: win.location?.origin,
    gpc: win.navigator?.globalPrivacyControl,
  });
  if (!allowed) return null;
  const session = { queue: [], ga: null, last: null };
  active = session;
  const begin = () =>
    load().then(
      ({ startGa }) => {
        if (active !== session) return;
        const ga = (session.ga = startGa(win, id));
        session.queue.splice(0).forEach(([kind, ...args]) => ga[kind](...args));
      },
      // ga.js could not load (offline, a new deploy): no page views or events, as if off.
      () => {},
    );
  const whenIdle = () =>
    win.requestIdleCallback
      ? win.requestIdleCallback(begin, { timeout: IDLE_TIMEOUT_MS })
      : begin();
  if (win.document.readyState === 'complete') whenIdle();
  else win.addEventListener('load', whenIdle, { once: true });
  return () => {
    if (active === session) active = null;
  };
}

/**
 * Sends a page view for `path`, once per navigation: the same path again (a
 * re-render, StrictMode's second effect, or the app replacing /p/cc007/ or
 * /p/%20cc007 with /p/CC007) is not a new one. Does nothing while GA is off.
 * @param {string} path
 */
export function pageView(path) {
  if (!active) return;
  // A precinct link compared as the app canonicalizes it (letter case,
  // spaces, a trailing slash), so its replace of the URL is not a second
  // page view. Any other path as it is.
  const text = String(path);
  const key = /^\/p\//i.test(text)
    ? text.replace(/\s+/g, '').replace(/\/$/, '').toLowerCase()
    : text;
  if (key === active.last) return;
  active.last = key;
  send('page', path);
}

function send(kind, ...args) {
  if (active.ga) active.ga[kind](...args);
  else active.queue.push([kind, ...args]);
}

/**
 * Counts a voter action (#70): `name` and `params` from the allowlist in
 * ga.js (anything else is dropped there, never sent). Call it from the
 * click itself, never waiting on it or preventing the default: it never
 * delays a link. Does nothing while GA is off.
 * @param {string} name
 * @param {Record<string, string>} [params]
 */
export function track(name, params) {
  if (active) send('event', name, params);
}
