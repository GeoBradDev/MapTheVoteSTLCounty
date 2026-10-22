import { useEffect, useRef, useState } from 'react';
import { BASEMAP_ATTRIBUTION } from '../lookup/basemap.js';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import { WAIT_BINS } from './siteOrder.js';
import { NO_COUNT_CLASS, WAIT_BIN_CLASSES } from './waitColors.js';
import { copy } from './waitTimesCopy.js';

const linkClass = 'text-primary underline';
const SWATCH = 'inline-block size-4 shrink-0 rounded-full border-2';

// How long the map may take to first render before it is dropped.
const LOAD_TIMEOUT_MS = 15_000;

function Legend() {
  return (
    <div className="mt-2 text-sm">
      <p id="wait-map-legend" className="font-semibold">
        {copy.map.legend}
      </p>
      <ul aria-labelledby="wait-map-legend" className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {WAIT_BINS.map((bin, i) => (
          <li key={bin.min} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`${SWATCH} border-surface ${WAIT_BIN_CLASSES[i]}`}
            />
            {copy.map.bin(bin)}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={`${SWATCH} ${NO_COUNT_CLASS}`} />
          {copy.map.noCount}
        </li>
      </ul>
    </div>
  );
}

/**
 * The wait times map (#104), shown when the voter asks for it. Extra help
 * only: everything on it is in the list, so it is removed whenever anything
 * fails. The legend shows only when some site has a count.
 * @param {{ sites: { lat: number, lng: number, bin: number | null }[] }} props
 *   In list order; markers are numbered to match.
 */
export default function WaitTimesMap({ sites }) {
  const [state, setState] = useState('loading');
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const sitesRef = useRef(sites);

  useEffect(() => {
    sitesRef.current = sites;
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
    }
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    import('./waitTimesMapView.js')
      .then(({ createWaitTimesMap }) => {
        if (!current || !loading) return;
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
    <div role="region" aria-label={copy.map.label} className="mt-3">
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
      {hasCounts && <Legend />}
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
