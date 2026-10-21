// Records live ArcGIS responses into docs/raw/fixtures/ for the data client
// tests in src/data/arcgis.test.js. Layer paths come from the election config,
// so this works again next election. Pick new sample precincts and points if
// these no longer exist.
// Usage: node scripts/record-fixtures.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import election from '../src/config/election.js';

const OUT_DIR = path.resolve('docs/raw/fixtures');

const precincts = `${election.serviceRoot}/${election.layers.precincts}/query`;
const polls = `${election.serviceRoot}/${election.layers.polls}/query`;

const pointQuery = (lng, lat) => ({
  geometry: `${lng},${lat}`,
  geometryType: 'esriGeometryPoint',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  outFields: '*',
  returnGeometry: 'false',
  f: 'json',
});

const byId = (code) => ({
  where: `precinct='${code}'`,
  outFields: '*',
  returnGeometry: 'false',
  f: 'json',
});

const FIXTURES = {
  // A voting precinct.
  'precinct-at-point.json': [precincts, pointQuery(-90.33, 38.62)],
  // St. Louis City, outside the county: no features.
  'precinct-at-point-outside.json': [precincts, pointQuery(-90.2, 38.63)],
  'precinct-by-id.json': [precincts, byId('CC007')],
  'precinct-nonresidential.json': [precincts, byId('AP200')],
  'precinct-geometry.json': [
    precincts,
    {
      where: "precinct='CC007'",
      outFields: 'precinct',
      returnGeometry: 'true',
      outSR: '4326',
      maxAllowableOffset: '0.0001',
      f: 'geojson',
    },
  ],
  'polls.json': [polls, { where: '1=1', outFields: '*', outSR: '4326', f: 'geojson' }],
  // An invalid field: ArcGIS answers HTTP 200 with an error body.
  'error-body.json': [precincts, { where: 'no_such_field=1', f: 'json' }],
};

await mkdir(OUT_DIR, { recursive: true });
for (const [file, [url, params]] of Object.entries(FIXTURES)) {
  const res = await fetch(`${url}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`${res.status} ${file}`);
  const body = await res.json();
  await writeFile(path.join(OUT_DIR, file), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`ok   ${file} (${body.features?.length ?? 'no'} features)`);
}
