import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import { getPolls } from '../../data/arcgis.js';
import { CARD_TOPICS } from '../learn/cardTopics.js';
import { getTopic } from '../learn/topics.js';
import { distanceOrigin } from './distanceOrigin.js';
import { directionsLinks, isAppleMobile, nearestPolls } from './nearbyPolls.js';
import PrecinctMap from './PrecinctMap.jsx';
import RetryButton from './RetryButton.jsx';
import { copy, sourceName } from './resultsCopy.js';
import { useRetry } from './useRetry.js';

const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;
const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

function OfficialLookupLink() {
  return (
    <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
      {copy.officialLookup}
    </a>
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
  const topic = getTopic(CARD_TOPICS.voterId);
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
 * polling places, Election Day hours, and the rule that any county polling
 * place works.
 * @param {{ code: string, origin: { lat: number, lng: number } | null }} props
 *   `origin` is the looked-up point, held in memory only; without one,
 *   distances are from the precinct's center.
 */
export default function PollsCard({ code, origin }) {
  // { rows } once loaded, { error: true, attempt } on failure.
  const [result, setResult] = useState(null);
  // A failed load can be tried again; it stays shown while it is (#18).
  const { attempt, loading, retry, done, targetRef } = useRetry();
  const [shown, setShown] = useState(election.nearbyPollCount);
  // The index of the first place a "Show more" revealed, which takes focus.
  const [focusFrom, setFocusFrom] = useState(null);
  const focusRef = useRef(null);

  useEffect(() => {
    let current = true;
    Promise.all([getPolls(), distanceOrigin(code, origin)])
      .then(
        ([polls, point]) => ({ rows: nearestPolls(polls, point) }),
        () => ({ error: true, attempt }),
      )
      .then((next) => {
        if (!current) return;
        setResult(next);
        done();
      });
    return () => {
      current = false;
    };
  }, [code, origin, attempt, done]);

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
      {/* Said while loading too, so the line does not push the card down when
          the list arrives (#27). */}
      {!origin && !result?.error && !(rows && rows.length === 0) && (
        <p className="text-muted">{copy.polls.fromCenter(code)}</p>
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

      <p className="mt-3">
        <span>{copy.polls.voteAnywhere}</span>{' '}
        <a href={election.voteAnywhere.sources[0]} rel="noreferrer" className={linkClass}>
          {copy.polls.source}
        </a>
      </p>
    </div>
  );
}
