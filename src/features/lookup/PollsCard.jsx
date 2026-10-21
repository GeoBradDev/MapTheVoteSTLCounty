import { useEffect, useRef, useState } from 'react';
import election from '../../config/election.js';
import { getPolls, getPrecinctGeometry } from '../../data/arcgis.js';
import { directionsLinks, isAppleMobile, nearestPolls, polygonCenter } from './nearbyPolls.js';
import { copy } from './resultsCopy.js';

const linkClass = 'text-primary underline';
const tapLinkClass = `inline-flex min-h-11 items-center ${linkClass}`;
const bar = 'rounded bg-border animate-pulse motion-reduce:animate-none';

function sourceName(url) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return copy.polls.source;
  }
  return copy.polls.sourceNames[host] ?? host;
}

function OfficialLookupLink() {
  return (
    <a href={election.officialLookupUrl} rel="noreferrer" className={linkClass}>
      {copy.officialLookup}
    </a>
  );
}

// The precinct's center, for a page opened without a lookup point.
async function precinctCenter(code) {
  const feature = await getPrecinctGeometry(code);
  const center = polygonCenter(feature?.geometry);
  if (!center) throw new Error(`No center for precinct ${code}`);
  return center;
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
  // { rows } once loaded, { error: true } on failure.
  const [result, setResult] = useState(null);
  const [shown, setShown] = useState(election.nearbyPollCount);
  // The index of the first place a "Show more" revealed, which takes focus.
  const [focusFrom, setFocusFrom] = useState(null);
  const focusRef = useRef(null);

  useEffect(() => {
    let current = true;
    const from = origin ? Promise.resolve(origin) : precinctCenter(code);
    Promise.all([getPolls(), from]).then(
      ([polls, point]) => current && setResult({ rows: nearestPolls(polls, point) }),
      () => current && setResult({ error: true }),
    );
    return () => {
      current = false;
    };
  }, [code, origin]);

  useEffect(() => {
    if (focusFrom !== null) focusRef.current?.focus();
  }, [focusFrom]);

  const rows = result?.rows;
  const apple = isAppleMobile(globalThis.navigator);

  function showMore() {
    setFocusFrom(shown);
    setShown(shown + election.nearbyPollCount);
  }

  return (
    <div className="mt-2">
      {!result && (
        <div data-testid="polls-skeleton" aria-hidden="true">
          <div className={`h-4 w-3/4 ${bar}`} />
          <div className={`mt-2 h-4 w-1/2 ${bar}`} />
          <div className={`mt-2 h-4 w-2/3 ${bar}`} />
        </div>
      )}

      {result?.error && (
        <p>
          {copy.polls.failed} <OfficialLookupLink />.
        </p>
      )}

      {rows && rows.length === 0 && (
        <p>
          {copy.polls.none} <OfficialLookupLink />.
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          {!origin && <p className="text-muted">{copy.polls.fromCenter(code)}</p>}
          <ol aria-label={copy.polls.listLabel} className="mt-3 list-decimal space-y-3 pl-6">
            {rows.slice(0, shown).map((poll, i) => (
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
        </>
      )}

      <Hours />

      <p className="mt-3">
        <span>{copy.polls.voteAnywhere}</span>{' '}
        <a href={election.voteAnywhere.sources[0]} rel="noreferrer" className={linkClass}>
          {copy.polls.source}
        </a>
      </p>
    </div>
  );
}
