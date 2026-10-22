import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'wouter';
import App from './App.jsx';
import { shouldHydrate, startHydration } from './hydrate.js';
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
if (shouldHydrate(root, window.location.pathname)) {
  startHydration();
  hydrateRoot(root, app, options);
} else {
  root.replaceChildren();
  createRoot(root, options).render(app);
}
