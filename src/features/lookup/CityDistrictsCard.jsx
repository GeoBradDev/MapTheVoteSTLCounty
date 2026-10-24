import { Fragment, useEffect, useState } from 'react';
import Disclosure from '../../components/Disclosure.jsx';
import Notice from '../../components/Notice.jsx';
import { NotFound } from '../../data/arcgis.js';
import { getCityDistrictsForPrecinct } from '../../data/cityArcgis.js';
import { cityDistrictRows } from './cityDistricts.js';
import { useWideOnMount } from './useWideOnMount.js';
import { OfficialLookupLink } from './PollsCard.jsx';
import { copy } from './resultsCopy.js';
import RetryButton from './RetryButton.jsx';
import { useRetry } from './useRetry.js';

const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

/**
 * The body of a City precinct's "Your districts" card (#90): the districts the
 * precinct is in, as the City Board's districts layer names them, asked at a
 * point inside the precinct's outline (getCityDistrictsForPrecinct), never the
 * voter's own point. Names and numbers only: never an office, officeholder or
 * party. Folded away on phones and open on wider screens (owner decision on
 * #81). In the City chunk (src/cityChunk.js).
 * @param {{ code: string }} props A City precinct code like W01P12.
 */
export default function CityDistrictsCard({ code }) {
  // { code, attempt, rows } once loaded, { code, attempt, error: true } on
  // failure. A failed load stays shown, busy, while Try again runs; when a
  // retry loads them, focus moves to the districts if it fell to the page
  // (useRetry, #18).
  const [result, setResult] = useState(null);
  const { attempt, loading, retry, done, targetRef } = useRetry();
  const wide = useWideOnMount();

  useEffect(() => {
    let live = true;
    getCityDistrictsForPrecinct(code).then(
      (districts) => {
        if (!live) return;
        setResult({ code, attempt, rows: cityDistrictRows(districts) });
        done();
      },
      (error) => {
        if (!live) return;
        // No such precinct: Try again would not find it either.
        if (error instanceof NotFound) setResult({ code, attempt, rows: [] });
        else setResult({ code, attempt, error: true });
        done();
      },
    );
    return () => {
      live = false;
    };
  }, [code, attempt, done]);

  const current = result?.code === code ? result : null;

  if (!current) {
    return (
      <div data-testid="districts-skeleton" aria-hidden="true" className="mt-3">
        <div className={`h-4 w-3/4 ${bar}`} />
        <div className={`mt-2 h-4 w-1/2 ${bar}`} />
        <div className={`mt-2 h-4 w-2/3 ${bar}`} />
      </div>
    );
  }

  if (current.error) {
    return (
      <div ref={targetRef} tabIndex={-1}>
        <Notice role="alert" variant="danger" className="mt-2">
          {/* A new node per attempt, so a repeated failure is announced again. */}
          <span key={current.attempt}>
            {copy.districts.failed} <OfficialLookupLink card="districts" />.
          </span>
        </Notice>
        <RetryButton onRetry={retry} busy={loading} where="districts" className="mt-2" />
      </div>
    );
  }

  const { rows } = current;
  if (rows.length === 0) {
    return (
      <div ref={targetRef} tabIndex={-1}>
        <p className="mt-2">
          {copy.districts.missing} <OfficialLookupLink card="districts" />.
        </p>
      </div>
    );
  }

  return (
    <div ref={targetRef} tabIndex={-1}>
      <Disclosure summary={copy.districts.show} defaultOpen={wide} className="mt-2">
        <dl className="mt-1 grid gap-x-4 sm:grid-cols-[auto_1fr]">
          {rows.map(({ key, label, values }) => (
            <Fragment key={key}>
              <dt className="mt-2 font-semibold sm:mt-1">{label}</dt>
              <dd className="sm:mt-1">{values.join(', ')}</dd>
            </Fragment>
          ))}
        </dl>
        {rows.some(({ values }) => values.length > 1) && (
          <p className="mt-3">
            {copy.districts.multipleCity} <OfficialLookupLink card="districts" />.
          </p>
        )}
        <p className="mt-3 text-sm text-muted">{copy.districts.sourceCity}</p>
      </Disclosure>
    </div>
  );
}
