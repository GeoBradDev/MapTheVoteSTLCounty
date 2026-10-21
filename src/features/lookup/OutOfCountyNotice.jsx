import { useId } from 'react';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { copy } from './outOfCountyCopy.js';

const HREFS = {
  stlCityBoard: referrals.stlCityBoard.url,
  moVoterOutreach: referrals.moVoterOutreach.url,
  countyLookup: election.officialLookupUrl,
};

/**
 * Tells a voter whose place is not in a county precinct where to go instead.
 * @param {{ kind: string }} props A kind from locate(), other than `precinct`.
 */
export default function OutOfCountyNotice({ kind }) {
  const headingId = useId();
  if (!Object.hasOwn(copy, kind)) return null;
  const { heading, paragraphs } = copy[kind];
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold">
        {heading}
      </h2>
      {paragraphs.map(({ text, link, after }) => (
        <p key={text} className="mt-3">
          {text}
          {link && (
            <>
              {' '}
              <a href={HREFS[link.href]} rel="noreferrer" className="text-primary underline">
                {link.label}
              </a>
              {after}
            </>
          )}
        </p>
      ))}
    </section>
  );
}
