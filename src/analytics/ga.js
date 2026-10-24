// Google Analytics itself (#69), loaded on demand by src/analytics/index.js
// only when analytics may run, after the page's load event, so none of it is
// in the first load (#27). See index.js for the rules.
import { siteUrl } from '../config/site.js';
import { DEFAULT_LOCALE, getTopic } from '../features/learn/topics.js';
import { ANALYTICS_HOSTS } from './index.js';

export const LOADER_URL = `https://${ANALYTICS_HOSTS.loader}/gtag/js`;

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
 * @returns {(path: string) => void} Sends one page view for `path`.
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
  return (path) => {
    const hit = hitFor(path);
    gtag('set', hit);
    gtag('event', 'page_view', hit);
  };
}
