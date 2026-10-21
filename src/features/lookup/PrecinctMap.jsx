import { useEffect, useRef, useState } from 'react';
import election from '../../config/election.js';
import { getPrecinctGeometry } from '../../data/arcgis.js';
import { BASEMAP_ATTRIBUTION } from './basemap.js';
import { copy } from './resultsCopy.js';

const linkClass = 'text-primary underline';

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

function Attribution() {
  return (
    <p className="mt-1 text-xs text-muted">
      {copy.map.basemap}{' '}
      {BASEMAP_ATTRIBUTION.map(({ label, href }, i) => (
        <span key={href}>
          {i > 0 && ', '}
          <a href={href} rel="noreferrer" className={linkClass}>
            {label}
          </a>
        </span>
      ))}
      . {copy.map.data}{' '}
      <a href={election.countySiteUrl} rel="noreferrer" className={linkClass}>
        {copy.map.county}
      </a>
      .
    </p>
  );
}

/**
 * A small map of the precinct and the listed polling places. Extra help only:
 * everything on it is also in the list, so it is removed whenever anything
 * fails, and its markers are hidden from assistive technology.
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   polls: { lat: number, lng: number }[] }} props `origin` is the looked-up
 *   point, in memory only. `polls` are the places the list shows, in order.
 */
export default function PrecinctMap({ code, origin, polls }) {
  const [supported] = useState(canDrawMap);
  // 'loading', 'ready' or 'failed'.
  const [state, setState] = useState('loading');
  // Whether the map's box has come into view, so it may load.
  const [inView, setInView] = useState(() => !canWaitForView());
  const regionRef = useRef(null);
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const pollsRef = useRef(polls);

  // Declared before the effect that creates the map, so a map created later
  // starts from the latest places.
  useEffect(() => {
    pollsRef.current = polls;
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
    Promise.all([import('./precinctMapView.js'), getPrecinctGeometry(code)])
      .then(([{ createPrecinctMap }, feature]) => {
        if (!current || !loading) return;
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
  }, [supported, inView, code, origin]);

  if (!supported || state === 'failed') return null;

  return (
    <div ref={regionRef} role="region" aria-label={copy.map.label(code)} className="mt-3">
      <div className="relative h-64 overflow-hidden rounded-md border border-border">
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
      <Attribution />
    </div>
  );
}
