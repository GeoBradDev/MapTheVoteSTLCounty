import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import election from '../config/election.js';
import referrals from '../config/referrals.js';
import { cityOnPath } from '../data/jurisdictions.js';
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

  // #89: on a City precinct's page, the way forward is the City's own lookup.
  it("links the City's lookup when a City precinct page throws", () => {
    render(
      <ErrorBoundary city={cityOnPath('/p/W01P12')}>
        <Broken />
      </ErrorBoundary>,
    );
    const link = screen.getByRole('link', { name: copy.officialLookupCity });
    expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/county/i);
  });

  it('finds the City only on a City precinct path', () => {
    expect(cityOnPath('/p/W01P12')?.id).toBe('city');
    for (const path of ['/p/CC007', '/p/W1P12', '/', '/p/W01P12/x', '/learn']) {
      expect(cityOnPath(path)).toBeUndefined();
    }
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
