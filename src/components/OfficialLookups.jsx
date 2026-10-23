import election from '../config/election.js';
import referrals from '../config/referrals.js';
import { copy } from './officialLookupsCopy.js';

/**
 * "St. Louis County official lookup or the St. Louis City official lookup",
 * each a link to that board's own lookup. For a message shown before the
 * jurisdiction is known (#93); the caller puts "the" before it.
 * @param {{ className: string }} props The links' class.
 */
export default function OfficialLookups({ className }) {
  return (
    <>
      <a href={election.officialLookupUrl} rel="noreferrer" className={className}>
        {copy.county}
      </a>{' '}
      {copy.or}{' '}
      <a href={referrals.stlCityLookup.url} rel="noreferrer" className={className}>
        {copy.city}
      </a>
    </>
  );
}
