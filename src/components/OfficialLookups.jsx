import election from '../config/election.js';
import TextLink from './TextLink.jsx';
import referrals from '../config/referrals.js';
import { copy } from './officialLookupsCopy.js';

/**
 * "St. Louis County official lookup or the St. Louis City official lookup",
 * each a link to that board's own lookup. For a message shown before the
 * jurisdiction is known (#93); the caller puts "the" before it.
 */
export default function OfficialLookups() {
  return (
    <>
      <TextLink href={election.officialLookupUrl} rel="noreferrer">
        {copy.county}
      </TextLink>{' '}
      {copy.or}{' '}
      <TextLink href={referrals.stlCityLookup.url} rel="noreferrer">
        {copy.city}
      </TextLink>
    </>
  );
}
