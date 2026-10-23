import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { usePageTitle } from '../../components/usePageTitle.js';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { getAbsenteeSites } from '../../data/arcgis.js';
import { loadCityClient } from '../../data/jurisdictions.js';
import { isFresh, layerMaxAgeMs } from '../../data/freshness.js';
import { focusHeadingOnArrival } from '../../hydrate.js';
import { getDeviceLocation } from '../lookup/deviceLocation.js';
import { earlyVotingStatus, formatLongDate, hoursOn, zonedNow } from '../lookup/earlyVoting.js';
import { distanceMiles, directionsLinks, isAppleMobile, pollRows } from '../lookup/nearbyPolls.js';
import { Entrances } from '../lookup/PollsCard.jsx';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import RetryButton from '../lookup/RetryButton.jsx';
import { useNow } from '../lookup/useNow.js';
import { useRetry } from '../lookup/useRetry.js';
import { earlyVotingSeason } from './earlyVotingSeason.js';
import { NEARBY_MILES, orderSites, waitBin } from './siteOrder.js';
import { useWaitTimes } from './useWaitTimes.js';
import { canDrawMap } from './canDrawMap.js';
import WaitReport from './WaitReport.jsx';
import WaitTimesMap from './WaitTimesMap.jsx';
import { copy } from './waitTimesCopy.js';

const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;
const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';
const buttonClass =
  'min-h-11 rounded-md border border-primary px-4 py-2 font-semibold text-primary aria-disabled:cursor-wait aria-disabled:opacity-70';

/**
 * The live region's "checked at" time moves on at most this often, so a
 * screen reader does not hear it every refresh (the visible line, hidden from
 * screen readers, has the latest). Also how long after the last success the
 * counts are called unavailable.
 */
export const ANNOUNCE_MS = 5 * 60_000;

const { schedules } = election.earlyVoting;
const { county, city, refreshSeconds } = election.waitTimes;

// HH:MM of a time in the election's zone.
function clockTime(at) {
  const { minutes } = zonedNow(at, election.timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * When the counts were last checked, as the live region says it: it moves on
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
 * The City's early voting sites, with the schedules to read them by, from the
 * City chunk (#91, #147).
 * @returns {Promise<{ layer: object, scheduleFor: (loc: string | null) => object[] | undefined,
 *   schedules: Record<string, object[]> }>}
 */
async function loadCitySites() {
  const chunk = await loadCityClient();
  return {
    layer: await chunk.getCityEarlyVotingSites(),
    scheduleFor: chunk.cityScheduleFor,
    schedules: chunk.citySchedules,
  };
}

/**
 * Both boards' early voting sites as one list of rows, each with its
 * `jurisdiction`, the schedule it keeps and its key in that board's line
 * counts. When one board's sites fail, the other's are still listed and
 * `failed` names the one that failed; when both fail, the result is an error.
 */
function siteRows([county, city], attempt) {
  if (county.status === 'rejected' && city.status === 'rejected') return { error: true, attempt };
  const rows = [];
  let loadedAt = Date.now();
  if (county.status === 'fulfilled') {
    loadedAt = Math.min(loadedAt, county.value.loadedAt ?? loadedAt);
    for (const row of pollRows(county.value)) {
      rows.push({ ...row, jurisdiction: 'county', schedule: schedules[row.absType] });
    }
  }
  if (city.status === 'fulfilled') {
    const { layer, scheduleFor } = city.value;
    loadedAt = Math.min(loadedAt, layer.loadedAt ?? loadedAt);
    // The City's counts are keyed by the site's name (waitTimes.city.siteField).
    for (const row of pollRows(layer)) {
      rows.push({
        ...row,
        jurisdiction: 'city',
        waitKey: row.name,
        schedule: scheduleFor(row.loc),
      });
    }
  }
  const failed =
    county.status === 'rejected' ? 'county' : city.status === 'rejected' ? 'city' : null;
  return {
    rows,
    loadedAt,
    failed,
    citySchedules: city.status === 'fulfilled' ? city.value.schedules : null,
  };
}

/**
 * Both boards' sites, loaded once with a retry on failure (#18), and loaded
 * again when the tab is shown after the layer max age (#84). A refresh that
 * fails, in whole or in part, keeps the rows of a load that did not.
 */
function useSites(loadSites, loadCity) {
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
    Promise.allSettled([loadSites(), loadCity()])
      .then((settled) => siteRows(settled, attempt))
      .then((next) => {
        if (!current) return;
        setResult((prev) =>
          (next.error || next.failed) && prev?.rows && !prev.failed ? prev : next,
        );
        done();
      });
    return () => {
      current = false;
    };
  }, [loadSites, loadCity, attempt, done, refresh]);

  return { result, loading, retry, targetRef };
}

// The board's own lookup: the County's, or the City's (#91).
const lookupUrls = { county: election.officialLookupUrl, city: referrals.stlCityLookup.url };

function OfficialLookupLink({ id = 'county' }) {
  return (
    <a href={lookupUrls[id]} rel="noreferrer" className={linkClass}>
      {resultsCopy.officialLookupFor(id)}
    </a>
  );
}

function SiteRow({ site, now, apple }) {
  const name = site.name ?? resultsCopy.polls.unnamed(site.loc);
  const links = directionsLinks(site);
  const target = <span className="sr-only">{resultsCopy.polls.linkTarget(name)}</span>;
  const kind = resultsCopy.earlyVoting.siteKinds[site.absType];
  const { schedule } = site;
  const today = schedule && hoursOn(schedule, zonedNow(now, election.timeZone).date);
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 className="font-semibold">{name}</h3>
      {/* Which board runs the site: each board's sites are for its own voters. */}
      <p className="text-sm text-muted">{election.waitTimes[site.jurisdiction].source}</p>
      <WaitReport wait={site.wait} now={now} showNone />
      <p>
        {kind && `${kind}. `}
        {schedule && resultsCopy.earlyVoting.status(site.status, formatLongDate)}
      </p>
      {today && <p>{copy.todayHours(today.open, today.close)}</p>}
      <p>{resultsCopy.polls.address(site.address, site.zip)}</p>
      <Entrances entry={site.entry} accessibleEntry={site.accessibleEntry} />
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
  // Set again on every mount: StrictMode runs the cleanup once in between.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
          {copy.countyLink(county.source)}
        </a>
        ,{' '}
        <a href={city.sourceUrl} rel="noreferrer" className={linkClass}>
          {copy.cityLink(city.source)}
        </a>
        .
      </p>
    </section>
  );
}

// When a request last succeeded, over both boards (ms), or null before any.
function latestCheck(waits) {
  const times = [waits.county.checkedAt, waits.city.checkedAt].filter((at) => at !== null);
  return times.length ? Math.max(...times) : null;
}

/**
 * The early voting wait times page (#104): every County and City (#91) early
 * voting site with its current line count, hours and status, no address
 * needed. Counts come from the shared #103 loop; the list is the accessible
 * version of everything the optional map shows.
 * @param {{ loadSites?: () => Promise<object>, loadCity?: typeof loadCitySites,
 *   waitSource?: Parameters<typeof useWaitTimes>[0] }} props For tests.
 */
export default function WaitTimesPage({
  loadSites = getAbsenteeSites,
  loadCity = loadCitySites,
  waitSource,
}) {
  const headingRef = useRef(null);
  usePageTitle(copy.heading);
  useEffect(() => {
    // The page's code loads on demand (a lazy route), so on a hard load the
    // voter may already have moved focus (to the skip link, the language
    // switcher): leave it there. After an in-app link, focus is on the page.
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.id !== 'main') return;
    focusHeadingOnArrival(headingRef.current);
  }, []);

  const now = useNow();
  const { result, loading, retry, targetRef } = useSites(loadSites, loadCity);
  // Both boards' schedules, the City's once its chunk is here; keyed apart so
  // no County and City schedule share a key.
  const cityKeyed = result?.citySchedules;
  const allSchedules = useMemo(
    () => ({
      ...schedules,
      ...Object.fromEntries(Object.entries(cityKeyed ?? {}).map(([k, v]) => [`city:${k}`, v])),
    }),
    [cityKeyed],
  );
  const season = earlyVotingSeason(allSchedules, now, election.timeZone);
  // When early voting ends with the page open, the list and its controls go:
  // if focus went with them, put it on the heading, which reads the news next.
  useLayoutEffect(() => {
    if (season.kind !== 'ended') return;
    const focused = document.activeElement;
    if (!focused || focused === document.body) headingRef.current?.focus();
  }, [season.kind]);
  const waits = useWaitTimes(waitSource);
  const lastSuccess = latestCheck(waits);
  const checkedAt = useShownCheck(lastSuccess);
  // The device's position, in memory only.
  const [origin, setOrigin] = useState(null);
  const [sort, setSort] = useState('line');
  const [showMap, setShowMap] = useState(false);
  const [mapSupported] = useState(canDrawMap);
  // Set when the map fails: the page then offers no map, as without WebGL.
  const [mapFailed, setMapFailed] = useState(false);
  const canShowMap = mapSupported && !mapFailed;
  // The "Hide map" button goes with a failed map: if it had focus, put focus
  // on the list's container instead of the page. Focus anywhere else stays.
  useLayoutEffect(() => {
    if (!mapFailed) return;
    const focused = document.activeElement;
    if (!focused || focused === document.body) targetRef.current?.focus();
  }, [mapFailed, targetRef]);

  const rows = result?.rows;
  const shown = useMemo(() => {
    if (!rows) return null;
    const byKey = {
      county: new Map(waits.county.waits.map((entry) => [entry.siteId, entry])),
      city: new Map(waits.city.waits.map((entry) => [entry.siteId, entry])),
    };
    const sites = rows.map((row) => ({
      ...row,
      key: `${row.jurisdiction}:${row.loc}:${row.waitKey}`,
      wait: (row.waitKey && byKey[row.jurisdiction].get(row.waitKey)) || null,
      status: earlyVotingStatus(row.schedule, now, election.timeZone),
      miles: origin ? distanceMiles(origin, row) : null,
    }));
    return orderSites(sites, {
      sort,
      waitOf: (site) => site.wait?.value ?? null,
      isOpen: (site) => site.status.kind === 'openNow',
    });
  }, [rows, waits.county.waits, waits.city.waits, now, origin, sort]);

  const apple = isAppleMobile(globalThis.navigator);
  // "Unavailable" when either board's counts cannot be loaded, both boards'
  // sites being listed (#91), but only once that board's checks have not
  // succeeded for ANNOUNCE_MS, so one failed refresh between successes does
  // not flip the line every 30 s.
  const unavailable = ['county', 'city'].some(
    (key) =>
      waits[key].status === 'unavailable' &&
      (waits[key].checkedAt === null || now - waits[key].checkedAt >= ANNOUNCE_MS),
  );
  // The live region gets the throttled time; the visible line, hidden from
  // screen readers so they do not hear it twice, has the latest.
  const statusFor = (at) => {
    if (unavailable) return copy.status.unavailable;
    return at === null ? '' : copy.status.checked(clockTime(at));
  };
  const statusText = statusFor(checkedAt);
  const shownStatusText = statusFor(lastSuccess);

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
      <p className="mt-2">{copy.city}</p>

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
          <p data-testid="wait-status" aria-live="polite" className="sr-only">
            {statusText}
          </p>
          <p data-testid="wait-status-shown" aria-hidden="true" className="mt-2">
            {shownStatusText}
          </p>
          <p className="text-sm text-muted">{copy.refresh(refreshSeconds)}</p>

          <SortControls sort={sort} onSort={setSort} withDistance={origin !== null} />
          <LocationButton
            onLocate={(place) => {
              setOrigin(place);
              setSort('nearest');
            }}
          />

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
            {result?.failed && (
              <>
                <p role="alert">
                  <span key={result.attempt ?? 0}>
                    {copy.failed} <OfficialLookupLink id={result.failed} />.
                  </span>
                </p>
                <RetryButton onRetry={retry} busy={loading} className="mt-2 mb-4" />
              </>
            )}
            {shown && shown.length === 0 && !result.failed && (
              <p>
                {copy.none} <OfficialLookupLink />.
              </p>
            )}
            {shown && shown.length > 0 && (
              <>
                {canShowMap && (
                  <button
                    type="button"
                    aria-expanded={showMap}
                    onClick={() => setShowMap((on) => !on)}
                    className={buttonClass}
                  >
                    {showMap ? copy.map.hide : copy.map.show}
                  </button>
                )}
                {canShowMap && showMap && (
                  <WaitTimesMap sites={mapSites} onFail={() => setMapFailed(true)} />
                )}
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

      <Sources />

      <p className="mt-8">
        <Link href="/" className={tapLinkClass}>
          {copy.backHome}
        </Link>
      </p>
    </>
  );
}
