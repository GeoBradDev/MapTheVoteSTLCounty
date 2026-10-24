import { track } from '../analytics/index.js';
import election from '../config/election.js';
import TextLink from './TextLink.jsx';
import referrals from '../config/referrals.js';
import { copy } from './officialLookupsCopy.js';

/**
 * "St. Louis County official lookup or the St. Louis City official lookup",
 * each a link to that board's own lookup. For a message shown before the
 * jurisdiction is known (#93); the caller puts "the" before it. A press is
 * counted with `card` (#70), not which board's, as the message that has them.
 * @param {{ card: string }} props A fixed label from the allowlist in
 *   src/analytics/ga.js.
 */
export default function OfficialLookups({ card }) {
  const onClick = () => track('official_lookup_open', { card });
  return (
    <>
      <TextLink href={election.officialLookupUrl} rel="noreferrer" onClick={onClick}>
        {copy.county}
      </TextLink>{' '}
      {copy.or}{' '}
      <TextLink href={referrals.stlCityLookup.url} rel="noreferrer" onClick={onClick}>
        {copy.city}
      </TextLink>
    </>
  );
}
