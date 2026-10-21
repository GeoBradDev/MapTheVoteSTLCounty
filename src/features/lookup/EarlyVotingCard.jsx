import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import { getAbsenteeSites } from '../../data/arcgis.js';
import { CARD_TOPICS } from '../learn/cardTopics.js';
import { getTopic } from '../learn/topics.js';
import { distanceOrigin } from './distanceOrigin.js';
import { earlyVotingStatus, formatLongDate, scheduleLines } from './earlyVoting.js';
import { directionsLinks, isAppleMobile, nearestPolls } from './nearbyPolls.js';
import { copy, sourceName } from './resultsCopy.js';
import RetryButton from './RetryButton.jsx';
import { useRetry } from './useRetry.js';

const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;
const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

/** How often the open or closed status is worked out again. */
const TICK_MS = 60_000;

const t = copy.earlyVoting;
const { schedules, sources, lastVerified } = election.earlyVoting;
// The groups the config has hours for, in config order, that have a label.
const groupKeys = Object.keys(schedules).filter((key) => t.groups[key]);

// The current time, updated every minute so a page left open stays right.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
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
 * @param {{ code: string, origin: { lat: number, lng: number } | null }} props
 *   `origin` is the looked-up point, held in memory only; without one,
 *   distances are from the precinct's center.
 */
export default function EarlyVotingCard({ code, origin }) {
  // The absentee topic, once published (#22, #23); until then, the index.
  const absentee = getTopic(CARD_TOPICS.absentee);
  // { rows } once loaded, { error: true } on failure.
  const [result, setResult] = useState(null);
  // A failed load can be tried again; it stays shown while it is (#18).
  const { attempt, loading, retry, done, targetRef } = useRetry();
  const [showAll, setShowAll] = useState(false);
  const focusRef = useRef(null);
  const now = useNow();

  useEffect(() => {
    let current = true;
    Promise.all([getAbsenteeSites(), distanceOrigin(code, origin)])
      .then(
        ([sites, point]) => ({ rows: nearestPolls(sites, point) }),
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
    if (showAll) focusRef.current?.focus();
  }, [showAll]);

  const rows = result?.rows;
  const first = election.nearbyPollCount;
  const shownRows = showAll ? rows : rows?.slice(0, first);
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
          <ol aria-label={t.listLabel} className="mt-3 list-decimal space-y-3 pl-6">
            {shownRows.map((site, i) => (
              <SiteRow
                key={`${site.loc}:${i}`}
                site={site}
                now={now}
                apple={apple}
                headingRef={showAll && i === first ? focusRef : undefined}
              />
            ))}
          </ol>
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
