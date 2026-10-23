import { useEffect, useRef, useState } from 'react';
import { BASEMAP_ATTRIBUTION } from '../lookup/basemap.js';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import WaitLegend from './WaitLegend.jsx';
import { copy } from './waitTimesCopy.js';

const linkClass = 'text-primary underline';

// How long the map may take to first render before it is dropped.
const LOAD_TIMEOUT_MS = 15_000;

// One import of the map module, shared by every mount (StrictMode mounts
// twice), so each gets the same module. A failed import is tried again on the
// next mount.
let viewModule = null;
function loadView() {
  viewModule ??= import('./waitTimesMapView.js').catch((error) => {
    viewModule = null;
    throw error;
  });
  return viewModule;
}

/**
 * The wait times map (#104), shown when the voter asks for it. Extra help
 * only: everything on it is in the list, so it is removed whenever anything
 * fails. The legend shows only when some site has a count.
 * @param {{ sites: { lat: number, lng: number, bin: number | null }[],
 *   onFail?: () => void, label?: string }} props `sites` in list order;
 *   markers are numbered to match. `onFail` is called once if the map fails.
 *   `label` names the map region (the polling places on Election Day, #107).
 */
export default function WaitTimesMap({ sites, onFail, label = copy.map.label }) {
  const [state, setState] = useState('loading');
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const sitesRef = useRef(sites);
  const onFailRef = useRef(onFail);
  // The markers drawn last, so a new list with the same order and bins (every
  // minute, every refresh) redraws nothing.
  const drawnRef = useRef(JSON.stringify(sites));

  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    sitesRef.current = sites;
    const key = JSON.stringify(sites);
    if (key === drawnRef.current) return;
    drawnRef.current = key;
    viewRef.current?.setSites(sites);
  }, [sites]);

  useEffect(() => {
    let current = true;
    let loading = true;
    function ready() {
      if (!current || !loading) return;
      loading = false;
      clearTimeout(timer);
      setState('ready');
    }
    function fail() {
      if (!current || !loading) return;
      loading = false;
      clearTimeout(timer);
      viewRef.current?.remove();
      viewRef.current = null;
      setState('failed');
      onFailRef.current?.();
    }
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    loadView()
      .then(({ createWaitTimesMap }) => {
        if (!current || !loading) return;
        drawnRef.current = JSON.stringify(sitesRef.current);
        viewRef.current = createWaitTimesMap(containerRef.current, {
          sites: sitesRef.current,
          onReady: ready,
          onFail: fail,
        });
      })
      .catch(fail);
    return () => {
      current = false;
      clearTimeout(timer);
      viewRef.current?.remove();
      viewRef.current = null;
    };
  }, []);

  if (state === 'failed') return null;
  const hasCounts = sites.some((site) => site.bin !== null);

  return (
    <div role="region" aria-label={label} className="mt-3">
      <div className="relative h-72 overflow-hidden rounded-md border border-border">
        {/* MapLibre adds its own classes to this element: React never changes its className. */}
        <div ref={containerRef} className="isolate h-full w-full" />
        {state === 'loading' && (
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-border motion-reduce:animate-none"
          />
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{copy.map.numbers}</p>
      {hasCounts && <WaitLegend />}
      <p className="mt-1 text-xs text-muted">
        {resultsCopy.map.basemap}{' '}
        {BASEMAP_ATTRIBUTION.map(({ label, href }, i) => (
          <span key={href}>
            {i > 0 && ', '}
            <a href={href} rel="noreferrer" className={linkClass}>
              {label}
            </a>
          </span>
        ))}
        .
      </p>
    </div>
  );
}
