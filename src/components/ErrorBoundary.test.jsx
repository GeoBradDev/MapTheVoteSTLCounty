import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import election from '../config/election.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import { copy } from './errorBoundaryCopy.js';

function Broken() {
  throw new Error('7700 Fine Rd at 38.5,-90.3');
}

let errors;
beforeEach(() => {
  // React reports the caught error in tests; main.jsx turns that off in the app.
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe('ErrorBoundary (#18)', () => {
  it('shows its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('replaces a page that throws with a way forward, focusing its heading', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: copy.heading });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.body);
    expect(screen.getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.getByRole('button', { name: copy.reload })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.home })).toHaveAttribute('href', '/');
    expect(document.title).toBe(`${copy.heading} | St. Louis County Voter Guide`);
  });

  it('never shows the error text', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    for (const needle of ['7700', 'Fine', '38.5']) {
      expect(document.body.textContent).not.toContain(needle);
    }
  });

  it('is told by main.jsx not to log caught errors', () => {
    const main = readFileSync(path.resolve(import.meta.dirname, '../main.jsx'), 'utf8');
    expect(main).toMatch(/onCaughtError: \(\) => \{\}/);
  });
});
