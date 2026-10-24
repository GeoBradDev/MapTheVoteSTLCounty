import { useEffect, useRef, useState } from 'react';
import TextLink from '../../components/TextLink.jsx';
import WaitLegend from '../waitTimes/WaitLegend.jsx';
import { useJurisdiction } from './jurisdictionContext.js';
import { copy } from './resultsCopy.js';

// MapLibre GL JS needs WebGL 2. Without it, the map chunk is never downloaded.
const canDrawMap = () => typeof globalThis.WebGL2RenderingContext === 'function';

// The map waits until it scrolls into view (#27): MapLibre is a large chunk
// and hundreds of milliseconds of main-thread work on a mid-range phone, and
// the list above it holds everything the map shows. Without
// IntersectionObserver it loads at once.
const canWaitForView = () => typeof globalThis.IntersectionObserver === 'function';

// How long the map may take, from when it starts loading (once in view) to its
// first full render (code, outline, style and tiles), before it is dropped. Time while the page is
// hidden does not count: a background tab draws nothing, so the clock pauses
// and resumes with the time it had left.
const LOAD_TIMEOUT_MS = 15_000;

// The data credit names the precinct's own board (#89).
function Attribution() {
  const { id, boardSiteUrl } = useJurisdiction();
  return (
    <p className="mt-1 text-xs text-muted">
      {copy.map.basemap}{' '}
      {copy.map.credits.map(({ label, href }, i) => (
        <span key={href}>
          {i > 0 && ', '}
          <TextLink href={href} rel="noreferrer">
            {label}
          </TextLink>
        </span>
      ))}
      . {copy.map.data}{' '}
      <TextLink href={boardSiteUrl} rel="noreferrer">
        {id === 'city' ? copy.map.city : copy.map.county}
      </TextLink>
      .
    </p>
  );
}

/**
 * A small map of the precinct and the listed polling places. Extra help only:
 * everything on it is also in the list, so it is removed whenever anything
 * fails, and its markers are hidden from assistive technology.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   polls: { lat: number, lng: number, bin?: number | null }[],
 *   classes?: { min: number, max: number }[] }} props
 *   `origin` is the looked-up point, in memory only. `polls` are the places
 *   the list shows, in order; on Election Day (#107) each has its line count
 *   color step (waitColor), or null without a count, and `classes` are the
 *   counts' classes (#172): the map shows their legend once a place it
 *   shows has a count.
 */
export default function PrecinctMap({ code, origin, polls, classes = [] }) {
  const { getOutline } = useJurisdiction();
  const [supported] = useState(canDrawMap);
  // 'loading', 'ready' or 'failed'.
  const [state, setState] = useState('loading');
  // Whether the map's box has come into view, so it may load.
  const [inView, setInView] = useState(() => !canWaitForView());
  const regionRef = useRef(null);
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const pollsRef = useRef(polls);
  // The markers drawn last, so a new list with the same places and bins (every
  // count refresh) redraws nothing.
  const drawnRef = useRef(JSON.stringify(polls));

  // Declared before the effect that creates the map, so a map created later
  // starts from the latest places.
  useEffect(() => {
    pollsRef.current = polls;
    const key = JSON.stringify(polls);
    if (key === drawnRef.current) return;
    drawnRef.current = key;
    viewRef.current?.setPolls(polls);
  }, [polls]);

  useEffect(() => {
    if (!supported || inView) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        setInView(true);
      }
    });
    observer.observe(regionRef.current);
    return () => observer.disconnect();
  }, [supported, inView]);

  useEffect(() => {
    if (!supported || !inView) return undefined;
    // `current` turns false on cleanup; `loading` once the map rendered or failed.
    let current = true;
    let loading = true;
    let timer;
    let remaining = LOAD_TIMEOUT_MS;
    let startedAt = null;

    function pauseClock() {
      if (startedAt === null) return;
      clearTimeout(timer);
      remaining -= performance.now() - startedAt;
      startedAt = null;
    }
    function runClock() {
      if (startedAt !== null) return;
      startedAt = performance.now();
      timer = setTimeout(fail, Math.max(0, remaining));
    }
    function stopClock() {
      pauseClock();
      document.removeEventListener('visibilitychange', onVisibility);
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') pauseClock();
      else runClock();
    }
    function ready() {
      if (!current || !loading) return;
      loading = false;
      stopClock();
      setState('ready');
    }
    function fail() {
      if (!current || !loading) return;
      loading = false;
      stopClock();
      viewRef.current?.remove();
      viewRef.current = null;
      setState('failed');
    }

    if (document.visibilityState !== 'hidden') runClock();
    document.addEventListener('visibilitychange', onVisibility);
    Promise.all([import('./precinctMapView.js'), getOutline(code)])
      .then(([{ createPrecinctMap }, feature]) => {
        if (!current || !loading) return;
        drawnRef.current = JSON.stringify(pollsRef.current);
        viewRef.current = createPrecinctMap(containerRef.current, {
          geometry: feature.geometry,
          origin,
          polls: pollsRef.current,
          onReady: ready,
          onFail: fail,
        });
      })
      .catch(fail);
    return () => {
      current = false;
      stopClock();
      viewRef.current?.remove();
      viewRef.current = null;
    };
  }, [supported, inView, code, origin, getOutline]);

  if (!supported || state === 'failed') return null;
  const hasCounts =
    classes.length > 0 && polls.some((poll) => poll.bin !== null && poll.bin !== undefined);

  return (
    // Printed with the system dark (#77), the canvas would keep the dark
    // basemap on a light page: the list holds everything, so leave it out.
    <div
      ref={regionRef}
      role="region"
      aria-label={copy.map.label(code)}
      className="mt-3 print:dark:hidden"
    >
      <div className="relative h-56 overflow-hidden sm:h-64 rounded-card border border-border">
        {/* MapLibre adds its own classes to this element, so React must never
            change its className. Not positioned: .maplibregl-map sets
            position: relative, which would override a position utility.
            Isolated, so nothing MapLibre stacks inside it can rise above the
            placeholder. */}
        <div ref={containerRef} className="isolate h-full w-full" />
        {state === 'loading' && (
          <div
            data-testid="map-placeholder"
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-border motion-reduce:animate-none"
          />
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        {copy.map.legend(code)} {origin && copy.map.origin}
      </p>
      {hasCounts && <WaitLegend classes={classes} />}
      <Attribution />
    </div>
  );
}
