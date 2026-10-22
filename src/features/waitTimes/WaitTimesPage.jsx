import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { usePageTitle } from '../../components/usePageTitle.js';
import election from '../../config/election.js';
import { getAbsenteeSites } from '../../data/arcgis.js';
import { isFresh, layerMaxAgeMs } from '../../data/freshness.js';
import { reportedTimeParts } from '../../data/waitTimes.js';
import { focusHeadingOnArrival } from '../../hydrate.js';
import { getDeviceLocation } from '../lookup/deviceLocation.js';
import { earlyVotingStatus, formatLongDate, hoursOn, zonedNow } from '../lookup/earlyVoting.js';
import { distanceMiles, directionsLinks, isAppleMobile, pollRows } from '../lookup/nearbyPolls.js';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import RetryButton from '../lookup/RetryButton.jsx';
import { useNow } from '../lookup/useNow.js';
import { useRetry } from '../lookup/useRetry.js';
import { earlyVotingSeason } from './earlyVotingSeason.js';
import { NEARBY_MILES, orderSites, waitBin } from './siteOrder.js';
import { useWaitTimes } from './useWaitTimes.js';
import { canDrawMap } from './canDrawMap.js';
import WaitTimesMap from './WaitTimesMap.jsx';
import { copy } from './waitTimesCopy.js';

const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;
const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';
const buttonClass =
  'min-h-11 rounded-md border border-primary px-4 py-2 font-semibold text-primary aria-disabled:cursor-wait aria-disabled:opacity-70';

/** The status line changes at most this often, so it is not re-announced every refresh. */
export const ANNOUNCE_MS = 5 * 60_000;

const { schedules } = election.earlyVoting;
const { county, city, refreshSeconds } = election.waitTimes;

// HH:MM of a time in the election's zone.
function clockTime(at) {
  const { minutes } = zonedNow(at, election.timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * When the counts were last checked, as the status line shows it: it moves on
 * only to a check at least ANNOUNCE_MS after the one shown (or to any check
 * when the clock went back), so a screen reader hears it at most that often.
 * @param {number | null} latest When the counts were last checked (ms).
 * @returns {number | null}
 */
function useShownCheck(latest) {
  const [shown, setShown] = useState(latest);
  if (latest !== null && (shown === null || latest < shown || latest - shown >= ANNOUNCE_MS)) {
    setShown(latest);
  }
  return shown;
}

/**
 * The absentee sites, loaded once with a retry on failure (#18), and loaded
 * again when the tab is shown after the layer max age (#84). A refresh that
 * fails keeps the rows.
 */
function useSites(loadSites) {
  const [result, setResult] = useState(null);
  const { attempt, loading, retry, done, targetRef } = useRetry();
  const [refresh, setRefresh] = useState(0);
  const loadedAtRef = useRef(null);

  useEffect(() => {
    loadedAtRef.current = result?.rows ? result.loadedAt : null;
  }, [result]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const loadedAt = loadedAtRef.current;
      if (loadedAt !== null && !isFresh(loadedAt, layerMaxAgeMs())) setRefresh((n) => n + 1);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    let current = true;
    loadSites()
      .then(
        (layer) => ({ rows: pollRows(layer), loadedAt: layer.loadedAt ?? Date.now() }),
        () => ({ error: true, attempt }),
      )
      .then((next) => {
        if (!current) return;
        setResult((prev) => (next.error && prev?.rows ? prev : next));
        done();
      });
    return () => {
      current = false;
    };
  }, [loadSites, attempt, done, refresh]);

  return { result, loading, retry, targetRef };
}

function OfficialLookupLink() {
  return (
    <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
      {resultsCopy.officialLookup}
    </a>
  );
}

function SiteRow({ site, now, apple }) {
  const name = site.name ?? resultsCopy.polls.unnamed(site.loc);
  const links = directionsLinks(site);
  const target = <span className="sr-only">{resultsCopy.polls.linkTarget(name)}</span>;
  const kind = resultsCopy.earlyVoting.siteKinds[site.absType];
  const schedule = schedules[site.absType];
  const today = schedule && hoursOn(schedule, zonedNow(now, election.timeZone).date);
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 className="font-semibold">{name}</h3>
      <p className={site.wait ? 'font-semibold' : 'text-muted'}>
        {site.wait
          ? copy.count(site.wait.value, reportedTimeParts(site.wait, now).time)
          : copy.noCount}
      </p>
      {site.wait && <p className="text-sm text-muted">{copy.reportedBy(site.wait.source)}</p>}
      <p>
        {kind && `${kind}. `}
        {schedule && resultsCopy.earlyVoting.status(site.status, formatLongDate)}
      </p>
      {today && <p>{copy.todayHours(today.open, today.close)}</p>}
      <p>{resultsCopy.polls.address(site.address, site.zip)}</p>
      {site.miles !== null && (
        <p className="text-muted">{resultsCopy.polls.distance(site.miles)}</p>
      )}
      {site.absNote && (
        <p>
          <span className="font-semibold">{resultsCopy.earlyVoting.note}</span> {site.absNote}
        </p>
      )}
      <p className="flex flex-wrap gap-x-4">
        <a href={links.google} rel="noreferrer" className={tapLinkClass}>
          {resultsCopy.polls.directions} {target}
        </a>
        {apple && (
          <a href={links.apple} rel="noreferrer" className={tapLinkClass}>
            {resultsCopy.polls.appleMaps} {target}
          </a>
        )}
      </p>
    </li>
  );
}

function SortControls({ sort, onSort, withDistance }) {
  const options = [
    ['line', copy.sort.line],
    ['name', copy.sort.name],
    ...(withDistance
      ? [
          ['nearest', copy.sort.nearest],
          ['nearby', copy.sort.nearby(NEARBY_MILES)],
        ]
      : []),
  ];
  return (
    <fieldset role="radiogroup" aria-labelledby="wait-sort-legend" className="mt-4">
      <legend id="wait-sort-legend" className="font-semibold">
        {copy.sort.legend}
      </legend>
      <div className="mt-1 flex flex-col">
        {options.map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="wait-sort"
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

/**
 * "Sort by distance from my location": asks for the device's position only
 * when pressed. The coordinates go to `onLocate` and stay in the page's
 * memory; they are never sent, stored or put in the URL.
 */
function LocationButton({ onLocate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pressRef = useRef(0);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  async function handleClick() {
    if (busy) return;
    pressRef.current += 1;
    const press = pressRef.current;
    setBusy(true);
    setError(null);
    try {
      const place = await getDeviceLocation();
      if (!mounted.current) return;
      onLocate(place);
    } catch (e) {
      if (!mounted.current) return;
      const reason = Object.hasOwn(copy.location.errors, e?.reason) ? e.reason : 'unavailable';
      setError({ reason, press });
    }
    setBusy(false);
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        aria-disabled={busy || undefined}
        aria-describedby="wait-location-note"
        className={buttonClass}
      >
        {busy ? copy.location.busy : copy.location.button}
      </button>
      <p id="wait-location-note" className="mt-2 text-sm text-muted">
        {copy.location.privacy}
      </p>
      <p role="alert" className="mt-2">
        {error && <span key={error.press}>{copy.location.errors[error.reason]}</span>}
      </p>
    </div>
  );
}

function Sources() {
  return (
    <section aria-labelledby="wait-sources" className="mt-8 text-sm">
      <p>{copy.disclaimer}</p>
      <p id="wait-sources" className="mt-2">
        {copy.sources}{' '}
        <a href={county.sourceUrl} rel="noreferrer" className={linkClass}>
          {copy.countyLink}
        </a>
        .
      </p>
    </section>
  );
}

/**
 * The early voting wait times page (#104): every County early voting site
 * with its current line count, hours and status, no address needed. Counts
 * come from the shared #103 loop; the list is the accessible version of
 * everything the optional map shows.
 * @param {{ loadSites?: () => Promise<object>,
 *   waitSource?: Parameters<typeof useWaitTimes>[0] }} props For tests.
 */
export default function WaitTimesPage({ loadSites = getAbsenteeSites, waitSource }) {
  const headingRef = useRef(null);
  usePageTitle(copy.heading);
  useEffect(() => {
    focusHeadingOnArrival(headingRef.current);
  }, []);

  const now = useNow();
  const season = earlyVotingSeason(schedules, now, election.timeZone);
  const waits = useWaitTimes(waitSource);
  const checkedAt = useShownCheck(waits.county.checkedAt);
  const { result, loading, retry, targetRef } = useSites(loadSites);
  // The device's position, in memory only.
  const [origin, setOrigin] = useState(null);
  const [sort, setSort] = useState('line');
  const [showMap, setShowMap] = useState(false);
  const [mapSupported] = useState(canDrawMap);

  const rows = result?.rows;
  const shown = useMemo(() => {
    if (!rows) return null;
    const byKey = new Map(waits.county.waits.map((entry) => [entry.siteId, entry]));
    const sites = rows.map((row) => ({
      ...row,
      key: `${row.loc}:${row.waitKey}`,
      wait: (row.waitKey && byKey.get(row.waitKey)) || null,
      status: earlyVotingStatus(schedules[row.absType], now, election.timeZone),
      miles: origin ? distanceMiles(origin, row) : null,
    }));
    return orderSites(sites, {
      sort,
      waitOf: (site) => site.wait?.value ?? null,
      isOpen: (site) => site.status.kind === 'openNow',
    });
  }, [rows, waits.county.waits, now, origin, sort]);

  const apple = isAppleMobile(globalThis.navigator);
  let statusText = '';
  if (waits.county.status === 'unavailable') statusText = copy.status.unavailable;
  else if (checkedAt !== null) statusText = copy.status.checked(clockTime(checkedAt));

  const mapSites = useMemo(
    () =>
      (shown ?? []).map((site) => ({
        lat: site.lat,
        lng: site.lng,
        bin: site.wait ? waitBin(site.wait.value) : null,
      })),
    [shown],
  );

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
        {copy.heading}
      </h1>
      <p className="mt-2">{copy.intro}</p>

      {season.kind === 'ended' ? (
        <p className="mt-4">
          {copy.season.ended}{' '}
          <Link href="/" className={linkClass}>
            {copy.season.findPollingPlace}
          </Link>
          .
        </p>
      ) : (
        <>
          {season.kind === 'before' && (
            <p className="mt-4 font-semibold">{copy.season.before(season.from, season.to)}</p>
          )}
          <h2 id="wait-sites-heading" className="mt-6 text-xl font-semibold">
            {copy.listLabel}
          </h2>
          <p data-testid="wait-status" aria-live="polite" className="mt-2">
            {statusText}
          </p>
          <p className="text-sm text-muted">{copy.refresh(refreshSeconds)}</p>

          <SortControls sort={sort} onSort={setSort} withDistance={origin !== null} />
          <LocationButton onLocate={setOrigin} />

          <div ref={targetRef} tabIndex={-1} className="mt-4">
            {!result && (
              // Tall enough that the list arriving does not push what follows
              // around in view (#27).
              <div data-testid="wait-sites-skeleton" aria-hidden="true" className="min-h-screen">
                <div className={`h-4 w-3/4 ${bar}`} />
                <div className={`mt-2 h-4 w-1/2 ${bar}`} />
              </div>
            )}
            {result?.error && (
              <>
                <p role="alert">
                  <span key={result.attempt}>
                    {copy.failed} <OfficialLookupLink />.
                  </span>
                </p>
                <RetryButton onRetry={retry} busy={loading} className="mt-2" />
              </>
            )}
            {shown && shown.length === 0 && (
              <p>
                {copy.none} <OfficialLookupLink />.
              </p>
            )}
            {shown && shown.length > 0 && (
              <>
                {mapSupported && (
                  <button
                    type="button"
                    aria-expanded={showMap}
                    onClick={() => setShowMap((on) => !on)}
                    className={buttonClass}
                  >
                    {showMap ? copy.map.hide : copy.map.show}
                  </button>
                )}
                {mapSupported && showMap && <WaitTimesMap sites={mapSites} />}
                <ol
                  aria-labelledby="wait-sites-heading"
                  className="mt-4 list-decimal space-y-3 pl-6"
                >
                  {shown.map((site) => (
                    <SiteRow key={site.key} site={site} now={now} apple={apple} />
                  ))}
                </ol>
              </>
            )}
          </div>
        </>
      )}

      <p className="mt-6">
        {copy.city}{' '}
        <a href={city.sourceUrl} rel="noreferrer" className={linkClass}>
          {copy.cityLink}
        </a>
        .
      </p>

      <Sources />

      <p className="mt-8">
        <Link href="/" className={tapLinkClass}>
          {copy.backHome}
        </Link>
      </p>
    </>
  );
}
