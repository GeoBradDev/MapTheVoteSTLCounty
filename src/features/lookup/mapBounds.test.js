import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import { parseOklch, partyColor, toOklch } from '../../test/colors.js';
import { mapBounds, oklchToRgb, placesKey } from './mapBounds.js';

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [-90.5, 38.6],
      [-90.4, 38.6],
      [-90.4, 38.7],
      [-90.5, 38.7],
      [-90.5, 38.6],
    ],
  ],
};

describe('mapBounds', () => {
  it('is the outline bounds when there are no points', () => {
    expect(mapBounds({ geometry: square })).toEqual([
      [-90.5, 38.6],
      [-90.4, 38.7],
    ]);
  });

  it('grows to take in the looked-up point and the polling places', () => {
    const bounds = mapBounds({
      geometry: square,
      points: [
        { lat: 38.75, lng: -90.45 },
        { lat: 38.55, lng: -90.3 },
      ],
    });
    expect(bounds).toEqual([
      [-90.5, 38.55],
      [-90.3, 38.75],
    ]);
  });

  it('reads MultiPolygons and holes', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [
        square.coordinates,
        [
          [
            [-91, 38],
            [-90.9, 38],
            [-90.9, 38.1],
            [-91, 38],
          ],
        ],
      ],
    };
    expect(mapBounds({ geometry: multi })).toEqual([
      [-91, 38],
      [-90.4, 38.7],
    ]);
  });

  it('reads the recorded precinct outline', () => {
    const [[west, south], [east, north]] = mapBounds({ geometry: geometry.features[0].geometry });
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(west).toBeGreaterThan(-91);
    expect(north).toBeLessThan(39);
  });

  it('skips points without finite coordinates', () => {
    expect(
      mapBounds({ geometry: square, points: [{ lat: NaN, lng: -80 }, null, { lat: 40 }] }),
    ).toEqual([
      [-90.5, 38.6],
      [-90.4, 38.7],
    ]);
  });

  it('works from points alone, and is null with nothing to show', () => {
    expect(mapBounds({ geometry: null, points: [{ lat: 38.6, lng: -90.4 }] })).toEqual([
      [-90.4, 38.6],
      [-90.4, 38.6],
    ]);
    expect(mapBounds({ geometry: { type: 'Point', coordinates: [1, 2] } })).toBeNull();
    expect(mapBounds({})).toBeNull();
  });
});

describe('oklchToRgb', () => {
  it('converts our tokens to the sRGB MapLibre can parse, keeping the hue', () => {
    for (const token of ['oklch(0.42 0.07 165)', 'oklch(0.72 0.12 80)', 'oklch(42% 0.07 165)']) {
      const rgb = oklchToRgb(token);
      expect(rgb).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/);
      const back = toOklch(rgb.replace(/,/g, ''));
      const original = parseOklch(token.replace('42%', '0.42'));
      expect(parseOklch(back).chroma).toBeCloseTo(original.chroma, 2);
      expect(Math.abs(parseOklch(back).hue - original.hue)).toBeLessThan(2);
      expect(partyColor(back)).toBeNull();
    }
  });

  it('maps white and black exactly', () => {
    expect(oklchToRgb('oklch(1 0 0)')).toBe('rgb(255, 255, 255)');
    expect(oklchToRgb('oklch(0 0 0)')).toBe('rgb(0, 0, 0)');
  });

  it('is null for anything else', () => {
    expect(oklchToRgb('')).toBeNull();
    expect(oklchToRgb(undefined)).toBeNull();
    expect(oklchToRgb('#205943')).toBeNull();
    expect(oklchToRgb('oklch(a b c)')).toBeNull();
  });
});

describe('placesKey (#107)', () => {
  const a = { lat: 38.6, lng: -90.3 };
  const b = { lat: 38.7, lng: -90.4 };

  it('is the same for the same places in another order, so a reorder keeps the camera', () => {
    expect(placesKey([a, b])).toBe(placesKey([b, a]));
  });

  it('changes when a place is added or moved', () => {
    expect(placesKey([a])).not.toBe(placesKey([a, b]));
    expect(placesKey([a, b])).not.toBe(placesKey([a, { ...b, lat: 38.71 }]));
  });
});
