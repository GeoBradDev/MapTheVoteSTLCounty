// The precinct map itself: the only module that imports MapLibre GL JS, so the
// library and its worker load only when PrecinctMap imports this file on the
// results screen. Nothing here is focusable or read out except MapLibre's own
// canvas: the polling places list is the accessible version of the markers.
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
// Bundled by Vite as a same-origin file, so the Content-Security-Policy needs
// no blob: worker source.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { BASEMAP_STYLE_URL } from './basemap.js';
import { mapBounds, oklchToRgb } from './mapBounds.js';
import './precinctMap.css';

setWorkerUrl(workerUrl);

// Room around the fitted bounds for the markers, in CSS pixels.
const FIT = { padding: 40, maxZoom: 16, animate: false };

const POLL_MARKER =
  'flex size-7 items-center justify-center rounded-full border-2 border-surface bg-primary text-sm font-semibold text-on-primary shadow';
const ORIGIN_MARKER = 'block size-4 rounded-full border-2 border-surface bg-ink shadow';

function markerElement(className, text) {
  const element = document.createElement('div');
  element.className = className;
  element.setAttribute('aria-hidden', 'true');
  if (text) element.textContent = text;
  return element;
}

/**
 * Draws the precinct outline, the looked-up point and numbered polling places
 * on a map in `container`. The camera never animates.
 * @param {HTMLElement} container An element whose className React never changes:
 *   MapLibre adds its own classes to it.
 * @param {{ geometry: object, origin: { lat: number, lng: number } | null,
 *   polls: { lat: number, lng: number }[], onReady: () => void,
 *   onFail: (error: unknown) => void }} options `polls` are numbered from 1 in
 *   order, as in the list. `onFail` is called at most once, when anything fails
 *   before the map first finishes rendering; the map is already removed then.
 *   The caller owns the load time limit and calls `remove()` when it passes.
 * @returns {{ setPolls: (polls: { lat: number, lng: number }[]) => void,
 *   remove: () => void }}
 * @throws When WebGL is unavailable or the inputs give nothing to show.
 */
export function createPrecinctMap(container, { geometry, origin, polls, onReady, onFail }) {
  const color = oklchToRgb(getComputedStyle(container).getPropertyValue('--color-primary'));
  if (!color) throw new Error('The --color-primary token is not an oklch color');
  const boundsOf = (places) => mapBounds({ geometry, points: [origin, ...places] });
  const bounds = boundsOf(polls);
  if (!bounds) throw new Error('Nothing to show on the map');

  const map = new MapLibreMap({
    container,
    style: BASEMAP_STYLE_URL,
    bounds,
    fitBoundsOptions: FIT,
    // Credited as text links under the map instead.
    attributionControl: false,
    // Its box is unstyled here, and the list already covers every place.
    boxZoom: false,
    // One finger scrolls the page, two move the map; the wheel zooms only
    // with Ctrl or Cmd.
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    renderWorldCopies: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  // 'loading', then 'ready' or 'failed'; 'removed' once the page drops it.
  let state = 'loading';
  let markers = [];

  function fail(error) {
    if (state !== 'loading') return;
    state = 'failed';
    map.remove();
    onFail(error);
  }

  // A style, tile or source error before the first full render drops the
  // map. Later errors (one tile on a pan) leave the drawn map in place.
  map.on('error', (event) => fail(event.error));
  map.once('idle', () => {
    if (state !== 'loading') return;
    state = 'ready';
    onReady();
  });

  map.on('load', () => {
    try {
      map.addSource('precinct', { type: 'geojson', data: { type: 'Feature', geometry } });
      map.addLayer({
        id: 'precinct-fill',
        type: 'fill',
        source: 'precinct',
        paint: { 'fill-color': color, 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: 'precinct-line',
        type: 'line',
        source: 'precinct',
        paint: { 'line-color': color, 'line-width': 2.5 },
      });
    } catch (error) {
      fail(error);
    }
  });

  function setPolls(places) {
    markers.forEach((marker) => marker.remove());
    markers = places.map((place, i) =>
      new Marker({ element: markerElement(POLL_MARKER, String(i + 1)) })
        .setLngLat([place.lng, place.lat])
        .addTo(map),
    );
  }

  try {
    if (origin) {
      new Marker({ element: markerElement(ORIGIN_MARKER) })
        .setLngLat([origin.lng, origin.lat])
        .addTo(map);
    }
    setPolls(polls);
  } catch (error) {
    // The caller only learns of the throw, so free the map and its WebGL
    // context here.
    state = 'failed';
    map.remove();
    throw error;
  }

  return {
    setPolls(places) {
      if (state === 'failed' || state === 'removed') return;
      setPolls(places);
      const next = boundsOf(places);
      if (next) map.fitBounds(next, FIT);
    },
    remove() {
      if (state === 'failed' || state === 'removed') return;
      state = 'removed';
      map.remove();
    },
  };
}
