import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import election from '../../config/election.js';
import {
  getAbsenteeSites,
  getPolls,
  getPrecinctById,
  getPrecinctGeometry,
  NotFound,
  PRECINCT_CODE,
} from '../../data/arcgis.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as errorCopy, isOffline } from './errorCopy.js';
import { lookupPointFor } from './lookupPoint.js';
import { precinctStatus } from './precinctStatus.js';
import PrecinctStatusBanner from './PrecinctStatusBanner.jsx';
import ResultsCards, { ResultsSkeleton, SkeletonLine } from './ResultsCards.jsx';
import { copy } from './resultsCopy.js';
import RetryButton from './RetryButton.jsx';
import ShareLink from './ShareLink.jsx';
import { useSlowNotice } from './slowNotice.js';

const linkClass = 'text-primary underline';

const ignore = () => {};

function municipalityName(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().toLowerCase() === 'unincorporated' ? copy.unincorporated : value.trim();
}

/**
 * The results for one precinct. Only the code comes from the URL: the page
 * loads the precinct itself, so a lookup and a shared link show the same thing.
 * @param {{ code: string }} props
 */
function PrecinctResults({ code }) {
  // { precinct } once loaded, { error: 'notFound' | 'failed' | 'offline',
  // attempt } on failure. A failed load stays shown while it is retried.
  const [result, setResult] = useState(null);
  // Each "Try again" is a new attempt; `loading` is the one in flight, if any.
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const slow = useSlowNotice(loading ? attempt : null);
  const errorRef = useRef(null);
  // The point of the lookup that opened this page, if any. Memory only: a
  // reload or a shared link has none.
  const [origin] = useState(() => lookupPointFor(code));
  const headingRef = useRef(null);
  const validCode = PRECINCT_CODE.test(code);
  const searchHeadingId = useId();

  // The tab and bookmark title: the code only, and only a code-shaped one
  // that is not known to be missing. Anything else is titled as not found,
  // never with the URL text.
  const titled = validCode && result?.error !== 'notFound';
  const title = titled ? copy.pageTitle(code) : copy.notFoundTitle;
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  useEffect(() => {
    let current = true;
    // Start the cards' requests now, alongside the precinct's, instead of after
    // it answers (#27): on a slow connection that saves a round trip before the
    // polling places show. The cards get the same shared requests; a failure
    // here is not kept, so a card asks again. Only for a code-shaped value, and
    // the outline only without a looked-up point, since distances are then
    // measured from its center.
    if (validCode) {
      getPolls().catch(ignore);
      getAbsenteeSites().catch(ignore);
      if (!origin) getPrecinctGeometry(code).catch(ignore);
    }
    const done = (next) => {
      if (!current) return;
      setResult(next);
      setLoading(false);
    };
    getPrecinctById(code).then(
      (precinct) => done({ precinct }),
      (error) => {
        let kind = 'failed';
        if (error instanceof NotFound) kind = 'notFound';
        else if (isOffline()) kind = 'offline';
        done({ error: kind, attempt });
      },
    );
    return () => {
      current = false;
    };
  }, [code, validCode, origin, attempt]);

  const precinct = result?.precinct;
  useEffect(() => {
    if (precinct) headingRef.current?.focus();
  }, [precinct]);

  // A load that failed for a reason other than "not found" moves focus to its
  // message and "Try again" (#18), unless focus is already there (on the
  // retry button), so the voter lands on the way forward.
  const retryable = result?.error && result.error !== 'notFound';
  useEffect(() => {
    if (!retryable) return;
    const block = errorRef.current;
    if (block && !block.contains(document.activeElement)) block.focus();
  }, [retryable, result]);

  function retry() {
    if (loading) return;
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  const status = precinct ? precinctStatus(precinct) : null;
  const municipality = municipalityName(precinct?.municipality);

  return (
    <>
      <header>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold">
          {/* Only a code-shaped value goes in the heading: a link could
              otherwise put any text there. */}
          {validCode ? copy.heading(code) : copy.notFoundHeading}
        </h1>
        {!result && <SkeletonLine className="mt-2 h-5 w-48" />}
        {municipality && (
          <p data-testid="municipality" className="mt-1 text-lg">
            {municipality}
          </p>
        )}
        <p className="mt-2">
          <Link href="/" className={`inline-flex min-h-11 items-center ${linkClass}`}>
            {copy.searchAnother}
          </Link>
        </p>
        {precinct && <ShareLink code={code} />}
      </header>

      <p aria-live="polite" className="sr-only">
        {precinct ? copy.ready(code) : ''}
      </p>

      <p role="status" className="mt-6 empty:hidden">
        {slow ? errorCopy.slow : ''}
      </p>

      {!result && <ResultsSkeleton />}

      <div ref={errorRef} tabIndex={-1} className={result?.error ? 'mt-6' : undefined}>
        <p role="alert" className="empty:hidden">
          {result?.error && (
            // A new node per attempt, so a repeated failure is announced again.
            <span key={result.attempt ?? 0}>
              {copy.errors[result.error]}{' '}
              <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
                {copy.officialLookup}
              </a>
              .
            </span>
          )}
        </p>
        {retryable && <RetryButton onRetry={retry} busy={loading} className="mt-3" />}
      </div>

      {result?.error === 'notFound' && (
        <section aria-labelledby={searchHeadingId} className="mt-6">
          <h2 id={searchHeadingId} className="text-xl font-semibold">
            {copy.searchInstead}
          </h2>
          <div className="mt-4">
            <AddressLookup noticeHeadingLevel={3} />
          </div>
        </section>
      )}

      {status && (
        <>
          <PrecinctStatusBanner status={status} />
          <ResultsCards
            code={code}
            origin={origin}
            showBallot={status.showBallot}
            ballotHtml={precinct.html}
            precinct={precinct}
          />
        </>
      )}
    </>
  );
}

/**
 * The code a link meant, when it differs from a valid code only by letter
 * case or surrounding spaces, like cc007 for CC007. Null otherwise.
 * @param {string} value
 */
function canonicalCode(value) {
  const trimmed = value.trim();
  // ASCII only: toUpperCase maps some other letters (the German sharp s becomes SS) onto
  // ASCII ones, which would open a different precinct.
  if (!/^[a-z]{2,3}\d{3}$/i.test(trimmed)) return null;
  const code = trimmed.toUpperCase();
  return code !== value ? code : null;
}

export default function PrecinctPage() {
  const { precinct } = useParams();
  const [, navigate] = useLocation();
  const canonical = canonicalCode(precinct);

  useEffect(() => {
    if (canonical) navigate(`/p/${canonical}`, { replace: true });
  }, [canonical, navigate]);

  // Nothing renders until the URL holds the canonical code.
  if (canonical) return null;
  // A new code is a new page: no state carries over from the last one.
  return <PrecinctResults key={precinct} code={precinct} />;
}
