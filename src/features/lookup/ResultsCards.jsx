import { Suspense, useEffect, useId, useState } from 'react';
import election from '../../config/election.js';
import { loadCityClient, loadedCityClient } from '../../data/jurisdictions.js';
import { earlyVotingSeason } from '../waitTimes/earlyVotingSeason.js';
import DistrictsCard from './DistrictsCard.jsx';
import { cityComponent } from './cityComponent.js';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import PollsCard from './PollsCard.jsx';
import { countySchedules } from './countyEarlyVoting.js';
import { useJurisdiction } from './jurisdictionContext.js';
import ResultsSummary, {
  BallotPart,
  ElectionDayPart,
  HoursNote,
  PlaceSkeleton,
  SUMMARY_BOX,
} from './ResultsSummary.jsx';
import { useNow } from './useNow.js';
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
 *   the summary's sample ballot, for a precinct with nothing on the ballot.
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
            // renders at once (cityComponent).
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

// The early voting schedules the summary reads, for the precinct's
// jurisdiction: the County's are in the first load; the City's come with the
// City chunk, which the City precinct request loads first, so null until it is
// here (no new request).
function useSchedules(isCity) {
  const [chunk, setChunk] = useState(() => (isCity ? loadedCityClient() : null));
  useEffect(() => {
    if (!isCity || chunk) return undefined;
    let current = true;
    loadCityClient().then(
      (loaded) => current && setChunk(loaded),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [isCity, chunk]);
  if (!isCity) return countySchedules;
  return chunk?.citySchedules ?? null;
}

/**
 * While the precinct loads: the summary's parts that need no data, for real,
 * as the summary renders them, then placeholders the size of the rest of the
 * summary and the cards, hidden from screen readers. Nothing in it takes
 * focus. At least a screen tall, so the footer starts below the fold and is
 * not pushed down when the longer results replace it (#27).
 *
 * The Election Day part first: its date line is the page's largest text
 * during early voting (#156). Then, as the summary does by the precinct's
 * jurisdiction and the clock, the early voting part's placeholder while its
 * early voting runs, else the sample ballot part, whose fixed intro is the
 * largest text then. For a City precinct those, and the cards below, wait for
 * the City's schedules in the City chunk: they are appended, before the data,
 * so nothing shown moves.
 */
export function ResultsSkeleton() {
  const { id } = useJurisdiction();
  const schedules = useSchedules(id === 'city');
  const now = useNow();
  const during =
    schedules && earlyVotingSeason(schedules, now, election.timeZone).kind === 'during';
  return (
    <div data-testid="results-skeleton" className="min-h-screen">
      <div data-testid="summary-skeleton" className={SUMMARY_BOX}>
        <ElectionDayPart>
          <HoursNote linked={false} />
          <PlaceSkeleton />
        </ElectionDayPart>
        {schedules && during && (
          <div
            data-testid="summary-skeleton-early"
            aria-hidden="true"
            className="border-t border-border pt-3"
          >
            <div className={`h-4 w-28 ${bar}`} />
            <div className={`mt-3 h-11 w-40 ${bar}`} />
          </div>
        )}
        {schedules && !during && (
          <BallotPart>
            {/* The ballot link's place. */}
            <div aria-hidden="true" className={`mt-3 h-15 w-64 max-w-full ${bar}`} />
          </BallotPart>
        )}
      </div>
      {schedules && (
        <div aria-hidden="true" className="mt-6 flex flex-col gap-4">
          {CARDS.map((key) => (
            <div key={key} className="rounded-md border border-border p-4">
              <div className={`h-6 w-40 ${bar}`} />
              <div className={`mt-3 h-4 w-full ${bar}`} />
              <div className={`mt-2 h-4 w-2/3 ${bar}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
