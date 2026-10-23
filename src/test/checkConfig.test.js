// Runs the data health check (scripts/check-config.mjs) against a stubbed
// ArcGIS service, healthy and broken in each way the check must catch.
// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import absenteeSites from '../../docs/raw/fixtures/absentee-sites.json';
import pollRoomsFixture from '../../docs/raw/fixtures/poll-rooms.json';
import pollsFixture from '../../docs/raw/fixtures/polls.json';
import { POLL_FIELDS, PRECINCT_FIELDS, ROOM_FIELDS } from '../data/arcgis.js';
import {
  CITY_DISTRICT_FIELDS,
  CITY_POLL_FIELDS,
  CITY_PRECINCT_FIELDS,
} from '../data/cityArcgis.js';
import {
  asElectionDay,
  cityFresh,
  cityStale,
  countyFresh,
  ELECTION_DAY_SHIFT_MS,
} from '../data/waitTimes.fixtures.js';
import election from '../config/election.js';
import {
  BALLOT_SAMPLE_SIZE,
  CITY_KNOWN_POINT,
  CITY_PRECINCT_RANGE,
  KNOWN_POINTS,
  OUTSIDE_POINT,
  contentDispositionFileName,
  exitCodeFor,
  expectedCityLayers,
  expectedLayers,
  isPastElection,
  parseArgs,
  randomSample,
  report,
  runHealthCheck,
  warningLines,
} from '../../scripts/check-config.mjs';
import {
  ELECTION_DAY_CRON,
  WAITS_CRON,
  isEarlyVotingPeriod,
  isElectionDay,
  windowFor,
} from '../../scripts/electionWindow.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

// A time on the wait fixtures' recording day, Thursday 2026-10-22, in Chicago
// (UTC-5 then). Built with Date.UTC: the hardcoding test scans this file.
const oct22 = (hours, minutes = 0, seconds = 0) =>
  Date.UTC(2026, 9, 22, hours + 5, minutes, seconds);
// Just after the County fixture was recorded, with sites open.
const NOW = oct22(9, 0, 30);

const { county: countyWait, city: cityWait } = election.waitTimes;
const waitLayerPath = (source) => `${source.serviceRoot}/${source.layer}`;
const waitFields = (source, extra = []) =>
  [source.siteField, source.valueField, source.timeField, ...extra].map((name) => ({ name }));
const councilField = election.districtFields.find((d) => d.key === 'countyCouncil').field;
const cityConfig = election.jurisdictions.city;

const ballotUrl = (i) =>
  `https://stlouiscovotes.maps.arcgis.com/sharing/rest/content/items/${i
    .toString(16)
    .padStart(32, '0')}/data`;

// The file the county serves at ballotUrl(i + 1): precinct AB<i>'s PDF.
const servedFileName = (url) => {
  const i = parseInt(url.split('/items/')[1].slice(0, 32), 16) - 1;
  return `AB-${String(i).padStart(3, '0')}.pdf`;
};
// The portal's real header form (docs/data.md), with its size parameter.
const disposition = (fileName) => `attachment; filename="${fileName}"; size=55289`;

// A healthy world: 1000 precincts, 990 In Election with their own ballot link.
function healthyWorld() {
  const precincts = Array.from({ length: 1000 }, (_, i) => {
    const code = `AB${String(i).padStart(3, '0')}`;
    // Every precinct, nonresidential ones too, has a 2022 map district (#150).
    const congressional = `US Representative District ${1 + (i % 2)} (2022)`;
    return i < 990
      ? {
          precinct: code,
          in_election: 'In Election',
          html: `Sample Ballot: <a href=${ballotUrl(i + 1)}>AB-${String(i).padStart(3, '0')}.pdf</a>`,
          [election.congressionalField]: congressional,
        }
      : {
          precinct: code,
          in_election: 'Nonresidential Precinct',
          html: 'No ballot here.',
          [election.congressionalField]: congressional,
        };
  });
  const layers = {};
  for (const [key, want] of Object.entries(expectedLayers(election))) {
    layers[election.layers[key]] = {
      name: `${key}_local`,
      geometryType: want.geometryType,
      fields: want.fields.map((name) => ({ name })),
    };
  }
  return {
    layers,
    precincts,
    // The recorded early voting sites, with the County's wait join field.
    absentee: absenteeSites.features.map(({ properties: p }) => ({
      loc: p.loc,
      name: p.name,
      abs_type: p.abs_type,
      [countyWait.pollsField]: p[countyWait.pollsField],
    })),
    // Every polling place with its Election Day join field (#107) and its
    // early voting location number (#100).
    dayPolls: pollsFixture.features.map(({ properties: p }) => ({
      loc: p.loc,
      loc_abs: p.loc_abs,
      [countyWait.electionDay.pollsField]: p[countyWait.electionDay.pollsField],
    })),
    // A room for each place and site (#100): the recorded rooms, with the one
    // early voting row that had none filled.
    rooms: pollRoomsFixture.features.map(({ properties: p }) => ({
      ...p,
      ACTIVE_ROOM: p.ACTIVE_ROOM ?? 'VOTING ROOM',
    })),
    // The wait time layers (#106), as recorded at 9:00 a.m. on 2026-10-22.
    waits: {
      [waitLayerPath(countyWait)]: {
        info: { name: 'Voters_in_Line_v2', fields: waitFields(countyWait) },
        rows: countyFresh,
      },
      [waitLayerPath(cityWait)]: {
        info: {
          name: 'VotingLocations_currentwait',
          fields: waitFields(cityWait, [cityWait.hoursField, cityWait.commentsField]),
        },
        rows: cityFresh,
      },
    },
    // By default every known point is where it should be.
    pointPrecinct: (lng, lat) => {
      const known = KNOWN_POINTS.find((p) => p.lng === lng && p.lat === lat);
      return known ? { precinct: 'AB001', [councilField]: known.council } : null;
    },
    inBoundary: (lng, lat) => KNOWN_POINTS.some((p) => p.lng === lng && p.lat === lat),
    ballot: (url) => ({
      status: 200,
      type: 'application/pdf',
      disposition: disposition(servedFileName(url)),
    }),
    city: healthyCity(),
    calls: [],
    waitQueries: [],
    cityQueries: [],
  };
}

// The City's layers (#87): 207 precincts in 14 wards, the Election Day list
// and early voting sites the config expects, and City Hall where it belongs.
function healthyCity() {
  const { siteFields: f } = cityConfig;
  const site = (i) => ({
    [f.id]: `Site_${i}`,
    [f.name]: `Site ${i}`,
    [f.address]: `${i} Main St`,
    [f.zip]: i % 8 ? '63101' : null,
  });
  const precincts = [];
  for (let ward = 1; ward <= 14; ward += 1) {
    for (let p = 1; p <= (ward <= 11 ? 15 : 14); p += 1) {
      precincts.push({ [cityConfig.precinctField]: `W ${ward} P ${p}` });
    }
  }
  // Layer descriptions by path. Two keys can share a path (the districts and
  // the boundary), and the voting locations are the City wait layer's rows.
  const layers = {};
  for (const [key, want] of Object.entries(expectedCityLayers(election))) {
    const path = cityConfig.layers[key];
    const known = layers[path]?.fields ?? [];
    layers[path] = {
      name: `${key}_local`,
      geometryType: want.geometryType,
      fields: [...known, ...want.fields.map((name) => ({ name }))],
    };
  }
  return {
    layers,
    precincts,
    polls: Array.from({ length: cityConfig.pollsListed }, (_, i) => site(i + 1)),
    earlyVoting: Array.from({ length: 8 }, (_, i) => site(i + 1)),
    pointPrecinct: (lng, lat) =>
      lng === CITY_KNOWN_POINT.lng && lat === CITY_KNOWN_POINT.lat
        ? { [cityConfig.precinctField]: 'W 14 P 2' }
        : null,
    districts: (lng, lat) =>
      lng === CITY_KNOWN_POINT.lng && lat === CITY_KNOWN_POINT.lat
        ? [
            {
              [cityConfig.districtLayerFields.office]: 'Alderman',
              [cityConfig.districtLayerFields.name]: 'Ward 14',
              [cityConfig.districtLayerFields.id]: 'Ward 14',
            },
          ]
        : [],
    inBoundary: (lng, lat) => lng === CITY_KNOWN_POINT.lng && lat === CITY_KNOWN_POINT.lat,
  };
}

// A City layer request, answered from the world's City layers, or undefined
// for anything else.
function cityAnswer(world, url) {
  const prefix = `${cityConfig.serviceRoot}/`;
  if (!url.href.startsWith(prefix)) return undefined;
  const rest = url.pathname.slice(new URL(prefix).pathname.length);
  const isQuery = rest.endsWith('/query');
  const layerPath = isQuery ? rest.slice(0, -'/query'.length) : rest;
  const info = world.city.layers[layerPath];
  if (!info) return undefined;
  const params = url.searchParams;
  if (!isQuery) {
    // The voting locations layer is the City wait layer too: one description.
    const wait = world.waits[`${cityConfig.serviceRoot}/${layerPath}`]?.info;
    return json({ ...info, ...wait, fields: [...info.fields, ...(wait?.fields ?? [])] });
  }
  const outFields = (params.get('outFields') ?? '').split(',');
  if (layerPath === cityConfig.layers.sites && !outFields.includes(cityConfig.siteFields.id)) {
    return undefined;
  }
  world.cityQueries.push(params);
  const features = (rows) => json({ features: rows.map((attributes) => ({ attributes })) });
  const geometry = params.get('geometry');
  const [lng, lat] = geometry ? geometry.split(',').map(Number) : [];
  const where = params.get('where');
  if (layerPath === cityConfig.layers.precincts) {
    if (geometry) {
      const hit = world.city.pointPrecinct(lng, lat);
      return features(hit ? [hit] : []);
    }
    return features(world.city.precincts);
  }
  if (layerPath === cityConfig.layers.sites) {
    if (where === cityConfig.pollsWhere) return features(world.city.polls);
    if (where === cityConfig.earlyVotingWhere) return features(world.city.earlyVoting);
    return json({ error: { code: 400, message: 'Unable to complete operation.' } });
  }
  if (where === cityConfig.boundaryWhere) {
    return features(world.city.inBoundary(lng, lat) ? [{ OBJECTID: 1 }] : []);
  }
  return features(world.city.districts(lng, lat));
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// A fetch that answers like ArcGIS for the world's layers.
function stubFetch(world) {
  return async (input, init = {}) => {
    const url = new URL(input);
    world.calls.push({ url: url.href, method: init.method ?? 'GET' });
    if (world.fail) {
      const answer = world.fail(url, init);
      if (answer) return answer;
    }
    if (init.method === 'HEAD') {
      const { status, type, disposition: cd } = world.ballot(url.href);
      const headers = {};
      if (type) headers['content-type'] = type;
      if (cd) headers['content-disposition'] = cd;
      return new Response(null, { status, headers });
    }
    const city = cityAnswer(world, url);
    if (city) return city;
    const wait = Object.entries(world.waits).find(
      ([root]) => url.href.startsWith(`${root}?`) || url.href.startsWith(`${root}/query?`),
    );
    if (wait) {
      const [, layer] = wait;
      if (!url.pathname.endsWith('/query')) return json(layer.info);
      // A filter the layer cannot run answers an ArcGIS error, as the service does.
      if (world.badWhere && url.searchParams.get('where') === world.badWhere) {
        return json({ error: { code: 400, message: 'Unable to complete operation.' } });
      }
      world.waitQueries.push(url.searchParams);
      return json({ features: layer.rows.map((attributes) => ({ attributes })) });
    }
    const prefix = `${election.serviceRoot}/`;
    if (!url.href.startsWith(prefix)) throw new TypeError('fetch failed');
    const rest = url.pathname.slice(new URL(prefix).pathname.length);
    const isQuery = rest.endsWith('/query');
    const layerPath = isQuery ? rest.slice(0, -'/query'.length) : rest;
    const info = world.layers[layerPath];
    if (!info)
      return json({ error: { code: 400, message: 'Invalid URL', details: ['Invalid URL'] } });
    if (!isQuery) return json(info);

    const params = url.searchParams;
    const geometry = params.get('geometry');
    const features = (rows) => json({ features: rows.map((attributes) => ({ attributes })) });
    if (layerPath === election.layers.precincts) {
      if (geometry) {
        const [lng, lat] = geometry.split(',').map(Number);
        const hit = world.pointPrecinct(lng, lat);
        return features(hit ? [hit] : []);
      }
      return world.exceeded
        ? json({ features: [], exceededTransferLimit: true })
        : features(world.precincts);
    }
    if (layerPath === election.layers.polls) {
      // Every polling place, for the County's Election Day reports (#107) and
      // the polling place rooms check (#100), which asks for loc_abs.
      if (params.get('where') === '1=1') {
        if (!(params.get('outFields') ?? '').includes('loc_abs')) world.dayPollsAsked = true;
        return features(world.dayPolls);
      }
      expect(params.get('where')).toBe(election.absenteeWhere);
      return features(world.absentee);
    }
    if (layerPath === election.layers.pollRooms) {
      world.roomQueries = [...(world.roomQueries ?? []), params];
      return features(world.rooms);
    }
    const [lng, lat] = geometry.split(',').map(Number);
    return features(world.inBoundary(lng, lat) ? [{ OBJECTID: 1 }] : []);
  };
}

// City early voting hours for every early voting site of a world (#91).
function hoursFor(world) {
  const ids = world.city.earlyVoting.map((row) => row[cityConfig.siteFields.id]);
  return {
    sites: Object.fromEntries(ids.map((id) => [id, 'all'])),
    schedules: { all: [{ from: '', to: '', days: [1], open: '08:00', close: '17:00' }] },
  };
}

async function run(world, config = election, options = {}) {
  const results = await runHealthCheck(config, {
    fetch: stubFetch(world),
    cityEarlyVoting: hoursFor(world),
    sample: (items, count) => items.slice(0, count),
    retryDelayMs: 0,
    now: NOW,
    ...options,
  });
  return Object.fromEntries(results.map((r) => [r.name, r]));
}

const failing = (results) =>
  Object.values(results)
    .filter((r) => r.status !== 'pass')
    .map((r) => r.name);

describe('runHealthCheck', () => {
  it('passes every check on healthy layers', async () => {
    const results = await run(healthyWorld());
    expect(failing(results)).toEqual([]);
    expect(Object.keys(results)).toEqual([
      'layer precincts',
      'layer polls',
      'layer countyBoundary',
      'layer pollRooms',
      'precinct count',
      'sample ballot links',
      'sample ballot PDFs',
      'congressional districts',
      'absentee sites',
      'polling place rooms',
      'known points',
      'wait layer county',
      'wait layer city',
      'wait filter county election day',
      'wait reports county',
      'wait reports city',
      'city layer precincts',
      'city layer districts',
      'city layer sites',
      'city layer boundary',
      'city precincts',
      'city voting locations',
      'city early voting sites',
      'city known points',
    ]);
    expect(results['city precincts'].detail).toBe('207 precincts, wards 1 to 14');
    expect(results['city voting locations'].detail).toBe(
      `${cityConfig.pollsListed} Election Day sites, as the City Board lists; 7 without a ZIP`,
    );
    expect(results['city early voting sites'].detail).toBe('8 sites, each with its hours');
    expect(results['precinct count'].detail).toBe('1000 precincts, 990 In Election');
    expect(results['sample ballot PDFs'].detail).toMatch(/^5 of 5/);
    expect(results['congressional districts'].detail).toBe(
      '1000 precincts on the 2022 map: District 1 (500), District 2 (500)',
    );
  });

  // The room inside each polling place (#100).
  it('passes when every Election Day place and early voting site has a room', async () => {
    const results = await run(healthyWorld());
    expect(results['polling place rooms']).toEqual({
      name: 'polling place rooms',
      status: 'pass',
      detail: 'a room for all 200 Election Day places and all 21 early voting sites',
    });
  });

  it('asks the room layer only for the fields the app reads, never staffing or turnout', async () => {
    const world = healthyWorld();
    await run(world);
    expect(world.roomQueries).toHaveLength(1);
    expect(world.roomQueries[0].get('outFields')).toBe('LOCATION_ID,ACTIVE,ACTIVE_ROOM');
    expect(world.roomQueries[0].get('where')).toBe(election.pollRooms.where);
  });

  it('warns, naming them, when places or sites have no room (the recorded layer)', async () => {
    const world = healthyWorld();
    world.rooms = pollRoomsFixture.features.map(({ properties }) => properties);
    world.rooms = world.rooms.filter((r) => !(r.ACTIVE === 'ACTIVE' && r.LOCATION_ID === 7));
    const results = await run(world);
    expect(results['polling place rooms']).toEqual({
      name: 'polling place rooms',
      status: 'warn',
      detail:
        'Election Day places without a room: 1 of 200 (loc 007); ' +
        'early voting sites without a room: 1 of 21 (loc_abs 614). The app shows them without one.',
    });
  });

  it('matches a location number the polls layer writes unpadded, as the app does', async () => {
    const world = healthyWorld();
    world.dayPolls = world.dayPolls.map((p) => ({ ...p, loc: String(Number(p.loc)) }));
    expect((await run(world))['polling place rooms'].status).toBe('pass');
  });

  it('warns when the room layer has no rows', async () => {
    const world = healthyWorld();
    world.rooms = [];
    const results = await run(world);
    expect(results['polling place rooms'].status).toBe('warn');
    expect(results['polling place rooms'].detail).toMatch(
      /^Election Day places without a room: 200 of 200 /,
    );
  });

  it('fails the room layer when it lacks a field the app reads', async () => {
    const world = healthyWorld();
    const info = world.layers[election.layers.pollRooms];
    info.fields = info.fields.filter((f) => f.name !== 'ACTIVE_ROOM');
    const results = await run(world);
    expect(results['layer pollRooms'].status).toBe('fail');
    expect(results['layer pollRooms'].detail).toContain('missing fields ACTIVE_ROOM');
    expect(results['polling place rooms'].status).toBe('skip');
  });

  it('fails with a clear message when the config names a wrong layer', async () => {
    const wrong = 'precincts_wrong_view/FeatureServer/1';
    const config = { ...election, layers: { ...election.layers, precincts: wrong } };
    const results = await run(healthyWorld(), config);
    expect(results['layer precincts']).toEqual({
      name: 'layer precincts',
      status: 'fail',
      detail:
        `layers.precincts (${wrong}): ArcGIS error 400: ` +
        'Invalid URL. Check this path in src/config/election.js.',
    });
    // Checks that need the layer are skipped, not reported as passing.
    for (const name of ['precinct count', 'sample ballot links', 'sample ballot PDFs']) {
      expect(results[name].status).toBe('skip');
    }
    expect(results['known points'].status).toBe('skip');
    expect(results['absentee sites'].status).toBe('pass');
  });

  it('fails when a layer is missing a field the app reads', async () => {
    const world = healthyWorld();
    const info = world.layers[election.layers.precincts];
    info.fields = info.fields.filter((f) => f.name !== 'html' && f.name !== councilField);
    const results = await run(world);
    expect(results['layer precincts'].status).toBe('fail');
    expect(results['layer precincts'].detail).toContain(`missing fields html, ${councilField}`);
  });

  it('reports malformed field lists as missing fields instead of crashing', async () => {
    const world = healthyWorld();
    world.layers[election.layers.polls].fields = { loc: 'x' };
    world.layers[election.layers.countyBoundary].fields = [null];
    const results = await run(world);
    expect(results['layer polls'].detail).toContain('missing fields loc, name');
    expect(results['layer countyBoundary'].detail).toContain('missing fields OBJECTID');
  });

  it('fails when a layer has the wrong geometry', async () => {
    const world = healthyWorld();
    world.layers[election.layers.countyBoundary].geometryType = 'esriGeometryPoint';
    const results = await run(world);
    expect(results['layer countyBoundary'].detail).toContain(
      'geometry is esriGeometryPoint, want esriGeometryPolygon',
    );
    expect(results['known points'].status).toBe('skip');
  });

  it('fails when the precinct count is out of range or none is In Election', async () => {
    const few = healthyWorld();
    few.precincts = few.precincts.slice(0, 10);
    expect((await run(few))['precinct count'].detail).toBe('10 precincts, want 900 to 1600');

    const none = healthyWorld();
    none.precincts = none.precincts.map((p) => ({ ...p, in_election: 'Not In Election' }));
    const results = await run(none);
    expect(results['precinct count'].detail).toBe('no precinct is In Election');
    expect(results['sample ballot links'].status).toBe('skip');
  });

  // The 2022 map applies on November 3, 2026 (#150): a 2025 value, a district
  // the County does not have on that map, or no value fails, naming the precinct.
  it('fails when a precinct is not on the 2022 congressional map (#150)', async () => {
    const world = healthyWorld();
    world.precincts[0][election.congressionalField] = 'US Representative District 2 (2025)';
    world.precincts[1][election.congressionalField] = 'US Representative District 3 (2022)';
    world.precincts[2][election.congressionalField] = '';
    delete world.precincts[3][election.congressionalField];
    const result = (await run(world))['congressional districts'];
    expect(result.status).toBe('fail');
    expect(result.detail).toBe(
      '4 precincts fail: AB000: "US Representative District 2 (2025)"; ' +
        'AB001: "US Representative District 3 (2022)"; AB002: ""; AB003: undefined',
    );
  });

  it('asks for the congressional field with the precinct count, in one request', async () => {
    const world = healthyWorld();
    await run(world);
    const listQueries = world.calls.filter(
      ({ url }) =>
        url.includes(`${election.layers.precincts}/query`) && url.includes('where=1%3D1'),
    );
    expect(listQueries).toHaveLength(1);
    expect(new URL(listQueries[0].url).searchParams.get('outFields').split(',')).toContain(
      election.congressionalField,
    );
  });

  it('skips the congressional check when the precinct count fails', async () => {
    const world = healthyWorld();
    world.precincts = world.precincts.slice(0, 10);
    expect((await run(world))['congressional districts'].status).toBe('skip');
  });

  it('fails when there are too many precincts', async () => {
    const world = healthyWorld();
    world.precincts = Array.from({ length: 1601 }, (_, i) => ({
      precinct: `AB${i}`,
      in_election: 'Nonresidential Precinct',
      html: 'No ballot here.',
    }));
    world.precincts[0].in_election = 'In Election';
    expect((await run(world))['precinct count'].detail).toBe('1601 precincts, want 900 to 1600');
  });

  it('fails on several links, a link with no file name, and an empty field where a message belongs', async () => {
    const world = healthyWorld();
    world.precincts[5].html = `<a href=${ballotUrl(6)}>a.pdf</a> <a href=${ballotUrl(9999)}>b.pdf</a>`;
    world.precincts[6].html = `Sample Ballot: <a href=${ballotUrl(7)}></a>`;
    world.precincts[996].html = '';
    const { detail } = (await run(world))['sample ballot links'];
    expect(detail).toMatch(/^3 precincts fail/);
    expect(detail).toContain('AB005: several links');
    expect(detail).toContain('AB006: link has no file name');
    expect(detail).toContain('AB996 (Nonresidential Precinct): expected a message');
  });

  it('fails, naming each precinct, when a link names another precinct (#82)', async () => {
    const world = healthyWorld();
    // Two precincts' links swapped: both still valid and unique.
    const [a, b] = [world.precincts[7].html, world.precincts[8].html];
    world.precincts[7].html = b;
    world.precincts[8].html = a;
    world.precincts[9].html = `Sample Ballot: <a href=${ballotUrl(10)}>Sample Ballot.pdf</a>`;
    const { detail, status } = (await run(world))['sample ballot links'];
    expect(status).toBe('fail');
    expect(detail).toMatch(/^3 precincts fail/);
    expect(detail).toContain('AB007: link names AB-008.pdf, not this precinct');
    expect(detail).toContain('AB008: link names AB-007.pdf, not this precinct');
    expect(detail).toContain('AB009: link names Sample Ballot.pdf, not this precinct');
  });

  it('fails when the precinct query is cut off', async () => {
    const world = healthyWorld();
    world.exceeded = true;
    expect((await run(world))['precinct count'].detail).toContain('page the query');
  });

  it('fails on a bad, shared or missing sample ballot link and a link where a message belongs', async () => {
    const world = healthyWorld();
    world.precincts[0].html = 'Sample Ballot: <a href=https://example.com/x.pdf>x.pdf</a>';
    world.precincts[1].html = world.precincts[2].html;
    world.precincts[3].html = '';
    world.precincts[995].html = world.precincts[4].html;
    const { detail, status } = (await run(world))['sample ballot links'];
    expect(status).toBe('fail');
    // AB001 now holds AB002's link, so it also names another precinct (#82).
    expect(detail).toMatch(/^5 precincts fail/);
    expect(detail).toContain('AB000: no valid link');
    expect(detail).toContain('AB001: link names AB-002.pdf, not this precinct');
    expect(detail).toContain('AB002: link shared with another precinct');
    expect(detail).toContain('AB003: no valid link');
    expect(detail).toContain('AB995 (Nonresidential Precinct): expected a message');
  });

  it('HEADs a sample of the links and fails when one is not a PDF', async () => {
    const world = healthyWorld();
    world.ballot = (url) =>
      url === ballotUrl(2)
        ? { status: 200, type: 'text/html; charset=utf-8' }
        : url === ballotUrl(3)
          ? { status: 404 }
          : { status: 200, type: 'application/pdf', disposition: disposition(servedFileName(url)) };
    const results = await run(world);
    const heads = world.calls.filter((c) => c.method === 'HEAD');
    expect(heads).toHaveLength(BALLOT_SAMPLE_SIZE);
    expect(results['sample ballot PDFs'].detail).toBe(
      `2 of 5: AB001 (${ballotUrl(2)}): Content-Type text/html; ` +
        `AB002 (${ballotUrl(3)}): HTTP 404`,
    );
  });

  it('fails, naming the precinct, when a sampled PDF is named for another precinct (#111)', async () => {
    const world = healthyWorld();
    // AB001's link text says AB-001.pdf, but its URL serves AB-007.pdf.
    world.ballot = (url) => ({
      status: 200,
      type: 'application/pdf',
      disposition: disposition(url === ballotUrl(2) ? 'AB-007.pdf' : servedFileName(url)),
    });
    const { status, detail } = (await run(world))['sample ballot PDFs'];
    expect(status).toBe('fail');
    expect(detail).toBe(`1 of 5: AB001 (${ballotUrl(2)}): the PDF is named AB-007.pdf`);
  });

  it('fails, naming the precinct, when a sampled PDF has no file name (#111)', async () => {
    const world = healthyWorld();
    world.ballot = (url) =>
      url === ballotUrl(4)
        ? { status: 200, type: 'application/pdf' }
        : url === ballotUrl(5)
          ? { status: 200, type: 'application/pdf', disposition: 'attachment' }
          : { status: 200, type: 'application/pdf', disposition: disposition(servedFileName(url)) };
    const { status, detail } = (await run(world))['sample ballot PDFs'];
    expect(status).toBe('fail');
    expect(detail).toBe(
      `2 of 5: AB003 (${ballotUrl(4)}): no file name in Content-Disposition; ` +
        `AB004 (${ballotUrl(5)}): no file name in Content-Disposition`,
    );
  });

  it('passes when every sampled PDF is named for its precinct', async () => {
    const { status, detail } = (await run(healthyWorld()))['sample ballot PDFs'];
    expect(status).toBe('pass');
    expect(detail).toBe('5 of 5 answer HEAD with a PDF named for their precinct');
  });

  it('checks as many links as ballotSample asks, or every link', async () => {
    const some = healthyWorld();
    await run(some, election, { ballotSample: 12 });
    expect(some.calls.filter((c) => c.method === 'HEAD')).toHaveLength(12);

    const every = healthyWorld();
    const results = await run(every, election, { ballotSample: Infinity });
    expect(every.calls.filter((c) => c.method === 'HEAD')).toHaveLength(990);
    expect(results['sample ballot PDFs'].detail).toMatch(/^990 of 990 /);
  });

  it('fails when the absentee filter finds no site or a site has no hours', async () => {
    const empty = healthyWorld();
    empty.absentee = [];
    expect((await run(empty))['absentee sites'].detail).toBe(
      `absenteeWhere (${election.absenteeWhere}) returns no sites`,
    );

    const unknown = healthyWorld();
    unknown.absentee.push({ loc: '200', name: 'NEW', abs_type: 'mobile' });
    expect((await run(unknown))['absentee sites'].detail).toBe(
      'abs_type "mobile" has no hours in earlyVoting.schedules',
    );
  });

  it('fails when a known point has no precinct, the wrong district, or is outside the county', async () => {
    const world = healthyWorld();
    const [first, second, third] = KNOWN_POINTS;
    world.pointPrecinct = (lng, lat) => {
      if (lng === first.lng && lat === first.lat) return null;
      if (lng === second.lng && lat === second.lat) {
        return { precinct: 'AB002', [councilField]: 'County Council District 9' };
      }
      if (lng === OUTSIDE_POINT.lng && lat === OUTSIDE_POINT.lat) return { precinct: 'X' };
      return { precinct: 'AB001', [councilField]: KNOWN_POINTS.find((p) => p.lng === lng).council };
    };
    world.inBoundary = (lng) => lng !== third.lng;
    const { detail } = (await run(world))['known points'];
    expect(detail.split('; ')).toEqual([
      `${first.name}: no precinct`,
      `${second.name}: County Council District 9, want ${second.council}`,
      `${third.name}: outside the county boundary`,
      `${OUTSIDE_POINT.name}: has a precinct`,
      `${OUTSIDE_POINT.name}: inside the county boundary`,
    ]);
  });

  it('fails when a known point returns a malformed precinct code', async () => {
    const world = healthyWorld();
    const healthy = world.pointPrecinct;
    world.pointPrecinct = (lng, lat) => {
      const hit = healthy(lng, lat);
      return hit && lng === KNOWN_POINTS[0].lng ? { ...hit, precinct: 'X' } : hit;
    };
    expect((await run(world))['known points'].detail).toBe(
      `${KNOWN_POINTS[0].name}: bad precinct code "X"`,
    );
  });

  it('requires the fields the app reads from each layer', () => {
    const want = expectedLayers(election);
    expect(want.polls.fields).toEqual([
      'loc',
      'name',
      'address',
      'zipcode',
      'abs_type',
      'notes_abs',
      'inline',
      'loc_abs',
      election.waitTimes.county.pollsField,
      election.waitTimes.county.electionDay.pollsField,
    ]);
    expect(want.countyBoundary.fields).toEqual(['OBJECTID']);
    expect(want.pollRooms).toEqual({
      geometryType: 'esriGeometryPoint',
      fields: ['LOCATION_ID', 'ACTIVE', 'ACTIVE_ROOM'],
    });
    for (const field of ['precinct', 'in_election', 'html', election.congressionalField]) {
      expect(want.precincts.fields).toContain(field);
    }
    for (const { field } of election.districtFields) expect(want.precincts.fields).toContain(field);
  });

  it('has one known point per council district', () => {
    expect(new Set(KNOWN_POINTS.map((p) => p.council)).size).toBe(7);
  });

  it('retries a transient failure, then gives up with the reason', async () => {
    const flaky = healthyWorld();
    let failures = 2;
    flaky.fail = (url) =>
      url.href.endsWith(`${election.layers.polls}?f=json`) && failures-- > 0
        ? new Response('busy', { status: 503 })
        : null;
    expect((await run(flaky))['layer polls'].status).toBe('pass');

    const down = healthyWorld();
    down.fail = (url) =>
      url.href.endsWith(`${election.layers.polls}?f=json`)
        ? json({ error: { code: 500, message: 'Server busy' } })
        : null;
    const results = await run(down);
    expect(results['layer polls'].detail).toContain('ArcGIS error 500: Server busy');
    expect(
      down.calls.filter((c) => c.url.endsWith(`${election.layers.polls}?f=json`)),
    ).toHaveLength(3);
  });

  it('fails, rather than passing, when a query answers with no features list', async () => {
    const world = healthyWorld();
    world.fail = (url) => (url.pathname.endsWith('/query') ? json({}) : null);
    const results = await run(world);
    expect(results['precinct count'].detail).toBe('the response has no features list');
    expect(results['absentee sites'].detail).toBe('the response has no features list');
    expect(results['known points'].status).toBe('fail');
    expect(results['known points'].detail).toBe('the response has no features list');
  });

  it('reports a null answer or a null feature as a failure instead of crashing', async () => {
    const world = healthyWorld();
    world.fail = (url) => {
      if (url.href.endsWith(`${election.layers.countyBoundary}?f=json`)) return json(null);
      if (url.pathname.endsWith(`${election.layers.polls}/query`))
        return json({ features: [null] });
      return null;
    };
    const results = await run(world);
    expect(results['layer countyBoundary'].status).toBe('fail');
    expect(results['layer countyBoundary'].detail).toContain('not a JSON object');
    expect(results['absentee sites'].status).toBe('fail');
  });

  it('retries a timeout and a 429, then names the outage without blaming the config', async () => {
    const world = healthyWorld();
    world.fail = (url, init) => {
      if (url.href.endsWith(`${election.layers.polls}?f=json`)) {
        return new Promise((resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      }
      if (url.href.endsWith(`${election.layers.countyBoundary}?f=json`)) {
        return new Response('', { status: 429 });
      }
      return null;
    };
    const results = await runHealthCheck(election, {
      fetch: stubFetch(world),
      sample: (items, count) => items.slice(0, count),
      retryDelayMs: 0,
      timeoutMs: 20,
    });
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));
    expect(byName['layer polls'].detail).toBe(
      `layers.polls (${election.layers.polls}): request failed: no answer in 20 ms`,
    );
    expect(byName['layer countyBoundary'].detail).toBe(
      `layers.countyBoundary (${election.layers.countyBoundary}): HTTP 429`,
    );
    const tries = (suffix) => world.calls.filter((c) => c.url.endsWith(suffix)).length;
    expect(tries(`${election.layers.polls}?f=json`)).toBe(3);
    expect(tries(`${election.layers.countyBoundary}?f=json`)).toBe(3);
  });

  it('does not retry a client error', async () => {
    const world = healthyWorld();
    world.fail = (url) =>
      url.href.endsWith(`${election.layers.polls}?f=json`)
        ? new Response('', { status: 404 })
        : null;
    const results = await run(world);
    expect(results['layer polls'].detail).toContain('HTTP 404');
    expect(
      world.calls.filter((c) => c.url.endsWith(`${election.layers.polls}?f=json`)),
    ).toHaveLength(1);
  });

  it('reports a network failure', async () => {
    const world = healthyWorld();
    world.fail = (url) => {
      if (url.href.endsWith(`${election.layers.countyBoundary}?f=json`))
        throw new TypeError('fetch failed');
      return null;
    };
    expect((await run(world))['layer countyBoundary'].detail).toContain(
      'request failed: fetch failed',
    );
  });
});

describe('contentDispositionFileName', () => {
  it("reads the portal's header, quoted or not, with other parameters", () => {
    expect(contentDispositionFileName('attachment; filename="CC-007.pdf"; size=55289')).toBe(
      'CC-007.pdf',
    );
    expect(contentDispositionFileName('attachment; filename=CC-007.pdf')).toBe('CC-007.pdf');
    expect(contentDispositionFileName('inline;FILENAME="BON-001.pdf"')).toBe('BON-001.pdf');
  });

  it('prefers filename* over filename and decodes it', () => {
    expect(
      contentDispositionFileName(`attachment; filename="old.pdf"; filename*=UTF-8''CC%2D007.pdf`),
    ).toBe('CC-007.pdf');
  });

  it('returns null when there is no file name', () => {
    expect(contentDispositionFileName(null)).toBeNull();
    expect(contentDispositionFileName('')).toBeNull();
    expect(contentDispositionFileName('attachment')).toBeNull();
    expect(contentDispositionFileName('attachment; filename=""')).toBeNull();
    expect(contentDispositionFileName('attachment; filename="CC-007.pdf')).toBeNull();
    expect(contentDispositionFileName(`attachment; filename*=UTF-8''%E0%A4%A`)).toBeNull();
  });
});

describe('randomSample', () => {
  it('picks distinct items, at most the count', () => {
    const picked = randomSample(['a', 'b', 'c', 'd', 'e', 'f'], 5);
    expect(new Set(picked).size).toBe(5);
    expect(randomSample(['a'], 5)).toEqual(['a']);
  });
});

// The wait time layers (#106, #132): fields first, then whether each board's
// reports are fresh. A quiet board while sites are open is a warning, never a
// failure: the scheduled run must not fail because no one stood in line.
describe('wait time checks', () => {
  const county = waitLayerPath(countyWait);
  const city = waitLayerPath(cityWait);

  it('passes on the recorded layers and names each board and whether it is fresh', async () => {
    const results = await run(healthyWorld());
    expect(results['wait layer county']).toEqual({
      name: 'wait layer county',
      status: 'pass',
      detail: `waitTimes.county (${countyWait.layer}): Voters_in_Line_v2, expected fields present (3)`,
    });
    expect(results['wait layer city'].detail).toBe(
      `waitTimes.city (${cityWait.layer}): VotingLocations_currentwait, expected fields present (5)`,
    );
    expect(results['wait reports county']).toEqual({
      name: 'wait reports county',
      status: 'pass',
      detail:
        `${countyWait.source}: fresh. 19 of 21 open sites have a current count; ` +
        '0 reports match no site; newest report 2026-10-22 09:00 America/Chicago',
    });
    expect(results['wait reports city']).toEqual({
      name: 'wait reports city',
      status: 'pass',
      detail:
        `${cityWait.source}: fresh. 7 of 8 rows have a ${cityWait.valueField}; ` +
        '1 open now, 1 with a current count; newest report 2026-10-22 08:10 America/Chicago',
    });
  });

  describe('on Election Day (#107)', () => {
    const ED_NOW = NOW + ELECTION_DAY_SHIFT_MS;
    const dayWorld = () => {
      const world = healthyWorld();
      world.waits[county].rows = asElectionDay(countyFresh, 'county', pollsFixture.features);
      world.waits[city].rows = asElectionDay(cityFresh, 'city');
      return world;
    };

    it("judges each board's Election Day reports against its polling places", async () => {
      const world = dayWorld();
      const results = await run(world, election, { now: ED_NOW });
      expect(world.dayPollsAsked).toBe(true);
      expect(results['election day polling places'].status).toBe('pass');
      expect(results['wait reports county']).toMatchObject({
        status: 'pass',
        detail: expect.stringContaining(
          `fresh. 19 of ${pollsFixture.features.length} open sites have a current count`,
        ),
      });
      expect(results['wait reports city'].detail).toContain('1 with a current count');
      const [countyQuery, cityQuery] = world.waitQueries;
      expect(countyQuery.get('where')).toBe(countyWait.electionDay.where);
      expect(cityQuery.get('where')).toBe(cityWait.electionDay.where);
    });

    it("warns while the polls are open and today's view has only absentee reports", async () => {
      const world = dayWorld();
      world.waits[county].rows = countyFresh.map((r) => ({
        ...r,
        [countyWait.timeField]: r[countyWait.timeField] + ELECTION_DAY_SHIFT_MS,
      }));
      const results = await run(world, election, { now: ED_NOW });
      expect(results['wait reports county'].status).toBe('warn');
      expect(results['wait reports county'].detail).toContain('not fresh. 0 of');
    });

    it('checks a separate Election Day layer every day, before Election Day too', async () => {
      const world = healthyWorld();
      const dayLayer = 'Voters_in_Line_ElectionDay/FeatureServer/0';
      const config = structuredClone({ ...election, sampleBallotUrlPattern: undefined });
      config.sampleBallotUrlPattern = election.sampleBallotUrlPattern;
      config.waitTimes.county.electionDay.layer = dayLayer;
      world.waits[`${countyWait.serviceRoot}/${dayLayer}`] = {
        info: { name: 'Voters_in_Line_ElectionDay', fields: waitFields(countyWait) },
        rows: [],
      };
      const results = await run(world, config);
      expect(results['wait layer county election day']).toMatchObject({ status: 'pass' });
      world.waits[`${countyWait.serviceRoot}/${dayLayer}`].info.fields = [];
      const broken = await run(world, config);
      expect(broken['wait layer county election day'].status).toBe('fail');
    });

    it("runs the County's Election Day filter every day, before Election Day too", async () => {
      const results = await run(healthyWorld());
      expect(results['wait filter county election day']).toMatchObject({ status: 'pass' });
      const world = healthyWorld();
      world.badWhere = countyWait.electionDay.where;
      const broken = await run(world);
      expect(broken['wait filter county election day'].status).toBe('fail');
      expect(broken['wait filter county election day'].detail).toContain('electionDay');
    });

    it('warns when no polling place has the Election Day join field', async () => {
      const world = dayWorld();
      for (const row of world.dayPolls) row[countyWait.electionDay.pollsField] = '';
      const results = await run(world, election, { now: ED_NOW });
      expect(results['election day polling places'].status).toBe('warn');
      expect(results['wait reports county'].status).toBe('warn');
    });

    it('says closed after the polls close', async () => {
      const results = await run(dayWorld(), election, { now: ED_NOW + 11 * 60 * 60_000 });
      expect(results['wait reports county'].detail).toContain('closed');
      expect(results['wait reports city'].detail).toContain('closed');
    });
  });

  it('asks each layer for its own fields, filter and newest first', async () => {
    const world = healthyWorld();
    await run(world);
    // The reports queries, newest first (the Election Day filter check, #107,
    // asks for no order).
    const [countyQuery, cityQuery] = world.waitQueries.filter((q) => q.get('orderByFields'));
    expect(countyQuery.get('where')).toBe(countyWait.where);
    expect(countyQuery.get('outFields').split(',').sort()).toEqual(
      [countyWait.siteField, countyWait.timeField, countyWait.valueField].sort(),
    );
    expect(countyQuery.get('orderByFields')).toBe(`${countyWait.timeField} DESC`);
    expect(cityQuery.get('where')).toBe(cityWait.where);
    // Never outFields=*: the City layer also holds staff contact fields.
    expect(cityQuery.get('outFields').split(',').sort()).toEqual(
      [
        cityWait.siteField,
        cityWait.valueField,
        cityWait.timeField,
        cityWait.commentsField,
        cityWait.hoursField,
      ].sort(),
    );
  });

  it('fails a wait layer missing a field the app reads, and skips its reports', async () => {
    const world = healthyWorld();
    world.waits[county].info.fields = world.waits[county].info.fields.filter(
      (f) => f.name !== countyWait.valueField,
    );
    world.waits[city].info.fields = world.waits[city].info.fields.filter(
      (f) => f.name !== cityWait.timeField && f.name !== cityWait.commentsField,
    );
    const results = await run(world);
    expect(results['wait layer county']).toMatchObject({
      status: 'fail',
      detail: `waitTimes.county (${countyWait.layer}): missing fields ${countyWait.valueField}`,
    });
    expect(results['wait layer city'].detail).toBe(
      `waitTimes.city (${cityWait.layer}): missing fields ${cityWait.timeField}, ${cityWait.commentsField}`,
    );
    expect(results['wait reports county'].status).toBe('skip');
    expect(results['wait reports city'].status).toBe('skip');
    expect(exitCodeFor(Object.values(results))).toBe(1);
  });

  it('fails a wait layer that does not answer, naming the config key', async () => {
    const world = healthyWorld();
    world.fail = (url) =>
      url.href.startsWith(`${city}?`)
        ? json({ error: { code: 400, message: 'Invalid URL', details: ['Invalid URL'] } })
        : null;
    const results = await run(world);
    expect(results['wait layer city']).toMatchObject({
      status: 'fail',
      detail:
        `waitTimes.city (${cityWait.layer}): ArcGIS error 400: Invalid URL. ` +
        'Check this path in src/config/election.js.',
    });
  });

  it('passes an empty County view while every site is closed', async () => {
    const world = healthyWorld();
    world.waits[county].rows = [];
    const results = await run(world, election, { now: oct22(18) });
    expect(results['wait reports county']).toEqual({
      name: 'wait reports county',
      status: 'pass',
      detail: `${countyWait.source}: closed. No site is open now; 0 reports in the view`,
    });
  });

  it('warns, without failing, when sites are open and no report is fresh', async () => {
    const world = healthyWorld();
    world.waits[city].rows = cityStale;
    // Noon: every County report is 3 hours old, every City report a day old.
    const results = await run(world, election, { now: oct22(12) });
    expect(results['wait reports county']).toEqual({
      name: 'wait reports county',
      status: 'warn',
      detail:
        `${countyWait.source}: not fresh. 0 of 21 open sites have a current count; ` +
        '0 reports match no site; newest report 2026-10-22 09:00 America/Chicago. ' +
        `Sites are open and none has reported in the last ${election.waitTimes.maxAgeMinutes} minutes.`,
    });
    expect(results['wait reports city'].status).toBe('warn');
    expect(results['wait reports city'].detail).toMatch(
      /^St\. Louis City .*: not fresh\. 7 of 8 rows .* 8 open now, 0 with a current count; newest report 2026-10-21 /,
    );
    expect(exitCodeFor(Object.values(results))).toBe(0);
    expect(warningLines(Object.values(results))).toEqual([
      `wait reports county: ${results['wait reports county'].detail}`,
      `wait reports city: ${results['wait reports city'].detail}`,
    ]);
  });

  it('warns when County reports match no early voting site (a join problem)', async () => {
    const world = healthyWorld();
    world.waits[county].rows = [
      { Creator: 'abs699boec', CreationDate: oct22(9), linecount: 4 },
      { Creator: 'abs699boec', CreationDate: oct22(8, 30), linecount: 2 },
      { Creator: 'someone', CreationDate: oct22(8, 45), linecount: 1 },
      ...countyFresh,
    ];
    const result = (await run(world))['wait reports county'];
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('3 reports match no site');
    expect(result.detail).toContain(
      `3 reports match no site's ${countyWait.pollsField} on the polls layer.`,
    );
    // Report senders are ArcGIS user names, which may be a person's: the
    // public run summary and issue get the count only.
    expect(result.detail).not.toContain('abs699boec');
    expect(result.detail).not.toContain('someone');
  });

  it('joins on the trimmed site key, as the app does', async () => {
    const world = healthyWorld();
    world.absentee = world.absentee.map((site) => ({
      ...site,
      [countyWait.pollsField]: ` ${site[countyWait.pollsField]} `,
    }));
    const result = (await run(world))['wait reports county'];
    expect(result.status).toBe('pass');
    expect(result.detail).toContain('19 of 21 open sites have a current count');
  });

  it('judges the reports at the time it reads them, not when the run started', async () => {
    const world = healthyWorld();
    const realNow = Date.now;
    // The run starts at 7 p.m. (closed); by the wait checks it is 9:00:30.
    let clock = oct22(19);
    Date.now = () => clock;
    try {
      world.fail = (url) => {
        if (url.href.includes(election.layers.countyBoundary)) clock = NOW;
        return null;
      };
      const results = await run(world, election, { now: undefined });
      expect(results['wait reports county'].detail).toMatch(/: fresh\. 19 of 21/);
    } finally {
      Date.now = realNow;
    }
  });

  it('warns when a City hours text cannot be read, which would hide its counts', async () => {
    const world = healthyWorld();
    world.waits[city].rows = cityFresh.map((row) =>
      row.name === 'Buder Library' ? { ...row, [cityWait.hoursField]: 'Weekdays 9 to 5' } : row,
    );
    const result = (await run(world))['wait reports city'];
    expect(result.status).toBe('warn');
    expect(result.detail).toContain(
      `1 row has ${cityWait.hoursField} text the app cannot read, so it never shows a count.`,
    );
  });

  it('skips the County reports when the absentee sites could not be read', async () => {
    const world = healthyWorld();
    world.absentee = [];
    const results = await run(world);
    expect(results['wait reports county']).toMatchObject({
      status: 'skip',
      detail: 'the absentee sites check failed',
    });
    // The City needs no County site.
    expect(results['wait reports city'].status).toBe('pass');
  });

  it('reports a time out of the Date range instead of crashing', async () => {
    const world = healthyWorld();
    world.waits[county].rows = [
      { Creator: 'abs601boec', CreationDate: 1e20, linecount: 1 },
      ...countyFresh,
    ];
    world.waits[city].rows = [{ ...cityFresh[0], [cityWait.timeField]: -1e17 }, ...cityFresh];
    const results = await run(world);
    expect(results['wait reports county'].detail).toContain(
      'newest report 2026-10-22 09:00 America/Chicago',
    );
    expect(results['wait reports city'].detail).toContain(
      'newest report 2026-10-22 08:10 America/Chicago',
    );
  });

  it('fails a row answer with a feature that has no fields, as the app does', async () => {
    const world = healthyWorld();
    world.fail = (url) =>
      url.href.startsWith(`${county}/query?`) ? json({ features: [{ attributes: null }] }) : null;
    const result = (await run(world))['wait reports county'];
    expect(result).toMatchObject({
      status: 'fail',
      detail: `waitTimes.county (${countyWait.layer}): a feature has no attributes`,
    });
  });

  it('names the config key and layer when the row query fails', async () => {
    const world = healthyWorld();
    world.fail = (url) =>
      url.href.startsWith(`${city}/query?`)
        ? json({ error: { code: 400, message: 'Invalid query' } })
        : null;
    expect((await run(world))['wait reports city']).toMatchObject({
      status: 'fail',
      detail:
        `waitTimes.city (${cityWait.layer}): ArcGIS error 400: Invalid query. ` +
        'Check the layer and its where clause in src/config/election.js.',
    });
  });

  // As in the app, "poll closed" counts only on a report from today: the
  // comment left from the evening before must not hide a quiet open site.
  it('ignores a closed comment on a report from an earlier day', async () => {
    const world = healthyWorld();
    const board = cityFresh.find((r) => r.name === 'St. Louis City Board of Elections');
    world.waits[city].rows = [
      {
        ...board,
        [cityWait.commentsField]: cityWait.closedText,
        [cityWait.timeField]: Date.UTC(2026, 9, 21, 22, 5),
      },
    ];
    const result = (await run(world))['wait reports city'];
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('1 open now, 0 with a current count');

    world.waits[city].rows = [{ ...board, [cityWait.commentsField]: cityWait.closedText }];
    const today = (await run(world))['wait reports city'];
    expect(today.status).toBe('pass');
    expect(today.detail).toContain('closed. No site is open now');
  });

  it('warns when the City filter finds no early voting rows at all', async () => {
    const world = healthyWorld();
    world.waits[city].rows = [];
    const result = (await run(world))['wait reports city'];
    expect(result.status).toBe('warn');
    expect(result.detail).toContain(
      `No row matches waitTimes.city.where (${cityWait.where}): check the filter`,
    );
  });

  it('asks nothing of a source the config turns off', async () => {
    const world = healthyWorld();
    const config = {
      ...election,
      waitTimes: { ...election.waitTimes, city: { ...cityWait, enabled: false } },
    };
    const results = await run(world, config);
    expect(results['wait layer city']).toBeUndefined();
    expect(results['wait reports city']).toBeUndefined();
    // The City's voting locations (#87) are the same layer's rows, so only
    // a wait query, one asking for the count, would be the wait check's.
    const waitQuery = (c) =>
      c.url.startsWith(city) &&
      (new URL(c.url).searchParams.get('outFields') ?? '').includes(cityWait.valueField);
    expect(world.calls.some(waitQuery)).toBe(false);
    expect(results['wait reports county'].status).toBe('pass');

    const off = healthyWorld();
    await run(off, { ...election, waitTimes: { ...election.waitTimes, enabled: false } });
    expect(off.calls.some((c) => c.url.startsWith(county) || waitQuery(c))).toBe(false);
  });
});

describe('report', () => {
  const r = (name, status) => ({ name, status, detail: `${name} detail` });
  const quiet = { log: () => {}, error: () => {} };
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'check-config-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes the warnings file on a failing run too, so the issue gets them', async () => {
    const file = path.join(dir, 'warnings.txt');
    const code = report([r('a', 'fail'), r('b', 'warn'), r('c', 'warn')], {
      warnings: file,
      ...quiet,
    });
    expect(code).toBe(1);
    expect(await readFile(file, 'utf8')).toBe('b: b detail\nc: c detail\n');
  });

  // The workflow lists the file only when it is not empty (`[ -s ]`).
  it('leaves an empty file when nothing warned', async () => {
    const file = path.join(dir, 'warnings.txt');
    expect(report([r('a', 'pass')], { warnings: file, ...quiet })).toBe(0);
    expect(await readFile(file, 'utf8')).toBe('');
  });

  it('prints one line per check and says how many warned', () => {
    const lines = [];
    const code = report([r('a', 'pass'), r('b', 'warn')], {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines).toEqual([
      'PASS a: a detail',
      'WARN b: b detail',
      '\nAll 2 checks passed, 1 with a warning.',
    ]);
  });
});

describe('exitCodeFor', () => {
  it('fails on a failure or a skip, never on a warning', () => {
    const r = (status) => ({ name: status, status, detail: '' });
    expect(exitCodeFor([r('pass'), r('warn')])).toBe(0);
    expect(exitCodeFor([r('pass'), r('skip')])).toBe(1);
    expect(exitCodeFor([r('warn'), r('fail')])).toBe(1);
  });
});

describe('the election window (scripts/electionWindow.mjs)', () => {
  // A made-up election, so this block holds no value from the real config.
  const config = {
    electionDate: '2030-11-05',
    timeZone: 'America/Chicago',
    earlyVoting: {
      schedules: {
        boe: [{ from: '2030-09-24', to: '2030-11-01', days: 'weekdays' }],
        abs: [{ from: '2030-10-22', to: '2030-11-04', days: 'daily' }],
      },
    },
  };
  const daily = { event: 'schedule', schedule: '0 12 * * *' };
  const waits = { event: 'schedule', schedule: WAITS_CRON };
  // Noon in Chicago on a date, in daylight or standard time.
  const noon = (date) => new Date(`${date}T17:30:00Z`);

  it('knows the early voting period from the first opening to the last closing', () => {
    expect(isEarlyVotingPeriod(config, noon('2030-09-23'))).toBe(false);
    expect(isEarlyVotingPeriod(config, noon('2030-09-24'))).toBe(true);
    expect(isEarlyVotingPeriod(config, noon('2030-11-04'))).toBe(true);
    // 11:30 p.m. on the last day in Chicago is already the next day in UTC.
    expect(isEarlyVotingPeriod(config, new Date('2030-11-05T05:30:00Z'))).toBe(true);
    expect(isEarlyVotingPeriod(config, noon('2030-11-05'))).toBe(false);
  });

  it('runs every check daily through Election Day, then nothing', () => {
    expect(windowFor(config, daily, noon('2030-11-05'))).toBe('full');
    expect(windowFor(config, daily, noon('2030-11-06'))).toBe('off');
  });

  it('runs the open-hours wait checks during early voting and on Election Day (#107)', () => {
    expect(windowFor(config, waits, noon('2030-09-23'))).toBe('off');
    expect(windowFor(config, waits, noon('2030-10-15'))).toBe('waits');
    expect(windowFor(config, waits, noon('2030-11-05'))).toBe('waits');
    expect(windowFor(config, waits, noon('2030-11-06'))).toBe('off');
  });

  it("knows Election Day in the config's time zone", () => {
    expect(isElectionDay(config, noon('2030-11-05'))).toBe(true);
    // 6 p.m. on Election Day in Chicago is already the next day in UTC.
    expect(isElectionDay(config, new Date('2030-11-06T00:00:00Z'))).toBe(true);
    expect(isElectionDay(config, noon('2030-11-04'))).toBe(false);
  });

  it('runs the evening wait check on Election Day only (#107)', () => {
    const evening = { event: 'schedule', schedule: ELECTION_DAY_CRON };
    // 00:00 UTC is 6 p.m. Central the day before, in standard time.
    expect(windowFor(config, evening, new Date('2030-11-06T00:00:00Z'))).toBe('waits');
    // 23:00 UTC is 6 p.m. in daylight time (Election Day 2027 is November 2,
    // before daylight time ends) and 5 p.m. in standard time.
    expect(ELECTION_DAY_CRON.split(' ')[1].split(',').sort()).toEqual(['0', '23']);
    expect(windowFor(config, evening, new Date('2030-11-05T23:00:00Z'))).toBe('waits');
    expect(windowFor(config, evening, new Date('2030-11-05T00:00:00Z'))).toBe('off');
    expect(windowFor(config, evening, new Date('2030-10-16T00:00:00Z'))).toBe('off');
  });

  it('always runs everything by hand', () => {
    expect(windowFor(config, { event: 'workflow_dispatch' }, noon('2031-01-01'))).toBe('full');
  });

  // The workflow decides the window before `npm ci`, so the module must load
  // with no node_modules at all.
  it('loads with no installed packages, with the real config', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'election-window-'));
    try {
      await cp(
        path.join(ROOT, 'scripts/electionWindow.mjs'),
        path.join(dir, 'scripts/electionWindow.mjs'),
      );
      await cp(path.join(ROOT, 'src/config/election.js'), path.join(dir, 'src/config/election.js'));
      await cp(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
      const out = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import election from './src/config/election.js';" +
            "import { windowFor } from './scripts/electionWindow.mjs';" +
            "console.log(windowFor(election, { event: 'workflow_dispatch' }));",
        ],
        { cwd: dir, encoding: 'utf8' },
      );
      expect(out.trim()).toBe('full');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('isPastElection', () => {
  // A made-up election, so this file holds no value from the real config.
  const config = { electionDate: '2030-11-05', timeZone: 'America/Chicago' };

  it('is false through Election Day in Chicago and true after', () => {
    expect(isPastElection(config, new Date('2030-10-21T12:00:00Z'))).toBe(false);
    // 11:30 p.m. on Election Day in Chicago is already November 6 in UTC.
    expect(isPastElection(config, new Date('2030-11-06T05:30:00Z'))).toBe(false);
    expect(isPastElection(config, new Date('2030-11-06T06:30:00Z'))).toBe(true);
  });
});

describe('parseArgs', () => {
  it('reads layer overrides and rejects anything else', () => {
    expect(parseArgs([], election)).toEqual({ layers: {} });
    expect(parseArgs(['--layer', 'precincts=a/FeatureServer/1'], election)).toEqual({
      layers: { precincts: 'a/FeatureServer/1' },
    });
    expect(() => parseArgs(['--layer', 'nope=a'], election)).toThrow(/No layer nope/);
    expect(() => parseArgs(['--layer'], election)).toThrow(/<key>=<path>/);
    expect(() => parseArgs(['--verbose'], election)).toThrow(/Unknown argument/);
  });

  it('reads --warnings as a file path', () => {
    expect(parseArgs(['--warnings', '/tmp/w.txt'], election)).toEqual({
      layers: {},
      warnings: '/tmp/w.txt',
    });
    expect(() => parseArgs(['--warnings'], election)).toThrow(/--warnings needs a file path/);
  });

  it('reads --ballot-sample as a count or all', () => {
    expect(parseArgs(['--ballot-sample', '25'], election)).toEqual({
      layers: {},
      ballotSample: 25,
    });
    expect(parseArgs(['--ballot-sample', 'all'], election).ballotSample).toBe(Infinity);
    for (const bad of [undefined, '0', '-3', '2.5', 'many']) {
      const args = bad === undefined ? ['--ballot-sample'] : ['--ballot-sample', bad];
      expect(() => parseArgs(args, election)).toThrow(/--ballot-sample needs/);
    }
  });
});

describe('data health workflow', () => {
  let workflow;
  beforeAll(async () => {
    workflow = parse(await readFile(path.join(ROOT, '.github/workflows/data-health.yml'), 'utf8'));
  });

  it('runs on a schedule and by hand, never on pull requests or pushes', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    // Daily, plus every 2 hours of the voting day for the wait checks (#106),
    // plus Election Day evening (#107).
    expect(workflow.on.schedule.map((s) => s.cron)).toEqual([
      '0 12 * * *',
      WAITS_CRON,
      ELECTION_DAY_CRON,
    ]);
  });

  // The window step runs before npm ci: check-config.mjs imports the app,
  // which imports packages, so the step must use the package-free module.
  it('decides the window with the package-free module, from the cron that fired', () => {
    const window = Object.values(workflow.jobs)[0].steps.find((s) => s.id === 'window');
    expect(window.run).toContain('./scripts/electionWindow.mjs');
    expect(window.run).not.toContain('check-config');
    expect(window.env.EVENT_SCHEDULE).toBe('${{ github.event.schedule }}');
  });

  it('runs only the config check on the open-hours runs, and lists its warnings', () => {
    const steps = Object.values(workflow.jobs)[0].steps;
    const file = '$RUNNER_TEMP/wait-warnings.txt';
    const config = steps.find((s) => s.id === 'config');
    expect(config.run).toContain(`--warnings "${file}"`);
    expect(config.if).not.toContain('mode');
    for (const id of ['geocoder', 'links']) {
      expect(steps.find((s) => s.id === id).if).toContain("steps.window.outputs.mode == 'full'");
    }
    const summary = steps.find(
      (s) => s.run?.includes(file) && s.run.includes('$GITHUB_STEP_SUMMARY'),
    );
    expect(summary.if).toContain('!cancelled()');
    expect(steps.indexOf(summary)).toBeGreaterThan(steps.indexOf(config));
    expect(steps.find((s) => s.if === 'failure()').run).toContain(file);
  });

  it('may write issues and nothing else, and does not keep the token on disk', () => {
    expect(workflow.permissions).toEqual({ contents: 'read', issues: 'write' });
    const checkout = Object.values(workflow.jobs)[0].steps.find((s) =>
      s.uses?.startsWith('actions/checkout'),
    );
    expect(checkout.with['persist-credentials']).toBe(false);
  });

  it('decides the election window before anything that can fail', () => {
    const steps = Object.values(workflow.jobs)[0].steps;
    const window = steps.findIndex((s) => s.id === 'window');
    expect(window).toBe(1);
    expect(steps[0].uses).toMatch(/^actions\/checkout@/);
    for (const step of steps.slice(window + 1, -1)) {
      expect(step.if).toContain("steps.window.outputs.active == 'true'");
    }
  });

  it('runs every live check and reports a failure as an issue', () => {
    const steps = Object.values(workflow.jobs)[0].steps;
    const runs = steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('node scripts/check-config.mjs');
    expect(runs).toContain('node scripts/check-geocoder.mjs');
    expect(runs).toContain('node scripts/check-content-links.mjs');
    // A timed-out step fails and still gets reported; a timed-out job does not.
    const live = steps.filter((s) => /^node scripts\/check-/.test(s.run ?? ''));
    expect(live).toHaveLength(3);
    for (const step of live) expect(step['timeout-minutes']).toBeGreaterThan(0);
    const total = live.reduce((sum, step) => sum + step['timeout-minutes'], 0);
    expect(Object.values(workflow.jobs)[0]['timeout-minutes']).toBeGreaterThan(total);
    const report = steps.find((s) => s.if === 'failure()');
    expect(report.run).toContain('gh issue create');
    expect(report.run).toContain('gh issue comment');
  });

  // A bot challenge is a skip, which never fails the run (#74): it must still
  // reach a person, on every run's summary and in any issue the run opens.
  it('lists the links the content check skipped on the summary and in the issue', () => {
    const steps = Object.values(workflow.jobs)[0].steps;
    const file = '$RUNNER_TEMP/skipped-links.txt';
    const links = steps.find((s) => s.id === 'links');
    expect(links.run).toContain(`--skipped "${file}"`);
    const summary = steps.find(
      (s) => s.run?.includes('$GITHUB_STEP_SUMMARY') && s.run.includes(file),
    );
    expect(summary).toBeDefined();
    expect(summary.if).toContain('!cancelled()');
    expect(steps.indexOf(summary)).toBeGreaterThan(steps.indexOf(links));
    const report = steps.find((s) => s.if === 'failure()');
    expect(report.run).toContain(file);
  });
});

describe('the City layers (#87)', () => {
  it('fails a City layer missing a field the app reads, and skips what needs it', async () => {
    const world = healthyWorld();
    const info = world.city.layers[cityConfig.layers.precincts];
    info.fields = info.fields.filter((f) => f.name !== cityConfig.precinctField);
    const results = await run(world);
    expect(results['city layer precincts']).toMatchObject({ status: 'fail' });
    expect(results['city layer precincts'].detail).toContain(
      `missing fields ${cityConfig.precinctField}`,
    );
    expect(results['city precincts'].status).toBe('skip');
    expect(results['city known points'].status).toBe('skip');
    expect(results['city voting locations'].status).toBe('pass');
  });

  it('fails a wrong City layer path, naming the config key', async () => {
    const config = {
      ...election,
      jurisdictions: {
        ...election.jurisdictions,
        city: { ...cityConfig, layers: { ...cityConfig.layers, sites: 'Nope/FeatureServer/0' } },
      },
    };
    const results = await run(healthyWorld(), config);
    expect(results['city layer sites'].status).toBe('fail');
    expect(results['city layer sites'].detail).toMatch(
      /^jurisdictions\.city\.layers\.sites \(Nope\/FeatureServer\/0\): /,
    );
    expect(results['city voting locations'].status).toBe('skip');
    expect(results['city early voting sites'].status).toBe('skip');
  });

  it('fails on a precinct ID the app cannot read, a repeated one, or a count out of range', async () => {
    const odd = healthyWorld();
    odd.city.precincts[3] = { [cityConfig.precinctField]: 'Ward 1 Precinct 4' };
    odd.city.precincts[4] = { ...odd.city.precincts[5] };
    const { status, detail } = (await run(odd))['city precincts'];
    expect(status).toBe('fail');
    expect(detail).toBe('"Ward 1 Precinct 4" is not a City precinct ID; W01P06 appears twice');

    // An ID the app's lookup by code would not find (#87 review).
    const loose = healthyWorld();
    loose.city.precincts[0] = { [cityConfig.precinctField]: 'W1P1' };
    expect((await run(loose))['city precincts'].detail).toBe('"W1P1" is not a City precinct ID');

    const few = healthyWorld();
    few.city.precincts = few.city.precincts.slice(0, 20);
    const { min, max } = CITY_PRECINCT_RANGE;
    expect((await run(few))['city precincts'].detail).toBe(`20 precincts, want ${min} to ${max}`);
  });

  it('fails when a City early voting site has no hours in the City config (#91)', async () => {
    const world = healthyWorld();
    const hours = hoursFor(world);
    const id = world.city.earlyVoting[2][cityConfig.siteFields.id];
    delete hours.sites[id];
    const results = await run(world, election, { cityEarlyVoting: hours });
    expect(results['city early voting sites']).toMatchObject({
      status: 'fail',
      detail: `${id} has no hours in earlyVoting.sites in src/config/cityResults.js`,
    });
  });

  it('fails when a site filter finds nothing, and warns when the list is not the expected count', async () => {
    const empty = healthyWorld();
    empty.city.polls = [];
    empty.city.earlyVoting = [];
    const results = await run(empty);
    expect(results['city voting locations']).toMatchObject({
      status: 'fail',
      detail: `pollsWhere (${cityConfig.pollsWhere}) returns no sites`,
    });
    expect(results['city early voting sites']).toMatchObject({
      status: 'fail',
      detail: `earlyVotingWhere (${cityConfig.earlyVotingWhere}) returns no sites`,
    });

    const more = healthyWorld();
    more.city.polls.push({ ...more.city.polls[0], [cityConfig.siteFields.id]: 'Board' });
    const { status, detail } = (await run(more))['city voting locations'];
    expect(status).toBe('warn');
    expect(detail).toContain(
      `${cityConfig.pollsListed + 1} Election Day sites, but the City Board lists ` +
        `${cityConfig.pollsListed} (pollsListed)`,
    );
  });

  it('fails a site with no id, name or address, or a repeated id', async () => {
    const world = healthyWorld();
    const { siteFields: f } = cityConfig;
    world.city.polls[0] = { ...world.city.polls[0], [f.name]: ' ' };
    world.city.polls[1] = { ...world.city.polls[1], [f.id]: world.city.polls[2][f.id] };
    const { status, detail } = (await run(world))['city voting locations'];
    expect(status).toBe('fail');
    expect(detail).toBe('Site_1: no name; Site_3: id repeated');
  });

  it('fails when City Hall is not in a City precinct, a ward or the outline, or a county point is', async () => {
    const world = healthyWorld();
    world.city.pointPrecinct = (lng) =>
      lng === KNOWN_POINTS[0].lng ? { [cityConfig.precinctField]: 'W 1 P 1' } : null;
    world.city.districts = () => [];
    world.city.inBoundary = (lng) => lng === KNOWN_POINTS[0].lng;
    const { status, detail } = (await run(world))['city known points'];
    expect(status).toBe('fail');
    expect(detail).toBe(
      `${CITY_KNOWN_POINT.name}: no City precinct; ${CITY_KNOWN_POINT.name}: no ward; ` +
        `${CITY_KNOWN_POINT.name}: outside the City outline; ` +
        `${KNOWN_POINTS[0].name}: in City precinct W 1 P 1; ` +
        `${KNOWN_POINTS[0].name}: inside the City outline`,
    );
  });

  it('asks the City layers only for the fields the app reads, never *', async () => {
    const world = healthyWorld();
    await run(world);
    expect(world.cityQueries.length).toBeGreaterThan(0);
    for (const params of world.cityQueries) expect(params.get('outFields')).not.toBe('*');
  });
});

// The app asks ArcGIS for named fields (#27), and a query naming a field the
// layer lacks fails outright, so the health check must check every one.
describe('the fields the app asks for', () => {
  it('are all checked by the health check, County and City (#87)', () => {
    const city = expectedCityLayers(election);
    expect(city.precincts.fields).toEqual(expect.arrayContaining([...CITY_PRECINCT_FIELDS]));
    expect(city.sites.fields).toEqual(expect.arrayContaining([...CITY_POLL_FIELDS]));
    expect(city.districts.fields).toEqual(expect.arrayContaining([...CITY_DISTRICT_FIELDS]));
  });

  it('are all checked by the health check', () => {
    const want = expectedLayers(election);
    expect(want.precincts.fields).toEqual(expect.arrayContaining([...PRECINCT_FIELDS]));
    expect(want.polls.fields).toEqual(expect.arrayContaining([...POLL_FIELDS]));
    expect(want.pollRooms.fields).toEqual([...ROOM_FIELDS]);
  });
});
