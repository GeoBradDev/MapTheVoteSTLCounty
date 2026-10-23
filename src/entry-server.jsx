// The build's server render (#99). src/prerender/plugin.js loads this module in
// Node after the client build and writes each public page's static HTML from
// it. Only the public pages are rendered: precinct pages (/p/*) hold live data
// and stay client-rendered from the shell.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { Router } from 'wouter';
import App from './App.jsx';
import { loadAllTopics } from './features/learn/topics.js';
import { pageHead, prerenderPaths } from './pageHead.js';
import { renderPage } from './prerender/html.js';

export { prerenderPaths };

/**
 * Loads what the pages need before any renders: every topic's body, which the
 * browser loads on demand (#147). The pre-render awaits it first.
 */
export function prepare() {
  return loadAllTopics();
}

/**
 * The app's markup at `route`, as the browser's first render makes it, so it
 * hydrates without a mismatch (src/main.jsx renders the same tree).
 * @param {string} route
 */
export function render(route) {
  return renderToString(
    <StrictMode>
      <Router ssrPath={route}>
        <App />
      </Router>
    </StrictMode>,
  );
}

/**
 * The whole static page for `route`, from the built index.html.
 * @param {string} route One of prerenderPaths().
 * @param {string} template
 */
export function renderRoute(route, template) {
  const head = pageHead(route);
  if (!head) throw new Error(`No pre-rendered page for ${route}`);
  return renderPage(template, { path: route, head, html: render(route) });
}
