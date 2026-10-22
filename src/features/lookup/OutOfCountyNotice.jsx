import { useId } from 'react';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { copy } from './outOfCountyCopy.js';

const HREFS = {
  stlCityBoard: referrals.stlCityBoard.url,
  stlCityLookup: referrals.stlCityLookup.url,
  moVoterOutreach: referrals.moVoterOutreach.url,
  countyLookup: election.officialLookupUrl,
};

/**
 * Tells a voter whose place is in neither a County nor a City precinct where
 * to go instead. `stl-city` is the fallback when the City's precinct could not
 * be found (#88).
 * @param {{ kind: string, headingLevel?: 2 | 3 }} props `kind` is a kind from
 *   locate(), other than `precinct`. `headingLevel` is 3 when the notice sits
 *   inside a section that has its own `h2`.
 */
export default function OutOfCountyNotice({ kind, headingLevel = 2 }) {
  const headingId = useId();
  if (!Object.hasOwn(copy, kind)) return null;
  const { heading, paragraphs } = copy[kind];
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} className="text-xl font-semibold">
        {heading}
      </Heading>
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
