// Checks that the live layers in the election config still look the way the
// app expects. Run it before each election and on a schedule while voting is
// open (.github/workflows/data-health.yml). Everything comes from
// src/config/election.js, so it works again next election.
//
// Usage: node scripts/check-config.mjs [--layer <key>=<path>]...
//   --layer replaces one of the config's layer paths for this run, for example
//   to try a new layer before editing the config.
// Prints one PASS, FAIL or SKIP line per check and exits 1 when any check fails.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import election from '../src/config/election.js';
import { PRECINCT_CODE } from '../src/data/arcgis.js';
import { parseSampleBallot } from '../src/data/sampleBallot.js';

/** A sane number of precincts. 1213 for November 2026. */
export const PRECINCT_RANGE = { min: 900, max: 1600 };

/** How many sample ballot links get a HEAD request. */
export const BALLOT_SAMPLE_SIZE = 5;

/** Fields the app reads from the polls layer, and the boundary layer's query field. */
const POLL_FIELDS = ['loc', 'name', 'address', 'zipcode', 'abs_type', 'notes_abs', 'inline'];
const BOUNDARY_FIELDS = ['OBJECTID'];

// One polling place at a public building per County Council district, from
// docs/raw/fixtures/polls.json. Council districts change only with
// redistricting; when the county redraws them, update this table.
export const KNOWN_POINTS = [
  {
    name: 'Berkeley City Hall',
    lat: 38.7504,
    lng: -90.33064,
    council: 'County Council District 1',
  },
  {
    name: 'Bridgeton Trails Branch Library',
    lat: 38.74914,
    lng: -90.43097,
    council: 'County Council District 2',
  },
  {
    name: 'Clark Family Branch Library',
    lat: 38.63013,
    lng: -90.40503,
    council: 'County Council District 3',
  },
  {
    name: 'Black Jack City Hall',
    lat: 38.79486,
    lng: -90.26165,
    council: 'County Council District 4',
  },
  {
    name: 'Brentwood Recreation Center',
    lat: 38.61599,
    lng: -90.34968,
    council: 'County Council District 5',
  },
  {
    name: 'Bierbaum Elementary School',
    lat: 38.53024,
    lng: -90.31014,
    council: 'County Council District 6',
  },
  {
    name: 'Chesterfield City Hall',
    lat: 38.66197,
    lng: -90.56431,
    council: 'County Council District 7',
  },
];

/** A point in St. Louis City, outside the county: no precinct, outside the boundary. */
export const OUTSIDE_POINT = { name: 'Gateway Arch, St. Louis City', lat: 38.6247, lng: -90.1848 };

/** What each configured layer must look like. */
export function expectedLayers(config) {
  const precinctFields = [
    'precinct',
    'in_election',
    'html',
    config.congressionalField,
    ...config.districtFields.map((d) => d.field),
  ];
  return {
    precincts: { geometryType: 'esriGeometryPolygon', fields: [...new Set(precinctFields)] },
    polls: { geometryType: 'esriGeometryPoint', fields: POLL_FIELDS },
    countyBoundary: { geometryType: 'esriGeometryPolygon', fields: BOUNDARY_FIELDS },
  };
}

class CheckError extends Error {
  name = 'CheckError';

  constructor(message, { transient = false } = {}) {
    super(message);
    this.transient = transient;
  }
}

// One request: GET JSON or HEAD, with a timeout. ArcGIS reports errors as HTTP
// 200 with an error body, so that is checked here too.
async function requestOnce(fetchImpl, url, { method = 'GET', timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(url, { method, signal: controller.signal });
    } catch (error) {
      const why = controller.signal.aborted ? `no answer in ${timeoutMs} ms` : error.message;
      throw new CheckError(`request failed: ${why}`, { transient: true });
    }
    if (!res.ok) {
      throw new CheckError(`HTTP ${res.status}`, {
        transient: res.status === 429 || res.status >= 500,
      });
    }
    if (method === 'HEAD') return res;
    let body;
    try {
      body = await res.json();
    } catch (error) {
      if (error instanceof SyntaxError) throw new CheckError('the response is not JSON');
      throw new CheckError(`request failed: ${error.message}`, { transient: true });
    }
    if (body === null || typeof body !== 'object') {
      throw new CheckError('the response is not a JSON object');
    }
    if (body.error) {
      const { code, message, details } = body.error;
      const text =
        [...new Set([message, ...(details ?? [])].filter(Boolean))].join('; ') || 'no message';
      throw new CheckError(`ArcGIS error ${code ?? ''}: ${text}`.replace(' :', ':'), {
        transient: code === 429 || code >= 500,
      });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs every check against the layers in `config`.
 * @param {object} config An election config, like src/config/election.js.
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] The fetch to use.
 * @param {(items: string[], count: number) => string[]} [options.sample] Picks the
 *   ballot links to HEAD; random by default.
 * @param {number} [options.retryDelayMs] The wait before a retry, times the attempt.
 * @param {number} [options.timeoutMs] How long one request may take.
 * @param {number} [options.attempts] How many tries a transient failure gets.
 * @returns {Promise<{ name: string, status: 'pass' | 'fail' | 'skip', detail: string }[]>}
 */
export async function runHealthCheck(
  config,
  {
    fetch: fetchImpl = globalThis.fetch,
    sample = randomSample,
    retryDelayMs = 2000,
    timeoutMs = 15000,
    attempts = 3,
  } = {},
) {
  const results = [];
  const record = (name, status, detail) => results.push({ name, status, detail });

  async function request(url, options = {}) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await requestOnce(fetchImpl, url, { ...options, timeoutMs });
      } catch (error) {
        if (!(error instanceof CheckError) || !error.transient || attempt >= attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  const layerUrl = (key) => `${config.serviceRoot}/${config.layers[key]}`;
  // A query answer must list its features, even when the list is empty: an
  // answer without one is broken, not an empty result.
  async function query(key, params) {
    const body = await request(
      `${layerUrl(key)}/query?${new URLSearchParams({ f: 'json', ...params })}`,
    );
    if (!Array.isArray(body?.features)) throw new CheckError('the response has no features list');
    return body;
  }
  const pointQuery = (key, { lat, lng }, outFields) =>
    query(key, {
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields,
      returnGeometry: 'false',
    });

  // Runs one check. `body` returns a detail line or throws a CheckError; any
  // other error is a bug in this script and is not caught.
  async function check(name, body) {
    try {
      record(name, 'pass', await body());
      return true;
    } catch (error) {
      if (!(error instanceof CheckError)) throw error;
      record(name, 'fail', error.message);
      return false;
    }
  }

  // 1. Each layer answers, with the geometry and fields the app reads.
  const layerOk = {};
  for (const [key, want] of Object.entries(expectedLayers(config))) {
    const where = `layers.${key} (${config.layers[key]})`;
    layerOk[key] = await check(`layer ${key}`, async () => {
      let info;
      try {
        info = await request(`${layerUrl(key)}?f=json`);
      } catch (error) {
        if (!(error instanceof CheckError)) throw error;
        // An outage is not the config's fault; anything else may be.
        const hint = error.transient ? '' : '. Check this path in src/config/election.js.';
        throw new CheckError(`${where}: ${error.message}${hint}`);
      }
      if (info.geometryType !== want.geometryType) {
        throw new CheckError(
          `${where}: geometry is ${info.geometryType ?? 'missing'}, want ${want.geometryType}. ` +
            'Is this the right layer?',
        );
      }
      const fields = Array.isArray(info.fields) ? info.fields : [];
      const have = new Set(fields.map((f) => f?.name));
      const missing = want.fields.filter((f) => !have.has(f));
      if (missing.length) {
        throw new CheckError(`${where}: missing fields ${missing.join(', ')}`);
      }
      return `${where}: ${info.name ?? 'unnamed'}, expected fields present (${want.fields.length})`;
    });
  }
  const skip = (name, layer) => record(name, 'skip', `the ${layer} layer check failed`);

  // 2. Precinct count, and 3. every precinct's sample ballot field.
  const ballotUrls = [];
  if (layerOk.precincts) {
    let precincts;
    const countOk = await check('precinct count', async () => {
      const body = await query('precincts', {
        where: '1=1',
        outFields: 'precinct,in_election,html',
        returnGeometry: 'false',
        orderByFields: 'precinct',
      });
      if (body.exceededTransferLimit) {
        throw new CheckError('too many precincts for one request: page the query');
      }
      precincts = (body.features ?? []).map((f) => f?.attributes ?? {});
      const inElection = precincts.filter((p) => p.in_election === 'In Election').length;
      const { min, max } = PRECINCT_RANGE;
      if (precincts.length < min || precincts.length > max) {
        throw new CheckError(`${precincts.length} precincts, want ${min} to ${max}`);
      }
      if (inElection === 0) throw new CheckError('no precinct is In Election');
      return `${precincts.length} precincts, ${inElection} In Election`;
    });

    if (countOk) {
      await check('sample ballot links', async () => {
        const failures = [];
        const messages = new Set();
        for (const { precinct, in_election: status, html } of precincts) {
          const result = parseSampleBallot(html);
          if (status === 'In Election') {
            if ((String(html ?? '').match(/href/gi) ?? []).length > 1) {
              failures.push(`${precinct}: several links`);
            } else if (!('url' in result)) {
              failures.push(`${precinct}: no valid link in ${JSON.stringify(html)}`);
            } else if (!result.fileName) {
              failures.push(`${precinct}: link has no file name`);
            } else if (ballotUrls.includes(result.url)) {
              failures.push(`${precinct}: link shared with another precinct`);
            } else {
              ballotUrls.push(result.url);
            }
          } else if ('url' in result || !result.message) {
            failures.push(
              `${precinct} (${status}): expected a message, got ${JSON.stringify(result)}`,
            );
          } else {
            messages.add(result.message);
          }
        }
        if (failures.length) {
          const shown = failures.slice(0, 20).join('; ');
          const more = failures.length > 20 ? `; and ${failures.length - 20} more` : '';
          throw new CheckError(`${failures.length} precincts fail: ${shown}${more}`);
        }
        // Entities are not decoded; flag any so a change in the data is noticed.
        const entities = [...messages].some((m) => m.includes('&'))
          ? ' (a message contains &: check for HTML entities)'
          : '';
        return `${ballotUrls.length} distinct links, ${messages.size} distinct messages${entities}`;
      });
    } else {
      record('sample ballot links', 'skip', 'the precinct count check failed');
    }

    // 4. A few of the links really serve a PDF.
    if (ballotUrls.length) {
      await check('sample ballot PDFs', async () => {
        const picked = sample(ballotUrls, BALLOT_SAMPLE_SIZE);
        const bad = [];
        for (const url of picked) {
          try {
            const res = await request(url, { method: 'HEAD' });
            const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
            if (type !== 'application/pdf') bad.push(`${url}: Content-Type ${type || 'missing'}`);
          } catch (error) {
            if (!(error instanceof CheckError)) throw error;
            bad.push(`${url}: ${error.message}`);
          }
        }
        if (bad.length)
          throw new CheckError(`${bad.length} of ${picked.length}: ${bad.join('; ')}`);
        return `${picked.length} of ${picked.length} answer HEAD with application/pdf`;
      });
    } else {
      record('sample ballot PDFs', 'skip', 'no valid sample ballot links to try');
    }
  } else {
    for (const name of ['precinct count', 'sample ballot links', 'sample ballot PDFs']) {
      skip(name, 'precincts');
    }
  }

  // 5. The absentee filter finds sites, and each kind of site has hours.
  if (layerOk.polls) {
    await check('absentee sites', async () => {
      const body = await query('polls', {
        where: config.absenteeWhere,
        outFields: 'loc,name,abs_type',
        returnGeometry: 'false',
      });
      const sites = (body.features ?? []).map((f) => f?.attributes ?? {});
      if (sites.length === 0) {
        throw new CheckError(`absenteeWhere (${config.absenteeWhere}) returns no sites`);
      }
      const types = new Set(sites.map((s) => s.abs_type));
      const scheduled = config.earlyVoting?.schedules ?? {};
      const noHours = [...types].filter((t) => !scheduled[t]?.length);
      if (noHours.length) {
        throw new CheckError(
          `abs_type ${noHours.map((t) => JSON.stringify(t)).join(', ')} has no hours in ` +
            'earlyVoting.schedules',
        );
      }
      return `${sites.length} sites (${[...types].sort().join(', ')})`;
    });
  } else {
    skip('absentee sites', 'polls');
  }

  // 6. Known points land in a precinct in the right council district, inside
  // the county; a point in St. Louis City lands in neither.
  const councilField = config.districtFields.find((d) => d.key === 'countyCouncil')?.field;
  if (layerOk.precincts && layerOk.countyBoundary) {
    await check('known points', async () => {
      const bad = [];
      for (const point of KNOWN_POINTS) {
        const precinct = (await pointQuery('precincts', point, `precinct,${councilField}`))
          .features?.[0]?.attributes;
        const inside = (await pointQuery('countyBoundary', point, 'OBJECTID')).features?.length > 0;
        if (!precinct) bad.push(`${point.name}: no precinct`);
        else if (!PRECINCT_CODE.test(String(precinct.precinct).trim())) {
          bad.push(`${point.name}: bad precinct code ${JSON.stringify(precinct.precinct)}`);
        } else if (precinct[councilField] !== point.council) {
          bad.push(`${point.name}: ${precinct[councilField]}, want ${point.council}`);
        }
        if (!inside) bad.push(`${point.name}: outside the county boundary`);
      }
      const outsidePrecinct = (await pointQuery('precincts', OUTSIDE_POINT, 'precinct')).features
        ?.length;
      const outsideBoundary = (await pointQuery('countyBoundary', OUTSIDE_POINT, 'OBJECTID'))
        .features?.length;
      if (outsidePrecinct) bad.push(`${OUTSIDE_POINT.name}: has a precinct`);
      if (outsideBoundary) bad.push(`${OUTSIDE_POINT.name}: inside the county boundary`);
      if (bad.length) throw new CheckError(bad.join('; '));
      return `${KNOWN_POINTS.length} council districts each return a precinct; ${OUTSIDE_POINT.name} returns none`;
    });
  } else {
    skip('known points', layerOk.precincts ? 'countyBoundary' : 'precincts');
  }

  return results;
}

/** Picks up to `count` items at random, without repeats. */
export function randomSample(items, count) {
  const pool = [...items];
  const picked = [];
  while (picked.length < count && pool.length) {
    picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  }
  return picked;
}

/**
 * Whether the election is over: today in the config's time zone is after
 * Election Day.
 * @param {{ electionDate: string, timeZone: string }} config
 * @param {Date} [now]
 */
export function isPastElection(config, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return today > config.electionDate;
}

/**
 * Reads the command line.
 * @param {string[]} args
 * @param {object} config The election config, to check layer keys against.
 * @returns {{ layers: Record<string, string> }}
 */
export function parseArgs(args, config) {
  const layers = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '--layer') throw new Error(`Unknown argument ${args[i]}`);
    const match = /^([A-Za-z]+)=(\S+)$/.exec(args[i + 1] ?? '');
    if (!match) throw new Error('--layer needs <key>=<path>');
    const [, key, value] = match;
    if (!Object.hasOwn(config.layers, key)) {
      throw new Error(`No layer ${key}; the config has ${Object.keys(config.layers).join(', ')}`);
    }
    layers[key] = value;
    i += 1;
  }
  return { layers };
}

async function main(args) {
  let layers;
  try {
    ({ layers } = parseArgs(args, election));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const config = { ...election, layers: { ...election.layers, ...layers } };
  console.log(`Checking ${config.electionName} layers under ${config.serviceRoot}`);
  const results = await runHealthCheck(config);
  for (const { name, status, detail } of results) {
    console.log(`${status.toUpperCase().padEnd(4)} ${name}: ${detail}`);
  }
  const failed = results.filter((r) => r.status !== 'pass');
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} checks did not pass.`);
    return 1;
  }
  console.log(`\nAll ${results.length} checks passed.`);
  return 0;
}

// import.meta.url has symlinks resolved and argv[1] does not, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
