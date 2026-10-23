import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import { CARD_TOPICS } from '../learn/cardTopics.js';
import { getLocale } from '../../i18n/index.js';
import { getTopic } from '../learn/topics.js';
import AssignedPollingPlace from './AssignedPollingPlace.jsx';
import { cityComponent } from './cityComponent.js';
import { directionsLinks, isAppleMobile } from './nearbyPolls.js';
import PrecinctMap from './PrecinctMap.jsx';
import RetryButton from './RetryButton.jsx';
import { copy, sourceName } from './resultsCopy.js';
import StaleNote from './StaleNote.jsx';
import { useJurisdiction } from './jurisdictionContext.js';
import { useNearestSites } from './useNearestSites.js';

// In the City chunk (#147).
const CityElectionDayRule = cityComponent('CityElectionDayRule');

const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;
const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

// The board's own lookup for this precinct's jurisdiction (#89); the early
// voting cards' too (#91).
export function OfficialLookupLink() {
  const { id, officialLookupUrl } = useJurisdiction();
  return (
    <a href={officialLookupUrl} rel="noreferrer" className={linkClass}>
      {copy.officialLookupFor(id)}
    </a>
  );
}

// The City Board's entrance notes (#89), as published; one line when the
// entrance and the accessible entrance are the same. The County has none.
export function Entrances({ entry, accessibleEntry }) {
  if (entry && entry === accessibleEntry) return <p>{copy.polls.entryBoth(entry)}</p>;
  return (
    <>
      {entry && <p>{copy.polls.entry(entry)}</p>}
      {accessibleEntry && <p>{copy.polls.accessibleEntry(accessibleEntry)}</p>}
    </>
  );
}

function Hours() {
  const { open, close, inLineAtCloseMayVote, sources } = election.electionDayHours;
  return (
    <>
      <p className="mt-3">
        <span className="font-semibold">{copy.polls.hoursLabel}</span>{' '}
        {copy.polls.hours(open, close)}
      </p>
      {inLineAtCloseMayVote && <p>{copy.polls.inLine(close)}</p>}
      <p className="text-sm">
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
    </>
  );
}

// Shown only once the voter ID topic is published (#22, #23).
function VoterIdLink() {
  const topic = getTopic(CARD_TOPICS.voterId, getLocale());
  if (!topic) return null;
  return (
    <p className="mt-3">
      {copy.polls.beforeYouGo}{' '}
      <Link href={`/learn/${topic.id}`} className={linkClass}>
        {topic.title}
      </Link>
    </p>
  );
}

// Placeholders shaped like the first rows of the list (a name, an address, a
// distance and a row of links each), so the list takes about the same space
// when it arrives and the page below it does not jump (#27).
function ListSkeleton() {
  const line = (width) => (
    <div className="flex h-6 items-center">
      <div className={`h-4 ${width} ${bar}`} />
    </div>
  );
  return (
    <div data-testid="polls-skeleton" aria-hidden="true" className="mt-3 space-y-3 pl-6">
      {Array.from({ length: election.nearbyPollCount }, (_, i) => (
        <div key={i} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
          {line('w-3/4')}
          {line('w-2/3')}
          {line('w-1/4')}
          <div className="flex min-h-11 items-center">
            <div className={`h-4 w-1/3 ${bar}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PollRow({ poll, apple, headingRef }) {
  const name = poll.name ?? copy.polls.unnamed(poll.loc);
  const links = directionsLinks(poll);
  const target = <span className="sr-only">{copy.polls.linkTarget(name)}</span>;
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="font-semibold">
        {name}
      </h3>
      <p>{copy.polls.address(poll.address, poll.zip)}</p>
      <Entrances entry={poll.entry} accessibleEntry={poll.accessibleEntry} />
      <p className="text-muted">{copy.polls.distance(poll.miles)}</p>
      <p className="flex flex-wrap gap-x-4">
        <a href={links.google} rel="noreferrer" className={tapLinkClass}>
          {copy.polls.directions} {target}
        </a>
        {apple && (
          <a href={links.apple} rel="noreferrer" className={tapLinkClass}>
            {copy.polls.appleMaps} {target}
          </a>
        )}
      </p>
    </li>
  );
}

/**
 * The body of the "Polling places near you" card: the closest Election Day
 * polling places, Election Day hours, and the jurisdiction's Election Day
 * rule: in the County a voter must use their assigned polling place (#72); in
 * the City any City voter may vote at any listed location (#89).
 * @param {{ code: string, origin: { lat: number, lng: number } | null }} props
 *   `origin` is the looked-up point, held in memory only; without one,
 *   distances are from the precinct's center.
 */
export default function PollsCard({ code, origin }) {
  // { rows, loadedAt } once loaded, { error: true, attempt } on failure. A
  // failed load can be tried again; it stays shown while it is (#18). A list
  // left open past the max age refreshes when the tab is shown again (#84).
  const { id, getPolls } = useJurisdiction();
  const isCity = id === 'city';
  const { result, loading, retry, targetRef } = useNearestSites(getPolls, code, origin);
  const [shown, setShown] = useState(election.nearbyPollCount);
  // The index of the first place a "Show more" revealed, which takes focus.
  const [focusFrom, setFocusFrom] = useState(null);
  const focusRef = useRef(null);

  useEffect(() => {
    if (focusFrom !== null) focusRef.current?.focus();
  }, [focusFrom]);

  const rows = result?.rows;
  // One array per change, so the map redraws its markers only when the list does.
  const shownRows = useMemo(() => rows?.slice(0, shown), [rows, shown]);
  const apple = isAppleMobile(globalThis.navigator);

  function showMore() {
    setFocusFrom(shown);
    setShown(shown + election.nearbyPollCount);
  }

  return (
    <div ref={targetRef} tabIndex={-1} className="mt-2">
      {/* Said while loading too, so the lines do not push the card down when
          the list arrives (#27). The nearest note comes before the list, so it
          is read first: county data assigns no polling place to a precinct
          (#72). */}
      {!result?.error && !(rows && rows.length === 0) && (
        <>
          <p>{isCity ? copy.polls.nearestNoteCity : copy.polls.nearestNote}</p>
          {!origin && <p className="mt-2 text-muted">{copy.polls.fromCenter(code)}</p>}
        </>
      )}

      {!result && <ListSkeleton />}

      {result?.error && (
        <>
          <p role="alert">
            {/* A new node per attempt, so a repeated failure is announced again. */}
            <span key={result.attempt}>
              {copy.polls.failed} <OfficialLookupLink />.
            </span>
          </p>
          <RetryButton onRetry={retry} busy={loading} className="mt-2" />
        </>
      )}

      {rows && rows.length === 0 && (
        <p>
          {copy.polls.none} <OfficialLookupLink />.
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          <ol aria-label={copy.polls.listLabel} className="mt-3 list-decimal space-y-3 pl-6">
            {shownRows.map((poll, i) => (
              <PollRow
                key={`${poll.loc}:${i}`}
                poll={poll}
                apple={apple}
                headingRef={i === focusFrom ? focusRef : undefined}
              />
            ))}
          </ol>
          {result.refreshFailed && <StaleNote loadedAt={result.loadedAt} />}
          {shown < rows.length && (
            <button
              type="button"
              onClick={showMore}
              className="mt-3 min-h-11 rounded-md border border-border px-4 font-semibold text-primary"
            >
              {copy.polls.showMore}
            </button>
          )}
          {/* After the list, which holds everything on it, so on a phone the
              list comes first and the map loads only when scrolled to (#27). */}
          <PrecinctMap code={code} origin={origin} polls={shownRows} />
        </>
      )}

      <Hours />

      <VoterIdLink />

      <div className="mt-3">
        {isCity ? (
          <Suspense fallback={null}>
            <CityElectionDayRule linkClass={linkClass} />
          </Suspense>
        ) : (
          <AssignedPollingPlace linkClass={linkClass} />
        )}
      </div>

      <p className="mt-3">{copy.polls.earlyVotingPointer}</p>
    </div>
  );
}
