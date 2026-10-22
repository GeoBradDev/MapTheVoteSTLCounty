// The City data client (#87). Fixtures are live responses recorded by
// `node scripts/record-fixtures.mjs city-`. Field names and filters come from
// the config: the hardcoding test scans this file too.
// @vitest-environment node
import boundaryAtCounty from '../../docs/raw/fixtures/city-boundary-at-county.json';
import boundaryInside from '../../docs/raw/fixtures/city-boundary-inside.json';
import districtsAtPoint from '../../docs/raw/fixtures/city-districts-at-point.json';
import earlyVotingSites from '../../docs/raw/fixtures/city-early-voting-sites.json';
import polls from '../../docs/raw/fixtures/city-polls.json';
import atCounty from '../../docs/raw/fixtures/city-precinct-at-county.json';
import atPoint from '../../docs/raw/fixtures/city-precinct-at-point.json';
import byId from '../../docs/raw/fixtures/city-precinct-by-id.json';
import geometry from '../../docs/raw/fixtures/city-precinct-geometry.json';
import errorBody from '../../docs/raw/fixtures/error-body.json';
import { jurisdictions } from '../config/election.js';

const city = jurisdictions.city;
const layer = (key) => `${city.serviceRoot}/${city.layers[key]}/query`;
const CITY_HALL = { lat: 38.62741, lng: -90.19843 };
const COUNTY_POINT = { lat: 38.62, lng: -90.33 };

let client;
let base;
let fetchMock;

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// Request `i` that fetchMock received, split into its URL and parameters: a
// GET's from the query string, a POST's from its body.
function request(i = 0) {
  const [input, init = {}] = fetchMock.mock.calls[i];
  const url = new URL(input);
  const method = init.method ?? 'GET';
  const params = Object.fromEntries(method === 'POST' ? init.body : url.searchParams);
  return { url, init, method, base: `${url.origin}${url.pathname}`, params };
}

function onlyRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return request(0);
}

// A request that carries coordinates (#38): a POST with the parameters in a
// form body, none in the URL, out of the HTTP cache, no cookies, no referrer.
function expectPrivate({ url, init }) {
  expect(init).toMatchObject({
    method: 'POST',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  expect(init.body).toBeInstanceOf(URLSearchParams);
  expect(url.search).toBe('');
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  client = await import('./cityArcgis.js');
  base = await import('./arcgis.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fields', () => {
  it('asks the precincts layer for its code field only', () => {
    expect(client.CITY_PRECINCT_FIELDS).toEqual([city.precinctField]);
  });

  it('asks the voting locations layer for the fields the cards read', () => {
    expect(client.CITY_POLL_FIELDS).toEqual(Object.values(city.siteFields));
  });

  it('asks the districts layer for names and numbers only', () => {
    expect(client.CITY_DISTRICT_FIELDS).toEqual(Object.values(city.districtLayerFields));
  });

  // The layer's officeholder fields: a name, photo, party, web page, phone,
  // email, social accounts and address per seat, each ending in its seat
  // number (repname1 to repname7). Any of them would put a person's details on
  // the page (#87).
  const OFFICEHOLDER = /^(repname|repimageurl|party|districturl|phone|email|facebook|twitter)|\d$/i;

  it('never asks the districts layer for an officeholder, party or contact field', () => {
    expect(client.CITY_DISTRICT_FIELDS.filter((f) => OFFICEHOLDER.test(f))).toEqual([]);
  });

  it('sends no officeholder, party or contact field in any districts query', async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(input).pathname;
      return respond(path.endsWith(`${city.layers.precincts}/query`) ? geometry : districtsAtPoint);
    });
    await client.getCityDistrictsAtPoint(CITY_HALL);
    await client.getCityDistrictsForPrecinct('W01P12');
    const districtQueries = fetchMock.mock.calls
      .map((_, i) => request(i))
      .filter((r) => r.base === layer('districts'));
    expect(districtQueries).toHaveLength(2);
    for (const { params } of districtQueries) {
      expect(params.outFields).not.toBe('*');
      expect(params.outFields.split(',').filter((f) => OFFICEHOLDER.test(f))).toEqual([]);
    }
  });
});

describe('coordinate queries (#38)', () => {
  const pointQueries = [
    ['getCityPrecinctAtPoint', atPoint],
    ['getCityDistrictsAtPoint', districtsAtPoint],
    ['isInCityBoundary', boundaryInside],
  ];

  it.each(pointQueries)('%s is a POST with the point in its body only', async (name, fixture) => {
    fetchMock.mockResolvedValue(respond(fixture));
    await client[name](CITY_HALL);
    const sent = onlyRequest();
    expectPrivate(sent);
    expect(sent.url.href).not.toContain('38.62741');
    expect(sent.url.href).not.toContain('-90.19843');
    expect(sent.params.geometry).toBe('-90.19843,38.62741');
  });

  it('getCityDistrictsForPrecinct asks the districts layer with a POST too', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(geometry))
      .mockResolvedValueOnce(respond(districtsAtPoint));
    await client.getCityDistrictsForPrecinct('W01P12');
    const districts = request(1);
    expect(districts.base).toBe(layer('districts'));
    expectPrivate(districts);
  });

  it.each(pointQueries)('%s sends nothing for a point that is not numbers', async (name) => {
    for (const point of [{ lat: '38.6', lng: -90.2 }, { lat: NaN, lng: -90.2 }, { lat: 38.6 }]) {
      await expect(client[name](point)).rejects.toThrow(TypeError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getCityPrecinctAtPoint', () => {
  it('asks the precincts layer for its code at the point', async () => {
    fetchMock.mockResolvedValue(respond(atPoint));
    await client.getCityPrecinctAtPoint(CITY_HALL);
    const { base: url, params } = onlyRequest();
    expect(url).toBe(layer('precincts'));
    expect(params).toEqual({
      geometry: '-90.19843,38.62741',
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: city.precinctField,
      returnGeometry: 'false',
      f: 'json',
    });
  });

  it('resolves to the precinct with its URL code', async () => {
    fetchMock.mockResolvedValue(respond(atPoint));
    const precinct = await client.getCityPrecinctAtPoint(CITY_HALL);
    expect(precinct[city.precinctField]).toBe('W 14 P 2');
    expect(precinct.code).toBe('W14P02');
  });

  it('resolves to null outside the City', async () => {
    fetchMock.mockResolvedValue(respond(atCounty));
    expect(await client.getCityPrecinctAtPoint(COUNTY_POINT)).toBeNull();
  });

  it.each(['Ward one', 'W 1 P 12 ', 'W1P12'])(
    'rejects the precinct ID %j, whose code would find no precinct, with ServiceError',
    async (id) => {
      const odd = { features: [{ attributes: { [city.precinctField]: id } }] };
      fetchMock.mockResolvedValue(respond(odd));
      await expect(client.getCityPrecinctAtPoint(CITY_HALL)).rejects.toBeInstanceOf(
        base.ServiceError,
      );
    },
  );

  it('rejects a precinct ID that is not in the City form with ServiceError', async () => {
    const odd = { features: [{ attributes: { [city.precinctField]: 'Ward one' } }] };
    fetchMock.mockResolvedValue(respond(odd));
    await expect(client.getCityPrecinctAtPoint(CITY_HALL)).rejects.toBeInstanceOf(
      base.ServiceError,
    );
  });
});

describe('getCityPrecinctById', () => {
  it('asks by the layer ID with a cacheable GET', async () => {
    fetchMock.mockResolvedValue(respond(byId));
    await client.getCityPrecinctById('W01P12');
    const { base: url, method, init, params } = onlyRequest();
    expect(method).toBe('GET');
    expect(init.cache).toBeUndefined();
    expect(url).toBe(layer('precincts'));
    expect(params).toEqual({
      where: `${city.precinctField}='W 1 P 12'`,
      outFields: city.precinctField,
      returnGeometry: 'false',
      f: 'json',
    });
  });

  it('resolves to the precinct with its URL code', async () => {
    fetchMock.mockResolvedValue(respond(byId));
    const precinct = await client.getCityPrecinctById('W01P12');
    expect(precinct).toEqual({ [city.precinctField]: 'W 1 P 12', code: 'W01P12' });
  });

  it('rejects with NotFound when no precinct has the code', async () => {
    fetchMock.mockResolvedValue(respond({ ...byId, features: [] }));
    await expect(client.getCityPrecinctById('W99P99')).rejects.toBeInstanceOf(base.NotFound);
  });

  it.each(['CC007', "W01P12' OR 1=1", 'w01p12', null])(
    'rejects %j with NotFound and sends nothing',
    async (code) => {
      await expect(client.getCityPrecinctById(code)).rejects.toBeInstanceOf(base.NotFound);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('getCityPrecinctGeometry', () => {
  it('asks for a simplified outline in lat/lng as GeoJSON', async () => {
    fetchMock.mockResolvedValue(respond(geometry));
    const feature = await client.getCityPrecinctGeometry('W01P12');
    const { base: url, method, params } = onlyRequest();
    expect(method).toBe('GET');
    expect(url).toBe(layer('precincts'));
    expect(params).toEqual({
      where: `${city.precinctField}='W 1 P 12'`,
      outFields: city.precinctField,
      returnGeometry: 'true',
      outSR: '4326',
      maxAllowableOffset: '0.0001',
      f: 'geojson',
    });
    expect(feature.geometry.type).toBe('Polygon');
  });

  it('shares one request for the same precinct, and asks again for another', async () => {
    fetchMock.mockImplementation(async () => respond(geometry));
    const [a, b] = await Promise.all([
      client.getCityPrecinctGeometry('W01P12'),
      client.getCityPrecinctGeometry('W01P12'),
    ]);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await client.getCityPrecinctGeometry('W01P13');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects with NotFound when no precinct has the code, and does not keep it', async () => {
    fetchMock
      .mockResolvedValueOnce(respond({ ...geometry, features: [] }))
      .mockResolvedValueOnce(respond(geometry));
    await expect(client.getCityPrecinctGeometry('W01P12')).rejects.toBeInstanceOf(base.NotFound);
    await expect(client.getCityPrecinctGeometry('W01P12')).resolves.toBeDefined();
  });

  it('rejects a malformed code with NotFound and sends nothing', async () => {
    await expect(client.getCityPrecinctGeometry('CC007')).rejects.toBeInstanceOf(base.NotFound);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getCityDistrictsAtPoint', () => {
  it('asks the districts layer at the point for names and numbers', async () => {
    fetchMock.mockResolvedValue(respond(districtsAtPoint));
    await client.getCityDistrictsAtPoint(CITY_HALL);
    const { base: url, params } = onlyRequest();
    expect(url).toBe(layer('districts'));
    expect(params).toMatchObject({
      geometry: '-90.19843,38.62741',
      outFields: client.CITY_DISTRICT_FIELDS.join(','),
      returnGeometry: 'false',
    });
  });

  it('resolves to each office and its district, by name and ID', async () => {
    fetchMock.mockResolvedValue(respond(districtsAtPoint));
    const districts = await client.getCityDistrictsAtPoint(CITY_HALL);
    expect(districts).toHaveLength(districtsAtPoint.features.length);
    for (const d of districts) expect(Object.keys(d).sort()).toEqual(['id', 'name', 'office']);
    const ids = districts.map((d) => d.id);
    expect(ids).toContain('Ward 14');
    expect(ids.some((id) => /^Missouri House District \d+$/.test(id))).toBe(true);
    expect(ids.some((id) => /^Missouri Senate District \d+$/.test(id))).toBe(true);
  });

  it('resolves to an empty list outside every district', async () => {
    fetchMock.mockResolvedValue(respond({ ...districtsAtPoint, features: [] }));
    expect(await client.getCityDistrictsAtPoint(COUNTY_POINT)).toEqual([]);
  });
});

describe('getCityDistrictsForPrecinct', () => {
  // Even-odd point-in-polygon, to check the point asked for.
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

  it("asks for the districts at a point inside the precinct's outline", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(geometry))
      .mockResolvedValueOnce(respond(districtsAtPoint));
    const districts = await client.getCityDistrictsForPrecinct('W01P12');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(request(0).base).toBe(layer('precincts'));
    const { params } = request(1);
    const [lng, lat] = params.geometry.split(',').map(Number);
    expect(inside([lng, lat], geometry.features[0].geometry.coordinates)).toBe(true);
    expect(districts).toHaveLength(districtsAtPoint.features.length);
  });

  it("shares the outline request with the map's", async () => {
    fetchMock.mockImplementation(async (input) =>
      respond(
        new URL(input).pathname.endsWith(`${city.layers.precincts}/query`)
          ? geometry
          : districtsAtPoint,
      ),
    );
    await client.getCityPrecinctGeometry('W01P12');
    await client.getCityDistrictsForPrecinct('W01P12');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects with NotFound when no precinct has the code', async () => {
    fetchMock.mockResolvedValue(respond({ ...geometry, features: [] }));
    await expect(client.getCityDistrictsForPrecinct('W99P99')).rejects.toBeInstanceOf(
      base.NotFound,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an outline with no inside with ServiceError', async () => {
    const flat = {
      ...geometry,
      features: [{ ...geometry.features[0], geometry: { type: 'Polygon', coordinates: [] } }],
    };
    fetchMock.mockResolvedValue(respond(flat));
    await expect(client.getCityDistrictsForPrecinct('W01P12')).rejects.toBeInstanceOf(
      base.ServiceError,
    );
  });
});

describe.each([
  ['getCityPolls', polls, 'pollsWhere'],
  ['getCityEarlyVotingSites', earlyVotingSites, 'earlyVotingWhere'],
])('%s', (name, fixture, whereKey) => {
  it('asks the voting locations layer with its filter from the config, as GeoJSON', async () => {
    fetchMock.mockResolvedValue(respond(fixture));
    await client[name]();
    const { base: url, method, params } = onlyRequest();
    expect(method).toBe('GET');
    expect(url).toBe(layer('sites'));
    expect(params).toEqual({
      where: city[whereKey],
      outFields: client.CITY_POLL_FIELDS.join(','),
      outSR: '4326',
      geometryPrecision: '6',
      f: 'geojson',
    });
  });

  it('resolves to the sites in the shape the cards read', async () => {
    fetchMock.mockResolvedValue(respond(fixture));
    const result = await client[name]();
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(fixture.features.length);
    const raw = fixture.features[0];
    const { siteFields } = city;
    expect(result.features[0].geometry).toEqual(raw.geometry);
    expect(result.features[0].properties).toEqual({
      loc: raw.properties[siteFields.id],
      name: raw.properties[siteFields.name],
      address: raw.properties[siteFields.address],
      zipcode: raw.properties[siteFields.zip],
    });
    expect(typeof result.loadedAt).toBe('number');
  });

  it('resolves to an empty list when the filter finds no site', async () => {
    fetchMock.mockResolvedValue(respond({ ...fixture, features: [] }));
    const result = await client[name]();
    expect(result.features).toEqual([]);
    expect(typeof result.loadedAt).toBe('number');
  });

  it('trims text and turns an empty value into null', async () => {
    const { siteFields } = city;
    const feature = {
      ...fixture.features[0],
      properties: {
        [siteFields.id]: ' Site_1 ',
        [siteFields.name]: ' A Library ',
        [siteFields.address]: '1 Main St ',
        [siteFields.zip]: '',
      },
    };
    fetchMock.mockResolvedValue(respond({ ...fixture, features: [feature] }));
    expect((await client[name]()).features[0].properties).toEqual({
      loc: 'Site_1',
      name: 'A Library',
      address: '1 Main St',
      zipcode: null,
    });
  });

  it('shares one request between calls, and does not keep a failure', async () => {
    fetchMock.mockResolvedValueOnce(respond(errorBody)).mockResolvedValue(respond(fixture));
    await expect(client[name]()).rejects.toBeInstanceOf(base.ServiceError);
    const [a, b] = await Promise.all([client[name](), client[name]()]);
    expect(b).toBe(a);
    expect(await client[name]()).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetches again once the answer is older than the max age (#84)', async () => {
    const { layerMaxAgeMs } = await import('./freshness.js');
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.UTC(2026, 9, 20, 17);
    vi.setSystemTime(start);
    fetchMock.mockImplementation(async () => respond(fixture));
    const a = await client[name]();
    vi.setSystemTime(start + layerMaxAgeMs(start));
    expect(await client[name]()).toBe(a);
    vi.setSystemTime(start + layerMaxAgeMs(start) + 1);
    expect(await client[name]()).not.toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

it('lists the Election Day sites and the early voting sites separately', async () => {
  fetchMock.mockImplementation(async (input) =>
    respond(
      new URL(input).searchParams.get('where') === city.pollsWhere ? polls : earlyVotingSites,
    ),
  );
  const [day, early] = await Promise.all([client.getCityPolls(), client.getCityEarlyVotingSites()]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(day.features).toHaveLength(polls.features.length);
  expect(early.features).toHaveLength(earlyVotingSites.features.length);
});

describe('isInCityBoundary', () => {
  it('asks the boundary layer, with its filter, at the point', async () => {
    fetchMock.mockResolvedValue(respond(boundaryInside));
    await client.isInCityBoundary(CITY_HALL);
    const { base: url, params } = onlyRequest();
    expect(url).toBe(layer('boundary'));
    expect(params).toMatchObject({
      where: city.boundaryWhere,
      geometry: '-90.19843,38.62741',
      outFields: 'OBJECTID',
      returnGeometry: 'false',
    });
  });

  it('resolves to true inside the City and false outside', async () => {
    fetchMock.mockResolvedValueOnce(respond(boundaryInside));
    expect(await client.isInCityBoundary(CITY_HALL)).toBe(true);
    fetchMock.mockResolvedValueOnce(respond(boundaryAtCounty));
    expect(await client.isInCityBoundary(COUNTY_POINT)).toBe(false);
  });
});

// Every City query goes through the county client's request rules: the same
// errors, one retry on a transient failure, the same timeout.
describe.each([
  ['getCityPrecinctAtPoint', () => client.getCityPrecinctAtPoint(CITY_HALL)],
  ['getCityPrecinctById', () => client.getCityPrecinctById('W01P12')],
  ['getCityPrecinctGeometry', () => client.getCityPrecinctGeometry('W01P12')],
  ['getCityDistrictsAtPoint', () => client.getCityDistrictsAtPoint(CITY_HALL)],
  ['getCityDistrictsForPrecinct', () => client.getCityDistrictsForPrecinct('W01P12')],
  ['getCityPolls', () => client.getCityPolls()],
  ['getCityEarlyVotingSites', () => client.getCityEarlyVotingSites()],
  ['isInCityBoundary', () => client.isInCityBoundary(CITY_HALL)],
])('%s errors', (_, call) => {
  it('rejects an ArcGIS error body with ServiceError and its code, without retrying', async () => {
    fetchMock.mockResolvedValue(respond(errorBody));
    const error = await call().catch((e) => e);
    expect(error).toBeInstanceOf(base.ServiceError);
    expect(error.code).toBe(errorBody.error.code);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an HTTP 404 with ServiceError and its status, without retrying', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));
    const error = await call().catch((e) => e);
    expect(error).toBeInstanceOf(base.ServiceError);
    expect(error.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries an HTTP 503 once, then rejects with ServiceError', async () => {
    fetchMock.mockImplementation(async () => new Response('busy', { status: 503 }));
    const error = await call().catch((e) => e);
    expect(error).toBeInstanceOf(base.ServiceError);
    expect(error.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed body with ServiceError', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(call()).rejects.toBeInstanceOf(base.ServiceError);
    fetchMock.mockResolvedValue(respond({ nothing: true }));
    await expect(call()).rejects.toBeInstanceOf(base.ServiceError);
  });

  it('times out, retries once, then rejects with TimeoutError', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (input, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const settled = call().catch((e) => e);
    await vi.advanceTimersByTimeAsync(base.TIMEOUT_MS * 2 + base.RETRY_DELAY_MS + 10);
    expect(await settled).toBeInstanceOf(base.TimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
