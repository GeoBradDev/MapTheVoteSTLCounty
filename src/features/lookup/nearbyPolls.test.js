import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import {
  directionsLinks,
  distanceMiles,
  isAppleMobile,
  nearestPolls,
  pollRows,
  polygonCenter,
  titleCase,
} from './nearbyPolls.js';

function coordinatesOf(name) {
  const feature = polls.features.find((f) => f.properties.name === name);
  const [lng, lat] = feature.geometry.coordinates;
  return { lat, lng };
}

function poll(name, lat, lng, extra = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { loc: '001', name, address: '1 MAIN ST', zipcode: 63101, ...extra },
  };
}

describe('distanceMiles', () => {
  // Reference values: WGS 84 geodesic distances from pyproj,
  // Geod(ellps='WGS84').inv(lng1, lat1, lng2, lat2), in meters / 1609.344.
  it.each([
    [{ lat: 38.66, lng: -90.45 }, 'PARKWAY CENTRAL SR HIGH SCHOOL', 2.944385],
    [{ lat: 38.66, lng: -90.45 }, 'AEROSPACE DIST LODGE 837', 9.066098],
    [{ lat: 38.6, lng: -90.65 }, 'BELLEFONTAINE NBRS REC CTR', 24.896195],
    [{ lat: 38.6, lng: -90.65 }, 'WILDWOOD CITY HALL', 1.656466],
  ])('is within 0.1 mi of the geodesic distance from %o to %s', (from, name, expected) => {
    expect(Math.abs(distanceMiles(from, coordinatesOf(name)) - expected)).toBeLessThan(0.1);
  });

  it('is zero for the same point and symmetric', () => {
    const a = { lat: 38.6, lng: -90.4 };
    const b = { lat: 38.7, lng: -90.2 };
    expect(distanceMiles(a, a)).toBe(0);
    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a), 10);
  });
});

describe('pollRows', () => {
  it('lists every site with coordinates in layer order, with no distance', () => {
    const rows = pollRows({
      features: [
        poll('B SITE', 38.6, -90.3, { absentee: 'abs602boec' }),
        { type: 'Feature', geometry: null, properties: { name: 'NO GEOMETRY' } },
        poll('A SITE', 38.7, -90.4, { absentee: '' }),
      ],
    });
    expect(rows.map((r) => [r.name, r.waitKey, r.miles])).toEqual([
      ['B Site', 'abs602boec', null],
      ['A Site', null, null],
    ]);
  });
});

describe('nearestPolls', () => {
  it('sorts every polling place in the layer by distance, nearest first', () => {
    const origin = { lat: 38.66, lng: -90.45 };
    const rows = nearestPolls(polls, origin);
    expect(rows).toHaveLength(polls.features.length);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].miles).toBeGreaterThanOrEqual(rows[i - 1].miles);
    }
    // The absentee sites are Election Day polling places too.
    expect(rows.some((row) => row.name === 'Board of Elections')).toBe(true);
  });

  it('gives each row its display fields and coordinates', () => {
    const rows = nearestPolls(
      {
        features: [
          poll('UMSL MILLENNIUM STUDENT CENTER', 38.7, -90.3, {
            loc: '180',
            address: '1 UNIVERSITY BLVD',
            zipcode: 63121,
            abs_type: 'abs',
            notes_abs: 'Use the north door',
            absentee: 'abs612boec',
          }),
        ],
      },
      { lat: 38.7, lng: -90.3 },
    );
    expect(rows).toEqual([
      {
        loc: '180',
        name: 'UMSL Millennium Student Center',
        address: '1 University Blvd',
        zip: '63121',
        absType: 'abs',
        absNote: 'Use the north door',
        waitKey: 'abs612boec',
        lat: 38.7,
        lng: -90.3,
        miles: 0,
      },
    ]);
  });

  it('skips a feature without usable point coordinates', () => {
    const rows = nearestPolls(
      {
        features: [
          poll('GOOD', 38.6, -90.3),
          { type: 'Feature', geometry: null, properties: { name: 'NO GEOMETRY' } },
          { ...poll('BAD', 0, 0), geometry: { type: 'Point', coordinates: ['x', 1] } },
          { ...poll('LINE', 0, 0), geometry: { type: 'LineString', coordinates: [[0, 0]] } },
        ],
      },
      { lat: 38.6, lng: -90.3 },
    );
    expect(rows.map((r) => r.name)).toEqual(['Good']);
  });

  it('gives null absentee fields when the layer has none', () => {
    const [row] = nearestPolls(
      { features: [poll('GOOD', 38.6, -90.3)] },
      { lat: 38.6, lng: -90.3 },
    );
    expect(row.absType).toBeNull();
    expect(row.absNote).toBeNull();
  });

  it('breaks distance ties by location number, so the order is stable', () => {
    const rows = nearestPolls(
      {
        features: [poll('B', 38.6, -90.3, { loc: '002' }), poll('A', 38.6, -90.3, { loc: '001' })],
      },
      { lat: 38.5, lng: -90.3 },
    );
    expect(rows.map((r) => r.loc)).toEqual(['001', '002']);
  });

  it('leaves out a ZIP that is missing, and an address that is missing', () => {
    const [row] = nearestPolls(
      { features: [poll('X', 38.6, -90.3, { zipcode: null, address: null })] },
      { lat: 38.6, lng: -90.3 },
    );
    expect(row.zip).toBeNull();
    expect(row.address).toBeNull();
  });
});

describe('titleCase', () => {
  it.each([
    ['STLCC MERAMEC - STUDENT CENTER', 'STLCC Meramec - Student Center'],
    ['UMSL MILLENNIUM STUDENT CENTER', 'UMSL Millennium Student Center'],
    ['JFK COMMUNITY CENTER', 'JFK Community Center'],
    [
      'VFW POST 2184-GEN GEORGE C MARSHALL MEMORIAL',
      'VFW Post 2184-Gen George C Marshall Memorial',
    ],
    ['ST JOHNS UCC MEHLVILLE', 'St Johns UCC Mehlville'],
    ['MCCLUER SOUTH-BERKELEY', 'McCluer South-Berkeley'],
    ['LEWIS AND CLARK BRANCH LIBRARY', 'Lewis and Clark Branch Library'],
    ['THE CENTER OF CLAYTON', 'The Center of Clayton'],
    ['MARYLAND HEIGHTS CC', 'Maryland Heights CC'],
    ['MRH ELEM SCHOOL', 'MRH Elem School'],
    ['STL COUNTY GOVT CENTER SOUTH', 'STL County Govt Center South'],
    ['RIVERCHASE YMCA', 'Riverchase YMCA'],
    ['AFFTON PAT', 'Affton PAT'],
    ['19 W 1ST ST', '19 W 1st St'],
    ['1500 82ND BLVD', '1500 82nd Blvd'],
    ['620 RUE DE FLEUR DR', '620 Rue de Fleur Dr'],
    ['9909 LEWIS & CLARK BLVD', '9909 Lewis & Clark Blvd'],
    ['300 N NEW BALLAS RD', '300 N New Ballas Rd'],
    ['  BOARD   OF ELECTIONS ', 'Board of Elections'],
  ])('%s reads %s', (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });

  it('gives null for an empty or missing value', () => {
    expect(titleCase('')).toBeNull();
    expect(titleCase(null)).toBeNull();
    expect(titleCase(42)).toBeNull();
  });
});

describe('polygonCenter', () => {
  it('finds the center of a square', () => {
    const square = {
      type: 'Polygon',
      coordinates: [
        [
          [-90, 38],
          [-89, 38],
          [-89, 39],
          [-90, 39],
          [-90, 38],
        ],
      ],
    };
    const center = polygonCenter(square);
    expect(center.lat).toBeCloseTo(38.5, 10);
    expect(center.lng).toBeCloseTo(-89.5, 10);
  });

  it('weights by area and subtracts holes', () => {
    const ring = (x0, y0, x1, y1) => [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ];
    // Left half of a 2 x 1 rectangle cut out: the center moves right.
    const withHole = { type: 'Polygon', coordinates: [ring(0, 0, 2, 1), ring(0, 0, 1, 1)] };
    expect(polygonCenter(withHole)).toEqual({ lat: 0.5, lng: 1.5 });
    const multi = { type: 'MultiPolygon', coordinates: [[ring(0, 0, 1, 1)], [ring(3, 0, 4, 1)]] };
    expect(polygonCenter(multi)).toEqual({ lat: 0.5, lng: 2 });
  });

  it('puts the recorded CC007 outline center inside its bounding box', () => {
    const shape = geometry.features[0].geometry;
    const [lngs, lats] = [0, 1].map((i) => shape.coordinates[0].map((p) => p[i]));
    const center = polygonCenter(shape);
    expect(center.lng).toBeGreaterThan(Math.min(...lngs));
    expect(center.lng).toBeLessThan(Math.max(...lngs));
    expect(center.lat).toBeGreaterThan(Math.min(...lats));
    expect(center.lat).toBeLessThan(Math.max(...lats));
  });

  it('gives null for anything that is not a polygon with area', () => {
    expect(polygonCenter(null)).toBeNull();
    expect(polygonCenter({ type: 'Point', coordinates: [0, 0] })).toBeNull();
    expect(polygonCenter({ type: 'Polygon', coordinates: [] })).toBeNull();
    expect(
      polygonCenter({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ).toBeNull();
  });
});

describe('directionsLinks', () => {
  it('builds Google Maps and Apple Maps directions from coordinates', () => {
    expect(directionsLinks({ lat: 38.7731946, lng: -90.36474 })).toEqual({
      google: 'https://www.google.com/maps/dir/?api=1&destination=38.773195%2C-90.36474',
      apple: 'https://maps.apple.com/?daddr=38.773195%2C-90.36474',
    });
  });
});

describe('isAppleMobile', () => {
  it.each([
    [
      'iPhone',
      {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5,
      },
      true,
    ],
    [
      'iPad (desktop mode)',
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      },
      true,
    ],
    [
      'Mac',
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      },
      false,
    ],
    [
      'Android',
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
      },
      false,
    ],
  ])('%s: %s', (_label, nav, expected) => {
    expect(isAppleMobile(nav)).toBe(expected);
  });

  it('is false without a navigator', () => {
    expect(isAppleMobile(undefined)).toBe(false);
  });
});
