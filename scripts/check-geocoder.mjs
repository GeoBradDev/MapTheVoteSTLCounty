// Checks address search (#7, #49) against the live services and the live
// precinct layer. Each test address is a polling place from
// docs/raw/fixtures/polls.json, geocoded as typed text ("<street>, MO <zip>"),
// and the precinct at the result is compared with the precinct at the county's
// own point for that site. 1318 Ross Ave (issue #49) is checked against CC007.
// Columns: each source alone (the county's live layer, its hosted copy,
// Photon), then the app's own chain (src/data/geocoder.js), then the chain
// with the live county layer blocked. A St. Louis City address must still get
// the City referral (#8). "no match" is safe (the voter is sent to "Use my
// location" and the county's official lookup); a wrong precinct is not.
// Usage: node scripts/check-geocoder.mjs [photon base URL]   (default: public Photon)
// Exits 1 when any address lands in the wrong precinct with the app's chain
// or the blocked chain, or the City address does not get the City referral.

import { readFile } from 'node:fs/promises';
import { getPrecinctAtPoint } from '../src/data/arcgis.js';
import { createCountyAddressSource, HOSTED_URL, LIVE_URL } from '../src/data/countyAddress.js';
import { createGeocoder } from '../src/data/geocoder.js';
import { GeocoderUnavailableError } from '../src/data/geocoderError.js';
import { createPhotonGeocoder } from '../src/data/photon.js';
import { locate } from '../src/features/lookup/locate.js';

// North, south, west, central and unincorporated sites (docs/data.md, Geocoding).
const LOCS = ['144', '020', '002', '054', '041', '148', '158', '122', '096', '178'];
const ROSS = { text: '1318 Ross Ave, Saint Louis, MO 63146', want: 'CC007' };
// St. Louis City Hall.
const CITY = '1200 Market St, St. Louis, MO 63103';

const polls = JSON.parse(
  await readFile(new URL('../docs/raw/fixtures/polls.json', import.meta.url), 'utf8'),
).features;

const live = createCountyAddressSource({ url: LIVE_URL });
const hosted = createCountyAddressSource({ url: HOSTED_URL, timeoutMs: 8000 });
const photon = createPhotonGeocoder({ baseUrl: process.argv[2] });
// The live layer as a browser sees it when its firewall or network blocks it.
const blockedLive = createCountyAddressSource({
  url: LIVE_URL,
  fetch: () => Promise.reject(new TypeError('blocked')),
});
const app = createGeocoder({ sources: [live, hosted], fallback: photon });
const appBlocked = createGeocoder({ sources: [blockedLive, hosted], fallback: photon });

// Public Photon fails now and then; try again a few times before giving up.
async function withRetry(call) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

const precinctAt = async (point) => (await getPrecinctAtPoint(point))?.precinct ?? 'outside';

// One source's precinct for the text: a precinct, "none" or "down".
async function precinctFrom(geocode, text) {
  try {
    const place = await withRetry(() => geocode(text));
    return place ? await precinctAt(place) : 'none';
  } catch (error) {
    if (error instanceof GeocoderUnavailableError) return 'down';
    throw error;
  }
}

const countyGeocode = (source) => async (text) => {
  const result = await source.find(text);
  return result.status === 'match' ? result.place : null;
};

const columns = {
  live: countyGeocode(live),
  hosted: countyGeocode(hosted),
  photon: (text) => photon.geocode(text),
  app: (text) => app.geocode(text),
  'app, live blocked': (text) => appBlocked.geocode(text),
};

const cases = LOCS.map((loc) => {
  const site = polls.find((p) => p.properties.loc === loc);
  if (!site) throw new Error(`No polling place ${loc} in the fixture`);
  const [lng, lat] = site.geometry.coordinates;
  return { text: `${site.properties.address}, MO ${site.properties.zipcode}`, at: { lat, lng } };
});

const tally = Object.fromEntries(Object.keys(columns).map((c) => [c, { right: 0, none: 0 }]));
const wrong = [];
console.log(['address'.padEnd(40), 'want'.padEnd(7), ...Object.keys(columns)].join(' | '));
for (const item of [...cases, ROSS]) {
  const want = item.want ?? (await precinctAt(item.at));
  const row = [item.text.padEnd(40), want.padEnd(7)];
  for (const [name, geocode] of Object.entries(columns)) {
    const got = await precinctFrom(geocode, item.text);
    row.push(got);
    if (got === want) tally[name].right += 1;
    else if (got === 'none' || got === 'down') tally[name].none += 1;
    else if (name.startsWith('app')) wrong.push(`${name}: ${item.text}: ${got}, want ${want}`);
  }
  console.log(row.join(' | '));
  // Public Photon asks for fair use.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const total = cases.length + 1;
for (const [name, { right, none }] of Object.entries(tally)) {
  console.log(`${name}: ${right} right, ${none} no match or down, of ${total}`);
}

const cityPlace = await withRetry(() => app.geocode(CITY));
const cityKind = cityPlace ? (await locate(cityPlace)).kind : 'no match';
console.log(`${CITY}: ${cityKind} (${cityPlace?.label ?? ''})`);
if (cityKind !== 'stl-city') wrong.push(`${CITY}: ${cityKind}, want stl-city`);

if (wrong.length) {
  console.error(`Wrong:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
