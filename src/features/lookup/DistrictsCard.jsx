import { Fragment } from 'react';
import election from '../../config/election.js';
import Disclosure from './Disclosure.jsx';
import { useWideOnMount } from './useWideOnMount.js';
import { districtRows } from './districts.js';
import { copy } from './resultsCopy.js';

const linkClass = 'text-primary underline';

/**
 * The districts card body: each district the precinct is in, as the county's
 * precinct data names it. Labels come from the results copy; nothing about
 * officeholders, candidates or parties is shown. Folded away on phones and
 * open on wider screens (owner decision on #81).
 * @param {{ precinct: object | null }} props The precinct's attributes.
 */
export default function DistrictsCard({ precinct }) {
  const rows = districtRows(precinct);
  const wide = useWideOnMount();

  if (rows.length === 0) {
    return (
      <p className="mt-2">
        {copy.districts.missing}{' '}
        <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
          {copy.officialLookup}
        </a>
        .
      </p>
    );
  }

  return (
    <Disclosure summary={copy.districts.show} defaultOpen={wide} className="mt-2">
      <dl className="mt-1 grid gap-x-4 sm:grid-cols-[auto_1fr]">
        {rows.map(({ key, label, value }) => (
          <Fragment key={key}>
            <dt className="mt-2 font-semibold sm:mt-1">{label}</dt>
            <dd className="sm:mt-1">{value}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">{copy.districts.source}</p>
    </Disclosure>
  );
}
