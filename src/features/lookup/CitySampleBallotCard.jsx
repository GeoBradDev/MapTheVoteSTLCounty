import cityResults from '../../config/cityResults.js';
import { formatLongDate } from './earlyVoting.js';
import { copy, sourceName } from './resultsCopy.js';

const linkClass = 'text-primary underline';
const buttonClass =
  'mt-3 inline-flex min-h-11 flex-col justify-center rounded-md bg-primary px-4 py-2 text-on-primary';

/**
 * The body of a City precinct's "Sample ballot" card (#92). The City Board
 * publishes one sample ballot for all precincts, with every contest in the City
 * (`sampleBallot` in src/config/cityResults.js), and no ballot per precinct or
 * ward, so the card links that one PDF as published and says plainly that the
 * voter's own ballot has only the contests where they vote: the citywide and
 * statewide ones and those for their ward and districts. It never
 * reads the precinct's data, so it cannot show another precinct's ballot. In
 * the City chunk (src/cityChunk.js).
 */
export default function CitySampleBallotCard() {
  const {
    url,
    sources: [source],
    lastVerified,
  } = cityResults.sampleBallot;
  return (
    <>
      <p className="mt-2">{copy.ballot.introCity}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass}>
        {/* The spaces keep the parts apart in the accessible name. */}
        <span className="font-semibold">{copy.ballot.openCity}</span>{' '}
        <span className="text-sm">{copy.ballot.allPrecincts}</span>{' '}
        <span className="sr-only">{copy.ballot.newTab}</span>
      </a>
      <p className="mt-3">{copy.ballot.districtsPointer}</p>
      <p className="mt-3 text-sm">
        {copy.polls.source}:{' '}
        <a href={source} rel="noreferrer" className={linkClass}>
          {sourceName(source)}
        </a>
        . {copy.earlyVoting.lastVerified(formatLongDate(lastVerified, { year: true }))}
      </p>
    </>
  );
}
