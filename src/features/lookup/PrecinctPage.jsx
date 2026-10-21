import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import election from '../../config/election.js';
import { getPrecinctById, NotFound, PRECINCT_CODE } from '../../data/arcgis.js';
import AddressLookup from './AddressLookup.jsx';
import { lookupPointFor } from './lookupPoint.js';
import { precinctStatus } from './precinctStatus.js';
import PrecinctStatusBanner from './PrecinctStatusBanner.jsx';
import ResultsCards, { ResultsSkeleton, SkeletonLine } from './ResultsCards.jsx';
import { copy } from './resultsCopy.js';
import ShareLink from './ShareLink.jsx';

const linkClass = 'text-primary underline';

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
  // { precinct } once loaded, { error: 'notFound' | 'failed' } on failure.
  const [result, setResult] = useState(null);
  // The point of the lookup that opened this page, if any. Memory only: a
  // reload or a shared link has none.
  const [origin] = useState(() => lookupPointFor(code));
  const headingRef = useRef(null);
  const validCode = PRECINCT_CODE.test(code);
  const searchHeadingId = useId();

  // The tab and bookmark title: the code only, and only a code-shaped one.
  useEffect(() => {
    if (!validCode) return undefined;
    const previous = document.title;
    document.title = copy.pageTitle(code);
    return () => {
      document.title = previous;
    };
  }, [code, validCode]);

  useEffect(() => {
    let current = true;
    getPrecinctById(code).then(
      (precinct) => current && setResult({ precinct }),
      (error) => current && setResult({ error: error instanceof NotFound ? 'notFound' : 'failed' }),
    );
    return () => {
      current = false;
    };
  }, [code]);

  const precinct = result?.precinct;
  useEffect(() => {
    if (precinct) headingRef.current?.focus();
  }, [precinct]);

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

      {!result && <ResultsSkeleton />}

      <p role="alert" className="mt-6 empty:hidden">
        {result?.error && (
          <>
            {copy.errors[result.error]}{' '}
            <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
              {copy.officialLookup}
            </a>
            .
          </>
        )}
      </p>

      {result?.error === 'notFound' && (
        <section aria-labelledby={searchHeadingId} className="mt-6">
          <h2 id={searchHeadingId} className="text-xl font-semibold">
            {copy.searchInstead}
          </h2>
          <div className="mt-4">
            <AddressLookup />
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
  const code = value.trim().toUpperCase();
  return code !== value && PRECINCT_CODE.test(code) ? code : null;
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
