// The home page dot map's outlines (#184): the committed module that
// scripts/build-outline.mjs writes from the County's and the City's own
// boundary layers, and the script's pure steps.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import {
  buildModule,
  HEADER,
  outlineFrom,
  projectRing,
  simplify,
} from '../../../scripts/build-outline.mjs';
import { CITY_RING, COUNTY_RING, PROJECTION, VIEW } from './outline.js';
import { project } from './dotMapModel.js';

const source = readFileSync(new URL('./outline.js', import.meta.url), 'utf8');

// Even-odd ray casting over a flat [x0, y0, x1, y1, ...] ring.
function inside(ring, [x, y]) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Public buildings, as in scripts/check-config.mjs.
const COUNTY_POINTS = [
  { name: 'Berkeley City Hall', lat: 38.7504, lng: -90.33064 },
  { name: 'Clayton, County Government Center', lat: 38.6497, lng: -90.3366 },
  { name: 'Fenton City Hall', lat: 38.5131, lng: -90.4357 },
];
const CITY_POINTS = [
  { name: 'City Hall, St. Louis City', lat: 38.62741, lng: -90.19843 },
  { name: 'Forest Park', lat: 38.6367, lng: -90.2851 },
];

describe('the committed outline', () => {
  it('is under 2 KB gzipped for both outlines', () => {
    expect(gzipSync(source).length).toBeLessThan(2048);
  });

  it('holds two closed rings inside the view', () => {
    for (const ring of [COUNTY_RING, CITY_RING]) {
      expect(ring.length % 2).toBe(0);
      expect(ring.length).toBeGreaterThanOrEqual(20);
      for (let i = 0; i < ring.length; i += 2) {
        expect(ring[i]).toBeGreaterThanOrEqual(0);
        expect(ring[i]).toBeLessThanOrEqual(VIEW.width);
        expect(ring[i + 1]).toBeGreaterThanOrEqual(0);
        expect(ring[i + 1]).toBeLessThanOrEqual(VIEW.height);
      }
    }
  });

  it.each(COUNTY_POINTS)('puts $name in the County, not the City', ({ lat, lng }) => {
    const point = project(lng, lat);
    expect(inside(COUNTY_RING, point)).toBe(true);
    expect(inside(CITY_RING, point)).toBe(false);
  });

  it.each(CITY_POINTS)('puts $name in the City, not the County', ({ lat, lng }) => {
    const point = project(lng, lat);
    expect(inside(CITY_RING, point)).toBe(true);
    expect(inside(COUNTY_RING, point)).toBe(false);
  });

  it('scales longitude by cos(38.6 deg)', () => {
    expect(PROJECTION.kx).toBeCloseTo(Math.cos((38.6 * Math.PI) / 180), 6);
  });
});

describe('build-outline steps', () => {
  it('simplifies a line with Douglas-Peucker, keeping the ends and the far point', () => {
    const line = [
      [0, 0],
      [1, 0.05],
      [2, -0.04],
      [3, 5],
      [4, 0.02],
      [5, 0],
    ];
    expect(simplify(line, 0.5)).toEqual([
      [0, 0],
      [2, -0.04],
      [3, 5],
      [4, 0.02],
      [5, 0],
    ]);
    expect(simplify(line, 10)).toEqual([
      [0, 0],
      [5, 0],
    ]);
  });

  it('projects and rounds a ring to a flat list of tenths', () => {
    const projection = { lng0: -91, lat0: 39, kx: 0.5, scale: 100 };
    expect(
      projectRing(
        [
          [-90.5, 38.5],
          [-90.25, 38.75],
        ],
        projection,
      ),
    ).toEqual([25, 50, 37.5, 25]);
  });

  it('fits both rings in the view, with the projection the module exports', () => {
    const square = (x0, y0, size) => [
      [x0, y0],
      [x0 + size, y0],
      [x0 + size, y0 + size],
      [x0, y0 + size],
      [x0, y0],
    ];
    const out = outlineFrom({
      county: square(-90.8, 38.4, 0.5),
      city: square(-90.3, 38.55, 0.1),
      view: { width: 200, height: 160, pad: 10 },
      tolerance: 0,
    });
    const xs = out.county.filter((_, i) => i % 2 === 0);
    const ys = out.county.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs)).toBeLessThanOrEqual(190);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(150);
    const text = buildModule(out);
    expect(text).toContain('export const COUNTY_RING');
    expect(text).toContain('export const CITY_RING');
    expect(text).toContain('export const PROJECTION');
  });

  it('marks the committed module as written by the script', () => {
    expect(source.startsWith(HEADER)).toBe(true);
  });
});
