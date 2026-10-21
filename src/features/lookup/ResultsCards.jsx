import { useId } from 'react';
import election from '../../config/election.js';
import DistrictsCard from './DistrictsCard.jsx';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import PollsCard from './PollsCard.jsx';
import SampleBallotCard from './SampleBallotCard.jsx';
import { copy } from './resultsCopy.js';

const linkClass = 'text-primary underline';

// The card order the issue sets. Each card's own issue replaces its body.
const CARDS = [
  { key: 'polls', ballot: false },
  { key: 'ballot', ballot: true },
  { key: 'earlyVoting', ballot: false },
  { key: 'districts', ballot: false },
];

function Card({ title, children }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-md border border-border p-4">
      <h2 id={headingId} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PendingCard() {
  return (
    <p className="mt-2">
      {copy.cards.pending}{' '}
      <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
        {copy.officialLookup}
      </a>
      .
    </p>
  );
}

/**
 * The result cards, in order.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   showBallot: boolean, ballotHtml: unknown, precinct: object }} props
 *   `origin` is the looked-up point, in memory only. `showBallot` false hides
 *   the sample ballot card, for a precinct with nothing on the ballot.
 *   `ballotHtml` is the precinct's `html` field, which only the sample ballot
 *   parser reads. `precinct` is the precinct's attributes, for its districts.
 */
export default function ResultsCards({ code, origin, showBallot, ballotHtml, precinct }) {
  const body = {
    polls: () => <PollsCard code={code} origin={origin} />,
    ballot: () => <SampleBallotCard html={ballotHtml} />,
    earlyVoting: () => <EarlyVotingCard code={code} origin={origin} />,
    districts: () => <DistrictsCard precinct={precinct} />,
  };
  return (
    <div className="mt-6 flex flex-col gap-4">
      {CARDS.filter((card) => showBallot || !card.ballot).map(({ key }) => (
        <Card key={key} title={copy.cards[key]}>
          {body[key] ? body[key]() : <PendingCard />}
        </Card>
      ))}
    </div>
  );
}

const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

/** One placeholder line, hidden from screen readers. */
export function SkeletonLine({ className }) {
  return <div aria-hidden="true" className={`${className} ${bar}`} />;
}

/** Placeholders the size of the cards, hidden from screen readers. */
export function ResultsSkeleton() {
  return (
    <div data-testid="results-skeleton" aria-hidden="true">
      <div className="mt-6 flex flex-col gap-4">
        {CARDS.map(({ key }) => (
          <div key={key} className="rounded-md border border-border p-4">
            <div className={`h-6 w-40 ${bar}`} />
            <div className={`mt-3 h-4 w-full ${bar}`} />
            <div className={`mt-2 h-4 w-2/3 ${bar}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
