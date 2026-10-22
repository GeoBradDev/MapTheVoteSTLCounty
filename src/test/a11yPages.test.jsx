// axe on the pages outside /learn (#26), rendered in the whole app: home, the
// early voting wait times page (#104), the privacy notice, the not-found page
// and a precinct code that is not found.
// learnA11y.test.jsx covers /learn. jsdom has no layout, so contrast is not
// checked here; the Playwright run in e2e/ checks every route in Chromium.
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from '../App.jsx';

beforeAll(() => {
  document.documentElement.lang = 'en';
  document.title = 'St. Louis County Voter Guide';
});

// The precinct page loads its precinct; nothing reaches the network.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function violations(path) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <App />
    </Router>,
  );
  await screen.findByRole('heading', { level: 1 });
  const results = await axe.run(document, { resultTypes: ['violations'] });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe('axe on the app pages', () => {
  it.each(['/', '/early-voting', '/privacy', '/nope', '/p/nope'])(
    'finds no violations on %s',
    async (path) => {
      expect(await violations(path)).toEqual([]);
    },
  );
});
