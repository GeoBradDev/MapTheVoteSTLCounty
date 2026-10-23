import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import election from '../config/election.js';
import referrals from '../config/referrals.js';
import { jurisdictionOnPath } from '../data/jurisdictions.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import { copy } from './errorBoundaryCopy.js';
import { copy as lookupsCopy } from './officialLookupsCopy.js';

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
    // No precinct page, so no jurisdiction (#93): both boards' lookups.
    expect(screen.getByRole('link', { name: lookupsCopy.county })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.getByRole('link', { name: lookupsCopy.city })).toHaveAttribute(
      'href',
      referrals.stlCityLookup.url,
    );
    expect(screen.getByRole('button', { name: copy.reload })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.home })).toHaveAttribute('href', '/');
    expect(document.title).toBe(`${copy.heading} | St. Louis Voter Guide`);
  });

  // #89: on a City precinct's page, the way forward is the City's own lookup.
  // #93: on a County precinct's page, the County's lookup only, as before.
  it("links only the County's lookup when a County precinct page throws", () => {
    render(
      <ErrorBoundary jurisdiction={jurisdictionOnPath('/p/CC007')}>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.getAllByRole('link', { name: /lookup/i })).toHaveLength(1);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/city/i);
  });

  it("links the City's lookup when a City precinct page throws", () => {
    render(
      <ErrorBoundary jurisdiction={jurisdictionOnPath('/p/W01P12')}>
        <Broken />
      </ErrorBoundary>,
    );
    const link = screen.getByRole('link', { name: copy.officialLookupCity });
    expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/county/i);
  });

  it('finds the jurisdiction only on a precinct path', () => {
    // The forms the /p/:precinct route also matches: a trailing slash, any case.
    for (const path of ['/p/W01P12', '/p/W01P12/', '/P/W01P12']) {
      expect(jurisdictionOnPath(path)?.id, path).toBe('city');
    }
    for (const path of ['/p/CC007', '/p/CC007/', '/P/CC007']) {
      expect(jurisdictionOnPath(path)?.id, path).toBe('county');
    }
    for (const path of ['/p/W1P12', '/p/nope', '/', '/p/W01P12/x', '/learn']) {
      expect(jurisdictionOnPath(path)).toBeUndefined();
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
