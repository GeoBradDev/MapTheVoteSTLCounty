import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import Notice from '../../components/Notice.jsx';
import OfficialLookups from '../../components/OfficialLookups.jsx';
import TextLink from '../../components/TextLink.jsx';
import { NotFound } from '../../data/arcgis.js';
import {
  cityWardPrecinct,
  county,
  isPrecinctCode,
  jurisdictionFor,
} from '../../data/jurisdictions.js';
import AddressLookup from './AddressLookup.jsx';
import { copy as errorCopy, isOffline } from './errorCopy.js';
import { JurisdictionContext } from './jurisdictionContext.js';
import { lookupPointFor } from './lookupPoint.js';
import { precinctStatus } from './precinctStatus.js';
import PrecinctStatusBanner from './PrecinctStatusBanner.jsx';
import ResultsCards, { ResultsSkeleton } from './ResultsCards.jsx';
import { copy } from './resultsCopy.js';
import RetryButton from './RetryButton.jsx';
import ShareLink, { ShareLinkPlaceholder } from './ShareLink.jsx';
import { useSlowNotice } from './slowNotice.js';

const ignore = () => {};

// Every City precinct votes in this election and the City layer has no status
// field, so a City page shows no banner (#89).
const CITY_STATUS = Object.freeze({ kind: 'in-election', message: null, showBallot: true });

// The line under the heading: the County precinct's municipality, or the City
// precinct's ward and precinct (#89).
function placeLine(jurisdiction, code, precinct) {
  if (!precinct) return null;
  if (jurisdiction.id !== 'city') return municipalityName(precinct.municipality);
  const parts = cityWardPrecinct(code);
  return parts && copy.cityPrecinct(jurisdiction.config.name, parts.ward, parts.precinct);
}

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
  // The code's shape picks the jurisdiction (#86). Anything else goes to the
  // County, whose lookup says "not found" without a request, as it always has.
  const known = jurisdictionFor(code);
  const jurisdiction = known ?? county;
  const validCode = isPrecinctCode(code);
  const searchHeadingId = useId();

  // The tab and bookmark title: the code only, and only a code-shaped one
  // that is not known to be missing. Anything else is titled as not found,
  // never with the URL text.
  const titled = validCode && result?.error !== 'notFound';
  const title = titled ? copy.pageTitle(code) : copy.notFoundTitle;
  // Layout effects here and for focus below: they run in the same commit as
  // the content they belong to, so nothing (a screen reader, or a test) sees
  // the new content before its title or focus.
  useLayoutEffect(() => {
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
      jurisdiction.getPolls().catch(ignore);
      jurisdiction.getEarlyVotingSites().catch(ignore);
      // The County's polling place rooms (#100); the City has none.
      jurisdiction.getPollRooms?.().catch(ignore);
      if (!origin) jurisdiction.getOutline(code).catch(ignore);
    }
    const done = (next) => {
      if (!current) return;
      setResult(next);
      setLoading(false);
    };
    jurisdiction.getPrecinct(code).then(
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
  }, [code, jurisdiction, validCode, origin, attempt]);

  const precinct = result?.precinct;
  useLayoutEffect(() => {
    if (precinct) headingRef.current?.focus();
  }, [precinct]);

  // A load that failed for a reason other than "not found" moves focus to its
  // message and "Try again" (#18), unless focus is already there (on the
  // retry button), so the voter lands on the way forward. A retry that ends
  // in "not found" takes the focused button away, so the message takes focus.
  const retryable = result?.error && result.error !== 'notFound';
  useLayoutEffect(() => {
    if (!result?.error) return;
    const block = errorRef.current;
    const focused = document.activeElement;
    const lost = !focused || focused === document.body;
    const move = retryable ? !block?.contains(focused) : attempt > 0 && lost;
    if (move) block?.focus();
  }, [retryable, result, attempt]);

  function retry() {
    if (loading) return;
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  const isCity = jurisdiction.id === 'city';
  const placeHold = isCity ? 'min-h-12 min-[28rem]:min-h-0' : 'min-h-12 min-[25rem]:min-h-0';
  let status = null;
  if (precinct) status = isCity ? CITY_STATUS : precinctStatus(precinct);
  const municipality = placeLine(jurisdiction, code, precinct);
  const searchLink = (
    <TextLink to="/" variant="tap">
      {copy.searchAnother}
    </TextLink>
  );

  return (
    <JurisdictionContext value={jurisdiction}>
      <header>
        {/* The answer first (#81): what the page is for, then the precinct
            as the line under it. */}
        <h1 ref={headingRef} tabIndex={-1} className="text-title font-bold">
          {titled ? copy.heading : copy.notFoundHeading}
        </h1>
        {/* Only a code-shaped value is shown: a link could otherwise put any
            text there. */}
        {/* While loading, two lines are held below the width where the
            longest place line fits on one: 400 px for a County precinct
            ("Unincorporated St. Louis County") and 448 px for a City one
            (Ward 28, Precinct 10). Narrower widths with a shorter line still
            move it once (#27). */}
        {titled && (
          <p className={`mt-1 sm:text-subheading ${result ? '' : placeHold}`}>
            {copy.precinct(code)}
            {municipality && (
              <>
                {' · '}
                <span data-testid="municipality">{municipality}</span>
              </>
            )}
          </p>
        )}
        {/* While a code-shaped precinct loads, the share row's place is
            held, so the summary's Election Day line, shown meanwhile, does
            not move when the results arrive (#27, #156). One slot until the
            precinct loads, so a focused link stays focused through a "not
            found" answer. */}
        {precinct ? (
          <ShareLink code={code}>{searchLink}</ShareLink>
        ) : (
          <ShareLinkPlaceholder code={code} hold={!result && titled}>
            {searchLink}
          </ShareLinkPlaceholder>
        )}
      </header>

      <p aria-live="polite" className="sr-only">
        {precinct ? copy.ready(code) : ''}
      </p>

      {!result && <ResultsSkeleton />}

      <div ref={errorRef} tabIndex={-1} className={result?.error ? 'mt-6' : undefined}>
        {/* The live region stays mounted; the notice shows only with an error. */}
        <div role="alert" className="empty:hidden">
          {result?.error && (
            // A new node per attempt, so a repeated failure is announced again.
            <Notice variant="danger" key={result.attempt ?? 0}>
              {copy.errors[result.error]}{' '}
              {known ? (
                <TextLink href={jurisdiction.officialLookupUrl} rel="noreferrer">
                  {copy.officialLookupFor(jurisdiction.id)}
                </TextLink>
              ) : (
                // Not a precinct code, so either board's (#93).
                <OfficialLookups />
              )}
              .
            </Notice>
          )}
        </div>
        {retryable && <RetryButton onRetry={retry} busy={loading} className="mt-3" />}
      </div>

      {/* Below the skeleton and the error, so it pushes nothing down when it
          appears (#27). */}
      <p role="status" className="mt-6 empty:hidden">
        {slow ? errorCopy.slow : ''}
      </p>

      {result?.error === 'notFound' && (
        <section aria-labelledby={searchHeadingId} className="mt-6">
          <h2 id={searchHeadingId} className="text-heading font-semibold">
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
    </JurisdictionContext>
  );
}

/**
 * The code a link meant, when it differs from a valid County or City code only
 * by letter case or surrounding spaces, like cc007 for CC007 or w01p12 for
 * W01P12. Null otherwise.
 * @param {string} value
 */
function canonicalCode(value) {
  const trimmed = value.trim();
  // ASCII only: toUpperCase maps some other letters (the German sharp s becomes SS) onto
  // ASCII ones, which would open a different precinct.
  if (!/^[a-z0-9]+$/i.test(trimmed)) return null;
  const code = trimmed.toUpperCase();
  return code !== value && isPrecinctCode(code) ? code : null;
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
