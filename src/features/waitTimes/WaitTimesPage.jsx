import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { track } from '../../analytics/index.js';
import Button from '../../components/Button.jsx';
import Notice from '../../components/Notice.jsx';
import TextLink from '../../components/TextLink.jsx';
import { usePageTitle } from '../../components/usePageTitle.js';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { getAbsenteeSites, getPolls } from '../../data/arcgis.js';
import { focusHeadingOnArrival } from '../../hydrate.js';
import { getDeviceLocation } from '../lookup/deviceLocation.js';
import { earlyVotingStatus, formatLongDate, hoursOn, zonedNow } from '../lookup/earlyVoting.js';
import { electionDaySchedule, isElectionDay } from '../lookup/electionDay.js';
import { distanceMiles, isAppleMobile } from '../lookup/nearbyPolls.js';
import { DirectionsLinks, Entrances } from '../lookup/PollsCard.jsx';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import RetryButton from '../lookup/RetryButton.jsx';
import { useNow } from '../lookup/useNow.js';
import { earlyVotingSeason } from './earlyVotingSeason.js';
import { waitClasses, waitColor } from './jenks.js';
import { NEARBY_MILES, orderSites } from './siteOrder.js';
import { useWaitTimes } from './useWaitTimes.js';
import { canDrawMap } from './canDrawMap.js';
import WaitReport from './WaitReport.jsx';
import WaitTimesMap from './WaitTimesMap.jsx';
import { copy } from './waitTimesCopy.js';
import { clockTime, loadCityPolls, loadCitySites, useSites } from './waitSites.js';

const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

/**
 * The live region's "checked at" time moves on at most this often, so a
 * screen reader does not hear it every refresh (the visible line, hidden from
 * screen readers, has the latest). Also how long after the last success the
 * counts are called unavailable.
 */
export const ANNOUNCE_MS = 5 * 60_000;

const { schedules } = election.earlyVoting;
const { county, city, refreshSeconds } = election.waitTimes;

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

// The board's own lookup: the County's, or the City's (#91).
const lookupUrls = { county: election.officialLookupUrl, city: referrals.stlCityLookup.url };

// Counted as this page's (#70), not which board's.
function OfficialLookupLink({ id = 'county' }) {
  return (
    <TextLink
      href={lookupUrls[id]}
      rel="noreferrer"
      onClick={() => track('official_lookup_open', { card: 'wait_times' })}
    >
      {resultsCopy.officialLookupFor(id)}
    </TextLink>
  );
}

// A site's status line: on Election Day (#107), "Polls closed at 7 p.m."
// once they have, not the early voting "ended".
function statusText(site) {
  if (site.schedule === electionDaySchedule && site.status.kind === 'ended') {
    return copy.electionDay.closed(election.electionDayHours.close);
  }
  return resultsCopy.earlyVoting.status(site.status, formatLongDate);
}

function SiteRow({ site, now, apple }) {
  const name = site.name ?? resultsCopy.polls.unnamed(site.loc);
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
        {schedule && statusText(site)}
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
      <DirectionsLinks place={site} name={name} apple={apple} card="wait_times" />
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
      <Button
        variant="secondary"
        onClick={handleClick}
        busy={busy}
        aria-describedby="wait-location-note"
      >
        {busy ? copy.location.busy : copy.location.button}
      </Button>
      <p id="wait-location-note" className="mt-2 text-sm text-muted">
        {copy.location.privacy}
      </p>
      {/* The live region stays mounted; the notice shows only with an error. */}
      <div role="alert" className="mt-2">
        {error && (
          <Notice variant="danger" key={error.press}>
            {copy.location.errors[error.reason]}
          </Notice>
        )}
      </div>
    </div>
  );
}

function Sources({ electionDay }) {
  // On Election Day (#107), the County's Polling Place Lookup app.
  const countyUrl = electionDay ? county.electionDay.sourceUrl : county.sourceUrl;
  const countyLink = electionDay ? copy.electionDay.countyLink : copy.countyLink;
  return (
    <section aria-labelledby="wait-sources" className="mt-8 text-sm">
      <p>{copy.disclaimer}</p>
      <p id="wait-sources" className="mt-2">
        {copy.sources}{' '}
        <TextLink href={countyUrl} rel="noreferrer">
          {countyLink(county.source)}
        </TextLink>
        ,{' '}
        <TextLink href={city.sourceUrl} rel="noreferrer">
          {copy.cityLink(city.source)}
        </TextLink>
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
 * needed. On Election Day (#107) it lists every polling place of both boards
 * instead, each with its board's count. Counts come from the shared #103
 * loop; the list is the accessible version of everything the optional map
 * shows.
 * @param {{ loadSites?: () => Promise<object>, loadCity?: typeof loadCitySites,
 *   loadPolls?: () => Promise<object>, loadCityPolls?: () => Promise<object>,
 *   waitSource?: Parameters<typeof useWaitTimes>[0] }} props For tests.
 */
export default function WaitTimesPage({
  loadSites = getAbsenteeSites,
  loadCity = loadCitySites,
  loadPolls = getPolls,
  loadCityPolls: loadCityDay = loadCityPolls,
  waitSource,
}) {
  const headingRef = useRef(null);
  const now = useNow();
  const electionDay = isElectionDay(now);
  const text = electionDay ? copy.electionDay : copy;
  usePageTitle(text.heading);
  useEffect(() => {
    // The page's code loads on demand (a lazy route), so on a hard load the
    // voter may already have moved focus (to the skip link, the language
    // switcher): leave it there. After an in-app link, focus is on the page.
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.id !== 'main') return;
    focusHeadingOnArrival(headingRef.current);
  }, []);

  const { result, loading, retry, targetRef } = useSites(
    loadSites,
    loadCity,
    loadPolls,
    loadCityDay,
    electionDay,
  );
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
  // On Election Day the list is the polling places, whatever early voting did.
  const season = electionDay
    ? { kind: 'during' }
    : earlyVotingSeason(allSchedules, now, election.timeZone);
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
  // Open on arrival (#172); the voter may hide it.
  const [showMap, setShowMap] = useState(true);
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

  // The map's classes (#172): Jenks natural breaks over the fresh counts of
  // the sites listed, both boards on one scale (both count people in line),
  // recomputed whenever the counts change.
  const { mapSites, mapClasses } = useMemo(() => {
    const sites = shown ?? [];
    const classes = waitClasses(sites.filter((site) => site.wait).map((site) => site.wait.value));
    return {
      mapClasses: classes,
      mapSites: sites.map((site) => ({
        lat: site.lat,
        lng: site.lng,
        bin: site.wait ? waitColor(site.wait.value, classes) : null,
      })),
    };
  }, [shown]);

  return (
    <>
      {/* The route's loading fallback in src/App.jsx repeats this heading and
          the two paragraphs, text and classes (#151): change both together. */}
      <h1 ref={headingRef} tabIndex={-1} className="text-title font-bold">
        {text.heading}
      </h1>
      <p className="mt-2">{text.intro}</p>
      <p className="mt-2">{text.city}</p>

      {season.kind === 'ended' ? (
        <p className="mt-4">
          {copy.season.ended} <TextLink to="/">{copy.season.findPollingPlace}</TextLink>.
        </p>
      ) : (
        <>
          {season.kind === 'before' && (
            <p className="mt-4 font-semibold">{copy.season.before(season.from, season.to)}</p>
          )}
          <h2 id="wait-sites-heading" className="mt-6 text-heading font-semibold">
            {text.listLabel}
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
                <Notice role="alert" variant="danger">
                  <span key={result.attempt}>
                    {text.failed} <OfficialLookupLink /> {resultsCopy.earlyVoting.or}{' '}
                    <OfficialLookupLink id="city" />.
                  </span>
                </Notice>
                <RetryButton onRetry={retry} busy={loading} where="wait_times" className="mt-2" />
              </>
            )}
            {result?.failed && (
              <>
                <Notice role="alert" variant="danger">
                  <span key={result.attempt}>
                    {text.failed} <OfficialLookupLink id={result.failed} />.
                  </span>
                </Notice>
                <RetryButton
                  onRetry={retry}
                  busy={loading}
                  where="wait_times"
                  className="mt-2 mb-4"
                />
              </>
            )}
            {shown && shown.length === 0 && !result.failed && (
              <p>
                {text.none} <OfficialLookupLink /> {resultsCopy.earlyVoting.or}{' '}
                <OfficialLookupLink id="city" />.
              </p>
            )}
            {shown && shown.length > 0 && (
              <>
                {canShowMap && (
                  <Button
                    variant="secondary"
                    aria-expanded={showMap}
                    onClick={() => setShowMap((on) => !on)}
                  >
                    {showMap ? copy.map.hide : copy.map.show}
                  </Button>
                )}
                {canShowMap && showMap && (
                  <WaitTimesMap
                    sites={mapSites}
                    classes={mapClasses}
                    label={electionDay ? copy.electionDay.mapLabel : copy.map.label}
                    onFail={() => setMapFailed(true)}
                  />
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

      <Sources electionDay={electionDay} />

      <p className="mt-8">
        <TextLink to="/" variant="tap">
          {copy.backHome}
        </TextLink>
      </p>
    </>
  );
}

// The home page's dot map (#184) ships in this page's chunk: the home page
// loads it from here, so the two share one on-demand chunk (and the wait
// times page is ready when the map's link is followed). A chunk of its own
// made the bundler move shared modules out of the first load's entry, which
// cost about 2 KB of the first load budget (#27).
export { default as WaitDotMap } from './WaitDotMap.jsx';
