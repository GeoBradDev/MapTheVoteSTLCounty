import { useEffect, useRef, useState } from 'react';
import election from '../../config/election.js';
import { getPrecinctGeometry } from '../../data/arcgis.js';
import { BASEMAP_ATTRIBUTION } from './basemap.js';
import { copy } from './resultsCopy.js';

const linkClass = 'text-primary underline';

// MapLibre GL JS needs WebGL 2. Without it, the map chunk is never downloaded.
const canDrawMap = () => typeof globalThis.WebGL2RenderingContext === 'function';

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
    if (!supported) return undefined;
    let current = true;
    Promise.all([import('./precinctMapView.js'), getPrecinctGeometry(code)])
      .then(([{ createPrecinctMap }, feature]) => {
        if (!current) return;
        viewRef.current = createPrecinctMap(containerRef.current, {
          geometry: feature.geometry,
          origin,
          polls: pollsRef.current,
          onReady: () => current && setState('ready'),
          onFail: () => current && setState('failed'),
        });
      })
      .catch(() => current && setState('failed'));
    return () => {
      current = false;
      viewRef.current?.remove();
      viewRef.current = null;
    };
  }, [supported, code, origin]);

  if (!supported || state === 'failed') return null;

  return (
    <div role="region" aria-label={copy.map.label(code)} className="mt-3">
      <div className="relative h-64 overflow-hidden rounded-md border border-border">
        {/* MapLibre adds its own classes to this element, so React must never
            change its className. Not positioned: .maplibregl-map sets
            position: relative, which would override a position utility. */}
        <div ref={containerRef} className="h-full w-full" />
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
