import { Component, useEffect, useRef } from 'react';
import { applyHead } from '../pageHead.js';
import { copy } from './errorBoundaryCopy.js';
import OfficialLookups from './OfficialLookups.jsx';
import { usePageTitle } from './usePageTitle.js';

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// What shows instead of a page that threw while rendering. It names no error
// and shows none of its text, which could hold anything the page had.
function ErrorScreen({ jurisdiction }) {
  const headingRef = useRef(null);
  usePageTitle(copy.heading);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  // Not the failed page's head (#99): the shell's description, no canonical.
  useEffect(() => {
    applyHead(document, null);
  }, []);
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
        {copy.heading}
      </h1>
      <p role="alert" className="mt-4">
        {copy.body}{' '}
        {jurisdiction ? (
          <a
            href={jurisdiction.officialLookupUrl}
            rel="noreferrer"
            className="text-primary underline"
          >
            {jurisdiction.id === 'city' ? copy.officialLookupCity : copy.officialLookup}
          </a>
        ) : (
          // Not a precinct page, so no jurisdiction is known (#93).
          <OfficialLookups className="text-primary underline" />
        )}
        .
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-md bg-primary px-4 py-2 font-semibold text-on-primary"
        >
          {copy.reload}
        </button>
        {/* A full load, not an in-app link: the app's state may be broken. */}
        <a href="/" className={linkClass}>
          {copy.home}
        </a>
      </p>
    </>
  );
}

/**
 * Catches an error thrown while rendering a page (#18), so the voter gets a
 * way forward instead of a blank screen. It logs nothing: main.jsx turns off
 * React's own logging of caught errors, since an error could carry what the
 * page held. Give it a `key` that changes with the page, so moving to another
 * page starts fresh. `jurisdiction` is the precinct's on a precinct's page,
 * so the way forward is that board's own lookup (#89); on any other page it
 * is both boards' lookups (#93).
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <ErrorScreen jurisdiction={this.props.jurisdiction} />
    ) : (
      this.props.children
    );
  }
}
