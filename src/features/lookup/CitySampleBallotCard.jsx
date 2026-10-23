import Button from '../../components/Button.jsx';
import TextLink from '../../components/TextLink.jsx';
import cityResults from '../../config/cityResults.js';
import { formatLongDate } from './earlyVoting.js';
import { copy, sourceName } from './resultsCopy.js';

/**
 * The body of a City precinct's "Sample ballot" part (#92), after its fixed
 * intro (BallotPart in ResultsSummary.jsx). The City Board
 * publishes one sample ballot for all precincts, with every contest in the City
 * (`sampleBallot` in src/config/cityResults.js), and no ballot per precinct or
 * ward, so the card links that one PDF as published; the intro above it says
 * plainly that the voter's own ballot has only the contests for where they
 * live (the Board's pages say no more, so neither does the part). It never
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
      <Button stack href={url} target="_blank" rel="noopener noreferrer" className="mt-3">
        {/* The spaces keep the parts apart in the accessible name. */}
        <span>{copy.ballot.openCity}</span>{' '}
        <span className="text-sm font-normal">{copy.ballot.allPrecincts}</span>{' '}
        <span className="sr-only">{copy.ballot.newTab}</span>
      </Button>
      <p className="mt-3">{copy.ballot.districtsPointer}</p>
      <p className="mt-3 text-sm">
        {copy.polls.source}:{' '}
        <TextLink href={source} rel="noreferrer">
          {sourceName(source)}
        </TextLink>
        . {copy.earlyVoting.lastVerified(formatLongDate(lastVerified, { year: true }))}
      </p>
    </>
  );
}
