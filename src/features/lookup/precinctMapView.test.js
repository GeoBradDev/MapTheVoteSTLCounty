// The precinct map's view with MapLibre stubbed (#77): each style load, the
// first and any after a scheme change, draws the precinct again in the
// theme's token colors, and the map follows the scheme until removed.
import { BASEMAP_DARK_STYLE_URL, BASEMAP_STYLE_URL } from './basemap.js';
import { createPrecinctMap } from './precinctMapView.js';

const maps = [];

vi.mock('maplibre-gl', () => {
  class FakeMap {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.layers = [];
      this.sources = [];
      this.styles = [options.style];
      this.removed = false;
      this.touchZoomRotate = { disableRotation: vi.fn() };
      this.keyboard = { disableRotation: vi.fn() };
      maps.push(this);
    }
    on(type, fn) {
      (this.handlers[type] ??= []).push(fn);
    }
    once(type, fn) {
      this.on(type, fn);
    }
    fire(type, event = {}) {
      (this.handlers[type] ?? []).forEach((fn) => fn(event));
    }
    getStyle() {
      return { layers: [{ id: 'label', type: 'symbol' }] };
    }
    setPaintProperty(id, property, value) {
      const layer = this.layers.find((l) => l.id === id);
      if (layer) layer.paint[property] = value;
    }
    setLayoutProperty() {}
    getSource(id) {
      return this.sources.includes(id) ? {} : undefined;
    }
    addSource(id) {
      // As MapLibre does for a source the style already holds.
      if (this.sources.includes(id)) throw new Error(`Source "${id}" already exists.`);
      this.sources.push(id);
    }
    addLayer(layer) {
      this.layers.push({ paint: {}, ...layer });
    }
    setStyle(style) {
      // MapLibre starts the new style with only its own layers.
      this.styles.push(style);
      this.layers = [];
      this.sources = [];
    }
    fitBounds() {}
    remove() {
      this.removed = true;
    }
  }
  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return { Map: FakeMap, Marker: FakeMarker, setWorkerUrl: vi.fn() };
});
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/worker.js' }));

const GEOMETRY = {
  type: 'Polygon',
  coordinates: [
    [
      [-90.45, 38.65],
      [-90.44, 38.65],
      [-90.44, 38.66],
      [-90.45, 38.65],
    ],
  ],
};
const LIGHT = { ink: 'oklch(0.22 0.008 185)', muted: 'oklch(0.47 0.012 185)' };
const DARK = { ink: 'oklch(0.94 0.004 185)', muted: 'oklch(0.75 0.01 185)' };

let scheme;
let container;

function setTokens({ ink, muted }) {
  container.style.setProperty('--color-ink', ink);
  container.style.setProperty('--color-muted', muted);
}

beforeEach(() => {
  maps.length = 0;
  const listeners = new Set();
  scheme = {
    matches: false,
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    flip() {
      scheme.matches = !scheme.matches;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => scheme),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => ({ ok: true, json: async () => ({ url }) })),
  );
  // In the page, as jsdom recomputes styles only for attached elements.
  container = document.createElement('div');
  document.body.append(container);
  setTokens(LIGHT);
});

afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const lineColor = (map) => map.layers.find((l) => l.id === 'precinct-line').paint['line-color'];

let onFail;

function create() {
  onFail = vi.fn();
  return createPrecinctMap(container, {
    geometry: GEOMETRY,
    origin: null,
    polls: [{ lat: 38.655, lng: -90.445 }],
    onReady: vi.fn(),
    onFail,
  });
}

describe('the precinct map and the color scheme', () => {
  it('opens on the basemap for the scheme', () => {
    scheme.matches = true;
    create();
    expect(maps[0].options.style).toBe(BASEMAP_DARK_STYLE_URL);
  });

  it('draws the precinct again, in the new colors, after the scheme changes', async () => {
    create();
    const map = maps[0];
    expect(map.options.style).toBe(BASEMAP_STYLE_URL);
    map.fire('style.load');
    expect(map.sources).toEqual(['precinct']);
    const light = lineColor(map);

    setTokens(DARK);
    scheme.flip();
    await flush();
    expect(map.styles.at(-1)).toEqual({ url: BASEMAP_DARK_STYLE_URL });
    // The new style dropped the precinct until its own load.
    expect(map.layers).toEqual([]);
    map.fire('style.load');
    expect(map.sources).toEqual(['precinct']);
    expect(map.layers.map((l) => l.id)).toEqual(['precinct-fill', 'precinct-line']);
    expect(lineColor(map)).not.toBe(light);
  });

  it('keeps a still-loading map when a style load already holds the precinct', () => {
    // MapLibre restoring a lost WebGL context puts back the style it saved,
    // precinct included, and fires style.load again.
    create();
    const map = maps[0];
    map.fire('style.load');
    setTokens(DARK);
    map.fire('style.load');
    expect(onFail).not.toHaveBeenCalled();
    expect(map.removed).toBe(false);
    expect(map.sources).toEqual(['precinct']);
    expect(lineColor(map)).toMatch(/^rgb\(2[0-9]{2}, /);
  });

  it('stops following the scheme once removed', async () => {
    const view = create();
    view.remove();
    expect(scheme.listeners.size).toBe(0);
    scheme.flip();
    await flush();
    expect(maps[0].styles).toHaveLength(1);
  });
});
