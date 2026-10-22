import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import { getAbsenteeSites } from '../../data/arcgis.js';
import { CARD_TOPICS } from '../learn/cardTopics.js';
import { getLocale, translated } from '../../i18n/index.js';
import { getTopic } from '../learn/topics.js';
import { earlyVotingSeason } from '../waitTimes/earlyVotingSeason.js';
import { NEARBY_MILES, orderSites } from '../waitTimes/siteOrder.js';
import { createWaitTimesStore, useWaitTimes } from '../waitTimes/useWaitTimes.js';
import WaitReport from '../waitTimes/WaitReport.jsx';
import { copy as waitCopy } from '../waitTimes/waitTimesCopy.js';
import { earlyVotingStatus, formatLongDate, scheduleLines } from './earlyVoting.js';
import { directionsLinks, isAppleMobile } from './nearbyPolls.js';
import { copy, sourceName } from './resultsCopy.js';
import RetryButton from './RetryButton.jsx';
import StaleNote from './StaleNote.jsx';
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

// Read instead of the shared loop outside early voting, so the results page
// asks the line count layers only while early voting runs.
const OFF_STATE = createWaitTimesStore({ county: null, city: null }).getServerSnapshot();
const OFF_SOURCE = {
  subscribe: () => () => {},
  getSnapshot: () => OFF_STATE,
  getServerSnapshot: () => OFF_STATE,
};

const isOpenNow = (site, now) =>
  earlyVotingStatus(schedules[site.absType], now, election.timeZone).kind === 'openNow';

/**
 * A key per row that stays the same when the rows are reordered or a count
 * changes, so a refresh never remounts the row that has focus. Rows that
 * share a location number and wait key get a running suffix, in the
 * nearest-first order the rows arrive in.
 */
function withKeys(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const base = `${row.loc}:${row.waitKey}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...row, key: n === 0 ? base : `${base}:${n}` };
  });
}

// The rows in the held order: rows it does not know go last, in their order.
function inHeldOrder(rows, held) {
  const rank = new Map(held.map((key, i) => [key, i]));
  const at = (row, i) => rank.get(row.key) ?? held.length + i;
  return rows
    .map((row, i) => [at(row, i), row])
    .sort((x, y) => x[0] - y[0])
    .map(([, row]) => row);
}

function SortControls({ sort, onSort }) {
  const id = useId();
  const options = [
    ['nearest', t.waits.nearest],
    ['nearby', waitCopy.sort.nearby(NEARBY_MILES)],
  ];
  return (
    <fieldset role="radiogroup" aria-labelledby={`${id}-legend`} className="mt-3">
      <legend id={`${id}-legend`} className="font-semibold">
        {waitCopy.sort.legend}
      </legend>
      <div className="mt-1 flex flex-col">
        {options.map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name={`${id}-sort`}
              value={value}
              checked={sort === value}
              onChange={() => onSort(value)}
              className="size-5 accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function statusText(key, now) {
  return t.status(earlyVotingStatus(schedules[key], now, election.timeZone), formatLongDate);
}

function OfficialLookupLink() {
  return (
    <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
      {copy.officialLookup}
    </a>
  );
}

function SiteRow({ site, now, apple, headingRef }) {
  const name = site.name ?? copy.polls.unnamed(site.loc);
  const links = directionsLinks(site);
  const target = <span className="sr-only">{copy.polls.linkTarget(name)}</span>;
  const kind = t.siteKinds[site.absType];
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="font-semibold">
        {name}
      </h3>
      {kind && (
        <p>
          {kind}. {schedules[site.absType] && statusText(site.absType, now)}
        </p>
      )}
      <WaitReport wait={site.wait} now={now} />
      <p>{copy.polls.address(site.address, site.zip)}</p>
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
 * The body of the "Early voting" card: the nearest in-person absentee sites,
 * whether each kind of site is open now, and the county's dates and hours.
 * While early voting runs, each site's current line count from the shared
 * #103 loop, a sort by shortest line nearby, and a link to the wait times
 * page (#105).
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   waitSource?: Parameters<typeof useWaitTimes>[0] }} props
 *   `origin` is the looked-up point, held in memory only; without one,
 *   distances are from the precinct's center. `waitSource` is for tests.
 */
export default function EarlyVotingCard({ code, origin, waitSource }) {
  // The absentee topic, once published (#22, #23); until then, the index.
  const absentee = getTopic(CARD_TOPICS.absentee, getLocale());
  // { rows, loadedAt } once loaded, { error: true, attempt } on failure. A
  // failed load can be tried again; it stays shown while it is (#18). A list
  // left open past the max age refreshes when the tab is shown again (#84).
  const { result, loading, retry, targetRef } = useNearestSites(getAbsenteeSites, code, origin);
  const [showAll, setShowAll] = useState(false);
  const focusRef = useRef(null);
  const now = useNow();
  const season = earlyVotingSeason(schedules, now, election.timeZone).kind;
  const during = season === 'during';
  const waits = useWaitTimes(during ? waitSource : OFF_SOURCE);
  const [sort, setSort] = useState('nearest');
  // The row keys in the order shown when focus entered the list. While focus
  // is in it the order holds, so a refresh never moves (and so blurs) the
  // focused row; the current order applies once focus leaves (#27).
  const [held, setHeld] = useState(null);
  const listRef = useRef(null);
  useEffect(() => {
    if (showAll) focusRef.current?.focus();
  }, [showAll]);

  const loaded = result?.rows;
  const countyWaits = waits.county.waits;
  // Counts can show: early voting is running and the County source is on.
  const waitsOn = during && waits.county.status !== 'off';
  const ordered = useMemo(() => {
    if (!loaded) return loaded;
    const byKey = new Map(countyWaits.map((entry) => [entry.siteId, entry]));
    const rows = withKeys(loaded).map((row) => ({
      ...row,
      wait: (waitsOn && row.waitKey && byKey.get(row.waitKey)) || null,
    }));
    if (!waitsOn || sort !== 'nearby') return rows;
    return orderSites(rows, {
      sort,
      waitOf: (row) => row.wait?.value ?? null,
      isOpen: (row) => isOpenNow(row, now),
    });
  }, [loaded, countyWaits, waitsOn, sort, now]);
  const rows = held && ordered ? inHeldOrder(ordered, held) : ordered;
  // Focus can leave the list with no blur reaching it (the focused row was
  // removed, #84): when the rows change, let go of the held order if focus is
  // elsewhere.
  useEffect(() => {
    if (held && !listRef.current?.contains(document.activeElement)) setHeld(null);
  }, [held, ordered]);
  const first = election.nearbyPollCount;
  const shownRows = showAll ? rows : rows?.slice(0, first);
  const noCounts =
    waitsOn &&
    waits.county.status !== 'loading' &&
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
          {waitsOn && <SortControls sort={sort} onSort={setSort} />}
          <ol
            ref={listRef}
            aria-label={t.listLabel}
            className="mt-3 list-decimal space-y-3 pl-6"
            onFocus={() => setHeld((keys) => keys ?? rows.map((row) => row.key))}
            onBlur={(event) => {
              // Focus moved outside the list. Not when the window lost focus:
              // the row link is then still the active element.
              const list = event.currentTarget;
              if (!list.contains(event.relatedTarget) && !list.contains(document.activeElement)) {
                setHeld(null);
              }
            }}
          >
            {shownRows.map((site, i) => (
              <SiteRow
                key={site.key}
                site={site}
                now={now}
                apple={apple}
                headingRef={showAll && i === first ? focusRef : undefined}
              />
            ))}
          </ol>
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

      <Schedules now={now} />

      <p className="mt-3">
        {t.mail}{' '}
        <Link href={absentee ? `/learn/${absentee.id}` : '/learn'} className={linkClass}>
          {absentee ? absentee.title : t.howToVote}
        </Link>{' '}
        {t.or}{' '}
        <a href={election.countySiteUrl} rel="noreferrer" className={linkClass}>
          {t.countySite}
        </a>
        .
      </p>
    </div>
  );
}
