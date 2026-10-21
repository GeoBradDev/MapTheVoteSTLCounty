// Fixtures are live responses recorded by scripts/record-fixtures.mjs.
// @vitest-environment node
import absenteeSites from '../../docs/raw/fixtures/absentee-sites.json';
import boundaryAtCity from '../../docs/raw/fixtures/boundary-at-city.json';
import boundaryInside from '../../docs/raw/fixtures/boundary-inside.json';
import errorBody from '../../docs/raw/fixtures/error-body.json';
import outside from '../../docs/raw/fixtures/precinct-at-point-outside.json';
import atPoint from '../../docs/raw/fixtures/precinct-at-point.json';
import polls from '../../docs/raw/fixtures/polls.json';
import byId from '../../docs/raw/fixtures/precinct-by-id.json';
import geometry from '../../docs/raw/fixtures/precinct-geometry.json';
import nonresidential from '../../docs/raw/fixtures/precinct-nonresidential.json';
import election from '../config/election.js';

const PRECINCTS = `${election.serviceRoot}/${election.layers.precincts}/query`;
const BOUNDARY = `${election.serviceRoot}/${election.layers.countyBoundary}/query`;

let client;
let fetchMock;

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// The one request fetchMock received, a GET, split into its URL and parameters.
function onlyRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init = {}] = fetchMock.mock.calls[0];
  expect(init.method ?? 'GET').toBe('GET');
  const url = new URL(input);
  return { base: `${url.origin}${url.pathname}`, params: Object.fromEntries(url.searchParams) };
}

// The fetch options of a request that carries a voter's coordinates (#38):
// POST with the parameters in a form body, kept out of the HTTP cache, with no
// cookies and no referrer.
const PRIVATE_INIT = {
  method: 'POST',
  cache: 'no-store',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
};

// The one request fetchMock received, a private POST: its URL, which must
// carry no query string, and the parameters from its body.
function onlyPrivateRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init] = fetchMock.mock.calls[0];
  expect(init).toMatchObject(PRIVATE_INIT);
  expect(init.body).toBeInstanceOf(URLSearchParams);
  const url = new URL(input);
  expect(url.search).toBe('');
  return { base: `${url.origin}${url.pathname}`, params: Object.fromEntries(init.body) };
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  client = await import('./arcgis.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getPrecinctAtPoint', () => {
  it('POSTs only the point and fixed parameters, out of the URL and the cache', async () => {
    fetchMock.mockResolvedValue(respond(atPoint));
    await client.getPrecinctAtPoint({ lat: 38.62, lng: -90.33 });
    const { base, params } = onlyPrivateRequest();
    expect(base).toBe(PRECINCTS);
    expect(params).toEqual({
      geometry: '-90.33,38.62',
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: client.PRECINCT_FIELDS.join(','),
      returnGeometry: 'false',
      f: 'json',
    });
  });

  it('resolves to the precinct found there', async () => {
    fetchMock.mockResolvedValue(respond(atPoint));
    const precinct = await client.getPrecinctAtPoint({ lat: 38.62, lng: -90.33 });
    expect(precinct.precinct).toBe('HAD023');
    expect(precinct.in_election).toBe('In Election');
    expect(precinct[election.congressionalField]).toMatch(/District \d/);
  });

  it('resolves a nonresidential precinct like any other, keeping its message', async () => {
    fetchMock.mockResolvedValue(respond(nonresidential));
    const precinct = await client.getPrecinctAtPoint({ lat: 38.7, lng: -90.4 });
    expect(precinct.in_election).toBe('Nonresidential Precinct');
    expect(precinct.html).toMatch(/^This precinct has no recognized residential addresses/);
  });

  it('turns empty strings into null', async () => {
    fetchMock.mockResolvedValue(respond(atPoint));
    const precinct = await client.getPrecinctAtPoint({ lat: 38.62, lng: -90.33 });
    expect(atPoint.features[0].attributes.fire).toBe('');
    expect(precinct.fire).toBeNull();
  });

  it('resolves to null outside the county', async () => {
    fetchMock.mockResolvedValue(respond(outside));
    expect(await client.getPrecinctAtPoint({ lat: 38.63, lng: -90.2 })).toBeNull();
  });

  it.each([
    ['an address', { lat: '7900 Carondelet Ave', lng: -90.33 }],
    ['a numeric string', { lat: '38.62', lng: -90.33 }],
    ['NaN', { lat: NaN, lng: -90.33 }],
    ['Infinity', { lat: 38.62, lng: Infinity }],
    ['a missing value', { lat: 38.62 }],
  ])('throws TypeError and sends nothing for %s', async (_, point) => {
    await expect(client.getPrecinctAtPoint(point)).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getPrecinctCodesAtPoints', () => {
  const points = [
    { lat: 38.62, lng: -90.33 },
    { lat: 38.63, lng: -90.34 },
  ];

  it('POSTs one multipoint query with only the points and fixed parameters, uncached', async () => {
    fetchMock.mockResolvedValue(respond({ features: [{ attributes: { precinct: 'CC007' } }] }));
    await client.getPrecinctCodesAtPoints(points);
    const { base, params } = onlyPrivateRequest();
    expect(base).toBe(PRECINCTS);
    expect(params).toEqual({
      geometry: JSON.stringify({
        points: [
          [-90.33, 38.62],
          [-90.34, 38.63],
        ],
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryMultipoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'precinct',
      returnGeometry: 'false',
      f: 'json',
    });
  });

  it('resolves to the distinct precinct codes found', async () => {
    fetchMock.mockResolvedValue(
      respond({
        features: [
          { attributes: { precinct: 'LEM012' } },
          { attributes: { precinct: 'LEM021' } },
          { attributes: { precinct: 'LEM012' } },
        ],
      }),
    );
    const codes = await client.getPrecinctCodesAtPoints(points);
    expect([...codes].sort()).toEqual(['LEM012', 'LEM021']);
  });

  it('rejects points that are not numbers, sending nothing', async () => {
    await expect(client.getPrecinctCodesAtPoints([{ lat: 'x', lng: 1 }])).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a 5xx once like the other queries', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(respond({}, 503))
      .mockResolvedValueOnce(respond({ features: [{ attributes: { precinct: 'CC007' } }] }));
    const pending = client.getPrecinctCodesAtPoints(points);
    await vi.runAllTimersAsync();
    expect([...(await pending)]).toEqual(['CC007']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('isInCountyBoundary', () => {
  it('POSTs only the point and fixed parameters to the boundary layer, uncached', async () => {
    fetchMock.mockResolvedValue(respond(boundaryInside));
    await client.isInCountyBoundary({ lat: 38.62, lng: -90.33 });
    const { base, params } = onlyPrivateRequest();
    expect(base).toBe(BOUNDARY);
    expect(params).toEqual({
      geometry: '-90.33,38.62',
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'OBJECTID',
      returnGeometry: 'false',
      f: 'json',
    });
  });

  it('resolves to true inside the county', async () => {
    fetchMock.mockResolvedValue(respond(boundaryInside));
    expect(await client.isInCountyBoundary({ lat: 38.62, lng: -90.33 })).toBe(true);
  });

  it('resolves to false outside the county', async () => {
    fetchMock.mockResolvedValue(respond(boundaryAtCity));
    expect(await client.isInCountyBoundary({ lat: 38.62741, lng: -90.19843 })).toBe(false);
  });

  it.each([[{ lat: '38.62', lng: -90.33 }], [{ lat: 38.62, lng: NaN }], [{ lat: 38.62 }]])(
    'throws TypeError for %o and sends nothing',
    async (point) => {
      await expect(client.isInCountyBoundary(point)).rejects.toThrow(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('retries a 5xx once like the other queries', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(respond(boundaryInside));
    const result = client.isInCountyBoundary({ lat: 38.62, lng: -90.33 });
    await vi.advanceTimersByTimeAsync(client.RETRY_DELAY_MS);
    expect(await result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry is private too, with the same point in its body.
    for (const [input, init] of fetchMock.mock.calls) {
      expect(new URL(input).search).toBe('');
      expect(init).toMatchObject(PRIVATE_INIT);
      expect(new URLSearchParams(init.body).get('geometry')).toBe('-90.33,38.62');
    }
  });
});

describe('getPrecinctById', () => {
  it('queries by precinct code with fixed parameters', async () => {
    fetchMock.mockResolvedValue(respond(byId));
    await client.getPrecinctById('CC007');
    const { base, params } = onlyRequest();
    expect(base).toBe(PRECINCTS);
    expect(params).toEqual({
      where: "precinct='CC007'",
      outFields: client.PRECINCT_FIELDS.join(','),
      returnGeometry: 'false',
      f: 'json',
    });
  });

  it('resolves to the precinct', async () => {
    fetchMock.mockResolvedValue(respond(byId));
    const precinct = await client.getPrecinctById('CC007');
    expect(precinct.precinct).toBe('CC007');
    expect(precinct.html).toMatch(/CC-007\.pdf/);
  });

  it('rejects with NotFound when no precinct has the code', async () => {
    fetchMock.mockResolvedValue(respond(outside));
    await expect(client.getPrecinctById('ZZ999')).rejects.toBeInstanceOf(client.NotFound);
  });

  it.each(['cc007', 'CC07', 'C007', 'CCCC007', "CC007' OR '1'='1", ' CC007', 'CC007\n', 7])(
    'rejects %j with NotFound and sends nothing',
    async (code) => {
      await expect(client.getPrecinctById(code)).rejects.toBeInstanceOf(client.NotFound);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects a value JSON cannot serialize with NotFound and sends nothing', async () => {
    await expect(client.getPrecinctById(10n)).rejects.toBeInstanceOf(client.NotFound);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('exports', () => {
  it.each(['TimeoutError', 'ServiceError', 'NotFound'])('%s is a named Error', (name) => {
    const error = new client[name]('x');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
  });

  // Only the fields the app reads (#27), never `*`.
  it('asks for the precinct fields the app reads, from the config', () => {
    expect(client.PRECINCT_FIELDS).toEqual([
      'precinct',
      'in_election',
      'html',
      election.congressionalField,
      ...election.districtFields
        .map((d) => d.field)
        .filter((f) => f !== election.congressionalField),
    ]);
    expect(new Set(client.PRECINCT_FIELDS).size).toBe(client.PRECINCT_FIELDS.length);
    expect(client.PRECINCT_FIELDS).toContain('municipality');
  });

  it('exports the precinct code pattern', () => {
    expect(client.PRECINCT_CODE.test('CC007')).toBe(true);
    expect(client.PRECINCT_CODE.test('BON001')).toBe(true);
    expect(client.PRECINCT_CODE.test('CC007x')).toBe(false);
  });
});

describe('getPolls', () => {
  const POLLS = `${election.serviceRoot}/${election.layers.polls}/query`;

  it('requests every polling place once as GeoJSON in lat/lng', async () => {
    fetchMock.mockResolvedValue(respond(polls));
    await client.getPolls();
    const { base, params } = onlyRequest();
    expect(base).toBe(POLLS);
    expect(params).toEqual({
      where: '1=1',
      outFields: 'loc,name,address,zipcode,abs_type,notes_abs',
      outSR: '4326',
      geometryPrecision: '6',
      f: 'geojson',
    });
  });

  it('resolves to the FeatureCollection with normalized properties', async () => {
    fetchMock.mockResolvedValue(respond(polls));
    const result = await client.getPolls();
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(polls.features.length);
    const first = result.features[0];
    expect(first.geometry).toEqual(polls.features[0].geometry);
    expect(polls.features[0].properties.inline).toMatch(/^ +$/);
    expect(first.properties.inline).toBeNull();
    expect(first.properties.notes_abs).toBeNull();
    const withNote = result.features.find((f) => f.properties.notes_abs);
    expect(withNote.properties.notes_abs).toBe(withNote.properties.notes_abs.trim());
  });

  it.each([
    [7, '007'],
    ['7', '007'],
    [' 42 ', '042'],
    ['172', '172'],
  ])('pads loc %j to %j', async (loc, expected) => {
    const feature = { ...polls.features[0], properties: { ...polls.features[0].properties, loc } };
    fetchMock.mockResolvedValue(respond({ ...polls, features: [feature] }));
    expect((await client.getPolls()).features[0].properties.loc).toBe(expected);
  });

  it('shares one request between concurrent and later calls', async () => {
    fetchMock.mockResolvedValue(respond(polls));
    const [a, b] = await Promise.all([client.getPolls(), client.getPolls()]);
    const c = await client.getPolls();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it.each([
    ['null properties', { type: 'Feature', geometry: null, properties: null }],
    ['a null feature', null],
  ])(
    'rejects a feature with %s with ServiceError and fetches again next call',
    async (_, feature) => {
      fetchMock
        .mockResolvedValueOnce(respond({ ...polls, features: [feature] }))
        .mockResolvedValueOnce(respond(polls));
      await expect(client.getPolls()).rejects.toBeInstanceOf(client.ServiceError);
      expect((await client.getPolls()).features).toHaveLength(polls.features.length);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('does not cache a failure: the next call fetches again', async () => {
    fetchMock.mockResolvedValueOnce(respond(errorBody)).mockResolvedValueOnce(respond(polls));
    await expect(client.getPolls()).rejects.toBeInstanceOf(client.ServiceError);
    expect((await client.getPolls()).features).toHaveLength(polls.features.length);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getAbsenteeSites', () => {
  const POLLS = `${election.serviceRoot}/${election.layers.polls}/query`;

  it('requests the polls layer with the absentee filter from the config', async () => {
    fetchMock.mockResolvedValue(respond(absenteeSites));
    await client.getAbsenteeSites();
    const { base, params } = onlyRequest();
    expect(base).toBe(POLLS);
    expect(params).toEqual({
      where: election.absenteeWhere,
      outFields: 'loc,name,address,zipcode,abs_type,notes_abs',
      outSR: '4326',
      geometryPrecision: '6',
      f: 'geojson',
    });
  });

  it('resolves to the sites with normalized properties', async () => {
    fetchMock.mockResolvedValue(respond(absenteeSites));
    const result = await client.getAbsenteeSites();
    expect(result.features).toHaveLength(absenteeSites.features.length);
    const types = new Set(result.features.map((f) => f.properties.abs_type));
    expect([...types].sort()).toEqual(Object.keys(election.earlyVoting.schedules).sort());
    // An empty note is null, a real one is trimmed.
    expect(result.features.some((f) => f.properties.notes_abs === null)).toBe(true);
    const withNote = result.features.find((f) => f.properties.notes_abs);
    expect(withNote.properties.notes_abs).toBe(withNote.properties.notes_abs.trim());
  });

  it('shares one request, separate from the polls list', async () => {
    fetchMock.mockImplementation(async (input) =>
      respond(new URL(input).searchParams.get('where') === '1=1' ? polls : absenteeSites),
    );
    const [a, b] = await Promise.all([client.getAbsenteeSites(), client.getAbsenteeSites()]);
    expect(b).toBe(a);
    const all = await client.getPolls();
    expect(all.features).toHaveLength(polls.features.length);
    expect(a.features).toHaveLength(absenteeSites.features.length);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure: the next call fetches again', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(errorBody))
      .mockResolvedValueOnce(respond(absenteeSites));
    await expect(client.getAbsenteeSites()).rejects.toBeInstanceOf(client.ServiceError);
    expect((await client.getAbsenteeSites()).features).toHaveLength(absenteeSites.features.length);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getPrecinctGeometry', () => {
  it('requests a simplified outline in lat/lng as GeoJSON', async () => {
    fetchMock.mockResolvedValue(respond(geometry));
    await client.getPrecinctGeometry('CC007');
    const { base, params } = onlyRequest();
    expect(base).toBe(PRECINCTS);
    expect(params).toEqual({
      where: "precinct='CC007'",
      outFields: 'precinct',
      returnGeometry: 'true',
      outSR: '4326',
      maxAllowableOffset: '0.0001',
      f: 'geojson',
    });
  });

  it('resolves to the precinct Feature', async () => {
    fetchMock.mockResolvedValue(respond(geometry));
    const feature = await client.getPrecinctGeometry('CC007');
    expect(feature.type).toBe('Feature');
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.properties.precinct).toBe('CC007');
  });

  it('rejects with NotFound when no precinct has the code', async () => {
    fetchMock.mockResolvedValue(respond({ type: 'FeatureCollection', features: [] }));
    await expect(client.getPrecinctGeometry('ZZ999')).rejects.toBeInstanceOf(client.NotFound);
  });

  it('rejects a malformed code with NotFound and sends nothing', async () => {
    await expect(client.getPrecinctGeometry("CC007' OR '1'='1")).rejects.toBeInstanceOf(
      client.NotFound,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one request for the same precinct between concurrent and later calls', async () => {
    fetchMock.mockResolvedValue(respond(geometry));
    const [a, b] = await Promise.all([
      client.getPrecinctGeometry('CC007'),
      client.getPrecinctGeometry('CC007'),
    ]);
    const c = await client.getPrecinctGeometry('CC007');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('fetches again for another precinct', async () => {
    fetchMock.mockImplementation(async () => respond(geometry));
    await client.getPrecinctGeometry('CC007');
    await client.getPrecinctGeometry('CC008');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('where')).toBe("precinct='CC008'");
  });

  it('does not cache a failure: the next call fetches again', async () => {
    fetchMock.mockResolvedValueOnce(respond(errorBody)).mockResolvedValueOnce(respond(geometry));
    await expect(client.getPrecinctGeometry('CC007')).rejects.toBeInstanceOf(client.ServiceError);
    expect((await client.getPrecinctGeometry('CC007')).type).toBe('Feature');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache NotFound', async () => {
    fetchMock
      .mockResolvedValueOnce(respond({ type: 'FeatureCollection', features: [] }))
      .mockResolvedValueOnce(respond(geometry));
    await expect(client.getPrecinctGeometry('CC007')).rejects.toBeInstanceOf(client.NotFound);
    expect((await client.getPrecinctGeometry('CC007')).type).toBe('Feature');
  });
});

describe('errors', () => {
  // A fetch that never answers until its signal aborts, as real fetch does.
  function hang(url, { signal }) {
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  }

  it('rejects an HTTP 200 error body with ServiceError, its code and message, without retrying', async () => {
    fetchMock.mockResolvedValue(respond(errorBody));
    const error = await client.getPrecinctById('CC007').catch((e) => e);
    expect(error).toBeInstanceOf(client.ServiceError);
    expect(error.code).toBe(400);
    expect(error.message).toBe(errorBody.error.message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an HTTP error with ServiceError and its status, without retrying a 404', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));
    const error = await client.getPrecinctById('CC007').catch((e) => e);
    expect(error).toBeInstanceOf(client.ServiceError);
    expect(error.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a persistent HTTP 503 with ServiceError and its status, after one retry', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response('', { status: 503 }));
    const result = client.getPrecinctById('CC007').catch((e) => e);
    await vi.advanceTimersByTimeAsync(client.RETRY_DELAY_MS);
    const error = await result;
    expect(error).toBeInstanceOf(client.ServiceError);
    expect(error.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a body that is not JSON with ServiceError', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(client.getPrecinctById('CC007')).rejects.toBeInstanceOf(client.ServiceError);
  });

  it('retries a connection that drops while the body downloads', async () => {
    vi.useFakeTimers();
    const dropped = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new TypeError('terminated')),
    };
    fetchMock.mockResolvedValueOnce(dropped).mockResolvedValueOnce(respond(byId));
    const result = client.getPrecinctById('CC007');
    await vi.advanceTimersByTimeAsync(client.RETRY_DELAY_MS);
    expect((await result).precinct).toBe('CC007');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a JSON feature that has properties instead of attributes with ServiceError', async () => {
    fetchMock.mockResolvedValue(respond({ features: [{ properties: { precinct: 'CC007' } }] }));
    await expect(client.getPrecinctById('CC007')).rejects.toBeInstanceOf(client.ServiceError);
  });

  it('rejects a GeoJSON feature that has attributes instead of properties with ServiceError', async () => {
    fetchMock.mockResolvedValue(respond({ features: [{ attributes: { loc: '001' } }] }));
    await expect(client.getPolls()).rejects.toBeInstanceOf(client.ServiceError);
  });

  it.each([{}, null, { features: 'none' }])(
    'rejects JSON %j without a features list with ServiceError',
    async (body) => {
      fetchMock.mockResolvedValue(respond(body));
      await expect(client.getPolls()).rejects.toBeInstanceOf(client.ServiceError);
    },
  );

  it('retries a network failure once after a backoff, then rejects with ServiceError', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const result = client.getPrecinctById('CC007').catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(client.RETRY_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await result).toBeInstanceOf(client.ServiceError);
  });

  it.each([
    ['HTTP 500', () => new Response('', { status: 500 })],
    ['HTTP 429', () => new Response('', { status: 429 })],
    ['an ArcGIS 500 body', () => respond({ error: { code: 500, message: 'busy' } })],
  ])('retries %s once and resolves when the retry works', async (_, failure) => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(failure()).mockResolvedValueOnce(respond(byId));
    const result = client.getPrecinctById('CC007');
    await vi.advanceTimersByTimeAsync(client.RETRY_DELAY_MS);
    expect((await result).precinct).toBe('CC007');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out after 8 seconds, retries once, then rejects with TimeoutError', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hang);
    const result = client.getPrecinctAtPoint({ lat: 38.62, lng: -90.33 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(client.TIMEOUT_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1 + client.RETRY_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(client.TIMEOUT_MS);
    expect(await result).toBeInstanceOf(client.TimeoutError);
    expect(client.TIMEOUT_MS).toBe(8000);
  });

  it('resolves when the retry after a timeout answers', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(hang).mockResolvedValueOnce(respond(atPoint));
    const result = client.getPrecinctAtPoint({ lat: 38.62, lng: -90.33 });
    await vi.advanceTimersByTimeAsync(client.TIMEOUT_MS + client.RETRY_DELAY_MS);
    expect((await result).precinct).toBe('HAD023');
  });

  it('leaves no timer running after a request answers', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(respond(atPoint));
    await client.getPrecinctAtPoint({ lat: 38.62, lng: -90.33 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
