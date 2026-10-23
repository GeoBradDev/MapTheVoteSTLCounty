import { Suspense, useId } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import { earlyVotingSeason } from '../waitTimes/earlyVotingSeason.js';
import { OFF_WAITS, useWaitTimes } from '../waitTimes/useWaitTimes.js';
import WaitReport from '../waitTimes/WaitReport.jsx';
import { cityComponent } from './cityComponent.js';
import { earlyVotingStatus, formatLongDate } from './earlyVoting.js';
import { countySchedule, countySchedules, countyWaitKey } from './countyEarlyVoting.js';
import { useJurisdiction } from './jurisdictionContext.js';
import { directionsLinks } from './nearbyPolls.js';
import { copy, formatTime, sourceName } from './resultsCopy.js';
import SampleBallotCard from './SampleBallotCard.jsx';
import { useNearestSites } from './useNearestSites.js';
import { useNow } from './useNow.js';

// From the City chunk (#147), already loaded with the City data.
const CitySampleBallotCard = cityComponent('CitySampleBallotCard');
const CityEarlyVoteSummary = cityComponent('CityEarlyVoteSummary');

const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';
/** The summary's box, also the results skeleton's (ResultsCards.jsx). */
export const SUMMARY_BOX =
  'mt-4 flex flex-col gap-3 rounded-md border-2 border-primary bg-surface-raised p-4';
// Local until the shared Button and Link components land (#78).
const directionsClass =
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-primary px-4 font-semibold text-primary';
const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;

// A right-pointing arrow, drawn in the text color. Decoration only.
function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
      <path d="M9.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 1 1-1.4-1.4L11.6 9H2a1 1 0 1 1 0-2h9.6L9.3 4.7a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

// One section of the summary, with its own heading, so each is a region a
// screen reader can jump to.
function Part({ title, children }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="border-t border-border pt-3 first:border-t-0 first:pt-0"
    >
      <h2 id={headingId} className="text-sm font-semibold tracking-wide text-primary uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

// One placeholder line of the given height class, its bar the given width.
const line = (height, width) => (
  <div className={`flex ${height} items-center`}>
    <div className={`h-4 ${width} ${bar}`} />
  </div>
);

// Placeholder lines at least the height of a place's label, name and address,
// with `early` the line of an early voting site's status, with `count` the
// two of its line count, and its directions button, so nothing below moves
// when it loads (#27).
export function PlaceSkeleton({ testId, early = false, count = false }) {
  return (
    <div data-testid={testId} aria-hidden="true" className="mt-2">
      {line('h-5', 'w-1/2')}
      {line('h-6', 'w-3/4')}
      {line('h-6', 'w-2/3')}
      {early && line('h-6', 'w-1/2')}
      {count && line('h-6', 'w-2/3')}
      {count && line('h-5', 'w-1/2')}
      <div className={`mt-1 h-11 w-40 ${bar}`} />
    </div>
  );
}

// A place: what it is and how far, its name and address, then `children` (its
// status) and a directions link.
function Place({ label, place, children }) {
  const name = place.name ?? copy.polls.unnamed(place.loc);
  return (
    <>
      <p className="mt-2 text-sm text-muted">
        {label}
        {' · '}
        {copy.polls.distance(place.miles)}
      </p>
      <p className="font-semibold">{name}</p>
      <p>{copy.polls.address(place.address, place.zip)}</p>
      {children}
      <p className="mt-1">
        <a href={directionsLinks(place).google} rel="noreferrer" className={directionsClass}>
          {copy.polls.directions} <span className="sr-only">{copy.polls.linkTarget(name)}</span>
          <Arrow />
        </a>
      </p>
    </>
  );
}

// Who may still vote at closing time, and where the hours come from.
function HoursNote() {
  const { close, inLineAtCloseMayVote, sources } = election.electionDayHours;
  return (
    <p className="text-xs">
      {inLineAtCloseMayVote && <>{copy.polls.inLine(close)} </>}
      {copy.polls.source}:{' '}
      {sources.map((url, i) => (
        <span key={url}>
          {i > 0 && ', '}
          <a href={url} rel="noreferrer" className={linkClass}>
            {sourceName(url)}
          </a>
        </span>
      ))}
    </p>
  );
}

/**
 * The summary's Election Day part: its heading, Election Day's date and
 * hours, and the hours note, then `children`. Data independent, so the results
 * skeleton shows it too while the precinct loads (#27, #156): the date line is
 * the page's largest text, and the loaded summary repaints it at the same
 * size, so LCP does not wait for the precinct request.
 */
export function ElectionDayPart({ children }) {
  const { open, close } = election.electionDayHours;
  return (
    <Part title={copy.summary.electionDay}>
      <p className="mt-1 font-semibold sm:text-lg">
        {copy.summary.when(
          formatLongDate(election.electionDate),
          formatTime(open),
          formatTime(close),
        )}
      </p>
      <HoursNote />
      {children}
    </Part>
  );
}

// Election Day's date and hours, and the nearest polling place. A failed or
// empty list shows nothing here: the polling places card below says so and
// offers Try again (#18).
function ElectionDay({ code, origin }) {
  const { getPolls } = useJurisdiction();
  const { result } = useNearestSites(getPolls, code, origin);
  const nearest = result?.rows?.[0];
  return (
    <ElectionDayPart>
      {!result && <PlaceSkeleton testId="summary-poll-skeleton" />}
      {nearest && <Place label={copy.summary.nearestPoll} place={nearest} />}
    </ElectionDayPart>
  );
}

/**
 * While early voting runs, the nearest early voting site of the precinct's
 * jurisdiction that is open now (else the nearest site, with when it opens),
 * its current line count or the no-data state, and the link to every site's
 * wait (#81, #105). It reads the same line count loop as the early voting
 * card, and only while early voting runs, so the results page asks the line
 * count layers only then. Nothing outside early voting. The County's is below;
 * the City's (CityEarlyVoteSummary) is in the City chunk.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   waitSource?: Parameters<typeof useWaitTimes>[0],
 *   schedules: Record<string, import('../../config/election.js').ScheduleEntry[]>,
 *   scheduleOf: (site: object) => import('../../config/election.js').ScheduleEntry[] | undefined,
 *   waits: 'county' | 'city', waitKeyOf: (site: object) => string | null }} props
 *   As for EarlyVotingSites.
 */
export function EarlyVoteSummary({
  code,
  origin,
  waitSource,
  schedules,
  scheduleOf,
  waits: waitsKey,
  waitKeyOf,
}) {
  const { getEarlyVotingSites } = useJurisdiction();
  const { result } = useNearestSites(getEarlyVotingSites, code, origin);
  const now = useNow();
  const during = earlyVotingSeason(schedules, now, election.timeZone).kind === 'during';
  const waits = useWaitTimes(during ? waitSource : OFF_WAITS)[waitsKey];
  if (!during) return null;
  // A count can show only while some site is open now and the counts are on,
  // so the placeholder holds its lines only then.
  const anyOpen = Object.values(schedules).some(
    (list) => earlyVotingStatus(list, now, election.timeZone).kind === 'openNow',
  );

  const rows = result?.rows;
  // A site the schedules do not cover has no status, as on the card.
  const statusOf = (site) => {
    const schedule = scheduleOf(site);
    return schedule ? earlyVotingStatus(schedule, now, election.timeZone) : null;
  };
  const openSite = rows?.find((site) => statusOf(site)?.kind === 'openNow');
  const site = openSite ?? rows?.[0];
  const siteStatus = site && statusOf(site);
  const key = site && waitKeyOf(site);
  const wait = (key && waits.waits.find((entry) => entry.siteId === key)) || null;
  return (
    <Part title={copy.summary.early}>
      {!result && (
        <PlaceSkeleton
          testId="summary-early-skeleton"
          early
          count={anyOpen && waits.status !== 'off'}
        />
      )}
      {site && (
        <Place label={openSite ? copy.summary.nearestOpen : copy.summary.nearestSite} place={site}>
          {siteStatus && <p>{copy.earlyVoting.status(siteStatus, formatLongDate)}</p>}
          {/* A count shows only for a site open now; while the first
                counts load, two lines hold the count and its board (#27). */}
          {openSite && waits.status === 'loading' && (
            <div data-testid="summary-count-skeleton" aria-hidden="true">
              {line('h-6', 'w-2/3')}
              {line('h-5', 'w-1/2')}
            </div>
          )}
          {openSite && waits.status !== 'off' && waits.status !== 'loading' && (
            <WaitReport wait={wait} now={now} showNone />
          )}
        </Place>
      )}
      <p>
        <Link href="/early-voting" className={tapLinkClass}>
          {copy.earlyVoting.waits.seeAll}
        </Link>
      </p>
    </Part>
  );
}

/**
 * The answer first (#81): Election Day's date and hours with the nearest
 * polling place, while early voting runs the nearest open early voting site
 * and its line count, and the sample ballot. Each from the same shared
 * requests and line count loops as the cards below, so nothing new is asked.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   showBallot: boolean, ballotHtml: unknown,
 *   waitSource?: Parameters<typeof useWaitTimes>[0] }} props
 *   `waitSource` is for tests.
 */
export default function ResultsSummary({ code, origin, showBallot, ballotHtml, waitSource }) {
  const { id } = useJurisdiction();
  const isCity = id === 'city';
  return (
    <div className={SUMMARY_BOX}>
      <ElectionDay code={code} origin={origin} />
      {isCity ? (
        <Suspense fallback={null}>
          <CityEarlyVoteSummary code={code} origin={origin} />
        </Suspense>
      ) : (
        <EarlyVoteSummary
          code={code}
          origin={origin}
          waitSource={waitSource}
          schedules={countySchedules}
          scheduleOf={countySchedule}
          waits="county"
          waitKeyOf={countyWaitKey}
        />
      )}
      {/* None for a precinct with nothing on the ballot: its banner says so. */}
      {showBallot && (
        <Part title={copy.cards.ballot}>
          {isCity ? (
            <Suspense fallback={null}>
              <CitySampleBallotCard />
            </Suspense>
          ) : (
            <SampleBallotCard html={ballotHtml} code={code} />
          )}
        </Part>
      )}
      {!origin && <p className="text-sm text-muted">{copy.polls.fromCenter(code)}</p>}
    </div>
  );
}
