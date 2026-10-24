// Fetches schemas and sample features for the ArcGIS layers used by the app,
// plus the county Instant App config, and writes them to docs/raw/. The City
// Board's layers (#95) come from src/config/election.js and are sampled only
// for the fields the app reads, never `*`: the districts layer also holds
// officeholder names and contacts, the voting locations layer staff contacts.
//
// It first lists every service in the County and City service directories
// (#101) and prints the ones docs/data.md does not mention (Service inventory).
// It reads only the directory listings: never a listed service's data or
// metadata, as some are the Board's forms and hold voters' personal data.
// Usage: node scripts/inspect-data.mjs [--inventory]
//   --inventory  list the services the doc does not mention, then stop
//                (nothing is written to docs/raw/).

import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import election from '../src/config/election.js';

const ROOT = 'https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services';
const PORTAL = 'https://stlouiscovotes.maps.arcgis.com/sharing/rest/content/items';
const INSTANT_APP_ID = '4c3116b104af40bea77ebea20aaae275';
const OUT_DIR = path.resolve('docs/raw');

const SERVICES = [
  'precincts_2026_11_view',
  'polls_2026_11_view',
  '2026_11_abs_ballot_app_precincts_view',
  'sat_name_export_2026_11',
  'November_3_2026_Polling_Places_Dashboard_view',
  'November_3_2026_Precincts_Dashboard_view',
  'lookup_view_sample_ballot',
  'lookup_view_polls',
  'lookup_view_precincts',
  'lookup_view_abs',
  'St_Louis_County_Boundary',
];

const DATA_DOC = path.resolve('docs/data.md');

/**
 * The service directories the inventory lists (docs/data.md, Service inventory).
 * `key` names each one's ```services blocks there.
 */
export const INVENTORY_ROOTS = [
  { key: 'county', label: 'St. Louis County Board of Elections org', url: election.serviceRoot },
  { key: 'city', label: 'St. Louis City org', url: election.jurisdictions.city.serviceRoot },
  {
    key: 'boe',
    label: 'City Board folder on the City GIS server',
    url: 'https://maps6.stlouis-mo.gov/arcgis/rest/services/BOE',
  },
];

// A services block line needs this many characters besides `*`, so a stray
// `*` cannot mark every service as documented.
const MIN_PATTERN_LITERALS = 4;

const INVENTORY_HEADING = '## Service inventory';

/** The Service inventory section of docs/data.md: its heading up to the next `## ` heading. */
function inventorySection(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === INVENTORY_HEADING);
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

function globToRegExp(pattern) {
  const body = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${body.join('.*')}$`);
}

/**
 * What the Service inventory section of docs/data.md documents, per root: each
 * line of its ```services <key> blocks, one service name per line, where `*`
 * matches any characters. Only those blocks count, never a code span: the
 * tables' code spans also hold field names, which would hide a new service of
 * the same name, and a block belongs to one root, so a name in one org cannot
 * hide the same name in another.
 */
export function documentedServices(markdown) {
  const documented = Object.fromEntries(
    INVENTORY_ROOTS.map(({ key }) => [key, { names: new Set(), patterns: [] }]),
  );
  const section = inventorySection(markdown);
  for (const [, key, block] of section.matchAll(/^```services (\w+)[ \t]*\n([\s\S]*?)^```/gm)) {
    const entry = documented[key];
    if (!entry) continue;
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (!line.includes('*')) entry.names.add(line);
      else if (line.replace(/\*/g, '').length >= MIN_PATTERN_LITERALS) {
        entry.patterns.push(globToRegExp(line));
      }
    }
  }
  return documented;
}

/** The names one root's `documentedServices` entry does not cover, each once, in order. */
export function undocumentedServices(serviceNames, documented) {
  const seen = new Set();
  return serviceNames.filter((name) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return !documented.names.has(name) && !documented.patterns.some((re) => re.test(name));
  });
}

/**
 * The service names in a services directory listing. ArcGIS answers a wrong or
 * locked root with HTTP 200 and an error body, so that fails rather than read
 * as a root with no services.
 */
export function serviceNames(listing) {
  if (listing?.error) {
    throw new Error(`${listing.error.code ?? 'error'} ${listing.error.message ?? ''}`.trim());
  }
  if (!Array.isArray(listing?.services)) throw new Error('no services list in the response');
  return listing.services.map((s) => s.name);
}

async function inventory() {
  const documented = documentedServices(await readFile(DATA_DOC, 'utf8'));
  for (const { key, label, url } of INVENTORY_ROOTS) {
    try {
      const names = [...new Set(serviceNames(await getJson(`${url}?f=json`)))];
      const missing = undocumentedServices(names, documented[key]);
      console.log(
        `${missing.length ? 'new ' : 'ok  '} ${label}: ${names.length} services, ${missing.length} not in docs/data.md`,
      );
      for (const name of missing) console.log(`       ${name}`);
    } catch (err) {
      console.log(`fail ${label}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/**
 * The City layers to inspect, one per layer path, each with the fields the
 * app reads from it. The outline (`layers.boundary`) is a filter on the
 * districts layer, so it is not inspected twice. The voting locations layer is
 * also the City wait layer: its site, line count, report time and hours fields
 * are sampled, its free-text comments (which the app reads) are not: they can
 * name people.
 */
export function cityLayerRequests(config) {
  const city = config.jurisdictions.city;
  const wait = config.waitTimes.city;
  // The wait fields only while the wait layer is the voting locations layer;
  // check-config.mjs checks the wait layer's fields wherever it is.
  const waitIsSites =
    `${wait.serviceRoot}/${wait.layer}` === `${city.serviceRoot}/${city.layers.sites}`;
  const fields = {
    precincts: [city.precinctField],
    districts: Object.values(city.districtLayerFields),
    sites: [
      ...Object.values(city.siteFields),
      ...(waitIsSites ? [wait.siteField, wait.valueField, wait.timeField, wait.hoursField] : []),
    ],
  };
  return Object.entries(fields).map(([key, names]) => ({
    key,
    url: `${city.serviceRoot}/${city.layers[key]}`,
    outFields: [...new Set(names)].join(','),
  }));
}

async function inspectLayer(service, layerId) {
  return inspectLayerAt(`${ROOT}/${service}/FeatureServer/${layerId}`, '*');
}

async function inspectLayerAt(base, outFields) {
  const schema = await getJson(`${base}?f=json`);
  const count = await getJson(`${base}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const sample = await getJson(
    `${base}/query?${new URLSearchParams({
      where: '1=1',
      outFields,
      returnGeometry: 'false',
      resultRecordCount: '3',
      f: 'json',
    })}`,
  );
  return {
    url: base,
    name: schema.name,
    geometryType: schema.geometryType,
    maxRecordCount: schema.maxRecordCount,
    supportedQueryFormats: schema.supportedQueryFormats,
    count: count.count,
    fields: (schema.fields || []).map((f) => ({
      name: f.name,
      type: f.type,
      alias: f.alias,
      domain: f.domain?.codedValues?.map((c) => c.code) ?? null,
    })),
    samples: (sample.features || []).map((f) => f.attributes),
  };
}

async function inspectService(service) {
  const info = await getJson(`${ROOT}/${service}/FeatureServer?f=json`);
  const layers = [...(info.layers || []), ...(info.tables || [])];
  const result = { service, layers: [] };
  for (const layer of layers) {
    try {
      result.layers.push({ id: layer.id, ...(await inspectLayer(service, layer.id)) });
    } catch (err) {
      result.layers.push({ id: layer.id, error: String(err) });
    }
  }
  return result;
}

async function main() {
  await inventory();
  if (process.argv.includes('--inventory')) return;

  await mkdir(OUT_DIR, { recursive: true });

  for (const service of SERVICES) {
    try {
      const result = await inspectService(service);
      await writeFile(path.join(OUT_DIR, `${service}.json`), JSON.stringify(result, null, 2));
      console.log(`ok   ${service} (${result.layers.length} layers)`);
    } catch (err) {
      console.log(`fail ${service}: ${err.message}`);
    }
  }

  for (const { key, url, outFields } of cityLayerRequests(election)) {
    const name = `city_${key}`;
    try {
      const result = await inspectLayerAt(url, outFields);
      await writeFile(path.join(OUT_DIR, `${name}.json`), JSON.stringify(result, null, 2));
      console.log(`ok   ${name}`);
    } catch (err) {
      console.log(`fail ${name}: ${err.message}`);
    }
  }

  const appConfig = await getJson(`${PORTAL}/${INSTANT_APP_ID}/data?f=json`);
  await writeFile(
    path.join(OUT_DIR, 'instant_app_config.json'),
    JSON.stringify(appConfig, null, 2),
  );
  const appItem = await getJson(`${PORTAL}/${INSTANT_APP_ID}?f=json`);
  await writeFile(path.join(OUT_DIR, 'instant_app_item.json'), JSON.stringify(appItem, null, 2));
  console.log('ok   instant app config');
}

// import.meta.url has symlinks resolved and argv[1] does not, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
