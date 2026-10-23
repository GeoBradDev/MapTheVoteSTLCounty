import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import { CARD_TOPICS } from '../learn/cardTopics.js';
import { getLocale, translated } from '../../i18n/index.js';
import { getTopic } from '../learn/topics.js';
import { earlyVotingSeason } from '../waitTimes/earlyVotingSeason.js';
import { orderSites } from '../waitTimes/siteOrder.js';
import { OFF_WAITS, useWaitTimes } from '../waitTimes/useWaitTimes.js';
import WaitReport from '../waitTimes/WaitReport.jsx';
import { earlyVotingStatus, formatLongDate, scheduleLines } from './earlyVoting.js';
import { directionsLinks, isAppleMobile } from './nearbyPolls.js';
import { copy, sourceName } from './resultsCopy.js';
import RetryButton from './RetryButton.jsx';
import StaleNote from './StaleNote.jsx';
import { useJurisdiction } from './jurisdictionContext.js';
import NearbySortControls from './NearbySortControls.jsx';
import { useHeldOrder, withKeys } from './nearbySort.js';
import { Entrances, OfficialLookupLink, Room, RoomSource } from './PollsCard.jsx';
import { usePollRooms } from './usePollRooms.js';
import { useNearestSites } from './useNearestSites.js';
import { useNow } from './useNow.js';

const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;
const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

// The early voting text in the current language.
const t = translated(() => copy.earlyVoting);
const { schedules, sources, lastVerified } = election.earlyVoting;
// The groups the config has hours for, in config order, that have a label.
const groupKeys = Object.keys(schedules).filter((key) => t.groups[key]);

function statusText(key, now) {
  return t.status(earlyVotingStatus(schedules[key], now, election.timeZone), formatLongDate);
}

// The County row's kind of site and its status today.
function CountyDetail({ site, now }) {
  const kind = t.siteKinds[site.absType];
  if (!kind) return null;
  return (
    <p>
      {kind}. {schedules[site.absType] && statusText(site.absType, now)}
    </p>
  );
}

function SiteRow({ site, room, now, apple, headingRef, Detail }) {
  const name = site.name ?? copy.polls.unnamed(site.loc);
  const links = directionsLinks(site);
  const target = <span className="sr-only">{copy.polls.linkTarget(name)}</span>;
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="font-semibold">
        {name}
      </h3>
      <Detail site={site} now={now} />
      <WaitReport wait={site.wait} now={now} />
      <p>{copy.polls.address(site.address, site.zip)}</p>
      <Room room={room} />
      <Entrances entry={site.entry} accessibleEntry={site.accessibleEntry} />
      <p className="text-muted">{copy.polls.distance(site.miles)}</p>
      {site.absNote && (
        <p>
          <span className="font-semibold">{t.note}</span> {site.absNote}
        </p>
      )}
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

function Schedules({ now }) {
  return (
    <>
      <h3 className="mt-4 font-semibold">{t.groupsLabel}</h3>
      {groupKeys.map((key) => (
        <div key={key} className="mt-2">
          <h4 className="font-semibold">{t.groups[key]}</h4>
          <p>{statusText(key, now)}</p>
          <ul className="list-disc pl-6">
            {scheduleLines(schedules[key]).map((line, i) => (
              <li key={i}>
                {t.days(line)}: {t.hours(line.open, line.close)}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-2 text-sm">
        {copy.polls.source}:{' '}
        {sources.map((url, i) => (
          <span key={url}>
            {i > 0 && ', '}
            <a href={url} rel="noreferrer" className={linkClass}>
              {sourceName(url)}
            </a>
          </span>
        ))}
        . {t.lastVerified(formatLongDate(lastVerified, { year: true }))}
      </p>
    </>
  );
}

/**
 * The nearest early voting sites of the voter's jurisdiction, for the County
 * card below and the City's (CityEarlyVotingCard, in the City chunk): each
 * site's status, address and directions, and while early voting runs its
 * current line count (from the shared #103 loop, or `waitSource`), a sort by shortest line
 * nearby, and a link to the wait times page (#105).
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   waitSource?: Parameters<typeof useWaitTimes>[0],
 *   schedules: Record<string, import('../../config/election.js').ScheduleEntry[]>,
 *   scheduleOf: (site: object) => import('../../config/election.js').ScheduleEntry[] | undefined,
 *   waits: 'county' | 'city', waitKeyOf: (site: object) => string | null,
 *   Detail: (props: { site: object, now: number }) => import('react').ReactNode }} props
 *   `origin` is the looked-up point, held in memory only; without one,
 *   distances are from the precinct's center. `waitSource` is for tests.
 *   `schedules` is every schedule of the jurisdiction, for whether early
 *   voting runs; `scheduleOf` a site's own. `waits` names the line count
 *   source and `waitKeyOf` a site's key in it. `Detail` renders a site's
 *   status lines. The failure lines end with the jurisdiction's own lookup.
 *   `children` follow the list (the card's dates, hours and links), inside
 *   the card, which takes focus when a retry or refresh removes the focused
 *   element.
 */
export function EarlyVotingSites({
  code,
  origin,
  waitSource,
  schedules: all,
  scheduleOf,
  waits: waitsKey,
  waitKeyOf,
  Detail,
  children,
}) {
  // { rows, loadedAt } once loaded, { error: true, attempt } on failure. A
  // failed load can be tried again; it stays shown while it is (#18). A list
  // left open past the max age refreshes when the tab is shown again (#84).
  const { getEarlyVotingSites } = useJurisdiction();
  const { result, loading, retry, targetRef } = useNearestSites(getEarlyVotingSites, code, origin);
  // The County's early voting rooms (#100), keyed by `loc_abs`; none for the City.
  const rooms = usePollRooms('absentee', result?.loadedAt);
  const [showAll, setShowAll] = useState(false);
  const focusRef = useRef(null);
  const now = useNow();
  const season = earlyVotingSeason(all, now, election.timeZone).kind;
  const during = season === 'during';
  // Read instead of the shared loop outside early voting, so the results
  // page asks the line count layers only while early voting runs.
  const waits = useWaitTimes(during ? waitSource : OFF_WAITS)[waitsKey];
  const [sort, setSort] = useState('nearest');
  useEffect(() => {
    if (showAll) focusRef.current?.focus();
  }, [showAll]);

  const loaded = result?.rows;
  const siteWaits = waits.waits;
  // Counts can show: early voting is running and the source is on.
  const waitsOn = during && waits.status !== 'off';
  const ordered = useMemo(() => {
    if (!loaded) return loaded;
    const byKey = new Map(siteWaits.map((entry) => [entry.siteId, entry]));
    const rows = withKeys(loaded, (row) => row.waitKey).map((row) => {
      const waitKey = waitKeyOf(row);
      return { ...row, wait: (waitsOn && waitKey && byKey.get(waitKey)) || null };
    });
    if (!waitsOn || sort !== 'nearby') return rows;
    return orderSites(rows, {
      sort,
      waitOf: (row) => row.wait?.value ?? null,
      isOpen: (row) =>
        earlyVotingStatus(scheduleOf(row), now, election.timeZone).kind === 'openNow',
    });
  }, [loaded, siteWaits, waitsOn, sort, now, scheduleOf, waitKeyOf]);
  // While focus is in the list, its order holds (#27).
  const { rows, listRef, listProps } = useHeldOrder(ordered);
  const first = election.nearbyPollCount;
  const shownRows = showAll ? rows : rows?.slice(0, first);
  const noCounts =
    waitsOn &&
    waits.status !== 'loading' &&
    shownRows?.length > 0 &&
    !shownRows.some((row) => row.wait);
  const apple = isAppleMobile(globalThis.navigator);

  return (
    <div ref={targetRef} tabIndex={-1} className="mt-2">
      <p>{t.intro}</p>

      {!result && (
        <div data-testid="early-voting-skeleton" aria-hidden="true" className="mt-3">
          <div className={`h-4 w-3/4 ${bar}`} />
          <div className={`mt-2 h-4 w-1/2 ${bar}`} />
        </div>
      )}

      {result?.error && (
        <>
          <p role="alert" className="mt-3">
            {/* A new node per attempt, so a repeated failure is announced again. */}
            <span key={result.attempt}>
              {t.failed} <OfficialLookupLink />.
            </span>
          </p>
          <RetryButton onRetry={retry} busy={loading} className="mt-2" />
        </>
      )}

      {rows && rows.length === 0 && (
        <p className="mt-3">
          {t.none} <OfficialLookupLink />.
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          {!origin && <p className="mt-3 text-muted">{copy.polls.fromCenter(code)}</p>}
          {waitsOn && <NearbySortControls sort={sort} onSort={setSort} />}
          <ol
            ref={listRef}
            aria-label={t.listLabel}
            className="mt-3 list-decimal space-y-3 pl-6"
            {...listProps}
          >
            {shownRows.map((site, i) => (
              <SiteRow
                key={site.key}
                site={site}
                room={site.absLoc ? rooms?.get(site.absLoc) : undefined}
                now={now}
                apple={apple}
                Detail={Detail}
                headingRef={showAll && i === first ? focusRef : undefined}
              />
            ))}
          </ol>
          <RoomSource
            shown={
              Boolean(rooms) && shownRows.some((site) => site.absLoc && rooms.has(site.absLoc))
            }
          />
          {noCounts && <p className="mt-3 text-muted">{t.waits.none}</p>}
          {result.refreshFailed && <StaleNote loadedAt={result.loadedAt} />}
          {!showAll && rows.length > first && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 min-h-11 rounded-md border border-border px-4 font-semibold text-primary"
            >
              {t.showAll(rows.length)}
            </button>
          )}
        </>
      )}

      {season !== 'ended' && (
        <p className="mt-3">
          <Link href="/early-voting" className={tapLinkClass}>
            {t.waits.seeAll}
          </Link>
        </p>
      )}

      {children}
    </div>
  );
}

/**
 * The closing line: mail-in and absentee ballots are in How to vote (the
 * absentee topic once published, #22, #23) and on the board's own page.
 * @param {{ href: string, label: string }} props
 */
export function MailLine({ href, label }) {
  const absentee = getTopic(CARD_TOPICS.absentee, getLocale());
  return (
    <p className="mt-3">
      {t.mail}{' '}
      <Link href={absentee ? `/learn/${absentee.id}` : '/learn'} className={linkClass}>
        {absentee ? absentee.title : t.howToVote}
      </Link>{' '}
      {t.or}{' '}
      <a href={href} rel="noreferrer" className={linkClass}>
        {label}
      </a>
      .
    </p>
  );
}

const countySchedule = (site) => schedules[site.absType];
const countyWaitKey = (site) => site.waitKey;

/**
 * The body of the County's "Early voting" card: the nearest in-person
 * absentee sites (EarlyVotingSites), whether each kind of site is open now,
 * and the county's dates and hours.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   waitSource?: Parameters<typeof useWaitTimes>[0] }} props
 */
export default function EarlyVotingCard({ code, origin, waitSource }) {
  const now = useNow();
  return (
    <EarlyVotingSites
      code={code}
      origin={origin}
      waitSource={waitSource}
      schedules={schedules}
      scheduleOf={countySchedule}
      waits="county"
      waitKeyOf={countyWaitKey}
      Detail={CountyDetail}
    >
      <Schedules now={now} />
      <MailLine href={election.countySiteUrl} label={t.countySite} />
    </EarlyVotingSites>
  );
}
