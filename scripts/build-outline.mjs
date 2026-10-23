// Builds the home page dot map's outlines (#184) from the boards' own layers:
// the County's boundary (`countyBoundary`) and the City's citywide district
// (`boundary` with `boundaryWhere`), both named in src/config/election.js.
// Each outline is simplified with Douglas-Peucker (here, no dependency),
// projected (longitude scaled by cos(38.6 deg), latitude as is), fitted to one
// view and rounded to tenths, then written to src/features/waitTimes/outline.js,
// which is committed. The app never asks for the outlines itself.
//
// Usage: node scripts/build-outline.mjs [--check]
//   --check rebuilds the module and exits 1 when it differs from the committed
//   one, so the daily data health check notices a moved boundary or a layer
//   that stopped answering (.github/workflows/data-health.yml).

import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import election, { jurisdictions } from '../src/config/election.js';

/** The committed module's first line. */
export const HEADER =
  '// Written by scripts/build-outline.mjs (#184). Do not edit; run the script again.';

/** The map's view box, in its own units, and the margin kept inside it. */
export const VIEW = Object.freeze({ width: 300, height: 300, pad: 6 });

/** Douglas-Peucker tolerance, in view units. */
export const TOLERANCE = 0.6;

/** The latitude whose cosine scales longitude: the middle of the area. */
export const MID_LATITUDE = 38.6;

const OUTPUT = new URL('../src/features/waitTimes/outline.js', import.meta.url);

// Distance from p to the segment a..b.
function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Douglas-Peucker: the points of `line` that keep it within `tolerance` of the
 * original, the first and last always kept.
 * @param {[number, number][]} line
 * @param {number} tolerance
 * @returns {[number, number][]}
 */
export function simplify(line, tolerance) {
  if (line.length < 3) return [...line];
  const keep = new Array(line.length).fill(false);
  keep[0] = true;
  keep[line.length - 1] = true;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i += 1) {
      const d = segmentDistance(line[i], line[first], line[last]);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

const tenths = (value) => Math.round(value * 10) / 10;

/**
 * One ring of [lng, lat] as a flat [x0, y0, x1, y1, ...] list in view units.
 * @param {[number, number][]} ring
 * @param {{ lng0: number, lat0: number, kx: number, scale: number,
 *   x0?: number, y0?: number }} projection
 */
export function projectRing(ring, { lng0, lat0, kx, scale, x0 = 0, y0 = 0 }) {
  return ring.flatMap(([lng, lat]) => [
    tenths(x0 + (lng - lng0) * kx * scale),
    tenths(y0 + (lat0 - lat) * scale),
  ]);
}

/**
 * Both outlines fitted to `view`: the projection fits the County's ring (the
 * City lies inside its box) and centers it. Simplified in view units.
 * @param {{ county: [number, number][], city: [number, number][],
 *   view?: { width: number, height: number, pad: number }, tolerance?: number }} input
 */
export function outlineFrom({ county, city, view = VIEW, tolerance = TOLERANCE }) {
  const kx = Math.cos((MID_LATITUDE * Math.PI) / 180);
  const lngs = county.map(([lng]) => lng);
  const lats = county.map(([, lat]) => lat);
  const lng0 = Math.min(...lngs);
  const lat0 = Math.max(...lats);
  const spanX = (Math.max(...lngs) - lng0) * kx;
  const spanY = lat0 - Math.min(...lats);
  const scale = Math.min((view.width - 2 * view.pad) / spanX, (view.height - 2 * view.pad) / spanY);
  const projection = {
    lng0,
    lat0,
    kx,
    scale,
    x0: (view.width - spanX * scale) / 2,
    y0: (view.height - spanY * scale) / 2,
  };
  const ring = (points) => {
    const flat = projectRing(points, { ...projection, x0: 0, y0: 0 });
    const pairs = [];
    for (let i = 0; i < flat.length; i += 2) {
      pairs.push([flat[i] + projection.x0, flat[i + 1] + projection.y0]);
    }
    return simplify(pairs, tolerance).flatMap(([x, y]) => [tenths(x), tenths(y)]);
  };
  return {
    view: { width: view.width, height: view.height },
    projection,
    county: ring(county),
    city: ring(city),
  };
}

/**
 * The module's text, before formatting.
 * @param {ReturnType<typeof outlineFrom>} outline
 */
export function buildModule({ view, projection, county, city }) {
  const round = (value, digits) => Number(value.toFixed(digits));
  const p = {
    lng0: round(projection.lng0, 6),
    lat0: round(projection.lat0, 6),
    kx: round(projection.kx, 8),
    scale: round(projection.scale, 4),
    x0: round(projection.x0, 4),
    y0: round(projection.y0, 4),
  };
  return `${HEADER}
// Sources: the County's \`countyBoundary\` layer and the City's \`boundary\`
// layer with \`boundaryWhere\`, as src/config/election.js names them.
// Rings are flat [x0, y0, x1, y1, ...] lists in view units; y grows down.

/** The view box. */
export const VIEW = Object.freeze(${JSON.stringify(view)});

/**
 * x = x0 + (lng - lng0) * kx * scale, y = y0 + (lat0 - lat) * scale, where kx
 * is cos(${MID_LATITUDE} deg).
 */
export const PROJECTION = Object.freeze(${JSON.stringify(p)});

/** St. Louis County's outline. */
export const COUNTY_RING = Object.freeze(${JSON.stringify(county)});

/** The City of St. Louis's outline. */
export const CITY_RING = Object.freeze(${JSON.stringify(city)});
`;
}

// The largest outer ring of a GeoJSON Polygon or MultiPolygon.
function outerRing(geometry) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  return polygons.map((polygon) => polygon[0]).sort((a, b) => b.length - a.length)[0];
}

async function fetchRing(serviceRoot, layer, where) {
  const params = new URLSearchParams({
    where,
    outFields: 'OBJECTID',
    orderByFields: 'OBJECTID',
    resultRecordCount: '1',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  const url = `${serviceRoot}/${layer}/query?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${layer}: HTTP ${response.status}`);
  const body = await response.json();
  const geometry = body.features?.[0]?.geometry;
  if (!geometry) throw new Error(`${layer}: no outline in the answer`);
  return outerRing(geometry);
}

async function format(text) {
  const prettier = await import('prettier');
  const options = await prettier.resolveConfig(fileURLToPath(OUTPUT));
  return prettier.format(text, { ...options, filepath: fileURLToPath(OUTPUT) });
}

async function main() {
  const check = process.argv.includes('--check');
  const city = jurisdictions.city;
  const [countyRing, cityRing] = await Promise.all([
    fetchRing(election.serviceRoot, election.layers.countyBoundary, '1=1'),
    fetchRing(city.serviceRoot, city.layers.boundary, city.boundaryWhere),
  ]);
  const text = await format(buildModule(outlineFrom({ county: countyRing, city: cityRing })));
  if (check) {
    const committed = await readFile(OUTPUT, 'utf8');
    if (committed !== text) {
      console.log('FAIL outline: the boundary layers no longer match outline.js; run the script');
      process.exitCode = 1;
    } else {
      console.log('PASS outline: outline.js matches the County and City boundary layers');
    }
    return;
  }
  await writeFile(OUTPUT, text);
  console.log(`Wrote ${fileURLToPath(OUTPUT)}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.log(`FAIL outline: ${error.message}`);
    process.exitCode = 1;
  });
}
