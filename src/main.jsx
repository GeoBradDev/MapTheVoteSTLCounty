import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'wouter';
import App from './App.jsx';
import { loadForHydration, shouldHydrate, startHydration } from './hydrate.js';
import { linkManifest } from './linkManifest.js';
import './index.css';

// The same tree src/entry-server.jsx renders at build time (#99), so a
// pre-rendered page hydrates without a mismatch. Router takes the browser's
// location here; the server passes the path instead.
const app = (
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
);

// An error caught by the app's error boundary (#18) is not logged: its text
// could hold what the page had, and the app logs nothing (#20).
const options = { onCaughtError: () => {} };
const root = document.getElementById('root');

// A public page arrives pre-rendered (#99) and is hydrated in place. Every
// other page (a precinct, an unknown path) arrives as the empty shell, and
// markup rendered for another path is replaced, not hydrated.
// A topic page's body loads on demand (#147), so it is loaded first: the
// pre-rendered page stays on screen meanwhile, and the first render matches it.
// If it cannot load, the pre-rendered page stays as it is, a plain page whose
// links still work, rather than giving up the text the voter already has.
function renderFresh() {
  root.replaceChildren();
  createRoot(root, options).render(app);
}

if (shouldHydrate(root, window.location.pathname)) {
  loadForHydration(window.location.pathname).then(
    () => {
      startHydration();
      hydrateRoot(root, app, options);
    },
    () => {},
  );
} else {
  renderFresh();
}

// Installable (#25): the manifest, well after the page has loaded.
linkManifest(document, window);
