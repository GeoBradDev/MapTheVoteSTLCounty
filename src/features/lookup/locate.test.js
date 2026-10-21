// The three test addresses run end to end against live responses recorded by
// scripts/record-fixtures.mjs. Places use the geocoder-neutral shape both the
// Census and the Esri geocoder can fill (see docs/data.md).
// @vitest-environment node
import boundaryAtCity from '../../../docs/raw/fixtures/boundary-at-city.json';
import boundaryAtOutOfState from '../../../docs/raw/fixtures/boundary-at-out-of-state.json';
import boundaryAtStCharles from '../../../docs/raw/fixtures/boundary-at-st-charles.json';
import boundaryInside from '../../../docs/raw/fixtures/boundary-inside.json';
import precinctAtCity from '../../../docs/raw/fixtures/precinct-at-city.json';
import precinctAtOutOfState from '../../../docs/raw/fixtures/precinct-at-out-of-state.json';
import precinctAtStCharles from '../../../docs/raw/fixtures/precinct-at-st-charles.json';
import atPoint from '../../../docs/raw/fixtures/precinct-at-point.json';
import election from '../../config/election.js';
import { classifyPlace, locate } from './locate.js';

const PRECINCTS = `${election.serviceRoot}/${election.layers.precincts}/query`;
const BOUNDARY = `${election.serviceRoot}/${election.layers.countyBoundary}/query`;

// 1200 Market St, St. Louis, MO 63103 (City Hall).
const CITY = { lat: 38.62741, lng: -90.19843, state: 'MO', county: 'St. Louis city' };
// 200 N 2nd St, St. Charles, MO 63301.
const ST_CHARLES = { lat: 38.78267, lng: -90.48187, state: 'MO', county: 'St. Charles County' };
// 301 W Main St, Belleville, IL 62220.
const OUT_OF_STATE = { lat: 38.51368, lng: -89.98831, state: 'IL', county: 'St. Clair County' };
// A point inside the county (precinct HAD023).
const INSIDE = { lat: 38.62, lng: -90.33, state: 'MO', county: 'St. Louis County' };

const RESPONSES = {
  [`${PRECINCTS} ${CITY.lng},${CITY.lat}`]: precinctAtCity,
  [`${BOUNDARY} ${CITY.lng},${CITY.lat}`]: boundaryAtCity,
  [`${PRECINCTS} ${ST_CHARLES.lng},${ST_CHARLES.lat}`]: precinctAtStCharles,
  [`${BOUNDARY} ${ST_CHARLES.lng},${ST_CHARLES.lat}`]: boundaryAtStCharles,
  [`${PRECINCTS} ${OUT_OF_STATE.lng},${OUT_OF_STATE.lat}`]: precinctAtOutOfState,
  [`${BOUNDARY} ${OUT_OF_STATE.lng},${OUT_OF_STATE.lat}`]: boundaryAtOutOfState,
  [`${PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: atPoint,
  [`${BOUNDARY} ${INSIDE.lng},${INSIDE.lat}`]: boundaryInside,
};

const EMPTY = { features: [] };
let fetchMock;

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// Answers each request with the recording for its layer and point.
function recorded(overrides = {}) {
  return async (input) => {
    const url = new URL(input);
    const key = `${url.origin}${url.pathname} ${url.searchParams.get('geometry')}`;
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
  it('sends a St. Louis City address to the City', async () => {
    expect(await locate(CITY)).toEqual({ kind: 'stl-city' });
  });

  it('sends a St. Charles County address to the Missouri Voter Outreach Center', async () => {
    expect(await locate(ST_CHARLES)).toEqual({ kind: 'missouri' });
  });

  it('gives an out-of-state address the generic message', async () => {
    expect(await locate(OUT_OF_STATE)).toEqual({ kind: 'out-of-state' });
  });

  it('checks the precinct layer first, then the boundary', async () => {
    await locate(CITY);
    expect(requestedLayers()).toEqual([PRECINCTS, BOUNDARY]);
  });
});

describe('locate, inside the county', () => {
  it('resolves to the precinct and skips the boundary query', async () => {
    const result = await locate(INSIDE);
    expect(result.kind).toBe('precinct');
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
      recorded({ [`${PRECINCTS} ${INSIDE.lng},${INSIDE.lat}`]: () => respond(EMPTY) }),
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
      recorded({ [`${PRECINCTS} ${CITY.lng},${CITY.lat}`]: () => respond({}, 404) }),
    );
    await expect(locate(CITY)).rejects.toMatchObject({ name: 'ServiceError', status: 404 });
    expect(requestedLayers()).toEqual([PRECINCTS]);
  });

  it('falls back to the geocoder fields when the boundary query fails', async () => {
    fetchMock.mockImplementation(
      recorded({ [`${BOUNDARY} ${CITY.lng},${CITY.lat}`]: () => respond({}, 404) }),
    );
    expect(await locate(CITY)).toEqual({ kind: 'stl-city' });
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
