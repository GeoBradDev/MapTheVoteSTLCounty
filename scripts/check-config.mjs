// Checks that the live layers in the election config still look the way the
// app expects. Run it before each election and on a schedule while voting is
// open (.github/workflows/data-health.yml). Everything comes from
// src/config/election.js, so it works again next election.
//
// Usage: node scripts/check-config.mjs [--layer <key>=<path>]... [--ballot-sample <n|all>]
//          [--warnings <file>]
//   --layer replaces one of the config's layer paths for this run, for example
//   to try a new layer before editing the config.
//   --ballot-sample sets how many sample ballot links get a HEAD request
//   (BALLOT_SAMPLE_SIZE by default); `all` checks every link.
//   --warnings writes each WARN line to <file> too, for the workflow's summary.
// Prints one PASS, FAIL, SKIP or WARN line per check and exits 1 when any
// check fails or is skipped. A WARN never changes the exit code: it is
// something a person should look at, like early voting sites open with no
// fresh line count, that is not proof the config is wrong.

import { realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cityResults from '../src/config/cityResults.js';
import election, { congressionalMap } from '../src/config/election.js';
import { PRECINCT_CODE } from '../src/data/arcgis.js';
import { cityPrecinctCode } from '../src/data/cityPrecinctCode.js';
import { fileNameMatchesPrecinct, parseSampleBallot } from '../src/data/sampleBallot.js';
import { parseCityHours, selectCityWaits, selectCountyWaits } from '../src/data/waitTimes.js';
import { earlyVotingStatus, zonedNow } from '../src/features/lookup/earlyVoting.js';
import { isPastElection } from './electionWindow.mjs';

export { isPastElection };

/** A sane number of precincts. 1213 for November 2026. */
export const PRECINCT_RANGE = { min: 900, max: 1600 };

/**
 * How many sample ballot links get a HEAD request on a default run (#111). The
 * "sample ballot links" check already compares every link's text with its
 * precinct; this sample catches the served files drifting from that text, which
 * a re-publish would do to many at once. Checking all of them daily would load
 * the county's portal and outrun the workflow's step limit in the worst case,
 * so a full sweep is a manual `--ballot-sample all`.
 */
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

/** A sane number of City precincts (#87). 207 for November 2026. */
export const CITY_PRECINCT_RANGE = { min: 150, max: 300 };

/** City Hall, 1200 Market St: in a City precinct, a ward and the City outline. */
export const CITY_KNOWN_POINT = {
  name: 'City Hall, St. Louis City',
  lat: 38.62741,
  lng: -90.19843,
};

/**
 * What each City layer must look like (#87): the fields src/data/cityArcgis.js
 * reads. The voting locations layer is asked by its own filters, so a filter
 * field it lost fails the site checks instead.
 */
export function expectedCityLayers(config) {
  const city = config.jurisdictions.city;
  return {
    precincts: { geometryType: 'esriGeometryPolygon', fields: [city.precinctField] },
    districts: {
      geometryType: 'esriGeometryPolygon',
      fields: Object.values(city.districtLayerFields),
    },
    sites: { geometryType: 'esriGeometryPoint', fields: Object.values(city.siteFields) },
    boundary: { geometryType: 'esriGeometryPolygon', fields: BOUNDARY_FIELDS },
  };
}

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
    // The wait time join fields (#103, #107): the County's early voting and
    // Election Day reports name a site by them.
    polls: {
      geometryType: 'esriGeometryPoint',
      fields: [
        ...new Set([
          ...POLL_FIELDS,
          config.waitTimes.county.pollsField,
          ...(config.waitTimes.county.electionDay
            ? [config.waitTimes.county.electionDay.pollsField]
            : []),
        ]),
      ],
    },
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
 * @param {<T>(items: T[], count: number) => T[]} [options.sample] Picks the
 *   ballot links to HEAD; random by default.
 * @param {number} [options.ballotSample] How many ballot links to HEAD;
 *   `Infinity` for every one.
 * @param {number} [options.retryDelayMs] The wait before a retry, times the attempt.
 * @param {number} [options.timeoutMs] How long one request may take.
 * @param {number} [options.attempts] How many tries a transient failure gets.
 * @param {Date | number} [options.now] The time the wait time checks judge
 *   open hours and freshness at; by default, the time they read the reports.
 * @returns {Promise<{ name: string, status: 'pass' | 'fail' | 'skip' | 'warn', detail: string }[]>}
 */
export async function runHealthCheck(
  config,
  {
    fetch: fetchImpl = globalThis.fetch,
    sample = randomSample,
    ballotSample = BALLOT_SAMPLE_SIZE,
    retryDelayMs = 2000,
    timeoutMs = 15000,
    attempts = 3,
    now: fixedNow,
    // The City's early voting hours (src/config/cityResults.js, #91).
    cityEarlyVoting = cityResults.earlyVoting,
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

  // Runs one check. `body` returns a detail line, or `{ warn }` for a detail
  // line that is a warning, or throws a CheckError; any other error is a bug
  // in this script and is not caught.
  async function check(name, body) {
    try {
      const detail = await body();
      if (typeof detail === 'object' && detail !== null) record(name, 'warn', detail.warn);
      else record(name, 'pass', detail);
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
  /** @type {{ precinct: string, url: string }[]} */
  const ballotLinks = [];
  const ballotUrls = new Set();
  if (layerOk.precincts) {
    let precincts;
    const countOk = await check('precinct count', async () => {
      const body = await query('precincts', {
        where: '1=1',
        outFields: `precinct,in_election,html,${config.congressionalField}`,
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
            } else if (ballotUrls.has(result.url)) {
              failures.push(`${precinct}: link shared with another precinct`);
            } else {
              ballotUrls.add(result.url);
              ballotLinks.push({ precinct, url: result.url });
              // The app shows a link only when its file name names the
              // precinct (#82), so a swapped link reaches no voter: report it.
              if (!fileNameMatchesPrecinct(result.fileName, precinct)) {
                failures.push(`${precinct}: link names ${result.fileName}, not this precinct`);
              }
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
        return `${ballotUrls.size} distinct links, ${messages.size} distinct messages${entities}`;
      });
    } else {
      record('sample ballot links', 'skip', 'the precinct count check failed');
    }

    // 4. A few of the links really serve a PDF, named for their precinct (#111):
    // the link text can name the precinct while the URL, an opaque portal item
    // ID, serves another precinct's ballot.
    if (ballotLinks.length) {
      await check('sample ballot PDFs', async () => {
        const picked = sample(ballotLinks, ballotSample);
        const bad = [];
        for (const { precinct, url } of picked) {
          const where = `${precinct} (${url})`;
          try {
            const res = await request(url, { method: 'HEAD' });
            const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
            const fileName = contentDispositionFileName(res.headers.get('content-disposition'));
            if (type !== 'application/pdf') {
              bad.push(`${where}: Content-Type ${type || 'missing'}`);
            } else if (!fileName) {
              bad.push(`${where}: no file name in Content-Disposition`);
            } else if (!fileNameMatchesPrecinct(fileName, precinct)) {
              bad.push(`${where}: the PDF is named ${fileName}`);
            }
          } catch (error) {
            if (!(error instanceof CheckError)) throw error;
            bad.push(`${where}: ${error.message}`);
          }
        }
        if (bad.length)
          throw new CheckError(`${bad.length} of ${picked.length}: ${bad.join('; ')}`);
        return `${picked.length} of ${picked.length} answer HEAD with a PDF named for their precinct`;
      });
    } else {
      record('sample ballot PDFs', 'skip', 'no valid sample ballot links to try');
    }

    // 5. Every precinct is in a district on the congressional map in effect,
    // `congressionalMap` in src/config/election.js (#150).
    if (countOk) {
      await check('congressional districts', async () => {
        const { year, districts } = congressionalMap;
        const want = new Map(
          districts.map((d) => [`US Representative District ${d} (${year})`, d]),
        );
        const bad = [];
        const counts = {};
        for (const p of precincts) {
          const value = p[config.congressionalField];
          const district = typeof value === 'string' ? want.get(value.trim()) : undefined;
          if (!district) {
            bad.push(`${p.precinct}: ${value === undefined ? 'undefined' : JSON.stringify(value)}`);
          } else {
            counts[district] = (counts[district] ?? 0) + 1;
          }
        }
        if (bad.length) {
          const shown = bad.slice(0, 20).join('; ');
          const more = bad.length > 20 ? `; and ${bad.length - 20} more` : '';
          throw new CheckError(`${bad.length} precincts fail: ${shown}${more}`);
        }
        const list = districts.map((d) => `District ${d} (${counts[d] ?? 0})`).join(', ');
        return `${precincts.length} precincts on the ${year} map: ${list}`;
      });
    } else {
      record('congressional districts', 'skip', 'the precinct count check failed');
    }
  } else {
    for (const name of [
      'precinct count',
      'sample ballot links',
      'sample ballot PDFs',
      'congressional districts',
    ]) {
      skip(name, 'precincts');
    }
  }

  // 6. The absentee filter finds sites, and each kind of site has hours.
  /** The absentee sites' attributes, kept for the County wait reports check. */
  let absenteeSites = null;
  const waitTimes = config.waitTimes;
  if (layerOk.polls) {
    await check('absentee sites', async () => {
      const body = await query('polls', {
        where: config.absenteeWhere,
        outFields: ['loc', 'name', 'abs_type', waitTimes?.county?.pollsField]
          .filter(Boolean)
          .join(','),
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
      // Trimmed like the app's own rows (normalize in src/data/arcgis.js), so
      // the County join below matches what the app matches.
      absenteeSites = sites.map((site) =>
        Object.fromEntries(
          Object.entries(site).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
        ),
      );
      return `${sites.length} sites (${[...types].sort().join(', ')})`;
    });
  } else {
    skip('absentee sites', 'polls');
  }

  // 7. Known points land in a precinct in the right council district, inside
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

  // 8. The wait time layers (#106, #132): each answers with the fields the app
  // reads, then whether its board's reports are fresh. Fields, not rows, decide
  // pass or fail: the County view is empty whenever its sites are closed.
  // Open sites with nothing fresh, or County reports that match no site, are
  // warnings for a person to look at.
  if (waitTimes?.enabled) {
    const sources = Object.entries(WAIT_SOURCES).filter(([key]) => waitTimes[key]?.enabled);
    const waitLayerOk = {};
    for (const [key, { extraFields }] of sources) {
      const source = waitTimes[key];
      const where = `waitTimes.${key} (${source.layer})`;
      const want = [source.siteField, source.valueField, source.timeField];
      for (const field of extraFields) want.push(source[field]);
      waitLayerOk[key] = await check(`wait layer ${key}`, async () => {
        let info;
        try {
          info = await request(`${source.serviceRoot}/${source.layer}?f=json`);
        } catch (error) {
          if (!(error instanceof CheckError)) throw error;
          const hint = error.transient ? '' : '. Check this path in src/config/election.js.';
          throw new CheckError(`${where}: ${error.message}${hint}`);
        }
        const have = new Set((Array.isArray(info.fields) ? info.fields : []).map((f) => f?.name));
        const missing = want.filter((f) => !have.has(f));
        if (missing.length) throw new CheckError(`${where}: missing fields ${missing.join(', ')}`);
        return `${where}: ${info.name ?? 'unnamed'}, expected fields present (${want.length})`;
      });
    }

    // The rows of one wait layer. Any failure names the config key and layer;
    // a feature without fields fails, as it fails every load in the app.
    const waitRows = async (key, outFields) => {
      const source = waitTimes[key];
      const where = `waitTimes.${key} (${source.layer})`;
      let body;
      try {
        body = await request(
          `${source.serviceRoot}/${source.layer}/query?${new URLSearchParams({
            f: 'json',
            where: source.where,
            outFields: outFields.join(','),
            orderByFields: `${source.timeField} DESC`,
            returnGeometry: 'false',
          })}`,
        );
      } catch (error) {
        if (!(error instanceof CheckError)) throw error;
        const hint = error.transient
          ? ''
          : '. Check the layer and its where clause in src/config/election.js.';
        throw new CheckError(`${where}: ${error.message}${hint}`);
      }
      if (!Array.isArray(body?.features)) {
        throw new CheckError(`${where}: the response has no features list`);
      }
      const rows = body.features.map((f) => f?.attributes);
      if (rows.some((row) => row === null || typeof row !== 'object')) {
        throw new CheckError(`${where}: a feature has no attributes`);
      }
      return rows;
    };
    const maxAge = waitTimes.maxAgeMinutes;
    const quiet = `Sites are open and none has reported in the last ${maxAge} minutes.`;
    const newestReport = (rows, field) => {
      const times = rows
        .map((r) => r[field])
        // A finite number can still be outside the Date range.
        .filter((t) => typeof t === 'number' && !Number.isNaN(new Date(t).getTime()));
      return times.length ? reportTime(Math.max(...times), config.timeZone) : 'none';
    };

    // Read the clock here, not at the start: the checks above can take minutes
    // of retries, and a report made since then would look like a clock error.
    const now = fixedNow ?? Date.now();
    for (const [key] of sources) {
      const source = waitTimes[key];
      const name = `wait reports ${key}`;
      if (!waitLayerOk[key]) {
        record(name, 'skip', `the wait layer ${key} check failed`);
        continue;
      }
      if (key === 'county') {
        if (!absenteeSites) {
          record(name, 'skip', 'the absentee sites check failed');
          continue;
        }
        await check(name, async () => {
          const reports = await waitRows(key, [
            source.siteField,
            source.timeField,
            source.valueField,
          ]);
          const keys = new Set(absenteeSites.map((s) => s[source.pollsField]).filter(Boolean));
          const open = absenteeSites.filter(
            (s) =>
              keys.has(s[source.pollsField]) &&
              earlyVotingStatus(config.earlyVoting?.schedules?.[s.abs_type], now, config.timeZone)
                .kind === 'openNow',
          ).length;
          const shown = selectCountyWaits(
            reports,
            absenteeSites.map((properties) => ({ properties })),
            now,
          ).length;
          const unmatched = reports.filter((r) => !keys.has(r[source.siteField]));
          const newest = newestReport(reports, source.timeField);
          const warnings = [];
          // Only the count: report senders are ArcGIS user names, which may be a
          // person's, and this line goes on the public run summary and issue.
          if (unmatched.length) {
            warnings.push(
              `${unmatched.length} reports match no site's ${source.pollsField} on the polls layer.`,
            );
          }
          let detail;
          if (open === 0) {
            detail = `${source.source}: closed. No site is open now; ${reports.length} reports in the view`;
            if (reports.length) detail += `; newest report ${newest}`;
          } else {
            if (shown === 0) warnings.push(quiet);
            detail =
              `${source.source}: ${shown ? 'fresh' : 'not fresh'}. ${shown} of ${open} open ` +
              `sites have a current count; ${unmatched.length} reports match no site; ` +
              `newest report ${newest}`;
          }
          return warnings.length ? { warn: `${detail}. ${warnings.join(' ')}` } : detail;
        });
      } else {
        await check(name, async () => {
          const rows = await waitRows(key, [
            source.siteField,
            source.valueField,
            source.timeField,
            source.commentsField,
            source.hoursField,
          ]);
          const { date, minutes } = zonedNow(now, config.timeZone);
          const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
          const closedText = String(source.closedText ?? '').toLowerCase();
          // As in the app, a "poll closed" comment closes a site only on a
          // report from today; one left from an earlier day does not.
          const open = rows.filter((row) => {
            const time = row[source.timeField];
            const reportedToday =
              typeof time === 'number' &&
              !Number.isNaN(new Date(time).getTime()) &&
              zonedNow(time, config.timeZone).date === date;
            if (
              reportedToday &&
              closedText &&
              String(row[source.commentsField] ?? '')
                .toLowerCase()
                .includes(closedText)
            )
              return false;
            const hours = parseCityHours(row[source.hoursField])?.[weekday];
            return (
              Boolean(hours) && minutes >= toMinutes(hours.open) && minutes < toMinutes(hours.close)
            );
          }).length;
          const withValue = rows.filter((r) => Number.isInteger(r[source.valueField])).length;
          const shown = selectCityWaits(rows, now).length;
          const newest = newestReport(rows, source.timeField);
          const counts = `${withValue} of ${rows.length} rows have a ${source.valueField}`;
          // The app treats a site whose hours it cannot read as closed, so a
          // change in the board's hours format would hide every count while
          // this check said "closed".
          const unreadable = rows.filter(
            (r) => parseCityHours(r[source.hoursField]) === null,
          ).length;
          const warnings = [];
          // The City layer lists its sites all season, open or not: no row at
          // all means the filter no longer matches, and every count is gone.
          if (rows.length === 0) {
            warnings.push(
              `No row matches waitTimes.${key}.where (${source.where}): check the filter ` +
                "against the City board's dashboard.",
            );
          }
          if (unreadable) {
            warnings.push(
              `${unreadable} ${unreadable === 1 ? 'row has' : 'rows have'} ${source.hoursField} ` +
                'text the app cannot read, so it never shows a count.',
            );
          }
          let detail;
          if (open === 0) {
            detail = `${source.source}: closed. No site is open now by its hours; ${counts}; newest report ${newest}`;
          } else {
            if (shown === 0) warnings.push(quiet);
            detail =
              `${source.source}: ${shown ? 'fresh' : 'not fresh'}. ${counts}; ${open} open now, ` +
              `${shown} with a current count; newest report ${newest}`;
          }
          return warnings.length ? { warn: `${detail}. ${warnings.join(' ')}` } : detail;
        });
      }
    }
  }

  // 9. The City's layers (#87): each answers with the fields the app reads,
  // the precincts read as City codes, the site filters find the City Board's
  // lists, and City Hall lands in a City precinct, a ward and the outline.
  if (config.jurisdictions?.city) await checkCity(config.jurisdictions.city);

  return results;

  async function checkCity(city) {
    const cityLayerUrl = (key) => `${city.serviceRoot}/${city.layers[key]}`;
    const cityQuery = async (key, params) => {
      const body = await request(
        `${cityLayerUrl(key)}/query?${new URLSearchParams({ f: 'json', ...params })}`,
      );
      if (!Array.isArray(body?.features)) {
        throw new CheckError('the response has no features list');
      }
      return (body.features ?? []).map((f) => f?.attributes ?? {});
    };
    const cityPoint = (key, { lat, lng }, outFields, extra = {}) =>
      cityQuery(key, {
        ...extra,
        geometry: `${lng},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields,
        returnGeometry: 'false',
      });

    const ok = {};
    for (const [key, want] of Object.entries(expectedCityLayers(config))) {
      const where = `jurisdictions.city.layers.${key} (${city.layers[key]})`;
      ok[key] = await check(`city layer ${key}`, async () => {
        let info;
        try {
          info = await request(`${cityLayerUrl(key)}?f=json`);
        } catch (error) {
          if (!(error instanceof CheckError)) throw error;
          const hint = error.transient ? '' : '. Check this path in src/config/election.js.';
          throw new CheckError(`${where}: ${error.message}${hint}`);
        }
        if (info.geometryType !== want.geometryType) {
          throw new CheckError(
            `${where}: geometry is ${info.geometryType ?? 'missing'}, want ${want.geometryType}. ` +
              'Is this the right layer?',
          );
        }
        const have = new Set((Array.isArray(info.fields) ? info.fields : []).map((f) => f?.name));
        const missing = want.fields.filter((f) => !have.has(f));
        if (missing.length) throw new CheckError(`${where}: missing fields ${missing.join(', ')}`);
        return `${where}: ${info.name ?? 'unnamed'}, expected fields present (${want.fields.length})`;
      });
    }

    if (ok.precincts) {
      await check('city precincts', async () => {
        const rows = await cityQuery('precincts', {
          where: '1=1',
          outFields: city.precinctField,
          returnGeometry: 'false',
        });
        const { min, max } = CITY_PRECINCT_RANGE;
        if (rows.length < min || rows.length > max) {
          throw new CheckError(`${rows.length} precincts, want ${min} to ${max}`);
        }
        const bad = [];
        const seen = new Set();
        const wards = new Set();
        for (const row of rows) {
          const id = row[city.precinctField];
          const code = cityPrecinctCode(id);
          if (!code) bad.push(`${JSON.stringify(id)} is not a City precinct ID`);
          else if (seen.has(code)) bad.push(`${code} appears twice`);
          else {
            seen.add(code);
            wards.add(Number(code.slice(1, 3)));
          }
        }
        if (bad.length) throw new CheckError(bad.join('; '));
        return `${rows.length} precincts, wards ${Math.min(...wards)} to ${Math.max(...wards)}`;
      });
    } else {
      record('city precincts', 'skip', 'the city layer precincts check failed');
    }

    const sitesCheck = async (name, whereKey, describe) => {
      if (!ok.sites) {
        record(name, 'skip', 'the city layer sites check failed');
        return;
      }
      await check(name, async () => {
        const rows = await cityQuery('sites', {
          where: city[whereKey],
          outFields: Object.values(city.siteFields).join(','),
          returnGeometry: 'false',
        });
        if (rows.length === 0) {
          throw new CheckError(`${whereKey} (${city[whereKey]}) returns no sites`);
        }
        const { id, name: nameField, address } = city.siteFields;
        const text = (v) => (typeof v === 'string' ? v.trim() : '');
        const bad = [];
        const ids = new Set();
        for (const row of rows) {
          const siteId = text(row[id]);
          const label = siteId || JSON.stringify(row[nameField] ?? null);
          if (!siteId) bad.push(`${label}: no id`);
          else if (ids.has(siteId)) bad.push(`${label}: id repeated`);
          ids.add(siteId);
          if (!text(row[nameField])) bad.push(`${label}: no name`);
          if (!text(row[address])) bad.push(`${label}: no address`);
        }
        if (bad.length) throw new CheckError(bad.join('; '));
        return describe(rows);
      });
    };
    await sitesCheck('city voting locations', 'pollsWhere', (rows) => {
      const noZip = rows.filter((r) => !String(r[city.siteFields.zip] ?? '').trim()).length;
      const listed = city.pollsListed;
      if (Number.isInteger(listed) && rows.length !== listed) {
        return {
          warn:
            `${rows.length} Election Day sites, but the City Board lists ${listed} (pollsListed). ` +
            "Compare the filter with the City Board's polling places page.",
        };
      }
      return `${rows.length} Election Day sites, as the City Board lists; ${noZip} without a ZIP`;
    });
    await sitesCheck('city early voting sites', 'earlyVotingWhere', (rows) => {
      // Every site needs its hours in src/config/cityResults.js, or the card
      // and the wait times page show it with no status (#91).
      const scheduled = cityEarlyVoting?.sites ?? {};
      const noHours = rows
        .map((r) => String(r[city.siteFields.id] ?? '').trim())
        .filter((id) => !cityEarlyVoting?.schedules?.[scheduled[id]]?.length);
      if (noHours.length) {
        throw new CheckError(
          `${noHours.join(', ')} ${noHours.length === 1 ? 'has' : 'have'} no hours in ` +
            'earlyVoting.sites in src/config/cityResults.js',
        );
      }
      return `${rows.length} sites, each with its hours`;
    });

    if (ok.precincts && ok.districts && ok.boundary) {
      await check('city known points', async () => {
        const bad = [];
        const label = CITY_KNOWN_POINT.name;
        const [precinct] = await cityPoint('precincts', CITY_KNOWN_POINT, city.precinctField);
        if (!precinct) bad.push(`${label}: no City precinct`);
        else if (!cityPrecinctCode(precinct[city.precinctField])) {
          bad.push(`${label}: bad precinct ID ${JSON.stringify(precinct[city.precinctField])}`);
        }
        const districts = await cityPoint(
          'districts',
          CITY_KNOWN_POINT,
          Object.values(city.districtLayerFields).join(','),
        );
        const ward = districts.some((d) => /^Ward \d+$/.test(d[city.districtLayerFields.id] ?? ''));
        if (!ward) bad.push(`${label}: no ward`);
        const outline = { where: city.boundaryWhere };
        if (!(await cityPoint('boundary', CITY_KNOWN_POINT, 'OBJECTID', outline)).length) {
          bad.push(`${label}: outside the City outline`);
        }
        // A County point is in neither.
        const county = KNOWN_POINTS[0];
        const [countyPrecinct] = await cityPoint('precincts', county, city.precinctField);
        if (countyPrecinct) {
          bad.push(`${county.name}: in City precinct ${countyPrecinct[city.precinctField]}`);
        }
        if ((await cityPoint('boundary', county, 'OBJECTID', outline)).length) {
          bad.push(`${county.name}: inside the City outline`);
        }
        if (bad.length) throw new CheckError(bad.join('; '));
        return `${label} is in a City precinct, a ward and the outline; ${county.name} is in none`;
      });
    } else {
      const failed = ['precincts', 'districts', 'boundary'].find((k) => !ok[k]);
      record('city known points', 'skip', `the city layer ${failed} check failed`);
    }
  }
}

/** The wait time sources the check knows, and the extra fields each must have. */
const WAIT_SOURCES = {
  county: { extraFields: [] },
  city: { extraFields: ['hoursField', 'commentsField'] },
};

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** A report time as `YYYY-MM-DD HH:MM <zone>`, in the election's time zone. */
function reportTime(ms, timeZone) {
  const { date, minutes } = zonedNow(ms, timeZone);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${date} ${hh}:${mm} ${timeZone}`;
}

/**
 * The exit code for a run: 1 when any check failed or was skipped, 0
 * otherwise. A warning never fails the run.
 * @param {{ status: string }[]} results
 */
export function exitCodeFor(results) {
  return results.some((r) => r.status === 'fail' || r.status === 'skip') ? 1 : 0;
}

/**
 * The warnings, one line each, as `name: detail`.
 * @param {{ name: string, status: string, detail: string }[]} results
 */
export function warningLines(results) {
  return results.filter((r) => r.status === 'warn').map((r) => `${r.name}: ${r.detail}`);
}

/**
 * The file name in a Content-Disposition header, like the portal's
 * `attachment; filename="CC-007.pdf"; size=55289`. An RFC 6266 `filename*`
 * wins over `filename`. Null when the header names no file.
 * @param {string | null | undefined} header
 * @returns {string | null}
 */
export function contentDispositionFileName(header) {
  if (typeof header !== 'string') return null;
  const extended = /(?:^|;)\s*filename\*\s*=\s*([^;]*)/i.exec(header);
  if (extended) {
    // charset'language'percent-encoded-value
    const value = extended[1].trim().replace(/^[^']*'[^']*'/, '');
    try {
      const decoded = decodeURIComponent(value);
      if (decoded) return decoded;
    } catch {
      // A malformed filename* names nothing; fall through to filename.
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/i.exec(header);
  if (!plain) return null;
  let value = plain[1].trim();
  if (value.startsWith('"')) {
    // An unclosed quote is malformed: it names nothing.
    if (value.length < 2 || !value.endsWith('"')) return null;
    value = value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value || null;
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
 * Reads the command line.
 * @param {string[]} args
 * @param {object} config The election config, to check layer keys against.
 * @returns {{ layers: Record<string, string>, ballotSample?: number, warnings?: string }}
 */
export function parseArgs(args, config) {
  const layers = {};
  let ballotSample;
  let warnings;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--warnings') {
      warnings = args[i + 1];
      if (!warnings || warnings.startsWith('--')) throw new Error('--warnings needs a file path');
      i += 1;
      continue;
    }
    if (args[i] === '--ballot-sample') {
      const value = args[i + 1] ?? '';
      if (value === 'all') ballotSample = Infinity;
      else if (/^[1-9]\d*$/.test(value)) ballotSample = Number(value);
      else throw new Error('--ballot-sample needs a whole number above 0, or all');
      i += 1;
      continue;
    }
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
  return { layers, ballotSample, warnings };
}

async function main(args) {
  let layers;
  let ballotSample;
  let warnings;
  try {
    ({ layers, ballotSample, warnings } = parseArgs(args, election));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const config = { ...election, layers: { ...election.layers, ...layers } };
  console.log(`Checking ${config.electionName} layers under ${config.serviceRoot}`);
  const results = await runHealthCheck(config, { ballotSample });
  return report(results, { warnings });
}

/**
 * Prints the results, writes the warnings file when asked (before deciding
 * the exit code, so a failing run's issue still gets its warnings; empty when
 * nothing warned) and returns the exit code.
 * @param {{ name: string, status: string, detail: string }[]} results
 * @param {{ warnings?: string, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {number}
 */
export function report(results, { warnings, log = console.log, error = console.error } = {}) {
  for (const { name, status, detail } of results) {
    log(`${status.toUpperCase().padEnd(4)} ${name}: ${detail}`);
  }
  const warned = warningLines(results);
  if (warnings) writeFileSync(warnings, warned.map((line) => `${line}\n`).join(''));
  const failed = results.filter((r) => r.status === 'fail' || r.status === 'skip');
  if (exitCodeFor(results)) {
    error(`\n${failed.length} of ${results.length} checks did not pass.`);
    return 1;
  }
  const note = warned.length ? `, ${warned.length} with a warning` : '';
  log(`\nAll ${results.length} checks passed${note}.`);
  return 0;
}

// import.meta.url has symlinks resolved and argv[1] does not, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
