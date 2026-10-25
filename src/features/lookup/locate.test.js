// The three test addresses run end to end against live responses recorded by
// scripts/record-fixtures.mjs. Places use the geocoder-neutral shape any
// geocoder can fill (see docs/data.md, Geocoding).
// @vitest-environment node
import boundaryAtCity from '../../../docs/raw/fixtures/boundary-at-city.json';
import boundaryAtOutOfState from '../../../docs/raw/fixtures/boundary-at-out-of-state.json';
import boundaryAtStCharles from '../../../docs/raw/fixtures/boundary-at-st-charles.json';
import boundaryInside from '../../../docs/raw/fixtures/boundary-inside.json';
import precinctAtCity from '../../../docs/raw/fixtures/precinct-at-city.json';
import precinctAtOutOfState from '../../../docs/raw/fixtures/precinct-at-out-of-state.json';
import precinctAtStCharles from '../../../docs/raw/fixtures/precinct-at-st-charles.json';
import atPoint from '../../../docs/raw/fixtures/precinct-at-point.json';
import cityPrecinctAtPoint from '../../../docs/raw/fixtures/city-precinct-at-point.json';
import cityPrecinctAtCounty from '../../../docs/raw/fixtures/city-precinct-at-county.json';
import election, { jurisdictions } from '../../config/election.js';
import cityOutline from '../../../docs/raw/fixtures/city-outline.json';
import { classifyPlace, eastOfCity, locate } from './locate.js';

const PRECINCTS = `${election.serviceRoot}/${election.layers.precincts}/query`;
const BOUNDARY = `${election.serviceRoot}/${election.layers.countyBoundary}/query`;
const CITY_PRECINCTS = `${jurisdictions.city.serviceRoot}/${jurisdictions.city.layers.precincts}/query`;

// 1200 Market St, St. Louis, MO 63103 (City Hall).
const CITY = { lat: 38.62741, lng: -90.19843, state: 'MO', county: 'St. Louis city' };
// 200 N 2nd St, St. Charles, MO 63301.
const ST_CHARLES = { lat: 38.78267, lng: -90.48187, state: 'MO', county: 'St. Charles County' };
// 301 W Main St, Belleville, IL 62220.
const OUT_OF_STATE = { lat: 38.51368, lng: -89.98831, state: 'IL', county: 'St. Clair County' };
// A point inside the county (precinct HAD023).
const INSIDE = { lat: 38.62, lng: -90.33, state: 'MO', county: 'St. Louis County' };
// A county point near the City line (Clayton), inside the City's extent.
const NEAR_CITY = { lat: 38.6493, lng: -90.3239 };

const RESPONSES = {
  [`${PRECINCTS} ${CITY.lng},${CITY.lat}`]: precinctAtCity,
  [`${BOUNDARY} ${CITY.lng},${CITY.lat}`]: boundaryAtCity,
  [`${PRECINCTS} ${ST_CHARLES.lng},${ST_CHARLES.lat}`]: precinctAtStCharles,
  [`${BOUNDARY} ${ST_CHARLES.lng},${ST_CHARLES.lat}`]: boundaryAtStCharles,
  [`${PRECINCTS} ${OUT_OF_STATE.lng},${OUT_OF_STATE.lat}`]: precinctAtOutOfState,
  [`${BOUNDARY} ${OUT_OF_STATE.lng},${OUT_OF_STATE.lat}`]: boundaryAtOutOfState,
  [`${PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: atPoint,
  [`${BOUNDARY} ${INSIDE.lng},${INSIDE.lat}`]: boundaryInside,
  [`${CITY_PRECINCTS} ${CITY.lng},${CITY.lat}`]: cityPrecinctAtPoint,
  [`${PRECINCTS} ${NEAR_CITY.lng},${NEAR_CITY.lat}`]: atPoint,
};

const EMPTY = { features: [] };
let fetchMock;

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// Answers each request with the recording for its layer and point. The point
// is in the POST body (#38), never the URL.
function recorded(overrides = {}) {
  return async (input, init) => {
    const url = new URL(input);
    const geometry = new URLSearchParams(init?.body).get('geometry');
    const key = `${url.origin}${url.pathname} ${geometry}`;
    if (key in overrides) return overrides[key]();
    if (!(key in RESPONSES)) throw new Error(`No recording for ${key}`);
    return respond(RESPONSES[key]);
  };
}

function requestedLayers() {
  return fetchMock.mock.calls.map(([input]) => {
    const { origin, pathname } = new URL(input);
    return `${origin}${pathname}`;
  });
}

beforeEach(() => {
  fetchMock = vi.fn(recorded());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('locate, with the three test addresses', () => {
  it('finds a St. Louis City address in its City precinct (#88)', async () => {
    const result = await locate(CITY);
    expect(result).toMatchObject({ kind: 'precinct', jurisdiction: 'city' });
    expect(result.precinct.code).toMatch(/^W\d{2}P\d{2}$/);
  });

  it('sends a St. Charles County address to the Missouri Voter Outreach Center', async () => {
    expect(await locate(ST_CHARLES)).toEqual({ kind: 'missouri' });
  });

  it('gives an out-of-state address the generic message', async () => {
    expect(await locate(OUT_OF_STATE)).toEqual({ kind: 'out-of-state' });
  });

  it('asks only the City precinct layer for a place the geocoder names as the City', async () => {
    await locate(CITY);
    expect(requestedLayers()).toEqual([CITY_PRECINCTS]);
  });

  it('checks the county precinct layer first, then the boundary, far from the City', async () => {
    await locate(ST_CHARLES);
    expect(requestedLayers()).toEqual([PRECINCTS, BOUNDARY]);
  });
});

describe('locate, inside the county', () => {
  it('resolves to the precinct and skips the boundary query', async () => {
    const result = await locate(INSIDE);
    expect(result).toMatchObject({ kind: 'precinct', jurisdiction: 'county' });
    expect(result.precinct.precinct).toBe('HAD023');
    expect(requestedLayers()).toEqual([PRECINCTS]);
  });

  it('works from coordinates alone, as from "Use my location"', async () => {
    const result = await locate({ lat: INSIDE.lat, lng: INSIDE.lng });
    expect(result.kind).toBe('precinct');
  });

  it('sends a point inside the boundary with no precinct to the official lookup', async () => {
    fetchMock.mockImplementation(
      recorded({ [`${PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: () => respond(EMPTY) }),
    );
    expect(await locate({ lat: INSIDE.lat, lng: INSIDE.lng })).toEqual({
      kind: 'county-unmatched',
    });
  });

  it('trusts the boundary over a geocoder that names another county', async () => {
    fetchMock.mockImplementation(
      recorded({
        [`${PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: () => respond(EMPTY),
        [`${CITY_PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: () => respond(EMPTY),
      }),
    );
    expect(await locate({ ...INSIDE, county: 'St. Louis city' })).toEqual({
      kind: 'county-unmatched',
    });
  });
});

describe('locate, when the geocoder and the map disagree', () => {
  it('sends a point outside the boundary to Missouri even if the geocoder says St. Louis County', async () => {
    expect(await locate({ ...ST_CHARLES, county: 'St. Louis County' })).toEqual({
      kind: 'missouri',
    });
  });
});

describe('locate, when a query fails', () => {
  it('rejects when the precinct query fails, without a boundary query', async () => {
    fetchMock.mockImplementation(
      recorded({ [`${PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: () => respond({}, 404) }),
    );
    await expect(locate(INSIDE)).rejects.toMatchObject({ name: 'ServiceError', status: 404 });
    expect(requestedLayers()).toEqual([PRECINCTS]);
  });

  it('falls back to the geocoder fields when the boundary query fails', async () => {
    fetchMock.mockImplementation(
      recorded({ [`${BOUNDARY} ${ST_CHARLES.lng},${ST_CHARLES.lat}`]: () => respond({}, 404) }),
    );
    expect(await locate(ST_CHARLES)).toEqual({ kind: 'missouri' });
  });

  it('treats a geocoder that says St. Louis County as in the county when the boundary fails', async () => {
    fetchMock.mockImplementation(
      recorded({
        [`${PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: () => respond(EMPTY),
        [`${BOUNDARY} ${INSIDE.lng},${INSIDE.lat}`]: () => respond({}, 404),
      }),
    );
    expect(await locate(INSIDE)).toEqual({ kind: 'county-unmatched' });
  });

  it.each([[{ lat: '38.6', lng: -90.2 }], [{ lat: 38.6 }], [null], [undefined]])(
    'rejects %o with TypeError and sends nothing',
    async (place) => {
      await expect(locate(place)).rejects.toThrow(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('locate, in St. Louis City (#88)', () => {
  const cityFails = { [`${CITY_PRECINCTS} ${CITY.lng},${CITY.lat}`]: () => respond({}, 500) };
  const cityEmpty = { [`${CITY_PRECINCTS} ${CITY.lng},${CITY.lat}`]: () => respond(EMPTY) };

  it('works from coordinates alone, as from "Use my location"', async () => {
    const result = await locate({ lat: CITY.lat, lng: CITY.lng });
    expect(result).toMatchObject({ kind: 'precinct', jurisdiction: 'city' });
    expect(requestedLayers()).toEqual([PRECINCTS, CITY_PRECINCTS]);
  });

  it('gives the City precinct the code the layer ID reads as', async () => {
    const result = await locate(CITY);
    const id = cityPrecinctAtPoint.features[0].attributes[jurisdictions.city.precinctField];
    const [, ward, precinct] = id.match(/^W (\d+) P (\d+)$/);
    expect(result.precinct.code).toBe(`W${ward.padStart(2, '0')}P${precinct.padStart(2, '0')}`);
  });

  it('a county point near the City line stays in its county precinct, without the City', async () => {
    const result = await locate(NEAR_CITY);
    expect(result).toMatchObject({ kind: 'precinct', jurisdiction: 'county' });
    expect(requestedLayers()).toEqual([PRECINCTS]);
  });

  it('a county point the county layer misses near the City asks the City layer', async () => {
    fetchMock.mockImplementation(
      recorded({
        [`${PRECINCTS} ${NEAR_CITY.lng},${NEAR_CITY.lat}`]: () => respond(EMPTY),
        [`${CITY_PRECINCTS} ${NEAR_CITY.lng},${NEAR_CITY.lat}`]: () =>
          respond(cityPrecinctAtCounty),
        [`${BOUNDARY} ${NEAR_CITY.lng},${NEAR_CITY.lat}`]: () => respond(boundaryInside),
      }),
    );
    expect(await locate(NEAR_CITY)).toEqual({ kind: 'county-unmatched' });
    expect(requestedLayers()).toEqual([PRECINCTS, CITY_PRECINCTS, BOUNDARY]);
  });

  it('never sends a point far from the City to the City layer', async () => {
    await locate(OUT_OF_STATE);
    await locate({ lat: ST_CHARLES.lat, lng: ST_CHARLES.lng });
    expect(requestedLayers()).not.toContain(CITY_PRECINCTS);
  });

  it('a City place gets the City referral when the City layer fails', async () => {
    fetchMock.mockImplementation(recorded(cityFails));
    expect(await locate(CITY)).toEqual({ kind: 'stl-city' });
  });

  it('a City place gets the City referral when the City layer finds nothing', async () => {
    fetchMock.mockImplementation(recorded(cityEmpty));
    expect(await locate(CITY)).toEqual({ kind: 'stl-city' });
  });

  it('a City place gets the City referral when both precinct layers fail', async () => {
    fetchMock.mockImplementation(
      recorded({
        ...cityFails,
        [`${PRECINCTS} ${CITY.lng},${CITY.lat}`]: () => respond({}, 500),
      }),
    );
    expect(await locate(CITY)).toEqual({ kind: 'stl-city' });
  });

  it('a point near the City gets the City referral when the City layer and the boundary both fail', async () => {
    fetchMock.mockImplementation(
      recorded({ ...cityFails, [`${BOUNDARY} ${CITY.lng},${CITY.lat}`]: () => respond({}, 500) }),
    );
    expect(await locate({ lat: CITY.lat, lng: CITY.lng })).toEqual({ kind: 'stl-city' });
  });

  it('a point near the City, outside the county, gets the City referral when the City layer fails', async () => {
    fetchMock.mockImplementation(recorded(cityFails));
    expect(await locate({ lat: CITY.lat, lng: CITY.lng })).toEqual({ kind: 'stl-city' });
  });

  // Review finding: a place the geocoder puts in the county, at a point in the
  // City, is never told it is outside the City and County when the City
  // layer fails.
  it('a county-named place near the City, outside the county, gets the City referral when the City layer fails', async () => {
    fetchMock.mockImplementation(recorded(cityFails));
    const place = { lat: CITY.lat, lng: CITY.lng, state: 'Missouri', county: 'Saint Louis County' };
    expect(await locate(place)).toEqual({ kind: 'stl-city' });
  });

  // On the Illinois bank, inside the City's extent box (finder report, #88).
  const EAST_ST_LOUIS = { lat: 38.6285, lng: -90.172, state: 'IL', county: 'St. Clair County' };

  it('never asks the City layer for a place the geocoder puts out of state', async () => {
    fetchMock.mockImplementation(
      recorded({
        [`${PRECINCTS} ${EAST_ST_LOUIS.lng},${EAST_ST_LOUIS.lat}`]: () => respond(EMPTY),
        [`${BOUNDARY} ${EAST_ST_LOUIS.lng},${EAST_ST_LOUIS.lat}`]: () => respond(EMPTY),
      }),
    );
    expect(await locate(EAST_ST_LOUIS)).toEqual({ kind: 'out-of-state' });
    expect(requestedLayers()).not.toContain(CITY_PRECINCTS);
  });

  it('a place the geocoder puts in another Missouri county is not asked of the City', async () => {
    fetchMock.mockImplementation(
      recorded({
        [`${PRECINCTS} ${CITY.lng},${CITY.lat}`]: () => respond(EMPTY),
        [`${BOUNDARY} ${CITY.lng},${CITY.lat}`]: () => respond(EMPTY),
      }),
    );
    await locate({ lat: CITY.lat, lng: CITY.lng, state: 'MO', county: 'Jefferson County' });
    expect(requestedLayers()).not.toContain(CITY_PRECINCTS);
  });

  it('a City place in a county precinct is that county precinct (the point decides)', async () => {
    fetchMock.mockImplementation(
      recorded({ [`${CITY_PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: () => respond(EMPTY) }),
    );
    const result = await locate({ ...INSIDE, county: 'St. Louis city' });
    expect(result).toMatchObject({ kind: 'precinct', jurisdiction: 'county' });
  });
});

describe('locate, on the Illinois bank while the City layer is down (#144)', () => {
  // Venice, IL and East St. Louis, IL: inside the City's extent box, east of
  // the river. Coordinates alone, as from "Use my location".
  const VENICE = { lat: 38.672, lng: -90.17 };
  const EAST_ST_LOUIS = { lat: 38.6285, lng: -90.172 };

  function outage({ lat, lng }) {
    return recorded({
      [`${PRECINCTS} ${lng},${lat}`]: () => respond(EMPTY),
      [`${CITY_PRECINCTS} ${lng},${lat}`]: () => respond({}, 500),
      [`${BOUNDARY} ${lng},${lat}`]: () => respond(EMPTY),
    });
  }

  it.each([
    ['Venice', VENICE],
    ['East St. Louis', EAST_ST_LOUIS],
  ])('%s gets what it gets with the City layer up, not the City referral', async (_, point) => {
    fetchMock.mockImplementation(outage(point));
    expect(await locate(point)).toEqual({ kind: 'unknown' });
  });

  it('Venice with the boundary down too is still not sent to the City', async () => {
    fetchMock.mockImplementation(
      recorded({
        [`${PRECINCTS} ${VENICE.lng},${VENICE.lat}`]: () => respond(EMPTY),
        [`${CITY_PRECINCTS} ${VENICE.lng},${VENICE.lat}`]: () => respond({}, 500),
        [`${BOUNDARY} ${VENICE.lng},${VENICE.lat}`]: () => respond({}, 500),
      }),
    );
    expect(await locate(VENICE)).toEqual({ kind: 'unknown' });
  });

  it('a point in the City still gets the City referral when the City layer fails', async () => {
    const point = { lat: CITY.lat, lng: CITY.lng };
    fetchMock.mockImplementation(
      recorded({ [`${CITY_PRECINCTS} ${CITY.lng},${CITY.lat}`]: () => respond({}, 500) }),
    );
    expect(await locate(point)).toEqual({ kind: 'stl-city' });
  });

  it('puts both Illinois points east of the City, and City Hall and the Arch west', () => {
    expect(eastOfCity(VENICE)).toBe(true);
    expect(eastOfCity(EAST_ST_LOUIS)).toBe(true);
    expect(eastOfCity(CITY)).toBe(false);
    // The Gateway Arch, on the riverfront.
    expect(eastOfCity({ lat: 38.6247, lng: -90.1848 })).toBe(false);
  });

  it('never puts a point of the City outline east of the City', () => {
    // Every vertex of every citywide office's polygon, as recorded for #144.
    const vertices = cityOutline.features.flatMap((f) => f.geometry.rings.flat());
    expect(vertices.length).toBeGreaterThan(1000);
    const east = vertices.filter(([lng, lat]) => eastOfCity({ lat, lng }));
    expect(east).toEqual([]);
  });

  it('says nothing about points north or south of the City', () => {
    // Above the City's northeast corner, and south of the River des Peres.
    expect(eastOfCity({ lat: 38.776, lng: -90.12 })).toBe(false);
    expect(eastOfCity({ lat: 38.52, lng: -90.2 })).toBe(false);
  });
});

describe('locate, with a City loader of its own (#198)', () => {
  it('asks the given City loader, not the City chunk', async () => {
    const getCityPrecinctAtPoint = vi.fn(async () => ({ code: 'W99P99' }));
    const loadCity = vi.fn(async () => ({ getCityPrecinctAtPoint }));
    expect(await locate(CITY, { loadCity })).toEqual({
      kind: 'precinct',
      jurisdiction: 'city',
      precinct: { code: 'W99P99' },
    });
    expect(loadCity).toHaveBeenCalledTimes(1);
    expect(getCityPrecinctAtPoint).toHaveBeenCalledWith({ lat: CITY.lat, lng: CITY.lng });
    expect(requestedLayers()).not.toContain(CITY_PRECINCTS);
  });
});

describe('classifyPlace', () => {
  it.each([
    ['St. Louis city', 'MO'],
    ['St Louis City', 'MO'],
    ['Saint Louis City', 'Missouri'],
    ['ST. LOUIS CITY', 'mo'],
    ['City of St. Louis', 'MO'],
    ['  St.  Louis   city ', ' MO '],
    ['St. Louis city', undefined],
  ])('reads %j, %j as the City', (county, state) => {
    expect(classifyPlace({ county, state })).toBe('stl-city');
  });

  it.each([
    ['St-Louis City', 'MO'],
    ['St. Louis (city)', 'MO'],
    ['St. Louis City,', 'MO,'],
    ['St. Louis city', 'Missouri.'],
    // A Census numeric state code: 29 is Missouri.
    ['St. Louis city', '29'],
  ])('ignores punctuation and reads %j, %j as the City', (county, state) => {
    expect(classifyPlace({ county, state })).toBe('stl-city');
  });

  it.each([
    [{ state: 'Missouri,' }, 'missouri'],
    [{ state: '29' }, 'missouri'],
    [{ state: '17' }, 'out-of-state'],
  ])('reads %j as %s', (place, kind) => {
    expect(classifyPlace(place)).toBe(kind);
  });

  it.each([
    ['St. Louis County', 'MO', 'st-louis-county'],
    ['Saint Louis County', 'Missouri', 'st-louis-county'],
    ['St. Charles County', 'MO', 'missouri'],
    ['Jefferson County', 'Missouri', 'missouri'],
    [undefined, 'MO', 'missouri'],
    ['St. Clair County', 'IL', 'out-of-state'],
    [undefined, 'Illinois', 'out-of-state'],
    // A St. Louis city that is not in Missouri is not ours to name.
    ['St. Louis city', 'IL', 'out-of-state'],
    ['St. Louis County', 'IL', 'out-of-state'],
    ['St. Louis city County', 'MO', 'missouri'],
    [undefined, undefined, 'unknown'],
    ['', '', 'unknown'],
    ['St. Charles County', undefined, 'unknown'],
    [42, 42, 'unknown'],
  ])('reads %j, %j as %s', (county, state, kind) => {
    expect(classifyPlace({ county, state })).toBe(kind);
  });
});
