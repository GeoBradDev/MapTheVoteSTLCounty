import { Component, useEffect, useRef } from 'react';
import election from '../config/election.js';
import { applyHead } from '../pageHead.js';
import { copy } from './errorBoundaryCopy.js';
import { usePageTitle } from './usePageTitle.js';

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// What shows instead of a page that threw while rendering. It names no error
// and shows none of its text, which could hold anything the page had.
function ErrorScreen() {
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
        <a href={election.officialLookupUrl} rel="noreferrer" className="text-primary underline">
          {copy.officialLookup}
        </a>
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
 * page starts fresh.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <ErrorScreen /> : this.props.children;
  }
}
