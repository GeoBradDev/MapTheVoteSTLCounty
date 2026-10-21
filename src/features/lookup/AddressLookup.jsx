import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import election from '../../config/election.js';
import { PRECINCT_CODE } from '../../data/arcgis.js';
import { GeocoderUnavailableError } from '../../data/geocoder.js';
import AddressSearch from './AddressSearch.jsx';
import { useGeocoder } from './geocoderContext.js';
import { locate } from './locate.js';
import { copy } from './lookupCopy.js';
import OutOfCountyNotice from './OutOfCountyNotice.jsx';
import UseMyLocation from './UseMyLocation.jsx';

/**
 * The whole lookup: the address box and "Use my location". Either gives a
 * place for locate() (#8). A precinct opens its page (only the precinct code
 * goes in the URL); anywhere else shows where to go instead. The address text
 * and coordinates are never stored: they live only in this lookup's call.
 */
export default function AddressLookup() {
  const geocoder = useGeocoder();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  // Null, { kind } from locate(), or { error } with a key of copy.errors.
  const [outcome, setOutcome] = useState(null);
  const inputRef = useRef(null);
  const outcomeRef = useRef(null);
  // The current lookup, so a superseded or unmounted one is dropped.
  const runRef = useRef(null);

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

  async function run(getPlace) {
    runRef.current?.abort();
    const controller = new AbortController();
    runRef.current = controller;
    const current = () => runRef.current === controller;
    setBusy(true);
    setOutcome(null);

    let next;
    let code = null;
    try {
      const place = await getPlace(controller.signal);
      if (!place) {
        next = { error: 'noMatch' };
      } else {
        const { lat, lng, state, county } = place;
        const result = await locate({ lat, lng, state, county });
        if (result.kind !== 'precinct') next = { kind: result.kind };
        else if (PRECINCT_CODE.test(result.precinct?.precinct)) code = result.precinct.precinct;
        else next = { error: 'failed' };
      }
    } catch (error) {
      next = { error: error instanceof GeocoderUnavailableError ? 'unavailable' : 'failed' };
    }
    if (!current()) return;
    runRef.current = null;
    setBusy(false);
    if (code) navigate(`/p/${code}`);
    else setOutcome(next);
  }

  function handleAddress(query) {
    if (busy) return;
    run(async (signal) => {
      try {
        return await geocoder.geocode(query, { signal });
      } catch (error) {
        throw error instanceof GeocoderUnavailableError ? error : new GeocoderUnavailableError();
      }
    });
  }

  function handleLocation(place) {
    run(async () => place);
  }

  return (
    <div>
      <AddressSearch onSubmit={handleAddress} busy={busy} inputRef={inputRef} />
      <p role="alert" className="mt-2">
        {outcome?.error && (
          <>
            <span>{copy.errors[outcome.error]}</span> {copy.errorAfterLink}{' '}
            <a
              href={election.officialLookupUrl}
              rel="noreferrer"
              className="text-primary underline"
            >
              {copy.officialLookup}
            </a>
            .
          </>
        )}
      </p>
      <div className="mt-4">
        <UseMyLocation onLocate={handleLocation} addressInputRef={inputRef} />
      </div>
      {outcome?.kind && (
        <div ref={outcomeRef} tabIndex={-1} className="mt-6 rounded-md border border-border p-4">
          <OutOfCountyNotice kind={outcome.kind} />
        </div>
      )}
    </div>
  );
}
