// Google Analytics forced on for a test (#70), as src/test/analyticsPrivacy.test.jsx
// does: a stand-in window at the production origin, so every call the app
// makes lands in its dataLayer, past the real allowlist in ga.js.
import { startAnalytics } from '../analytics/index.js';
import { siteUrl } from '../config/site.js';

/**
 * Starts GA on a stand-in window. `events()` waits for ga.js and returns
 * every event sent but page views, as [name, params]; `calls()` returns every
 * dataLayer entry but gtag's `js` start time, a Date whose text (like
 * `12:00:38.500Z`) would match a coordinate needle by chance. Call `stop()`
 * after the test.
 */
export function trackEvents() {
  const win = {
    location: { origin: siteUrl, pathname: '/' },
    navigator: {},
    document: document.implementation.createHTMLDocument('stand-in'),
    addEventListener: () => {},
  };
  const stop = startAnalytics(win, 'G-TEST123');
  const calls = () =>
    (win.dataLayer ?? []).map((entry) => Array.from(entry)).filter(([command]) => command !== 'js');
  return {
    stop,
    calls,
    async events() {
      await vi.dynamicImportSettled();
      return calls()
        .filter(([command, name]) => command === 'event' && name !== 'page_view')
        .map(([, name, params]) => [name, params]);
    },
  };
}

/**
 * Clicks a link as a voter would and returns whether the app prevented its
 * default (it never should: an event never delays a link, #70). The test's
 * own listener, on the window, runs after the app's and stops jsdom from
 * navigating.
 * @param {(el: Element) => Promise<void>} click userEvent.click
 * @param {Element} link
 */
export async function pressLink(click, link) {
  let prevented = null;
  const onClick = (event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', onClick);
  try {
    await click(link);
  } finally {
    window.removeEventListener('click', onClick);
  }
  return prevented;
}
