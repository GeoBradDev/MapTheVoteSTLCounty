import { Suspense, useId } from 'react';
import DistrictsCard from './DistrictsCard.jsx';
import { cityComponent } from './cityComponent.js';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import PollsCard from './PollsCard.jsx';
import ResultsSummary from './ResultsSummary.jsx';
import { useJurisdiction } from './jurisdictionContext.js';
import { copy } from './resultsCopy.js';

// The City's own cards, from the City chunk (#147).
const CityEarlyVotingCard = cityComponent('CityEarlyVotingCard');
const CityDistrictsCard = cityComponent('CityDistrictsCard');

// The card order #11 set. The sample ballot moved up into the summary (#81).
const CARDS = ['polls', 'earlyVoting', 'districts'];

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

/**
 * The summary (#81), then the result cards, in order.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   showBallot: boolean, ballotHtml: unknown, precinct: object }} props
 *   `origin` is the looked-up point, in memory only. `showBallot` false hides
 *   the sample ballot card, for a precinct with nothing on the ballot.
 *   `ballotHtml` is a County precinct's `html` field, which only the sample
 *   ballot parser reads; the card checks its link against `code`. A City
 *   precinct's card never reads it. `precinct` is the
 *   precinct's attributes, for its districts.
 */
export default function ResultsCards({ code, origin, showBallot, ballotHtml, precinct }) {
  const { id } = useJurisdiction();
  const polls = () => <PollsCard code={code} origin={origin} />;
  // The City's cards: polling places (#89), early voting (#91) and districts
  // (#90). Its one sample ballot for all precincts (#92) is in the summary.
  const body =
    id === 'city'
      ? {
          polls,
          earlyVoting: () => (
            // The chunk is already loaded with the City data, so this
            // suspends only for a moment.
            <Suspense fallback={null}>
              <CityEarlyVotingCard code={code} origin={origin} />
            </Suspense>
          ),
          districts: () => (
            <Suspense fallback={null}>
              <CityDistrictsCard code={code} />
            </Suspense>
          ),
        }
      : {
          polls,
          earlyVoting: () => <EarlyVotingCard code={code} origin={origin} />,
          districts: () => <DistrictsCard precinct={precinct} />,
        };
  return (
    <>
      <ResultsSummary code={code} origin={origin} showBallot={showBallot} ballotHtml={ballotHtml} />
      <div className="mt-6 flex flex-col gap-4">
        {CARDS.map((key) => (
          <Card key={key} title={copy.cards[key]}>
            {body[key]()}
          </Card>
        ))}
      </div>
    </>
  );
}

const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

/** One placeholder line, hidden from screen readers. */
export function SkeletonLine({ className }) {
  return <div aria-hidden="true" className={`${className} ${bar}`} />;
}

/**
 * Placeholders the size of the cards, hidden from screen readers. At least a
 * screen tall, so the footer starts below the fold and is not pushed down
 * when the longer results replace it (#27).
 */
export function ResultsSkeleton() {
  return (
    <div data-testid="results-skeleton" aria-hidden="true" className="min-h-screen">
      <div
        data-testid="summary-skeleton"
        className="mt-6 rounded-md border-2 border-border bg-surface-raised p-4"
      >
        <div className={`h-4 w-28 ${bar}`} />
        <div className={`mt-2 h-6 w-full ${bar}`} />
        <div className={`mt-4 h-4 w-3/4 ${bar}`} />
        <div className={`mt-2 h-4 w-1/2 ${bar}`} />
        <div className={`mt-3 h-11 w-40 ${bar}`} />
        <div className={`mt-4 h-11 w-full ${bar}`} />
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {CARDS.map((key) => (
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
