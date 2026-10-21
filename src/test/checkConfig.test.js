// Runs the data health check (scripts/check-config.mjs) against a stubbed
// ArcGIS service, healthy and broken in each way the check must catch.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import election from '../config/election.js';
import {
  BALLOT_SAMPLE_SIZE,
  KNOWN_POINTS,
  OUTSIDE_POINT,
  expectedLayers,
  isPastElection,
  parseArgs,
  randomSample,
  runHealthCheck,
} from '../../scripts/check-config.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const councilField = election.districtFields.find((d) => d.key === 'countyCouncil').field;

const ballotUrl = (i) =>
  `https://stlouiscovotes.maps.arcgis.com/sharing/rest/content/items/${i
    .toString(16)
    .padStart(32, '0')}/data`;

// A healthy world: 1000 precincts, 990 In Election with their own ballot link.
function healthyWorld() {
  const precincts = Array.from({ length: 1000 }, (_, i) => {
    const code = `AB${String(i).padStart(3, '0')}`;
    return i < 990
      ? {
          precinct: code,
          in_election: 'In Election',
          html: `Sample Ballot: <a href=${ballotUrl(i + 1)}>AB-${i}.pdf</a>`,
        }
      : { precinct: code, in_election: 'Nonresidential Precinct', html: 'No ballot here.' };
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
    absentee: [
      { loc: '019', name: 'BOARD', abs_type: 'boe' },
      { loc: '172', name: 'LIBRARY', abs_type: 'abs' },
    ],
    // By default every known point is where it should be.
    pointPrecinct: (lng, lat) => {
      const known = KNOWN_POINTS.find((p) => p.lng === lng && p.lat === lat);
      return known ? { precinct: 'AB001', [councilField]: known.council } : null;
    },
    inBoundary: (lng, lat) => KNOWN_POINTS.some((p) => p.lng === lng && p.lat === lat),
    ballot: () => ({ status: 200, type: 'application/pdf' }),
    calls: [],
  };
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
      const { status, type } = world.ballot(url.href);
      return new Response(null, { status, headers: type ? { 'content-type': type } : {} });
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
      expect(params.get('where')).toBe(election.absenteeWhere);
      return features(world.absentee);
    }
    const [lng, lat] = geometry.split(',').map(Number);
    return features(world.inBoundary(lng, lat) ? [{ OBJECTID: 1 }] : []);
  };
}

async function run(world, config = election) {
  const results = await runHealthCheck(config, {
    fetch: stubFetch(world),
    sample: (items, count) => items.slice(0, count),
    retryDelayMs: 0,
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
      'precinct count',
      'sample ballot links',
      'sample ballot PDFs',
      'absentee sites',
      'known points',
    ]);
    expect(results['precinct count'].detail).toBe('1000 precincts, 990 In Election');
    expect(results['sample ballot PDFs'].detail).toMatch(/^5 of 5/);
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
    expect(detail).toMatch(/^4 precincts fail/);
    expect(detail).toContain('AB000: no valid link');
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
          : { status: 200, type: 'application/pdf' };
    const results = await run(world);
    const heads = world.calls.filter((c) => c.method === 'HEAD');
    expect(heads).toHaveLength(BALLOT_SAMPLE_SIZE);
    expect(results['sample ballot PDFs'].detail).toBe(
      `2 of 5: ${ballotUrl(2)}: Content-Type text/html; ${ballotUrl(3)}: HTTP 404`,
    );
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

describe('randomSample', () => {
  it('picks distinct items, at most the count', () => {
    const picked = randomSample(['a', 'b', 'c', 'd', 'e', 'f'], 5);
    expect(new Set(picked).size).toBe(5);
    expect(randomSample(['a'], 5)).toEqual(['a']);
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
});

describe('data health workflow', () => {
  let workflow;
  beforeAll(async () => {
    workflow = parse(await readFile(path.join(ROOT, '.github/workflows/data-health.yml'), 'utf8'));
  });

  it('runs on a schedule and by hand, never on pull requests or pushes', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(workflow.on.schedule).toHaveLength(1);
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

  it('runs both live checks and reports a failure as an issue', () => {
    const steps = Object.values(workflow.jobs)[0].steps;
    const runs = steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('node scripts/check-config.mjs');
    expect(runs).toContain('node scripts/check-geocoder.mjs');
    const report = steps.find((s) => s.if === 'failure()');
    expect(report.run).toContain('gh issue create');
    expect(report.run).toContain('gh issue comment');
  });
});
