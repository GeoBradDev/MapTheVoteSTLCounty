// Google Analytics 4 page views, cookieless, with the precinct redacted (#69).
// src/analytics/ is the only app code that names Google, gtag or the
// dataLayer (src/test/analyticsOnly.test.js fails on any other). This file is
// in the first load and stays small; GA itself is ga.js, loaded on demand.
//
// - Off unless the measurement ID (src/config/site.js) is set, the page is on
//   the production origin and the browser does not send Global Privacy
//   Control: never on PR previews, localhost, vite preview, the e2e and
//   Lighthouse runs or tests.
// - Consent Mode defaults every storage and ad signal to denied, before
//   anything else, and nothing ever grants it: GA sets no cookies and keeps
//   nothing in the browser, so the site needs no consent banner.
// - Each page view is the route pattern (/p/:precinct, never a code), a fixed
//   title per page type (never document.title, which holds the code) and no
//   referrer. The same values are set for every later event, so GA's own
//   events never carry the real URL either.
// - ga.js and Google's script load after the load event, in idle time, so
//   they cost the first load nothing (#27). No inline script: the CSP has
//   script-src 'self'. Page views until then wait here, as paths.
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

/** @type {{ queue: string[], send: ((path: string) => void) | null, last: string | null } | null} */
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
  const session = { queue: [], send: null, last: null };
  active = session;
  const begin = () =>
    load().then(
      ({ startGa }) => {
        if (active !== session) return;
        session.send = startGa(win, id);
        session.queue.splice(0).forEach(session.send);
      },
      // ga.js could not load (offline, a new deploy): no page views, as if off.
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
 * re-render, StrictMode's second effect, or the app replacing /p/cc007 with
 * /p/CC007) is not a new one. Does nothing while GA is off.
 * @param {string} path
 */
export function pageView(path) {
  if (!active) return;
  const key = String(path).toLowerCase();
  if (key === active.last) return;
  active.last = key;
  if (active.send) active.send(path);
  else active.queue.push(path);
}
