// @vitest-environment node
import { interiorPoint } from './interiorPoint.js';

// Even-odd point-in-polygon over every ring, holes included.
function inside([x, y], rings) {
  let isInside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) isInside = !isInside;
    }
  }
  return isInside;
}

const square = [
  [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ],
];

// A U shape: its centroid, about (2, 1.6), is in the gap between the arms.
const uShape = [
  [
    [0, 0],
    [4, 0],
    [4, 4],
    [3, 4],
    [3, 1],
    [1, 1],
    [1, 4],
    [0, 4],
    [0, 0],
  ],
];

describe('interiorPoint', () => {
  it('returns a point inside a square, as { lat, lng }', () => {
    const point = interiorPoint({ type: 'Polygon', coordinates: square });
    expect(inside([point.lng, point.lat], square)).toBe(true);
  });

  it('returns a point inside a U shape, whose centroid is outside it', () => {
    const point = interiorPoint({ type: 'Polygon', coordinates: uShape });
    expect(inside([point.lng, point.lat], uShape)).toBe(true);
  });

  it('keeps out of a hole', () => {
    const withHole = [
      ...square,
      [
        [0.5, 0.5],
        [3.5, 0.5],
        [3.5, 3.5],
        [0.5, 3.5],
        [0.5, 0.5],
      ],
    ];
    const point = interiorPoint({ type: 'Polygon', coordinates: withHole });
    expect(inside([point.lng, point.lat], withHole)).toBe(true);
  });

  it('takes the larger part of a MultiPolygon', () => {
    const small = [
      [
        [10, 10],
        [10.1, 10],
        [10.1, 10.1],
        [10, 10],
      ],
    ];
    const point = interiorPoint({ type: 'MultiPolygon', coordinates: [small, square] });
    expect(inside([point.lng, point.lat], square)).toBe(true);
  });

  it.each([
    ['nothing', undefined],
    ['a point', { type: 'Point', coordinates: [0, 0] }],
    ['an empty polygon', { type: 'Polygon', coordinates: [] }],
    [
      'a line-thin ring',
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    ],
  ])('returns null for %s', (_, geometry) => {
    expect(interiorPoint(geometry)).toBeNull();
  });
});
