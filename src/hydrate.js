// Whether src/main.jsx hydrates the server-rendered markup in the root (#99)
// or renders the app fresh. Only markup rendered for this very path hydrates:
// the host can serve a pre-rendered file at another path (dist/index.html,
// the home page, is also /index.html), and hydrating the wrong page would
// leave its markup on screen until React gave up on it.
import { normalizePath } from './pageHead.js';

/**
 * @param {HTMLElement} root
 * @param {string} pathname The location's path, as the browser reports it.
 */
export function shouldHydrate(root, pathname) {
  const rendered = root.dataset.prerendered;
  if (!rendered || !root.hasChildNodes()) return false;
  return normalizePath(rendered) === normalizePath(pathname);
}

// True from a hydrated first load (#99) until the voter moves to another page.
let hydrating = false;

/** Called by src/main.jsx before it hydrates a pre-rendered page. */
export function startHydration() {
  hydrating = true;
}

/** Called by src/App.jsx on the first in-app navigation. */
export function endHydration() {
  hydrating = false;
}

/**
 * Moves focus (and with it the scroll position) to a page's heading on
 * arrival, so a screen reader announces the page. A pre-rendered page can be
 * read, scrolled and tabbed through before its script arrives: when hydrating
 * it, focus stays where the voter put it, and the page stays where the voter
 * scrolled it.
 * @param {HTMLElement | null} heading
 */
export function focusHeadingOnArrival(heading) {
  if (!heading) return;
  if (hydrating) {
    const focused = document.activeElement;
    if (window.scrollY > 0 || (focused && focused !== document.body)) return;
  }
  heading.focus();
}
