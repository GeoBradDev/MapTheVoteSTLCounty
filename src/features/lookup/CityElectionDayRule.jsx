import TextLink from '../../components/TextLink.jsx';
import cityResults from '../../config/cityResults.js';
import referrals from '../../config/referrals.js';
import { formatLongDate } from './earlyVoting.js';
import { copy, sourceName } from './resultsCopy.js';

/**
 * The Election Day rule for St. Louis City (#89), in the City Board's own
 * words from its polling places page, with that page as the source (named in
 * the config, its URL kept in referrals.js) and the date it was last checked.
 * Any City voter may vote at any of the City's listed locations. The County
 * has its own rule (CountyElectionDayRule). The quote is shown as published, from the
 * config.
 */
export default function CityElectionDayRule() {
  const { quote, source, lastVerified } = cityResults.electionDayRule;
  const { url } = referrals[source];
  return (
    <>
      <p>{copy.polls.cityRule}</p>
      <blockquote cite={url} className="mt-1 border-l-4 border-border pl-3 font-semibold">
        <p>{quote}</p>
      </blockquote>
      <p className="mt-2 text-sm">
        {copy.polls.source}:{' '}
        <TextLink href={url} rel="noreferrer">
          {sourceName(url)}
        </TextLink>
        . {copy.earlyVoting.lastVerified(formatLongDate(lastVerified, { year: true }))}
      </p>
    </>
  );
}
