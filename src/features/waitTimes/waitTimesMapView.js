// The wait times map itself (#104): the second module that imports MapLibre
// GL JS, so the library loads only when the map scrolls into view (#172). Its
// markers are hidden from assistive technology: the list is the accessible
// version of everything on the map.
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
// Bundled by Vite as a same-origin file, so the Content-Security-Policy needs
// no blob: worker source.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { mapBounds, oklchToRgb } from '../lookup/mapBounds.js';
import { basemapStyleUrl, neutralizeBasemap, watchColorScheme } from '../lookup/mapStyle.js';
import { NO_COUNT_CLASS, WAIT_COLOR_CLASSES } from './waitColors.js';
import '../lookup/precinctMap.css';

setWorkerUrl(workerUrl);

const FIT = { padding: 40, maxZoom: 14, animate: false };
const MARKER =
  'flex size-7 items-center justify-center rounded-full border-2 text-sm font-semibold shadow';

function markerElement(bin, number) {
  const element = document.createElement('div');
  const fill = bin === null ? NO_COUNT_CLASS : WAIT_COLOR_CLASSES[bin];
  element.className = `${MARKER} ${fill}`;
  element.setAttribute('aria-hidden', 'true');
  element.textContent = String(number);
  return element;
}

/**
 * Draws numbered markers for the sites on a map in `container`, filled by
 * their line count's color step (`bin`, an index into WAIT_COLOR_CLASSES,
 * #172), plain when they have no count. The camera never animates.
 * @param {HTMLElement} container An element whose className React never changes.
 * @param {{ sites: { lat: number, lng: number, bin: number | null }[],
 *   onReady: () => void, onFail: (error: unknown) => void }} options `sites`
 *   are numbered from 1 in order, as in the list. `onFail` is called at most
 *   once, when anything fails before the first full render; the map is
 *   already removed then.
 * @returns {{ setSites: (sites: object[]) => void, remove: () => void }}
 * @throws When WebGL is unavailable or there is nothing to show.
 */
export function createWaitTimesMap(container, { sites, onReady, onFail }) {
  // Read again at each style load, as the dark theme (#77) gives the token
  // another value. Markers are DOM elements with token classes, so they follow
  // the theme on their own.
  function readLabelColor() {
    const labelColor = oklchToRgb(getComputedStyle(container).getPropertyValue('--color-muted'));
    if (!labelColor) throw new Error('The map color tokens are not oklch colors');
    return labelColor;
  }
  readLabelColor();
  const bounds = mapBounds({ points: sites });
  if (!bounds) throw new Error('Nothing to show on the map');

  const map = new MapLibreMap({
    container,
    style: basemapStyleUrl(),
    bounds,
    fitBoundsOptions: FIT,
    attributionControl: false,
    boxZoom: false,
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    renderWorldCopies: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  let state = 'loading';
  let markers = [];

  // The system color scheme changed (#77): the other basemap.
  const stopWatching = watchColorScheme(() => {
    map.setStyle(basemapStyleUrl(), { diff: false });
  });

  function fail(error) {
    if (state !== 'loading') return;
    state = 'failed';
    stopWatching();
    map.remove();
    onFail(error);
  }

  map.on('error', (event) => fail(event.error));
  map.once('idle', () => {
    if (state !== 'loading') return;
    state = 'ready';
    onReady();
  });
  // Each style load: the first, and any after a scheme change.
  map.on('style.load', () => {
    try {
      neutralizeBasemap(map, readLabelColor());
    } catch (error) {
      fail(error);
    }
  });

  // Later markers are drawn on top, so the first rows of the list stay readable.
  function draw(list) {
    markers.forEach((marker) => marker.remove());
    markers = list
      .map((site, i) =>
        new Marker({ element: markerElement(site.bin, i + 1) }).setLngLat([site.lng, site.lat]),
      )
      .reverse();
    markers.forEach((marker) => marker.addTo(map));
  }

  try {
    draw(sites);
  } catch (error) {
    state = 'failed';
    stopWatching();
    map.remove();
    throw error;
  }

  return {
    setSites(list) {
      if (state === 'failed' || state === 'removed') return;
      draw(list);
    },
    remove() {
      if (state === 'failed' || state === 'removed') return;
      state = 'removed';
      stopWatching();
      map.remove();
    },
  };
}
