// Google Analytics itself (#69), loaded on demand by src/analytics/index.js
// only when analytics may run, after the page's load event, so none of it is
// in the first load (#27). See index.js for the rules.
import { siteUrl } from '../config/site.js';
import { DEFAULT_LOCALE, getTopic } from '../features/learn/topics.js';
import { ANALYTICS_HOSTS } from './index.js';

export const LOADER_URL = `https://${ANALYTICS_HOSTS.loader}/gtag/js`;

const list = (...values) => Object.freeze(values);

/**
 * The voter actions counted (#70): for each event, its parameter names and
 * each one's allowed values. Fixed labels only: never an address,
 * coordinates, a precinct code, a place's name, a district, a distance, a
 * URL or anything typed. A new event, parameter or value is added here and
 * to the privacy notice in the same change (README, Google Analytics).
 */
export const EVENTS = Object.freeze({
  lookup_result: Object.freeze({
    source: list('address', 'location'),
    outcome: list(
      'precinct',
      'no_precinct',
      'city_referral',
      'out_of_area',
      'no_match',
      'unavailable',
      'failed',
      'offline',
      'denied',
      'timeout',
      'coarse',
    ),
  }),
  sample_ballot_open: Object.freeze({}),
  directions_open: Object.freeze({
    card: list('polls', 'early_voting', 'wait_times'),
    provider: list('google', 'apple'),
  }),
  official_lookup_open: Object.freeze({
    card: list(
      'polls',
      'early_voting',
      'sample_ballot',
      'districts',
      'lookup_error',
      'precinct_error',
      'wait_times',
      'error_screen',
      'referral',
      'status',
    ),
  }),
  share: Object.freeze({ method: list('share_sheet', 'clipboard', 'manual') }),
  retry: Object.freeze({
    where: list('lookup', 'precinct', 'polls', 'early_voting', 'districts', 'wait_times'),
  }),
});

/**
 * The parameters of an allowed event, keeping only allowed names with an
 * allowed string value; null for an event not in EVENTS.
 * @param {unknown} name
 * @param {unknown} params
 * @returns {Record<string, string> | null}
 */
export function eventParams(name, params) {
  if (typeof name !== 'string' || !Object.hasOwn(EVENTS, name)) return null;
  const allowed = EVENTS[name];
  const clean = {};
  if (params && typeof params === 'object') {
    for (const key of Object.keys(allowed)) {
      const value = Object.hasOwn(params, key) ? params[key] : undefined;
      if (typeof value === 'string' && allowed[key].includes(value)) clean[key] = value;
    }
  }
  return clean;
}

/** A fixed, English name per page type, never a page's own title. */
export const PAGE_TITLES = Object.freeze({
  '/': 'Home',
  '/p/:precinct': 'Precinct results',
  '/learn': 'How to vote',
  '/learn/:topic': 'How to vote topic',
  '/early-voting': 'Early voting wait times',
  '/privacy': 'Privacy',
  '/not-found': 'Not found',
});

const STATIC_ROUTES = new Set(['/', '/learn', '/early-voting', '/privacy']);
const PRECINCT_PAGE = /^\/p\/[^/]+\/?$/i;
const TOPIC_PAGE = /^\/learn\/([^/]+)$/i;

/**
 * The route a path is reported as: the pattern of the page the app shows for
 * it, matched as wouter matches (any letter case, one optional trailing
 * slash). Every precinct page (one path segment after /p/, a code or not)
 * is /p/:precinct; a topic keeps its id (public content) only when it is a
 * topic (every topic exists in English, DEFAULT_LOCALE); anything else is
 * /not-found. No query string or hash.
 * @param {string} path
 */
export function routePattern(path) {
  const pathOnly = String(path).split(/[?#]/)[0];
  if (PRECINCT_PAGE.test(pathOnly)) return '/p/:precinct';
  // One trailing slash only, as wouter matches: // and /learn// are not found.
  const trimmed = /[^/]\/$/.test(pathOnly) ? pathOnly.slice(0, -1) : pathOnly;
  const lower = trimmed.toLowerCase();
  if (STATIC_ROUTES.has(lower)) return lower;
  const topic = TOPIC_PAGE.exec(trimmed)?.[1];
  if (topic && getTopic(topic, DEFAULT_LOCALE)) return `/learn/${topic}`;
  return '/not-found';
}

/** @param {string} pattern A routePattern() result. */
export function pageTitleFor(pattern) {
  return PAGE_TITLES[pattern] ?? PAGE_TITLES['/learn/:topic'];
}

function hitFor(path) {
  const pattern = routePattern(path);
  return {
    page_location: `${siteUrl}${pattern}`,
    page_title: pageTitleFor(pattern),
    page_referrer: '',
  };
}

/**
 * Sets up GA on `win`: the consent defaults first, the config, then Google's
 * script. The caller has checked that analytics may run.
 * @param {Window} win
 * @param {string} id The measurement ID.
 * @returns {{ page: (path: string) => void, event: (name: string, params?: object) => void }}
 *   `page` sends one page view for `path`; `event` sends an allowed event
 *   (EVENTS) with only its allowed parameters, and drops anything else.
 */
export function startGa(win, id) {
  const layer = (win.dataLayer = win.dataLayer || []);
  // gtag.js reads each entry as an arguments object, so this is not (...args).
  const gtag = function gtag() {
    layer.push(arguments);
  };
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date());
  // The page fields go in set, never config: gtag ranks event over config
  // over set, so a config value would outrank every later set and GA's own
  // events would keep reporting the first page.
  gtag('set', hitFor(win.location.pathname));
  gtag('config', id, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = win.document.createElement('script');
  script.async = true;
  script.src = `${LOADER_URL}?id=${encodeURIComponent(id)}`;
  win.document.head.append(script);
  return {
    page(path) {
      const hit = hitFor(path);
      gtag('set', hit);
      gtag('event', 'page_view', hit);
    },
    // The page fields come from set, so an event carries the redacted page.
    event(name, params) {
      const clean = eventParams(name, params);
      if (clean) gtag('event', name, clean);
    },
  };
}
