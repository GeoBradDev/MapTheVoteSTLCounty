import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import election from '../../config/election.js';
import { PRECINCT_CODE } from '../../data/arcgis.js';
import { GeocoderUnavailableError } from '../../data/geocoder.js';
import AddressSearch from './AddressSearch.jsx';
import GeocoderAttribution from './GeocoderAttribution.jsx';
import { useGeocoder } from './geocoderContext.js';
import { copy as errorCopy, isOffline } from './errorCopy.js';
import { locate } from './locate.js';
import { forgetLookupPoint, rememberLookupPoint } from './lookupPoint.js';
import { copy } from './lookupCopy.js';
import OutOfCountyNotice from './OutOfCountyNotice.jsx';
import RetryButton from './RetryButton.jsx';
import { useSlowNotice } from './slowNotice.js';
import UseMyLocation from './UseMyLocation.jsx';

// Which message a failed lookup gets (#18): offline first, since then every
// service fails; then an address search that could not finish; anything else
// (the precinct layer down or slow, a broken answer) is a failed lookup.
function errorKind(error) {
  if (isOffline()) return 'offline';
  return error instanceof GeocoderUnavailableError ? 'unavailable' : 'failed';
}

/**
 * The whole lookup: the address box and "Use my location". Either gives a
 * place for locate() (#8). A precinct opens its page (only the precinct code
 * goes in the URL); anywhere else shows where to go instead. The address text
 * is never stored, and the coordinates are kept only in memory, for the
 * polling places card (lookupPoint.js).
 * @param {{ noticeHeadingLevel?: 2 | 3 }} props The heading level of the
 *   out-of-county notice: 3 when the lookup sits under its own `h2`.
 */
export default function AddressLookup({ noticeHeadingLevel = 2 }) {
  const geocoder = useGeocoder();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  // Null, { kind } from locate(), or { error, run, canRetry } with error a key
  // of copy.errors and run the lookup it came from, so a repeated error is a
  // new message node and is announced again.
  const [outcome, setOutcome] = useState(null);
  // The run in progress, numbered, or null; for the slow notice.
  const [running, setRunning] = useState(null);
  // Whether the running lookup is a "Try again".
  const [retrying, setRetrying] = useState(false);
  const slow = useSlowNotice(running);
  const inputRef = useRef(null);
  const outcomeRef = useRef(null);
  // The current lookup, so a superseded or unmounted one is dropped.
  const runRef = useRef(null);
  const runCountRef = useRef(0);
  // How to repeat the last lookup, for "Try again": memory only, and dropped
  // when the voter edits the address.
  const lastRef = useRef(null);

  useEffect(
    () => () => {
      runRef.current?.abort();
      runRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (outcome?.kind) outcomeRef.current?.focus();
  }, [outcome]);

  async function run(getPlace, { retry = false } = {}) {
    // A new search, whatever its outcome, drops the point of the one before (#53).
    forgetLookupPoint();
    runRef.current?.abort();
    const controller = new AbortController();
    runRef.current = controller;
    const current = () => runRef.current === controller;
    lastRef.current = getPlace;
    runCountRef.current += 1;
    const runNumber = runCountRef.current;
    setBusy(true);
    setRunning(runNumber);
    setRetrying(retry);
    // A retry keeps its message and button in place until it has an answer,
    // so the focus on the button is not lost.
    if (!retry) setOutcome(null);

    let next;
    let code = null;
    let point = null;
    try {
      const place = await getPlace(controller.signal);
      if (!place) {
        next = { error: 'noMatch' };
      } else {
        const { lat, lng, state, county } = place;
        const result = await locate({ lat, lng, state, county });
        if (result.kind !== 'precinct') next = { kind: result.kind };
        else if (PRECINCT_CODE.test(result.precinct?.precinct)) {
          code = result.precinct.precinct;
          point = { lat, lng };
        } else next = { error: 'failed' };
      }
    } catch (error) {
      next = { error: errorKind(error) };
    }
    if (!current()) return;
    runRef.current = null;
    setBusy(false);
    setRunning(null);
    setRetrying(false);
    if (code) {
      rememberLookupPoint(code, point);
      navigate(`/p/${code}`);
    } else if (next.error) {
      const canRetry = next.error !== 'noMatch';
      setOutcome({ ...next, run: runNumber, canRetry });
      // The focused "Try again" goes away with a no match: the address box,
      // where the voter fixes the address, takes focus instead.
      if (retry && !canRetry) inputRef.current?.focus();
    } else setOutcome(next);
  }

  function handleAddress(query) {
    // A ref, not the busy state, so two submits before a re-render still
    // geocode once.
    if (runRef.current) return;
    // reportUnavailable: a search that could not finish says so (#18),
    // rather than that the address does not exist.
    run((signal) => geocoder.geocode(query, { signal, reportUnavailable: true }));
  }

  // Editing the address cancels a lookup still running, for the old text or
  // for the device's location, so the voter can correct and resubmit. "Try
  // again" would repeat the old text, so it goes too.
  function handleEdit() {
    if (lastRef.current) {
      lastRef.current = null;
      setOutcome((o) => (o?.canRetry ? { ...o, canRetry: false } : o));
    }
    if (!runRef.current) return;
    runRef.current.abort();
    runRef.current = null;
    setBusy(false);
    setRunning(null);
    setRetrying(false);
  }

  function handleRetry() {
    if (runRef.current || !lastRef.current) return;
    run(lastRef.current, { retry: true });
  }

  function handleLocation(place) {
    run(async () => place);
  }

  return (
    <div>
      <AddressSearch onSubmit={handleAddress} onEdit={handleEdit} busy={busy} inputRef={inputRef} />
      <GeocoderAttribution />
      <p role="status" className="mt-2 empty:hidden">
        {slow ? errorCopy.slow : ''}
      </p>
      <p role="alert" className="mt-2">
        {outcome?.error && (
          <span key={outcome.run}>
            <span>{copy.errors[outcome.error]}</span> {copy.errorAfterLink}{' '}
            <a
              href={election.officialLookupUrl}
              rel="noreferrer"
              className="text-primary underline"
            >
              {copy.officialLookup}
            </a>
            .
          </span>
        )}
      </p>
      {outcome?.canRetry && <RetryButton onRetry={handleRetry} busy={retrying} className="mt-2" />}
      <div className="mt-4">
        <UseMyLocation
          onLocate={handleLocation}
          onStart={forgetLookupPoint}
          addressInputRef={inputRef}
        />
      </div>
      {outcome?.kind && (
        <div ref={outcomeRef} tabIndex={-1} className="mt-6 rounded-md border border-border p-4">
          <OutOfCountyNotice kind={outcome.kind} headingLevel={noticeHeadingLevel} />
        </div>
      )}
    </div>
  );
}
