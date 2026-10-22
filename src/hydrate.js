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
