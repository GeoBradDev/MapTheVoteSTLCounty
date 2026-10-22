// Records live ArcGIS responses into docs/raw/fixtures/ for the data client
// tests in src/data/arcgis.test.js. Layer paths come from the election config,
// so this works again next election. Pick new sample precincts and points if
// these no longer exist.
// The early voting wait fixtures (county-waits-*.json, city-waits-*.json) are
// not recorded here: a useful fresh fixture needs reports made during open
// hours, so they are recorded by hand then (docs/data.md, Wait times).
// The City layers (#87) are asked only for the fields the app reads, never `*`:
// the districts and voting locations layers also hold officeholder and staff
// contact fields.
// Usage: node scripts/record-fixtures.mjs [<file name prefix>]
//   With a prefix, only the fixtures whose file names start with it, like
//   `city-` for the City layers' fixtures.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import election from '../src/config/election.js';
import { CITY_GEOCODER_URL } from '../src/data/cityAddress.js';

const OUT_DIR = path.resolve('docs/raw/fixtures');

const precincts = `${election.serviceRoot}/${election.layers.precincts}/query`;
const polls = `${election.serviceRoot}/${election.layers.polls}/query`;
const boundary = `${election.serviceRoot}/${election.layers.countyBoundary}/query`;

const pointQuery = (lng, lat) => ({
  geometry: `${lng},${lat}`,
  geometryType: 'esriGeometryPoint',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  outFields: '*',
  returnGeometry: 'false',
  f: 'json',
});

const boundaryQuery = (lng, lat) => ({
  geometry: `${lng},${lat}`,
  geometryType: 'esriGeometryPoint',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  outFields: 'OBJECTID',
  returnGeometry: 'false',
  f: 'json',
});

// Out-of-county test addresses, at the points both the Census and the Esri
// geocoder returned for them on 2026-10-21 (rounded to 5 decimals).
const CITY = [-90.19843, 38.62741]; // 1200 Market St, St. Louis, MO 63103
const ST_CHARLES = [-90.48187, 38.78267]; // 200 N 2nd St, St. Charles, MO 63301
const OUT_OF_STATE = [-89.98831, 38.51368]; // 301 W Main St, Belleville, IL 62220

// The City check (#58) asks the City's geocoder for a house number and street.
const cityFind = `${CITY_GEOCODER_URL}/findAddressCandidates`;
const cityQuery = (street) => ({
  SingleLine: street,
  outFields: 'Addr_type,AddNum,StPreDir,StPreType,StName,StType,StDir,ZIP',
  maxLocations: '20',
  outSR: '4326',
  f: 'json',
});

// The City Board's layers (#87).
const cityConfig = election.jurisdictions.city;
const cityLayer = (key) => `${cityConfig.serviceRoot}/${cityConfig.layers[key]}/query`;
const cityPointQuery = (key, [lng, lat], outFields, where) => ({
  ...(where ? { where } : {}),
  ...pointQuery(lng, lat),
  outFields,
});
const cityDistrictFields = Object.values(cityConfig.districtLayerFields).join(',');
const citySites = (where) => ({
  where,
  outFields: Object.values(cityConfig.siteFields).join(','),
  outSR: '4326',
  geometryPrecision: '6',
  f: 'geojson',
});
const COUNTY_POINT = [-90.33, 38.62];

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
  // Two more voting precincts, for the sample ballot card's links.
  'precinct-by-id-mer013.json': [precincts, byId('MER013')],
  'precinct-by-id-flo030.json': [precincts, byId('FLO030')],
  // Special districts (neighborhood improvement, annexation), for the districts card.
  'precinct-by-id-nw005.json': [precincts, byId('NW005')],
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
  'precinct-at-city.json': [precincts, pointQuery(...CITY)],
  'precinct-at-st-charles.json': [precincts, pointQuery(...ST_CHARLES)],
  'precinct-at-out-of-state.json': [precincts, pointQuery(...OUT_OF_STATE)],
  // The same inside point as precinct-at-point.json.
  'boundary-inside.json': [boundary, boundaryQuery(-90.33, 38.62)],
  'boundary-at-city.json': [boundary, boundaryQuery(...CITY)],
  'boundary-at-st-charles.json': [boundary, boundaryQuery(...ST_CHARLES)],
  'boundary-at-out-of-state.json': [boundary, boundaryQuery(...OUT_OF_STATE)],
  'polls.json': [polls, { where: '1=1', outFields: '*', outSR: '4326', f: 'geojson' }],
  // The in-person absentee sites, with the filter from the config.
  'absentee-sites.json': [
    polls,
    { where: election.absenteeWhere, outFields: '*', outSR: '4326', f: 'geojson' },
  ],
  // The City's geocoder for the #58 addresses, City Hall and 1318 Ross Ave
  // (src/data/cityAddress.test.js).
  'city-geocode-washington-ave.json': [cityFind, cityQuery('6135 Washington Ave')],
  'city-geocode-horton-pl.json': [cityFind, cityQuery('6135 Horton Pl')],
  'city-geocode-market-st.json': [cityFind, cityQuery('1200 Market St')],
  'city-geocode-ross-ave.json': [cityFind, cityQuery('1318 Ross Ave')],
  // Washington University: the county and the City both list it in 63130.
  'city-geocode-brookings-dr.json': [cityFind, cityQuery('1 Brookings Dr')],
  // The City's layers, at City Hall and at a county point (#87).
  'city-precinct-at-point.json': [
    cityLayer('precincts'),
    cityPointQuery('precincts', CITY, cityConfig.precinctField),
  ],
  'city-precinct-at-county.json': [
    cityLayer('precincts'),
    cityPointQuery('precincts', COUNTY_POINT, cityConfig.precinctField),
  ],
  'city-precinct-by-id.json': [
    cityLayer('precincts'),
    {
      where: `${cityConfig.precinctField}='W 1 P 12'`,
      outFields: cityConfig.precinctField,
      returnGeometry: 'false',
      f: 'json',
    },
  ],
  'city-precinct-geometry.json': [
    cityLayer('precincts'),
    {
      where: `${cityConfig.precinctField}='W 1 P 12'`,
      outFields: cityConfig.precinctField,
      returnGeometry: 'true',
      outSR: '4326',
      maxAllowableOffset: '0.0001',
      f: 'geojson',
    },
  ],
  'city-districts-at-point.json': [
    cityLayer('districts'),
    cityPointQuery('districts', CITY, cityDistrictFields),
  ],
  'city-polls.json': [cityLayer('sites'), citySites(cityConfig.pollsWhere)],
  'city-early-voting-sites.json': [cityLayer('sites'), citySites(cityConfig.earlyVotingWhere)],
  'city-boundary-inside.json': [
    cityLayer('boundary'),
    cityPointQuery('boundary', CITY, 'OBJECTID', cityConfig.boundaryWhere),
  ],
  'city-boundary-at-county.json': [
    cityLayer('boundary'),
    cityPointQuery('boundary', COUNTY_POINT, 'OBJECTID', cityConfig.boundaryWhere),
  ],
  // An invalid field: ArcGIS answers HTTP 200 with an error body.
  'error-body.json': [precincts, { where: 'no_such_field=1', f: 'json' }],
};

const prefix = process.argv[2] ?? '';
await mkdir(OUT_DIR, { recursive: true });
for (const [file, [url, params]] of Object.entries(FIXTURES)) {
  if (!file.startsWith(prefix)) continue;
  const res = await fetch(`${url}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`${res.status} ${file}`);
  const body = await res.json();
  await writeFile(path.join(OUT_DIR, file), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`ok   ${file} (${(body.features ?? body.candidates)?.length ?? 'no'} features)`);
}
