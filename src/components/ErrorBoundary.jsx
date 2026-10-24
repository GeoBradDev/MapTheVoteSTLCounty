import { Component, useEffect, useRef } from 'react';
import { applyHead } from '../pageHead.js';
import { copy } from './errorBoundaryCopy.js';
import Button from './Button.jsx';
import Notice from './Notice.jsx';
import OfficialLookups from './OfficialLookups.jsx';
import TextLink from './TextLink.jsx';
import { useNoindex } from './useNoindex.js';
import { usePageTitle } from './usePageTitle.js';

// What shows instead of a page that threw while rendering. It names no error
// and shows none of its text, which could hold anything the page had.
function ErrorScreen({ jurisdiction }) {
  const headingRef = useRef(null);
  usePageTitle(copy.heading);
  useNoindex();
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  // Not the failed page's head (#99): the shell's description, no canonical.
  useEffect(() => {
    applyHead(document, null);
  }, []);
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="text-title font-bold">
        {copy.heading}
      </h1>
      <Notice role="alert" variant="danger" className="mt-4">
        {copy.body}{' '}
        {jurisdiction ? (
          <TextLink href={jurisdiction.officialLookupUrl} rel="noreferrer">
            {jurisdiction.id === 'city' ? copy.officialLookupCity : copy.officialLookup}
          </TextLink>
        ) : (
          // Not a precinct page, so no jurisdiction is known (#93).
          <OfficialLookups />
        )}
        .
      </Notice>
      <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Button onClick={() => window.location.reload()}>{copy.reload}</Button>
        {/* A full load, not an in-app link: the app's state may be broken. */}
        <TextLink href="/" variant="tap">
          {copy.home}
        </TextLink>
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
