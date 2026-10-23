import election from '../../config/election.js';
import { fileNameMatchesPrecinct, parseSampleBallot } from '../../data/sampleBallot.js';
import { copy } from './resultsCopy.js';

const linkClass = 'text-primary underline';
const buttonClass =
  'mt-3 inline-flex min-h-11 flex-col justify-center rounded-md bg-primary px-4 py-2 text-on-primary';

/**
 * The sample ballot part's body, after its fixed intro (BallotPart in
 * ResultsSummary.jsx). The precinct's `html` field is read only through
 * `parseSampleBallot`, never rendered: a link is shown only when the parser
 * returns a URL that matched the election config's pattern and a file name
 * that names this precinct (#82). Anything else points to the county's
 * official lookup, so a swapped link never shows another precinct's ballot.
 * @param {{ html: unknown, code?: string }} props The precinct's `html` field
 *   and its code, like `CC007`.
 */
export default function SampleBallotCard({ html, code }) {
  const ballot = parseSampleBallot(html);

  if (!('url' in ballot) || !fileNameMatchesPrecinct(ballot.fileName, code)) {
    return (
      <p className="mt-2">
        {copy.ballot.missing}{' '}
        <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
          {copy.officialLookup}
        </a>
        .
      </p>
    );
  }

  return (
    <a href={ballot.url} target="_blank" rel="noopener noreferrer" className={buttonClass}>
      {/* The spaces keep the parts apart in the accessible name. */}
      <span className="font-semibold">{copy.ballot.open}</span>{' '}
      <span className="text-sm">{ballot.fileName}</span>{' '}
      <span className="sr-only">{copy.ballot.newTab}</span>
    </a>
  );
}
