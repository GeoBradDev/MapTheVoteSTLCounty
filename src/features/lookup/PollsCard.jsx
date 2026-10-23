import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import { CARD_TOPICS } from '../learn/cardTopics.js';
import { getLocale } from '../../i18n/index.js';
import { getTopic } from '../learn/topics.js';
import CountyElectionDayRule from './CountyElectionDayRule.jsx';
import { cityComponent } from './cityComponent.js';
import { orderSites } from '../waitTimes/siteOrder.js';
import { useWaitScale } from '../waitTimes/useWaitScale.js';
import { boardWaits, OFF_WAITS, useWaitTimes } from '../waitTimes/useWaitTimes.js';
import WaitReport from '../waitTimes/WaitReport.jsx';
import { electionDayCountsOn, electionDayStatus } from './electionDay.js';
import NearbySortControls from './NearbySortControls.jsx';
import { useHeldOrder, withKeys } from './nearbySort.js';
import { directionsLinks, isAppleMobile } from './nearbyPolls.js';
import PrecinctMap from './PrecinctMap.jsx';
import RetryButton from './RetryButton.jsx';
import { copy } from './resultsCopy.js';
import StaleNote from './StaleNote.jsx';
import { useJurisdiction } from './jurisdictionContext.js';
import { usePollRooms } from './usePollRooms.js';
import { useNearestSites } from './useNearestSites.js';
import { useNow } from './useNow.js';

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

// The room inside a County place (#100); nothing when it has none.
export function Room({ room }) {
  return room ? <p>{copy.polls.room(room)}</p> : null;
}

// Under a list that shows a room: where the room names come from (#100).
export function RoomSource({ shown }) {
  return shown ? <p className="mt-3 text-sm">{copy.polls.roomSource}</p> : null;
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

// Placeholders shaped like the first rows of the list (a name and distance,
// an address and a row of links each), so the list takes about the same space
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
          <div className="flex min-h-11 items-center">
            <div className={`h-4 w-1/3 ${bar}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A row's heading, the place's name, with its distance on the same line when
 * it fits (#81). `headingRef` is set on the row "Show more" focuses.
 */
export function NameAndDistance({ name, miles, headingRef }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="font-semibold">
        {name}
      </h3>
      <span className="text-sm text-muted">{copy.polls.distance(miles)}</span>
    </div>
  );
}

// A place's key in its board's Election Day line counts (#107): the County's
// polls layer `username`, the City site's name (waitTimes.city.siteField).
const waitKeyOf = { county: (poll) => poll.dayKey, city: (poll) => poll.name };

function PollRow({ poll, room, apple, headingRef, now }) {
  const name = poll.name ?? copy.polls.unnamed(poll.loc);
  const links = directionsLinks(poll);
  const target = <span className="sr-only">{copy.polls.linkTarget(name)}</span>;
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <NameAndDistance name={name} miles={poll.miles} headingRef={headingRef} />
      <WaitReport wait={poll.wait} now={now} />
      <p>{copy.polls.address(poll.address, poll.zip)}</p>
      <Room room={room} />
      <Entrances entry={poll.entry} accessibleEntry={poll.accessibleEntry} />
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
 * polling places (Election Day's date and hours are in the summary, #81), and
 * the jurisdiction's Election Day rule: in the County a registered voter may vote at any County polling place
 * (#152); in the City any City voter may vote at any listed location (#89).
 * While the polls are open on Election Day (#107), each place's current line
 * count from its own board only, a sort by shortest line nearby, and a link to
 * the line counts at every polling place.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   waitSource?: Parameters<typeof useWaitTimes>[0], electionDayOn?: boolean }} props
 *   `origin` is the looked-up point, held in memory only; without one,
 *   distances are from the precinct's center. `waitSource` and
 *   `electionDayOn` (whether config turns the board's Election Day counts on)
 *   are for tests.
 */
export default function PollsCard({ code, origin, waitSource, electionDayOn }) {
  // { rows, loadedAt } once loaded, { error: true, attempt } on failure. A
  // failed load can be tried again; it stays shown while it is (#18). A list
  // left open past the max age refreshes when the tab is shown again (#84).
  const { id, getPolls } = useJurisdiction();
  const isCity = id === 'city';
  const { result, loading, retry, targetRef } = useNearestSites(getPolls, code, origin);
  // Asked for beside the list, never before it: a place shows without its
  // room until the rooms load, or when they fail (#100).
  const rooms = usePollRooms('electionDay', result?.loadedAt);
  const [shown, setShown] = useState(election.nearbyPollCount);
  // The index of the first place a "Show more" revealed, which takes focus.
  const [focusFrom, setFocusFrom] = useState(null);
  const focusRef = useRef(null);

  useEffect(() => {
    if (focusFrom !== null) focusRef.current?.focus();
  }, [focusFrom]);

  const now = useNow();
  const board = isCity ? 'city' : 'county';
  const pollsOpen =
    (electionDayOn ?? electionDayCountsOn(board)) && electionDayStatus(now).kind === 'openNow';
  // Only this board's loop, and only while the polls are open: a County page
  // never asks the City's layer, nor a City page the County's.
  const waits = useWaitTimes(pollsOpen ? (waitSource ?? boardWaits[board]) : OFF_WAITS)[board];
  const waitsOn = pollsOpen && waits.status !== 'off';
  const [sort, setSort] = useState('nearest');

  const loaded = result?.rows;
  const siteWaits = waits.waits;
  const ordered = useMemo(() => {
    if (!loaded) return loaded;
    const keyOf = waitKeyOf[board];
    const byKey = new Map(siteWaits.map((entry) => [entry.siteId, entry]));
    const keyed = withKeys(loaded, keyOf).map((row) => {
      const key = keyOf(row);
      return { ...row, wait: (waitsOn && key && byKey.get(key)) || null };
    });
    if (!waitsOn || sort !== 'nearby') return keyed;
    // Every polling place is open while the polls are.
    return orderSites(keyed, {
      sort,
      waitOf: (row) => row.wait?.value ?? null,
      isOpen: () => true,
    });
  }, [loaded, siteWaits, waitsOn, sort, board]);
  // While focus is in the list, its order holds (#27).
  const { rows, listRef, listProps } = useHeldOrder(ordered);
  const shownRows = rows?.slice(0, shown);
  // The map's line count classes on Election Day (#172): Jenks natural breaks
  // over this board's fresh counts at the polling places listed (and so on the
  // map), by the same rule as the wait times map. The module loads only then.
  const scale = useWaitScale(waitsOn);
  const mapClasses = scale
    ? scale.waitClasses((shownRows ?? []).filter((p) => p.wait).map((p) => p.wait.value))
    : [];
  // The map's places, with their line count color steps on Election Day. The
  // map compares them with what it drew, so a render with the same places and
  // colors redraws nothing.
  const mapPolls = (shownRows ?? []).map((poll) =>
    waitsOn
      ? {
          lat: poll.lat,
          lng: poll.lng,
          bin: scale && poll.wait ? scale.waitColor(poll.wait.value, mapClasses) : null,
        }
      : { lat: poll.lat, lng: poll.lng },
  );
  const noCounts =
    waitsOn &&
    waits.status !== 'loading' &&
    shownRows?.length > 0 &&
    !shownRows.some((p) => p.wait);
  const apple = isAppleMobile(globalThis.navigator);

  function showMore() {
    setFocusFrom(shown);
    setShown(shown + election.nearbyPollCount);
  }

  return (
    <div ref={targetRef} tabIndex={-1} className="mt-2">
      {/* Said while loading too, so the lines do not push the card down when
          the list arrives (#27). The nearest note comes before the list, so it
          is read first: it says the voter may vote at any of them (#152).
          Where distances are measured from is said once, in the summary (#81). */}
      {!result?.error && !(rows && rows.length === 0) && (
        <p>{isCity ? copy.polls.nearestNoteCity : copy.polls.nearestNote}</p>
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
          {waitsOn && <NearbySortControls sort={sort} onSort={setSort} />}
          <ol
            ref={listRef}
            aria-label={copy.polls.listLabel}
            className="mt-3 list-decimal space-y-3 pl-6"
            {...listProps}
          >
            {shownRows.map((poll, i) => (
              <PollRow
                key={poll.key}
                poll={poll}
                room={rooms?.get(poll.loc)}
                apple={apple}
                now={now}
                headingRef={i === focusFrom ? focusRef : undefined}
              />
            ))}
          </ol>
          <RoomSource shown={Boolean(rooms) && shownRows.some((poll) => rooms.has(poll.loc))} />
          {noCounts && <p className="mt-3 text-muted">{copy.polls.waits.none}</p>}
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
          <PrecinctMap code={code} origin={origin} polls={mapPolls} classes={mapClasses} />
        </>
      )}

      {waitsOn && (
        <p className="mt-3">
          <Link href="/early-voting" className={tapLinkClass}>
            {copy.polls.waits.seeAll}
          </Link>
        </p>
      )}

      <VoterIdLink />

      <div className="mt-3">
        {isCity ? (
          <Suspense fallback={null}>
            <CityElectionDayRule linkClass={linkClass} />
          </Suspense>
        ) : (
          <CountyElectionDayRule linkClass={linkClass} />
        )}
      </div>
    </div>
  );
}
